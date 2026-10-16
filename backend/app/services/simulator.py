"""Background sensor simulator.

Every ``SIM_INTERVAL_SECONDS`` it synthesises one reading per sensor using
day/night activity cycles and occupancy-linked resource use, optionally
injects anomalies (water leak, night energy spike, overflowing bin), persists
readings and returns the batch so the API can broadcast it over /ws/live.

Detection (app.services.detection) is invoked by the runner with the same
samples so issues are raised in the same tick.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import (
    SIM_ANOMALY_CHANCE,
    SIM_ENABLED,
    SIM_INTERVAL_SECONDS,
    SIM_MAX_ANOMALIES,
    SIM_RETENTION_HOURS,
)
from app.database import SessionLocal
from app.models import Sensor, SensorReading, Zone
from app.services.detection import Detector
from app.services.realtime import manager

logger = logging.getLogger("verdant.simulator")

# Standby power (W) and additional W per occupant, per zone type.
ZONE_ENERGY = {
    "library": (180.0, 22.0),
    "common": (120.0, 18.0),
    "mess": (500.0, 55.0),
    "utility": (250.0, 90.0),
    "office": (150.0, 35.0),
    "cafeteria": (350.0, 28.0),
    "kitchen": (900.0, 160.0),
    "lab": (600.0, 110.0),
    "server": (2400.0, 0.0),
    "sports": (400.0, 45.0),
    "pool": (900.0, 8.0),
}
DEFAULT_ENERGY = (200.0, 25.0)

# Baseline flow (L/min) and L/min per occupant, per zone type.
ZONE_WATER = {
    "mess": (1.2, 0.5),
    "utility": (2.5, 0.6),
    "cafeteria": (0.8, 0.25),
    "kitchen": (1.8, 0.7),
    "lab": (0.2, 0.45),
    "sports": (0.4, 0.35),
    "pool": (5.0, 0.5),
}
DEFAULT_WATER = (0.3, 0.3)

# Bin fill (% per occupant per tick), per zone type.
ZONE_WASTE = {
    "cafeteria": 0.010,
    "mess": 0.010,
    "kitchen": 0.014,
    "library": 0.003,
    "lab": 0.002,
    "office": 0.004,
    "sports": 0.006,
    "common": 0.008,
}
DEFAULT_WASTE = 0.003

SPIKE_HEAVY = ["energy_spike", "energy_spike", "energy_spike", "water_leak", "bin_overflow"]
DAY_HEAVY = ["water_leak", "water_leak", "bin_overflow", "energy_spike"]


def activity_factor(hour: float) -> float:
    """Campus-wide day/night activity multiplier.

    The campus is fully closed between 21:00 and 06:00 (activity 0 -> zero
    occupancy), which is exactly when "high use with no occupants" is wasteful.
    """
    if 6 <= hour < 8:  # morning ramp
        return 0.15 + (hour - 6) * 0.35
    if 8 <= hour < 12:  # morning classes
        return 0.9
    if 12 <= hour < 14:  # lunch dip
        return 0.7
    if 14 <= hour < 17:  # afternoon classes
        return 0.95
    if 17 <= hour < 19:
        return 0.5
    if 19 <= hour < 21:
        return 0.35
    return 0.0  # closed: 21:00 -> 06:00


def anomaly_kind(dt: datetime) -> str:
    """Anomalies skew to energy spikes at night, as the campus powers down."""
    night = dt.hour >= 21 or dt.hour < 6
    return random.choice(SPIKE_HEAVY if night else DAY_HEAVY)


def _gauss(hour: float, center: float, width: float) -> float:
    return math.exp(-((hour - center) ** 2) / (2 * width * width))


def zone_activity(zone_type: str, dt: datetime) -> float:
    """Zone-specific activity, layering meal/evening peaks onto the base curve."""
    h = dt.hour + dt.minute / 60.0
    base = activity_factor(h)
    if zone_type in ("cafeteria", "mess", "kitchen"):
        peak = max(_gauss(h, 8.0, 1.0), _gauss(h, 13.0, 1.0), _gauss(h, 20.0, 1.0))
        return max(base, peak)
    if zone_type == "sports":
        return max(base, _gauss(h, 18.0, 2.5))
    if zone_type == "pool":
        return base * (1.0 if 7 <= h <= 19 else 0.1)
    if zone_type == "server":
        return 0.05
    return base


@dataclass
class SensorInfo:
    id: int
    type: str
    unit: str
    zone_id: int
    zone_type: str
    zone_name: str
    capacity: int


@dataclass
class Anomaly:
    kind: str
    ticks_left: int = 30
    magnitude: float = 0.0


@dataclass
class TickResult:
    samples: list[dict[str, Any]] = field(default_factory=list)
    ts: datetime = field(default_factory=datetime.now)


class Simulator:
    def __init__(self) -> None:
        self.sensors: list[SensorInfo] = []
        self.by_type: dict[str, list[SensorInfo]] = {}
        self.anomalies: dict[int, Anomaly] = {}
        self.bin_fill: dict[int, float] = {}
        self.tick_count = 0
        self._last_prune = 0

    # -- lifecycle ----------------------------------------------------------
    def load(self, db: Session) -> None:
        rows = (
            db.query(Sensor, Zone)
            .join(Zone, Sensor.zone_id == Zone.id)
            .all()
        )
        self.sensors = [
            SensorInfo(
                id=s.id,
                type=s.sensor_type,
                unit=s.unit,
                zone_id=z.id,
                zone_type=z.zone_type,
                zone_name=z.name,
                capacity=z.capacity,
            )
            for s, z in rows
        ]
        self.by_type = {}
        for info in self.sensors:
            self.by_type.setdefault(info.type, []).append(info)
            if info.type == "waste":
                self.bin_fill.setdefault(info.id, random.uniform(5, 45))
        logger.info("Simulator loaded %d sensors", len(self.sensors))

    # -- anomaly injection --------------------------------------------------
    def _inject_anomaly(self, dt: datetime) -> None:
        if len(self.anomalies) >= SIM_MAX_ANOMALIES:
            return
        if random.random() > SIM_ANOMALY_CHANCE:
            return
        kind = anomaly_kind(dt)
        pool = self.by_type.get(
            {"water_leak": "water", "energy_spike": "energy", "bin_overflow": "waste"}[kind]
        )
        if not pool:
            return
        target = random.choice(pool)
        if target.id in self.anomalies:
            return
        if kind == "water_leak":
            magnitude = random.uniform(9.0, 20.0)
        elif kind == "energy_spike":
            magnitude = random.uniform(3.0, 6.0)  # multiplier of peak draw
        else:
            magnitude = random.uniform(92.0, 100.0)
        self.anomalies[target.id] = Anomaly(
            kind=kind,
            ticks_left=random.randint(20, 70),
            magnitude=magnitude,
        )
        logger.info(
            "Injected %s anomaly on sensor %d (%s / %s)",
            kind, target.id, target.zone_name, target.type,
        )

    def _expire_anomalies(self) -> None:
        for sid in [sid for sid, a in self.anomalies.items() if a.ticks_left <= 0]:
            self.anomalies.pop(sid, None)
        for a in self.anomalies.values():
            a.ticks_left -= 1

    # -- value synthesis ----------------------------------------------------
    @staticmethod
    def _noise(scale: float = 0.05) -> float:
        return max(0.2, random.gauss(1.0, scale))

    def _occupancy(self, info: SensorInfo, dt: datetime) -> float:
        activity = zone_activity(info.zone_type, dt)
        people = info.capacity * activity * random.uniform(0.65, 1.15)
        return max(0.0, round(people, 1))

    def _energy(self, info: SensorInfo, occupancy: float, dt: datetime) -> float:
        if info.zone_type == "server":
            base = ZONE_ENERGY["server"][0] * self._noise(0.03)
        else:
            standby, per_person = ZONE_ENERGY.get(info.zone_type, DEFAULT_ENERGY)
            base = (standby + per_person * occupancy) * self._noise()
        anomaly = self.anomalies.get(info.id)
        if anomaly and anomaly.kind == "energy_spike":
            standby, per_person = ZONE_ENERGY.get(info.zone_type, DEFAULT_ENERGY)
            peak = standby + per_person * max(info.capacity, 1)
            base = peak * anomaly.magnitude * self._noise(0.03)
        return round(base, 1)

    def _water(self, info: SensorInfo, occupancy: float) -> float:
        rate_base, per_person = ZONE_WATER.get(info.zone_type, DEFAULT_WATER)
        value = (rate_base + per_person * occupancy) * self._noise()
        anomaly = self.anomalies.get(info.id)
        if anomaly and anomaly.kind == "water_leak":
            # ~constant flow regardless of occupancy (real leaks barely fluctuate)
            value = anomaly.magnitude * self._noise(0.01)
        return round(max(0.0, value), 2)

    def _waste(self, info: SensorInfo, occupancy: float) -> float:
        fill = self.bin_fill.get(info.id, 10.0)
        anomaly = self.anomalies.get(info.id)
        if anomaly and anomaly.kind == "bin_overflow":
            fill = anomaly.magnitude
        else:
            rate = ZONE_WASTE.get(info.zone_type, DEFAULT_WASTE)
            fill += rate * occupancy + 0.02
            if fill >= 65 and random.random() < 0.05:  # collection crew empties the bin
                fill = random.uniform(2, 12)
        fill = min(100.0, max(0.0, fill))
        self.bin_fill[info.id] = fill
        return round(fill, 1)

    # -- tick ---------------------------------------------------------------
    def tick(self, db: Session, dt: datetime | None = None) -> TickResult:
        dt = dt or datetime.now()
        result = TickResult(ts=dt)
        self.tick_count += 1

        self._expire_anomalies()
        self._inject_anomaly(dt)

        occupancy_by_zone: dict[int, float] = {}
        # Occupancy first so energy/water can reference it.
        for info in self.by_type.get("occupancy", []):
            occupancy_by_zone[info.zone_id] = self._occupancy(info, dt)

        rows: list[SensorReading] = []
        for info in self.sensors:
            occupancy = occupancy_by_zone.get(info.zone_id, 0.0)
            if info.type == "occupancy":
                value = occupancy
            elif info.type == "energy":
                value = self._energy(info, occupancy, dt)
            elif info.type == "water":
                value = self._water(info, occupancy)
            elif info.type == "waste":
                value = self._waste(info, occupancy)
            else:
                continue

            rows.append(SensorReading(sensor_id=info.id, ts=dt, value=value))
            result.samples.append(
                {
                    "sensor_id": info.id,
                    "zone_id": info.zone_id,
                    "zone_type": info.zone_type,
                    "zone_name": info.zone_name,
                    "sensor_type": info.type,
                    "value": value,
                    "occupancy": occupancy,
                }
            )

        db.add_all(rows)
        db.query(Sensor).update({Sensor.last_seen_at: dt})
        self._maybe_prune(db, dt)
        return result

    def _maybe_prune(self, db: Session, dt: datetime) -> None:
        if self.tick_count - self._last_prune < 150:
            return
        self._last_prune = self.tick_count
        cutoff = dt - timedelta(hours=SIM_RETENTION_HOURS)
        db.execute(delete(SensorReading).where(SensorReading.ts < cutoff))


def reading_payload(result: TickResult) -> list[dict[str, Any]]:
    return [
        {
            "sensor_id": s["sensor_id"],
            "zone_id": s["zone_id"],
            "type": s["sensor_type"],
            "value": s["value"],
        }
        for s in result.samples
    ]


async def run_simulator() -> None:
    """Long-running task started from the app lifespan."""
    if not SIM_ENABLED:
        logger.info("Simulator disabled (VERDANT_SIM_ENABLED=0)")
        return

    simulator = Simulator()
    detector = Detector()
    with SessionLocal() as db:
        simulator.load(db)

    logger.info("Simulator running (interval=%.1fs)", SIM_INTERVAL_SECONDS)
    while True:
        started = time.monotonic()
        try:
            with SessionLocal() as db:
                result = simulator.tick(db)
                issues = detector.evaluate(db, result.samples, result.ts)
                db.commit()

            await manager.broadcast(
                "readings",
                {"ts": result.ts.isoformat(), "readings": reading_payload(result)},
            )
            for issue in issues:
                await manager.broadcast("issue:created", issue)
                await manager.broadcast("notification", issue["notification"])
        except asyncio.CancelledError:
            logger.info("Simulator stopped")
            raise
        except Exception:  # keep the loop alive across transient errors
            logger.exception("Simulator tick failed")

        elapsed = time.monotonic() - started
        await asyncio.sleep(max(0.0, SIM_INTERVAL_SECONDS - elapsed))
