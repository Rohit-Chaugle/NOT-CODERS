"""Computer vision lab: analyse a campus image and raise issues from it.

POST /vision/analyze  (multipart: file + zone_id)

The heavy model lives behind an optional import — see requirements-vision.txt.
If ultralytics/weights are unavailable the endpoint still succeeds using the
mock detector, so the demo never breaks. Every detection becomes an Issue with
source="vision" and is broadcast over /ws/live, which is what makes it appear
in the feed and on the 3D map.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.config import (
    VISION_CONF,
    VISION_ISSUE_COOLDOWN,
    VISION_MAX_BYTES,
    VISION_MODEL,
)
from app.database import get_db
from app.models import Issue, Notification, Sensor, SensorReading, Zone
from app.serializers import serialize_issue, serialize_notification
from app.services import vision
from app.services.detection import SEVERITY_TO_LEVEL, is_suppressed
from app.services.realtime import manager

logger = logging.getLogger("verdant.vision.api")

router = APIRouter(tags=["vision"])

IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/bmp", "image/gif"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}


@router.post("/vision/analyze")
async def analyze_image(
    file: UploadFile = File(..., description="Frame captured from a campus camera."),
    zone_id: int = Form(..., description="Zone the frame was captured in."),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Detect overflowing waste, lights on in empty rooms and water pooling.

    Returns the engine used, the raw detections (normalized bounding boxes)
    and the Issues that were created (source="vision").
    """
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")

    content_type = (file.content_type or "").lower()
    suffix = (file.filename or "").rsplit(".", 1)
    has_suffix = len(suffix) == 2 and f".{suffix[1].lower()}" in IMAGE_SUFFIXES
    if content_type not in IMAGE_TYPES and not has_suffix:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {content_type or 'unknown'}")

    payload = await file.read(VISION_MAX_BYTES + 1)
    if len(payload) > VISION_MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"Image exceeds {VISION_MAX_BYTES // (1024 * 1024)} MB limit")
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    zone_ctx = _zone_context(db, zone)
    # YOLO inference is CPU-heavy — run it off the event loop.
    result = await run_in_threadpool(vision.analyze, payload, zone_ctx)

    now = datetime.now()
    created: list[dict[str, Any]] = []
    suppressed: list[dict[str, Any]] = []

    for finding in result.findings:
        if is_suppressed(
            db,
            now,
            zone_id,
            finding.issue_type,
            cooldown=VISION_ISSUE_COOLDOWN,
            source="vision",
        ):
            suppressed.append(
                {
                    "type": finding.issue_type,
                    "label": finding.label,
                    "reason": "this zone was already flagged by a recent vision scan",
                }
            )
            continue

        issue = Issue(
            zone_id=zone_id,
            sensor_id=None,  # vision findings are not attributable to a sensor
            type=finding.issue_type,
            title=finding.label,
            description=finding.detail,
            severity=finding.severity,
            status="open",
            source="vision",
            detected_at=now,
        )
        db.add(issue)
        db.flush()

        notification = Notification(
            issue_id=issue.id,
            level=SEVERITY_TO_LEVEL.get(finding.severity, "info"),
            title=f"{finding.label} — {zone.name}",
            message=finding.detail,
        )
        db.add(notification)
        db.flush()

        created.append(
            {
                "issue": serialize_issue(issue),
                "notification": serialize_notification(notification),
                "detection": finding.to_dict(),
            }
        )

    # Commit first, then fan out — matches how /issues/{id}/resolve behaves.
    db.commit()

    for entry in created:
        await manager.broadcast("issue:created", entry["issue"])
        await manager.broadcast("notification", entry["notification"])

    logger.info(
        "Vision: %s -> %d detections, %d issues (%d suppressed) in zone %s",
        result.engine,
        len(result.findings),
        len(created),
        len(suppressed),
        zone.name,
    )

    return {
        "engine": result.engine,
        "model": result.model,
        "reason": result.reason,
        "zone": {
            "id": zone.id,
            "name": zone.name,
            "building_id": zone.building_id,
            "building_name": zone.building.name if zone.building else None,
            "zone_type": zone.zone_type,
            "occupancy": zone_ctx.get("occupancy"),
        },
        "image": {
            "bytes": len(payload),
            "content_type": content_type,
            "size": vision.image_size(payload),
        },
        "config": {"conf": VISION_CONF, "model": VISION_MODEL or "yolo11n.pt"},
        "scanned_at": now.isoformat(),
        "detections": [f.to_dict() for f in result.findings],
        "issues": [entry["issue"] for entry in created],
        "suppressed": suppressed,
    }


def _zone_context(db: Session, zone: Zone) -> dict[str, Any]:
    """Zone metadata + latest occupancy, so findings read like real telemetry."""
    occupancy: float | None = None
    row = (
        db.query(SensorReading.value)
        .join(Sensor, Sensor.id == SensorReading.sensor_id)
        .filter(Sensor.zone_id == zone.id, Sensor.sensor_type == "occupancy")
        .order_by(SensorReading.ts.desc())
        .first()
    )
    if row is not None:
        occupancy = float(row[0])

    open_issues = (
        db.query(Issue.id)
        .filter(Issue.zone_id == zone.id, Issue.status == "open")
        .count()
    )

    return {
        "id": zone.id,
        "name": zone.name,
        "zone_type": zone.zone_type,
        "building_name": zone.building.name if zone.building else None,
        "occupancy": occupancy,
        "open_issues": open_issues,
    }
