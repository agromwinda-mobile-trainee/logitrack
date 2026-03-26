import React, { useEffect, useMemo, useState } from "react";
import "./styles/theme.css";

import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ClientPage } from "./pages/ClientPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LiveMapPage } from "./pages/LiveMapPage";
import { LoginPage } from "./pages/LoginPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { RoiPage } from "./pages/RoiPage";
import { api, getToken, setToken, UserMe } from "./api/client";

type PageKey = "dashboard" | "map" | "maintenance" | "analytics" | "client" | "roi";

const NAV_ADMIN: Array<{ key: PageKey; label: string; hint: string }> = [
  { key: "dashboard", label: "Vue d'ensemble", hint: "Tableau de bord" },
  { key: "map", label: "Tracking", hint: "Carte temps réel" },
  { key: "maintenance", label: "Maintenance", hint: "Alertes & suivi" },
  { key: "analytics", label: "Analytics", hint: "Carburant & perf" },
  { key: "client", label: "Client", hint: "Commandes" },
  { key: "roi", label: "ROI", hint: "Plan d'économies" },
];

const NAV_CLIENT: Array<{ key: PageKey; label: string; hint: string }> = [
  { key: "client", label: "Espace client", hint: "Mes commandes" },
];

function Page({ page }: { page: PageKey }) {
  switch (page) {
    case "dashboard":
      return <DashboardPage />;
    case "map":
      return <LiveMapPage />;
    case "maintenance":
      return <MaintenancePage />;
    case "analytics":
      return <AnalyticsPage />;
    case "client":
      return <ClientPage />;
    case "roi":
      return <RoiPage />;
  }
}

export function App() {
  const [user, setUser] = useState<UserMe | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<PageKey>("dashboard");

  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!getToken()) {
        if (alive) setAuthLoading(false);
        return;
      }
      try {
        const me = await api.me();
        if (alive) {
          setUser(me);
          if (me.role === "client") setPage("client");
        }
      } catch {
        setToken(null);
      } finally {
        if (alive) setAuthLoading(false);
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, []);

  const nav = useMemo(() => (user?.role === "admin" ? NAV_ADMIN : NAV_CLIENT), [user?.role]);

  const title = useMemo(() => nav.find((n) => n.key === page)?.label ?? "LogiTrack", [page, nav]);
  const hint = useMemo(() => nav.find((n) => n.key === page)?.hint ?? "", [page, nav]);

  function logout() {
    setToken(null);
    setUser(null);
    setPage("dashboard");
  }

  if (authLoading) {
    return (
      <div className="app">
        <div className="muted" style={{ padding: 24 }}>
          Chargement…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app">
        <header className="topHeader">
          <div className="brand">
            <div className="brandMark" />
            <div>
              <div className="brandTitle">LOGITRACK</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Fleet Management
              </div>
            </div>
          </div>
        </header>
        <LoginPage
          onLoggedIn={(u) => {
            setUser(u);
            setPage(u.role === "client" ? "client" : "dashboard");
          }}
        />
        <footer className="appFooter">
          <div className="muted">© {new Date().getFullYear()} LOGITRACK</div>
        </footer>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topHeader">
        <div className="brand">
          <div className="brandMark" />
          <div>
            <div className="brandTitle">LOGITRACK</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {user.role === "admin" ? "Admin" : "Client"} — {user.email}
            </div>
          </div>
        </div>

        <nav className="topNav">
          {nav.map((n) => (
            <button
              key={n.key}
              className={`navBtn ${page === n.key ? "navBtnActive" : ""}`}
              onClick={() => setPage(n.key)}
              title={n.hint}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: page === n.key ? "#219E4A" : "rgba(17,24,39,0.18)",
                }}
              />
              <span style={{ fontWeight: 650 }}>{n.label}</span>
            </button>
          ))}
          <button className="btn" type="button" onClick={() => logout()}>
            Déconnexion
          </button>
        </nav>
      </header>

      <main className={`main ${page === "dashboard" && user.role === "admin" ? "main--dashboard" : ""}`}>
        <div className="pageHeader">
          <div>
            <div style={{ fontWeight: 820, fontSize: 18, letterSpacing: 0.2 }}>{title}</div>
            <div className="muted">{hint}</div>
          </div>
          <div className="pill">
            <div className="dotOk" />
            <span className="muted">Connecté</span>
          </div>
        </div>

        <Page page={page} />
      </main>

      <footer className="appFooter">
        <div className="muted">
          © {new Date().getFullYear()} LOGITRACK — Fleet Management. Donnees mises a jour via ingestion GPS.
        </div>
      </footer>
    </div>
  );
}
