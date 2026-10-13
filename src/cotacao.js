// Cotação de moedas: Binance (USDT/BRL e EUR/USDT) como fonte principal.
// Se a Binance falhar, cai pra uma cotação de referência (open.er-api.com).
export const RATE_CACHE_KEY = "cashbig_rate_v2";
export const RATE_MAX_AGE = 10 * 60 * 1000; // 10 min (a Binance muda a todo momento)

async function daBinance() {
  const symbols = encodeURIComponent('["USDTBRL","EURUSDT"]');
  const hosts = ["https://api.binance.com", "https://data-api.binance.vision"];
  let ultimoErro;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/v3/ticker/price?symbols=${symbols}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lista = await res.json();
      const preco = (s) => Number((lista.find((x) => x.symbol === s) || {}).price);
      const usdtBrl = preco("USDTBRL");
      const eurUsdt = preco("EURUSDT");
      if (!(usdtBrl > 0) || !(eurUsdt > 0)) throw new Error("resposta incompleta");
      // value = R$ por 1 US$ (USDT) · eur = € por 1 US$
      return { value: usdtBrl, eur: 1 / eurUsdt, fonte: "Binance" };
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro;
}

async function deReferencia() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  const data = await res.json();
  if (!data?.rates?.BRL) throw new Error("sem cotação");
  return { value: data.rates.BRL, eur: data.rates.EUR || 0.92, fonte: "referência (Binance indisponível)" };
}

export function lerCache() {
  try {
    const c = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
    if (c && c.eur && Date.now() - c.updatedAt < RATE_MAX_AGE) return c;
  } catch {}
  return null;
}

export async function buscarCotacao() {
  let dados;
  try { dados = await daBinance(); } catch (e) { console.warn("Binance indisponível, usando referência", e); dados = await deReferencia(); }
  const payload = { ...dados, updatedAt: Date.now() };
  try { localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(payload)); } catch {}
  return payload;
}
