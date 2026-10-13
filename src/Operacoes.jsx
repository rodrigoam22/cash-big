import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase";
import { buscarCotacao, lerCache } from "./cotacao";
import { ChevronDown, ChevronUp, X, ChevronLeft, ChevronRight, TrendingUp, Activity, Trash2, Plus, Check, RefreshCw, Clock, Pencil } from "lucide-react";


const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v) => (Number(v) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const pad2 = (n) => String(n).padStart(2, "0");
const mesNome = (ano, mes) => new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function Operacoes() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [operacoes, setOperacoes] = useState([]);
  const [todasFin, setTodasFin] = useState([]); // todas as finalizadas, de todos os meses (pra média geral)
  const [incluirManual, setIncluirManual] = useState(true); // desmarcar pra tirar as lançadas na mão da média
  const [expId, setExpId] = useState(null);
  const [diaSel, setDiaSel] = useState(null); // "01".."31"
  const [escopoMedia, setEscopoMedia] = useState("total"); // "mes" | "total"
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [novo, setNovo] = useState({ data: hoje.toISOString().slice(0, 10), descricao: "", apostado: "", lucro: "", odd: "", modo: "finalizada", moeda: "BRL" }); // modo: "finalizada" | "pendente"
  const [resolvendoId, setResolvendoId] = useState(null);
  const [lucroManual, setLucroManual] = useState("");
  const [lucroManualMoeda, setLucroManualMoeda] = useState("BRL");

  // ---------- cotação (mesma lógica/cache da Calculadora) ----------
  const [rate, setRate] = useState(null);
  const [moeda, setMoeda] = useState("USD");
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
  const fmt = (v) => (moeda === "USD" ? fmtUSD((Number(v) || 0) / usdToBrl) : fmtBRL(v));

  const inicioMes = `${ano}-${pad2(mes + 1)}-01`;
  const fimMes = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("operacoes").select("*").gte("data", inicioMes).lte("data", fimMes).order("data", { ascending: true });
    setOperacoes(data || []);
    const { data: todas } = await supabase.from("operacoes").select("id,data,tipo,apostado,lucro,fora_media,opcoes").eq("status", "finalizado");
    setTodasFin(todas || []);
    setLoading(false);
  }, [inicioMes, fimMes]);

  useEffect(() => { carregar(); }, [carregar]);

  const mudarMes = (delta) => {
    let novoMes = mes + delta, novoAno = ano;
    if (novoMes < 0) { novoMes = 11; novoAno -= 1; }
    if (novoMes > 11) { novoMes = 0; novoAno += 1; }
    setMes(novoMes); setAno(novoAno);
  };

  // resultado da entrada = pior cenário previsto pela calculadora (ignora duplo/handicap/cobertura);
  // sem opções guardadas (operação manual), usa o lucro final
  const piorCenario = (o) => {
    const ls = (Array.isArray(o.opcoes) ? o.opcoes : []).map((x) => Number(x.lucro)).filter((v) => Number.isFinite(v));
    return ls.length ? Math.min(...ls) : Number(o.lucro || 0);
  };
  const mediaPerda = useMemo(() => {
    const base = escopoMedia === "mes" ? todasFin.filter((o) => o.data >= inicioMes && o.data <= fimMes) : todasFin;
    const contadas = base.filter((o) => !o.fora_media && (incluirManual || (o.tipo && o.tipo !== "manual")));
    const lucro = contadas.reduce((a, o) => a + piorCenario(o), 0);
    const apostado = contadas.reduce((a, o) => a + Number(o.apostado || 0), 0);
    const porTipo = {};
    contadas.forEach((o) => {
      const t = o.tipo || "manual";
      porTipo[t] = porTipo[t] || { n: 0, lucro: 0, apostado: 0 };
      porTipo[t].n += 1; porTipo[t].lucro += piorCenario(o); porTipo[t].apostado += Number(o.apostado || 0);
    });
    return { n: contadas.length, fora: base.length - contadas.length, lucro, apostado, pct: apostado ? (lucro / apostado) * 100 : 0, porJogo: contadas.length ? lucro / contadas.length : 0, porTipo };
  }, [todasFin, escopoMedia, inicioMes, fimMes, incluirManual]);
  const NOME_TIPO = { multiplas: "Múltiplas", backlay: "Back x Lay", backdc: "Back + DC", dg2up: "Duplo Green", manual: "Manual" };

  const resumo = useMemo(() => {
    const finalizadas = operacoes.filter((o) => o.status === "finalizado");
    const pendentes = operacoes.filter((o) => o.status === "pendente");
    const lucroTotal = finalizadas.reduce((acc, o) => acc + Number(o.lucro || 0), 0);
    const apostadoTotal = finalizadas.reduce((acc, o) => acc + Number(o.apostado || 0), 0);

    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const porDia = Array(diasNoMes).fill(0);
    finalizadas.forEach((o) => {
      const dia = Number(o.data.slice(8, 10)) - 1;
      if (dia >= 0 && dia < diasNoMes) porDia[dia] += Number(o.lucro || 0);
    });
    let acumulado = 0;
    const evolucao = porDia.map((v) => (acumulado += v));

    const porDiaDetalhe = {};
    finalizadas.forEach((o) => {
      const dia = o.data.slice(8, 10);
      if (!porDiaDetalhe[dia]) porDiaDetalhe[dia] = { lucro: 0, qtd: 0 };
      porDiaDetalhe[dia].lucro += Number(o.lucro || 0);
      porDiaDetalhe[dia].qtd += 1;
    });

    const primeiroDiaSemana = new Date(ano, mes, 1).getDay();

    return { lucroTotal, apostadoTotal, qtdFinalizadas: finalizadas.length, qtdPendentes: pendentes.length, evolucao, diasNoMes, porDiaDetalhe, primeiroDiaSemana };
  }, [operacoes, ano, mes]);

  const adicionar = async () => {
    const fator = novo.moeda === "USD" ? usdToBrl : 1;
    const stakeNative = novo.apostado === "" ? 0 : Number(novo.apostado);
    const stake = stakeNative * fator;
    const payload = novo.modo === "pendente"
      ? {
          data: novo.data,
          descricao: novo.descricao || null,
          tipo: "manual",
          apostado: stake,
          lucro: 0,
          status: "pendente",
          opcoes: [
            { label: "Ganhou", lucro: stake * (Number(novo.odd || 0) - 1) },
            { label: "Perdeu", lucro: -stake },
          ],
        }
      : {
          data: novo.data,
          descricao: novo.descricao || null,
          tipo: "manual",
          apostado: stake,
          lucro: (novo.lucro === "" ? 0 : Number(novo.lucro)) * fator,
          status: "finalizado",
        };
    const { error } = await supabase.from("operacoes").insert(payload);
    if (!error) {
      setNovo({ data: hoje.toISOString().slice(0, 10), descricao: "", apostado: "", lucro: "", odd: "", modo: "finalizada", moeda: "BRL" });
      setMostrarForm(false);
      carregar();
    }
  };

  const excluir = async (id) => {
    await supabase.from("operacoes").delete().eq("id", id);
    carregar();
  };

  const [modoDetalhado, setModoDetalhado] = useState(false);
  const [statusPontas, setStatusPontas] = useState({}); // { label: "ganhou" | "perdeu" | "anulado" }
  const [stakesCorrigidas, setStakesCorrigidas] = useState({}); // { label: "valor real digitado" }
  const [coberturaAtiva, setCoberturaAtiva] = useState(false);
  const [coberturaOdd, setCoberturaOdd] = useState("");
  const [coberturaStake, setCoberturaStake] = useState("");
  const [coberturaMoeda, setCoberturaMoeda] = useState("BRL");
  const [coberturaResultado, setCoberturaResultado] = useState("ganhou"); // "ganhou" | "perdeu"

  const SeletorMoedaMini = ({ value, onChange }) => (
    <div style={{ display: "flex", gap: 2, background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, padding: 2 }}>
      {["BRL", "USD"].map((m) => (
        <button key={m} onClick={() => onChange(m)} type="button" style={{ padding: "6px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, border: "none", background: value === m ? "#00e676" : "transparent", color: value === m ? "#0b0e1d" : "#8b90b3" }}>
          {m === "BRL" ? "R$" : "US$"}
        </button>
      ))}
    </div>
  );
  const [editandoCoberturaId, setEditandoCoberturaId] = useState(null);
  const [editandoNomeId, setEditandoNomeId] = useState(null);
  const [novoNome, setNovoNome] = useState("");
  const [novaData, setNovaData] = useState("");

  const abrirEdicaoNome = (op) => {
    setEditandoNomeId(op.id);
    setNovoNome(op.descricao || "");
    setNovaData(op.data);
  };

  const alternarForaMedia = async (op) => {
    const { error } = await supabase.from("operacoes").update({ fora_media: !op.fora_media }).eq("id", op.id);
    if (error) { alert("Erro ao salvar (rodou o SQL migration_fora_media?): " + error.message); return; }
    carregar();
  };

  const salvarNome = async (op) => {
    const { error } = await supabase.from("operacoes").update({ descricao: novoNome.trim() || null, data: novaData }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setEditandoNomeId(null);
    carregar();
  };

  const lucroCobertura = (odd, stake, resultado, moeda = "BRL") => {
    const o = Number(odd || 0);
    const s = Number(stake || 0) * (moeda === "USD" ? usdToBrl : 1);
    if (resultado === "perdeu") return -s;
    return o > 1 ? s * (o - 1) : 0;
  };

  const abrirResolver = (op) => {
    setResolvendoId(op.id);
    setLucroManual("");
    setLucroManualMoeda("BRL");
    setModoDetalhado(false);
    setStatusPontas({});
    setStakesCorrigidas({});
    setCoberturaAtiva(op.cobertura_odd != null);
    setCoberturaOdd(op.cobertura_odd ?? "");
    setCoberturaStake(op.cobertura_stake ?? "");
    setCoberturaMoeda(op.cobertura_moeda ?? "BRL");
    setCoberturaResultado(op.cobertura_resultado ?? "ganhou");
  };

  const CoberturaForm = () => (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#b4b9d6", cursor: "pointer", marginBottom: coberturaAtiva ? 8 : 0 }}>
        <input type="checkbox" checked={coberturaAtiva} onChange={(e) => setCoberturaAtiva(e.target.checked)} />
        Teve cobertura/reaposta ao vivo (duplo green ou hedge)
      </label>
      {coberturaAtiva && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(0,230,118,.2)", borderRadius: 8, padding: 10, background: "rgba(0,230,118,.02)" }}>
          <Campo label="Odd da reaposta"><input type="number" step="0.01" value={coberturaOdd} onChange={(e) => setCoberturaOdd(e.target.value)} placeholder="ex: 1.25" className="input-field" /></Campo>
          <Campo label="Valor apostado">
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" step="0.01" value={coberturaStake} onChange={(e) => setCoberturaStake(e.target.value)} placeholder="0,00" className="input-field" style={{ flex: 1 }} />
              <SeletorMoedaMini value={coberturaMoeda} onChange={setCoberturaMoeda} />
            </div>
          </Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Essa reaposta, sozinha, ganhou ou perdeu?
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCoberturaResultado("ganhou")} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, fontWeight: 600, border: `1px solid ${coberturaResultado === "ganhou" ? "#00e676" : "#2a2f52"}`, background: coberturaResultado === "ganhou" ? "rgba(52,211,153,.15)" : "transparent", color: coberturaResultado === "ganhou" ? "#00e676" : "#8b90b3" }}>Ganhou</button>
              <button onClick={() => setCoberturaResultado("perdeu")} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, fontWeight: 600, border: `1px solid ${coberturaResultado === "perdeu" ? "#ff5a6a" : "#2a2f52"}`, background: coberturaResultado === "perdeu" ? "rgba(244,63,94,.15)" : "transparent", color: coberturaResultado === "perdeu" ? "#ff5a6a" : "#8b90b3" }}>Perdeu</button>
            </div>
            <div style={{ fontSize: 10.5, color: "#6b7099", marginTop: 4 }}>Se você reapostou no time contrário ao que já tinha entrado (hedge), marque o resultado real dessa reaposta — não assuma que ela sempre ganha.</div>
          </div>
          <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#8b90b3" }}>
            Resultado dessa cobertura: <span className="mono" style={{ color: lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado, coberturaMoeda) >= 0 ? "#00e676" : "#ff5a6a", fontWeight: 600 }}>{fmt(lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado, coberturaMoeda))}</span>
          </div>
        </div>
      )}
    </div>
  );

  const confirmarResolucao = async (op, opcaoEscolhida, lucroOverride) => {
    const fatorManual = lucroManualMoeda === "USD" ? usdToBrl : 1;
    const base = lucroOverride !== null && lucroOverride !== "" ? Number(lucroOverride) * fatorManual : opcaoEscolhida.lucro;
    const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado, coberturaMoeda) : 0;
    const { error } = await supabase.from("operacoes").update({
      status: "finalizado",
      escolhida: opcaoEscolhida.label,
      lucro: base + covLucro,
      lucro_base: base,
      cobertura_odd: coberturaAtiva ? Number(coberturaOdd || 0) : null,
      cobertura_stake: coberturaAtiva ? Number(coberturaStake || 0) : null,
      cobertura_lucro: coberturaAtiva ? covLucro : null,
      cobertura_resultado: coberturaAtiva ? coberturaResultado : null,
      cobertura_moeda: coberturaAtiva ? coberturaMoeda : null,
    }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setResolvendoId(null);
    carregar();
  };

  const salvarCobertura = async (op) => {
    const base = op.lucro_base != null ? Number(op.lucro_base) : Number(op.lucro || 0);
    const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado, coberturaMoeda) : 0;
    const { error } = await supabase.from("operacoes").update({
      lucro: base + covLucro,
      lucro_base: base,
      cobertura_odd: coberturaAtiva ? Number(coberturaOdd || 0) : null,
      cobertura_stake: coberturaAtiva ? Number(coberturaStake || 0) : null,
      cobertura_lucro: coberturaAtiva ? covLucro : null,
      cobertura_resultado: coberturaAtiva ? coberturaResultado : null,
      cobertura_moeda: coberturaAtiva ? coberturaMoeda : null,
    }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setEditandoCoberturaId(null);
    carregar();
  };

  const abrirEdicaoCobertura = (op) => {
    setEditandoCoberturaId(op.id);
    setCoberturaAtiva(op.cobertura_odd != null);
    setCoberturaOdd(op.cobertura_odd ?? "");
    setCoberturaStake(op.cobertura_stake ?? "");
    setCoberturaMoeda(op.cobertura_moeda ?? "BRL");
    setCoberturaResultado(op.cobertura_resultado ?? "ganhou");
  };

  // pontas: têm stakeBRL/payoutBRL (só op lançada pela Múltiplas casas, depois dessa atualização)
  // operações antigas não têm stake/payout salvo por ponta — estima com base no apostado total
  // e no lucro "se essa ponta bater" que já tínhamos guardado, pra não travar o void
  const pontasComValores = (op) => {
    const opcoes = op.opcoes || [];
    const n = opcoes.length || 1;
    const apostadoTotal = Number(op.apostado || 0);
    return opcoes.map((o) => {
      const temExato = o.stakeBRL != null && o.payoutBRL != null;
      const corrigida = stakesCorrigidas[o.label];
      const stakeBRL = corrigida !== undefined && corrigida !== "" ? Number(corrigida) : (temExato ? Number(o.stakeBRL) : apostadoTotal / n);
      const payoutBRL = temExato ? Number(o.payoutBRL) : Number(o.lucro || 0) + apostadoTotal;
      return { ...o, stakeBRL, payoutBRL, temExato, estimado: !temExato };
    });
  };

  const temEstimativa = (op) => pontasComValores(op).some((o) => o.estimado);

  const calcularLucroDetalhado = (op) => {
    const opcoes = pontasComValores(op);
    let total = 0;
    for (const o of opcoes) {
      const st = statusPontas[o.label] || "perdeu";
      if (st === "ganhou") total += Number(o.payoutBRL || 0);
      else if (st === "anulado") total += Number(o.stakeBRL || 0);
      else total += Number(o.cashbackBRL || 0); // perdeu: só soma o cashback dela, se tiver
    }
    const stakeTotal = opcoes.reduce((acc, o) => acc + Number(o.stakeBRL || 0), 0);
    return total - stakeTotal;
  };

  const confirmarResolucaoDetalhada = async (op) => {
    const base = calcularLucroDetalhado(op);
    const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado, coberturaMoeda) : 0;
    const escolhidaResumo = (op.opcoes || [])
      .map((o) => `${o.label}: ${statusPontas[o.label] || "perdeu"}`)
      .join(", ");
    const { error } = await supabase.from("operacoes").update({
      status: "finalizado",
      escolhida: escolhidaResumo,
      lucro: base + covLucro,
      lucro_base: base,
      cobertura_odd: coberturaAtiva ? Number(coberturaOdd || 0) : null,
      cobertura_stake: coberturaAtiva ? Number(coberturaStake || 0) : null,
      cobertura_lucro: coberturaAtiva ? covLucro : null,
      cobertura_resultado: coberturaAtiva ? coberturaResultado : null,
      cobertura_moeda: coberturaAtiva ? coberturaMoeda : null,
    }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setResolvendoId(null);
    carregar();
  };

  const mudarData = async (op, novaDataVal) => {
    const { error } = await supabase.from("operacoes").update({ data: novaDataVal }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    carregar();
  };

  // detalhe da ponta (odd + valor apostado) pra mostrar na hora de resolver
  const moedaTxt = (v, m) => (m === "USD" ? fmtUSD(v) : m === "EUR" ? (Number(v) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : fmtBRL(v));
  const detalhePonta = (o) => {
    const partes = [];
    if (o.odd != null && Number(o.odd) > 0) partes.push(`odd ${Number(o.odd).toFixed(2)}`);
    if (o.stakeNative != null && o.moeda) {
      partes.push(`stake ${moedaTxt(o.stakeNative, o.moeda)}${o.moeda !== "BRL" && o.stakeBRL != null ? ` (≈ ${fmtBRL(o.stakeBRL)})` : ""}`);
    } else if (o.stakeBRL != null) {
      partes.push(`stake ${fmtBRL(o.stakeBRL)}`);
    }
    if (Array.isArray(o.entradas) && o.entradas.length > 1) {
      partes.push(o.entradas.map((e) => `${moedaTxt(e.stake, e.moeda || "BRL")}${e.odd ? " @" + Number(e.odd).toFixed(2) : ""}`).join(" + "));
    }
    if (o.freebet) partes.push("freebet");
    return partes.join(" · ");
  };

  const PainelResolver = ({ op }) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#8b90b3", fontWeight: 500 }}>Data do jogo:</label>
        <input type="date" value={op.data} onChange={(e) => mudarData(op, e.target.value)} className="input-field" style={{ width: 150 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button onClick={() => setModoDetalhado(false)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px solid ${!modoDetalhado ? "#00e676" : "#2a2f52"}`, background: !modoDetalhado ? "rgba(0,230,118,.12)" : "transparent", color: !modoDetalhado ? "#00e676" : "#8b90b3" }}>
          Simples (uma bateu)
        </button>
        <button onClick={() => setModoDetalhado(true)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px solid ${modoDetalhado ? "#00e676" : "#2a2f52"}`, background: modoDetalhado ? "rgba(0,230,118,.12)" : "transparent", color: modoDetalhado ? "#00e676" : "#8b90b3" }}>
          Detalhado (void/anulada)
        </button>
      </div>
      {modoDetalhado && temEstimativa(op) && (
        <div style={{ fontSize: 10.5, color: "#00e676", marginBottom: 8 }}>
          ⚠ Essa operação é antiga e não guardou a stake/retorno exato de cada ponta — os valores abaixo são estimados (apostado dividido igual entre as pontas). Confere se bate antes de confirmar.
        </div>
      )}

      {modoDetalhado ? (
        <div>
          {(() => {
            const pontas = pontasComValores(op);
            const stTotal = pontas.reduce((acc, o) => acc + Number(o.stakeBRL || 0), 0);
            const retorno = (o) => {
              const st = statusPontas[o.label] || "perdeu";
              return st === "ganhou" ? Number(o.payoutBRL || 0) : st === "anulado" ? Number(o.stakeBRL || 0) : Number(o.cashbackBRL || 0);
            };
            const totalGanho = pontas.reduce((acc, o) => acc + retorno(o), 0);
            const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado, coberturaMoeda) : 0;
            const lucroFinal = calcularLucroDetalhado(op) + covLucro;
            const chips = ["#2f80c9", "#9b59b6", "#e67e22", "#16a085", "#c0392b"];
            const opcoesRes = [
              { v: "ganhou", label: "Ganho", cor: "#00e676" },
              { v: "perdeu", label: "Perdida", cor: "#ff5a6a" },
              { v: "anulado", label: "Reembolsada / anulada", cor: "#b4b9d6" },
            ];
            return (
              <>
                {temEstimativa(op) && (
                  <div style={{ fontSize: 10.5, color: "#f59e0b", marginBottom: 10 }}>
                    ⚠ Operação antiga: não guardou a stake/retorno exato de cada ponta — valores estimados (apostado dividido igual entre as pontas). Corrija abaixo se não bater.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 14 }}>
                  {pontas.map((o, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ padding: 14, borderRadius: 10, background: "#12152b", border: "1px solid #23274a" }}>
                        <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 5, background: chips[i % chips.length], color: "#fff", marginBottom: 10 }}>PONTA {i + 1}</span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa", marginBottom: 6 }}>{o.label}</div>
                        {detalhePonta(o) && <div className="mono" style={{ fontSize: 11, color: "#8b90b3", lineHeight: 1.5 }}>{detalhePonta(o).split(" · ").map((t, k) => <div key={k}>{t}</div>)}</div>}
                        {o.estimado && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: "#f59e0b", marginBottom: 3 }}>Stake estimada: {fmt(o.stakeBRL)} — corrigir pra real (R$):</div>
                            <input
                              type="number" step="0.01"
                              value={stakesCorrigidas[o.label] ?? ""}
                              onChange={(e) => setStakesCorrigidas((prev) => ({ ...prev, [o.label]: e.target.value }))}
                              placeholder="valor real (R$)"
                              className="input-field"
                              style={{ fontSize: 11, padding: "4px 8px" }}
                            />
                          </div>
                        )}
                      </div>
                      {opcoesRes.map((opt) => {
                        const ativo = (statusPontas[o.label] || "perdeu") === opt.v;
                        return (
                          <button
                            key={opt.v}
                            onClick={() => setStatusPontas((prev) => ({ ...prev, [o.label]: opt.v }))}
                            style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, color: "#e4e4e7", background: ativo ? `${opt.cor}1f` : "#161a33", border: `1px solid ${ativo ? opt.cor : "#23274a"}`, borderLeft: `4px solid ${opt.cor}`, boxShadow: ativo ? `0 0 12px ${opt.cor}33` : "none" }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                      <div style={{ textAlign: "center", padding: "10px 8px", borderRadius: 8, background: "#12152b" }}>
                        <div style={{ fontSize: 10.5, color: "#8b90b3" }}>Retorno</div>
                        <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, color: retorno(o) > 0 ? "#00e676" : "#8b90b3" }}>{fmt(retorno(o))}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {CoberturaForm()}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, padding: "14px 0", borderTop: "1px solid #23274a", marginTop: 6, marginBottom: 12, textAlign: "center" }}>
                  <div><div style={{ fontSize: 11, color: "#8b90b3" }}>Total Apostado</div><div className="mono" style={{ fontSize: 16, fontWeight: 700, color: "#5ea8ff" }}>{fmt(stTotal)}</div></div>
                  <div><div style={{ fontSize: 11, color: "#8b90b3" }}>Total Ganho</div><div className="mono" style={{ fontSize: 16, fontWeight: 700, color: "#c084fc" }}>{fmt(totalGanho + covLucro)}</div></div>
                  <div><div style={{ fontSize: 11, color: "#8b90b3" }}>Lucro</div><div className="mono" style={{ fontSize: 16, fontWeight: 700, color: lucroFinal >= 0 ? "#00e676" : "#ff5a6a" }}>{fmt(lucroFinal)}</div></div>
                  <div><div style={{ fontSize: 11, color: "#8b90b3" }}>ROI</div><div className="mono" style={{ fontSize: 16, fontWeight: 700, color: lucroFinal >= 0 ? "#00e676" : "#ff5a6a" }}>{stTotal ? ((lucroFinal / stTotal) * 100).toFixed(2) : "0.00"}%</div></div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button onClick={() => setResolvendoId(null)} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 12.5, background: "#1a1e3a", color: "#b4b9d6", border: "1px solid #2a2f52" }}>Cancelar</button>
                  <button onClick={() => confirmarResolucaoDetalhada(op)} style={{ padding: "9px 22px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: "linear-gradient(135deg,#00e676,#00b85c)", color: "#0b0e1d", border: "none" }}>Salvar Resultado</button>
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10.5, color: "#8b90b3", marginBottom: 6 }}>Qual bateu?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {(op.opcoes || []).map((o, i) => (
              <button
                key={i}
                onClick={() => confirmarResolucao(op, o, lucroManual)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 6, border: "1px solid #2a2f52", background: "#0b0e1d", color: "#e4e4e7", fontSize: 12.5 }}
              >
                <span style={{ textAlign: "left" }}>
                  {o.label}
                  {detalhePonta(o) && <div className="mono" style={{ fontSize: 10.5, color: "#8b90b3", marginTop: 2 }}>{detalhePonta(o)}</div>}
                </span>
                <span className="mono" style={{ color: o.lucro >= 0 ? "#00e676" : "#ff5a6a" }}>{fmt(o.lucro)}</span>
              </button>
            ))}
          </div>
          <Campo label="Ajustar lucro final (opcional — ex: valor real sem a cobertura)">
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" step="0.01" value={lucroManual} onChange={(e) => setLucroManual(e.target.value)} placeholder="deixa em branco pra usar o valor da opção clicada" className="input-field" style={{ flex: 1 }} />
              <SeletorMoedaMini value={lucroManualMoeda} onChange={setLucroManualMoeda} />
            </div>
          </Campo>
          {CoberturaForm()}
          <div style={{ fontSize: 11.5, color: "#8b90b3" }}>
            Clica numa opção acima pra confirmar — a cobertura marcada aqui já entra somada no lucro final.
          </div>
        </>
      )}
    </div>
  );


  const Chart = () => {
    const w = 100, h = 36;
    const vals = resumo.evolucao;
    if (!vals.length) return null;
    const min = Math.min(0, ...vals);
    const max = Math.max(0, ...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
    const corLinha = vals[vals.length - 1] >= 0 ? "#00e676" : "#ff5a6a";
    const zeroY = h - ((0 - min) / range) * h;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block" }}>
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#2a2f52" strokeWidth="0.5" />
        <polyline points={pts} fill="none" stroke={corLinha} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  const pendentesDoMes = operacoes.filter((o) => o.status === "pendente");
  const finalizadasDoMes = operacoes.filter((o) => o.status === "finalizado");
  // ---------- linha de operação em faixa (estilo "registro") ----------
  const LinhaOp = (o, idx, pendente) => {
    const aberto = expId === o.id;
    const lucroN = Number(o.lucro || 0);
    const apostadoN = Number(o.apostado || 0);
    const roi = apostadoN ? (lucroN / apostadoN) * 100 : 0;
    const grad = pendente ? "linear-gradient(90deg,#7a4f10,#a56a12)" : "linear-gradient(90deg,#1c5a8c,#2678b5)";
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const btn = { fontSize: 11, padding: "6px 11px", borderRadius: 7, background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.12)" };
    return (
      <div key={o.id} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.08)", marginBottom: 10, background: "rgba(26,30,58,.9)" }}>
        <div onClick={() => setExpId(aberto ? null : o.id)} style={{ cursor: "pointer", background: grad, padding: "10px 14px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, rowGap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>#{idx}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: "rgba(255,255,255,.18)", color: "#fff" }}>{NOME_TIPO[o.tipo] || "Manual"}</span>
          <div style={{ flex: 1, minWidth: 150 }} onClick={editandoNomeId === o.id ? (e) => e.stopPropagation() : undefined}>
            {editandoNomeId === o.id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="input-field" style={{ fontSize: 12.5, padding: "4px 8px", width: 135 }} />
                <input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && salvarNome(o)} className="input-field" style={{ fontSize: 12.5, padding: "4px 8px", maxWidth: 220 }} />
                <button onClick={() => salvarNome(o)} style={{ fontSize: 10.5, padding: "5px 9px", borderRadius: 6, background: "#00e676", color: "#0b0e1d", border: "none", fontWeight: 700 }}>salvar</button>
                <button onClick={() => setEditandoNomeId(null)} style={{ fontSize: 10.5, padding: "5px 9px", borderRadius: 6, background: "rgba(0,0,0,.25)", color: "#fff", border: "none" }}>cancelar</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descricao || "Sem descrição"}</span>
                <button onClick={stop(() => abrirEdicaoNome(o))} style={{ background: "none", border: "none", color: "rgba(255,255,255,.65)", flexShrink: 0, padding: 0 }}><Pencil size={12} /></button>
              </div>
            )}
            <div className="mono" style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)" }}>
              {o.data.slice(8, 10)}/{o.data.slice(5, 7)}{o.evento_liga ? ` · ${o.evento_liga}` : ""}{o.resultado_final ? ` · placar ${o.resultado_final}` : ""}{o.fora_media ? " · fora da média" : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)" }}>Apostado {fmt(apostadoN)}</div>
            {!pendente && (
              <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: lucroN >= 0 ? "#7dffb3" : "#ff8a95" }}>
                {lucroN >= 0 ? "+" : ""}{fmt(lucroN)} <span style={{ fontWeight: 600, fontSize: 11 }}>· ROI {roi.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 6, background: "rgba(0,0,0,.25)", color: "#fff" }}>{pendente ? "Pendente" : "Finalizado"}</span>
          <button onClick={stop(() => excluir(o.id))} title="Excluir" style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", padding: 0 }}><Trash2 size={14} /></button>
          {aberto ? <ChevronUp size={16} color="#fff" /> : <ChevronDown size={16} color="#fff" />}
        </div>

        {aberto && (
          <div style={{ padding: 14 }}>
            {(o.opcoes || []).length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 12 }}>
                {(o.opcoes || []).map((p, i) => {
                  const bateu = o.escolhida && o.escolhida === p.label;
                  return (
                    <div key={i} style={{ padding: 12, borderRadius: 10, background: "#12152b", border: `1px solid ${bateu ? "#00e676" : "#23274a"}` }}>
                      <div style={{ fontSize: 10, color: "#8b90b3", fontWeight: 700, marginBottom: 4 }}>PONTA {i + 1}{bateu ? " · BATEU" : ""}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa", marginBottom: 4 }}>{p.label}</div>
                      {detalhePonta(p) && <div className="mono" style={{ fontSize: 10.5, color: "#8b90b3" }}>{detalhePonta(p)}</div>}
                      <div className="mono" style={{ fontSize: 11, marginTop: 6, color: Number(p.lucro) >= 0 ? "#00e676" : "#ff5a6a" }}>se bater: {Number(p.lucro) >= 0 ? "+" : ""}{fmt(p.lucro)}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {o.cobertura_odd != null && (
              <div className="mono" style={{ fontSize: 11, marginBottom: 10, color: Number(o.cobertura_lucro) >= 0 ? "#00e676" : "#ff5a6a" }}>
                cobertura: {Number(o.cobertura_lucro) >= 0 ? "+" : ""}{fmt(o.cobertura_lucro)}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {pendente ? (
                <>
                  <button onClick={() => abrirResolver(o)} style={{ ...btn, background: "linear-gradient(135deg,#00e676,#00b85c)", color: "#0b0e1d", fontWeight: 700, border: "none" }}>Definir resultados</button>
                </>
              ) : (
                <>
                  {(o.opcoes || []).length > 0 && <button onClick={() => abrirResolver(o)} style={btn}>editar resultado</button>}
                  <button onClick={() => (editandoCoberturaId === o.id ? setEditandoCoberturaId(null) : abrirEdicaoCobertura(o))} style={{ ...btn, color: o.cobertura_odd != null ? "#7dffb3" : "#fff" }}>
                    {o.cobertura_odd != null ? "editar cobertura" : "+ cobertura"}
                  </button>
                  <button onClick={() => alternarForaMedia(o)} title="Marcar bônus ou lucro por duplo/handicap pra não entrar na perda média" style={{ ...btn, color: o.fora_media ? "#7dffb3" : "#fff" }}>
                    {o.fora_media ? "fora da média" : "conta na média"}
                  </button>
                </>
              )}
            </div>
            {editandoCoberturaId === o.id && (
              <div style={{ marginTop: 12 }}>
                {CoberturaForm()}
                <button onClick={() => salvarCobertura(o)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "linear-gradient(135deg,#00e676,#00b85c)", color: "#0b0e1d", border: "none" }}>Salvar cobertura</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const opResolvendo = resolvendoId ? operacoes.find((x) => x.id === resolvendoId) : null;


  return (
    <div>
      {/* navegação + moeda */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={() => mudarMes(-1)} style={{ background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, color: "#b4b9d6", padding: 6 }}><ChevronLeft size={15} /></button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{mesNome(ano, mes)}</div>
        <button onClick={() => mudarMes(1)} style={{ background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, color: "#b4b9d6", padding: 6 }}><ChevronRight size={15} /></button>

        <div style={{ display: "flex", gap: 2, background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, padding: 2 }}>
          {["USD", "BRL"].map((m) => (
            <button key={m} onClick={() => setMoeda(m)} style={{ padding: "4px 9px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, border: "none", background: moeda === m ? "#00e676" : "transparent", color: moeda === m ? "#0b0e1d" : "#8b90b3" }}>
              {m === "USD" ? "US$" : "R$"}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setMostrarForm((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#00e676", color: "#0b0e1d", border: "none" }}>
            <Plus size={13} /> nova operação
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 14, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setNovo({ ...novo, modo: "finalizada" })} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: `1px solid ${novo.modo === "finalizada" ? "#00e676" : "#2a2f52"}`, background: novo.modo === "finalizada" ? "rgba(0,230,118,.12)" : "transparent", color: novo.modo === "finalizada" ? "#00e676" : "#8b90b3" }}>
              Já finalizada
            </button>
            <button onClick={() => setNovo({ ...novo, modo: "pendente" })} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: `1px solid ${novo.modo === "pendente" ? "#f59e0b" : "#2a2f52"}`, background: novo.modo === "pendente" ? "rgba(245,158,11,.12)" : "transparent", color: novo.modo === "pendente" ? "#f59e0b" : "#8b90b3" }}>
              Pendente — aposta simples (ex: dupla chance avulsa no 2x0)
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 10 }}>
            <Campo label="Data"><input type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} className="input-field" /></Campo>
            <Campo label="Descrição"><input type="text" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="ex: França x Bélgica" className="input-field" /></Campo>
            <Campo label="Apostado">
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" step="0.01" value={novo.apostado} onChange={(e) => setNovo({ ...novo, apostado: e.target.value })} placeholder="0,00" className="input-field" style={{ flex: 1 }} />
                <SeletorMoedaMini value={novo.moeda} onChange={(m) => setNovo({ ...novo, moeda: m })} />
              </div>
            </Campo>
            {novo.modo === "pendente" ? (
              <Campo label="Odd"><input type="number" step="0.01" value={novo.odd} onChange={(e) => setNovo({ ...novo, odd: e.target.value })} placeholder="ex: 1.80" className="input-field" /></Campo>
            ) : (
              <Campo label={`Lucro (${novo.moeda === "USD" ? "US$" : "R$"})`}><input type="number" step="0.01" value={novo.lucro} onChange={(e) => setNovo({ ...novo, lucro: e.target.value })} placeholder="0,00" className="input-field" /></Campo>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={adicionar} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#00e676", color: "#0b0e1d", border: "none" }}>Salvar</button>
            <button onClick={() => setMostrarForm(false)} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "none", color: "#8b90b3", border: "1px solid #2a2f52" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginBottom: 18 }}>
        <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Total Apostado (Mês)</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: "#38bdf8" }}>{fmt(resumo.apostadoTotal)}</div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Lucro (Mês)</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: resumo.lucroTotal >= 0 ? "#00e676" : "#ff5a6a" }}>{fmt(resumo.lucroTotal)}</div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4 }}>Margem (Mês)</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: resumo.lucroTotal >= 0 ? "#00e676" : "#ff5a6a" }}>
            {resumo.apostadoTotal ? `${((resumo.lucroTotal / resumo.apostadoTotal) * 100).toFixed(2)}%` : "0.00%"}
          </div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><Activity size={12} /> Operações</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: "#e4e4e7" }}>
            {resumo.qtdFinalizadas}
            {resumo.qtdPendentes > 0 && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 500 }}> · {resumo.qtdPendentes} pend.</span>}
          </div>
        </div>
      </div>

      {/* média de perda (só operações que contam) */}
      <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#8b90b3" }}>Perda média por operação <span style={{ color: "#6b7099" }}>(pior cenário previsto, sem duplo/handicap/cobertura · sem as marcadas "fora da média")</span></div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#8b90b3", cursor: "pointer" }}>
            <input type="checkbox" checked={incluirManual} onChange={(e) => setIncluirManual(e.target.checked)} /> incluir manuais
          </label>
          <div style={{ display: "flex", gap: 2, background: "#0b0e1d", border: "1px solid #2a2f52", borderRadius: 6, padding: 2 }}>
            {[["total", "Total"], ["mes", "Mês"]].map(([v, l]) => (
              <button key={v} onClick={() => setEscopoMedia(v)} style={{ padding: "3px 9px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, border: "none", background: escopoMedia === v ? "#00e676" : "transparent", color: escopoMedia === v ? "#0b0e1d" : "#8b90b3" }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: mediaPerda.pct >= 0 ? "#00e676" : "#ff5a6a" }}>{mediaPerda.pct >= 0 ? "+" : ""}{mediaPerda.pct.toFixed(2)}%</div>
            <div style={{ fontSize: 10.5, color: "#6b7099" }}>do apostado (ponderada)</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: mediaPerda.porJogo >= 0 ? "#00e676" : "#ff5a6a" }}>{mediaPerda.porJogo >= 0 ? "+" : ""}{fmt(mediaPerda.porJogo)}</div>
            <div style={{ fontSize: 10.5, color: "#6b7099" }}>por jogo</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 14, color: "#e4e4e7" }}>{mediaPerda.n} <span style={{ color: "#6b7099", fontSize: 11 }}>contadas</span></div>
            <div style={{ fontSize: 10.5, color: "#6b7099" }}>{mediaPerda.fora} fora da média</div>
          </div>
        </div>
        {Object.keys(mediaPerda.porTipo).length > 0 && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: "1px solid #23274a" }}>
            {Object.entries(mediaPerda.porTipo).map(([t, v]) => (
              <div key={t} className="mono" style={{ fontSize: 11, color: "#8b90b3" }}>
                {NOME_TIPO[t] || t}: <span style={{ color: v.lucro >= 0 ? "#00e676" : "#ff5a6a" }}>{v.apostado ? ((v.lucro / v.apostado) * 100).toFixed(2) : "0.00"}%</span> <span style={{ color: "#6b7099" }}>({v.n})</span>
              </div>
            ))}
          </div>
        )}
      </div>


      <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><TrendingUp size={12} /> Evolução do Lucro</div>
        <Chart />
      </div>

      {/* calendário por dia */}
      <div style={{ borderRadius: 10, border: "1px solid #2a2f52", background: "rgba(26,30,58,.9)", padding: 16, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, color: "#8b90b3", fontWeight: 600, textTransform: "uppercase" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {Array.from({ length: resumo.primeiroDiaSemana }).map((_, i) => <div key={`vazio-${i}`} />)}
          {Array.from({ length: resumo.diasNoMes }).map((_, i) => {
            const diaNum = i + 1;
            const diaStr = pad2(diaNum);
            const det = resumo.porDiaDetalhe[diaStr];
            const temDados = !!det;
            const positivo = temDados && det.lucro >= 0;
            const selecionado = diaSel === diaStr;
            const hj = new Date(); const ehHoje = hj.getFullYear() === ano && hj.getMonth() === mes && hj.getDate() === diaNum;
            return (
              <div key={diaNum} onClick={() => setDiaSel(selecionado ? null : diaStr)} style={{ cursor: "pointer", outline: selecionado ? "2px solid #00e676" : "none", borderRadius: 8, padding: "8px 4px", minHeight: 58, textAlign: "center", background: temDados ? (positivo ? "rgba(16,185,129,.08)" : "rgba(244,63,94,.08)") : "rgba(255,255,255,.015)", border: ehHoje ? "2px solid #3b82f6" : `1px solid ${temDados ? (positivo ? "rgba(16,185,129,.2)" : "rgba(244,63,94,.2)") : "#23274a"}` }}>
                <div style={{ fontSize: 11, color: temDados ? "#e4e4e7" : "#6b7099", fontWeight: 600 }}>{diaNum}</div>
                {temDados && (
                  <>
                    <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: positivo ? "#00e676" : "#ff5a6a", marginTop: 3 }}>{fmt(det.lucro)}</div>
                    <div style={{ fontSize: 9, color: "#6b7099", marginTop: 1 }}>{det.qtd} op.</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {diaSel && (() => {
          const doDia = operacoes.filter((o) => o.data.slice(8, 10) === diaSel);
          const fin = doDia.filter((o) => o.status === "finalizado");
          const somaLucro = fin.reduce((a, o) => a + Number(o.lucro || 0), 0);
          const nomeTipo = (t) => (t === "multiplas" ? "Múltiplas" : t === "backlay" ? "Back x Lay" : t === "backdc" ? "Back + DC" : t === "dg2up" ? "Duplo Green" : "Manual");
          return (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #23274a" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#e4e4e7", fontWeight: 600 }}>Dia {diaSel}/{pad2(mes + 1)} · {doDia.length} op.</div>
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: somaLucro >= 0 ? "#00e676" : "#ff5a6a" }}>{somaLucro >= 0 ? "+" : ""}{fmt(somaLucro)}</div>
              </div>
              {doDia.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "#6b7099" }}>Nenhuma operação nesse dia.</div>
              ) : doDia.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #23274a" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descricao || "Sem descrição"}</div>
                    <div style={{ fontSize: 10.5, color: "#6b7099" }}>{nomeTipo(o.tipo)}{o.escolhida ? ` · Bateu: ${o.escolhida}` : ""}{o.fora_media ? " · fora da média" : ""}</div>
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "#8b90b3" }}>{fmt(o.apostado)}</div>
                  {o.status === "finalizado" ? (
                    <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 80, textAlign: "right", color: Number(o.lucro) >= 0 ? "#00e676" : "#ff5a6a" }}>{Number(o.lucro) >= 0 ? "+" : ""}{fmt(o.lucro)}</div>
                  ) : (
                    <div style={{ fontSize: 10.5, color: "#f59e0b", minWidth: 80, textAlign: "right" }}>pendente</div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* pendentes */}
      {pendentesDoMes.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={14} /> Pendentes ({pendentesDoMes.length})
          </div>
          {pendentesDoMes.slice().reverse().map((op, i) => LinhaOp(op, pendentesDoMes.length - i, true))}
        </div>
      )}

      {/* finalizadas */}
      <div>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "#6b7099", fontSize: 12 }}>carregando…</div>
        ) : finalizadasDoMes.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#6b7099", fontSize: 12 }}>Nenhuma operação finalizada nesse mês ainda.</div>
        ) : (
          finalizadasDoMes.slice().reverse().map((o, i) => LinhaOp(o, finalizadasDoMes.length - i, false))
        )}
      </div>

      {/* janela: definir resultados */}
      {opResolvendo && (
        <div onClick={() => setResolvendoId(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,7,18,.72)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 980, borderRadius: 16, background: "#1a1e3a", border: "1px solid #2a2f52", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#fafafa" }}>🎯 Definir Resultados — {opResolvendo.descricao || "operação"}</div>
                <div style={{ fontSize: 12, color: "#8b90b3", marginTop: 2 }}>Selecione o resultado de cada ponta</div>
              </div>
              <button onClick={() => setResolvendoId(null)} style={{ background: "none", border: "none", color: "#8b90b3" }}><X size={20} /></button>
            </div>
            {PainelResolver({ op: opResolvendo })}
          </div>
        </div>
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
