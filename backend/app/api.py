from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select, text
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user, require_admin
from app.auth_utils import create_access_token, hash_password, verify_password
from app.db import get_db
from app.models import Delivery, GeoFence, MaintenanceEvent, Position, RoutingEdge, RoutingNode, User, Vehicle
from app.schemas import (
    DeliveryCreate,
    DeliveryOut,
    GeoFenceCreate,
    GeoFenceOut,
    MaintenanceCreate,
    MaintenanceOut,
    PositionOut,
    PositionIn,
    PositionInBatch,
    RoiInput,
    RoiOut,
    RoutingEdgeCreate,
    RoutingNodeCreate,
    RouteOut,
    RoutingEdgeOut,
    RoutingNodeOut,
    TokenOut,
    UserLogin,
    UserOut,
    UserRegister,
    VehicleCreate,
    VehicleOut,
)
from app.services.geo import haversine_distance_km, point_inside_circle
from app.services.routing import dijkstra

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# -------------------------
# Auth (rôles admin / client)
# -------------------------


@router.post("/auth/register", response_model=UserOut)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> User:
    """Inscription réservée aux comptes client (pas d'admin via cette route)."""
    email = payload.email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="Email déjà utilisé.")
    u = User(email=email, hashed_password=hash_password(payload.password), role="client")
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.post("/auth/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> TokenOut:
    email = payload.email.strip().lower()
    u = db.scalar(select(User).where(User.email == email))
    if not u or not verify_password(payload.password, u.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    token = create_access_token(str(u.id), extra={"role": u.role})
    return TokenOut(access_token=token)


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


# -------------------------
# Vehicles
# -------------------------


@router.post("/vehicles", response_model=VehicleOut)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Vehicle:
    existing = db.scalar(select(Vehicle).where((Vehicle.label == payload.label) | (Vehicle.plate_number == payload.plate_number)))
    if existing:
        raise HTTPException(status_code=409, detail="Véhicule déjà existant (label ou plaque).")

    v = Vehicle(label=payload.label, plate_number=payload.plate_number, driver_name=payload.driver_name)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.get("/vehicles", response_model=list[VehicleOut])
def list_vehicles(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[Vehicle]:
    return list(db.scalars(select(Vehicle).order_by(Vehicle.id)))


# -------------------------
# Tracking / positions
# -------------------------


@router.get("/tracking/latest", response_model=list[PositionOut])
def latest_positions(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[Position]:
    """
    Retourne une position “dernière connue” par véhicule.

    Pour rester “simple” mais scalable, on utilise une requête unique:
    `DISTINCT ON (vehicle_id)` (PostgreSQL) + tri par timestamp desc.
    """
    return list(
        db.scalars(
            select(Position)
            .distinct(Position.vehicle_id)
            .order_by(Position.vehicle_id, desc(Position.timestamp))
        )
    )


@router.get("/tracking/history/{vehicle_id}", response_model=list[PositionOut])
def position_history(
    vehicle_id: int, minutes: int = 120, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> list[Position]:
    since = datetime.now(tz=timezone.utc) - timedelta(minutes=minutes)
    return list(
        db.scalars(
            select(Position)
            .where(Position.vehicle_id == vehicle_id, Position.timestamp >= since)
            .order_by(Position.timestamp)
        )
    )


@router.post("/tracking/positions", response_model=PositionOut)
def ingest_position(payload: PositionIn, db: Session = Depends(get_db)) -> Position:
    """
    Ingestion d'une position GPS.

    C’est l'entrée “réelle” attendue: un véhicule (ou l'app conducteur)
    envoie ses coordonnées à l’API.
    """

    vehicle = db.get(Vehicle, payload.vehicle_id)
    if not vehicle:
        # En production on ferait de la gestion d'identité (auth) + onboarding.
        # Pour garder le système simple, on auto-enregistre la ligne véhicule.
        vehicle = Vehicle(label=f"VEH-{payload.vehicle_id}", plate_number=f"PLATE-{payload.vehicle_id}")
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)

    last = db.scalar(select(Position).where(Position.vehicle_id == payload.vehicle_id).order_by(desc(Position.timestamp)).limit(1))
    if last:
        vehicle.odometer_km += haversine_distance_km(last.lat, last.lon, payload.lat, payload.lon)

    pos = Position(
        vehicle_id=payload.vehicle_id,
        lat=payload.lat,
        lon=payload.lon,
        speed_kmh=payload.speed_kmh if payload.speed_kmh is not None else 0.0,
        heading_deg=payload.heading_deg if payload.heading_deg is not None else 0.0,
        fuel_l_per_100km=payload.fuel_l_per_100km if payload.fuel_l_per_100km is not None else 24.0,
        timestamp=payload.timestamp,
    )
    db.add(pos)
    db.add(vehicle)
    db.commit()
    db.refresh(pos)
    return pos


@router.post("/tracking/positions/batch", response_model=list[PositionOut])
def ingest_positions_batch(payload: PositionInBatch, db: Session = Depends(get_db)) -> list[Position]:
    """
    Ingestion batch: utile quand le mobile est offline et “flush” plus tard.
    """

    out: list[Position] = []
    for p in payload.positions:
        out.append(ingest_position(p, db))
    return out


# -------------------------
# Geofencing
# -------------------------


@router.post("/geofences", response_model=GeoFenceOut)
def create_geofence(
    payload: GeoFenceCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> GeoFence:
    existing = db.scalar(select(GeoFence).where(GeoFence.name == payload.name))
    if existing:
        raise HTTPException(status_code=409, detail="Geofence déjà existante (nom).")
    g = GeoFence(**payload.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.get("/geofences", response_model=list[GeoFenceOut])
def list_geofences(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[GeoFence]:
    return list(db.scalars(select(GeoFence).order_by(GeoFence.id)))


@router.get("/geofences/check/{vehicle_id}")
def check_geofences(vehicle_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    last = db.scalar(select(Position).where(Position.vehicle_id == vehicle_id).order_by(desc(Position.timestamp)).limit(1))
    if not last:
        raise HTTPException(status_code=404, detail="Aucune position pour ce véhicule.")

    inside = []
    try:
        # PostGIS: distance sphérique + filtre rayon (simple et efficace).
        rows = db.execute(
            text(
                """
                SELECT id, name
                FROM geofences
                WHERE
                  ST_DistanceSphere(
                    ST_MakePoint(center_lon, center_lat),
                    ST_MakePoint(:lon, :lat)
                  ) <= radius_m
                """
            ),
            {"lat": last.lat, "lon": last.lon},
        ).fetchall()
        inside = [{"geofence_id": r.id, "name": r.name} for r in rows]
    except Exception:
        # Fallback simple: haversine en Python.
        geofences = list(db.scalars(select(GeoFence).order_by(GeoFence.id)))
        for g in geofences:
            if point_inside_circle(last.lat, last.lon, g.center_lat, g.center_lon, g.radius_m):
                inside.append({"geofence_id": g.id, "name": g.name})

    return {"vehicle_id": vehicle_id, "timestamp": last.timestamp, "inside": inside}


# -------------------------
# Maintenance
# -------------------------


@router.post("/vehicles/{vehicle_id}/maintenance", response_model=MaintenanceOut)
def add_maintenance(
    vehicle_id: int,
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> MaintenanceEvent:
    v = db.get(Vehicle, vehicle_id)
    if not v:
        raise HTTPException(status_code=404, detail="Véhicule introuvable.")

    ev = MaintenanceEvent(vehicle_id=vehicle_id, **payload.model_dump())
    # On garde les compteurs cohérents si l'événement fournit un odomètre.
    if payload.odometer_km and payload.odometer_km > v.odometer_km:
        v.odometer_km = payload.odometer_km
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/vehicles/{vehicle_id}/maintenance", response_model=list[MaintenanceOut])
def list_maintenance(
    vehicle_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> list[MaintenanceEvent]:
    return list(
        db.scalars(select(MaintenanceEvent).where(MaintenanceEvent.vehicle_id == vehicle_id).order_by(desc(MaintenanceEvent.created_at)))
    )


@router.get("/maintenance/alerts")
def maintenance_alerts(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    """
    Alertes simples: véhicule proche de la révision.
    """

    vehicles = list(db.scalars(select(Vehicle)))
    alerts = []
    for v in vehicles:
        remaining = v.next_service_km - v.odometer_km
        if remaining <= 1000:
            alerts.append(
                {
                    "vehicle_id": v.id,
                    "label": v.label,
                    "remaining_km": remaining,
                    "severity": "high" if remaining <= 200 else "medium",
                }
            )
    return {"alerts": alerts}


# -------------------------
# Client module (commandes)
# -------------------------


@router.post("/deliveries", response_model=DeliveryOut)
def create_delivery(payload: DeliveryCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Delivery:
    existing = db.scalar(select(Delivery).where(Delivery.order_ref == payload.order_ref))
    if existing:
        raise HTTPException(status_code=409, detail="Commande déjà existante (order_ref).")

    data = payload.model_dump()
    client_user_id: int | None = None
    if user.role == "client":
        client_user_id = user.id
    else:
        client_user_id = data.pop("client_user_id", None)

    d = Delivery(
        order_ref=data["order_ref"],
        origin=data.get("origin") or "Casablanca",
        destination=data.get("destination") or "Tanger Med",
        vehicle_id=data.get("vehicle_id"),
        eta_minutes=int(data.get("eta_minutes") or 60),
        client_user_id=client_user_id,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.get("/deliveries", response_model=list[DeliveryOut])
def list_deliveries(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Delivery]:
    if user.role == "admin":
        return list(db.scalars(select(Delivery).order_by(desc(Delivery.last_update_at))))
    return list(
        db.scalars(
            select(Delivery)
            .where(Delivery.client_user_id == user.id)
            .order_by(desc(Delivery.last_update_at))
        )
    )


@router.get("/client/track/{order_ref}", response_model=DeliveryOut)
def track_order(order_ref: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Delivery:
    d = db.scalar(select(Delivery).where(Delivery.order_ref == order_ref))
    if not d:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    if user.role != "admin" and d.client_user_id != user.id:
        raise HTTPException(status_code=403, detail="Accès refusé à cette commande.")
    return d


# -------------------------
# Optimisation — routage (Dijkstra)
# -------------------------


@router.post("/routing/nodes", response_model=RoutingNodeOut)
def create_routing_node(
    payload: RoutingNodeCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> RoutingNode:
    existing = db.scalar(select(RoutingNode).where(RoutingNode.key == payload.key))
    if existing:
        raise HTTPException(status_code=409, detail="Node de routage déjà existant.")
    node = RoutingNode(**payload.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.post("/routing/edges", response_model=RoutingEdgeOut)
def create_routing_edge(
    payload: RoutingEdgeCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
) -> RoutingEdge:
    from_node = db.scalar(select(RoutingNode).where(RoutingNode.key == payload.from_key))
    to_node = db.scalar(select(RoutingNode).where(RoutingNode.key == payload.to_key))
    if not from_node or not to_node:
        raise HTTPException(status_code=404, detail="Node de routage introuvable.")

    # Sur la base simple, on accepte plusieurs edges; dans un système réel on dédupliquerait.
    edge = RoutingEdge(from_node_id=from_node.id, to_node_id=to_node.id, cost_minutes=payload.cost_minutes)
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.get("/optimization/route", response_model=RouteOut)
def optimize_route(
    start_key: str = "CASA",
    goal_key: str = "PARIS",
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> RouteOut:
    """
    Calcul d'itinéraire: le graphe est configuré via `/routing/nodes` et `/routing/edges`.
    """

    nodes = list(db.scalars(select(RoutingNode)))
    node_by_key = {n.key.upper(): n for n in nodes}

    if not nodes:
        return RouteOut(path=[], estimated_minutes=None, message="Graphe de routage vide. Ajoute des nodes/edges.")

    edges = list(db.scalars(select(RoutingEdge)))
    if not edges:
        return RouteOut(path=[], estimated_minutes=None, message="Aucune edge de routage. Ajoute des edges.")

    graph: dict[str, list[tuple[str, float]]] = {}
    for n in nodes:
        graph[n.key.upper()] = []
    for e in edges:
        from_key = next((k for k, n in node_by_key.items() if n.id == e.from_node_id), None)
        to_key = next((k for k, n in node_by_key.items() if n.id == e.to_node_id), None)
        if from_key and to_key:
            graph[from_key].append((to_key, float(e.cost_minutes)))

    start = start_key.upper()
    goal = goal_key.upper()

    if start not in graph or goal not in graph:
        return RouteOut(path=[], estimated_minutes=None, message="Start/goal introuvables dans le graphe.")

    path = dijkstra(graph, start=start, goal=goal)
    if not path:
        return RouteOut(path=[], estimated_minutes=None, message="Pas de chemin trouvé.")

    estimated = _estimate_path_minutes(graph, path)
    return RouteOut(path=path, estimated_minutes=estimated, message=None)


def _estimate_path_minutes(graph: dict[str, list[tuple[str, float]]], path: list[str]) -> float:
    total = 0.0
    for a, b in zip(path, path[1:], strict=False):
        edge = next((w for v, w in graph.get(a, []) if v == b), None)
        if edge is None:
            return total
        total += edge
    return total


# -------------------------
# Analytics (simple)
# -------------------------


@router.get("/analytics/fuel")
def fuel_analytics(minutes: int = 240, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> dict:
    """
    Analytics volontairement simple:
    - moyenne conso sur une fenêtre de temps
    - top véhicules “qui consomment”
    """

    since = datetime.now(tz=timezone.utc) - timedelta(minutes=minutes)
    vehicles = list(db.scalars(select(Vehicle)))
    rows = []
    for v in vehicles:
        pts = list(
            db.scalars(
                select(Position)
                .where(Position.vehicle_id == v.id, Position.timestamp >= since)
                .order_by(desc(Position.timestamp))
                .limit(50)
            )
        )
        if not pts:
            continue
        avg = sum(p.fuel_l_per_100km for p in pts) / len(pts)
        rows.append({"vehicle_id": v.id, "label": v.label, "avg_fuel_l_per_100km": round(avg, 2)})

    rows.sort(key=lambda r: r["avg_fuel_l_per_100km"], reverse=True)
    return {"window_minutes": minutes, "vehicles": rows[:20]}


# -------------------------
# ROI
# -------------------------


@router.post("/roi", response_model=RoiOut)
def roi(payload: RoiInput, _: User = Depends(require_admin)) -> RoiOut:
    annual_total = payload.annual_maintenance_cost_eur + payload.annual_fuel_cost_eur + payload.annual_delay_cost_eur
    target_savings = annual_total * (payload.target_savings_percent / 100.0)

    # Payback (mois) = budget / économies mensuelles
    monthly_savings = target_savings / 12.0 if target_savings > 0 else 0.0
    payback_months = (payload.dev_budget_eur / monthly_savings) if monthly_savings > 0 else 0.0

    roi_year_1 = ((target_savings - payload.dev_budget_eur) / payload.dev_budget_eur * 100.0) if payload.dev_budget_eur > 0 else 0.0
    return RoiOut(
        annual_total_cost_eur=round(annual_total, 2),
        target_savings_eur=round(target_savings, 2),
        payback_months=round(payback_months, 2),
        roi_year_1_percent=round(roi_year_1, 2),
    )

