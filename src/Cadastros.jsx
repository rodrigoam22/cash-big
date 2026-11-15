import React, { useState, useMemo } from "react";
import { inserir, atualizar, excluir } from "./db";
import { n, fmtMoeda, deBRL, sinal, plPernaBRL, paraBRL, SIMB } from "./moeda";
import { C, Campo, SeletorMoeda, Modal, STATUS_CONTA, Chip, confirmar } from "./ui";
import { Plus, Trash2, Pencil, Check, X, Building2, Users, Link2 } from "lucide-react";

export default function Cadastros({ casas, parcerias, contas, surebets, taxa, vis, recarregar }) {
  const [editConta, setEditConta] = useState(null); // { parceria, casa, conta? }

  const casasOrd = useMemo(() => [...casas].sort((a, b) => a.nome.localeCompare(b.nome)), [casas]);
  const parcOrd = useMemo(() => [...parcerias].sort((a, b) => a.nome.localeCompare(b.nome)), [parcerias]);
  const contaDe = useMemo(() => {
    const m = {};
    contas.forEach((c) => { m[`${c.parceria_id}|${c.casa_id}`] = c; });
    return m;
  }, [contas]);

  // P/L e volume acumulados por conta e por parceria (todas as surebets finalizadas), na moeda de visualização
  const stats = useMemo(() => {
    const porConta = {}, porParc = {};
    surebets.filter((s) => s.status === "finalizado").forEach((s) => {
      const t = s.taxa?.usd ? s.taxa : taxa;
      (s.pernas || []).forEach((p) => {
        const pl = deBRL(plPernaBRL(p, t), vis, t);
        const vol = deBRL(paraBRL(p.stake, p.moeda, t), vis, t);
        const k = `${p.parceria_id}|${p.casa_id}`;
        porConta[k] = porConta[k] || { pl: 0, vol: 0, n: 0 };
        porConta[k].pl += pl; porConta[k].vol += vol; porConta[k].n += 1;
        if (p.parceria_id) {
          porParc[p.parceria_id] = porParc[p.parceria_id] || { pl: 0, vol: 0, n: 0 };
          porParc[p.parceria_id].pl += pl; porParc[p.parceria_id].vol += vol; porParc[p.parceria_id].n += 1;
        }
      });
    });
    return { porConta, porParc };
  }, [surebets, taxa, vis]);

  const tentar = async (fn) => {
    try { await fn(); await recarregar(); } catch (e) { alert("Erro: " + (e.message || e)); }
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 18 }}>
        <SecaoCasas casas={casasOrd} contas={contas} tentar={tentar} />
        <SecaoParcerias parcerias={parcOrd} contas={contas} stats={stats.porParc} vis={vis} tentar={tentar} />
      </div>

      {/* matriz de vínculos */}
      <div style={C.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Link2 size={15} color="#00e676" />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>Contas — quem tem conta em qual casa</div>
        </div>
        <div style={{ fontSize: 11.5, color: "#6b7099", marginBottom: 12 }}>
          Clique num quadradinho para ligar a parceria à casa (criar a conta). Clique numa conta já criada para mudar status, saldo, login ou remover.
        </div>
        {casasOrd.length === 0 || parcOrd.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#b4b9d6" }}>Cadastre pelo menos uma casa e uma parceria acima.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ fontSize: 12, minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, background: "#1a1e3a", textAlign: "left", padding: "8px 10px", color: "#8b90b3", fontSize: 10.5, textTransform: "uppercase", zIndex: 1 }}>Parceria</th>
                  {casasOrd.map((c) => (
                    <th key={c.id} style={{ padding: "8px 6px", color: "#e4e4e7", fontWeight: 700, fontSize: 11.5, whiteSpace: "nowrap", textAlign: "center" }}>
                      {c.nome}
                      <div className="mono" style={{ fontSize: 9.5, color: "#6b7099", fontWeight: 500 }}>{SIMB[c.moeda] || c.moeda}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parcOrd.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid #23274a" }}>
                    <td style={{ position: "sticky", left: 0, background: "#1a1e3a", padding: "8px 10px", color: "#fafafa", fontWeight: 600, whiteSpace: "nowrap", zIndex: 1 }}>
                      {p.nome}
                      <div className="mono" style={{ fontSize: 10, color: "#6b7099", fontWeight: 400 }}>{contas.filter((c) => c.parceria_id === p.id).length} contas</div>
                    </td>
                    {casasOrd.map((c) => {
                      const conta = contaDe[`${p.id}|${c.id}`];
                      const st = conta ? STATUS_CONTA[conta.status] || STATUS_CONTA.ativa : null;
                      return (
                        <td key={c.id} style={{ padding: 4, textAlign: "center" }}>
                          <button
                            onClick={() => (conta ? setEditConta({ parceria: p, casa: c, conta }) : tentar(() => inserir("contas", { parceria_id: p.id, casa_id: c.id, status: "ativa" })))}
                            title={conta ? `${p.nome} · ${c.nome}: ${st.label}` : `Criar conta ${p.nome} · ${c.nome}`}
                            style={{ width: "100%", minWidth: 74, minHeight: 44, borderRadius: 8, border: conta ? `1px solid ${st.cor}88` : "1px dashed #2a2f52", background: conta ? `${st.cor}18` : "transparent", color: conta ? st.cor : "#3d4270", fontSize: 11, fontWeight: 700, padding: "4px 6px" }}
                          >
                            {conta ? (
                              <>
                                <div>{st.label}</div>
                                {conta.saldo != null && conta.saldo !== "" && <div className="mono" style={{ fontSize: 9.5, color: "#b4b9d6", fontWeight: 500 }}>{fmtMoeda(conta.saldo, c.moeda)}</div>}
                              </>
                            ) : (
                              <Plus size={14} />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {Object.entries(STATUS_CONTA).map(([k, s]) => <Chip key={k} cor={s.cor}>{s.label}</Chip>)}
        </div>
      </div>

      {editConta && (
        <EditarConta
          {...editConta}
          stats={stats.porConta[`${editConta.parceria.id}|${editConta.casa.id}`]}
          vis={vis}
          onClose={() => setEditConta(null)}
          tentar={async (fn) => { await tentar(fn); setEditConta(null); }}
        />
      )}
    </div>
  );
}

// ================= CASAS =================
function SecaoCasas({ casas, contas, tentar }) {
  const [nome, setNome] = useState("");
  const [moeda, setMoeda] = useState("USD");
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ nome: "", moeda: "USD" });

  const adicionar = () => {
    if (!nome.trim()) return;
    if (casas.some((c) => c.nome.toLowerCase() === nome.trim().toLowerCase())) { alert("Essa casa já está cadastrada."); return; }
    tentar(() => inserir("casas", { nome: nome.trim(), moeda }));
    setNome("");
  };

  return (
    <div style={C.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Building2 size={15} color="#5ea8ff" />
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>Casas</div>
        <span className="mono" style={{ fontSize: 11, color: "#6b7099" }}>({casas.length})</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="nome da casa (ex: Pinnacle)" className="input-field" style={{ flex: 1, minWidth: 140 }} />
        <SeletorMoeda value={moeda} onChange={setMoeda} />
        <button onClick={adicionar} style={{ ...C.btnVerde, padding: "7px 12px", display: "flex", alignItems: "center", gap: 4 }}><Plus size={13} /> add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {casas.length === 0 && <div style={{ fontSize: 12, color: "#6b7099" }}>Nenhuma casa cadastrada.</div>}
        {casas.map((c) => {
          const qtd = contas.filter((x) => x.casa_id === c.id).length;
          return editId === c.id ? (
            <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: 6, borderRadius: 8, background: "#12152b" }}>
              <input autoFocus value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} className="input-field" style={{ flex: 1, padding: "5px 8px" }} />
              <SeletorMoeda small value={edit.moeda} onChange={(m) => setEdit({ ...edit, moeda: m })} />
              <button onClick={() => { tentar(() => atualizar("casas", c.id, { nome: edit.nome.trim() || c.nome, moeda: edit.moeda })); setEditId(null); }} style={{ background: "none", border: "none", color: "#00e676", padding: 2 }}><Check size={15} /></button>
              <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: "#8b90b3", padding: 2 }}><X size={15} /></button>
            </div>
          ) : (
            <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "#12152b", border: "1px solid #23274a" }}>
              <span style={{ flex: 1, fontSize: 13, color: "#e4e4e7", fontWeight: 600 }}>{c.nome}</span>
              <span className="mono" style={{ fontSize: 10.5, color: "#8b90b3" }}>{SIMB[c.moeda] || c.moeda} · {qtd} conta{qtd === 1 ? "" : "s"}</span>
              <button onClick={() => { setEditId(c.id); setEdit({ nome: c.nome, moeda: c.moeda || "USD" }); }} style={{ background: "none", border: "none", color: "#8b90b3", padding: 2 }}><Pencil size={13} /></button>
              <button onClick={() => confirmar(`Excluir a casa ${c.nome}? As ${qtd} conta(s) ligadas a ela também serão removidas (o histórico de surebets continua).`) && tentar(() => excluir("casas", c.id))} style={{ background: "none", border: "none", color: "#8b90b3", padding: 2 }}><Trash2 size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= PARCERIAS =================
function SecaoParcerias({ parcerias, contas, stats, vis, tentar }) {
  const vazio = { nome: "", contato: "", comissao: "", obs: "" };
  const [novo, setNovo] = useState(vazio);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState(vazio);

  const limpar = (x) => ({ nome: x.nome.trim(), contato: x.contato?.trim() || null, comissao: x.comissao === "" || x.comissao == null ? null : n(x.comissao), obs: x.obs?.trim() || null });

  const adicionar = () => {
    if (!novo.nome.trim()) return;
    tentar(() => inserir("parcerias", limpar(novo)));
    setNovo(vazio);
  };

  return (
    <div style={C.card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Users size={15} color="#c084fc" />
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fafafa" }}>Parcerias</div>
        <span className="mono" style={{ fontSize: 11, color: "#6b7099" }}>({parcerias.length})</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 70px auto", gap: 6, marginBottom: 12 }}>
        <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="nome do parceiro" className="input-field" />
        <input value={novo.contato} onChange={(e) => setNovo({ ...novo, contato: e.target.value })} placeholder="contato" className="input-field" />
        <input type="number" value={novo.comissao} onChange={(e) => setNovo({ ...novo, comissao: e.target.value })} placeholder="% com." className="input-field" />
        <button onClick={adicionar} style={{ ...C.btnVerde, padding: "7px 12px", display: "flex", alignItems: "center", gap: 4 }}><Plus size={13} /> add</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
        {parcerias.length === 0 && <div style={{ fontSize: 12, color: "#6b7099" }}>Nenhuma parceria cadastrada.</div>}
        {parcerias.map((p) => {
          const qtd = contas.filter((x) => x.parceria_id === p.id).length;
          const st = stats[p.id];
          return editId === p.id ? (
            <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 8, background: "#12152b" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 70px", gap: 6 }}>
                <input autoFocus value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} className="input-field" style={{ padding: "5px 8px" }} />
                <input value={edit.contato || ""} onChange={(e) => setEdit({ ...edit, contato: e.target.value })} placeholder="contato" className="input-field" style={{ padding: "5px 8px" }} />
                <input type="number" value={edit.comissao ?? ""} onChange={(e) => setEdit({ ...edit, comissao: e.target.value })} placeholder="%" className="input-field" style={{ padding: "5px 8px" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={edit.obs || ""} onChange={(e) => setEdit({ ...edit, obs: e.target.value })} placeholder="observação" className="input-field" style={{ padding: "5px 8px", flex: 1 }} />
                <button onClick={() => { tentar(() => atualizar("parcerias", p.id, limpar({ ...edit, nome: edit.nome || p.nome }))); setEditId(null); }} style={{ background: "none", border: "none", color: "#00e676", padding: 2 }}><Check size={15} /></button>
                <button onClick={() => setEditId(null)} style={{ background: "none", border: "none", color: "#8b90b3", padding: 2 }}><X size={15} /></button>
              </div>
            </div>
          ) : (
            <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 8, background: "#12152b", border: "1px solid #23274a" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#e4e4e7", fontWeight: 600 }}>{p.nome}{p.comissao != null && <span className="mono" style={{ fontSize: 10.5, color: "#c084fc", fontWeight: 500 }}> · {Number(p.comissao)}%</span>}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "#6b7099", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {qtd} conta{qtd === 1 ? "" : "s"}{p.contato ? ` · ${p.contato}` : ""}{p.obs ? ` · ${p.obs}` : ""}
                </div>
              </div>
              {st && <span className="mono" title="P/L acumulado nas contas dessa parceria" style={{ fontSize: 11, fontWeight: 700, color: st.pl >= 0 ? "#00e676" : "#ff5a6a" }}>{sinal(st.pl)}{fmtMoeda(st.pl, vis)}</span>}
              <button onClick={() => { setEditId(p.id); setEdit({ nome: p.nome, contato: p.contato || "", comissao: p.comissao ?? "", obs: p.obs || "" }); }} style={{ background: "none", border: "none", color: "#8b90b3", padding: 2 }}><Pencil size={13} /></button>
              <button onClick={() => confirmar(`Excluir a parceria ${p.nome}? As ${qtd} conta(s) dela também serão removidas (o histórico de surebets continua).`) && tentar(() => excluir("parcerias", p.id))} style={{ background: "none", border: "none", color: "#8b90b3", padding: 2 }}><Trash2 size={13} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================= EDITAR CONTA =================
function EditarConta({ parceria, casa, conta, stats, vis, onClose, tentar }) {
  const [f, setF] = useState({ status: conta.status || "ativa", saldo: conta.saldo ?? "", login: conta.login || "", obs: conta.obs || "" });
  const salvar = () =>
    tentar(() => atualizar("contas", conta.id, { status: f.status, saldo: f.saldo === "" ? null : n(f.saldo), login: f.login.trim() || null, obs: f.obs.trim() || null }));

  return (
    <Modal titulo={`${parceria.nome} · ${casa.nome}`} onClose={onClose} largura={440}>
      <Campo label="Status" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {Object.entries(STATUS_CONTA).map(([k, s]) => (
            <button key={k} onClick={() => setF({ ...f, status: k })} style={{ flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1px solid ${f.status === k ? s.cor : "#2a2f52"}`, background: f.status === k ? `${s.cor}22` : "transparent", color: f.status === k ? s.cor : "#8b90b3" }}>{s.label}</button>
          ))}
        </div>
      </Campo>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <Campo label={`Saldo atual (${SIMB[casa.moeda] || casa.moeda})`}><input type="number" step="0.01" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} placeholder="opcional" className="input-field" /></Campo>
        <Campo label="Login / usuário"><input value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} placeholder="opcional" className="input-field" /></Campo>
      </div>
      <Campo label="Observação" style={{ marginBottom: 12 }}><input value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} placeholder="ex: limitada em futebol desde 10/11" className="input-field" /></Campo>
      {stats && (
        <div className="mono" style={{ fontSize: 11.5, color: "#8b90b3", marginBottom: 14, padding: 10, borderRadius: 8, background: "#12152b" }}>
          {stats.n} perna{stats.n === 1 ? "" : "s"} finalizada{stats.n === 1 ? "" : "s"} · volume {fmtMoeda(stats.vol, vis)} · P/L <span style={{ color: stats.pl >= 0 ? "#00e676" : "#ff5a6a", fontWeight: 700 }}>{sinal(stats.pl)}{fmtMoeda(stats.pl, vis)}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => confirmar("Remover esta conta? O histórico de surebets continua.") && tentar(() => excluir("contas", conta.id))} style={{ ...C.btnCinza, marginRight: "auto", color: "#ff8a95" }}>remover conta</button>
        <button onClick={onClose} style={C.btnCinza}>Cancelar</button>
        <button onClick={salvar} style={C.btnVerde}>Salvar</button>
      </div>
    </Modal>
  );
}
