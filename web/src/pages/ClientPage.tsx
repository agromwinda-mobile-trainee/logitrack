import React, { useEffect, useMemo, useState } from "react";
import { api, Delivery } from "../api/client";

export function ClientPage() {
  const [clientName, setClientName] = useState(() => {
    try {
      return window.localStorage.getItem("clientProfileName") ?? "Client";
    } catch {
      return "Client";
    }
  });

  const [orderRef, setOrderRef] = useState("CMD-2026-0001");
  const [createOrigin, setCreateOrigin] = useState("Casablanca");
  const [createDestination, setCreateDestination] = useState("Tanger Med");
  const [createEtaMinutes, setCreateEtaMinutes] = useState(60);
  const [createVehicleId, setCreateVehicleId] = useState<string>(""); // optionnel

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

    const ref = orderRef.trim();
    if (!ref) {
      setCreateLoading(false);
      setCreateError("Veuillez renseigner une référence de commande.");
      return;
    }

    let vehicle_id: number | null = null;
    const vehicleRaw = createVehicleId.trim();
    if (vehicleRaw) {
      const parsed = Number(vehicleRaw);
      vehicle_id = Number.isFinite(parsed) ? parsed : null;
    }

    try {
      const payload = {
        order_ref: ref,
        origin: createOrigin.trim() || undefined,
        destination: createDestination.trim() || undefined,
        eta_minutes: Number.isFinite(createEtaMinutes) ? createEtaMinutes : 60,
        vehicle_id,
      };

      await api.createDelivery(payload);

      // Rafraîchit les notifications, puis ouvre le suivi.
      const out = await api.deliveries();
      setDeliveries(out);
      await onTrackOrderRef(ref);
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
        const out = await api.deliveries();
        if (!alive) return;
        setDeliveries(out);
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
          <div className="panelTitle">Client — Suivi commande</div>
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

          <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
            <div className="pill" style={{ justifyContent: "space-between" }}>
              <span className="muted">Créer une commande</span>
              <span style={{ fontWeight: 750, color: "#0974B0" }}>et suivre</span>
            </div>

            <div className="twoColGrid" style={{ gap: 10 }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Référence commande
                </div>
                <input className="input" value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  ETA (minutes)
                </div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={createEtaMinutes}
                  onChange={(e) => setCreateEtaMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="twoColGrid" style={{ gap: 10 }}>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Origine
                </div>
                <input className="input" value={createOrigin} onChange={(e) => setCreateOrigin(e.target.value)} />
              </div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Destination
                </div>
                <input
                  className="input"
                  value={createDestination}
                  onChange={(e) => setCreateDestination(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div className="muted" style={{ marginBottom: 6 }}>
                Véhicule (optionnel)
              </div>
              <input
                className="input"
                type="number"
                placeholder="ex: 1"
                value={createVehicleId}
                onChange={(e) => setCreateVehicleId(e.target.value)}
              />
            </div>

            <button className="btn btnPrimary" onClick={() => void onCreateAndTrack()} disabled={createLoading}>
              {createLoading ? "Création..." : "Créer & suivre"}
            </button>
            {createError ? <div style={{ color: "#CE2232" }}>{createError}</div> : null}

            <button className="btn" onClick={() => void onTrack()}>
              Suivre (manuellement)
            </button>
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
              Astuce: utilise “Créer & suivre” ci-dessus pour générer une commande et afficher son statut.
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

