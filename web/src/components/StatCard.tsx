import React from "react";

type Props = {
  title: string;
  value: string;
  hint?: string;
  tone?: "ok" | "bad" | "neutral";
};

export function StatCard({ title, value, hint, tone = "neutral" }: Props) {
  const dotClass = tone === "ok" ? "dotOk" : tone === "bad" ? "dotBad" : undefined;

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">{title}</div>
        {dotClass ? <div className={dotClass} /> : <div className="muted">•</div>}
      </div>
      <div className="panelBody">
        <div style={{ fontSize: 28, fontWeight: 750, letterSpacing: 0.2 }}>{value}</div>
        {hint ? <div className="muted" style={{ marginTop: 6 }}>{hint}</div> : null}
      </div>
    </div>
  );
}

