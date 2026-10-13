import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase";
import { buscarCotacao, lerCache } from "./cotacao";
import { Plus, X, Copy, Lock, Unlock, RefreshCw, Save, FolderOpen, Trash2, Calculator, DollarSign, TrendingUp } from "lucide-react";

const uid = () => Math.random().toString(36).slice(2, 9);
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const fmt = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v) => (Number(v) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtEUR = (v) => (Number(v) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmtMoeda = (v, moeda) => (moeda === "USD" ? fmtUSD(v) : moeda === "EUR" ? fmtEUR(v) : fmt(v));
const sim = (m) => (m === "USD" ? "US$" : m === "EUR" ? "€" : "R$");


const novaEntrada = () => ({ id: uid(), odd: "", stake: "" });

const novaCasa = (nome = "") => ({
  id: uid(),
  nome,
  comissao: "0",
  moeda: "BRL",
  fixado: false,
  freebet: false,
  cashback_ativo: false,
  cashback_pct: "20",
  conversao_pct: "100",
  teto: "",
  pagamento_antecipado: "",
  selecao: "", // "mandante" | "empate" | "visitante" — pra conferência automática de resultado
  entradas: [novaEntrada()],
});

// totais na moeda NATIVA da própria casa — odd média não depende de moeda
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
  const [targetMoeda, setTargetMoeda] = useState("BRL");
  const [nomeCalculo, setNomeCalculo] = useState("");
  const [calculoAtualId, setCalculoAtualId] = useState(null);
  const [salvos, setSalvos] = useState([]);
  const [mostrarSalvos, setMostrarSalvos] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [saveErro, setSaveErro] = useState("");

  // ---------- cotação USD -> BRL ----------
  const [rate, setRate] = useState(null); // { value, updatedAt }
  const [rateLoading, setRateLoading] = useState(false);

  const fetchRate = useCallback(async (force = false) => {
    if (!force) {
      const cached = lerCache();
      if (cached) { setRate(cached); return; }
    }
    setRateLoading(true);
    try {
      setRate(await buscarCotacao());
    } catch (e) {
      console.error("Erro ao buscar cotação", e);
    }
    setRateLoading(false);
  }, []);

  useEffect(() => {
    fetchRate();
    const t = setInterval(() => fetchRate(true), 5 * 60 * 1000); // atualiza sozinho a cada 5 min
    return () => clearInterval(t);
  }, [fetchRate]);

  const usdToBrl = rate?.value || 5; // fallback razoável se a busca falhar
  const usdToEur = rate?.eur || 0.92;
  const eurToBrl = usdToBrl / usdToEur;
  const fator = (m) => (m === "USD" ? usdToBrl : m === "EUR" ? eurToBrl : 1);

  const [resultMoeda, setResultMoeda] = useState("BRL");
  const fmtR = (v) => (resultMoeda === "USD" ? fmtUSD((Number(v) || 0) / usdToBrl) : resultMoeda === "EUR" ? fmtEUR((Number(v) || 0) / eurToBrl) : fmt(v));
  const [conv, setConv] = useState({ valor: "", moeda: "USD", aberto: false });

  // ---------- modo Back x Lay ----------
  const [bl, setBl] = useState({
    backOdd: "", backComissao: "0", backStake: "100", backMoeda: "BRL",
    layOdd: "", layComissao: "2.8", layMoeda: "BRL",
    layEntradas: [],
    freebet: false,
    cashbackAtivo: false, cashbackPct: "20", conversaoPct: "100", teto: "",
    layCashbackAtivo: false, layCashbackPct: "15", layConversaoPct: "100", layTeto: "",
  });
  const updateBl = (patch) => setBl((prev) => ({ ...prev, ...patch }));
  const addLayEntrada = () => setBl((prev) => ({ ...prev, layEntradas: [...prev.layEntradas, novaEntrada()] }));
  const removeLayEntrada = (id) => setBl((prev) => ({ ...prev, layEntradas: prev.layEntradas.filter((e) => e.id !== id) }));
  const updateLayEntrada = (id, patch) => setBl((prev) => ({ ...prev, layEntradas: prev.layEntradas.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const blCalc = useMemo(() => {
    const backFator = fator(bl.backMoeda);
    const layFator = fator(bl.layMoeda);

    const backOdd = Number(bl.backOdd || 0);
    const backComissao = Number(bl.backComissao || 0);
    const backStakeNative = Number(bl.backStake || 0);
    const backStakeBRL = backStakeNative * backFator;
    const layOddAlvo = Number(bl.layOdd || 0); // odd ofertada, usada só pra calcular a sugestão
    const layComissao = Number(bl.layComissao || 0);

    const mBack = bl.freebet
      ? (backOdd - 1) * (1 - backComissao / 100)
      : 1 + (backOdd - 1) * (1 - backComissao / 100);

    const cashbackRaw = bl.cashbackAtivo ? backStakeBRL * (Number(bl.cashbackPct || 0) / 100) * (Number(bl.conversaoPct || 0) / 100) : 0;
    const cashbackTeto = bl.teto === "" ? Infinity : Number(bl.teto);
    const cashbackValor = Math.min(cashbackRaw, cashbackTeto);

    const layCashbackRate = bl.layCashbackAtivo ? (Number(bl.layCashbackPct || 0) / 100) * (Number(bl.layConversaoPct || 0) / 100) : 0;

    const divisor = layOddAlvo - layComissao / 100 - layCashbackRate;
    const layStakeAutoBRL = divisor > 0 ? (backStakeBRL * mBack - cashbackRaw) / divisor : 0;
    const layStakeAutoNative = layFator ? layStakeAutoBRL / layFator : 0;

    // odd média real dos preenchimentos (fills) já conseguidos no exchange
    const totalPreenchidoNative = bl.layEntradas.reduce((acc, e) => acc + Number(e.stake || 0), 0);
    const somaPonderada = bl.layEntradas.reduce((acc, e) => acc + Number(e.stake || 0) * Number(e.odd || 0), 0);
    const temPreenchimento = totalPreenchidoNative > 0;
    const layOddMedia = temPreenchimento ? somaPonderada / totalPreenchidoNative : layOddAlvo;

    // usa os preenchimentos reais se existirem; senão, cai na sugestão automática
    const layStakeNative = temPreenchimento ? totalPreenchidoNative : layStakeAutoNative;
    const layOddUsada = temPreenchimento ? layOddMedia : layOddAlvo;
    const layStakeBRL = layStakeNative * layFator;

    const faltandoAtribuirNative = Math.max(0, layStakeAutoNative - totalPreenchidoNative);

    const layCashbackTeto = bl.layTeto === "" ? Infinity : Number(bl.layTeto);
    const layCashbackValor = Math.min(layStakeBRL * layCashbackRate, layCashbackTeto);

    const liabilityBRL = layStakeBRL * (layOddUsada - 1);
    const lucroSeSair = backStakeBRL * (backOdd - 1) * (1 - backComissao / 100) - liabilityBRL + layCashbackValor;
    const lucroSeNaoSair = layStakeBRL * (1 - layComissao / 100) - (bl.freebet ? 0 : backStakeBRL) + cashbackValor;
    const apostaTotal = backStakeBRL + liabilityBRL;
    const liabilityNative = layFator ? liabilityBRL / layFator : 0;

    return {
      layStakeAutoNative, layStakeBRL, liabilityBRL, liabilityNative, lucroSeSair, lucroSeNaoSair, apostaTotal, cashbackValor, layCashbackValor,
      layOddMedia, temPreenchimento, totalPreenchidoNative, faltandoAtribuirNative,
    };
  }, [bl, usdToBrl, eurToBrl]);

  // ---------- modo Back + Dupla Chance ----------
  const [bdc, setBdc] = useState({
    backOdd: "", backComissao: "0", backStake: "100", backMoeda: "BRL", freebet: false,
    dcOdd: "", dcComissao: "0", dcMoeda: "BRL", dcEntradas: [],
    cashbackAtivo: false, cashbackPct: "20", conversaoPct: "100", teto: "",
    dcCashbackAtivo: false, dcCashbackPct: "20", dcConversaoPct: "100", dcTeto: "",
  });
  const updateBdc = (patch) => setBdc((prev) => ({ ...prev, ...patch }));
  const addDcEntrada = () => setBdc((prev) => ({ ...prev, dcEntradas: [...prev.dcEntradas, novaEntrada()] }));
  const removeDcEntrada = (id) => setBdc((prev) => ({ ...prev, dcEntradas: prev.dcEntradas.filter((e) => e.id !== id) }));
  const updateDcEntrada = (id, patch) => setBdc((prev) => ({ ...prev, dcEntradas: prev.dcEntradas.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  const bdcCalc = useMemo(() => {
    const backFator = fator(bdc.backMoeda);
    const dcFator = fator(bdc.dcMoeda);

    const backOdd = Number(bdc.backOdd || 0);
    const backComissao = Number(bdc.backComissao || 0);
    const backStakeNative = Number(bdc.backStake || 0);
    const backStakeBRL = backStakeNative * backFator;
    const dcOddAlvo = Number(bdc.dcOdd || 0); // odd ofertada, usada só pra calcular a sugestão
    const dcComissao = Number(bdc.dcComissao || 0);

    const mBack = bdc.freebet
      ? (backOdd - 1) * (1 - backComissao / 100)
      : 1 + (backOdd - 1) * (1 - backComissao / 100);
    const mDCAlvo = 1 + (dcOddAlvo - 1) * (1 - dcComissao / 100);

    const cBack = bdc.cashbackAtivo ? (Number(bdc.cashbackPct || 0) / 100) * (Number(bdc.conversaoPct || 0) / 100) : 0;
    const cDC = bdc.dcCashbackAtivo ? (Number(bdc.dcCashbackPct || 0) / 100) * (Number(bdc.dcConversaoPct || 0) / 100) : 0;

    const kBack = mBack - cBack;
    const kDCAlvo = mDCAlvo - cDC;

    const dcStakeAutoBRL = kDCAlvo > 0 ? (backStakeBRL * kBack) / kDCAlvo : 0;
    const dcStakeAutoNative = dcFator ? dcStakeAutoBRL / dcFator : 0;

    // odd média real dos preenchimentos (fills) já conseguidos
    const totalPreenchidoNative = bdc.dcEntradas.reduce((acc, e) => acc + Number(e.stake || 0), 0);
    const somaPonderada = bdc.dcEntradas.reduce((acc, e) => acc + Number(e.stake || 0) * Number(e.odd || 0), 0);
    const temPreenchimento = totalPreenchidoNative > 0;
    const dcOddMedia = temPreenchimento ? somaPonderada / totalPreenchidoNative : dcOddAlvo;

    const dcStakeNative = temPreenchimento ? totalPreenchidoNative : dcStakeAutoNative;
    const dcOddUsada = temPreenchimento ? dcOddMedia : dcOddAlvo;
    const mDCUsada = 1 + (dcOddUsada - 1) * (1 - dcComissao / 100);
    const dcStakeBRL = dcStakeNative * dcFator;

    const faltandoAtribuirNative = Math.max(0, dcStakeAutoNative - totalPreenchidoNative);

    const stakeTotal = (bdc.freebet ? 0 : backStakeBRL) + dcStakeBRL;

    const cashbackTeto = bdc.teto === "" ? Infinity : Number(bdc.teto);
    const cashbackBackValor = Math.min(backStakeBRL * cBack, cashbackTeto);
    const dcCashbackTeto = bdc.dcTeto === "" ? Infinity : Number(bdc.dcTeto);
    const cashbackDCValor = Math.min(dcStakeBRL * cDC, dcCashbackTeto);

    const payoutBack = backStakeBRL * mBack;
    const payoutDC = dcStakeBRL * mDCUsada;

    const lucroSeBackGanha = payoutBack - stakeTotal + cashbackDCValor;
    const lucroSeDCGanha = payoutDC - stakeTotal + cashbackBackValor;

    return {
      dcStakeAutoNative, dcStakeBRL, stakeTotal, lucroSeBackGanha, lucroSeDCGanha, cashbackBackValor, cashbackDCValor,
      dcOddMedia, temPreenchimento, totalPreenchidoNative, faltandoAtribuirNative,
      backStakeBRLReal: bdc.freebet ? 0 : backStakeBRL, payoutBack, payoutDC,
    };
  }, [bdc, usdToBrl, eurToBrl]);

  // ---------- modo Proteção Duplo Green (2UP) ----------
  const [dg, setDg] = useState({
    investimento: "", moeda: "BRL",
    resultadoTipo: "prejuizo", resultadoValor: "",
    pagamentoAntecipado: "", oddAoVivo: "",
    modoStake: "profissional", // "conservadora" | "profissional" | "custom"
    stakeCustom: "",
  });
  const updateDg = (patch) => setDg((prev) => ({ ...prev, ...patch }));

  const dgCalc = useMemo(() => {
    const fx = fator(dg.moeda);
    const pNative = dg.resultadoTipo === "prejuizo" ? -Number(dg.resultadoValor || 0) : Number(dg.resultadoValor || 0);
    const p = pNative * fx;
    const a = Number(dg.pagamentoAntecipado || 0) * fx;
    const odd = Number(dg.oddAoVivo || 0);

    const temDados = odd > 1.01 && (dg.resultadoValor !== "" || dg.pagamentoAntecipado !== "");

    // Proteção Conservadora (risco zero): zera o "lucro se manter vitória (PA)"
    const stakeConservadoraBRL = odd > 1 ? Math.max(0, -p / (odd - 1)) : 0;
    // Proteção Profissional (lucro garantido): empata os dois cenários
    const stakeProfissionalBRL = odd > 0 ? a / odd : 0;
    // Proteção Agressiva: Profissional + 1/4 da diferença entre Profissional e Conservadora
    const stakeAgressivaBRL = stakeProfissionalBRL + (stakeProfissionalBRL - stakeConservadoraBRL) / 4;
    const stakeCustomBRL = Number(dg.stakeCustom || 0) * fx;

    const stakeBRL = dg.modoStake === "conservadora" ? stakeConservadoraBRL
      : dg.modoStake === "agressiva" ? stakeAgressivaBRL
      : dg.modoStake === "custom" ? stakeCustomBRL
      : stakeProfissionalBRL;
    const stakeNative = fx ? stakeBRL / fx : 0;

    const lucroSeManterLiquido = p + stakeBRL * (odd - 1);
    const lucroSeDuploGreenLiquido = a + p - stakeBRL;
    const lucroSeManterBruto = stakeBRL * (odd - 1);
    const lucroSeDuploGreenBruto = a - stakeBRL;

    return {
      temDados, p, a,
      stakeNative,
      stakeConservadoraNative: fx ? stakeConservadoraBRL / fx : 0,
      stakeProfissionalNative: fx ? stakeProfissionalBRL / fx : 0,
      stakeAgressivaNative: fx ? stakeAgressivaBRL / fx : 0,
      lucroSeManter: lucroSeManterLiquido, lucroSeDuploGreen: lucroSeDuploGreenLiquido,
      lucroSeManterLiquido, lucroSeDuploGreenLiquido, lucroSeManterBruto, lucroSeDuploGreenBruto,
    };
  }, [dg, usdToBrl, eurToBrl]);

  const [lancamento, setLancamento] = useState("idle"); // idle | saving | saved
  // nome da operação: o que foi digitado no cálculo; senão o padrão do modo
  const nomeOp = (padrao) => (nomeCalculo.trim() || padrao);
  const lancarOperacao = async (descricao, tipo, apostado, opcoes, jogoInfo = null) => {
    setLancamento("saving");
    const { error } = await supabase.from("operacoes").insert({
      data: localDateStr(),
      descricao,
      tipo,
      apostado: Number(apostado) || 0,
      lucro: 0,
      status: "pendente",
      opcoes,
      evento_id: jogoInfo?.id || null,
      evento_home: jogoInfo?.home || null,
      evento_away: jogoInfo?.away || null,
      evento_liga: jogoInfo?.liga || null,
      evento_data: jogoInfo?.data || null,
    });
    if (error) alert("Erro ao lançar operação: " + error.message);
    setLancamento(error ? "idle" : "saved");
    setTimeout(() => setLancamento("idle"), 1500);
  };


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

  const resolverEntrada = (casaId, entradaId) => {
    const casaIdx = casas.findIndex((c) => c.id === casaId);
    const casaObj = casas[casaIdx];
    const entrada = casaObj.entradas.find((e) => e.id === entradaId);
    const oddX = Number(entrada.odd || 0);
    if (!oddX) return;

    const outras = casaObj.entradas.filter((e) => e.id !== entradaId);
    const S0 = outras.reduce((acc, e) => acc + Number(e.stake || 0), 0);
    const W0 = outras.reduce((acc, e) => acc + Number(e.stake || 0) * Number(e.odd || 0), 0);
    const factor = 1 - Number(casaObj.comissao || 0) / 100;
    const mX = 1 + (oddX - 1) * factor;
    const C0 = S0 + factor * (W0 - S0);
    const cI = casaObj.cashback_ativo ? (Number(casaObj.cashback_pct || 0) / 100) * (Number(casaObj.conversao_pct || 0) / 100) : 0;
    const fatorEsta = fator(casaObj.moeda);

    const anchorIdx = casas.findIndex((c, i) => i !== casaIdx && c.fixado && calc.totaisBRL[i] > 0);
    if (anchorIdx === -1) return; // sem nenhuma outra casa travada como referência

    const K = calc.k[anchorIdx] * calc.totaisBRL[anchorIdx];
    const denom = mX - cI;
    if (denom === 0) return;
    const x = (K / fatorEsta - C0 + cI * S0) / denom;

    updateEntrada(casaId, entradaId, { stake: Math.max(0, x).toFixed(2) });
  };

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
          back_moeda: bl.backMoeda,
          lay_odd: bl.layOdd === "" ? null : bl.layOdd,
          lay_comissao: bl.layComissao === "" ? null : bl.layComissao,
          lay_entradas: bl.layEntradas.map((e) => ({ odd: e.odd, stake: e.stake })),
          lay_moeda: bl.layMoeda,
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
      : modo === "backdc"
      ? {
          modo: "backdc",
          back_odd: bdc.backOdd === "" ? null : bdc.backOdd,
          back_comissao: bdc.backComissao === "" ? null : bdc.backComissao,
          back_stake: bdc.backStake === "" ? null : bdc.backStake,
          back_moeda: bdc.backMoeda,
          freebet: bdc.freebet,
          cashback_ativo: bdc.cashbackAtivo,
          cashback_pct: bdc.cashbackPct === "" ? null : bdc.cashbackPct,
          conversao_pct: bdc.conversaoPct === "" ? null : bdc.conversaoPct,
          teto: bdc.teto === "" ? null : bdc.teto,
          dc_odd: bdc.dcOdd === "" ? null : bdc.dcOdd,
          dc_comissao: bdc.dcComissao === "" ? null : bdc.dcComissao,
          dc_entradas: bdc.dcEntradas.map((e) => ({ odd: e.odd, stake: e.stake })),
          dc_moeda: bdc.dcMoeda,
          dc_cashback_ativo: bdc.dcCashbackAtivo,
          dc_cashback_pct: bdc.dcCashbackPct === "" ? null : bdc.dcCashbackPct,
          dc_conversao_pct: bdc.dcConversaoPct === "" ? null : bdc.dcConversaoPct,
          dc_teto: bdc.dcTeto === "" ? null : bdc.dcTeto,
        }
      : modo === "dg2up"
      ? {
          modo: "dg2up",
          dg_investimento: dg.investimento === "" ? null : dg.investimento,
          dg_resultado_tipo: dg.resultadoTipo,
          dg_resultado_valor: dg.resultadoValor === "" ? null : dg.resultadoValor,
          dg_pagamento_antecipado: dg.pagamentoAntecipado === "" ? null : dg.pagamentoAntecipado,
          dg_odd_ao_vivo: dg.oddAoVivo === "" ? null : dg.oddAoVivo,
          dg_moeda: dg.moeda,
        }
      : { modo: "multiplas", stake_total_alvo: targetTotal, stake_total_alvo_moeda: targetMoeda };

    setSaveErro("");
    if (calculoId) {
      const { error: upErr } = await supabase.from("calculos").update({ nome: nomeCalculo, ...camposBase, atualizado_em: new Date().toISOString() }).eq("id", calculoId);
      if (upErr) { setSaveErro(upErr.message); setSaveState("error"); setTimeout(() => setSaveState("idle"), 6000); return; }
      if (modo === "multiplas") await supabase.from("casas_calculo").delete().eq("calculo_id", calculoId);
    } else {
      const { data, error } = await supabase.from("calculos").insert({ nome: nomeCalculo || "Sem nome", ...camposBase }).select().single();
      if (error || !data) { setSaveErro(error?.message || "sem resposta"); setSaveState("error"); setTimeout(() => setSaveState("idle"), 6000); return; }
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
          moeda: c.moeda,
          fixado: c.fixado,
          freebet: c.freebet,
          cashback_ativo: c.cashback_ativo,
          cashback_pct: c.cashback_pct === "" ? null : c.cashback_pct,
          conversao_pct: c.conversao_pct === "" ? null : c.conversao_pct,
          teto: c.teto === "" ? null : c.teto,
          pagamento_antecipado: c.pagamento_antecipado === "" ? null : c.pagamento_antecipado,
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
        backMoeda: calc.back_moeda ?? "BRL",
        layOdd: calc.lay_odd ?? "",
        layComissao: calc.lay_comissao ?? "2.8",
        layEntradas: Array.isArray(calc.lay_entradas)
          ? calc.lay_entradas.map((e) => ({ id: uid(), odd: e.odd ?? "", stake: e.stake ?? "" }))
          : [],
        layMoeda: calc.lay_moeda ?? "BRL",
        freebet: !!calc.freebet,
        cashbackAtivo: !!calc.cashback_ativo,
        cashbackPct: calc.cashback_pct ?? "20",
        conversaoPct: calc.conversao_pct ?? "100",
        teto: calc.teto ?? "",
        layCashbackAtivo: !!calc.lay_cashback_ativo,
        layCashbackPct: calc.lay_cashback_pct ?? "15",
        layConversaoPct: calc.lay_conversao_pct ?? "100",
        layTeto: calc.lay_teto ?? "",
      });
    } else if (calc.modo === "backdc") {
      setModo("backdc");
      setBdc({
        backOdd: calc.back_odd ?? "",
        backComissao: calc.back_comissao ?? "0",
        backStake: calc.back_stake ?? "",
        backMoeda: calc.back_moeda ?? "BRL",
        freebet: !!calc.freebet,
        dcOdd: calc.dc_odd ?? "",
        dcComissao: calc.dc_comissao ?? "0",
        dcEntradas: Array.isArray(calc.dc_entradas)
          ? calc.dc_entradas.map((e) => ({ id: uid(), odd: e.odd ?? "", stake: e.stake ?? "" }))
          : [],
        dcMoeda: calc.dc_moeda ?? "BRL",
        cashbackAtivo: !!calc.cashback_ativo,
        cashbackPct: calc.cashback_pct ?? "20",
        conversaoPct: calc.conversao_pct ?? "100",
        teto: calc.teto ?? "",
        dcCashbackAtivo: !!calc.dc_cashback_ativo,
        dcCashbackPct: calc.dc_cashback_pct ?? "20",
        dcConversaoPct: calc.dc_conversao_pct ?? "100",
        dcTeto: calc.dc_teto ?? "",
      });
    } else if (calc.modo === "dg2up") {
      setModo("dg2up");
      setDg({
        investimento: calc.dg_investimento ?? "",
        moeda: calc.dg_moeda ?? "BRL",
        resultadoTipo: calc.dg_resultado_tipo ?? "prejuizo",
        resultadoValor: calc.dg_resultado_valor ?? "",
        pagamentoAntecipado: calc.dg_pagamento_antecipado ?? "",
        oddAoVivo: calc.dg_odd_ao_vivo ?? "",
      });
    } else {
      setModo("multiplas");
      setTargetTotal(calc.stake_total_alvo ?? "1000");
      setTargetMoeda(calc.stake_total_alvo_moeda ?? "BRL");
      const { data: casasData } = await supabase.from("casas_calculo").select("*").eq("calculo_id", calculoId).order("ordem", { ascending: true });
      if (casasData) {
        setCasas(casasData.map((c) => ({
          id: c.id,
          nome: c.nome || "",
          comissao: c.comissao ?? "0",
          moeda: c.moeda ?? "BRL",
          fixado: c.fixado,
          freebet: !!c.freebet,
          cashback_ativo: c.cashback_ativo,
          cashback_pct: c.cashback_pct ?? "20",
          conversao_pct: c.conversao_pct ?? "100",
          teto: c.teto ?? "",
          pagamento_antecipado: c.pagamento_antecipado ?? "",
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
    const totaisBRL = casas.map((c, i) => totais[i].totalStake * (fator(c.moeda)));
    const dinheiroRealBRL = casas.map((c, i) => (c.freebet ? 0 : totaisBRL[i]));
    const m = casas.map((c, i) => c.freebet
      ? (totais[i].oddMedia - 1) * (1 - Number(c.comissao || 0) / 100)
      : 1 + (totais[i].oddMedia - 1) * (1 - Number(c.comissao || 0) / 100));
    const cRate = casas.map((c) => (c.cashback_ativo ? (Number(c.cashback_pct || 0) / 100) * (Number(c.conversao_pct || 0) / 100) : 0));
    const k = casas.map((_, i) => m[i] - cRate[i]);
    return { m, cRate, k, totais, totaisBRL, dinheiroRealBRL };
  }, [casas, usdToBrl, eurToBrl]);

  const autoBalancear = () => {
    const { k, totais, totaisBRL } = calc;
    const anchorIdx = casas.findIndex((c, i) => c.fixado && totaisBRL[i] > 0);
    let targetsBRL;
    if (anchorIdx >= 0) {
      const K = k[anchorIdx] * totaisBRL[anchorIdx];
      targetsBRL = casas.map((c, i) => (i === anchorIdx || c.fixado ? totaisBRL[i] : K / k[i]));
    } else {
      const somaInv = k.reduce((acc, ki) => acc + (ki > 0 ? 1 / ki : 0), 0);
      const K = (Number(targetTotal || 0) * (fator(targetMoeda))) / somaInv;
      targetsBRL = casas.map((c, i) => (c.fixado ? totaisBRL[i] : K / k[i]));
    }
    setCasas((prev) => prev.map((c, i) => {
      if (c.fixado) return c;
      const fatorC = fator(c.moeda);
      const alvoNative = targetsBRL[i] / fatorC;
      const atualNative = totais[i].totalStake;
      if (atualNative > 0) {
        const fator = alvoNative / atualNative;
        return { ...c, entradas: c.entradas.map((e) => ({ ...e, stake: e.stake === "" ? "" : (Number(e.stake) * fator).toFixed(2) })) };
      }
      return { ...c, entradas: c.entradas.map((e, idx) => (idx === 0 ? { ...e, stake: alvoNative.toFixed(2) } : e)) };
    }));
  };

  const resultados = useMemo(() => {
    const stakesBRL = calc.totaisBRL;
    const dinheiroReal = calc.dinheiroRealBRL;
    const stakeTotal = dinheiroReal.reduce((a, b) => a + b, 0);
    const { m, totais } = calc;
    const cashbackValor = casas.map((c, i) => {
      if (!c.cashback_ativo) return 0;
      const raw = stakesBRL[i] * (Number(c.cashback_pct || 0) / 100) * (Number(c.conversao_pct || 0) / 100);
      const teto = c.teto === "" ? Infinity : Number(c.teto);
      return Math.min(raw, teto);
    });
    const pagamentosBRL = casas.map((c) => Number(c.pagamento_antecipado || 0) * (fator(c.moeda)));
    const totalPagamentosAntecipados = pagamentosBRL.reduce((a, b) => a + b, 0);
    const linhas = casas.map((c, i) => {
      const payout = stakesBRL[i] * m[i];
      const deficit = payout - stakeTotal;
      const seguro = cashbackValor.reduce((acc, v, j) => (j === i ? acc : acc + v), 0);
      const lucro = deficit + seguro + totalPagamentosAntecipados;
      const roi = stakeTotal ? (lucro / stakeTotal) * 100 : 0;
      return {
        id: c.id, nome: c.nome, oddMedia: totais[i].oddMedia, numEntradas: c.entradas.length,
        comissao: c.comissao, stakeNative: totais[i].totalStake, moeda: c.moeda, stakeBRL: stakesBRL[i],
        freebet: c.freebet, cashbackPct: c.cashback_ativo ? c.cashback_pct : null, deficit, seguro, lucro, roi,
        payoutBRL: payout, cashbackOwnBRL: cashbackValor[i], dinheiroRealBRL: dinheiroReal[i],
      };
    });
    const lucros = linhas.map((l) => l.lucro);
    const pior = lucros.length ? Math.min(...lucros) : 0;
    const melhor = lucros.length ? Math.max(...lucros) : 0;
    const roiMin = stakeTotal ? (pior / stakeTotal) * 100 : 0;
    const roiMax = stakeTotal ? (melhor / stakeTotal) * 100 : 0;
    return { linhas, stakeTotal, pior, melhor, roiMin, roiMax, totalPagamentosAntecipados };
  }, [casas, calc, usdToBrl, eurToBrl]);

  const temMultiplasFixadas = casas.filter((c) => c.fixado).length > 1;

  const CotacaoBar = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "#8b90b3", marginBottom: 14, flexWrap: "wrap" }} className="mono">
      <DollarSign size={13} color="#6b7099" />
      {rate ? (
        <>
          1 USD = {fmt(rate.value)} · 1 EUR = {fmt(eurToBrl)}
          <span style={{ color: "#00e676" }}>· {rate.fonte || "cotação"}</span>
          <span style={{ color: "#6b7099" }}>
            · atualizada {new Date(rate.updatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
        </>
      ) : (
        <span>buscando cotação…</span>
      )}
      <button onClick={() => fetchRate(true)} disabled={rateLoading} style={{ background: "none", border: "none", color: "#00e676", display: "flex", alignItems: "center" }} title="atualizar cotação agora">
        <RefreshCw size={12} style={{ animation: rateLoading ? "spin 1s linear infinite" : "none" }} />
      </button>
      <span style={{ color: "#4a5080", margin: "0 2px" }}>|</span>
      <span>ver resultados em:</span>
      <SeletorMoeda value={resultMoeda} onChange={setResultMoeda} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  const SeletorMoeda = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 2, background: "#0b0e1d", border: "1px solid #2a2f52", borderRadius: 6, padding: 2 }}>
      {["BRL", "USD", "EUR"].map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          style={{ padding: "3px 7px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, border: "none", background: value === m ? "#00e676" : "transparent", color: value === m ? "#0b0e1d" : "#8b90b3" }}
        >
          {sim(m)}
        </button>
      ))}
    </div>
  );

  const convBRL = (Number(conv.valor) || 0) * fator(conv.moeda);
  const conversor = (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setConv((p) => ({ ...p, aberto: !p.aberto }))} style={{ background: "none", border: "none", color: "#00e676", fontSize: 11.5, padding: 0 }} className="mono">
        {conv.aberto ? "▾" : "▸"} conversor de moedas (US$ ⇄ € ⇄ R$)
      </button>
      {conv.aberto && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input type="number" step="0.01" value={conv.valor} onChange={(e) => setConv((p) => ({ ...p, valor: e.target.value }))} placeholder="valor" className="input-field" style={{ width: 120 }} />
          <SeletorMoeda value={conv.moeda} onChange={(m) => setConv((p) => ({ ...p, moeda: m }))} />
          <span className="mono" style={{ fontSize: 12, color: "#e4e4e7" }}>
            = {["USD", "EUR", "BRL"].filter((m) => m !== conv.moeda).map((m) => fmtMoeda(convBRL / fator(m), m)).join(" = ")}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <CotacaoBar />
      {conversor}

      {/* barra de salvar / carregar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          value={nomeCalculo}
          onChange={(e) => setNomeCalculo(e.target.value)}
          placeholder="nome desse cálculo (ex: Flamengo x Palmeiras)"
          className="input-field"
          style={{ maxWidth: 280 }}
        />
        <button onClick={salvar} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#00e676", color: "#0b0e1d", border: "none" }}>
          <Save size={13} /> salvar
        </button>
        <button onClick={() => setMostrarSalvos((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#1a1e3a", color: "#b4b9d6", border: "1px solid #2a2f52" }}>
          <FolderOpen size={13} /> salvos ({salvos.length})
        </button>
        <button onClick={novoCalculo} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "transparent", color: "#8b90b3", border: "1px dashed #4a5080" }}>
          + novo cálculo
        </button>
        <span style={{ fontSize: 11, color: "#6b7099" }} className="mono">
          {saveState === "saving" && "salvando…"}
          {saveState === "saved" && <span style={{ color: "#00e676" }}>salvo</span>}
          {saveState === "error" && <span style={{ color: "#ff5a6a" }}>erro ao salvar{saveErro ? `: ${saveErro}` : ""}</span>}
        </span>
      </div>

      {mostrarSalvos && (
        <div style={{ border: "1px solid #2a2f52", borderRadius: 8, marginBottom: 18, overflow: "hidden" }}>
          {salvos.length === 0 && <div style={{ padding: 14, fontSize: 12, color: "#6b7099" }}>Nenhum cálculo salvo ainda.</div>}
          {salvos.map((s) => (
            <div key={s.id} onClick={() => carregar(s.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #23274a", cursor: "pointer", background: s.id === calculoAtualId ? "rgba(0,230,118,.06)" : "transparent" }}>
              <div>
                <div style={{ fontSize: 13, color: "#e4e4e7" }}>
                  {s.nome || "Sem nome"}
                  <span style={{ marginLeft: 8, fontSize: 10, padding: "1px 7px", borderRadius: 999, background: s.modo === "backlay" ? "rgba(248,113,113,.12)" : s.modo === "backdc" ? "rgba(96,165,250,.12)" : s.modo === "dg2up" ? "rgba(251,146,60,.12)" : "rgba(45,212,191,.12)", color: s.modo === "backlay" ? "#ff5a6a" : s.modo === "backdc" ? "#60a5fa" : s.modo === "dg2up" ? "#fb923c" : "#2dd4bf" }}>
                    {s.modo === "backlay" ? "back x lay" : s.modo === "backdc" ? "back + dupla chance" : s.modo === "dg2up" ? "duplo green 2up" : "múltiplas"}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: "#6b7099" }} className="mono">{new Date(s.atualizado_em).toLocaleString("pt-BR")}</div>
              </div>
              <button onClick={(e) => excluirSalvo(s.id, e)} style={{ background: "none", border: "none", color: "#4a5080" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {/* seletor de modo */}
      <div style={{ display: "flex", gap: 4, background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 999, padding: 3, width: "fit-content", marginBottom: 18 }}>
        <button
          onClick={() => setModo("multiplas")}
          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: modo === "multiplas" ? "#00e676" : "transparent", color: modo === "multiplas" ? "#0b0e1d" : "#b4b9d6" }}
        >Múltiplas casas</button>
        <button
          onClick={() => setModo("backlay")}
          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: modo === "backlay" ? "#00e676" : "transparent", color: modo === "backlay" ? "#0b0e1d" : "#b4b9d6" }}
        >Back x Lay (2 vias)</button>
        <button
          onClick={() => setModo("backdc")}
          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: modo === "backdc" ? "#00e676" : "transparent", color: modo === "backdc" ? "#0b0e1d" : "#b4b9d6" }}
        >Back + Dupla Chance</button>
        <button
          onClick={() => setModo("dg2up")}
          style={{ padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: modo === "dg2up" ? "#00e676" : "transparent", color: modo === "dg2up" ? "#0b0e1d" : "#b4b9d6" }}
        >Duplo Green (2UP)</button>
      </div>

      {modo === "dg2up" ? (
        <div>
          <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 18, marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", margin: 0 }}>Proteção Duplo Green (2UP)</h2>
              <SeletorMoeda value={dg.moeda} onChange={(m) => updateDg({ moeda: m })} />
            </div>
            <p style={{ fontSize: 11.5, color: "#8b90b3", marginBottom: 16 }}>
              Calcule a proteção ao vivo após o 2-0: quanto apostar no time líder pra igualar o lucro, seja qual for o resultado final.
            </p>

            <div style={{ marginBottom: 14 }}>
              <Campo label={`Investimento total (${sim(dg.moeda)}, informativo)`}>
                <input type="number" step="0.01" value={dg.investimento} onChange={(e) => updateDg({ investimento: e.target.value })} placeholder="Ex: 200" className="input-field" />
              </Campo>
            </div>

            <div style={{ marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500 }}>
                Resultado da operação ({sim(dg.moeda)}) se o time NÃO segurar o resultado
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => updateDg({ resultadoTipo: "prejuizo" })} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", background: dg.resultadoTipo === "prejuizo" ? "rgba(248,113,113,.2)" : "#2a2f52", color: dg.resultadoTipo === "prejuizo" ? "#ff5a6a" : "#8b90b3" }}>Prejuízo</button>
                <button onClick={() => updateDg({ resultadoTipo: "lucro" })} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, border: "none", background: dg.resultadoTipo === "lucro" ? "rgba(52,211,153,.2)" : "#2a2f52", color: dg.resultadoTipo === "lucro" ? "#00e676" : "#8b90b3" }}>Lucro</button>
              </div>
            </div>
            <input type="number" step="0.01" value={dg.resultadoValor} onChange={(e) => updateDg({ resultadoValor: e.target.value })} placeholder="Ex: 30" className="input-field" style={{ marginBottom: 14 }} />

            <Campo label={`Pagamento antecipado já recebido — 2UP (${sim(dg.moeda)})`}>
              <input type="number" step="0.01" value={dg.pagamentoAntecipado} onChange={(e) => updateDg({ pagamentoAntecipado: e.target.value })} placeholder="Ex: 118,80" className="input-field" />
            </Campo>
            <div style={{ marginTop: 14 }}>
              <Campo label="Odd atual ao vivo (do time líder)">
                <input type="number" step="0.01" value={dg.oddAoVivo} onChange={(e) => updateDg({ oddAoVivo: e.target.value })} placeholder="Ex: 1.25" className="input-field" />
              </Campo>
            </div>
          </div>

          <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 18 }}>
            {!dgCalc.temDados ? (
              <div style={{ textAlign: "center", color: "#6b7099", padding: "20px 0" }}>
                <div style={{ fontSize: 13 }}>Preencha o resultado, o pagamento antecipado e a odd ao vivo pra ver a proteção</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Odd deve ser maior que 1.01</div>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 12 }}>Proteção sugerida</h2>

                <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                  <button onClick={() => updateDg({ modoStake: "conservadora" })} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${dg.modoStake === "conservadora" ? "#38bdf8" : "#2a2f52"}`, background: dg.modoStake === "conservadora" ? "rgba(56,189,248,.12)" : "transparent", color: dg.modoStake === "conservadora" ? "#38bdf8" : "#b4b9d6" }}>
                    🛡️ Conservadora (risco zero)
                  </button>
                  <button onClick={() => updateDg({ modoStake: "profissional" })} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${dg.modoStake === "profissional" ? "#00e676" : "#2a2f52"}`, background: dg.modoStake === "profissional" ? "rgba(0,230,118,.12)" : "transparent", color: dg.modoStake === "profissional" ? "#00e676" : "#b4b9d6" }}>
                    ⚡ Profissional (lucro igual)
                  </button>
                  <button onClick={() => updateDg({ modoStake: "agressiva" })} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${dg.modoStake === "agressiva" ? "#00e676" : "#2a2f52"}`, background: dg.modoStake === "agressiva" ? "rgba(52,211,153,.12)" : "transparent", color: dg.modoStake === "agressiva" ? "#00e676" : "#b4b9d6" }}>
                    📈 Agressiva (DG maximizado)
                  </button>
                  <button onClick={() => updateDg({ modoStake: "custom" })} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: `1px solid ${dg.modoStake === "custom" ? "#a78bfa" : "#2a2f52"}`, background: dg.modoStake === "custom" ? "rgba(167,139,250,.12)" : "transparent", color: dg.modoStake === "custom" ? "#a78bfa" : "#b4b9d6" }}>
                    ✎ Personalizada
                  </button>
                </div>

                {dg.modoStake === "custom" && (
                  <div style={{ marginBottom: 14, maxWidth: 200 }}>
                    <Campo label={`Stake a testar (${sim(dg.moeda)})`}>
                      <input type="number" step="0.01" value={dg.stakeCustom} onChange={(e) => updateDg({ stakeCustom: e.target.value })} placeholder="0,00" className="input-field" />
                    </Campo>
                  </div>
                )}

                <div style={{ marginBottom: 16, fontSize: 13, color: "#e4e4e7" }}>
                  Aposte <span className="mono" style={{ color: "#00e676", fontWeight: 700 }}>{fmtMoeda(dgCalc.stakeNative, dg.moeda)}</span> a favor do time líder, na odd atual ao vivo.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
                  <Metric label="Lucro líquido se manter a vitória (PA)" value={fmtR(dgCalc.lucroSeManter)} sub={`bruto (sem a operação): ${fmtR(dgCalc.lucroSeManterBruto)}`} color={dgCalc.lucroSeManter >= 0 ? "#00e676" : "#ff5a6a"} />
                  <Metric label="Lucro líquido se sair Duplo Green" value={fmtR(dgCalc.lucroSeDuploGreen)} sub={`bruto (sem a operação): ${fmtR(dgCalc.lucroSeDuploGreenBruto)}`} color={dgCalc.lucroSeDuploGreen >= 0 ? "#00e676" : "#ff5a6a"} />
                </div>
                {Math.abs(dgCalc.lucroSeManter - dgCalc.lucroSeDuploGreen) < 0.5 && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: "#00e676", textAlign: "center" }}>Lucro igual nos dois cenários ✓</div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                  <button
                    onClick={() => lancarOperacao(nomeOp("Duplo Green 2UP"), "dg2up", dg.investimento, [
                      { label: "Manteve a vitória (PA)", lucro: dgCalc.lucroSeManter, odd: Number(dg.oddAoVivo) || null, stakeNative: dgCalc.stakeNative, moeda: dg.moeda },
                      { label: "Saiu Duplo Green", lucro: dgCalc.lucroSeDuploGreen, odd: Number(dg.oddAoVivo) || null, stakeNative: dgCalc.stakeNative, moeda: dg.moeda },
                    ])}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "#00e676", color: "#0b0e1d", border: "none" }}
                  >
                    <TrendingUp size={13} /> {lancamento === "saving" ? "lançando…" : lancamento === "saved" ? "lançado ✓" : "Lançar operação"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : modo === "backdc" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 18 }}>
            {/* BACK */}
            <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#00e676" }}>Back (seleção principal)</div>
                <SeletorMoeda value={bdc.backMoeda} onChange={(m) => updateBdc({ backMoeda: m })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <Campo label="Odd"><input type="number" step="0.01" value={bdc.backOdd} onChange={(e) => updateBdc({ backOdd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
                <Campo label="Comissão (%)"><input type="number" step="0.01" value={bdc.backComissao} onChange={(e) => updateBdc({ backComissao: e.target.value })} className="input-field" /></Campo>
              </div>
              <Campo label={`Stake (${sim(bdc.backMoeda)})`}><input type="number" step="0.01" value={bdc.backStake} onChange={(e) => updateBdc({ backStake: e.target.value })} placeholder="0,00" className="input-field" /></Campo>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
                <input type="checkbox" checked={bdc.freebet} onChange={(e) => updateBdc({ freebet: e.target.checked })} />
                Essa é uma aposta grátis (freebet) — stake não é devolvida
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
                <input type="checkbox" checked={bdc.cashbackAtivo} onChange={(e) => updateBdc({ cashbackAtivo: e.target.checked })} />
                O Back gera cashback se perder
              </label>
              {bdc.cashbackAtivo && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(0,230,118,.2)", borderRadius: 8, padding: 10, background: "rgba(0,230,118,.02)" }}>
                  <Campo label="Cashback (%)"><input type="number" step="0.01" value={bdc.cashbackPct} onChange={(e) => updateBdc({ cashbackPct: e.target.value })} className="input-field" /></Campo>
                  <Campo label="Conversão (%)"><input type="number" step="0.01" value={bdc.conversaoPct} onChange={(e) => updateBdc({ conversaoPct: e.target.value })} className="input-field" /></Campo>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={bdc.teto} onChange={(e) => updateBdc({ teto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                  </div>
                </div>
              )}
            </div>

            {/* DUPLA CHANCE */}
            <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#ff5a6a" }}>Dupla Chance (cobre o resto)</div>
                <SeletorMoeda value={bdc.dcMoeda} onChange={(m) => updateBdc({ dcMoeda: m })} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <Campo label="Odd ofertada (alvo)"><input type="number" step="0.01" value={bdc.dcOdd} onChange={(e) => updateBdc({ dcOdd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
              </div>

              <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 6 }}>
                Sugestão de stake total: <span className="mono" style={{ color: "#00e676" }}>{fmtMoeda(bdcCalc.dcStakeAutoNative, bdc.dcMoeda)}</span>
              </div>

              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500, display: "block", marginBottom: 4 }}>
                Preenchimentos reais (odd + stake, caso não feche tudo de uma vez)
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                {bdc.dcEntradas.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" step="0.01" value={e.odd} onChange={(ev) => updateDcEntrada(e.id, { odd: ev.target.value })} placeholder="odd" className="input-field" style={{ width: 70 }} />
                    <input type="number" step="0.01" value={e.stake} onChange={(ev) => updateDcEntrada(e.id, { stake: ev.target.value })} placeholder="stake" className="input-field" style={{ flex: 1 }} />
                    <button onClick={() => removeDcEntrada(e.id)} style={{ background: "none", border: "none", color: "#4a5080" }}><X size={13} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addDcEntrada} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#ff5a6a", background: "none", border: "1px dashed rgba(248,113,113,.4)", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>
                <Plus size={11} /> adicionar preenchimento
              </button>

              {bdcCalc.temPreenchimento ? (
                <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 8 }} className="mono">
                  Odd média conseguida: <span style={{ color: "#e4e4e7" }}>{bdcCalc.dcOddMedia.toFixed(4)}</span> · Preenchido: <span style={{ color: "#e4e4e7" }}>{fmtMoeda(bdcCalc.totalPreenchidoNative, bdc.dcMoeda)}</span>
                  {bdcCalc.faltandoAtribuirNative > 0.01 && (
                    <div style={{ color: "#00e676", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>Faltam atribuir ≈ {fmtMoeda(bdcCalc.faltandoAtribuirNative, bdc.dcMoeda)}</span>
                      <button
                        onClick={() => setBdc((prev) => ({ ...prev, dcEntradas: [...prev.dcEntradas, { id: uid(), odd: prev.dcOdd, stake: bdcCalc.faltandoAtribuirNative.toFixed(2) }] }))}
                        style={{ fontSize: 10, color: "#00e676", background: "none", border: "1px dashed rgba(0,230,118,.4)", borderRadius: 6, padding: "2px 6px" }}
                      >
                        completar com odd alvo
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 10.5, color: "#6b7099", marginBottom: 8 }}>Sem preenchimentos ainda — usando a sugestão automática acima para o cálculo.</div>
              )}

              {bdc.cashbackAtivo && (
                <div style={{ marginTop: 4, fontSize: 11.5, color: "#8b90b3" }}>
                  Cashback estimado (se o Back perder): <span className="mono" style={{ color: "#f59e0b" }}>{fmt(bdcCalc.cashbackBackValor)}</span>
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
                <input type="checkbox" checked={bdc.dcCashbackAtivo} onChange={(e) => updateBdc({ dcCashbackAtivo: e.target.checked })} />
                A Dupla Chance gera cashback se perder
              </label>
              {bdc.dcCashbackAtivo && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(248,113,113,.2)", borderRadius: 8, padding: 10, background: "rgba(248,113,113,.02)" }}>
                  <Campo label="Cashback (%)"><input type="number" step="0.01" value={bdc.dcCashbackPct} onChange={(e) => updateBdc({ dcCashbackPct: e.target.value })} className="input-field" /></Campo>
                  <Campo label="Conversão (%)"><input type="number" step="0.01" value={bdc.dcConversaoPct} onChange={(e) => updateBdc({ dcConversaoPct: e.target.value })} className="input-field" /></Campo>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={bdc.dcTeto} onChange={(e) => updateBdc({ dcTeto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                  </div>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#8b90b3" }}>
                    Cashback estimado (se a Dupla Chance perder): <span className="mono" style={{ color: "#f59e0b" }}>{fmt(bdcCalc.cashbackDCValor)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* resultado */}
          <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 18 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 4 }}>Resultado (em reais)</h2>
            <p style={{ fontSize: 11, color: "#6b7099", marginBottom: 14 }}>Duas apostas normais (back) cobrindo resultados complementares — sem precisar de exchange.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
              <Metric label="Aposta total" value={fmtR(bdcCalc.stakeTotal)} />
              <Metric
                label="Lucro se Back ganhar"
                value={fmtR(bdcCalc.lucroSeBackGanha)}
                sub={bdcCalc.stakeTotal ? `${((bdcCalc.lucroSeBackGanha / bdcCalc.stakeTotal) * 100).toFixed(2)}%` : null}
                color={bdcCalc.lucroSeBackGanha >= 0 ? "#00e676" : "#ff5a6a"}
              />
              <Metric
                label="Lucro se Dupla Chance ganhar"
                value={fmtR(bdcCalc.lucroSeDCGanha)}
                sub={bdcCalc.stakeTotal ? `${((bdcCalc.lucroSeDCGanha / bdcCalc.stakeTotal) * 100).toFixed(2)}%` : null}
                color={bdcCalc.lucroSeDCGanha >= 0 ? "#00e676" : "#ff5a6a"}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                onClick={() => lancarOperacao(nomeOp("Back + Dupla Chance"), "backdc", bdcCalc.stakeTotal, [
                  { label: "Back ganhou", odd: Number(bdc.backOdd) || null, stakeNative: Number(bdc.backStake) || 0, moeda: bdc.backMoeda, freebet: !!bdc.freebet, lucro: bdcCalc.lucroSeBackGanha, stakeBRL: bdcCalc.backStakeBRLReal, payoutBRL: bdcCalc.payoutBack, cashbackBRL: bdcCalc.cashbackBackValor },
                  { label: "Dupla Chance ganhou", odd: bdcCalc.dcOddMedia || null, stakeNative: bdcCalc.dcStakeBRL / fator(bdc.dcMoeda), moeda: bdc.dcMoeda, lucro: bdcCalc.lucroSeDCGanha, stakeBRL: bdcCalc.dcStakeBRL, payoutBRL: bdcCalc.payoutDC, cashbackBRL: bdcCalc.cashbackDCValor },
                ])}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "#00e676", color: "#0b0e1d", border: "none" }}
              >
                <TrendingUp size={13} /> {lancamento === "saving" ? "lançando…" : lancamento === "saved" ? "lançado ✓" : "Lançar operação"}
              </button>
            </div>
          </div>
        </div>
      ) : modo === "backlay" ? (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginBottom: 18 }}>
            {/* BACK */}
            <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#00e676" }}>Back (a favor)</div>
                <SeletorMoeda value={bl.backMoeda} onChange={(m) => updateBl({ backMoeda: m })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <Campo label="Odd"><input type="number" step="0.01" value={bl.backOdd} onChange={(e) => updateBl({ backOdd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
                <Campo label="Comissão (%)"><input type="number" step="0.01" value={bl.backComissao} onChange={(e) => updateBl({ backComissao: e.target.value })} className="input-field" /></Campo>
              </div>
              <Campo label={`Stake (${sim(bl.backMoeda)})`}><input type="number" step="0.01" value={bl.backStake} onChange={(e) => updateBl({ backStake: e.target.value })} placeholder="0,00" className="input-field" /></Campo>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
                <input type="checkbox" checked={bl.freebet} onChange={(e) => updateBl({ freebet: e.target.checked })} />
                Essa é uma aposta grátis (freebet) — stake não é devolvida
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
                <input type="checkbox" checked={bl.cashbackAtivo} onChange={(e) => updateBl({ cashbackAtivo: e.target.checked })} />
                O Back gera cashback se perder
              </label>
              {bl.cashbackAtivo && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(0,230,118,.2)", borderRadius: 8, padding: 10, background: "rgba(0,230,118,.02)" }}>
                  <Campo label="Cashback (%)"><input type="number" step="0.01" value={bl.cashbackPct} onChange={(e) => updateBl({ cashbackPct: e.target.value })} className="input-field" /></Campo>
                  <Campo label="Conversão (%)"><input type="number" step="0.01" value={bl.conversaoPct} onChange={(e) => updateBl({ conversaoPct: e.target.value })} className="input-field" /></Campo>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={bl.teto} onChange={(e) => updateBl({ teto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                  </div>
                </div>
              )}
            </div>

            {/* LAY */}
            <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#ff5a6a" }}>Lay (contra / exchange)</div>
                <SeletorMoeda value={bl.layMoeda} onChange={(m) => updateBl({ layMoeda: m })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <Campo label="Odd ofertada (alvo)"><input type="number" step="0.01" value={bl.layOdd} onChange={(e) => updateBl({ layOdd: e.target.value })} placeholder="0.00" className="input-field" /></Campo>
                <Campo label="Comissão (%)"><input type="number" step="0.01" value={bl.layComissao} onChange={(e) => updateBl({ layComissao: e.target.value })} className="input-field" /></Campo>
              </div>

              <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 6 }}>
                Sugestão de stake total: <span className="mono" style={{ color: "#00e676" }}>{fmtMoeda(blCalc.layStakeAutoNative, bl.layMoeda)}</span>
              </div>

              <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500, display: "block", marginBottom: 4 }}>
                Preenchimentos reais (odd + stake, caso não feche tudo de uma vez)
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                {bl.layEntradas.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" step="0.01" value={e.odd} onChange={(ev) => updateLayEntrada(e.id, { odd: ev.target.value })} placeholder="odd" className="input-field" style={{ width: 70 }} />
                    <input type="number" step="0.01" value={e.stake} onChange={(ev) => updateLayEntrada(e.id, { stake: ev.target.value })} placeholder="stake" className="input-field" style={{ flex: 1 }} />
                    <button onClick={() => removeLayEntrada(e.id)} style={{ background: "none", border: "none", color: "#4a5080" }}><X size={13} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addLayEntrada} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#ff5a6a", background: "none", border: "1px dashed rgba(248,113,113,.4)", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>
                <Plus size={11} /> adicionar preenchimento
              </button>

              {blCalc.temPreenchimento ? (
                <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 8 }} className="mono">
                  Odd média conseguida: <span style={{ color: "#e4e4e7" }}>{blCalc.layOddMedia.toFixed(4)}</span> · Preenchido: <span style={{ color: "#e4e4e7" }}>{fmtMoeda(blCalc.totalPreenchidoNative, bl.layMoeda)}</span>
                  {blCalc.faltandoAtribuirNative > 0.01 && (
                    <div style={{ color: "#00e676", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span>Faltam atribuir ≈ {fmtMoeda(blCalc.faltandoAtribuirNative, bl.layMoeda)}</span>
                      <button
                        onClick={() => setBl((prev) => ({ ...prev, layEntradas: [...prev.layEntradas, { id: uid(), odd: prev.layOdd, stake: blCalc.faltandoAtribuirNative.toFixed(2) }] }))}
                        style={{ fontSize: 10, color: "#00e676", background: "none", border: "1px dashed rgba(0,230,118,.4)", borderRadius: 6, padding: "2px 6px" }}
                      >
                        completar com odd alvo
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 10.5, color: "#6b7099", marginBottom: 8 }}>Sem preenchimentos ainda — usando a sugestão automática acima para o cálculo.</div>
              )}

              <div style={{ marginTop: 4, fontSize: 11.5, color: "#8b90b3" }}>
                Responsabilidade: <span className="mono" style={{ color: "#ff5a6a" }}>{fmtMoeda(blCalc.liabilityNative, bl.layMoeda)}</span>
                {bl.layMoeda !== "BRL" && <span style={{ color: "#6b7099" }}> ({fmt(blCalc.liabilityBRL)})</span>}
              </div>
              {bl.cashbackAtivo && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: "#8b90b3" }}>
                  Cashback estimado (se o Back perder): <span className="mono" style={{ color: "#f59e0b" }}>{fmt(blCalc.cashbackValor)}</span>
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
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
                  <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#8b90b3" }}>
                    Cashback estimado (se o Lay perder): <span className="mono" style={{ color: "#f59e0b" }}>{fmt(blCalc.layCashbackValor)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* resultado */}
          <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 18 }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 4 }}>Resultado (em reais)</h2>
            <p style={{ fontSize: 11, color: "#6b7099", marginBottom: 14 }}>Valores convertidos pela cotação atual pra dar pra comparar Back e Lay em moedas diferentes.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 14 }}>
              <Metric label="Aposta total" value={fmtR(blCalc.apostaTotal)} />
              <Metric label="Responsabilidade (lay)" value={fmtR(blCalc.liabilityBRL)} color="#ff5a6a" />
              <Metric
                label="Lucro se SAIR (back ganha)"
                value={fmtR(blCalc.lucroSeSair)}
                sub={blCalc.apostaTotal ? `${((blCalc.lucroSeSair / blCalc.apostaTotal) * 100).toFixed(2)}%` : null}
                color={blCalc.lucroSeSair >= 0 ? "#00e676" : "#ff5a6a"}
              />
              <Metric
                label="Lucro se NÃO SAIR (lay ganha)"
                value={fmtR(blCalc.lucroSeNaoSair)}
                sub={blCalc.apostaTotal ? `${((blCalc.lucroSeNaoSair / blCalc.apostaTotal) * 100).toFixed(2)}%` : null}
                color={blCalc.lucroSeNaoSair >= 0 ? "#00e676" : "#ff5a6a"}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                onClick={() => lancarOperacao(nomeOp("Back x Lay"), "backlay", blCalc.apostaTotal, [
                  { label: "Saiu (back ganhou)", odd: Number(bl.backOdd) || null, stakeNative: Number(bl.backStake) || 0, moeda: bl.backMoeda, freebet: !!bl.freebet, stakeBRL: Number(bl.backStake || 0) * fator(bl.backMoeda), lucro: blCalc.lucroSeSair },
                  { label: "Não saiu (lay ganhou)", odd: blCalc.layOddMedia || null, stakeNative: blCalc.layStakeBRL / fator(bl.layMoeda), moeda: bl.layMoeda, stakeBRL: blCalc.layStakeBRL, lucro: blCalc.lucroSeNaoSair },
                ])}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "#00e676", color: "#0b0e1d", border: "none" }}
              >
                <TrendingUp size={13} /> {lancamento === "saving" ? "lançando…" : lancamento === "saved" ? "lançado ✓" : "Lançar operação"}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* header casas */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b90b3" }}>
          <span>Stake total alvo (se nenhuma stake estiver travada):</span>
          <input type="number" value={targetTotal} onChange={(e) => setTargetTotal(e.target.value)} className="input-field" style={{ width: 100 }} />
          <SeletorMoeda value={targetMoeda} onChange={setTargetMoeda} />
        </div>
        <button onClick={autoBalancear} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 500, background: "rgba(45,212,191,.12)", color: "#2dd4bf", border: "1px solid rgba(45,212,191,.3)" }}>
          <RefreshCw size={13} /> Auto-Balancear
        </button>
      </div>

      {/* cards das casas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14, marginBottom: 18 }}>
        {casas.map((c, idx) => (
          <div key={c.id} style={{ borderRadius: 10, border: `1px solid ${c.fixado ? "rgba(0,230,118,.4)" : "#2a2f52"}`, background: c.fixado ? "rgba(0,230,118,.03)" : "rgba(26,30,58,.9)", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "#2dd4bf" }}>Casa {idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SeletorMoeda value={c.moeda} onChange={(m) => updateCasa(c.id, { moeda: m })} />
                {casas.length > 2 && <button onClick={() => removeCasa(c.id)} style={{ background: "none", border: "none", color: "#4a5080" }}><X size={14} /></button>}
              </div>
            </div>

            <input value={c.nome} onChange={(e) => updateCasa(c.id, { nome: e.target.value })} placeholder="nome da casa" className="input-field" style={{ marginBottom: 10, fontWeight: 600, color: "#f4f4f5" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6, marginBottom: 8 }}>
              <Campo label="Comissão (%)"><input type="number" step="0.01" value={c.comissao} onChange={(e) => updateCasa(c.id, { comissao: e.target.value })} placeholder="0" className="input-field" /></Campo>
            </div>

            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Entradas (odd + stake em {sim(c.moeda)})
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
                  <button
                    onClick={() => resolverEntrada(c.id, e.id)}
                    title="calcular valor necessário pra equilibrar com outra casa travada"
                    style={{ padding: 6, borderRadius: 6, border: "1px solid #2a2f52", background: "none", color: "#00e676", flexShrink: 0 }}
                  >
                    <Calculator size={12} />
                  </button>
                  {c.entradas.length > 1 && (
                    <button onClick={() => removeEntrada(c.id, e.id)} style={{ background: "none", border: "none", color: "#4a5080" }}><X size={13} /></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => addEntrada(c.id)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2dd4bf", background: "none", border: "1px dashed rgba(45,212,191,.4)", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>
              <Plus size={11} /> adicionar entrada
            </button>

            {c.entradas.length > 1 && (
              <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }} className="mono">
                Odd média: <span style={{ color: "#e4e4e7" }}>{totaisCasa(c).oddMedia.toFixed(4)}</span> · Stake total: <span style={{ color: "#e4e4e7" }}>{fmtMoeda(totaisCasa(c).totalStake, c.moeda)}</span>
              </div>
            )}
            {c.moeda !== "BRL" && (
              <div style={{ fontSize: 10.5, color: "#6b7099", marginBottom: 8 }} className="mono">
                ≈ {fmt(totaisCasa(c).totalStake * usdToBrl)}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={() => updateCasa(c.id, { fixado: !c.fixado })} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: c.fixado ? "#00e676" : "#2a2f52", color: c.fixado ? "#0b0e1d" : "#b4b9d6", border: "none" }}>
                {c.fixado ? <Lock size={11} /> : <Unlock size={11} />} {c.fixado ? "Travada" : "Travar"}
              </button>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
              <input type="checkbox" checked={c.freebet} onChange={(e) => updateCasa(c.id, { freebet: e.target.checked })} />
              Essa é uma aposta grátis (freebet) — stake não é devolvida
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer" }}>
              <input type="checkbox" checked={c.cashback_ativo} onChange={(e) => updateCasa(c.id, { cashback_ativo: e.target.checked })} />
              Esta entrada gera cashback
            </label>

            {c.cashback_ativo && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(0,230,118,.2)", borderRadius: 8, padding: 10, background: "rgba(0,230,118,.02)" }}>
                <Campo label="Cashback (%)"><input type="number" step="0.01" value={c.cashback_pct} onChange={(e) => updateCasa(c.id, { cashback_pct: e.target.value })} className="input-field" /></Campo>
                <Campo label="Conversão (%)"><input type="number" step="0.01" value={c.conversao_pct} onChange={(e) => updateCasa(c.id, { conversao_pct: e.target.value })} className="input-field" /></Campo>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Campo label="Teto do cashback (R$, vazio = sem limite)"><input type="number" step="0.01" value={c.teto} onChange={(e) => updateCasa(c.id, { teto: e.target.value })} placeholder="sem limite" className="input-field" /></Campo>
                </div>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <Campo label={`Pagamento antecipado recebido — total (2UP, ${sim(c.moeda)}) — opcional`}>
                <input type="number" step="0.01" value={c.pagamento_antecipado} onChange={(e) => updateCasa(c.id, { pagamento_antecipado: e.target.value })} placeholder="0,00" className="input-field" />
              </Campo>
              <div style={{ fontSize: 10.5, color: "#6b7099", marginTop: 3 }}>
                O valor TOTAL pago ("ganhos possíveis"), não só o lucro — ex: apostou 1.094 a 1,83 → coloque 2.002,02
              </div>
            </div>
          </div>
        ))}

        <button onClick={addCasa} style={{ borderRadius: 10, border: "1px dashed #4a5080", color: "#8b90b3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 120, background: "none" }}>
          <Plus size={18} /> <span style={{ fontSize: 11 }}>adicionar casa</span>
        </button>
      </div>

      {temMultiplasFixadas && (
        <div style={{ fontSize: 11.5, color: "rgba(0,230,118,.8)", marginBottom: 14 }}>
          Mais de uma stake travada — o equilíbrio perfeito entre todos os resultados pode não ser possível; a primeira travada é usada como referência.
        </div>
      )}

      {/* resumo */}
      <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 18 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#d4d4d8", marginBottom: 4 }}>Resultados (em reais)</h2>
        <p style={{ fontSize: 11, color: "#6b7099", marginBottom: 14 }}>Cada casa mantém sua moeda de entrada; aqui tudo é convertido pra reais pra dar pra comparar.</p>
        {resultados.totalPagamentosAntecipados > 0 && (
          <div style={{ fontSize: 12, color: "#00e676", marginBottom: 14, background: "rgba(0,230,118,.06)", border: "1px solid rgba(0,230,118,.2)", borderRadius: 8, padding: "8px 12px" }}>
            Pagamento antecipado (2UP) somado: <strong className="mono">{fmt(resultados.totalPagamentosAntecipados)}</strong> — já incluído como lucro garantido em todas as linhas abaixo, independente do resultado final.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 14, marginBottom: 18 }}>
          <Metric label="Stake Total" value={fmtR(resultados.stakeTotal)} />
          <Metric label="Pior caso" value={fmtR(resultados.pior)} color={resultados.pior >= 0 ? "#00e676" : "#ff5a6a"} />
          <Metric label="Melhor caso" value={fmtR(resultados.melhor)} color="#00e676" />
          <Metric label="ROI min/max" value={`${resultados.roiMin.toFixed(2)}% / ${resultados.roiMax.toFixed(2)}%`} />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#8b90b3", borderBottom: "1px solid #2a2f52" }}>
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
                <tr key={l.id} style={{ borderBottom: "1px solid #23274a" }}>
                  <td style={{ padding: "8px 4px", color: "#e4e4e7", fontWeight: 500 }}>{l.nome || "—"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">
                    {l.oddMedia ? l.oddMedia.toFixed(l.numEntradas > 1 ? 4 : 2) : "-"}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">{l.comissao}%</td>
                  <td style={{ padding: "8px 4px", textAlign: "right" }} className="mono">
                    {fmtMoeda(l.stakeNative, l.moeda)}
                    {l.moeda !== "BRL" && <div style={{ fontSize: 10, color: "#6b7099" }}>≈ {fmt(l.stakeBRL)}</div>}
                  </td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#c084fc" }} className="mono">{l.cashbackPct ? `${l.cashbackPct}%` : "-"}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: l.deficit >= 0 ? "#00e676" : "#ff5a6a" }} className="mono">{l.deficit >= 0 ? "+" : ""}{fmtR(l.deficit)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", color: "#38bdf8" }} className="mono">{l.seguro > 0 ? `+${fmtR(l.seguro)}` : fmtR(0)}</td>
                  <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 600, color: l.lucro >= 0 ? "#00e676" : "#ff5a6a" }} className="mono">
                    {l.lucro >= 0 ? "+" : ""}{fmtR(l.lucro)}
                    <div style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.75 }}>{l.roi >= 0 ? "+" : ""}{l.roi.toFixed(2)}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={() => lancarOperacao(
              nomeCalculo.trim() || casas.map((c) => c.nome).filter(Boolean).join(" x ") || "Múltiplas casas",
              "multiplas",
              resultados.stakeTotal,
              resultados.linhas.map((l, i) => ({
                label: l.nome || "Casa",
                lucro: l.lucro,
                odd: l.oddMedia, stakeNative: l.stakeNative, moeda: l.moeda, freebet: !!l.freebet,
                stakeBRL: l.dinheiroRealBRL,
                payoutBRL: l.payoutBRL,
                cashbackBRL: l.cashbackOwnBRL,
              }))
            )}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "#00e676", color: "#0b0e1d", border: "none" }}
          >
            <TrendingUp size={13} /> {lancamento === "saving" ? "lançando…" : lancamento === "saved" ? "lançado ✓" : "Lançar operação"}
          </button>
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
      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500, display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, color = "#e4e4e7" }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 11, color, opacity: 0.75, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
