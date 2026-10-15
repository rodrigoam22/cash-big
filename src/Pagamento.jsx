import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase";
import { buscarCotacao, lerCache } from "./cotacao";
import { ChevronLeft, ChevronRight, Check, RotateCcw } from "lucide-react";

const OPERADOR = "Edilson";
const PERC_KEY = "cashbig_pag_perc";
const pad2 = (n) => String(n).padStart(2, "0");
const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v) => (Number(v) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function Pagamento() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [ops, setOps] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState(null);
  const [moeda, setMoeda] = useState("USD");
  const [perc, setPerc] = useState(() => { try { return localStorage.getItem(PERC_KEY) || "10"; } catch { return "10"; } });
  const [valorDigitado, setValorDigitado] = useState({ quinzena: "", fim: "" });

  useEffect(() => { try { localStorage.setItem(PERC_KEY, perc); } catch {} }, [perc]);

  useEffect(() => {
    const atualizar = async (forcar) => {
      if (!forcar) { const c = lerCache(); if (c) { setRate(c); return; } }
      try { setRate(await buscarCotacao()); } catch (e) { console.error("Erro ao buscar cotação", e); }
    };
    atualizar(false);
    const t = setInterval(() => atualizar(true), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const usdToBrl = rate?.value || 5;
  const fmt = (brl) => (moeda === "USD" ? fmtUSD((Number(brl) || 0) / usdToBrl) : fmtBRL(brl));
  const paraBRL = (v) => (moeda === "USD" ? Number(v) * usdToBrl : Number(v));
  const deBRL = (brl) => (moeda === "USD" ? brl / usdToBrl : brl);

  const mesKey = `${ano}-${pad2(mes + 1)}`;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dataQ = `${mesKey}-15`;
  const dataF = `${mesKey}-${pad2(ultimoDia)}`;

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("operacoes").select("data,lucro").eq("status", "finalizado").gte("data", `${mesKey}-01`).lte("data", dataF);
    setOps(data || []);
    const { data: pg } = await supabase.from("pagamentos_operador").select("*").order("mes", { ascending: false });
    setPagos(pg || []);
    setLoading(false);
  }, [mesKey, dataF]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudarMes = (delta) => {
    let m = mes + delta, a = ano;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setMes(m); setAno(a); setValorDigitado({ quinzena: "", fim: "" });
  };

  const calc = useMemo(() => {
    const lucroMes = ops.reduce((a, o) => a + Number(o.lucro || 0), 0);
    const lucroQ = ops.filter((o) => Number(String(o.data).slice(8, 10)) <= 15).reduce((a, o) => a + Number(o.lucro || 0), 0);
    const p = (Number(perc) || 0) / 100;
    const pagoQ = pagos.find((x) => x.mes === mesKey && x.parcela === "quinzena");
    const pagoF = pagos.find((x) => x.mes === mesKey && x.parcela === "fim");
    const quinzenaCalc = Math.max(0, lucroQ * (p / 2));
    const totalDevido = Math.max(0, lucroMes * p);
    const baseQ = pagoQ ? Number(pagoQ.valor_brl) : quinzenaCalc;
    const fimCalc = Math.max(0, totalDevido - baseQ);
    return { lucroMes, lucroQ, quinzenaCalc, fimCalc, totalDevido, pagoQ, pagoF, excedeu: baseQ > totalDevido + 0.005 };
  }, [ops, pagos, perc, mesKey]);

  const marcarPago = async (parcela, valorCalcBRL) => {
    const digitado = valorDigitado[parcela];
    const valorBRL = digitado !== "" && Number(digitado) >= 0 ? paraBRL(digitado) : valorCalcBRL;
    const { error } = await supabase.from("pagamentos_operador").insert({
      mes: mesKey, parcela, operador: OPERADOR,
      valor_brl: valorBRL, valor_usd: valorBRL / usdToBrl, cotacao: usdToBrl, pago_em: hojeStr(),
    });
    if (error) { alert("Erro ao registrar pagamento (rodou o SQL migration_pagamento_operador?): " + error.message); return; }
    setValorDigitado((p) => ({ ...p, [parcela]: "" }));
    carregar();
  };
  const desfazer = async (pg) => {
    if (!window.confirm("Desfazer o registro desse pagamento?")) return;
    const { error } = await supabase.from("pagamentos_operador").delete().eq("id", pg.id);
    if (error) { alert("Erro: " + error.message); return; }
    carregar();
  };

  const hj = hojeStr();
  const statusDe = (data, pago) => {
    if (pago) return { txt: `Pago em ${String(pago.pago_em).slice(8, 10)}/${String(pago.pago_em).slice(5, 7)}`, cor: "#00e676" };
    if (hj > data) return { txt: "Atrasado", cor: "#ff5a6a" };
    if (hj === data) return { txt: "Vence hoje", cor: "#f59e0b" };
    return { txt: "A vencer", cor: "#8b90b3" };
  };

  const Card = ({ titulo, data, valorCalc, pago, parcela, detalhe }) => {
    const st = statusDe(data, pago);
    const valorMostrado = pago ? Number(pago.valor_brl) : valorCalc;
    return (
      <div style={{ borderRadius: 14, border: `1px solid ${pago ? "rgba(0,230,118,.35)" : "#2a2f52"}`, background: "rgba(26,30,58,.9)", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{titulo}</div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: `${st.cor}22`, color: st.cor }}>{st.txt}</span>
        </div>
        <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 10 }} className="mono">vence {data.slice(8, 10)}/{data.slice(5, 7)}/{data.slice(0, 4)}</div>
        <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: pago ? "#00e676" : "#fafafa" }}>{fmt(valorMostrado)}</div>
        <div className="mono" style={{ fontSize: 11, color: "#6b7099", marginBottom: 10 }}>
          {moeda === "USD" ? fmtBRL(valorMostrado) : fmtUSD(valorMostrado / usdToBrl)}
          {pago && pago.cotacao ? ` · cotação do dia R$ ${Number(pago.cotacao).toFixed(2)}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 12 }}>{detalhe}</div>
        {pago ? (
          <button onClick={() => desfazer(pago)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, padding: "7px 12px", borderRadius: 8, background: "#1a1e3a", color: "#b4b9d6", border: "1px solid #2a2f52" }}>
            <RotateCcw size={12} /> desfazer registro
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="number" step="0.01" value={valorDigitado[parcela]}
              onChange={(e) => setValorDigitado((p) => ({ ...p, [parcela]: e.target.value }))}
              placeholder={`valor pago (${moeda === "USD" ? "US$" : "R$"}) — vazio = ${deBRL(valorCalc).toFixed(2)}`}
              className="input-field" style={{ flex: 1, minWidth: 160, fontSize: 12 }}
            />
            <button onClick={() => marcarPago(parcela, valorCalc)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "9px 14px", borderRadius: 8, background: "linear-gradient(135deg,#00e676,#00b85c)", color: "#0b0e1d", border: "none" }}>
              <Check size={14} /> Marcar como pago
            </button>
          </div>
        )}
      </div>
    );
  };

  const pagosDoMes = pagos.filter((x) => x.mes === mesKey);
  const totalPagoMes = pagosDoMes.reduce((a, x) => a + Number(x.valor_brl || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fafafa" }}>Pagamento {OPERADOR}</div>
          <div style={{ fontSize: 11.5, color: "#8b90b3" }}>Pago nos dias 15 e último do mês, sobre o lucro final das operações finalizadas.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 2, background: "#0b0e1d", border: "1px solid #2a2f52", borderRadius: 6, padding: 2 }}>
            {[["USD", "US$"], ["BRL", "R$"]].map(([m, l]) => (
              <button key={m} onClick={() => setMoeda(m)} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, border: "none", background: moeda === m ? "#00e676" : "transparent", color: moeda === m ? "#0b0e1d" : "#8b90b3" }}>{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => mudarMes(-1)} style={{ background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, color: "#b4b9d6", padding: 5, display: "flex" }}><ChevronLeft size={15} /></button>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fafafa", minWidth: 120, textAlign: "center" }}>{MESES[mes]} {ano}</div>
            <button onClick={() => mudarMes(1)} style={{ background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, color: "#b4b9d6", padding: 5, display: "flex" }}><ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ borderRadius: 12, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Lucro até o dia 15</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: calc.lucroQ >= 0 ? "#00e676" : "#ff5a6a" }}>{fmt(calc.lucroQ)}</div>
        </div>
        <div style={{ borderRadius: 12, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Lucro do mês</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: calc.lucroMes >= 0 ? "#00e676" : "#ff5a6a" }}>{fmt(calc.lucroMes)}</div>
        </div>
        <div style={{ borderRadius: 12, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Percentual do operador</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" step="0.5" value={perc} onChange={(e) => setPerc(e.target.value)} className="input-field" style={{ width: 80, fontSize: 15, fontWeight: 700 }} />
            <span style={{ color: "#8b90b3" }}>% do lucro do mês</span>
          </div>
        </div>
        <div style={{ borderRadius: 12, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Total devido no mês</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: "#fafafa" }}>{fmt(calc.totalDevido)}</div>
          <div style={{ fontSize: 10.5, color: "#6b7099" }}>já pago: {fmt(totalPagoMes)}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: "#6b7099", fontSize: 12 }}>carregando…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginBottom: 16 }}>
          {Card({
            titulo: "Quinzena (dia 15)", data: dataQ, valorCalc: calc.quinzenaCalc, pago: calc.pagoQ, parcela: "quinzena",
            detalhe: `Metade do percentual (${((Number(perc) || 0) / 2).toFixed(2).replace(/\.00$/, "")}%) sobre o lucro de 1 a 15: ${fmt(calc.lucroQ)}.`,
          })}
          {Card({
            titulo: "Fechamento (último dia)", data: dataF, valorCalc: calc.fimCalc, pago: calc.pagoF, parcela: "fim",
            detalhe: `${Number(perc) || 0}% do lucro do mês (${fmt(calc.lucroMes)}) = ${fmt(calc.totalDevido)}, menos o que foi pago na quinzena (${fmt(calc.pagoQ ? calc.pagoQ.valor_brl : calc.quinzenaCalc)}).`,
          })}
        </div>
      )}

      {calc.excedeu && (
        <div style={{ fontSize: 11.5, color: "#f59e0b", marginBottom: 14 }}>
          ⚠ O que foi pago na quinzena já passa do total devido hoje (o lucro do mês caiu). O fechamento fica em zero.
        </div>
      )}

      <div style={{ borderRadius: 12, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#fafafa", marginBottom: 8 }}>Histórico de pagamentos registrados</div>
        {pagos.length === 0 ? (
          <div style={{ fontSize: 11.5, color: "#6b7099" }}>Nenhum pagamento registrado ainda.</div>
        ) : pagos.slice(0, 24).map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #23274a", fontSize: 12.5, gap: 10 }}>
            <span style={{ color: "#e4e4e7" }}>{MESES[Number(String(x.mes).slice(5, 7)) - 1]} {String(x.mes).slice(0, 4)} · {x.parcela === "quinzena" ? "quinzena (dia 15)" : "fechamento"}</span>
            <span className="mono" style={{ color: "#8b90b3", fontSize: 11 }}>pago em {String(x.pago_em).slice(8, 10)}/{String(x.pago_em).slice(5, 7)}</span>
            <span className="mono" style={{ color: "#00e676", fontWeight: 700 }}>{fmt(x.valor_brl)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
