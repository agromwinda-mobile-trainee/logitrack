import React, { useMemo } from "react";

type Props = {
  value: number; // 0..100
  label: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function StatsWheel({ value, label }: Props) {
  const v = clamp(Math.round(value), 0, 100);

  const { color, toneText } = useMemo(() => {
    // Zoho-like: vert (OK), jaune (attention), rouge (risque).
    if (v >= 80) return { color: "#219E4A", toneText: "OK" };
    if (v >= 55) return { color: "#FFE004", toneText: "Attention" };
    return { color: "#CE2232", toneText: "Risque" };
  }, [v]);

  const size = 112;
  const r = 46;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - v / 100);

  return (
    <div style={{ width: size, height: size, display: "grid", placeItems: "center", position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="rgba(17, 24, 39, 0.10)"
          strokeWidth="10"
          fill="transparent"
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth="10"
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dashoffset 220ms ease, stroke 220ms ease" }}
        />
      </svg>
      <div style={{ position: "absolute", textAlign: "center" }}>
        <div style={{ fontWeight: 860, fontSize: 20, letterSpacing: 0.2 }}>{v}%</div>
        <div style={{ fontSize: 11, color: "rgba(17, 24, 39, 0.65)", marginTop: 2 }}>{toneText}</div>
        <div style={{ fontSize: 11, fontWeight: 650, marginTop: 6 }}>{label}</div>
      </div>
    </div>
  );
}

