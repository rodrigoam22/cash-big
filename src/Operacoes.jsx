import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabase";
import { ChevronLeft, ChevronRight, TrendingUp, Activity, Trash2, Plus, Check, RefreshCw, Clock, Pencil } from "lucide-react";

const RATE_CACHE_KEY = "cashbig_usdbrl_rate";
const RATE_MAX_AGE = 24 * 60 * 60 * 1000;

const fmtBRL = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtUSD = (v) => (Number(v) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
const pad2 = (n) => String(n).padStart(2, "0");
const mesNome = (ano, mes) => new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function Operacoes() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [operacoes, setOperacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [novo, setNovo] = useState({ data: hoje.toISOString().slice(0, 10), descricao: "", apostado: "", lucro: "", odd: "", modo: "finalizada" }); // modo: "finalizada" | "pendente"
  const [resolvendoId, setResolvendoId] = useState(null);
  const [lucroManual, setLucroManual] = useState("");
  const [verificando, setVerificando] = useState(null);

  // ---------- cotação (mesma lógica/cache da Calculadora) ----------
  const [rate, setRate] = useState(null);
  const [moeda, setMoeda] = useState("USD");
  useEffect(() => {
    (async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(RATE_CACHE_KEY) || "null");
        if (cached && Date.now() - cached.updatedAt < RATE_MAX_AGE) { setRate(cached); return; }
      } catch {}
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        if (data?.rates?.BRL) {
          const payload = { value: data.rates.BRL, updatedAt: Date.now() };
          setRate(payload);
          localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(payload));
        }
      } catch (e) { console.error("Erro ao buscar cotação", e); }
    })();
  }, []);
  const usdToBrl = rate?.value || 5;
  const fmt = (v) => (moeda === "USD" ? fmtUSD((Number(v) || 0) / usdToBrl) : fmtBRL(v));

  const inicioMes = `${ano}-${pad2(mes + 1)}-01`;
  const fimMes = new Date(ano, mes + 1, 0).toISOString().slice(0, 10);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("operacoes").select("*").gte("data", inicioMes).lte("data", fimMes).order("data", { ascending: true });
    setOperacoes(data || []);
    setLoading(false);
  }, [inicioMes, fimMes]);

  useEffect(() => { carregar(); }, [carregar]);

  const mudarMes = (delta) => {
    let novoMes = mes + delta, novoAno = ano;
    if (novoMes < 0) { novoMes = 11; novoAno -= 1; }
    if (novoMes > 11) { novoMes = 0; novoAno += 1; }
    setMes(novoMes); setAno(novoAno);
  };

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
    const stake = novo.apostado === "" ? 0 : Number(novo.apostado);
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
          lucro: novo.lucro === "" ? 0 : Number(novo.lucro),
          status: "finalizado",
        };
    const { error } = await supabase.from("operacoes").insert(payload);
    if (!error) {
      setNovo({ data: hoje.toISOString().slice(0, 10), descricao: "", apostado: "", lucro: "", odd: "", modo: "finalizada" });
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
  const [coberturaResultado, setCoberturaResultado] = useState("ganhou"); // "ganhou" | "perdeu"
  const [editandoCoberturaId, setEditandoCoberturaId] = useState(null);
  const [editandoNomeId, setEditandoNomeId] = useState(null);
  const [novoNome, setNovoNome] = useState("");
  const [novaData, setNovaData] = useState("");

  const abrirEdicaoNome = (op) => {
    setEditandoNomeId(op.id);
    setNovoNome(op.descricao || "");
    setNovaData(op.data);
  };

  const salvarNome = async (op) => {
    const { error } = await supabase.from("operacoes").update({ descricao: novoNome.trim() || null, data: novaData }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setEditandoNomeId(null);
    carregar();
  };

  const lucroCobertura = (odd, stake, resultado) => {
    const o = Number(odd || 0), s = Number(stake || 0);
    if (resultado === "perdeu") return -s;
    return o > 1 ? s * (o - 1) : 0;
  };

  const abrirResolver = (op) => {
    setResolvendoId(op.id);
    setLucroManual("");
    setModoDetalhado(false);
    setStatusPontas({});
    setStakesCorrigidas({});
    setCoberturaAtiva(op.cobertura_odd != null);
    setCoberturaOdd(op.cobertura_odd ?? "");
    setCoberturaStake(op.cobertura_stake ?? "");
    setCoberturaResultado(op.cobertura_resultado ?? "ganhou");
  };

  const CoberturaForm = () => (
    <div style={{ marginTop: 10, marginBottom: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#a1a1aa", cursor: "pointer", marginBottom: coberturaAtiva ? 8 : 0 }}>
        <input type="checkbox" checked={coberturaAtiva} onChange={(e) => setCoberturaAtiva(e.target.checked)} />
        Teve cobertura/reaposta ao vivo (duplo green ou hedge)
      </label>
      {coberturaAtiva && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, border: "1px solid rgba(251,191,36,.2)", borderRadius: 8, padding: 10, background: "rgba(251,191,36,.02)" }}>
          <Campo label="Odd da reaposta"><input type="number" step="0.01" value={coberturaOdd} onChange={(e) => setCoberturaOdd(e.target.value)} placeholder="ex: 1.25" className="input-field" /></Campo>
          <Campo label="Valor apostado (R$)"><input type="number" step="0.01" value={coberturaStake} onChange={(e) => setCoberturaStake(e.target.value)} placeholder="0,00" className="input-field" /></Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 4 }}>
              Essa reaposta, sozinha, ganhou ou perdeu?
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCoberturaResultado("ganhou")} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, fontWeight: 600, border: `1px solid ${coberturaResultado === "ganhou" ? "#34d399" : "#27292e"}`, background: coberturaResultado === "ganhou" ? "rgba(52,211,153,.15)" : "transparent", color: coberturaResultado === "ganhou" ? "#34d399" : "#71717a" }}>Ganhou</button>
              <button onClick={() => setCoberturaResultado("perdeu")} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, fontWeight: 600, border: `1px solid ${coberturaResultado === "perdeu" ? "#fb7185" : "#27292e"}`, background: coberturaResultado === "perdeu" ? "rgba(244,63,94,.15)" : "transparent", color: coberturaResultado === "perdeu" ? "#fb7185" : "#71717a" }}>Perdeu</button>
            </div>
            <div style={{ fontSize: 10.5, color: "#52525b", marginTop: 4 }}>Se você reapostou no time contrário ao que já tinha entrado (hedge), marque o resultado real dessa reaposta — não assuma que ela sempre ganha.</div>
          </div>
          <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "#71717a" }}>
            Resultado dessa cobertura: <span className="mono" style={{ color: lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado) >= 0 ? "#34d399" : "#fb7185", fontWeight: 600 }}>{fmt(lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado))}</span>
          </div>
        </div>
      )}
    </div>
  );

  const confirmarResolucao = async (op, opcaoEscolhida, lucroOverride) => {
    const base = lucroOverride !== null && lucroOverride !== "" ? Number(lucroOverride) : opcaoEscolhida.lucro;
    const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado) : 0;
    const { error } = await supabase.from("operacoes").update({
      status: "finalizado",
      escolhida: opcaoEscolhida.label,
      lucro: base + covLucro,
      lucro_base: base,
      cobertura_odd: coberturaAtiva ? Number(coberturaOdd || 0) : null,
      cobertura_stake: coberturaAtiva ? Number(coberturaStake || 0) : null,
      cobertura_lucro: coberturaAtiva ? covLucro : null,
      cobertura_resultado: coberturaAtiva ? coberturaResultado : null,
    }).eq("id", op.id);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setResolvendoId(null);
    carregar();
  };

  const salvarCobertura = async (op) => {
    const base = op.lucro_base != null ? Number(op.lucro_base) : Number(op.lucro || 0);
    const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado) : 0;
    const { error } = await supabase.from("operacoes").update({
      lucro: base + covLucro,
      lucro_base: base,
      cobertura_odd: coberturaAtiva ? Number(coberturaOdd || 0) : null,
      cobertura_stake: coberturaAtiva ? Number(coberturaStake || 0) : null,
      cobertura_lucro: coberturaAtiva ? covLucro : null,
      cobertura_resultado: coberturaAtiva ? coberturaResultado : null,
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
      return { ...o, stakeBRL, payoutBRL, estimado: !temExato && corrigida === undefined };
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
    const covLucro = coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado) : 0;
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

  const PainelResolver = ({ op }) => (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500 }}>Data do jogo:</label>
        <input type="date" value={op.data} onChange={(e) => mudarData(op, e.target.value)} className="input-field" style={{ width: 150 }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button onClick={() => setModoDetalhado(false)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px solid ${!modoDetalhado ? "#fbbf24" : "#27292e"}`, background: !modoDetalhado ? "rgba(251,191,36,.12)" : "transparent", color: !modoDetalhado ? "#fbbf24" : "#71717a" }}>
          Simples (uma bateu)
        </button>
        <button onClick={() => setModoDetalhado(true)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `1px solid ${modoDetalhado ? "#fbbf24" : "#27292e"}`, background: modoDetalhado ? "rgba(251,191,36,.12)" : "transparent", color: modoDetalhado ? "#fbbf24" : "#71717a" }}>
          Detalhado (void/anulada)
        </button>
      </div>
      {modoDetalhado && temEstimativa(op) && (
        <div style={{ fontSize: 10.5, color: "#fbbf24", marginBottom: 8 }}>
          ⚠ Essa operação é antiga e não guardou a stake/retorno exato de cada ponta — os valores abaixo são estimados (apostado dividido igual entre as pontas). Confere se bate antes de confirmar.
        </div>
      )}

      {modoDetalhado ? (
        <div>
          <div style={{ fontSize: 10.5, color: "#71717a", marginBottom: 6 }}>Marca o que aconteceu em cada ponta:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {pontasComValores(op).map((o, i) => (
              <div key={i} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #27292e", background: "#0b0d10" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: "#e4e4e7" }}>{o.label}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      { v: "ganhou", label: "Ganhou", cor: "#34d399" },
                      { v: "perdeu", label: "Perdeu", cor: "#fb7185" },
                      { v: "anulado", label: "Anulado", cor: "#94a3b8" },
                    ].map((opt) => {
                      const ativo = (statusPontas[o.label] || "perdeu") === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => setStatusPontas((prev) => ({ ...prev, [o.label]: opt.v }))}
                          style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 5, fontWeight: 600, border: `1px solid ${ativo ? opt.cor : "#27292e"}`, background: ativo ? `${opt.cor}22` : "transparent", color: ativo ? opt.cor : "#71717a" }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {o.estimado && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "#fbbf24" }}>Stake estimada: {fmt(o.stakeBRL)} — corrigir pra real:</span>
                    <input
                      type="number" step="0.01"
                      value={stakesCorrigidas[o.label] ?? ""}
                      onChange={(e) => setStakesCorrigidas((prev) => ({ ...prev, [o.label]: e.target.value }))}
                      placeholder="valor real (R$)"
                      className="input-field"
                      style={{ width: 130, fontSize: 11, padding: "3px 6px" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "#52525b", marginBottom: 10 }}>
            💡 O que mais importa corrigir são as pontas marcadas "Perdeu" — a stake de uma ponta "Anulada" não muda o resultado final, já que ela sempre volta inteira.
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: "#71717a" }}>Lucro base:</span>
            <span className="mono" style={{ fontSize: 13, color: "#a1a1aa" }}>{fmt(calcularLucroDetalhado(op))}</span>
          </div>
          <CoberturaForm />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#71717a" }}>Lucro final:</span>
            <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: (calcularLucroDetalhado(op) + (coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado) : 0)) >= 0 ? "#34d399" : "#fb7185" }}>
              {fmt(calcularLucroDetalhado(op) + (coberturaAtiva ? lucroCobertura(coberturaOdd, coberturaStake, coberturaResultado) : 0))}
            </span>
          </div>
          <button onClick={() => confirmarResolucaoDetalhada(op)} style={{ width: "100%", padding: "8px 0", borderRadius: 6, fontSize: 12.5, fontWeight: 600, background: "#fbbf24", color: "#0b0d10", border: "none" }}>
            Confirmar resultado
          </button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10.5, color: "#71717a", marginBottom: 6 }}>Qual bateu?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {(op.opcoes || []).map((o, i) => (
              <button
                key={i}
                onClick={() => confirmarResolucao(op, o, lucroManual)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 6, border: "1px solid #27292e", background: "#0b0d10", color: "#e4e4e7", fontSize: 12.5 }}
              >
                <span>{o.label}</span>
                <span className="mono" style={{ color: o.lucro >= 0 ? "#34d399" : "#fb7185" }}>{fmt(o.lucro)}</span>
              </button>
            ))}
          </div>
          <Campo label="Ajustar lucro final (opcional — ex: valor real sem a cobertura)">
            <input type="number" step="0.01" value={lucroManual} onChange={(e) => setLucroManual(e.target.value)} placeholder="deixa em branco pra usar o valor da opção clicada" className="input-field" />
          </Campo>
          <CoberturaForm />
          <div style={{ fontSize: 11.5, color: "#71717a" }}>
            Clica numa opção acima pra confirmar — a cobertura marcada aqui já entra somada no lucro final.
          </div>
        </>
      )}
    </div>
  );

  // ---------- verificação automática de placar (TheSportsDB) ----------
  const verificarResultado = async (op) => {
    if (!op.evento_id) return;
    setVerificando(op.id);
    try {
      const res = await fetch(`/api/eventos?action=placar&id=${op.evento_id}`);
      const ev = await res.json();
      const finalizado = ev?.status === "FINISHED";
      const homeScore = ev?.score?.fullTime?.home;
      const awayScore = ev?.score?.fullTime?.away;

      if (!finalizado || homeScore == null || awayScore == null) {
        alert("O jogo ainda não tem placar final registrado. Tenta de novo mais tarde.");
        setVerificando(null);
        return;
      }

      const resultado = homeScore > awayScore ? "mandante" : homeScore < awayScore ? "visitante" : "empate";
      const resultadoStr = `${homeScore}-${awayScore}`;
      const opcoes = Array.isArray(op.opcoes) ? op.opcoes : [];
      const vencedora = opcoes.find((o) => o.selecao === resultado);

      if (vencedora) {
        await supabase.from("operacoes").update({
          status: "finalizado",
          escolhida: vencedora.label,
          lucro: vencedora.lucro,
          resultado_final: resultadoStr,
        }).eq("id", op.id);
      } else {
        await supabase.from("operacoes").update({ resultado_final: resultadoStr }).eq("id", op.id);
        alert(`Placar encontrado (${resultadoStr}), mas nenhuma casa estava marcada como "${resultado}". Resolve manualmente.`);
      }
      carregar();
    } catch (e) {
      console.error("Erro ao verificar resultado", e);
      alert("Não consegui buscar o resultado agora. Tenta de novo em instantes.");
    }
    setVerificando(null);
  };

  const Chart = () => {
    const w = 100, h = 36;
    const vals = resumo.evolucao;
    if (!vals.length) return null;
    const min = Math.min(0, ...vals);
    const max = Math.max(0, ...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1 || 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
    const corLinha = vals[vals.length - 1] >= 0 ? "#34d399" : "#fb7185";
    const zeroY = h - ((0 - min) / range) * h;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block" }}>
        <line x1="0" y1={zeroY} x2={w} y2={zeroY} stroke="#27292e" strokeWidth="0.5" />
        <polyline points={pts} fill="none" stroke={corLinha} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  const pendentesDoMes = operacoes.filter((o) => o.status === "pendente");
  const finalizadasDoMes = operacoes.filter((o) => o.status === "finalizado");

  return (
    <div>
      {/* navegação + moeda */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={() => mudarMes(-1)} style={{ background: "#18181b", border: "1px solid #27292e", borderRadius: 6, color: "#a1a1aa", padding: 6 }}><ChevronLeft size={15} /></button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{mesNome(ano, mes)}</div>
        <button onClick={() => mudarMes(1)} style={{ background: "#18181b", border: "1px solid #27292e", borderRadius: 6, color: "#a1a1aa", padding: 6 }}><ChevronRight size={15} /></button>

        <div style={{ display: "flex", gap: 2, background: "#18181b", border: "1px solid #27292e", borderRadius: 6, padding: 2 }}>
          {["USD", "BRL"].map((m) => (
            <button key={m} onClick={() => setMoeda(m)} style={{ padding: "4px 9px", borderRadius: 4, fontSize: 10.5, fontWeight: 600, border: "none", background: moeda === m ? "#fbbf24" : "transparent", color: moeda === m ? "#0b0d10" : "#71717a" }}>
              {m === "USD" ? "US$" : "R$"}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setMostrarForm((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#fbbf24", color: "#0b0d10", border: "none" }}>
            <Plus size={13} /> nova operação
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 14, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <button onClick={() => setNovo({ ...novo, modo: "finalizada" })} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: `1px solid ${novo.modo === "finalizada" ? "#fbbf24" : "#27292e"}`, background: novo.modo === "finalizada" ? "rgba(251,191,36,.12)" : "transparent", color: novo.modo === "finalizada" ? "#fbbf24" : "#71717a" }}>
              Já finalizada
            </button>
            <button onClick={() => setNovo({ ...novo, modo: "pendente" })} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 6, border: `1px solid ${novo.modo === "pendente" ? "#fbbf24" : "#27292e"}`, background: novo.modo === "pendente" ? "rgba(251,191,36,.12)" : "transparent", color: novo.modo === "pendente" ? "#fbbf24" : "#71717a" }}>
              Pendente — aposta simples (ex: dupla chance avulsa no 2x0)
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 10 }}>
            <Campo label="Data"><input type="date" value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} className="input-field" /></Campo>
            <Campo label="Descrição"><input type="text" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="ex: França x Bélgica" className="input-field" /></Campo>
            <Campo label="Apostado (R$)"><input type="number" step="0.01" value={novo.apostado} onChange={(e) => setNovo({ ...novo, apostado: e.target.value })} placeholder="0,00" className="input-field" /></Campo>
            {novo.modo === "pendente" ? (
              <Campo label="Odd"><input type="number" step="0.01" value={novo.odd} onChange={(e) => setNovo({ ...novo, odd: e.target.value })} placeholder="ex: 1.80" className="input-field" /></Campo>
            ) : (
              <Campo label="Lucro (R$)"><input type="number" step="0.01" value={novo.lucro} onChange={(e) => setNovo({ ...novo, lucro: e.target.value })} placeholder="0,00" className="input-field" /></Campo>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={adicionar} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "#fbbf24", color: "#0b0d10", border: "none" }}>Salvar</button>
            <button onClick={() => setMostrarForm(false)} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, background: "none", color: "#71717a", border: "1px solid #27292e" }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 14, marginBottom: 18 }}>
        <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>Total Apostado (Mês)</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: "#38bdf8" }}>{fmt(resumo.apostadoTotal)}</div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>Lucro (Mês)</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: resumo.lucroTotal >= 0 ? "#34d399" : "#fb7185" }}>{fmt(resumo.lucroTotal)}</div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4 }}>Margem (Mês)</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: resumo.lucroTotal >= 0 ? "#34d399" : "#fb7185" }}>
            {resumo.apostadoTotal ? `${((resumo.lucroTotal / resumo.apostadoTotal) * 100).toFixed(2)}%` : "0.00%"}
          </div>
        </div>
        <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 16 }}>
          <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><Activity size={12} /> Operações</div>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: "#e4e4e7" }}>
            {resumo.qtdFinalizadas}
            {resumo.qtdPendentes > 0 && <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 500 }}> · {resumo.qtdPendentes} pend.</span>}
          </div>
        </div>
      </div>

      <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#71717a", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><TrendingUp size={12} /> Evolução do Lucro</div>
        <Chart />
      </div>

      {/* calendário por dia */}
      <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 16, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10.5, color: "#71717a", fontWeight: 600, textTransform: "uppercase" }}>{d}</div>
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
            return (
              <div key={diaNum} style={{ borderRadius: 8, padding: "8px 4px", minHeight: 58, textAlign: "center", background: temDados ? (positivo ? "rgba(16,185,129,.08)" : "rgba(244,63,94,.08)") : "rgba(255,255,255,.015)", border: `1px solid ${temDados ? (positivo ? "rgba(16,185,129,.2)" : "rgba(244,63,94,.2)") : "#1c1c1f"}` }}>
                <div style={{ fontSize: 11, color: temDados ? "#e4e4e7" : "#52525b", fontWeight: 600 }}>{diaNum}</div>
                {temDados && (
                  <>
                    <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: positivo ? "#34d399" : "#fb7185", marginTop: 3 }}>{fmt(det.lucro)}</div>
                    <div style={{ fontSize: 9, color: "#52525b", marginTop: 1 }}>{det.qtd} op.</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* pendentes */}
      {pendentesDoMes.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={13} /> Pendentes ({pendentesDoMes.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendentesDoMes.slice().reverse().map((op) => (
              <div key={op.id} style={{ borderRadius: 10, border: "1px solid rgba(251,191,36,.3)", background: "rgba(251,191,36,.03)", padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: resolvendoId === op.id ? 10 : 0 }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    {editandoNomeId === op.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="input-field" style={{ fontSize: 12.5, padding: "4px 8px", width: 130 }} />
                        <input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && salvarNome(op)} className="input-field" style={{ fontSize: 12.5, padding: "4px 8px", maxWidth: 220 }} />
                        <button onClick={() => salvarNome(op)} style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 6, background: "#fbbf24", color: "#0b0d10", border: "none" }}>salvar</button>
                        <button onClick={() => setEditandoNomeId(null)} style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 6, background: "none", color: "#71717a", border: "1px solid #27292e" }}>cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 13, color: "#e4e4e7" }}>{op.descricao || "Sem descrição"}</div>
                        <button onClick={() => abrirEdicaoNome(op)} style={{ background: "none", border: "none", color: "#52525b" }}><Pencil size={11} /></button>
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: "#71717a" }} className="mono">
                      {op.data.slice(8, 10)}/{op.data.slice(5, 7)} · apostado {fmt(op.apostado)}
                      {op.evento_liga && <span> · {op.evento_liga}</span>}
                      {op.resultado_final && <span> · placar: {op.resultado_final}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {op.evento_id && (
                      <button onClick={() => verificarResultado(op)} disabled={verificando === op.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "6px 10px", borderRadius: 6, background: "rgba(45,212,191,.12)", color: "#2dd4bf", border: "1px solid rgba(45,212,191,.3)" }}>
                        <RefreshCw size={12} /> {verificando === op.id ? "verificando…" : "Verificar resultado"}
                      </button>
                    )}
                    <button onClick={() => (resolvendoId === op.id ? setResolvendoId(null) : abrirResolver(op))} style={{ fontSize: 11.5, padding: "6px 10px", borderRadius: 6, background: "#27292e", color: "#e4e4e7", border: "none" }}>
                      {resolvendoId === op.id ? "fechar" : "Resolver manualmente"}
                    </button>
                    <button onClick={() => excluir(op.id)} style={{ background: "none", border: "none", color: "#3f3f46" }}><Trash2 size={13} /></button>
                  </div>
                </div>

                {resolvendoId === op.id && <PainelResolver op={op} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* lista de finalizadas */}
      <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 4 }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "#52525b", fontSize: 12 }}>carregando…</div>
        ) : finalizadasDoMes.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#52525b", fontSize: 12 }}>Nenhuma operação finalizada nesse mês ainda.</div>
        ) : (
          finalizadasDoMes.slice().reverse().map((o) => (
            <div key={o.id} style={{ borderBottom: "1px solid #1c1c1f" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                <div className="mono" style={{ fontSize: 11, color: "#52525b", width: 60, flexShrink: 0 }}>{o.data.slice(8, 10)}/{o.data.slice(5, 7)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editandoNomeId === o.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="input-field" style={{ fontSize: 12.5, padding: "4px 8px", width: 130 }} />
                      <input autoFocus value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && salvarNome(o)} className="input-field" style={{ fontSize: 12.5, padding: "4px 8px", maxWidth: 200 }} />
                      <button onClick={() => salvarNome(o)} style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 6, background: "#fbbf24", color: "#0b0d10", border: "none" }}>salvar</button>
                      <button onClick={() => setEditandoNomeId(null)} style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 6, background: "none", color: "#71717a", border: "1px solid #27292e" }}>cancelar</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 13, color: "#e4e4e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.descricao || "Sem descrição"}</div>
                      <button onClick={() => abrirEdicaoNome(o)} style={{ background: "none", border: "none", color: "#52525b", flexShrink: 0 }}><Pencil size={11} /></button>
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: "#52525b" }}>
                    {o.escolhida ? `Bateu: ${o.escolhida}` : (o.tipo === "multiplas" ? "Múltiplas casas" : o.tipo === "backlay" ? "Back x Lay" : o.tipo === "backdc" ? "Back + Dupla Chance" : o.tipo === "dg2up" ? "Duplo Green 2UP" : "Manual")}
                    {o.resultado_final && ` · ${o.resultado_final}`}
                    {o.cobertura_odd != null && <span style={{ color: "#34d399" }}> · cobertura: +{fmt(o.cobertura_lucro)}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 11, color: "#71717a" }}>Apostado: {fmt(o.apostado)}</div>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: Number(o.lucro) >= 0 ? "#34d399" : "#fb7185" }}>{Number(o.lucro) >= 0 ? "+" : ""}{fmt(o.lucro)}</div>
                </div>
                {(o.opcoes || []).length > 0 && (
                  <button
                    onClick={() => (resolvendoId === o.id ? setResolvendoId(null) : abrirResolver(o))}
                    style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 6, background: "#27292e", color: "#a1a1aa", border: "none", flexShrink: 0 }}
                  >
                    {resolvendoId === o.id ? "fechar" : "editar resultado"}
                  </button>
                )}
                <button
                  onClick={() => (editandoCoberturaId === o.id ? setEditandoCoberturaId(null) : abrirEdicaoCobertura(o))}
                  style={{ fontSize: 10.5, padding: "4px 8px", borderRadius: 6, background: o.cobertura_odd != null ? "rgba(52,211,153,.12)" : "#27292e", color: o.cobertura_odd != null ? "#34d399" : "#a1a1aa", border: "none", flexShrink: 0 }}
                >
                  {o.cobertura_odd != null ? "editar cobertura" : "+ cobertura"}
                </button>
                <button onClick={() => excluir(o.id)} style={{ background: "none", border: "none", color: "#3f3f46", flexShrink: 0 }}><Trash2 size={13} /></button>
              </div>

              {resolvendoId === o.id && (
                <div style={{ padding: "0 14px 14px" }}>
                  <PainelResolver op={o} />
                </div>
              )}

              {editandoCoberturaId === o.id && (
                <div style={{ padding: "0 14px 14px" }}>
                  <CoberturaForm />
                  <button onClick={() => salvarCobertura(o)} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: "#fbbf24", color: "#0b0d10", border: "none" }}>
                    Salvar cobertura
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
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
