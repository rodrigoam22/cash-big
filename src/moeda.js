// taxa = { usd: R$ por 1 US$, eur: € por 1 US$ }
export const SIMB = { BRL: "R$", USD: "US$", EUR: "€" };
export const MOEDAS = ["USD", "BRL", "EUR"];
const LOCALE = { BRL: "pt-BR", USD: "en-US", EUR: "de-DE" };

export const n = (v) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };

export function paraBRL(v, moeda, taxa) {
  const x = n(v);
  if (moeda === "USD") return x * taxa.usd;
  if (moeda === "EUR") return (x / taxa.eur) * taxa.usd;
  return x;
}
export function deBRL(v, moeda, taxa) {
  const x = n(v);
  if (moeda === "USD") return x / taxa.usd;
  if (moeda === "EUR") return (x / taxa.usd) * taxa.eur;
  return x;
}
export function fmtMoeda(v, moeda = "BRL") {
  return (n(v)).toLocaleString(LOCALE[moeda] || "pt-BR", { style: "currency", currency: moeda });
}
// formata um valor que está em R$ na moeda de visualização escolhida
export const fmtVis = (vBRL, vis, taxa) => fmtMoeda(deBRL(vBRL, vis, taxa), vis);
export const sinal = (v) => (n(v) > 0 ? "+" : "");

// Resultados possíveis de cada perna
export const RESULTADOS = [
  { v: "ganhou", label: "Ganhou", cor: "#00e676" },
  { v: "meio_ganhou", label: "½ Ganhou", cor: "#7dd87d" },
  { v: "anulada", label: "Anulada", cor: "#5ea8ff" },
  { v: "meio_perdeu", label: "½ Perdeu", cor: "#f59e0b" },
  { v: "perdeu", label: "Perdeu", cor: "#ff5a6a" },
  { v: "cashout", label: "Cashout", cor: "#22d3ee" },
];

// retorno (na moeda da perna) de uma perna conforme o resultado
export function retornoPerna(p) {
  const s = n(p.stake), o = n(p.odd);
  switch (p.resultado) {
    case "ganhou": return s * o;
    case "meio_ganhou": return (s / 2) * o + s / 2;
    case "anulada": return s;
    case "meio_perdeu": return s / 2;
    case "perdeu": return 0;
    case "cashout": return n(p.cashout); // valor recebido no cashout (moeda da perna)
    default: return null; // pendente
  }
}
// lucro/prejuízo da perna em R$ (usa a cotação gravada na surebet)
export function plPernaBRL(p, taxa) {
  const r = retornoPerna(p);
  if (r === null) return 0;
  return paraBRL(r - n(p.stake), p.moeda, taxa);
}

export const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
