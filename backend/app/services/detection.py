"""Rule-based detection: turns live sensor samples into Issues.

Rules (see PLAN.md):
  * waste_accumulation      - bin fill at/above threshold
  * energy_wastage          - high draw while the zone is unoccupied (e.g. night)
  * water_leakage           - sustained, near-constant flow at/above leak rate
  * inefficient_usage       - draw far above the average for peer zones of the
                              same type during active hours

A given (zone, type) is only raised once while an issue is open, and not again
within ISSUE_COOLDOWN_SECONDS of the previous one being resolved.
"""

from __future__ import annotations

import logging
import statistics
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.config import (
    DETECTION_ENABLED,
    ENERGY_WASTE_WATTS,
    INEFFICIENT_FACTOR,
    ISSUE_COOLDOWN_SECONDS,
    WASTE_THRESHOLD,
    WATER_LEAK_LPM,
)
from app.models import Issue, Notification
from app.serializers import serialize_issue, serialize_notification

logger = logging.getLogger("verdant.detection")

TITLES = {
    "waste_accumulation": "Waste accumulation",
    "energy_wastage": "Energy wastage",
    "water_leakage": "Possible water leakage",
    "inefficient_usage": "Inefficient resource use",
}

SEVERITY_TO_LEVEL = {"critical": "alert", "high": "warning", "medium": "info", "low": "info"}


def is_suppressed(
    db: Session,
    ts: datetime,
    zone_id: int,
    issue_type: str,
    cooldown: float = ISSUE_COOLDOWN_SECONDS,
    source: str | None = None,
) -> bool:
    """True when a (zone, type) issue must not be raised again.

    Suppressed while an equivalent issue is already open, or within
    ``cooldown`` seconds of a previous one being resolved.

    Pass ``source`` to dedupe against one detector only — the vision lab does
    this so a camera frame still produces a finding even when the rules engine
    already tracks the same zone/type from sensor telemetry.
    """
    query = db.query(Issue.id).filter(
        Issue.zone_id == zone_id,
        Issue.type == issue_type,
        Issue.status == "open",
    )
    if source:
        query = query.filter(Issue.source == source)
    if query.first():
        return True

    cooldown_start = ts - timedelta(seconds=cooldown)
    resolved = db.query(Issue.id).filter(
        Issue.zone_id == zone_id,
        Issue.type == issue_type,
        Issue.status == "resolved",
        Issue.resolved_at.isnot(None),
        Issue.resolved_at >= cooldown_start,
    )
    if source:
        resolved = resolved.filter(Issue.source == source)
    return resolved.first() is not None


class Detector:
    def __init__(self) -> None:
        # zone_id -> recent water readings (to spot an almost constant leak flow)
        self._water_history: dict[int, list[float]] = defaultdict(list)
        self._inefficient_streak: dict[tuple[int, str], int] = defaultdict(int)

    # -- public -------------------------------------------------------------
    def evaluate(
        self, db: Session, samples: list[dict[str, Any]], ts: datetime
    ) -> list[dict[str, Any]]:
        if not DETECTION_ENABLED:
            return []

        zones: dict[int, dict[str, Any]] = {}
        for s in samples:
            ctx = zones.setdefault(
                s["zone_id"],
                {"zone_type": s["zone_type"], "zone_name": s["zone_name"], "occupancy": s["occupancy"], "vals": {}},
            )
            ctx["vals"][s["sensor_type"]] = (s["sensor_id"], s["value"])

        created: list[dict[str, Any]] = []
        created += self._waste(db, zones, ts)
        created += self._energy_wastage(db, zones, ts)
        created += self._water_leak(db, zones, ts)
        created += self._inefficient(db, zones, ts)
        return created

    # -- rules --------------------------------------------------------------
    def _waste(self, db, zones, ts) -> list[dict[str, Any]]:
        out = []
        for zone_id, ctx in zones.items():
            hit = ctx["vals"].get("waste")
            if not hit:
                continue
            sensor_id, value = hit
            if value >= WASTE_THRESHOLD:
                severity = "critical" if value >= 98 else "high"
                out.append(
                    self._create(
                        db, ts, zone_id, sensor_id, "waste_accumulation", severity,
                        f"Bin in {ctx['zone_name']} is {value:.0f}% full.",
                    )
                )
        return [i for i in out if i]

    def _energy_wastage(self, db, zones, ts) -> list[dict[str, Any]]:
        out = []
        for zone_id, ctx in zones.items():
            if ctx["zone_type"] == "server":  # server rooms are expected to run 24/7
                continue
            hit = ctx["vals"].get("energy")
            if not hit:
                continue
            sensor_id, value = hit
            occupancy = ctx["occupancy"]
            if value >= ENERGY_WASTE_WATTS and occupancy <= 0.5:
                severity = "critical" if value >= 3 * ENERGY_WASTE_WATTS else "high"
                out.append(
                    self._create(
                        db, ts, zone_id, sensor_id, "energy_wastage", severity,
                        f"{ctx['zone_name']} is drawing {value:.0f} W with no occupants "
                        f"(occupancy {occupancy:.0f}).",
                    )
                )
        return [i for i in out if i]

    def _water_leak(self, db, zones, ts) -> list[dict[str, Any]]:
        out = []
        for zone_id, ctx in zones.items():
            hit = ctx["vals"].get("water")
            if not hit:
                self._water_history.pop(zone_id, None)
                continue
            sensor_id, value = hit
            history = self._water_history[zone_id]
            history.append(value)
            if len(history) > 8:
                del history[:-8]
            if len(history) >= 6:
                recent = history[-6:]
                avg = statistics.fmean(recent)
                spread = max(recent) - min(recent)
                constant = spread <= max(0.2, 0.15 * avg)
                if min(recent) >= WATER_LEAK_LPM and constant:
                    out.append(
                        self._create(
                            db, ts, zone_id, sensor_id, "water_leakage", "high",
                            f"Constant flow of {avg:.1f} L/min detected in {ctx['zone_name']} "
                            "— likely a leaking fixture or pipe.",
                        )
                    )
        return [i for i in out if i]

    def _inefficient(self, db, zones, ts) -> list[dict[str, Any]]:
        # Peer average per zone type, among occupied zones.
        peers: dict[str, list[float]] = defaultdict(list)
        for ctx in zones.values():
            if ctx["occupancy"] <= 0:
                continue
            hit = ctx["vals"].get("energy")
            if hit and ctx["zone_type"] != "server":
                peers[ctx["zone_type"]].append(hit[1])

        out = []
        for zone_id, ctx in zones.items():
            hit = ctx["vals"].get("energy")
            key = (zone_id, "energy")
            peer_values = peers.get(ctx["zone_type"], [])
            if not hit or ctx["occupancy"] <= 0 or len(peer_values) < 2:
                self._inefficient_streak[key] = 0
                continue
            avg = statistics.fmean(peer_values)
            value = hit[1]
            if avg > 0 and value > INEFFICIENT_FACTOR * avg:
                self._inefficient_streak[key] += 1
                if self._inefficient_streak[key] >= 2:
                    out.append(
                        self._create(
                            db, ts, zone_id, hit[0], "inefficient_usage", "medium",
                            f"{ctx['zone_name']} draws {value:.0f} W, "
                            f"{value / avg:.1f}x the average of comparable "
                            f"{ctx['zone_type']} zones ({avg:.0f} W).",
                        )
                    )
                    self._inefficient_streak[key] = 0
            else:
                self._inefficient_streak[key] = 0
        return [i for i in out if i]

    # -- persistence --------------------------------------------------------
    def _create(
        self, db: Session, ts: datetime, zone_id: int, sensor_id: int,
        issue_type: str, severity: str, description: str, source: str = "sensor",
    ) -> dict[str, Any] | None:
        if self._is_suppressed(db, ts, zone_id, issue_type):
            return None
        title = TITLES.get(issue_type, issue_type.replace("_", " ").title())
        issue = Issue(
            zone_id=zone_id,
            sensor_id=sensor_id,
            type=issue_type,
            title=title,
            description=description,
            severity=severity,
            status="open",
            source=source,
            detected_at=ts,
        )
        db.add(issue)
        db.flush()

        level = SEVERITY_TO_LEVEL.get(severity, "info")
        notification = Notification(
            issue_id=issue.id,
            level=level,
            title=f"{title} — {issue.zone.name if issue.zone else 'campus'}",
            message=description,
        )
        db.add(notification)
        db.flush()

        payload = serialize_issue(issue)
        payload["notification"] = serialize_notification(notification)
        return payload

    @staticmethod
    def _is_suppressed(db: Session, ts: datetime, zone_id: int, issue_type: str) -> bool:
        return is_suppressed(db, ts, zone_id, issue_type)
