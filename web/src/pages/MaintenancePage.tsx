import React, { useEffect, useState } from "react";
import { api, MaintenanceAlert } from "../api/client";

export function MaintenancePage() {
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const out = await api.maintenanceAlerts();
        if (!alive) return;
        setAlerts(out.alerts);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">Maintenance — Alertes révision</div>
        <div className="muted">Seuil: ≤ 1000 km</div>
      </div>
      <div className="panelBody">
        {error ? <div style={{ color: "#CE2232" }}>{error}</div> : null}

        {alerts.length === 0 ? (
          <div className="muted">Aucune alerte pour le moment.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {alerts.map((a) => (
              <div key={a.vehicle_id} className="pill" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 750 }}>{a.label}</span>
                <span className="muted">
                  reste {Math.round(a.remaining_km)} km —{" "}
                  <span style={{ color: a.severity === "high" ? "#CE2232" : "#f6fffb" }}>{a.severity}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

