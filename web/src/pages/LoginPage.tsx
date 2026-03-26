import React, { useState } from "react";
import { api, setToken, UserMe } from "../api/client";

type Props = {
  onLoggedIn: (user: UserMe) => void;
};

export function LoginPage({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await api.register(email.trim(), password);
        const tok = await api.login(email.trim(), password);
        setToken(tok.access_token);
        const me = await api.me();
        onLoggedIn(me);
      } else {
        const tok = await api.login(email.trim(), password);
        setToken(tok.access_token);
        const me = await api.me();
        onLoggedIn(me);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginWrap">
      <div className="loginIntro">
        <div className="loginTitle">Bienvenue sur LOGITRACK</div>
        <div className="loginSub">
          Pilotez votre flotte en temps reel, reduisez les retards et suivez les commandes clients depuis un seul espace.
        </div>
        <div className="loginBadgeRow">
          <div className="pill">
            <div className="dotOk" />
            <span className="muted">Tracking</span>
          </div>
          <div className="pill">
            <div className="dotOk" />
            <span className="muted">Maintenance</span>
          </div>
          <div className="pill">
            <div className="dotOk" />
            <span className="muted">Client</span>
          </div>
        </div>
      </div>
      <div className="panel loginCard">
        <div className="panelHeader">
          <div className="panelTitle">Connexion LOGITRACK</div>
          <div className="muted">{mode === "login" ? "Compte existant" : "Nouveau compte client"}</div>
        </div>
        <div className="panelBody" style={{ display: "grid", gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: 12 }}>
              Email
            </div>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: 12 }}>
              Mot de passe
            </div>
            <input
              className="input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <div style={{ color: "#CE2232", fontSize: 14 }}>{error}</div> : null}
          <button className="btn btnPrimary" type="button" disabled={loading} onClick={() => void submit()}>
            {loading ? "Connexion..." : mode === "login" ? "Se connecter" : "Créer le compte"}
          </button>
          <button className="btn" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Créer un compte client" : "Déjà inscrit ? Se connecter"}
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            Astuce: pour la presentation, connectez-vous avec un profil admin ou creez un profil client.
          </div>
        </div>
      </div>
    </div>
  );
}
