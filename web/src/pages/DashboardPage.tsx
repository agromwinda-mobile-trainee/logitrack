import React, { useEffect, useMemo, useState } from "react";
import { api, FuelAnalyticsRow, MaintenanceAlert, RoiOut } from "../api/client";
import { StatCard } from "../components/StatCard";
import { MonitoringMiniMap } from "../components/MonitoringMiniMap";
import { StatsWheel } from "../components/StatsWheel";

export function DashboardPage() {
  const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
  const [fuel, setFuel] = useState<FuelAnalyticsRow[]>([]);
  const [route, setRoute] = useState<{ path: string[]; estimated_minutes?: number; message?: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [roi, setRoi] = useState<RoiOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setRouteLoading(true);
        const [a, f, r] = await Promise.all([
          api.maintenanceAlerts(),
          api.fuelAnalytics(240),
          api.route("CASA", "PARIS"),
        ]);
        if (!alive) return;
        setAlerts(a.alerts);
        setFuel(f.vehicles);
        setRoute(r);
        setRouteLoading(false);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setRouteLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function compute() {
      try {
        const out = await api.roi({
          annual_maintenance_cost_eur: 300000,
          annual_fuel_cost_eur: 420000,
          annual_delay_cost_eur: 180000,
          target_savings_percent: 20,
          dev_budget_eur: 60000,
        });
        if (!alive) return;
        setRoi(out);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    compute();
    return () => {
      alive = false;
    };
  }, []);

  const alertsTone = useMemo(() => {
    if (alerts.length === 0) return "ok" as const;
    const hasHigh = alerts.some((a) => a.severity === "high");
    return hasHigh ? "bad" : "neutral";
  }, [alerts]);

  const worstFuel = useMemo(() => {
    if (!fuel.length) return undefined;
    return Math.max(...fuel.map((r) => r.avg_fuel_l_per_100km));
  }, [fuel]);

  const globalHealthPercent = useMemo(() => {
    const highCount = alerts.filter((a) => a.severity === "high").length;
    const mediumCount = alerts.filter((a) => a.severity === "medium").length;

    // Score maintenance: plus il y a d'alertes (surtout high), plus on pénalise.
    const maintenancePenalty = highCount * 25 + mediumCount * 10;
    const maintenanceHealth = Math.max(0, Math.min(100, 100 - maintenancePenalty));

    // Score carburant: on estime un risque à partir de la pire moyenne (L/100km).
    let fuelHealth = 60;
    if (typeof worstFuel === "number") {
      if (worstFuel >= 30) fuelHealth = 25;
      else if (worstFuel >= 28) fuelHealth = 45;
      else if (worstFuel >= 26) fuelHealth = 70;
      else fuelHealth = 88;
    }

    const blended = maintenanceHealth * 0.55 + fuelHealth * 0.45;
    return Math.round(blended);
  }, [alerts, worstFuel]);

  return (
    <div className="dashboardRoot">
      <div className="welcomeHero">
        <div className="welcomeHeroInner">
          <div>
            <div className="welcomeTitle">Bienvenue sur LOGITRACK</div>
            <div className="welcomeSub">Gestion de flotte intelligente : tracking, maintenance, analytics & routage.</div>
          </div>

          <div className="welcomeWheelWrap">
            <StatsWheel value={globalHealthPercent} label="Indice global" />
          </div>
        </div>
      </div>
      <div className="kpiRow">
        <StatCard
          title="Maintenance — alertes"
          value={`${alerts.length}`}
          hint={alerts.length ? "Véhicules proches révision" : "Tout est OK (sur la fenêtre actuelle)"}
          tone={alertsTone}
        />
        <StatCard
          title="Carburant — top conso"
          value={worstFuel ? `${worstFuel.toFixed(1)} L/100km` : "—"}
          hint={worstFuel ? "Pire moyenne (fenêtre 4h)" : "Pas de données (ingère des positions)"}
          tone={worstFuel && worstFuel > 28 ? "bad" : "neutral"}
        />
      </div>

      <div className="twoColGrid dashboardTwoColGrid">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">Optimisation — itinéraire</div>
            <div className="muted">CASA → PARIS</div>
          </div>
          <div className="panelBody">
            {route?.path?.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>
                  {route.path.join("  →  ")}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div className="pill">
                    <span className="muted">Étapes</span>
                    <span style={{ fontWeight: 750 }}>{route.path.length}</span>
                  </div>
                  <div className="pill">
                    <span className="muted">Durée</span>
                    <span style={{ fontWeight: 750 }}>
                      {typeof route.estimated_minutes === "number" ? `${route.estimated_minutes.toFixed(0)} min` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="muted">
                {routeLoading ? "Calcul itinéraire... (CASA → PARIS)" : route?.message ?? "Aucun itinéraire disponible"}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">ROI — estimation (simple)</div>
            <div className="muted">Objectif: 20%</div>
          </div>
          <div className="panelBody">
            {roi ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Coûts annuels</span>
                  <span style={{ fontWeight: 750 }}>{roi.annual_total_cost_eur.toLocaleString("fr-FR")} €</span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Économies cibles</span>
                  <span style={{ fontWeight: 750, color: "#219E4A" }}>
                    {roi.target_savings_eur.toLocaleString("fr-FR")} €
                  </span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Payback</span>
                  <span style={{ fontWeight: 750 }}>{roi.payback_months} mois</span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">ROI année 1</span>
                  <span style={{ fontWeight: 750 }}>{roi.roi_year_1_percent}%</span>
                </div>
              </div>
            ) : (
              <div className="muted">Calcul...</div>
            )}
          </div>
        </div>

        <div className="fullSpan">
          <MonitoringMiniMap />
        </div>
      </div>

      {error ? (
        <div className="panel" style={{ borderColor: "rgba(206,34,50,0.25)" }}>
          <div className="panelHeader">
            <div className="panelTitle" style={{ color: "#CE2232" }}>
              Erreur
            </div>
          </div>
          <div className="panelBody">{error}</div>
        </div>
      ) : null}
    </div>
  );
}

