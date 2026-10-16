"""Digital-twin topology: campus map and per-zone detail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Building, Issue, Sensor, Zone
from app.queries import latest_values
from app.serializers import serialize_issue, serialize_sensor

router = APIRouter(tags=["twin"])


@router.get("/twin/campus")
def get_campus(db: Session = Depends(get_db)) -> dict:
    """Whole campus: buildings with their zones, sensor counts and open issues."""
    buildings = (
        db.query(Building)
        .options(selectinload(Building.zones).selectinload(Zone.sensors))
        .order_by(Building.id)
        .all()
    )

    sensor_counts = dict(
        db.query(Sensor.zone_id, func.count(Sensor.id)).group_by(Sensor.zone_id).all()
    )
    open_issues = dict(
        db.query(Issue.zone_id, func.count(Issue.id))
        .filter(Issue.status == "open")
        .group_by(Issue.zone_id)
        .all()
    )

    campus = {
        "name": "Verdant Institute of Technology",
        "buildings": len(buildings),
        "zones": sum(len(b.zones) for b in buildings),
        "sensors": sum(sensor_counts.values()),
        "open_issues": sum(open_issues.values()),
    }

    payload = []
    for b in buildings:
        zones = []
        for z in b.zones:
            zones.append(
                {
                    "id": z.id,
                    "name": z.name,
                    "zone_type": z.zone_type,
                    "floor": z.floor,
                    "area_m2": z.area_m2,
                    "capacity": z.capacity,
                    "position": {"x": z.pos_x, "y": z.pos_y, "z": z.pos_z},
                    "sensor_count": sensor_counts.get(z.id, 0),
                    "open_issues": open_issues.get(z.id, 0),
                }
            )
        payload.append(
            {
                "id": b.id,
                "name": b.name,
                "code": b.code,
                "category": b.category,
                "floors": b.floors,
                "area_m2": b.area_m2,
                "position": {"x": b.pos_x, "y": 0.0, "z": b.pos_z},
                "energy_budget_kw": b.energy_budget_kw,
                "zones": zones,
            }
        )

    return {"campus": campus, "buildings": payload}


@router.get("/zones/{zone_id}")
def get_zone(zone_id: int, db: Session = Depends(get_db)) -> dict:
    """Zone detail with sensors (latest values) and open issues."""
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")

    values = latest_values(db)
    sensors = [
        serialize_sensor(s, latest_value=values.get(s.id))
        for s in sorted(zone.sensors, key=lambda s: s.id)
    ]
    issues = (
        db.query(Issue)
        .filter(Issue.zone_id == zone_id, Issue.status == "open")
        .order_by(Issue.detected_at.desc())
        .all()
    )

    return {
        "id": zone.id,
        "name": zone.name,
        "zone_type": zone.zone_type,
        "floor": zone.floor,
        "area_m2": zone.area_m2,
        "capacity": zone.capacity,
        "position": {"x": zone.pos_x, "y": zone.pos_y, "z": zone.pos_z},
        "building": {"id": zone.building.id, "name": zone.building.name, "code": zone.building.code},
        "sensors": sensors,
        "open_issues": [serialize_issue(i) for i in issues],
    }


@router.post("/twin/demo/anomaly")
async def inject_demo_anomaly(step: int = 1, db: Session = Depends(get_db)) -> dict:
    """Inject a scripted anomaly sequence for judges to see detection, alert, and AI recommendation live.
    
    Step 1: Water leak in the Student Hostel (Hostel Mess / Laundry Room)
    Step 2: Energy spike in Science & Innovation Labs (Physics / Electronics Lab)
    Step 3: Waste overflow at Central Canteen (Dining Hall)
    """
    from datetime import datetime
    from app.models import Issue, Notification, Sensor, SensorReading
    from app.serializers import serialize_notification
    from app.services.realtime import manager

    now = datetime.now()

    if step == 1:
        # Water leak in Student Hostel
        target_zone = (
            db.query(Zone)
            .join(Building)
            .filter(Building.name.like("%Hostel%"), Zone.name.like("%Mess%"))
            .first()
        )
        if not target_zone:
            target_zone = db.query(Zone).join(Building).filter(Building.name.like("%Hostel%")).first()

        sensor = db.query(Sensor).filter(Sensor.zone_id == target_zone.id, Sensor.sensor_type == "water").first()
        sensor_id = sensor.id if sensor else None
        if sensor_id:
            db.add(SensorReading(sensor_id=sensor_id, ts=now, value=18.4))

        issue = Issue(
            zone_id=target_zone.id,
            sensor_id=sensor_id,
            type="water_leakage",
            title="Sustained Pipe Rupture / Leak",
            description=f"Continuous 18.4 L/min water flow detected in {target_zone.name} (Student Hostel) indicating severe fixture failure.",
            severity="critical",
            status="open",
            source="sensor",
            detected_at=now,
        )
        db.add(issue)
        db.flush()

        notification = Notification(
            issue_id=issue.id,
            level="alert",
            title=f"CRITICAL WATER LEAK — {target_zone.name}",
            message=f"Continuous 18.4 L/min flow in {target_zone.name} (Student Hostel). Immediate isolation required.",
            created_at=now,
        )
        db.add(notification)
        db.commit()

        payload = serialize_issue(issue)
        await manager.broadcast("issue:created", payload)
        await manager.broadcast("notification", serialize_notification(notification))
        return {
            "step": 1,
            "title": "Water Leak in Student Hostel",
            "issue": payload,
            "zone": target_zone.name,
            "building": "Student Hostel",
        }

    elif step == 2:
        # Energy spike in Science & Innovation Labs
        target_zone = (
            db.query(Zone)
            .join(Building)
            .filter(Building.name.like("%Lab%"), Zone.name.like("%Physics%"))
            .first()
        )
        if not target_zone:
            target_zone = db.query(Zone).join(Building).filter(Building.name.like("%Lab%")).first()

        sensor = db.query(Sensor).filter(Sensor.zone_id == target_zone.id, Sensor.sensor_type == "energy").first()
        sensor_id = sensor.id if sensor else None
        if sensor_id:
            db.add(SensorReading(sensor_id=sensor_id, ts=now, value=4800.0))

        issue = Issue(
            zone_id=target_zone.id,
            sensor_id=sensor_id,
            type="energy_wastage",
            title="Unoccupied High-Load Energy Spike",
            description=f"High load draw of 4.8 kW in {target_zone.name} (Science & Innovation Labs) while occupancy is 0.",
            severity="high",
            status="open",
            source="sensor",
            detected_at=now,
        )
        db.add(issue)
        db.flush()

        notification = Notification(
            issue_id=issue.id,
            level="warning",
            title=f"ENERGY WASTAGE — {target_zone.name}",
            message=f"4.8 kW draw in empty {target_zone.name} (Science & Innovation Labs). Automated shutdown recommended.",
            created_at=now,
        )
        db.add(notification)
        db.commit()

        payload = serialize_issue(issue)
        await manager.broadcast("issue:created", payload)
        await manager.broadcast("notification", serialize_notification(notification))
        return {
            "step": 2,
            "title": "Energy Spike in Science Labs",
            "issue": payload,
            "zone": target_zone.name,
            "building": "Science & Innovation Labs",
        }

    else:
        # Waste overflow at Central Canteen
        target_zone = (
            db.query(Zone)
            .join(Building)
            .filter(Building.name.like("%Canteen%"), Zone.name.like("%Dining%"))
            .first()
        )
        if not target_zone:
            target_zone = db.query(Zone).join(Building).filter(Building.name.like("%Canteen%")).first()

        sensor = db.query(Sensor).filter(Sensor.zone_id == target_zone.id, Sensor.sensor_type == "waste").first()
        sensor_id = sensor.id if sensor else None
        if sensor_id:
            db.add(SensorReading(sensor_id=sensor_id, ts=now, value=98.5))

        issue = Issue(
            zone_id=target_zone.id,
            sensor_id=sensor_id,
            type="waste_accumulation",
            title="Critical Bin Overflow & Accumulation",
            description=f"Sensors and computer vision detect 98.5% bin capacity and waste accumulation around {target_zone.name} (Central Canteen).",
            severity="high",
            status="open",
            source="vision",
            detected_at=now,
        )
        db.add(issue)
        db.flush()

        notification = Notification(
            issue_id=issue.id,
            level="warning",
            title=f"WASTE OVERFLOW — {target_zone.name}",
            message=f"Bin capacity at 98.5% in {target_zone.name} (Central Canteen). Reroute sanitation crew immediately.",
            created_at=now,
        )
        db.add(notification)
        db.commit()

        payload = serialize_issue(issue)
        await manager.broadcast("issue:created", payload)
        await manager.broadcast("notification", serialize_notification(notification))
        return {
            "step": 3,
            "title": "Waste Overflow at Central Canteen",
            "issue": payload,
            "zone": target_zone.name,
            "building": "Central Canteen",
        }
