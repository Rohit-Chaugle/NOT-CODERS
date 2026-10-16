"""Reusable read queries."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import SIM_INTERVAL_SECONDS
from app.models import Building, Issue, Notification, Sensor, SensorReading, Zone


def latest_values(
    db: Session, sensor_type: str | None = None
) -> dict[int, float]:
    """Map sensor_id -> most recent reading value (max id = latest)."""
    sub = (
        db.query(
            SensorReading.sensor_id,
            func.max(SensorReading.id).label("mid"),
        )
        .group_by(SensorReading.sensor_id)
        .subquery()
    )
    query = db.query(SensorReading.sensor_id, SensorReading.value).join(
        sub, SensorReading.id == sub.c.mid
    )
    if sensor_type:
        query = query.join(Sensor, Sensor.id == SensorReading.sensor_id).filter(
            Sensor.sensor_type == sensor_type
        )
    return {sensor_id: value for sensor_id, value in query.all()}


def sensors_of_type(db: Session, sensor_type: str) -> dict[int, int]:
    """Map sensor_id -> zone_id for every sensor of a given type."""
    return {
        sensor_id: zone_id
        for sensor_id, zone_id in db.query(Sensor.id, Sensor.zone_id)
        .filter(Sensor.sensor_type == sensor_type)
        .all()
    }


def campus_summary(db: Session) -> dict:
    """Aggregate counts and current resource state across the campus.

    Shared by GET /stats/summary and the Generative AI layer (Green Score,
    recommendations, reports).
    """
    midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    # Live instantaneous values.
    latest = latest_values(db)
    energy_ids = {
        s_id for (s_id,) in db.query(Sensor.id).filter(Sensor.sensor_type == "energy").all()
    }
    water_ids = {
        s_id for (s_id,) in db.query(Sensor.id).filter(Sensor.sensor_type == "water").all()
    }
    waste_ids = {
        s_id for (s_id,) in db.query(Sensor.id).filter(Sensor.sensor_type == "waste").all()
    }
    occ_ids = {
        s_id for (s_id,) in db.query(Sensor.id).filter(Sensor.sensor_type == "occupancy").all()
    }

    current_energy_w = sum(latest.get(i, 0.0) for i in energy_ids)
    current_water_lpm = sum(latest.get(i, 0.0) for i in water_ids)
    waste_values = [latest[i] for i in waste_ids if i in latest]
    current_occupancy = int(sum(latest.get(i, 0.0) for i in occ_ids))

    # Integrate today's readings (value * tick interval).
    def _today_sum(sensor_type: str) -> float:
        total = (
            db.query(func.coalesce(func.sum(SensorReading.value), 0.0))
            .join(Sensor, Sensor.id == SensorReading.sensor_id)
            .filter(Sensor.sensor_type == sensor_type, SensorReading.ts >= midnight)
            .scalar()
        )
        return float(total or 0.0)

    energy_kwh_today = _today_sum("energy") * SIM_INTERVAL_SECONDS / 3_600_000.0
    water_liters_today = _today_sum("water") * SIM_INTERVAL_SECONDS / 60.0

    issue_total = db.query(func.count(Issue.id)).scalar() or 0
    issue_open = db.query(func.count(Issue.id)).filter(Issue.status == "open").scalar() or 0
    by_severity = dict(
        db.query(Issue.severity, func.count(Issue.id)).group_by(Issue.severity).all()
    )
    by_type = dict(
        db.query(Issue.type, func.count(Issue.id)).group_by(Issue.type).all()
    )

    return {
        "generated_at": datetime.now().isoformat(),
        "campus": {
            "buildings": db.query(func.count(Building.id)).scalar() or 0,
            "zones": db.query(func.count(Zone.id)).scalar() or 0,
            "sensors": db.query(func.count(Sensor.id)).scalar() or 0,
        },
        "issues": {
            "total": issue_total,
            "open": issue_open,
            "resolved": issue_total - issue_open,
            "by_severity": by_severity,
            "by_type": by_type,
        },
        "energy": {
            "current_kw": round(current_energy_w / 1000.0, 2),
            "today_kwh": round(energy_kwh_today, 3),
        },
        "water": {
            "current_lpm": round(current_water_lpm, 2),
            "today_liters": round(water_liters_today, 1),
        },
        "waste": {
            "avg_fill_pct": round(sum(waste_values) / len(waste_values), 1) if waste_values else 0.0,
            "bins_tracked": len(waste_ids),
            "overflow_bins": sum(1 for v in waste_values if v >= 90),
        },
        "occupancy": {
            "current": current_occupancy,
            "capacity": db.query(func.coalesce(func.sum(Zone.capacity), 0)).scalar() or 0,
        },
        "notifications": {
            "unread": db.query(func.count(Notification.id))
            .filter(Notification.is_read.is_(False))
            .scalar() or 0,
        },
    }
