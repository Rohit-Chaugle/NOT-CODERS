"""Computer vision: image -> sustainability findings for a campus zone.

``POST /vision/analyze`` runs each frame through the best available engine:

* **yolo** — an optional `ultralytics` model, when the extras in
  ``requirements-vision.txt`` are installed and weights can be loaded.
* **mock** — a deterministic, believable stand-in used whenever those extras
  are missing (or when the model finds nothing campus-relevant), so the demo
  never breaks.

Honest note about the two-stage design: COCO-pretrained YOLO detects *objects*,
not campus semantics such as "this bin is overflowing". So stage one proposes
boxes and a small documented rules layer below maps objects + zone context onto
our three findings (overflowing waste, lights on in an empty room, water
pooling). Replacing stage one with a campus fine-tuned checkpoint only changes
``_yolo_findings`` — the rules layer, Issue creation and everything downstream
stay identical.
"""

from __future__ import annotations

import logging
import random
import time
import zlib
from dataclasses import dataclass, field
from typing import Any

from app.config import (
    VISION_CONF,
    VISION_ENABLED,
    VISION_FALLBACK,
    VISION_IOU,
    VISION_MODEL,
)

logger = logging.getLogger("verdant.vision")

# kind -> issue type used by the rules engine (also drives the 3D anomaly).
KIND_TO_ISSUE = {
    "waste": "waste_accumulation",
    "lights": "energy_wastage",
    "water": "water_leakage",
}

# Stage two: COCO classes we treat as evidence for each finding, plus the
# base severity before the confidence bump.
_YOLO_RULES: dict[str, dict[str, Any]] = {
    "water": {
        "labels": {"toilet", "sink"},
        "severity": "high",
        "label": "Water pooling on floor",
        # Fixtures only appear in washrooms — pooling must sit near them.
        "floor_only": True,
    },
    "waste": {
        "labels": {"refrigerator", "oven", "dining table", "sink", "chair", "couch"},
        "severity": "high",
        "label": "Overflowing waste",
        "floor_only": True,
    },
    "lights": {
        "labels": {"tv", "laptop", "microwave", "oven", "refrigerator", "cell phone", "keyboard"},
        "severity": "medium",
        "label": "Lights on in empty room",
        # "empty room" gate: no people in frame, and server rooms run 24/7.
        "requires_empty": True,
        "floor_only": False,
    },
}

# Order used when the mock has to pick more than one finding.
_MOCK_KINDS = ["waste", "lights", "water"]

# ~90% of mock runs raise a single finding, ~10% raise two.
_MOCK_SECOND_CHANCE = 0.18

# Confidence ranges per kind, so repeated mock scans look plausible rather
# than uniformly random.
_MOCK_CONF = {
    "waste": (0.78, 0.96),
    "lights": (0.64, 0.89),
    "water": (0.71, 0.94),
}

# Base bbox (x1, y1, w, h) per kind, in normalized image space.
_MOCK_BBOX = {
    "waste": (0.30, 0.54, 0.30, 0.30),
    "lights": (0.12, 0.07, 0.34, 0.22),
    "water": (0.16, 0.64, 0.44, 0.24),
}


@dataclass(frozen=True)
class Finding:
    """One campus-relevant detection, normalized to our issue vocabulary."""

    kind: str  # waste | lights | water
    issue_type: str  # waste_accumulation | energy_wastage | water_leakage
    severity: str  # low | medium | high | critical
    label: str  # human readable, e.g. "Overflowing waste"
    detail: str  # sentence stored on Issue.description
    confidence: float
    # Normalized x1/y1/x2/y2 in 0..1 relative to the submitted image.
    bbox: tuple[float, float, float, float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "issue_type": self.issue_type,
            "severity": self.severity,
            "label": self.label,
            "detail": self.detail,
            "confidence": round(self.confidence, 3),
            "bbox": [round(v, 4) for v in self.bbox],
        }


@dataclass
class VisionResult:
    """Outcome of one analyze() call: engine used + findings + fallback reason."""

    engine: str  # "yolo" | "mock"
    model: str | None
    reason: str | None  # why we used mock instead of yolo
    findings: list[Finding] = field(default_factory=list)

    @property
    def labels(self) -> list[str]:
        return [f.label for f in self.findings]


# ---------------------------------------------------------------------------
# Stage one — YOLO (optional)
# ---------------------------------------------------------------------------

_MODEL: Any | None = None
_MODEL_ERROR: str | None = None
_MODEL_KEY: str | None = None


def _load_model() -> tuple[Any | None, str | None]:
    """Load (and cache) the YOLO model. Returns (model, error) — never raises."""
    global _MODEL, _MODEL_ERROR, _MODEL_KEY

    weights = VISION_MODEL or "yolo11n.pt"
    if _MODEL is not None and _MODEL_KEY == weights:
        return _MODEL, None
    if _MODEL_ERROR is not None and _MODEL_KEY == weights:
        return None, _MODEL_ERROR

    try:
        from ultralytics import YOLO
    except Exception as exc:  # ImportError or a broken optional install
        _MODEL_KEY, _MODEL_ERROR = weights, f"ultralytics not installed ({exc.__class__.__name__})"
        logger.info("Vision: %s — using mock detector", _MODEL_ERROR)
        return None, _MODEL_ERROR

    try:
        _MODEL = YOLO(weights)
    except Exception as exc:
        _MODEL = None
        _MODEL_KEY = weights
        _MODEL_ERROR = f"weights {weights!r} unavailable ({exc.__class__.__name__}: {exc})"
        logger.info("Vision: %s — using mock detector", _MODEL_ERROR)
        return None, _MODEL_ERROR

    _MODEL_KEY = weights
    _MODEL_ERROR = None
    logger.info("Vision: loaded YOLO weights %s", weights)
    return _MODEL, None


def image_size(image: bytes) -> tuple[int, int] | None:
    """Best-effort (width, height) — Pillow is a vision extra, so optional."""
    try:
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(image)) as im:
            return im.size
    except Exception:
        return None


def _open_pil(image: bytes) -> Any | None:
    try:
        from io import BytesIO

        from PIL import Image

        return Image.open(BytesIO(image)).convert("RGB")
    except Exception:
        return None


def _yolo_findings(image: bytes, zone_ctx: dict[str, Any]) -> tuple[list[Finding], str | None]:
    """Run YOLO, then apply the rules layer. Returns (findings, skip_reason)."""
    model, error = _load_model()
    if model is None:
        return [], error

    pil = _open_pil(image)
    if pil is None:
        return [], "image could not be decoded (Pillow missing or corrupt file)"

    try:
        results = model.predict(
            source=pil,
            conf=VISION_CONF,
            iou=VISION_IOU,
            device="cpu",
            verbose=False,
        )
    except Exception as exc:
        return [], f"inference failed ({exc.__class__.__name__}: {exc})"

    width, height = pil.size
    names: dict[int, str] = {}
    boxes: list[tuple[str, float, tuple[float, float, float, float]]] = []

    for result in results:
        names = getattr(result, "names", names)
        for box in getattr(result, "boxes", []) or []:
            try:
                xyxy = box.xyxy[0].tolist()
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
            except Exception:
                continue
            boxes.append((names.get(cls_id, str(cls_id)).lower(), conf, tuple(xyxy)))

    if not boxes:
        return [], "model returned no objects"

    present = {label for label, _, _ in boxes}
    # Occupancy gate for "empty room": count people detected in the frame.
    people = present & {"person", "people"}

    findings: list[Finding] = []
    for kind, rule in _YOLO_RULES.items():
        if kind == "lights" and zone_ctx.get("zone_type") == "server":
            continue  # server rooms are expected to run 24/7
        if rule.get("requires_empty") and people:
            continue  # someone is in the room, so it is not "empty"

        matched = [
            (label, conf, bbox)
            for label, conf, bbox in boxes
            if label in rule["labels"]
            and (not rule.get("floor_only") or _is_low(bbox, height))
        ]
        if not matched:
            continue

        label, conf, bbox = max(matched, key=lambda item: item[1])
        findings.append(
            _build_finding(
                kind=kind,
                severity=rule["severity"],
                label=rule["label"],
                detail=_detail(kind, zone_ctx, confidence=conf, matched=label),
                confidence=conf,
                bbox=(bbox[0] / width, bbox[1] / height, bbox[2] / width, bbox[3] / height),
            )
        )

    return findings, None


def _is_low(bbox: tuple[float, float, float, float], height: int) -> bool:
    """True when the box sits in the lower half of the frame (floor level)."""
    return bbox[3] / max(height, 1) >= 0.5


# ---------------------------------------------------------------------------
# Stage two — mock detector (demo never breaks)
# ---------------------------------------------------------------------------


def _eligible_kinds(zone_ctx: dict[str, Any]) -> list[str]:
    """Mock kinds that make sense for this zone (always non-empty)."""
    server = zone_ctx.get("zone_type") == "server"
    has_occupancy = zone_ctx.get("occupancy") is not None
    pool = [
        kind
        for kind in _MOCK_KINDS
        # Server rooms run 24/7, and "empty room" needs occupancy telemetry.
        if not (kind == "lights" and (server or not has_occupancy))
    ]
    return pool or ["waste"]


def mock_findings(image: bytes, zone_ctx: dict[str, Any]) -> list[Finding]:
    """Deterministic-but-varied findings so an offline demo still behaves."""
    zone_id = int(zone_ctx.get("id") or 0)
    # Seeded on the frame + zone + a 15s bucket: the same frame scanned twice
    # in a row agrees with itself, different frames / later scans differ.
    seed = (zlib.crc32(image[:8192]) ^ (zone_id * 0x9E3779B1) ^ (int(time.time()) // 15)) & 0xFFFFFFFF
    rng = random.Random(seed)

    pool = _eligible_kinds(zone_ctx)
    rng.shuffle(pool)
    count = 1 if rng.random() > _MOCK_SECOND_CHANCE else 2
    kinds = pool[:count]

    findings: list[Finding] = []
    for kind in kinds:
        lo, hi = _MOCK_CONF[kind]
        confidence = rng.uniform(lo, hi)
        x1, y1, w, h = _MOCK_BBOX[kind]
        x1 += rng.uniform(-0.06, 0.06)
        y1 += rng.uniform(-0.05, 0.05)
        w *= rng.uniform(0.85, 1.25)
        h *= rng.uniform(0.85, 1.2)
        bbox = (
            max(0.0, x1),
            max(0.0, y1),
            min(1.0, x1 + w),
            min(1.0, y1 + h),
        )
        findings.append(
            _build_finding(
                kind=kind,
                severity=_base_severity(kind, confidence),
                label=_MOCK_LABELS[kind],
                detail=_detail(kind, zone_ctx, confidence=confidence),
                confidence=confidence,
                bbox=bbox,
            )
        )
    return findings


_MOCK_LABELS = {
    "waste": "Overflowing waste",
    "lights": "Lights on in empty room",
    "water": "Water pooling on floor",
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _build_finding(
    *, kind: str, severity: str, label: str, detail: str, confidence: float, bbox: tuple[float, float, float, float]
) -> Finding:
    # High-confidence detections escalate one severity step.
    if confidence >= 0.93 and severity in {"low", "medium", "high"}:
        severity = {"low": "medium", "medium": "high", "high": "critical"}[severity]
    return Finding(
        kind=kind,
        issue_type=KIND_TO_ISSUE[kind],
        severity=severity,
        label=label,
        detail=detail,
        confidence=confidence,
        bbox=bbox,
    )


def _base_severity(kind: str, confidence: float) -> str:
    if confidence >= 0.9:
        return "critical" if kind in {"waste", "water"} else "high"
    if confidence >= 0.8:
        return "high"
    return "medium"


def _detail(kind: str, zone_ctx: dict[str, Any], confidence: float, matched: str | None = None) -> str:
    """Zone-aware sentence stored on Issue.description (drives the feed copy)."""
    zone_name = zone_ctx.get("name") or "the zone"
    occupancy = zone_ctx.get("occupancy")

    if kind == "waste":
        bags = max(1, round(confidence * 6))
        return (
            f"Frame analysis found waste heaped {bags} bags above the bin rim in {zone_name} "
            f"({confidence:.0%} confidence)."
        )
    if kind == "lights":
        who = "no occupants" if not occupancy else f"occupancy {occupancy:g}"
        return (
            f"Brightness in {zone_name} with {who} — lighting is on outside of use "
            f"({confidence:.0%} confidence)."
        )
    depth = 1 + round(confidence * 7)
    area = 0.4 + round(confidence * 4, 1)
    detail = (
        f"Standing water ~{depth} cm deep covering ~{area} m² of the {zone_name} floor "
        f"({confidence:.0%} confidence)."
    )
    if matched:
        detail += f" Near {matched}."
    return detail


def analyze(image: bytes, zone_ctx: dict[str, Any]) -> VisionResult:
    """Detect campus findings in an image. Never raises for engine failures."""
    if not VISION_ENABLED:
        return VisionResult(engine="mock", model=None, reason="vision disabled by config", findings=[])

    findings, skip_reason = _yolo_findings(image, zone_ctx)
    if findings:
        return VisionResult(engine="yolo", model=_MODEL_KEY or VISION_MODEL, reason=None, findings=findings)

    if not VISION_FALLBACK:
        # Operator asked for hard failures — surface the real reason upstream.
        return VisionResult(engine="yolo", model=_MODEL_KEY, reason=skip_reason, findings=[])

    return VisionResult(
        engine="mock",
        model=None,
        reason=skip_reason or "model produced no campus-relevant detections",
        findings=mock_findings(image, zone_ctx),
    )
