import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase";
import { Plus, X, Copy, Lock, Unlock, RefreshCw, Save, FolderOpen, Trash2 } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const novaCasa = (nome = "") => ({
  id: uid(),
  nome,
  odd: "",
  comissao: "0",
  stake: "",
  fixado: false,
  cashback_ativo: false,
  cashback_pct: "20",
  conversao_pct: "100",
  teto: "",
});

export default function Calculadora() {
  const [modo, setModo] = useState("multiplas"); // "multiplas" | "backlay"
  const [casas, setCasas] = useState([novaCasa("Casa 1"), novaCasa("Casa 2"), novaCasa("Casa 3")]);
  const [targetTotal, setTargetTotal] = useState("1000");
  const [nomeCalculo, setNomeCalculo] = useState("");
  const [calculoAtualId, setCalculoAtualId] = useState(null);
  const [salvos, setSalvos] = useState([]);
  const [mostrarSalvos, setMostrarSalvos] = useState(false);
  const [saveState, setSaveState] = useState("idle");

  // ---------- modo Back x Lay ----------
  const [bl, setBl] = useState({
    backOdd: "", backComissao: "0", backStake: "100",
    layOdd: "", layComissao: "4.5", layStake: "",
    freebet: false, layManual: false,
  });
  const updateBl = (patch) => setBl((prev) => ({ ...prev, ...patch }));

  const blCalc = useMemo(() => {
    const backOdd = Number(bl.backOdd || 0);
    const backComissao = Number(bl.backComissao || 0);
    const backStake = Number(bl.backStake || 0);
    const layOdd = Number(bl.layOdd || 0);
    const layComissao = Number(bl.layComissao || 0);

    const mBack = bl.freebet
      ? (backOdd - 1) * (1 - backComissao / 100)
      : 1 + (backOdd - 1) * (1 - backComissao / 100);

    const divisor = layOdd - layComissao / 100;
    const layStakeAuto = divisor > 0 ? (backStake * mBack) / divisor : 0;
    const layStake = bl.layManual ? Number(bl.layStake || 0) : layStakeAuto;

    const liability = layStake * (layOdd - 1);
    const lucroSeSair = bl.freebet
      ? backStake * (backOdd - 1) * (1 - backComissao / 100) - liability
      : backStake * (backOdd - 1) * (1 - backComissao / 100) - liability;
    const lucroSeNaoSair = layStake * (1 - layComissao / 100) - (bl.freebet ? 0 : backStake);
    const apostaTotal = backStake + liability;

    return { layStakeAuto, layStake, liability, lucroSeSair, lucroSeNaoSair, apostaTotal };
  }, [bl]);

  const carregarSalvos = useCallback(async () => {
    const { data } = await supabase.from("calculos").select("*").order("atualizado_em", { ascending: false });
    setSalvos(data || []);
  }, []);

  useEffect(() => { carregarSalvos(); }, [carregarSalvos]);

  const updateCasa = (id, patch) => setCasas((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCasa = () => setCasas((prev) => [...prev, novaCasa(`Casa ${prev.length + 1}`)]);
  const removeCasa = (id) => setCasas((prev) => (prev.length > 2 ? prev.filter((c) => c.id !== id) : prev));

  const novoCalculo = () => {
    setCasas([novaCasa("Casa 1"), novaCasa("Casa 2"), novaCasa("Casa 3")]);
    setNomeCalculo("");
    setCalculoAtualId(null);
  };

  const salvar = async () => {
    setSaveState("saving");
    let calculoId = calculoAtualId;
    if (calculoId) {
      await supabase.from("calculos").update({ nome: nomeCalculo, stake_total_alvo: targetTotal, atualizado_em: new Date().toISOString() }).eq("id", calculoId);
      await supabase.from("casas_calculo").delete().eq("calculo_id", calculoId);
    } else {
      const { data, error } = await supabase.from("calculos").insert({ nome: nomeCalculo || "Sem nome", stake_total_alvo: targetTotal }).select().single();
      if (error || !data) { setSaveState("error"); setTimeout(() => setSaveState("idle"), 1200); return; }
      calculoId = data.id;
      setCalculoAtualId(calculoId);
    }
    const rows = casas.map((c, i) => ({
      calculo_id: calculoId,
      ordem: i,
      nome: c.nome,
      odd: c.odd === "" ? null : c.odd,
      comissao: c.comissao === "" ? 0 : c.comissao,
      stake: c.stake === "" ? null : c.stake,
      fixado: c.fixado,
      cashback_ativo: c.cashback_ativo,
      cashback_pct: c.cashback_pct === "" ? null : c.cashback_pct,
      conversao_pct: c.conversao_pct === "" ? null : c.conversao_pct,
      teto: c.teto === "" ? null : c.teto,
    }));
    const { error: insErr } = await supabase.from("casas_calculo").insert(rows);
    setSaveState(insErr ? "error" : "saved");
    setTimeout(() => setSaveState("idle"), 1200);
    carregarSalvos();
  };

  const carregar = async (calculoId) => {
    const { data: calc } = await supabase.from("calculos").select("*").eq("id", calculoId).single();
    const { data: casasData } = await supabase.from("casas_calculo").select("*").eq("calculo_id", calculoId).order("ordem", { ascending: true });
    if (calc) {
      setNomeCalculo(calc.nome || "");
      setTargetTotal(calc.stake_total_alvo ?? "1000");
      setCalculoAtualId(calc.id);
    }
    if (casasData) {
      setCasas(casasData.map((c) => ({
        id: c.id,
        nome: c.nome || "",
        odd: c.odd ?? "",
        comissao: c.comissao ?? "0",
        stake: c.stake ?? "",
        fixado: c.fixado,
        cashback_ativo: c.cashback_ativo,
        cashback_pct: c.cashback_pct ?? "20",
        conversao_pct: c.conversao_pct ?? "100",
        teto: c.teto ?? "",
      })));
    }
    setMostrarSalvos(false);
  };

  const excluirSalvo = async (calculoId, e) => {
    e.stopPropagation();
    await supabase.from("calculos").delete().eq("id", calculoId);
    if (calculoId === calculoAtualId) novoCalculo();
    carregarSalvos();
  };

  // ---------- cálculo ----------
  const calc = useMemo(() => {
    const m = casas.map((c) => 1 + (Number(c.odd || 0) - 1) * (1 - Number(c.comissao || 0) / 100));
    const cRate = casas.map((c) => (c.cashback_ativo ? (Number(c.cashback_pct || 0) / 100) * (Number(c.conversao_pct || 0) / 100) : 0));
    const k = casas.map((_, i) => m[i] - cRate[i]);
    return { m, cRate, k };
  }, [casas]);

  const autoBalancear = () => {
    const { k } = calc;
    const anchorIdx = casas.findIndex((c) => c.fixado && c.stake !== "");
    let stakes;
    if (anchorIdx >= 0) {
      const K = k[anchorIdx] * Number(casas[anchorIdx].stake);
      stakes = casas.map((c, i) => (i === anchorIdx || c.fixado ? Number(c.stake || 0) : K / k[i]));
    } else {
      const somaInv = k.reduce((acc, ki) => acc + (ki > 0 ? 1 / ki : 0), 0);
      const K = Number(targetTotal || 0) / somaInv;
      stakes = casas.map((c, i) => (c.fixado ? Number(c.stake || 0) : K / k[i]));
    }
    setCasas((prev) => prev.map((c, i) => (c.fixado ? c : { ...c, stake: stakes[i].toFixed(2) })));
  };

  const resultados = useMemo(() => {
    const stakes = casas.map((c) => Number(c.stake || 0));
    const stakeTotal = stakes.reduce((a, b) => a + b, 0);
    const { m } = calc;
    const cashbackValor = casas.map((c, i) => {
      if (!c.cashback_ativo) return 0;
      const raw = stakes[i] * (Number(c.cashback_pct || 0) / 100) * (Number(c.conversao_pct || 0) / 100);
      const teto = c.teto === "" ? Infinity : Number(c.teto);
      return Math.min(raw, teto);
    });
    const linhas = casas.map((c, i) => {
      const payout = stakes[i] * m[i];
      const deficit = payout - stakeTotal;
      const seguro = cashbackValor.reduce((acc, v, j) => (j === i ? acc : acc + v), 0);
      const lucro = deficit + seguro;
      return { id: c.id, nome: c.nome, odd: c.odd, comissao: c.comissao, stake: stakes[i], cashbackPct: c.cashback_ativo ? c.cashback_pct : null, deficit, seguro, lucro };
    });
    const lucros = linhas.map((l) => l.lucro);
    const pior = lucros.length ? Math.min(...lucros) : 0;
    const melhor = lucros.length ? Math.max(...lucros) : 0;
    const roiMin = stakeTotal ? (pior / stakeTotal) * 100 : 0;
    const roiMax = stakeTotal ? (melhor / stakeTotal) * 100 : 0;
    return { linhas, stakeTotal, pior, melhor, roiMin, roiMax };
  }, [casas, calc]);

  const temMultiplasFixadas = casas.filter((c) => c.fixado).length > 1;

  return (
    <div>
      {/* seletor de modo */}
      <div style={{ display: "flex", gap: 4, background: "#18181b", border: "1px solid #27292e", borderRadius: 999, padding: 3, width: "fit-content", marginBottom: 18 }}>
        <button
          onClick={() => setModo("multiplas")}
          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: modo === "multiplas" ? "#fbbf24" : "transparent", color: modo === "multiplas" ? "#0b0d10" : "#a1a1aa" }}
        >Múltiplas casas</button>
        <button
          onClick={() => setModo("backlay")}
          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: modo === "backlay" ? "#fbbf24" : "transparent", color: modo === "backlay" ? "#0b0d10" : "#a1a1aa" }}
        >Back x Lay (2 vias)</button>
      </div>

      {modo === "backlay" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 18 }}>
            {/* BACK */}
            <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#34d399", marginBottom: 10 }}>Back (a favor)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <Campo label="Odd"><input type="number" step="0.01" value={bl.backOdd} onChange={(e) => updateBl({ backOdd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
                <Campo label="Comissão (%)"><input type="number" step="0.01" value={bl.backComissao} onChange={(e) => updateBl({ backComissao: e.target.value })} className="input-field" /></Campo>
              </div>
              <Campo label="Stake"><input type="number" step="0.01" value={bl.backStake} onChange={(e) => updateBl({ backStake: e.target.value })} placeholder="0,00" className="input-field" /></Campo>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, color: "#a1a1aa", cursor: "pointer" }}>
                <input type="checkbox" checked={bl.freebet} onChange={(e) => updateBl({ freebet: e.target.checked })} />
                Essa é uma aposta grátis (freebet) — stake não é devolvida
              </label>
            </div>

            {/* LAY */}
            <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f87171", marginBottom: 10 }}>Lay (contra / exchange)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <Campo label="Odd"><input type="number" step="0.01" value={bl.layOdd} onChange={(e) => updateBl({ layOdd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
                <Campo label="Comissão (%)"><input type="number" step="0.01" value={bl.layComissao} onChange={(e) => updateBl({ layComissao: e.target.value })} className="input-field" /></Campo>
              </div>
              <Campo label="Stake (lay)">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="number" step="0.01"
                    value={bl.layManual ? bl.layStake : blCalc.layStakeAuto.toFixed(2)}
                    onChange={(e) => updateBl({ layManual: true, layStake: e.target.value })}
                    className="input-field"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => updateBl({ layManual: false, layStake: "" })}
                    title="recalcular automaticamente"
                    style={{ padding: 7, borderRadius: 6, border: "1px solid #27292e", background: bl.layManual ? "none" : "rgba(251,191,36,.12)", color: bl.layManual ? "#71717a" : "#fbbf24" }}
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </Campo>
              <div style={{ marginTop: 10, fontSize: 11.5, color: "#71717a" }}>
                Responsabilidade: <span className="mono" style={{ color: "#f87171" }}>{fmt(blCalc.liability)}</span>
              </div>
            </div>
          </div>

          {/* resultado */}
          <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 18 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 14 }}>Resultado</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
              <Metric label="Aposta total" value={fmt(blCalc.apostaTotal)} />
              <Metric label="Responsabilidade (lay)" value={fmt(blCalc.liability)} color="#f87171" />
              <Metric label="Lucro se SAIR (back ganha)" value={fmt(blCalc.lucroSeSair)} color={blCalc.lucroSeSair >= 0 ? "#34d399" : "#fb7185"} />
              <Metric label="Lucro se NÃO SAIR (lay ganha)" value={fmt(blCalc.lucroSeNaoSair)} color={blCalc.lucroSeNaoSair >= 0 ? "#34d399" : "#fb7185"} />
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* barra de salvar / carregar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          value={nomeCalculo}
          onChange={(e) => setNomeCalculo(e.target.value)}
          placeholder="nome desse cálculo (ex: Flamengo x Palmeiras)"
          className="input-field"
          style={{ maxWidth: 280 }}
        />
        <button onClick={salvar} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#fbbf24", color: "#0b0d10", border: "none" }}>
          <Save size={13} /> salvar
        </button>
        <button onClick={() => setMostrarSalvos((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#18181b", color: "#a1a1aa", border: "1px solid #27292e" }}>
          <FolderOpen size={13} /> salvos ({salvos.length})
        </button>
        <button onClick={novoCalculo} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "transparent", color: "#71717a", border: "1px dashed #3f3f46" }}>
          + novo cálculo
        </button>
        <span style={{ fontSize: 11, color: "#52525b" }} className="mono">
          {saveState === "saving" && "salvando…"}
          {saveState === "saved" && <span style={{ color: "#34d399" }}>salvo</span>}
          {saveState === "error" && <span style={{ color: "#fb7185" }}>erro ao salvar</span>}
        </span>
      </div>

      {mostrarSalvos && (
        <div style={{ border: "1px solid #27292e", borderRadius: 8, marginBottom: 18, overflow: "hidden" }}>
          {salvos.length === 0 && <div style={{ padding: 14, fontSize: 12, color: "#52525b" }}>Nenhum cálculo salvo ainda.</div>}
          {salvos.map((s) => (
            <div key={s.id} onClick={() => carregar(s.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1c1c1f", cursor: "pointer", background: s.id === calculoAtualId ? "rgba(251,191,36,.06)" : "transparent" }}>
              <div>
                <div style={{ fontSize: 13, color: "#e4e4e7" }}>{s.nome || "Sem nome"}</div>
                <div style={{ fontSize: 10.5, color: "#52525b" }} className="mono">{new Date(s.atualizado_em).toLocaleString("pt-BR")}</div>
              </div>
              <button onClick={(e) => excluirSalvo(s.id, e)} style={{ background: "none", border: "none", color: "#3f3f46" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {/* header casas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#71717a" }}>
          <span>Stake total alvo (se nenhuma stake estiver travada):</span>
          <input type="number" value={targetTotal} onChange={(e) => setTargetTotal(e.target.value)} className="input-field" style={{ width: 100 }} />
        </div>
        <button onClick={autoBalancear} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 500, background: "rgba(45,212,191,.12)", color: "#2dd4bf", border: "1px solid rgba(45,212,191,.3)" }}>
          <RefreshCw size={13} /> Auto-Balancear
        </button>
      </div>

      {/* cards das casas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14, marginBottom: 18 }}>
        {casas.map((c, idx) => (
          <div key={c.id} style={{ borderRadius: 10, border: `1px solid ${c.fixado ? "rgba(251,191,36,.4)" : "#27292e"}`, background: c.fixado ? "rgba(251,191,36,.03)" : "rgba(24,24,27,.4)", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "#2dd4bf" }}>Casa {idx + 1}</span>
              {casas.length > 2 && <button onClick={() => removeCasa(c.id)} style={{ background: "none", border: "none", color: "#3f3f46" }}><X size={14} /></button>}
            </div>

            <input value={c.nome} onChange={(e) => updateCasa(c.id, { nome: e.target.value })} placeholder="nome da casa" className="input-field" style={{ marginBottom: 10, fontWeight: 600, color: "#f4f4f5" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <Campo label="Odd"><input type="number" step="0.01" value={c.odd} onChange={(e) => updateCasa(c.id, { odd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
              <Campo label="Comissão (%)"><input type="number" step="0.01" value={c.comissao} onChange={(e) => updateCasa(c.id, { comissao: e.target.value })} placeholder="0" className="input-field" /></Campo>
            </div>

            <Campo label="Stake">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" step="0.01" value={c.stake} disabled={!c.fixado && casas.some((x) => x.fixado)} onChange={(e) => updateCasa(c.id, { stake: e.target.value })} placeholder="0,00" className="input-field" style={{ flex: 1, opacity: !c.fixado && casas.some((x) => x.fixado) ? 0.4 : 1 }} />
                <button onClick={() => navigator.clipboard?.writeText(c.stake)} title="copiar" style={{ padding: 7, borderRadius: 6, border: "1px solid #27292e", background: "none", color: "#71717a" }}><Copy size={12} /></button>
                <button onClick={() => updateCasa(c.id, { fixado: !c.fixado })} style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: c.fixado ? "#fbbf24" : "#27292e", color: c.fixado ? "#0b0d10" : "#a1a1aa", border: "none" }}>
                  {c.fixado ? <Lock size={11} /> : <Unlock size={11} />} {c.fixado ? "Travada" : "Travar"}
                </button>
              </div>
            </Campo>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 8, fontSize: 12, color: "#a1a1aa", cursor: "pointer" }}>
              <input type="checkbox" checked={c.cashback_ativo} onChange={(e) => updateCasa(c.id, { cashback_ativo: e.target.checked })} />
              Esta entrada gera cashback
            </label>

            {c.cashback_ativo && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(251,191,36,.2)", borderRadius: 8, padding: 10, background: "rgba(251,191,36,.02)" }}>
                <Campo label="Cashback (%)"><input type="number" step="0.01" value={c.cashback_pct} onChange={(e) => updateCasa(c.id, { cashback_pct: e.target.value })} className="input-field" /></Campo>
                <Campo label="Conversão (%)"><input type="number" step="0.01" value={c.conversao_pct} onChange={(e) => updateCasa(c.id, { conversao_pct: e.target.value })} className="input-field" /></Campo>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={c.teto} onChange={(e) => updateCasa(c.id, { teto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                </div>
              </div>
            )}
          </div>
        ))}

        <button onClick={addCasa} style={{ borderRadius: 10, border: "1px dashed #3f3f46", color: "#71717a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 120, background: "none" }}>
          <Plus size={18} /> <span style={{ fontSize: 11 }}>adicionar casa</span>
        </button>
      </div>

      {temMultiplasFixadas && (
        <div style={{ fontSize: 11.5, color: "rgba(251,191,36,.8)", marginBottom: 14 }}>
          Mais de uma stake travada — o equilíbrio perfeito entre todos os resultados pode não ser possível; a primeira travada é usada como referência.
        </div>
      )}

      {/* resumo */}
      <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 18 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 14 }}>Resultados</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 14, marginBottom: 18 }}>
          <Metric label="Stake Total" value={fmt(resultados.stakeTotal)} />
          <Metric label="Pior caso" value={fmt(resultados.pior)} color={resultados.pior >= 0 ? "#34d399" : "#fb7185"} />
          <Metric label="Melhor caso" value={fmt(resultados.melhor)} color="#34d399" />
          <Metric label="ROI min/max" value={`${resultados.roiMin.toFixed(2)}% / ${resultados.roiMax.toFixed(2)}%`} />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#71717a", borderBottom: "1px solid #27292e" }}>
                <th style={{ textAlign: "left", padding: "6px 4px", fontWeight: 500 }}>Mercado</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Odd</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Comissão</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Stake</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Cashback</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Déficit na mesa</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Seguro (cashback)</th>
                <th style={{ textAlign: "right", padding: "6px 4px", fontWeight: 500 }}>Lucro líquido final</th>
              </tr>
            </thead>
            <tbody>
              {resultados.linhas.map((l) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #1c1c1f" }}>
                  <td style={{ padding: "8px 4px", color: "#e4e4e7", fontWeight: 500 }}>{l.nome || "—"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">{l.odd || "-"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">{l.comissao}%</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">{fmt(l.stake)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#c084fc" }} className="mono">{l.cashbackPct ? `${l.cashbackPct}%` : "-"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: l.deficit >= 0 ? "#34d399" : "#fb7185" }} className="mono">{l.deficit >= 0 ? "+" : ""}{fmt(l.deficit)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#38bdf8" }} className="mono">{l.seguro > 0 ? `+${fmt(l.seguro)}` : fmt(0)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, color: l.lucro >= 0 ? "#34d399" : "#fb7185" }} className="mono">{l.lucro >= 0 ? "+" : ""}{fmt(l.lucro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function Metric({ label, value, color = "#e4e4e7" }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
