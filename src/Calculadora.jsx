import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase";
import { Plus, X, Copy, Lock, Unlock, RefreshCw, Save, FolderOpen, Trash2 } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const novaEntrada = () => ({ id: uid(), odd: "", stake: "" });

const novaCasa = (nome = "") => ({
  id: uid(),
  nome,
  comissao: "0",
  fixado: false,
  cashback_ativo: false,
  cashback_pct: "20",
  conversao_pct: "100",
  teto: "",
  entradas: [novaEntrada()],
});

const totaisCasa = (c) => {
  const totalStake = c.entradas.reduce((acc, e) => acc + Number(e.stake || 0), 0);
  const somaPonderada = c.entradas.reduce((acc, e) => acc + Number(e.stake || 0) * Number(e.odd || 0), 0);
  const oddMedia = totalStake > 0 ? somaPonderada / totalStake : 0;
  return { totalStake, oddMedia };
};

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
    layOdd: "", layComissao: "2.8", layStake: "",
    freebet: false, layManual: false,
    cashbackAtivo: false, cashbackPct: "20", conversaoPct: "100", teto: "",
    layCashbackAtivo: false, layCashbackPct: "15", layConversaoPct: "100", layTeto: "",
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

    const cashbackRaw = bl.cashbackAtivo ? backStake * (Number(bl.cashbackPct || 0) / 100) * (Number(bl.conversaoPct || 0) / 100) : 0;
    const cashbackTeto = bl.teto === "" ? Infinity : Number(bl.teto);
    const cashbackValor = Math.min(cashbackRaw, cashbackTeto);

    const layCashbackRate = bl.layCashbackAtivo ? (Number(bl.layCashbackPct || 0) / 100) * (Number(bl.layConversaoPct || 0) / 100) : 0;

    const divisor = layOdd - layComissao / 100 - layCashbackRate;
    const layStakeAuto = divisor > 0 ? (backStake * mBack - cashbackRaw) / divisor : 0;
    const layStake = bl.layManual ? Number(bl.layStake || 0) : layStakeAuto;

    const layCashbackTeto = bl.layTeto === "" ? Infinity : Number(bl.layTeto);
    const layCashbackValor = Math.min(layStake * layCashbackRate, layCashbackTeto);

    const liability = layStake * (layOdd - 1);
    const lucroSeSair = backStake * (backOdd - 1) * (1 - backComissao / 100) - liability + layCashbackValor;
    const lucroSeNaoSair = layStake * (1 - layComissao / 100) - (bl.freebet ? 0 : backStake) + cashbackValor;
    const apostaTotal = backStake + liability;

    return { layStakeAuto, layStake, liability, lucroSeSair, lucroSeNaoSair, apostaTotal, cashbackValor, layCashbackValor };
  }, [bl]);

  const carregarSalvos = useCallback(async () => {
    const { data } = await supabase.from("calculos").select("*").order("atualizado_em", { ascending: false });
    setSalvos(data || []);
  }, []);

  useEffect(() => { carregarSalvos(); }, [carregarSalvos]);

  const updateCasa = (id, patch) => setCasas((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCasa = () => setCasas((prev) => [...prev, novaCasa(`Casa ${prev.length + 1}`)]);
  const removeCasa = (id) => setCasas((prev) => (prev.length > 2 ? prev.filter((c) => c.id !== id) : prev));

  const addEntrada = (casaId) => setCasas((prev) => prev.map((c) => (c.id === casaId ? { ...c, entradas: [...c.entradas, novaEntrada()] } : c)));
  const removeEntrada = (casaId, entradaId) => setCasas((prev) => prev.map((c) => (c.id === casaId && c.entradas.length > 1 ? { ...c, entradas: c.entradas.filter((e) => e.id !== entradaId) } : c)));
  const updateEntrada = (casaId, entradaId, patch) => setCasas((prev) => prev.map((c) => (c.id === casaId ? { ...c, entradas: c.entradas.map((e) => (e.id === entradaId ? { ...e, ...patch } : e)) } : c)));

  const novoCalculo = () => {
    setCasas([novaCasa("Casa 1"), novaCasa("Casa 2"), novaCasa("Casa 3")]);
    setNomeCalculo("");
    setCalculoAtualId(null);
  };

  const salvar = async () => {
    setSaveState("saving");
    let calculoId = calculoAtualId;

    const camposBase = modo === "backlay"
      ? {
          modo: "backlay",
          back_odd: bl.backOdd === "" ? null : bl.backOdd,
          back_comissao: bl.backComissao === "" ? null : bl.backComissao,
          back_stake: bl.backStake === "" ? null : bl.backStake,
          lay_odd: bl.layOdd === "" ? null : bl.layOdd,
          lay_comissao: bl.layComissao === "" ? null : bl.layComissao,
          lay_stake: bl.layManual ? (bl.layStake === "" ? null : bl.layStake) : null,
          lay_manual: bl.layManual,
          freebet: bl.freebet,
          cashback_ativo: bl.cashbackAtivo,
          cashback_pct: bl.cashbackPct === "" ? null : bl.cashbackPct,
          conversao_pct: bl.conversaoPct === "" ? null : bl.conversaoPct,
          teto: bl.teto === "" ? null : bl.teto,
          lay_cashback_ativo: bl.layCashbackAtivo,
          lay_cashback_pct: bl.layCashbackPct === "" ? null : bl.layCashbackPct,
          lay_conversao_pct: bl.layConversaoPct === "" ? null : bl.layConversaoPct,
          lay_teto: bl.layTeto === "" ? null : bl.layTeto,
        }
      : { modo: "multiplas", stake_total_alvo: targetTotal };

    if (calculoId) {
      await supabase.from("calculos").update({ nome: nomeCalculo, ...camposBase, atualizado_em: new Date().toISOString() }).eq("id", calculoId);
      if (modo === "multiplas") await supabase.from("casas_calculo").delete().eq("calculo_id", calculoId);
    } else {
      const { data, error } = await supabase.from("calculos").insert({ nome: nomeCalculo || "Sem nome", ...camposBase }).select().single();
      if (error || !data) { setSaveState("error"); setTimeout(() => setSaveState("idle"), 1200); return; }
      calculoId = data.id;
      setCalculoAtualId(calculoId);
    }

    if (modo === "multiplas") {
      const rows = casas.map((c, i) => {
        const { totalStake, oddMedia } = totaisCasa(c);
        return {
          calculo_id: calculoId,
          ordem: i,
          nome: c.nome,
          odd: oddMedia || null,
          comissao: c.comissao === "" ? 0 : c.comissao,
          stake: totalStake || null,
          fixado: c.fixado,
          cashback_ativo: c.cashback_ativo,
          cashback_pct: c.cashback_pct === "" ? null : c.cashback_pct,
          conversao_pct: c.conversao_pct === "" ? null : c.conversao_pct,
          teto: c.teto === "" ? null : c.teto,
          entradas: c.entradas.map((e) => ({ odd: e.odd, stake: e.stake })),
        };
      });
      const { error: insErr } = await supabase.from("casas_calculo").insert(rows);
      setSaveState(insErr ? "error" : "saved");
    } else {
      setSaveState("saved");
    }
    setTimeout(() => setSaveState("idle"), 1200);
    carregarSalvos();
  };

  const carregar = async (calculoId) => {
    const { data: calc } = await supabase.from("calculos").select("*").eq("id", calculoId).single();
    if (!calc) return;

    setNomeCalculo(calc.nome || "");
    setCalculoAtualId(calc.id);

    if (calc.modo === "backlay") {
      setModo("backlay");
      setBl({
        backOdd: calc.back_odd ?? "",
        backComissao: calc.back_comissao ?? "0",
        backStake: calc.back_stake ?? "",
        layOdd: calc.lay_odd ?? "",
        layComissao: calc.lay_comissao ?? "2.8",
        layStake: calc.lay_stake ?? "",
        freebet: !!calc.freebet,
        layManual: !!calc.lay_manual,
        cashbackAtivo: !!calc.cashback_ativo,
        cashbackPct: calc.cashback_pct ?? "20",
        conversaoPct: calc.conversao_pct ?? "100",
        teto: calc.teto ?? "",
        layCashbackAtivo: !!calc.lay_cashback_ativo,
        layCashbackPct: calc.lay_cashback_pct ?? "15",
        layConversaoPct: calc.lay_conversao_pct ?? "100",
        layTeto: calc.lay_teto ?? "",
      });
    } else {
      setModo("multiplas");
      setTargetTotal(calc.stake_total_alvo ?? "1000");
      const { data: casasData } = await supabase.from("casas_calculo").select("*").eq("calculo_id", calculoId).order("ordem", { ascending: true });
      if (casasData) {
        setCasas(casasData.map((c) => ({
          id: c.id,
          nome: c.nome || "",
          comissao: c.comissao ?? "0",
          fixado: c.fixado,
          cashback_ativo: c.cashback_ativo,
          cashback_pct: c.cashback_pct ?? "20",
          conversao_pct: c.conversao_pct ?? "100",
          teto: c.teto ?? "",
          entradas: Array.isArray(c.entradas) && c.entradas.length
            ? c.entradas.map((e) => ({ id: uid(), odd: e.odd ?? "", stake: e.stake ?? "" }))
            : [{ id: uid(), odd: c.odd ?? "", stake: c.stake ?? "" }],
        })));
      }
    }
    setMostrarSalvos(false);
  };

  const excluirSalvo = async (calculoId, e) => {
    e.stopPropagation();
    await supabase.from("calculos").delete().eq("id", calculoId);
    if (calculoId === calculoAtualId) novoCalculo();
    carregarSalvos();
  };

  // ---------- cálculo (modo múltiplas casas) ----------
  const calc = useMemo(() => {
    const totais = casas.map((c) => totaisCasa(c));
    const m = casas.map((c, i) => 1 + (totais[i].oddMedia - 1) * (1 - Number(c.comissao || 0) / 100));
    const cRate = casas.map((c) => (c.cashback_ativo ? (Number(c.cashback_pct || 0) / 100) * (Number(c.conversao_pct || 0) / 100) : 0));
    const k = casas.map((_, i) => m[i] - cRate[i]);
    return { m, cRate, k, totais };
  }, [casas]);

  const autoBalancear = () => {
    const { k, totais } = calc;
    const anchorIdx = casas.findIndex((c, i) => c.fixado && totais[i].totalStake > 0);
    let targets;
    if (anchorIdx >= 0) {
      const K = k[anchorIdx] * totais[anchorIdx].totalStake;
      targets = casas.map((c, i) => (i === anchorIdx || c.fixado ? totais[i].totalStake : K / k[i]));
    } else {
      const somaInv = k.reduce((acc, ki) => acc + (ki > 0 ? 1 / ki : 0), 0);
      const K = Number(targetTotal || 0) / somaInv;
      targets = casas.map((c, i) => (c.fixado ? totais[i].totalStake : K / k[i]));
    }
    setCasas((prev) => prev.map((c, i) => {
      if (c.fixado) return c;
      const atual = totais[i].totalStake;
      const alvo = targets[i];
      if (atual > 0) {
        const fator = alvo / atual;
        return { ...c, entradas: c.entradas.map((e) => ({ ...e, stake: e.stake === "" ? "" : (Number(e.stake) * fator).toFixed(2) })) };
      }
      // sem stake ainda: joga tudo na primeira entrada
      return { ...c, entradas: c.entradas.map((e, idx) => (idx === 0 ? { ...e, stake: alvo.toFixed(2) } : e)) };
    }));
  };

  const resultados = useMemo(() => {
    const totais = calc.totais;
    const stakes = totais.map((t) => t.totalStake);
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
      const roi = stakeTotal ? (lucro / stakeTotal) * 100 : 0;
      return { id: c.id, nome: c.nome, oddMedia: totais[i].oddMedia, numEntradas: c.entradas.length, comissao: c.comissao, stake: stakes[i], cashbackPct: c.cashback_ativo ? c.cashback_pct : null, deficit, seguro, lucro, roi };
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
                <div style={{ fontSize: 13, color: "#e4e4e7" }}>
                  {s.nome || "Sem nome"}
                  <span style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px", borderRadius: 999, background: s.modo === "backlay" ? "rgba(248,113,113,.12)" : "rgba(45,212,191,.12)", color: s.modo === "backlay" ? "#f87171" : "#2dd4bf" }}>
                    {s.modo === "backlay" ? "back x lay" : "múltiplas"}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "#52525b" }} className="mono">{new Date(s.atualizado_em).toLocaleString("pt-BR")}</div>
              </div>
              <button onClick={(e) => excluirSalvo(s.id, e)} style={{ background: "none", border: "none", color: "#3f3f46" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

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

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 8, fontSize: 12, color: "#a1a1aa", cursor: "pointer" }}>
                <input type="checkbox" checked={bl.cashbackAtivo} onChange={(e) => updateBl({ cashbackAtivo: e.target.checked })} />
                O Back gera cashback se perder
              </label>
              {bl.cashbackAtivo && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(251,191,36,.2)", borderRadius: 8, padding: 10, background: "rgba(251,191,36,.02)" }}>
                  <Campo label="Cashback (%)"><input type="number" step="0.01" value={bl.cashbackPct} onChange={(e) => updateBl({ cashbackPct: e.target.value })} className="input-field" /></Campo>
                  <Campo label="Conversão (%)"><input type="number" step="0.01" value={bl.conversaoPct} onChange={(e) => updateBl({ conversaoPct: e.target.value })} className="input-field" /></Campo>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={bl.teto} onChange={(e) => updateBl({ teto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                  </div>
                </div>
              )}
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
              {bl.cashbackAtivo && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: "#71717a" }}>
                  Cashback estimado (se o Back perder): <span className="mono" style={{ color: "#fbbf24" }}>{fmt(blCalc.cashbackValor)}</span>
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 8, fontSize: 12, color: "#a1a1aa", cursor: "pointer" }}>
                <input type="checkbox" checked={bl.layCashbackAtivo} onChange={(e) => updateBl({ layCashbackAtivo: e.target.checked })} />
                O Lay gera cashback se perder
              </label>
              {bl.layCashbackAtivo && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(248,113,113,.2)", borderRadius: 8, padding: 10, background: "rgba(248,113,113,.02)" }}>
                  <Campo label="Cashback (%)"><input type="number" step="0.01" value={bl.layCashbackPct} onChange={(e) => updateBl({ layCashbackPct: e.target.value })} className="input-field" /></Campo>
                  <Campo label="Conversão (%)"><input type="number" step="0.01" value={bl.layConversaoPct} onChange={(e) => updateBl({ layConversaoPct: e.target.value })} className="input-field" /></Campo>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={bl.layTeto} onChange={(e) => updateBl({ layTeto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                  </div>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#71717a" }}>
                    Cashback estimado (se o Lay perder): <span className="mono" style={{ color: "#fbbf24" }}>{fmt(blCalc.layCashbackValor)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* resultado */}
          <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 18 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 14 }}>Resultado</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
              <Metric label="Aposta total" value={fmt(blCalc.apostaTotal)} />
              <Metric label="Responsabilidade (lay)" value={fmt(blCalc.liability)} color="#f87171" />
              <Metric
                label="Lucro se SAIR (back ganha)"
                value={fmt(blCalc.lucroSeSair)}
                sub={blCalc.apostaTotal ? `${((blCalc.lucroSeSair / blCalc.apostaTotal) * 100).toFixed(2)}%` : null}
                color={blCalc.lucroSeSair >= 0 ? "#34d399" : "#fb7185"}
              />
              <Metric
                label="Lucro se NÃO SAIR (lay ganha)"
                value={fmt(blCalc.lucroSeNaoSair)}
                sub={blCalc.apostaTotal ? `${((blCalc.lucroSeNaoSair / blCalc.apostaTotal) * 100).toFixed(2)}%` : null}
                color={blCalc.lucroSeNaoSair >= 0 ? "#34d399" : "#fb7185"}
              />
            </div>
          </div>
        </div>
      ) : (
      <>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 8 }}>
              <Campo label="Comissão (%)"><input type="number" step="0.01" value={c.comissao} onChange={(e) => updateCasa(c.id, { comissao: e.target.value })} placeholder="0" className="input-field" /></Campo>
            </div>

            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Entradas (odd + stake)
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
              {c.entradas.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="number" step="0.01" value={e.odd} onChange={(ev) => updateEntrada(c.id, e.id, { odd: ev.target.value })} placeholder="odd" className="input-field" style={{ width: 70 }} />
                  <input
                    type="number" step="0.01" value={e.stake}
                    disabled={!c.fixado && casas.some((x) => x.fixado)}
                    onChange={(ev) => updateEntrada(c.id, e.id, { stake: ev.target.value })}
                    placeholder="stake" className="input-field" style={{ flex: 1, opacity: !c.fixado && casas.some((x) => x.fixado) ? 0.4 : 1 }}
                  />
                  {c.entradas.length > 1 && (
                    <button onClick={() => removeEntrada(c.id, e.id)} style={{ background: "none", border: "none", color: "#3f3f46" }}><X size={13} /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => addEntrada(c.id)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2dd4bf", background: "none", border: "1px dashed rgba(45,212,191,.4)", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>
              <Plus size={11} /> adicionar entrada
            </button>

            {c.entradas.length > 1 && (
              <div style={{ fontSize: 11, color: "#71717a", marginBottom: 8 }} className="mono">
                Odd média: <span style={{ color: "#e4e4e7" }}>{totaisCasa(c).oddMedia.toFixed(4)}</span> · Stake total: <span style={{ color: "#e4e4e7" }}>{fmt(totaisCasa(c).totalStake)}</span>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={() => updateCasa(c.id, { fixado: !c.fixado })} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: c.fixado ? "#fbbf24" : "#27292e", color: c.fixado ? "#0b0d10" : "#a1a1aa", border: "none" }}>
                {c.fixado ? <Lock size={11} /> : <Unlock size={11} />} {c.fixado ? "Travada" : "Travar"}
              </button>
            </div>

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
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">
                    {l.oddMedia ? l.oddMedia.toFixed(l.numEntradas > 1 ? 4 : 2) : "-"}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">{l.comissao}%</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">{fmt(l.stake)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#c084fc" }} className="mono">{l.cashbackPct ? `${l.cashbackPct}%` : "-"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: l.deficit >= 0 ? "#34d399" : "#fb7185" }} className="mono">{l.deficit >= 0 ? "+" : ""}{fmt(l.deficit)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#38bdf8" }} className="mono">{l.seguro > 0 ? `+${fmt(l.seguro)}` : fmt(0)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, color: l.lucro >= 0 ? "#34d399" : "#fb7185" }} className="mono">
                    {l.lucro >= 0 ? "+" : ""}{fmt(l.lucro)}
                    <div style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.75 }}>{l.roi >= 0 ? "+" : ""}{l.roi.toFixed(2)}%</div>
                  </td>
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

function Metric({ label, value, sub, color = "#e4e4e7" }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#71717a", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 11, color, opacity: 0.75, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
