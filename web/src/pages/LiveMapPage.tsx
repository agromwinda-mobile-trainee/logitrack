import "leaflet/dist/leaflet.css";

import L from "leaflet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

import { api, GeoFence, Position, Vehicle } from "../api/client";
// Note: ici on utilise CircleMarker (vector canvas) pour alléger l'affichage.

type Status = { ok: boolean; text: string };

export function LiveMapPage() {
  const [status, setStatus] = useState<Status>({ ok: false, text: "Connexion..." });
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [geofences, setGeofences] = useState<GeoFence[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Centre stable: éviter que la carte “jitter” à chaque refresh.
  const [mapCenter, setMapCenter] = useState<[number, number]>([33.5731, -7.5898]);
  const autoCenterLockedRef = useRef(false);
  const inFlightRef = useRef(false);

  const posByVehicleId = useMemo(() => {
    const m = new Map<number, Position>();
    for (const p of positions) m.set(p.vehicle_id, p);
    return m;
  }, [positions]);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        await api.health();
        if (!alive) return;
        setStatus({ ok: true, text: "API OK" });
      } catch (e) {
        if (!alive) return;
        setStatus({ ok: false, text: "API KO" });
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    boot();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadStatic() {
      try {
        const [v, g] = await Promise.all([api.vehicles(), api.geofences()]);
        if (!alive) return;
        setVehicles(v);
        setGeofences(g);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    loadStatic();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let stop = false;

    async function tick() {
      try {
        if (inFlightRef.current) return; // Anti-chevauchement simple
        inFlightRef.current = true;
        const p = await api.latest();
        if (stop) return;
        setPositions(p);

        // Centre stable: on recentre une seule fois au premier tick qui a des données.
        if (!autoCenterLockedRef.current && p.length > 0) {
          const lat = p.reduce((s, x) => s + x.lat, 0) / p.length;
          const lon = p.reduce((s, x) => s + x.lon, 0) / p.length;
          setMapCenter([lat, lon]);
          autoCenterLockedRef.current = true;
        }
      } catch (e) {
        if (stop) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inFlightRef.current = false;
      }
    }

    // Premier chargement + polling (simple)
    void tick();
    const id = window.setInterval(() => void tick(), 6000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  function centerNow() {
    if (!positions.length) return;
    const lat = positions.reduce((s, p) => s + p.lat, 0) / positions.length;
    const lon = positions.reduce((s, p) => s + p.lon, 0) / positions.length;
    setMapCenter([lat, lon]);
    autoCenterLockedRef.current = true;
  }

  return (
    <div className="grid2" style={{ height: "100%" }}>
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="panelHeader">
          <div className="panelTitle">Tracking — Temps réel</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn btnPrimary" onClick={() => centerNow()} title="Centrer sur la flotte">
              Centrer
            </button>
            <div className="pill">
              <div className={status.ok ? "dotOk" : "dotBad"} />
              <span className="muted">{status.text}</span>
            </div>
          </div>
        </div>
          <div className="panelBody" style={{ height: "calc(100% - 54px)" }}>
          <div className="mapFrame">
            <MapContainer center={mapCenter} zoom={5} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {geofences.map((g) => (
                <Circle
                  key={g.id}
                  center={[g.center_lat, g.center_lon]}
                  radius={g.radius_m}
                pathOptions={{ color: "#219E4A", weight: 1, fillOpacity: 0.06 }}
                />
              ))}
              {vehicles.map((v) => {
                const p = posByVehicleId.get(v.id);
                if (!p) return null;

                const isCaution = p.speed_kmh > 80;
                const stroke = isCaution ? "#FFE004" : "#219E4A";
                return (
                  <CircleMarker
                    key={v.id}
                    center={[p.lat, p.lon]}
                    radius={5}
                    pathOptions={{
                      color: stroke,
                      weight: 2,
                      fillColor: stroke,
                      fillOpacity: 0.20,
                    }}
                    // Renderer canvas: bien plus léger que des DOM markers.
                    renderer={L.canvas()}
                  >
                    <Popup>
                      <div style={{ fontWeight: 700 }}>{v.label}</div>
                      <div className="muted">Plaque: {v.plate_number}</div>
                      <div style={{ marginTop: 6 }}>
                        <div>Vitesse: {p.speed_kmh.toFixed(0)} km/h</div>
                        <div>Conso: {p.fuel_l_per_100km.toFixed(1)} L/100km</div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {new Date(p.timestamp).toLocaleString("fr-FR")}
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </div>
      </div>

      <div className="panel" style={{ minHeight: 0 }}>
        <div className="panelHeader">
          <div className="panelTitle">Infos rapides</div>
          <button className="btn btnPrimary" onClick={() => window.location.reload()}>
            Rafraîchir
          </button>
        </div>
        <div className="panelBody">
          <div style={{ display: "grid", gap: 10 }}>
            <div className="pill" style={{ justifyContent: "space-between" }}>
              <span className="muted">Véhicules</span>
              <span style={{ fontWeight: 750 }}>{vehicles.length}</span>
            </div>
            <div className="pill" style={{ justifyContent: "space-between" }}>
              <span className="muted">Positions reçues</span>
              <span style={{ fontWeight: 750 }}>{positions.length}</span>
            </div>
            <div className="pill" style={{ justifyContent: "space-between" }}>
              <span className="muted">Geofences</span>
              <span style={{ fontWeight: 750 }}>{geofences.length}</span>
            </div>

            {error ? (
        <div className="panel" style={{ borderColor: "rgba(206,34,50,0.25)" }}>
                <div className="panelHeader">
            <div className="panelTitle" style={{ color: "#CE2232" }}>
                    Erreur
                  </div>
                </div>
                <div className="panelBody">
                  <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
                </div>
              </div>
            ) : (
              <div className="muted">
                Astuce: ingère des positions GPS (véhicules) et reviens ici.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

