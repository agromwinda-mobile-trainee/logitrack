import React, { useEffect, useState } from "react";
import { api, FuelAnalyticsRow } from "../api/client";

export function AnalyticsPage() {
  const [rows, setRows] = useState<FuelAnalyticsRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const out = await api.fuelAnalytics(240);
        if (!alive) return;
        setRows(out.vehicles);
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
        <div className="panelTitle">Analytics — Consommation carburant</div>
        <div className="muted">Moyenne sur les dernières 4h (simple)</div>
      </div>
      <div className="panelBody">
        {error ? <div style={{ color: "#CE2232" }}>{error}</div> : null}

        {rows.length === 0 ? (
          <div className="muted">Pas encore de données. Ingestion GPS requise.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {rows.map((r, idx) => (
              <div key={r.vehicle_id} className="pill" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 750 }}>
                  #{idx + 1} {r.label}
                </span>
                <span className="muted">
                  {r.avg_fuel_l_per_100km.toFixed(1)} L/100km{" "}
                  <span style={{ color: r.avg_fuel_l_per_100km > 28 ? "#CE2232" : "#219E4A" }}>
                    {r.avg_fuel_l_per_100km > 28 ? "↑" : "OK"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

