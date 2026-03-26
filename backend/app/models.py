from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    # "admin" | "client"
    role: Mapped[str] = mapped_column(String(20), default="client", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    deliveries: Mapped[list["Delivery"]] = relationship(back_populates="client_user")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    plate_number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    driver_name: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # Compteurs “maintenance”
    odometer_km: Mapped[float] = mapped_column(Float, default=0.0)
    next_service_km: Mapped[float] = mapped_column(Float, default=15000.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    positions: Mapped[list["Position"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    maintenances: Mapped[list["MaintenanceEvent"]] = relationship(
        back_populates="vehicle", cascade="all, delete-orphan"
    )
    deliveries: Mapped[list["Delivery"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)

    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[float] = mapped_column(Float, default=0.0)
    heading_deg: Mapped[float] = mapped_column(Float, default=0.0)

    # Carburant: litres/100km (si non fourni, valeur par défaut).
    fuel_l_per_100km: Mapped[float] = mapped_column(Float, default=24.0)

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="positions")


class GeoFence(Base):
    __tablename__ = "geofences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    # Géofencing: cercle (centre + rayon). PostGIS peut être utilisé en distance sphérique.
    center_lat: Mapped[float] = mapped_column(Float)
    center_lon: Mapped[float] = mapped_column(Float)
    radius_m: Mapped[float] = mapped_column(Float, default=500.0)


class MaintenanceEvent(Base):
    __tablename__ = "maintenance_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(50))  # ex: "revision", "repair"
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_eur: Mapped[float] = mapped_column(Float, default=0.0)
    odometer_km: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="maintenances")


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_ref: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="in_transit")  # in_transit, delivered, delayed

    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    # Propriétaire métier (client) — les admins voient toutes les commandes.
    client_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    origin: Mapped[str] = mapped_column(String(120), default="Casablanca")
    destination: Mapped[str] = mapped_column(String(120), default="Tanger Med")

    eta_minutes: Mapped[int] = mapped_column(Integer, default=60)
    last_update_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="deliveries")
    client_user: Mapped["User | None"] = relationship(back_populates="deliveries")


class RoutingNode(Base):
    __tablename__ = "routing_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)


class RoutingEdge(Base):
    __tablename__ = "routing_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    from_node_id: Mapped[int] = mapped_column(ForeignKey("routing_nodes.id", ondelete="CASCADE"), index=True)
    to_node_id: Mapped[int] = mapped_column(ForeignKey("routing_nodes.id", ondelete="CASCADE"), index=True)
    cost_minutes: Mapped[float] = mapped_column(Float)

