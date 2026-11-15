import React from "react";
import { DEMO } from "./config";
const DEMO_SEM_CONFIRM = DEMO;
import { SIMB } from "./moeda";

export const C = {
  card: { borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16 },
  label: { fontSize: 11, color: "#8b90b3", textTransform: "uppercase", letterSpacing: 0.5 },
  btnVerde: { padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: "linear-gradient(135deg,#00e676,#00b85c)", color: "#0b0e1d", border: "none" },
  btnCinza: { padding: "8px 14px", borderRadius: 8, fontSize: 12.5, background: "#1a1e3a", color: "#b4b9d6", border: "1px solid #2a2f52" },
  btnBanner: { fontSize: 11, padding: "6px 11px", borderRadius: 7, background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.12)" },
};

export const STATUS_CONTA = {
  ativa: { label: "Ativa", cor: "#00e676" },
  limitada: { label: "Limitada", cor: "#f59e0b" },
  bloqueada: { label: "Bloqueada", cor: "#ff5a6a" },
};

export const CORES_PERNA = ["#2f80c9", "#8e5bd6", "#d97706"];

export function Campo({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ ...C.label, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export function Seletor({ opcoes, value, onChange, small }) {
  return (
    <div style={{ display: "flex", gap: 2, background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, padding: 2, flexShrink: 0 }}>
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={{ padding: small ? "4px 8px" : "6px 10px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, border: "none", background: value === v ? "#00e676" : "transparent", color: value === v ? "#0b0e1d" : "#8b90b3" }}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function SeletorMoeda({ value, onChange, moedas = ["USD", "BRL", "EUR"], small }) {
  return <Seletor opcoes={moedas.map((m) => [m, SIMB[m]])} value={value} onChange={onChange} small={small} />;
}

export function Metrica({ label, valor, cor = "#e4e4e7", sub }) {
  return (
    <div style={C.card}>
      <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: cor }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: "#6b7099", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Modal({ titulo, onClose, children, largura = 520 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(5,7,16,.75)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 14px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: largura, background: "#151833", border: "1px solid #2a2f52", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fafafa", marginBottom: 14 }}>{titulo}</div>
        {children}
      </div>
    </div>
  );
}

export function Chip({ cor, children }) {
  return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: `${cor}22`, color: cor, border: `1px solid ${cor}55`, whiteSpace: "nowrap" }}>{children}</span>;
}

// confirmação (na prévia o navegador bloqueia o confirm, então segue direto)
export function confirmar(msg) {
  try {
    const r = window.confirm(msg);
    return r || DEMO_SEM_CONFIRM;
  } catch { return true; }
}
