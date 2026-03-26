import React, { useEffect, useMemo, useState } from "react";
import { api, ClientLocation, Delivery } from "../api/client";

export function ClientPage() {
  const [clientName, setClientName] = useState(() => {
    try {
      return window.localStorage.getItem("clientProfileName") ?? "Client";
    } catch {
      return "Client";
    }
  });

  const [orderRef, setOrderRef] = useState("CMD-2026-0001"); // utilisé pour le suivi
  const [locations, setLocations] = useState<ClientLocation[]>([]);
  const [createOrigin, setCreateOrigin] = useState("CASA");
  const [createDestination, setCreateDestination] = useState("TANGER_MED");
  const [createdOrderRef, setCreatedOrderRef] = useState<string | null>(null);

  const [result, setResult] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function friendlyStatus(s: string) {
    switch (s) {
      case "in_transit":
        return "en cours";
      case "delayed":
        return "retard";
      case "delivered":
        return "livré";
      default:
        return s;
    }
  }

  function statusDotClass(status: string) {
    if (status === "delayed") return "dotBad";
    return "dotOk";
  }

  async function onTrackOrderRef(ref: string) {
    const clean = ref.trim();
    if (!clean) return;
    setError(null);
    setResult(null);
    try {
      const d = await api.clientTrack(clean);
      setOrderRef(clean);
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onTrack() {
    void onTrackOrderRef(orderRef);
  }

  async function onCreateAndTrack() {
    setCreateError(null);
    setError(null);
    setCreateLoading(true);
    setCreatedOrderRef(null);

    try {
      const payload = {
        // order_ref: générée automatiquement côté backend pour un client
        origin: createOrigin.trim() || undefined,
        destination: createDestination.trim() || undefined,
      } as const;

      const created = await api.createDelivery(payload);
      setCreatedOrderRef(created.order_ref);

      // Rafraîchit les notifications, puis ouvre le suivi.
      const out = await api.deliveries();
      setDeliveries(out);
      await onTrackOrderRef(created.order_ref);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setDeliveriesLoading(true);
        const [out, loc] = await Promise.all([api.deliveries(), api.clientLocations()]);
        if (!alive) return;
        setDeliveries(out);
        setLocations(loc.locations);
        // si le graphe est configuré, on pré-sélectionne la première/dernière si besoin
        if (loc.locations.length > 0) {
          const keys = new Set(loc.locations.map((l) => l.key));
          if (!keys.has(createOrigin)) setCreateOrigin(loc.locations[0].key);
          if (!keys.has(createDestination)) setCreateDestination(loc.locations[Math.min(1, loc.locations.length - 1)].key);
        }
      } catch (e) {
        // On ne bloque pas la page si la liste des notifications KO.
        // La zone "Suivi commande" reste utilisable via `Suivre`.
        if (!alive) return;
        // eslint-disable-next-line no-console
        console.warn(e);
      } finally {
        if (!alive) return;
        setDeliveriesLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("clientProfileName", clientName);
    } catch {
      // ignore
    }
  }, [clientName]);

  const deliveriesSummary = useMemo(() => {
    const inTransit = deliveries.filter((d) => d.status === "in_transit").length;
    const delayed = deliveries.filter((d) => d.status === "delayed").length;
    const delivered = deliveries.filter((d) => d.status === "delivered").length;
    return { inTransit, delayed, delivered };
  }, [deliveries]);

  return (
    <div className="grid2" style={{ minHeight: 0 }}>
      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">Client</div>
          <div className="muted">Temps réel</div>
        </div>
        <div className="panelBody" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="muted">Profil client</div>
            <label className="muted" style={{ fontSize: 12 }}>
              Nom
            </label>
            <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">Création d’une commande</div>
              <div className="muted">Numéro auto + ETA optimisé</div>
            </div>
            <div className="panelBody" style={{ display: "grid", gap: 10 }}>
              <div className="twoColGrid" style={{ gap: 10 }}>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Origine
                  </div>
                  <select className="input" value={createOrigin} onChange={(e) => setCreateOrigin(e.target.value)}>
                    {locations.length ? (
                      locations.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))
                    ) : (
                      <option value={createOrigin}>{createOrigin}</option>
                    )}
                  </select>
                </div>
                <div>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Destination
                  </div>
                  <select className="input" value={createDestination} onChange={(e) => setCreateDestination(e.target.value)}>
                    {locations.length ? (
                      locations.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))
                    ) : (
                      <option value={createDestination}>{createDestination}</option>
                    )}
                  </select>
                </div>
              </div>

              <button className="btn btnPrimary" onClick={() => void onCreateAndTrack()} disabled={createLoading}>
                {createLoading ? "Création..." : "Créer la commande"}
              </button>

              {createdOrderRef ? (
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Commande créée</span>
                  <span style={{ fontWeight: 850 }}>{createdOrderRef}</span>
                </div>
              ) : null}

              {createError ? <div style={{ color: "#CE2232" }}>{createError}</div> : null}
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                Le véhicule est assigné par l’exploitation. Le délai est estimé selon la distance et le chemin optimisé.
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">Suivi d’une commande</div>
              <div className="muted">Référence</div>
            </div>
            <div className="panelBody" style={{ display: "grid", gap: 10 }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Numéro de commande
                </div>
                <input className="input" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
              </div>
              <button className="btn btnPrimary" onClick={() => void onTrack()}>
                Suivre
              </button>
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

          {result ? (
            <div className="panel">
              <div className="panelHeader">
                <div className="panelTitle">Statut</div>
                <div className="pill">
                  <div className={statusDotClass(result.status)} />
                  <span className="muted">{friendlyStatus(result.status)}</span>
                </div>
              </div>
              <div className="panelBody" style={{ display: "grid", gap: 10 }}>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Commande</span>
                  <span style={{ fontWeight: 850 }}>{result.order_ref}</span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Origine</span>
                  <span style={{ fontWeight: 750 }}>{result.origin}</span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Destination</span>
                  <span style={{ fontWeight: 750 }}>{result.destination}</span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">ETA</span>
                  <span style={{ fontWeight: 750 }}>{result.eta_minutes} min</span>
                </div>
                <div className="pill" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Véhicule</span>
                  <span style={{ fontWeight: 750 }}>{result.vehicle_id ?? "Non assigné"}</span>
                </div>
                <div className="muted">
                  Dernière mise à jour: {new Date(result.last_update_at).toLocaleString("fr-FR")}
                </div>
              </div>
            </div>
          ) : (
            <div className="muted">
              Astuce: crée une commande (numéro auto), puis utilise le suivi.
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">Notifications</div>
          <div className="muted">Lecture</div>
        </div>
        <div className="panelBody">
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div className="pill" style={{ justifyContent: "space-between" }}>
                <span className="muted">En cours</span>
                <span style={{ fontWeight: 750 }}>{deliveriesSummary.inTransit}</span>
              </div>
              <div className="pill" style={{ justifyContent: "space-between" }}>
                <span className="muted">Retard</span>
                <span style={{ fontWeight: 750, color: "#CE2232" }}>{deliveriesSummary.delayed}</span>
              </div>
              <div className="pill" style={{ justifyContent: "space-between" }}>
                <span className="muted">Livrés</span>
                <span style={{ fontWeight: 750, color: "#219E4A" }}>{deliveriesSummary.delivered}</span>
              </div>
            </div>

            {deliveriesLoading ? (
              <div className="muted">Chargement des notifications...</div>
            ) : deliveries.length === 0 ? (
              <div className="muted">
                Aucune notification pour le moment. Crée une commande via `POST /api/deliveries`.
              </div>
            ) : (
              <div className="notifList" role="list">
                {deliveries.slice(0, 8).map((d) => (
                  <button
                    key={d.id}
                    className="notifItem"
                    type="button"
                    onClick={() => void onTrackOrderRef(d.order_ref)}
                    title="Ouvrir le suivi"
                  >
                    <div className="notifMain">
                      <div style={{ fontWeight: 850, letterSpacing: 0.2 }}>{d.order_ref}</div>
                      <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
                        {d.origin} → {d.destination}
                      </div>
                    </div>
                    <div className="notifSide">
                      <div className="pill" style={{ justifyContent: "space-between", padding: "6px 10px" }}>
                        <div className={statusDotClass(d.status)} />
                        <span className="muted" style={{ fontSize: 12 }}>
                          {friendlyStatus(d.status)}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                        ETA: {d.eta_minutes} min
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {new Date(d.last_update_at).toLocaleString("fr-FR")}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

