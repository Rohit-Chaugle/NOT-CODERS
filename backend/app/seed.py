"""Seed a fictional campus: 6 buildings, ~20 zones and their sensors.

Run standalone:
    python -m app.seed          # create DB + seed (idempotent)
    python -m app.seed --force  # wipe campus data first
"""

from __future__ import annotations

import sys
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models import Building, Sensor, Zone

# Units used by each sensor type.
SENSOR_UNITS = {
    "energy": "W",
    "water": "L/min",
    "waste": "%",
    "occupancy": "people",
}

# Campus layout: each building sits on the ground plane and holds zones.
# Zone positions are absolute on the same ground plane; pos_y is the floor level.
CAMPUS: list[dict[str, Any]] = [
    {
        "name": "Central Library",
        "code": "LIB",
        "category": "academic",
        "floors": 3,
        "area_m2": 3200,
        "pos_x": 0.0,
        "pos_z": 0.0,
        "energy_budget_kw": 90.0,
        "zones": [
            {"name": "Reading Hall", "zone_type": "library", "floor": 0, "area_m2": 600, "capacity": 120, "pos": (-10, 0, 0), "sensors": ["occupancy", "energy", "waste"]},
            {"name": "Digital Section", "zone_type": "library", "floor": 1, "area_m2": 350, "capacity": 60, "pos": (12, 3, 0), "sensors": ["occupancy", "energy", "waste"]},
            {"name": "Periodicals Room", "zone_type": "library", "floor": 1, "area_m2": 200, "capacity": 30, "pos": (-12, 3, 8), "sensors": ["occupancy", "energy"]},
        ],
    },
    {
        "name": "Student Hostel",
        "code": "HOS",
        "category": "residential",
        "floors": 2,
        "area_m2": 2600,
        "pos_x": -70.0,
        "pos_z": 40.0,
        "energy_budget_kw": 70.0,
        "zones": [
            {"name": "Common Room", "zone_type": "common", "floor": 0, "area_m2": 220, "capacity": 50, "pos": (-80, 0, 20), "sensors": ["occupancy", "energy", "waste"]},
            {"name": "Hostel Mess", "zone_type": "mess", "floor": 0, "area_m2": 400, "capacity": 90, "pos": (-60, 0, 20), "sensors": ["occupancy", "energy", "water", "waste"]},
            {"name": "Laundry Room", "zone_type": "utility", "floor": 0, "area_m2": 120, "capacity": 10, "pos": (-80, 0, 55), "sensors": ["occupancy", "energy", "water"]},
            {"name": "Warden Office", "zone_type": "office", "floor": 1, "area_m2": 40, "capacity": 6, "pos": (-70, 3, 60), "sensors": ["occupancy", "energy"]},
        ],
    },
    {
        "name": "Central Canteen",
        "code": "CAN",
        "category": "amenities",
        "floors": 1,
        "area_m2": 900,
        "pos_x": 60.0,
        "pos_z": 40.0,
        "energy_budget_kw": 55.0,
        "zones": [
            {"name": "Dining Hall", "zone_type": "cafeteria", "floor": 0, "area_m2": 500, "capacity": 150, "pos": (50, 0, 30), "sensors": ["occupancy", "energy", "waste"]},
            {"name": "Kitchen", "zone_type": "kitchen", "floor": 0, "area_m2": 160, "capacity": 20, "pos": (75, 0, 30), "sensors": ["occupancy", "energy", "water", "waste"]},
        ],
    },
    {
        "name": "Science & Innovation Labs",
        "code": "LAB",
        "category": "academic",
        "floors": 2,
        "area_m2": 2400,
        "pos_x": 0.0,
        "pos_z": 70.0,
        "energy_budget_kw": 120.0,
        "zones": [
            {"name": "Physics Lab", "zone_type": "lab", "floor": 0, "area_m2": 200, "capacity": 40, "pos": (-14, 0, 70), "sensors": ["occupancy", "energy", "water"]},
            {"name": "Chemistry Lab", "zone_type": "lab", "floor": 0, "area_m2": 200, "capacity": 40, "pos": (14, 0, 70), "sensors": ["occupancy", "energy", "water"]},
            {"name": "Computer Lab", "zone_type": "lab", "floor": 1, "area_m2": 240, "capacity": 60, "pos": (-14, 3, 85), "sensors": ["occupancy", "energy", "waste"]},
            {"name": "Electronics Lab", "zone_type": "lab", "floor": 1, "area_m2": 180, "capacity": 40, "pos": (14, 3, 85), "sensors": ["occupancy", "energy"]},
        ],
    },
    {
        "name": "Administration Block",
        "code": "ADM",
        "category": "admin",
        "floors": 2,
        "area_m2": 1500,
        "pos_x": 60.0,
        "pos_z": 0.0,
        "energy_budget_kw": 45.0,
        "zones": [
            {"name": "Admin Office", "zone_type": "office", "floor": 0, "area_m2": 120, "capacity": 25, "pos": (50, 0, -8), "sensors": ["occupancy", "energy", "waste"]},
            {"name": "Accounts", "zone_type": "office", "floor": 0, "area_m2": 80, "capacity": 15, "pos": (72, 0, -8), "sensors": ["occupancy", "energy"]},
            {"name": "Conference Room", "zone_type": "office", "floor": 1, "area_m2": 90, "capacity": 30, "pos": (55, 3, 8), "sensors": ["occupancy", "energy"]},
            {"name": "Server Room", "zone_type": "server", "floor": 1, "area_m2": 30, "capacity": 2, "pos": (75, 3, 8), "sensors": ["occupancy", "energy"]},
        ],
    },
    {
        "name": "Sports Complex",
        "code": "SPT",
        "category": "amenities",
        "floors": 1,
        "area_m2": 3800,
        "pos_x": 120.0,
        "pos_z": 55.0,
        "energy_budget_kw": 100.0,
        "zones": [
            {"name": "Indoor Arena", "zone_type": "sports", "floor": 0, "area_m2": 900, "capacity": 100, "pos": (110, 0, 45), "sensors": ["occupancy", "energy", "water", "waste"]},
            {"name": "Gymnasium", "zone_type": "sports", "floor": 0, "area_m2": 300, "capacity": 60, "pos": (140, 0, 45), "sensors": ["occupancy", "energy"]},
            {"name": "Swimming Pool", "zone_type": "pool", "floor": 0, "area_m2": 500, "capacity": 40, "pos": (125, 0, 75), "sensors": ["occupancy", "energy", "water"]},
        ],
    },
]


def seed_campus(db: Session) -> dict[str, int]:
    """Insert the campus. Returns counts; assumes the DB is empty."""
    n_buildings = n_zones = n_sensors = 0
    for b in CAMPUS:
        building = Building(
            name=b["name"],
            code=b["code"],
            category=b["category"],
            floors=b["floors"],
            area_m2=b["area_m2"],
            pos_x=b["pos_x"],
            pos_z=b["pos_z"],
            energy_budget_kw=b["energy_budget_kw"],
        )
        db.add(building)
        db.flush()
        n_buildings += 1

        for z in b["zones"]:
            x, y, zz = z["pos"]
            zone = Zone(
                building_id=building.id,
                name=z["name"],
                floor=z["floor"],
                zone_type=z["zone_type"],
                area_m2=z["area_m2"],
                capacity=z["capacity"],
                pos_x=x,
                pos_y=y,
                pos_z=zz,
            )
            db.add(zone)
            db.flush()
            n_zones += 1

            for sensor_type in z["sensors"]:
                db.add(
                    Sensor(
                        zone_id=zone.id,
                        sensor_type=sensor_type,
                        unit=SENSOR_UNITS[sensor_type],
                        status="online",
                    )
                )
                n_sensors += 1

    db.commit()
    return {"buildings": n_buildings, "zones": n_zones, "sensors": n_sensors}


def main() -> int:
    force = "--force" in sys.argv
    init_db()
    with SessionLocal() as db:
        existing = db.query(Building).count()
        if existing and not force:
            print(f"Campus already seeded ({existing} buildings). Use --force to reset.")
            return 0
        if force:
            from app.models import Issue, Notification, SensorReading

            for model in (Notification, Issue, SensorReading, Sensor, Zone, Building):
                db.query(model).delete()
            db.commit()
        counts = seed_campus(db)
        print(f"Seeded campus: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
