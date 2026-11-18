import React, { useState, useMemo } from "react";
import { atualizar, excluir } from "./db";
import { n, paraBRL, deBRL, fmtMoeda, sinal, RESULTADOS, retornoPerna, plPernaBRL, SIMB, oddEfetiva } from "./moeda";
import { C, Metrica, Modal, Seletor, CORES_PERNA, Chip, confirmar } from "./ui";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Trash2, Pencil, TrendingUp, Activity } from "lucide-react";

const pad2 = (x) => String(x).padStart(2, "0");
const mesNome = (ano, mes) => new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const RES = Object.fromEntries(RESULTADOS.map((r) => [r.v, r]));

// cenários previstos (se a perna i bater e as outras perderem), em R$
function cenariosBRL(sb) {
  const t = sb.taxa;
  const pernas = sb.pernas || [];
  const total = pernas.reduce((a, p) => a + paraBRL(p.stake, p.moeda, t), 0);
  return pernas.map((p) => paraBRL(n(p.stake) * oddEfetiva(p), p.moeda, t) - total);
}

export default function Registro({ casas, parcerias, surebets, taxa, vis, recarregar, onEditar }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [diaSel, setDiaSel] = useState(null);
  const [fParc, setFParc] = useState("");
  const [fCasa, setFCasa] = useState("");
  const [expId, setExpId] = useState(null);
  const [resolvendo, setResolvendo] = useState(null);
  const [agrup, setAgrup] = useState("casa"); // "casa" | "parceria"
  const [escopo, setEscopo] = useState("mes"); // "mes" | "total"

  // valor em R$ gravado → moeda de visualização, usando a cotação da própria surebet
  const emVis = (vBRL, sb) => deBRL(vBRL, vis, sb?.taxa?.usd ? sb.taxa : taxa);
  const fmt = (v) => fmtMoeda(v, vis);

  const mudarMes = (d) => {
    let m = mes + d, a = ano;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    setMes(m); setAno(a); setDiaSel(null);
  };

  const prefixo = `${ano}-${pad2(mes + 1)}`;
  const passaFiltro = (sb) =>
    (!fParc || (sb.pernas || []).some((p) => p.parceria_id === fParc)) &&
    (!fCasa || (sb.pernas || []).some((p) => p.casa_id === fCasa));

  const doMes = useMemo(
    () => surebets.filter((s) => s.data?.startsWith(prefixo) && passaFiltro(s)).sort((a, b) => (b.data + b.created_at).localeCompare(a.data + a.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surebets, prefixo, fParc, fCasa]
  );

  const resumo = useMemo(() => {
    const fin = doMes.filter((s) => s.status === "finalizado");
    const apostado = fin.reduce((a, s) => a + emVis(s.apostado_brl, s), 0);
    const lucro = fin.reduce((a, s) => a + emVis(s.lucro_brl, s), 0);
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const porDia = {};
    fin.forEach((s) => {
      const d = s.data.slice(8, 10);
      porDia[d] = porDia[d] || { lucro: 0, qtd: 0 };
      porDia[d].lucro += emVis(s.lucro_brl, s);
      porDia[d].qtd += 1;
    });
    let acc = 0;
    const evolucao = Array.from({ length: diasNoMes }, (_, i) => (acc += porDia[pad2(i + 1)]?.lucro || 0));
    const pendentes = doMes.filter((s) => s.status !== "finalizado");
    const emAberto = pendentes.reduce((a, s) => a + emVis(s.apostado_brl, s), 0);
    return { apostado, lucro, qtd: fin.length, pend: pendentes.length, emAberto, diasNoMes, porDia, evolucao, primeiroDia: new Date(ano, mes, 1).getDay() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doMes, ano, mes, vis, taxa]);

  // desempenho por casa / parceria (P/L de cada perna finalizada)
  const desempenho = useMemo(() => {
    const base = surebets.filter((s) => s.status === "finalizado" && (escopo === "total" || s.data?.startsWith(prefixo)));
    const grupos = {};
    base.forEach((s) => {
      (s.pernas || []).forEach((p) => {
        const id = (agrup === "casa" ? p.casa_id : p.parceria_id) || "—";
        const nome = (agrup === "casa" ? p.casa_nome : p.parceria_nome) || "Sem conta";
        grupos[id] = grupos[id] || { nome, pernas: 0, volume: 0, pl: 0, ganhas: 0 };
        const g = grupos[id];
        g.pernas += 1;
        g.volume += emVis(paraBRL(p.stake, p.moeda, s.taxa), s);
        g.pl += emVis(plPernaBRL(p, s.taxa), s);
        if (p.resultado === "ganhou" || p.resultado === "meio_ganhou") g.ganhas += 1;
      });
    });
    // nome atual (caso tenha sido renomeado)
    const nomes = Object.fromEntries((agrup === "casa" ? casas : parcerias).map((x) => [x.id, x.nome]));
    return Object.entries(grupos).map(([id, g]) => ({ id, ...g, nome: nomes[id] || g.nome })).sort((a, b) => b.volume - a.volume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surebets, escopo, prefixo, agrup, casas, parcerias, vis, taxa]);

  const lista = diaSel ? doMes.filter((s) => s.data.slice(8, 10) === diaSel) : doMes;
  const pendentes = lista.filter((s) => s.status !== "finalizado");
  const finalizadas = lista.filter((s) => s.status === "finalizado");

  const apagar = async (sb) => {
    if (!confirmar(`Excluir a surebet "${sb.evento || "sem evento"}"?`)) return;
    try { await excluir("surebets", sb.id); await recarregar(); } catch (e) { alert("Erro: " + e.message); }
  };

  // ---------- linha (faixa colorida) ----------
  const linha = (sb, idx) => {
    const aberto = expId === sb.id;
    const fin = sb.status === "finalizado";
    const lucro = emVis(sb.lucro_brl, sb);
    const apostado = emVis(sb.apostado_brl, sb);
    const cen = cenariosBRL(sb);
    const minPrev = cen.length ? emVis(Math.min(...cen), sb) : 0;
    const grad = fin ? "linear-gradient(90deg,#1c5a8c,#2678b5)" : "linear-gradient(90deg,#7a4f10,#a56a12)";
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    const casasTxt = (sb.pernas || []).map((p) => p.casa_nome || "?").join(" × ");
    return (
      <div key={sb.id} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.08)", marginBottom: 10, background: "rgba(26,30,58,.9)" }}>
        <div onClick={() => setExpId(aberto ? null : sb.id)} style={{ cursor: "pointer", background: grad, padding: "10px 14px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, rowGap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>#{idx}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: "rgba(255,255,255,.18)", color: "#fff" }}>{sb.vias || (sb.pernas || []).length} vias</span>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sb.evento || "Sem evento"}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)" }}>
              {sb.data.slice(8, 10)}/{sb.data.slice(5, 7)}{sb.esporte ? ` · ${sb.esporte}` : ""} · {casasTxt}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)" }}>Apostado {fmt(apostado)}</div>
            {fin ? (
              <div className="mono" style={{ fontSize: 13, fontWeight: 800, color: lucro >= 0 ? "#7dffb3" : "#ff8a95" }}>
                {sinal(lucro)}{fmt(lucro)}
              </div>
            ) : (
              <div className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: "#ffe1a8" }}>previsto {sinal(minPrev)}{fmt(minPrev)}</div>
            )}
          </div>
          <BadgePct valor={fin ? lucro : minPrev} base={apostado} />
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 6, background: "rgba(0,0,0,.25)", color: "#fff" }}>{fin ? "Finalizada" : "Pendente"}</span>
          <button onClick={stop(() => apagar(sb))} title="Excluir" style={{ background: "none", border: "none", color: "rgba(255,255,255,.7)", padding: 0 }}><Trash2 size={14} /></button>
          {aberto ? <ChevronUp size={16} color="#fff" /> : <ChevronDown size={16} color="#fff" />}
        </div>

        {aberto && (
          <div style={{ padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 12 }}>
              {(sb.pernas || []).map((p, i) => {
                const r = RES[p.resultado];
                const pl = plPernaBRL(p, sb.taxa);
                return (
                  <div key={i} style={{ padding: 12, borderRadius: 10, background: "#12152b", border: `1px solid ${r ? r.cor + "88" : "#23274a"}`, borderTop: `3px solid ${CORES_PERNA[i]}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 10, color: "#8b90b3", fontWeight: 700 }}>PERNA {i + 1}</span>
                      {r && <Chip cor={r.cor}>{r.label}{p.resultado === "cashout" ? ` ${fmtMoeda(p.cashout, p.moeda)}` : ""}</Chip>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{p.casa_nome || "Sem conta"}</div>
                    <div style={{ fontSize: 11, color: "#b4b9d6", marginBottom: 6 }}>{p.parceria_nome || "—"}</div>
                    <div style={{ fontSize: 12, color: "#e4e4e7", marginBottom: 4 }}>{p.selecao || "—"}</div>
                    <div className="mono" style={{ fontSize: 11, color: "#8b90b3" }}>@{n(p.odd).toFixed(2)}{n(p.comissao) > 0 ? ` (com. ${n(p.comissao)}%)` : ""} · {fmtMoeda(p.stake, p.moeda)}</div>
                    {r ? (
                      <div className="mono" style={{ fontSize: 11.5, marginTop: 6, fontWeight: 700, color: pl >= 0 ? "#00e676" : "#ff5a6a" }}>{sinal(pl)}{fmtMoeda(deBRL(pl, p.moeda, sb.taxa), p.moeda)}</div>
                    ) : (
                      <div className="mono" style={{ fontSize: 11, marginTop: 6, color: cen[i] >= 0 ? "#00e676" : "#ff5a6a" }}>se bater: {sinal(cen[i])}{fmt(emVis(cen[i], sb))}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {sb.obs && <div style={{ fontSize: 12, color: "#b4b9d6", marginBottom: 10 }}>obs: {sb.obs}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button onClick={() => setResolvendo(sb)} style={fin ? { ...C.btnCinza, fontSize: 11.5, padding: "6px 11px" } : { ...C.btnVerde, fontSize: 11.5, padding: "6px 12px" }}>{fin ? "editar resultado" : "Definir resultado"}</button>
              <button onClick={() => onEditar(sb)} style={{ ...C.btnCinza, fontSize: 11.5, padding: "6px 11px", display: "flex", alignItems: "center", gap: 5 }}><Pencil size={12} /> editar entrada</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const vals = resumo.evolucao;
  const minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals), range = maxV - minV || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1 || 1)) * 100},${36 - ((v - minV) / range) * 36}`).join(" ");
  const zeroY = 36 - ((0 - minV) / range) * 36;

  const selStyle = { width: "auto", minWidth: 150, padding: "6px 9px", fontSize: 12 };

  return (
    <div>
      {/* navegação + filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <button onClick={() => mudarMes(-1)} style={{ background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, color: "#b4b9d6", padding: 6 }}><ChevronLeft size={15} /></button>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e4e4e7", minWidth: 150, textAlign: "center", textTransform: "capitalize" }}>{mesNome(ano, mes)}</div>
        <button onClick={() => mudarMes(1)} style={{ background: "#1a1e3a", border: "1px solid #2a2f52", borderRadius: 6, color: "#b4b9d6", padding: 6 }}><ChevronRight size={15} /></button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={fParc} onChange={(e) => setFParc(e.target.value)} className="input-field" style={selStyle}>
            <option value="">todas as parcerias</option>
            {[...parcerias].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <select value={fCasa} onChange={(e) => setFCasa(e.target.value)} className="input-field" style={selStyle}>
            <option value="">todas as casas</option>
            {[...casas].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>

      {/* resumo */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 18 }}>
        <Metrica label="Total apostado (mês)" valor={fmt(resumo.apostado)} cor="#38bdf8" />
        <Metrica label="Lucro (mês)" valor={`${sinal(resumo.lucro)}${fmt(resumo.lucro)}`} cor={resumo.lucro >= 0 ? "#00e676" : "#ff5a6a"} />
        <Metrica label="ROI (mês)" valor={`${resumo.apostado ? ((resumo.lucro / resumo.apostado) * 100).toFixed(2) : "0.00"}%`} cor={resumo.lucro >= 0 ? "#00e676" : "#ff5a6a"} sub={resumo.qtd ? `média ${fmt(resumo.lucro / resumo.qtd)} por surebet` : null} />
        <Metrica label="Surebets" valor={<>{resumo.qtd}{resumo.pend > 0 && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 500 }}> · {resumo.pend} pend.</span>}</>} sub={resumo.pend ? `${fmt(resumo.emAberto)} em aberto` : null} />
      </div>

      {/* evolução */}
      <div style={{ ...C.card, marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#8b90b3", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><TrendingUp size={12} /> Evolução do lucro no mês</div>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block" }}>
          <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#2a2f52" strokeWidth="0.5" />
          <polyline points={pts} fill="none" stroke={vals[vals.length - 1] >= 0 ? "#00e676" : "#ff5a6a"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      {/* calendário */}
      <div style={{ ...C.card, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10.5, color: "#8b90b3", fontWeight: 600, textTransform: "uppercase" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {Array.from({ length: resumo.primeiroDia }).map((_, i) => <div key={`v${i}`} />)}
          {Array.from({ length: resumo.diasNoMes }).map((_, i) => {
            const d = pad2(i + 1);
            const det = resumo.porDia[d];
            const pos = det && det.lucro >= 0;
            const sel = diaSel === d;
            const ehHoje = hoje.getFullYear() === ano && hoje.getMonth() === mes && hoje.getDate() === i + 1;
            return (
              <div key={d} onClick={() => setDiaSel(sel ? null : d)} style={{ cursor: "pointer", outline: sel ? "2px solid #00e676" : "none", borderRadius: 8, padding: "8px 4px", minHeight: 58, textAlign: "center", background: det ? (pos ? "rgba(16,185,129,.08)" : "rgba(244,63,94,.08)") : "rgba(255,255,255,.015)", border: ehHoje ? "2px solid #3b82f6" : `1px solid ${det ? (pos ? "rgba(16,185,129,.2)" : "rgba(244,63,94,.2)") : "#23274a"}` }}>
                <div style={{ fontSize: 11, color: det ? "#e4e4e7" : "#6b7099", fontWeight: 600 }}>{i + 1}</div>
                {det && (
                  <>
                    <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, color: pos ? "#00e676" : "#ff5a6a", marginTop: 3 }}>{fmt(det.lucro)}</div>
                    <div style={{ fontSize: 9, color: "#6b7099", marginTop: 1 }}>{det.qtd} sb.</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* desempenho por casa / parceria */}
      <div style={{ ...C.card, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#8b90b3", display: "flex", alignItems: "center", gap: 5 }}><Activity size={12} /> Desempenho por</div>
          <Seletor small opcoes={[["casa", "Casa"], ["parceria", "Parceria"]]} value={agrup} onChange={setAgrup} />
          <Seletor small opcoes={[["mes", "Mês"], ["total", "Total"]]} value={escopo} onChange={setEscopo} />
          <span style={{ fontSize: 10.5, color: "#6b7099" }}>P/L = quanto cada conta ganhou ou perdeu nas pernas (onde o dinheiro ficou)</span>
        </div>
        {desempenho.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6b7099" }}>Nenhuma surebet finalizada no período.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#8b90b3", fontSize: 10.5, textTransform: "uppercase" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>{agrup === "casa" ? "Casa" : "Parceria"}</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Pernas</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Green</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>Volume</th>
                  <th style={{ textAlign: "right", padding: "6px 8px" }}>P/L</th>
                </tr>
              </thead>
              <tbody>
                {desempenho.map((g) => (
                  <tr key={g.id} style={{ borderTop: "1px solid #23274a" }}>
                    <td style={{ padding: "7px 8px", color: "#e4e4e7", fontWeight: 600 }}>{g.nome}</td>
                    <td className="mono" style={{ padding: "7px 8px", textAlign: "right", color: "#b4b9d6" }}>{g.pernas}</td>
                    <td className="mono" style={{ padding: "7px 8px", textAlign: "right", color: "#b4b9d6" }}>{g.ganhas}</td>
                    <td className="mono" style={{ padding: "7px 8px", textAlign: "right", color: "#38bdf8" }}>{fmt(g.volume)}</td>
                    <td className="mono" style={{ padding: "7px 8px", textAlign: "right", fontWeight: 700, color: g.pl >= 0 ? "#00e676" : "#ff5a6a" }}>{sinal(g.pl)}{fmt(g.pl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* lista */}
      {diaSel && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 12.5, color: "#e4e4e7" }}>
          Mostrando dia {diaSel}/{pad2(mes + 1)}
          <button onClick={() => setDiaSel(null)} style={{ ...C.btnCinza, padding: "4px 9px", fontSize: 11 }}>ver mês inteiro</button>
        </div>
      )}
      {pendentes.length > 0 && (
        <>
          {(() => {
            const somaApostado = pendentes.reduce((a, s) => a + emVis(s.apostado_brl, s), 0);
            const somaPrevisto = pendentes.reduce((a, s) => { const c = cenariosBRL(s); return a + (c.length ? emVis(Math.min(...c), s) : 0); }, 0);
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8, padding: "8px 14px", borderRadius: 10, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)" }}>
                <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Pendentes ({pendentes.length})</div>
                <div className="mono" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                  <span style={{ color: "#b4b9d6" }}>em aberto <b style={{ color: "#fff" }}>{fmt(somaApostado)}</b></span>
                  <span style={{ color: "#b4b9d6" }}>previsto <b style={{ color: somaPrevisto >= 0 ? "#00e676" : "#ff5a6a", fontSize: 13.5 }}>{sinal(somaPrevisto)}{fmt(somaPrevisto)}</b></span>
                  <BadgePct valor={somaPrevisto} base={somaApostado} />
                </div>
              </div>
            );
          })()}
          {pendentes.map((s, i) => linha(s, pendentes.length - i))}
        </>
      )}
      {(() => {
        const somaApostado = finalizadas.reduce((a, s) => a + emVis(s.apostado_brl, s), 0);
        const somaLucro = finalizadas.reduce((a, s) => a + emVis(s.lucro_brl, s), 0);
        return (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, margin: "16px 0 8px", padding: "8px 14px", borderRadius: 10, background: "rgba(56,189,248,.06)", border: "1px solid rgba(56,189,248,.25)" }}>
            <div style={{ fontSize: 12, color: "#8b90b3", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Finalizadas ({finalizadas.length})</div>
            {finalizadas.length > 0 && (
              <div className="mono" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#b4b9d6" }}>apostado <b style={{ color: "#fff" }}>{fmt(somaApostado)}</b></span>
                <span style={{ color: "#b4b9d6" }}>lucro <b style={{ color: somaLucro >= 0 ? "#00e676" : "#ff5a6a", fontSize: 13.5 }}>{sinal(somaLucro)}{fmt(somaLucro)}</b></span>
                <BadgePct valor={somaLucro} base={somaApostado} />
              </div>
            )}
          </div>
        );
      })()}
      {finalizadas.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#6b7099", padding: "10px 0" }}>Nenhuma surebet finalizada {diaSel ? "neste dia" : "neste mês"}{fParc || fCasa ? " com esse filtro" : ""}.</div>
      ) : (
        finalizadas.map((s, i) => linha(s, finalizadas.length - i))
      )}

      {resolvendo && <Resolver sb={resolvendo} vis={vis} onClose={() => setResolvendo(null)} onSalvo={async () => { setResolvendo(null); await recarregar(); }} />}
    </div>
  );
}

// % em destaque (lucro ÷ apostado)
function BadgePct({ valor, base }) {
  const pct = base ? (valor / base) * 100 : 0;
  const pos = pct >= 0;
  return (
    <span className="mono" style={{ fontSize: 14, fontWeight: 800, padding: "4px 10px", borderRadius: 7, minWidth: 72, textAlign: "center", background: pos ? "rgba(0,230,118,.18)" : "rgba(255,90,106,.2)", color: pos ? "#7dffb3" : "#ff8a95", border: `1px solid ${pos ? "rgba(0,230,118,.5)" : "rgba(255,90,106,.55)"}` }}>
      {pos ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

// ================= DEFINIR RESULTADO =================
function Resolver({ sb, vis, onClose, onSalvo }) {
  const [res, setRes] = useState(() => (sb.pernas || []).map((p) => p.resultado || null));
  const [cash, setCash] = useState(() => (sb.pernas || []).map((p) => (p.resultado === "cashout" && p.cashout != null ? String(p.cashout) : "")));
  const [salvando, setSalvando] = useState(false);
  const t = sb.taxa;
  const pernas = (sb.pernas || []).map((p, i) => ({ ...p, resultado: res[i], cashout: res[i] === "cashout" ? (cash[i] === "" ? null : n(cash[i])) : null }));
  const completo = res.every(Boolean) && pernas.every((p) => p.resultado !== "cashout" || p.cashout != null);
  const apostadoBRL = pernas.reduce((a, p) => a + paraBRL(p.stake, p.moeda, t), 0);
  const lucroBRL = pernas.reduce((a, p) => a + plPernaBRL(p, t), 0);
  const fmt = (vBRL) => fmtMoeda(deBRL(vBRL, vis, t), vis);

  const bateu = (i) => setRes(pernas.map((_, k) => (k === i ? "ganhou" : "perdeu")));

  const salvar = async () => {
    setSalvando(true);
    try {
      await atualizar("surebets", sb.id, { pernas, status: "finalizado", apostado_brl: apostadoBRL, lucro_brl: lucroBRL });
      await onSalvo();
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
      setSalvando(false);
    }
  };
  const voltarPendente = async () => {
    setSalvando(true);
    try {
      await atualizar("surebets", sb.id, { pernas: pernas.map((p) => ({ ...p, resultado: null, cashout: null })), status: "pendente", lucro_brl: 0 });
      await onSalvo();
    } catch (e) { alert("Erro: " + e.message); setSalvando(false); }
  };

  return (
    <Modal titulo={`Definir resultado — ${sb.evento || "surebet"}`} onClose={onClose} largura={pernas.length === 3 ? 760 : 600}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#8b90b3" }}>atalho:</span>
        {pernas.map((p, i) => (
          <button key={i} onClick={() => bateu(i)} style={{ ...C.btnCinza, padding: "5px 10px", fontSize: 11.5, borderColor: CORES_PERNA[i] }}>perna {i + 1} bateu</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${pernas.length},1fr)`, gap: 10, marginBottom: 14 }}>
        {pernas.map((p, i) => {
          const r = retornoPerna(p);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ padding: 12, borderRadius: 10, background: "#12152b", border: "1px solid #23274a", borderTop: `3px solid ${CORES_PERNA[i]}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fafafa" }}>{p.casa_nome || "Sem conta"}</div>
                <div style={{ fontSize: 10.5, color: "#8b90b3", marginBottom: 4 }}>{p.parceria_nome || "—"}</div>
                <div style={{ fontSize: 12, color: "#e4e4e7" }}>{p.selecao || "—"}</div>
                <div className="mono" style={{ fontSize: 11, color: "#8b90b3" }}>@{n(p.odd).toFixed(2)}{n(p.comissao) > 0 ? ` (com. ${n(p.comissao)}%)` : ""} · {fmtMoeda(p.stake, p.moeda)}</div>
              </div>
              {RESULTADOS.map((o) => {
                const ativo = res[i] === o.v;
                return (
                  <button key={o.v} onClick={() => setRes((prev) => prev.map((x, k) => (k === i ? o.v : x)))} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#e4e4e7", background: ativo ? `${o.cor}1f` : "#161a33", border: `1px solid ${ativo ? o.cor : "#23274a"}`, borderLeft: `4px solid ${o.cor}` }}>
                    {o.label}
                  </button>
                );
              })}
              {res[i] === "cashout" && (
                <div style={{ padding: 10, borderRadius: 8, background: "rgba(34,211,238,.08)", border: "1px solid rgba(34,211,238,.45)" }}>
                  <div style={{ fontSize: 10.5, color: "#67e8f9", marginBottom: 4, fontWeight: 600 }}>Valor recebido no cashout ({SIMB[p.moeda] || p.moeda})</div>
                  <input autoFocus type="number" step="0.01" value={cash[i]} onChange={(e) => { const v = e.target.value; setCash((prev) => prev.map((x, k) => (k === i ? v : x))); }} placeholder="0,00" className="input-field" />
                  <div style={{ fontSize: 10, color: "#6b7099", marginTop: 4 }}>o que a casa devolveu no total (stake {fmtMoeda(p.stake, p.moeda)})</div>
                </div>
              )}
              <div style={{ textAlign: "center", padding: "8px", borderRadius: 8, background: "#12152b" }}>
                <div style={{ fontSize: 10.5, color: "#8b90b3" }}>Retorno</div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: r > 0 ? "#00e676" : "#8b90b3" }}>{r === null ? "—" : fmtMoeda(r, p.moeda)}</div>
                {r !== null && <div className="mono" style={{ fontSize: 10.5, color: r - n(p.stake) >= 0 ? "#00e676" : "#ff5a6a" }}>{sinal(r - n(p.stake))}{fmtMoeda(r - n(p.stake), p.moeda)} na perna</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, padding: "12px 0", borderTop: "1px solid #23274a", marginBottom: 12, textAlign: "center" }}>
        <div><div style={{ fontSize: 11, color: "#8b90b3" }}>Total apostado</div><div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "#5ea8ff" }}>{fmt(apostadoBRL)}</div></div>
        <div><div style={{ fontSize: 11, color: "#8b90b3" }}>Lucro</div><div className="mono" style={{ fontSize: 15, fontWeight: 700, color: !completo ? "#6b7099" : lucroBRL >= 0 ? "#00e676" : "#ff5a6a" }}>{completo ? `${sinal(lucroBRL)}${fmt(lucroBRL)}` : "—"}</div></div>
        <div><div style={{ fontSize: 11, color: "#8b90b3" }}>ROI</div><div className="mono" style={{ fontSize: 15, fontWeight: 700, color: !completo ? "#6b7099" : lucroBRL >= 0 ? "#00e676" : "#ff5a6a" }}>{completo && apostadoBRL ? `${((lucroBRL / apostadoBRL) * 100).toFixed(2)}%` : "—"}</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {sb.status === "finalizado" && <button onClick={voltarPendente} disabled={salvando} style={{ ...C.btnCinza, marginRight: "auto" }}>voltar para pendente</button>}
        <button onClick={onClose} style={C.btnCinza}>Cancelar</button>
        <button onClick={salvar} disabled={!completo || salvando} style={{ ...C.btnVerde, opacity: completo && !salvando ? 1 : 0.5 }}>Salvar resultado</button>
      </div>
    </Modal>
  );
}
