"""Small helpers to turn ORM objects into JSON-friendly dicts."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.models import Issue, Notification, Sensor


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def serialize_issue(issue: Issue) -> dict[str, Any]:
    zone = issue.zone
    return {
        "id": issue.id,
        "type": issue.type,
        "title": issue.title,
        "description": issue.description,
        "severity": issue.severity,
        "status": issue.status,
        "source": issue.source,
        "zone_id": issue.zone_id,
        "zone_name": zone.name if zone else None,
        "building_id": zone.building_id if zone else None,
        "building_name": zone.building.name if zone and zone.building else None,
        "sensor_id": issue.sensor_id,
        "detected_at": iso(issue.detected_at),
        "resolved_at": iso(issue.resolved_at),
        "created_at": iso(issue.created_at),
    }


def serialize_notification(notification: Notification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "issue_id": notification.issue_id,
        "level": notification.level,
        "title": notification.title,
        "message": notification.message,
        "is_read": notification.is_read,
        "created_at": iso(notification.created_at),
    }


def serialize_sensor(sensor: Sensor, latest_value: float | None = None) -> dict[str, Any]:
    return {
        "id": sensor.id,
        "zone_id": sensor.zone_id,
        "sensor_type": sensor.sensor_type,
        "unit": sensor.unit,
        "status": sensor.status,
        "latest_value": latest_value,
        "last_seen_at": iso(sensor.last_seen_at),
    }
