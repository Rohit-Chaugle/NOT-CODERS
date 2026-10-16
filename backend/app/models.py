"""ORM models for the Verdant Twin digital twin.

Core schema: Building -> Zone -> Sensor -> SensorReading, plus Issue and
Notification. Positions (pos_x/pos_y/pos_z) are used by the 3D campus map.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now() -> datetime:
    """Naive local timestamp used consistently across the app."""
    return datetime.now()


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)


class Building(TimestampMixin, Base):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="academic", nullable=False)
    floors: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    area_m2: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # Ground-plane position on the 3D campus map.
    pos_x: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pos_z: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    energy_budget_kw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    zones: Mapped[list[Zone]] = relationship(
        back_populates="building", cascade="all, delete-orphan"
    )


class Zone(TimestampMixin, Base):
    __tablename__ = "zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    floor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    zone_type: Mapped[str] = mapped_column(String(32), default="classroom", nullable=False)
    area_m2: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Position on the 3D campus map (pos_y = height / floor level).
    pos_x: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pos_y: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pos_z: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    building: Mapped[Building] = relationship(back_populates="zones")
    sensors: Mapped[list[Sensor]] = relationship(
        back_populates="zone", cascade="all, delete-orphan"
    )
    issues: Mapped[list[Issue]] = relationship(back_populates="zone")


class Sensor(TimestampMixin, Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("zones.id"), nullable=False)
    # energy | water | waste | occupancy
    sensor_type: Mapped[str] = mapped_column(String(32), nullable=False)
    unit: Mapped[str] = mapped_column(String(16), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="online", nullable=False)
    installed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    zone: Mapped[Zone] = relationship(back_populates="sensors")
    readings: Mapped[list[SensorReading]] = relationship(
        back_populates="sensor", cascade="all, delete-orphan"
    )


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = (Index("ix_readings_sensor_ts", "sensor_id", "ts"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"), nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)

    sensor: Mapped[Sensor] = relationship(back_populates="readings")


class Issue(TimestampMixin, Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(primary_key=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("zones.id"), nullable=True)
    # waste_accumulation | energy_wastage | water_leakage | inefficient_usage
    type: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # low | medium | high | critical
    severity: Mapped[str] = mapped_column(String(16), default="medium", nullable=False, index=True)
    # open | resolved
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False, index=True)
    # sensor | vision
    source: Mapped[str] = mapped_column(String(16), default="sensor", nullable=False)
    sensor_id: Mapped[int | None] = mapped_column(ForeignKey("sensors.id"), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    zone: Mapped[Zone | None] = relationship(back_populates="issues")
    sensor: Mapped[Sensor | None] = relationship()
    notifications: Mapped[list[Notification]] = relationship(back_populates="issue")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    issue_id: Mapped[int | None] = mapped_column(ForeignKey("issues.id"), nullable=True)
    # info | warning | alert
    level: Mapped[str] = mapped_column(String(16), default="info", nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False, index=True)

    issue: Mapped[Issue | None] = relationship(back_populates="notifications")
