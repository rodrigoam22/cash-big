import React, { useState, useEffect, useMemo } from "react";
import { inserir, atualizar } from "./db";
import { n, paraBRL, deBRL, fmtMoeda, fmtVis, sinal, SIMB, hojeLocal, plPernaBRL } from "./moeda";
import { C, Campo, Seletor, SeletorMoeda, CORES_PERNA, STATUS_CONTA, Chip } from "./ui";
import { Pin, RotateCcw, Save, AlertTriangle } from "lucide-react";

const pernaVazia = (moeda = "USD") => ({ conta_id: "", selecao: "", odd: "", stake: "", moeda });
const estadoInicial = () => ({
  data: hojeLocal(),
  evento: "",
  esporte: "Futebol",
  obs: "",
  vias: 2,
  pernas: [pernaVazia(), pernaVazia()],
  modo: "total", // "total" | "fixa" | "manual"
  total: "",
  totalMoeda: "USD",
  ancora: 0,
  arred: "0.01",
});

const arredondar = (v, passo) => {
  const p = Number(passo) || 0.01;
  return Math.round(v / p) * p;
};

export default function NovaSurebet({ casas, parcerias, contas, taxa: taxaAtual, vis, recarregar, editando, onSalvo, onCancelarEdicao, irCadastros }) {
  const [f, setF] = useState(estadoInicial);
  const [salvando, setSalvando] = useState(false);

  // carregar surebet em edição
  useEffect(() => {
    if (!editando) return;
    setF({
      data: editando.data,
      evento: editando.evento || "",
      esporte: editando.esporte || "Futebol",
      obs: editando.obs || "",
      vias: editando.vias || (editando.pernas || []).length || 2,
      pernas: (editando.pernas || []).map((p) => ({ ...p, odd: String(p.odd ?? ""), stake: String(p.stake ?? "") })),
      modo: "manual",
      total: "",
      totalMoeda: "USD",
      ancora: 0,
      arred: "0.01",
    });
  }, [editando]);

  // em edição usa a cotação gravada na época (não muda o histórico)
  const taxa = editando?.taxa?.usd ? editando.taxa : taxaAtual;

  const casaPorId = useMemo(() => Object.fromEntries(casas.map((c) => [c.id, c])), [casas]);
  const parcPorId = useMemo(() => Object.fromEntries(parcerias.map((p) => [p.id, p])), [parcerias]);
  const contaPorId = useMemo(() => Object.fromEntries(contas.map((c) => [c.id, c])), [contas]);
  const contasAgrupadas = useMemo(
    () =>
      [...parcerias]
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .map((p) => ({
          parceria: p,
          contas: contas
            .filter((c) => c.parceria_id === p.id && casaPorId[c.casa_id])
            .sort((a, b) => casaPorId[a.casa_id].nome.localeCompare(casaPorId[b.casa_id].nome)),
        }))
        .filter((g) => g.contas.length),
    [parcerias, contas, casaPorId]
  );

  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const setPerna = (i, patch) => setF((prev) => ({ ...prev, pernas: prev.pernas.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));

  const mudarVias = (v) => {
    setF((prev) => {
      const pernas = [...prev.pernas];
      while (pernas.length < v) pernas.push(pernaVazia(prev.pernas[0]?.moeda || "USD"));
      return { ...prev, vias: v, pernas: pernas.slice(0, v), ancora: Math.min(prev.ancora, v - 1) };
    });
  };

  const escolherConta = (i, contaId) => {
    const conta = contaPorId[contaId];
    const casa = conta && casaPorId[conta.casa_id];
    setPerna(i, { conta_id: contaId, ...(casa?.moeda ? { moeda: casa.moeda } : {}) });
  };

  // ---------- cálculo ----------
  const calc = useMemo(() => {
    const odds = f.pernas.map((p) => n(p.odd));
    const validas = odds.length > 0 && odds.every((o) => o > 1);
    const somaInv = validas ? odds.reduce((a, o) => a + 1 / o, 0) : 0;
    const margem = validas ? (1 / somaInv - 1) * 100 : null;

    let stakes = f.pernas.map((p) => n(p.stake));
    if (validas && f.modo === "total" && n(f.total) > 0) {
      const totalBRL = paraBRL(f.total, f.totalMoeda, taxa);
      stakes = f.pernas.map((p, i) => arredondar(deBRL((totalBRL * (1 / odds[i])) / somaInv, p.moeda, taxa), f.arred));
    } else if (validas && f.modo === "fixa") {
      const a = f.ancora;
      const baseBRL = paraBRL(f.pernas[a].stake, f.pernas[a].moeda, taxa);
      stakes = f.pernas.map((p, i) => (i === a ? n(p.stake) : arredondar(deBRL((baseBRL * odds[a]) / odds[i], p.moeda, taxa), f.arred)));
    } else if (f.modo !== "manual") {
      stakes = f.pernas.map(() => 0);
    }

    const stakesBRL = stakes.map((s, i) => paraBRL(s, f.pernas[i].moeda, taxa));
    const totalBRL = stakesBRL.reduce((a, s) => a + s, 0);
    const cenarios = f.pernas.map((p, i) => ({
      retorno: stakes[i] * odds[i],
      lucroBRL: paraBRL(stakes[i] * odds[i], p.moeda, taxa) - totalBRL,
    }));
    const lucros = cenarios.map((c) => c.lucroBRL);
    const temStake = totalBRL > 0 && odds.every((o) => o > 1);
    return {
      odds, validas, margem, stakes, stakesBRL, totalBRL, cenarios, temStake,
      min: temStake ? Math.min(...lucros) : 0,
      max: temStake ? Math.max(...lucros) : 0,
    };
  }, [f, taxa]);

  const pctMin = calc.totalBRL ? (calc.min / calc.totalBRL) * 100 : 0;

  // ---------- salvar ----------
  const salvar = async () => {
    if (!calc.temStake) { alert("Preencha as odds e as stakes de todas as pernas."); return; }
    setSalvando(true);
    const pernas = f.pernas.map((p, i) => {
      const conta = contaPorId[p.conta_id];
      const casa = conta ? casaPorId[conta.casa_id] : null;
      const parc = conta ? parcPorId[conta.parceria_id] : null;
      return {
        conta_id: p.conta_id || null,
        casa_id: casa?.id || p.casa_id || null,
        parceria_id: parc?.id || p.parceria_id || null,
        casa_nome: casa?.nome || p.casa_nome || "",
        parceria_nome: parc?.nome || p.parceria_nome || "",
        selecao: p.selecao.trim(),
        odd: calc.odds[i],
        stake: Math.round(calc.stakes[i] * 100) / 100,
        moeda: p.moeda,
        resultado: editando?.status === "finalizado" ? p.resultado || null : null,
      };
    });
    const finalizada = editando?.status === "finalizado" && pernas.every((p) => p.resultado);
    const linha = {
      data: f.data,
      evento: f.evento.trim() || null,
      esporte: f.esporte || null,
      obs: f.obs.trim() || null,
      vias: f.vias,
      pernas,
      taxa,
      apostado_brl: pernas.reduce((a, p) => a + paraBRL(p.stake, p.moeda, taxa), 0),
      lucro_brl: finalizada ? pernas.reduce((a, p) => a + plPernaBRL(p, taxa), 0) : 0,
      status: finalizada ? "finalizado" : "pendente",
    };
    try {
      if (editando) await atualizar("surebets", editando.id, linha);
      else await inserir("surebets", linha);
      await recarregar();
      setF(estadoInicial());
      onSalvo();
    } catch (e) {
      alert("Erro ao salvar: " + (e.message || e));
    }
    setSalvando(false);
  };

  const semContas = contas.length === 0;

  return (
    <div>
      {editando && (
        <div style={{ ...C.card, borderColor: "#f59e0b", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 12 }}>
          <span style={{ fontSize: 12.5, color: "#fbbf24" }}>Editando surebet de {editando.data.slice(8, 10)}/{editando.data.slice(5, 7)} — {editando.evento || "sem evento"}</span>
          <button onClick={() => { setF(estadoInicial()); onCancelarEdicao(); }} style={{ ...C.btnCinza, marginLeft: "auto", padding: "5px 10px", fontSize: 11.5 }}>cancelar edição</button>
        </div>
      )}

      {semContas && (
        <div style={{ ...C.card, marginBottom: 14, fontSize: 12.5, color: "#b4b9d6", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          Você ainda não tem contas cadastradas. Cadastre casas e parcerias e ligue uma à outra para escolher em cada perna.
          <button onClick={irCadastros} style={{ ...C.btnVerde, padding: "6px 12px", fontSize: 11.5 }}>ir para Parcerias &amp; Casas</button>
        </div>
      )}

      {/* dados do evento */}
      <div style={{ ...C.card, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, alignItems: "end" }}>
          <Campo label="Data"><input type="date" value={f.data} onChange={(e) => set({ data: e.target.value })} className="input-field" /></Campo>
          <Campo label="Evento" style={{ gridColumn: "span 2" }}><input value={f.evento} onChange={(e) => set({ evento: e.target.value })} placeholder="ex: Flamengo x Palmeiras" className="input-field" /></Campo>
          <Campo label="Esporte">
            <input list="esportes" value={f.esporte} onChange={(e) => set({ esporte: e.target.value })} className="input-field" />
            <datalist id="esportes">{["Futebol", "Basquete", "Tênis", "Vôlei", "Hóquei", "eSports", "Outro"].map((e) => <option key={e} value={e} />)}</datalist>
          </Campo>
          <Campo label="Vias">
            <Seletor opcoes={[[2, "2 vias"], [3, "3 vias"]]} value={f.vias} onChange={mudarVias} />
          </Campo>
        </div>
      </div>

      {/* configuração das stakes */}
      <div style={{ ...C.card, marginBottom: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
        <Campo label="Como calcular as stakes">
          <Seletor opcoes={[["total", "Stake total"], ["fixa", "Fixar uma perna"], ["manual", "Manual"]]} value={f.modo} onChange={(m) => set({ modo: m })} />
        </Campo>
        {f.modo === "total" && (
          <Campo label="Investimento total">
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" step="0.01" value={f.total} onChange={(e) => set({ total: e.target.value })} placeholder="0,00" className="input-field" style={{ width: 130 }} />
              <SeletorMoeda value={f.totalMoeda} onChange={(m) => set({ totalMoeda: m })} />
            </div>
          </Campo>
        )}
        {f.modo !== "manual" && (
          <Campo label="Arredondar stakes">
            <select value={f.arred} onChange={(e) => set({ arred: e.target.value })} className="input-field" style={{ width: 120 }}>
              <option value="0.01">centavos</option>
              <option value="0.5">0,50</option>
              <option value="1">1</option>
              <option value="5">5</option>
            </select>
          </Campo>
        )}
        <div style={{ fontSize: 11, color: "#6b7099", flex: 1, minWidth: 200 }}>
          {f.modo === "total" && "Divide o total entre as pernas pra lucrar igual em qualquer resultado."}
          {f.modo === "fixa" && "Clique no alfinete da perna que tem valor fixo (ex: limite da casa) e digite a stake dela — as outras são calculadas."}
          {f.modo === "manual" && "Você digita a stake de cada perna livremente."}
        </div>
      </div>

      {/* pernas */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${f.vias === 3 ? 240 : 300}px,1fr))`, gap: 12, marginBottom: 14 }}>
        {f.pernas.map((p, i) => {
          const conta = contaPorId[p.conta_id];
          const editavel = f.modo === "manual" || (f.modo === "fixa" && f.ancora === i);
          const cen = calc.cenarios[i];
          const stakeMostrada = editavel ? p.stake : calc.stakes[i] ? String(Math.round(calc.stakes[i] * 100) / 100) : "";
          const saldo = conta?.saldo != null && conta.saldo !== "" ? n(conta.saldo) : null;
          const casaConta = conta ? casaPorId[conta.casa_id] : null;
          const passouSaldo = saldo != null && casaConta?.moeda === p.moeda && calc.stakes[i] > saldo;
          return (
            <div key={i} style={{ ...C.card, padding: 14, borderTop: `3px solid ${CORES_PERNA[i]}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 5, background: CORES_PERNA[i], color: "#fff" }}>PERNA {i + 1}</span>
                {f.modo === "fixa" && (
                  <button onClick={() => set({ ancora: i })} title="Fixar esta perna" style={{ background: f.ancora === i ? "rgba(0,230,118,.15)" : "none", border: `1px solid ${f.ancora === i ? "#00e676" : "#2a2f52"}`, borderRadius: 6, color: f.ancora === i ? "#00e676" : "#6b7099", padding: "3px 6px", display: "flex" }}>
                    <Pin size={13} />
                  </button>
                )}
              </div>

              <Campo label="Parceria · Casa" style={{ marginBottom: 10 }}>
                <select value={p.conta_id || ""} onChange={(e) => escolherConta(i, e.target.value)} className="input-field">
                  <option value="">{p.casa_nome ? `${p.parceria_nome || "—"} · ${p.casa_nome} (removida)` : "— escolher conta —"}</option>
                  {contasAgrupadas.map((g) => (
                    <optgroup key={g.parceria.id} label={g.parceria.nome}>
                      {g.contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {casaPorId[c.casa_id].nome}{c.status && c.status !== "ativa" ? ` (${STATUS_CONTA[c.status]?.label.toLowerCase()})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {conta && (
                  <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                    {conta.status && conta.status !== "ativa" && <Chip cor={STATUS_CONTA[conta.status]?.cor}>{STATUS_CONTA[conta.status]?.label}</Chip>}
                    {saldo != null && <span className="mono" style={{ fontSize: 10.5, color: passouSaldo ? "#ff8a95" : "#6b7099" }}>saldo {fmtMoeda(saldo, casaConta?.moeda || "BRL")}{passouSaldo ? " · stake maior que o saldo" : ""}</span>}
                  </div>
                )}
              </Campo>

              <Campo label="Seleção / mercado" style={{ marginBottom: 10 }}>
                <input value={p.selecao} onChange={(e) => setPerna(i, { selecao: e.target.value })} placeholder={i === 0 ? "ex: Over 2.5" : i === 1 ? "ex: Under 2.5" : "ex: Empate"} className="input-field" />
              </Campo>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8, marginBottom: 10 }}>
                <Campo label="Odd"><input type="number" step="0.01" value={p.odd} onChange={(e) => setPerna(i, { odd: e.target.value })} placeholder="2.05" className="input-field" /></Campo>
                <Campo label={`Stake (${SIMB[p.moeda]})`}>
                  <input
                    type="number" step="0.01"
                    value={stakeMostrada}
                    readOnly={!editavel}
                    onChange={(e) => setPerna(i, { stake: e.target.value })}
                    placeholder={editavel ? "0,00" : "calculada"}
                    className="input-field"
                    style={editavel ? {} : { background: "#0f1226", color: "#00e676", fontWeight: 700 }}
                  />
                </Campo>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <SeletorMoeda small value={p.moeda} onChange={(m) => setPerna(i, { moeda: m })} />
                {calc.temStake && (
                  <div className="mono" style={{ textAlign: "right", fontSize: 11 }}>
                    <div style={{ color: "#8b90b3" }}>retorno {fmtMoeda(cen.retorno, p.moeda)}</div>
                    <div style={{ color: cen.lucroBRL >= 0 ? "#00e676" : "#ff5a6a", fontWeight: 700 }}>se bater: {sinal(cen.lucroBRL)}{fmtVis(cen.lucroBRL, vis, taxa)}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* resultado */}
      <div style={{ ...C.card, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "#8b90b3" }}>Margem da surebet</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: calc.margem == null ? "#6b7099" : calc.margem >= 0 ? "#00e676" : "#ff5a6a" }}>
              {calc.margem == null ? "—" : `${calc.margem.toFixed(2)}%`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#8b90b3" }}>Total investido</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "#5ea8ff" }}>{fmtVis(calc.totalBRL, vis, taxa)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#8b90b3" }}>Lucro mínimo</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: calc.min >= 0 ? "#00e676" : "#ff5a6a" }}>{calc.temStake ? `${sinal(calc.min)}${fmtVis(calc.min, vis, taxa)}` : "—"}</div>
            {calc.temStake && <div className="mono" style={{ fontSize: 10.5, color: "#6b7099" }}>{pctMin.toFixed(2)}%</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#8b90b3" }}>Lucro máximo</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: calc.max >= 0 ? "#00e676" : "#ff5a6a" }}>{calc.temStake ? `${sinal(calc.max)}${fmtVis(calc.max, vis, taxa)}` : "—"}</div>
          </div>
        </div>
        {calc.margem != null && calc.margem < 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, color: "#ff8a95" }}>
            <AlertTriangle size={14} /> Essas odds não formam surebet (soma das probabilidades acima de 100%).
          </div>
        )}
      </div>

      <Campo label="Observação (opcional)" style={{ marginBottom: 14 }}>
        <input value={f.obs} onChange={(e) => set({ obs: e.target.value })} placeholder="ex: casa limitou depois da entrada" className="input-field" />
      </Campo>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => setF(estadoInicial())} style={{ ...C.btnCinza, display: "flex", alignItems: "center", gap: 6 }}><RotateCcw size={13} /> limpar</button>
        <button onClick={salvar} disabled={salvando} style={{ ...C.btnVerde, display: "flex", alignItems: "center", gap: 6, opacity: salvando ? 0.6 : 1 }}>
          <Save size={14} /> {salvando ? "salvando…" : editando ? "Salvar alterações" : "Registrar entrada"}
        </button>
      </div>
    </div>
  );
}
