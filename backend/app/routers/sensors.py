"""Sensor time-series readings."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Sensor, SensorReading
from app.serializers import iso

router = APIRouter(tags=["sensors"])


@router.get("/sensors/{sensor_id}/readings")
def get_readings(
    sensor_id: int,
    limit: int = 300,
    start: datetime | None = None,
    end: datetime | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Recent readings for a sensor, oldest first for easy charting.

    ``start``/``end`` are optional ISO timestamps; ``limit`` caps the result
    (the most recent ``limit`` points are returned).
    """
    sensor = db.get(Sensor, sensor_id)
    if sensor is None:
        raise HTTPException(status_code=404, detail=f"Sensor {sensor_id} not found")

    query = db.query(SensorReading).filter(SensorReading.sensor_id == sensor_id)
    if start is not None:
        query = query.filter(SensorReading.ts >= start)
    if end is not None:
        query = query.filter(SensorReading.ts <= end)

    limit = max(1, min(limit, 2000))
    rows = query.order_by(SensorReading.ts.desc()).limit(limit).all()
    readings = [{"ts": iso(r.ts), "value": r.value} for r in reversed(rows)]

    return {
        "sensor": {
            "id": sensor.id,
            "zone_id": sensor.zone_id,
            "zone_name": sensor.zone.name if sensor.zone else None,
            "sensor_type": sensor.sensor_type,
            "unit": sensor.unit,
            "status": sensor.status,
        },
        "count": len(readings),
        "readings": readings,
    }
