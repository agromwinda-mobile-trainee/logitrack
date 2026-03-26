import React, { useMemo, useState } from "react";
import { api, RoiOut } from "../api/client";

export function RoiPage() {
  const [maintenance, setMaintenance] = useState(300000);
  const [fuel, setFuel] = useState(420000);
  const [delay, setDelay] = useState(180000);
  const [savings, setSavings] = useState(20);
  const [budget, setBudget] = useState(60000);

  const [out, setOut] = useState<RoiOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = useMemo(() => maintenance + fuel + delay, [maintenance, fuel, delay]);

  async function onCompute() {
    setError(null);
    setOut(null);
    try {
      const res = await api.roi({
        annual_maintenance_cost_eur: maintenance,
        annual_fuel_cost_eur: fuel,
        annual_delay_cost_eur: delay,
        target_savings_percent: savings,
        dev_budget_eur: budget,
      });
      setOut(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid2" style={{ minHeight: 0 }}>
      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">ROI — Calculateur</div>
          {/* <div className="muted">Version simple (didactique)</div> */}
        </div>
        <div className="panelBody" style={{ display: "grid", gap: 10 }}>
          <div className="row">
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Coût maintenance (€/an)
              </div>
              <input className="input" type="number" value={maintenance} onChange={(e) => setMaintenance(Number(e.target.value))} />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Coût carburant (€/an)
              </div>
              <input className="input" type="number" value={fuel} onChange={(e) => setFuel(Number(e.target.value))} />
            </div>
          </div>

          <div className="row">
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Coût retards (€/an)
              </div>
              <input className="input" type="number" value={delay} onChange={(e) => setDelay(Number(e.target.value))} />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Budget dev (€)
              </div>
              <input className="input" type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
          </div>

          <div className="row">
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Économies cibles (%)
              </div>
              <input className="input" type="number" value={savings} onChange={(e) => setSavings(Number(e.target.value))} />
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Total coûts (€/an)
              </div>
              <input className="input" value={total} readOnly />
            </div>
          </div>

          <button className="btn btnPrimary" onClick={() => void onCompute()}>
            Calculer
          </button>

          {error ? <div style={{ color: "#CE2232" }}>{error}</div> : null}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">Résultats</div>
          <div className="muted">Ce que ça raconte</div>
        </div>
        <div className="panelBody">
          {out ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div className="pill" style={{ justifyContent: "space-between" }}>
                <span className="muted">Économies / an</span>
                <span style={{ fontWeight: 750, color: "#219E4A" }}>
                  {out.target_savings_eur.toLocaleString("fr-FR")} €
                </span>
              </div>
              <div className="pill" style={{ justifyContent: "space-between" }}>
                <span className="muted">Payback</span>
                <span style={{ fontWeight: 750 }}>{out.payback_months} mois</span>
              </div>
              <div className="pill" style={{ justifyContent: "space-between" }}>
                <span className="muted">ROI année 1</span>
                <span style={{ fontWeight: 750 }}>{out.roi_year_1_percent}%</span>
              </div>

              <div className="muted" style={{ lineHeight: 1.6 }}>
                Interprétation rapide:
                <ul>
                  <li>si le payback est &lt; 12 mois, le projet “se rembourse” en moins d’un an</li>
                  <li>le ROI année 1 compare économies vs budget (sans CAPEX/OPEX détaillés)</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="muted">Lance un calcul à gauche.</div>
          )}
        </div>
      </div>
    </div>
  );
}

