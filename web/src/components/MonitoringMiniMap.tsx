import "leaflet/dist/leaflet.css";

import L from "leaflet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

import { api, GeoFence, Position, Vehicle } from "../api/client";

type Props = {
  title?: string;
  pollingMs?: number;
  showCautionSpeedKmh?: number;
};

export function MonitoringMiniMap({
  title = "Surveillance flotte",
  pollingMs = 8000,
  showCautionSpeedKmh = 80,
}: Props) {
  const [status, setStatus] = useState<{ ok: boolean; text: string }>({ ok: false, text: "Connexion..." });
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [geofences, setGeofences] = useState<GeoFence[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    void boot();
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
    void loadStatic();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let stop = false;

    async function tick() {
      if (stop) return;
      if (inFlightRef.current) return; // anti-chevauchement
      inFlightRef.current = true;

      try {
        const p = await api.latest();
        if (stop) return;
        setPositions(p);

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

    void tick();
    const id = window.setInterval(() => void tick(), pollingMs);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [pollingMs]);

  function centerNow() {
    if (!positions.length) return;
    const lat = positions.reduce((s, p) => s + p.lat, 0) / positions.length;
    const lon = positions.reduce((s, p) => s + p.lon, 0) / positions.length;
    setMapCenter([lat, lon]);
    autoCenterLockedRef.current = true;
  }

  const canvasRenderer = useMemo(() => L.canvas(), []);

  return (
    <div className="panel" style={{ minHeight: 0, height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="panelHeader">
        <div className="panelTitle">{title}</div>
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

      <div
        className="panelBody"
        style={{
          padding: 12,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minHeight: 0,
        }}
      >
        {error ? (
          <div style={{ color: "#CE2232", whiteSpace: "pre-wrap" }}>{error}</div>
        ) : null}

        <div style={{ flex: 1, minHeight: 280, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(17,24,39,0.10)" }}>
          <MapContainer center={mapCenter} zoom={5} style={{ height: "100%", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

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

              const isCaution = p.speed_kmh >= showCautionSpeedKmh;
              // Zoho-like: vert = normal, jaune = attention (au lieu de rouge “d’alarme”).
              const stroke = isCaution ? "#FFE004" : "#219E4A";

              return (
                <CircleMarker
                  key={v.id}
                  center={[p.lat, p.lon]}
                  radius={4.5}
                  pathOptions={{
                    color: stroke,
                    weight: 2,
                    fillColor: stroke,
                    fillOpacity: 0.22,
                  }}
                  renderer={canvasRenderer}
                >
                  <Popup>
                    <div style={{ fontWeight: 700 }}>{v.label}</div>
                    <div className="muted">Plaque: {v.plate_number}</div>
                    <div style={{ marginTop: 6 }}>
                      <div>Vitesse: {p.speed_kmh.toFixed(0)} km/h</div>
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
  );
}

