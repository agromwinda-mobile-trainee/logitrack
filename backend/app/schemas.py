from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class VehicleCreate(BaseModel):
    label: str = Field(..., examples=["TRUCK-001"])
    plate_number: str = Field(..., examples=["1234-A-56"])
    driver_name: str | None = Field(None, examples=["Youssef"])


class VehicleOut(BaseModel):
    id: int
    label: str
    plate_number: str
    driver_name: str | None
    odometer_km: float
    next_service_km: float
    created_at: datetime

    class Config:
        from_attributes = True


class PositionOut(BaseModel):
    id: int
    vehicle_id: int
    lat: float
    lon: float
    speed_kmh: float
    heading_deg: float
    fuel_l_per_100km: float
    timestamp: datetime

    class Config:
        from_attributes = True


class PositionIn(BaseModel):
    """
    Ingestion GPS (véhicule -> API).

    Les champs `speed_kmh`, `heading_deg` et `fuel_l_per_100km` peuvent être
    absents si la source GPS ne les fournit pas.
    """

    vehicle_id: int
    lat: float
    lon: float
    speed_kmh: float | None = None
    heading_deg: float | None = None
    fuel_l_per_100km: float | None = None
    timestamp: datetime | None = None


class PositionInBatch(BaseModel):
    """
    Batch ingestion (plus efficace pour mobile/offline).
    """

    positions: list[PositionIn]


class GeoFenceCreate(BaseModel):
    name: str
    center_lat: float
    center_lon: float
    radius_m: float = 500.0


class GeoFenceOut(BaseModel):
    id: int
    name: str
    center_lat: float
    center_lon: float
    radius_m: float

    class Config:
        from_attributes = True


class RoutingNodeCreate(BaseModel):
    key: str = Field(..., examples=["CASA"])
    lat: float
    lon: float


class RoutingEdgeCreate(BaseModel):
    from_key: str
    to_key: str
    # coût “minutes” (fictif au sens réseau, mais réel pour l'algorithme)
    cost_minutes: float = Field(..., gt=0, examples=[180])


class RoutingNodeOut(BaseModel):
    id: int
    key: str
    lat: float
    lon: float

    class Config:
        from_attributes = True


class RoutingEdgeOut(BaseModel):
    id: int
    from_node_id: int
    to_node_id: int
    cost_minutes: float

    class Config:
        from_attributes = True


class MaintenanceCreate(BaseModel):
    kind: str = Field(..., examples=["revision"])
    notes: str | None = None
    cost_eur: float = 0.0
    odometer_km: float = 0.0


class MaintenanceOut(BaseModel):
    id: int
    vehicle_id: int
    kind: str
    notes: str | None
    cost_eur: float
    odometer_km: float
    created_at: datetime

    class Config:
        from_attributes = True


class DeliveryCreate(BaseModel):
    # Pour un compte client, `order_ref` est générée automatiquement par l'API.
    # Pour un admin, il peut être fourni (sinon généré aussi).
    order_ref: str | None = Field(None, examples=["CMD-2026-0001"])
    # Pour la création côté client, on attend des clés de hubs (ex: CASA, PARIS).
    origin: str = "CASA"
    destination: str = "TANGER_MED"
    # Réservé admin: l'assignation véhicule se fait côté exploitation, pas côté client.
    vehicle_id: int | None = None
    # Si absent, l'API calcule un ETA à partir du routage (ou fallback distance).
    eta_minutes: int | None = None
    # Réservé aux admins: rattacher la commande à un compte client
    client_user_id: int | None = None


class DeliveryOut(BaseModel):
    id: int
    order_ref: str
    status: str
    origin: str
    destination: str
    vehicle_id: int | None
    client_user_id: int | None
    eta_minutes: int
    last_update_at: datetime

    class Config:
        from_attributes = True


class UserRegister(BaseModel):
    email: str = Field(..., examples=["client@example.com"])
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    role: str

    class Config:
        from_attributes = True


class RoiInput(BaseModel):
    """
    Calculateur ROI (simple).

    On part des chiffres du brief:
    - 300k€/an de maintenance non optimisée
    - retard moyen 15% (on modélise un coût “retard” à saisir)
    - surconsommation carburant (coût carburant à saisir)
    """

    annual_maintenance_cost_eur: float = 300_000.0
    annual_fuel_cost_eur: float = 0.0
    annual_delay_cost_eur: float = 0.0
    target_savings_percent: float = 20.0
    dev_budget_eur: float = 60_000.0


class RoiOut(BaseModel):
    annual_total_cost_eur: float
    target_savings_eur: float
    payback_months: float
    roi_year_1_percent: float


class RouteOut(BaseModel):
    path: list[str]
    estimated_minutes: float | None = None
    message: str | None = None

