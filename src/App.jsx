import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Check, X,
  AlertTriangle, Wallet, TrendingUp, Calendar, LogOut,
} from "lucide-react";

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const prevDateStr = (iso) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const cashbackDe = (aposta) =>
  aposta.cashback_previsto != null
    ? Number(aposta.cashback_previsto)
    : (aposta.valor_aposta ? Number(aposta.valor_aposta) * 0.1 : 0);

const totalCashback = (apostasDoDia) =>
  (apostasDoDia || []).reduce((acc, a) => acc + cashbackDe(a), 0);

// ================= LOGIN =================
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError("E-mail ou senha incorretos.");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ width: 320, padding: 28, background: "#14171b", border: "1px solid #27292e", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#fbbf24,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0b0d10" }}>GB</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fafafa" }}>Gerenciamento Cash Big</div>
            <div style={{ fontSize: 11, color: "#71717a" }} className="mono">entre para continuar</div>
          </div>
        </div>
        <label style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5 }}>E-mail</label>
        <input className="input-field" style={{ marginTop: 4, marginBottom: 14 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 0.5 }}>Senha</label>
        <input className="input-field" style={{ marginTop: 4, marginBottom: 18 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: "#fbbf24", color: "#0b0d10", fontWeight: 600, fontSize: 13 }}>
          {loading ? "entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

// ================= APP =================
export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }} className="mono">carregando…</div>;
  }
  if (!session) return <Login />;
  return <Dashboard />;
}

// ================= DASHBOARD =================
function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [regByAccount, setRegByAccount] = useState({});      // {accountId: {date: {id, saldo, imagem_url}}}
  const [apostasByAccount, setApostasByAccount] = useState({}); // {accountId: {date: [aposta,...]}}
  const [loading, setLoading] = useState(true);
  const [newAccountName, setNewAccountName] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [openDate, setOpenDate] = useState(todayStr());
  const [saveState, setSaveState] = useState("idle");
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: accs } = await supabase.from("contas").select("*").order("criado_em", { ascending: true });
    setAccounts(accs || []);
    if (accs && accs.length) {
      setActiveId((prev) => prev || accs[0].id);
      const ids = accs.map((a) => a.id);

      const { data: regs } = await supabase.from("registros").select("*").in("conta_id", ids);
      const regGrouped = {};
      for (const acc of accs) regGrouped[acc.id] = {};
      for (const r of regs || []) regGrouped[r.conta_id][r.data] = r;
      setRegByAccount(regGrouped);

      const { data: apostas } = await supabase.from("apostas").select("*").in("conta_id", ids).order("criado_em", { ascending: true });
      const apGrouped = {};
      for (const acc of accs) apGrouped[acc.id] = {};
      for (const a of apostas || []) {
        if (!apGrouped[a.conta_id][a.data]) apGrouped[a.conta_id][a.data] = [];
        apGrouped[a.conta_id][a.data].push(a);
      }
      setApostasByAccount(apGrouped);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---------- accounts ----------
  const addAccount = async () => {
    const nome = newAccountName.trim();
    if (!nome) return;
    const { data, error } = await supabase.from("contas").insert({ nome }).select().single();
    if (!error && data) {
      setAccounts((prev) => [...prev, data]);
      setRegByAccount((prev) => ({ ...prev, [data.id]: {} }));
      setApostasByAccount((prev) => ({ ...prev, [data.id]: {} }));
      setActiveId(data.id);
    }
    setNewAccountName("");
    setAddingAccount(false);
  };

  const deleteAccount = async (id) => {
    await supabase.from("contas").delete().eq("id", id);
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    setRegByAccount((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setApostasByAccount((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    setConfirmDeleteAcc(null);
  };

  // ---------- saldo / imagem (registros) ----------
  const upsertRegistro = async (accountId, date, patch) => {
    setSaveState("saving");
    const current = regByAccount[accountId]?.[date] || {};
    const merged = { ...current, ...patch };
    setRegByAccount((prev) => ({ ...prev, [accountId]: { ...(prev[accountId] || {}), [date]: merged } }));
    const payload = {
      conta_id: accountId,
      data: date,
      saldo: merged.saldo === "" || merged.saldo == null ? null : merged.saldo,
      imagem_url: merged.imagem_url || null,
      atualizado_em: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("registros").upsert(payload, { onConflict: "conta_id,data" }).select().single();
    if (!error && data) {
      setRegByAccount((prev) => ({ ...prev, [accountId]: { ...(prev[accountId] || {}), [date]: data } }));
      setSaveState("saved");
    } else setSaveState("error");
    setTimeout(() => setSaveState("idle"), 1200);
  };

  const uploadImage = async (accountId, date, file) => {
    const path = `${accountId}/${date}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("prints").upload(path, file);
    if (upErr) { alert("Erro ao enviar imagem: " + upErr.message); return; }
    const { data } = supabase.storage.from("prints").getPublicUrl(path);
    await upsertRegistro(accountId, date, { imagem_url: data.publicUrl });
  };

  // ---------- apostas (múltiplas por dia) ----------
  const addAposta = async (accountId, date) => {
    setSaveState("saving");
    const { data, error } = await supabase
      .from("apostas")
      .insert({ conta_id: accountId, data: date, valor_aposta: null, time: "", odd: null, cashback_previsto: null })
      .select()
      .single();
    if (!error && data) {
      setApostasByAccount((prev) => {
        const acc = { ...(prev[accountId] || {}) };
        acc[date] = [...(acc[date] || []), data];
        return { ...prev, [accountId]: acc };
      });
      setSaveState("saved");
    } else setSaveState("error");
    setTimeout(() => setSaveState("idle"), 1000);
  };

  const updateAposta = async (accountId, date, apostaId, patch) => {
    setSaveState("saving");
    setApostasByAccount((prev) => {
      const acc = { ...(prev[accountId] || {}) };
      acc[date] = (acc[date] || []).map((a) => (a.id === apostaId ? { ...a, ...patch } : a));
      return { ...prev, [accountId]: acc };
    });
    const { error } = await supabase.from("apostas").update(patch).eq("id", apostaId);
    setSaveState(error ? "error" : "saved");
    setTimeout(() => setSaveState("idle"), 1000);
  };

  const deleteAposta = async (accountId, date, apostaId) => {
    await supabase.from("apostas").delete().eq("id", apostaId);
    setApostasByAccount((prev) => {
      const acc = { ...(prev[accountId] || {}) };
      acc[date] = (acc[date] || []).filter((a) => a.id !== apostaId);
      return { ...prev, [accountId]: acc };
    });
  };

  const deleteDay = async (accountId, date) => {
    const reg = regByAccount[accountId]?.[date];
    if (reg?.id) await supabase.from("registros").delete().eq("id", reg.id);
    const apostaIds = (apostasByAccount[accountId]?.[date] || []).map((a) => a.id);
    if (apostaIds.length) await supabase.from("apostas").delete().in("id", apostaIds);
    setRegByAccount((prev) => { const acc = { ...(prev[accountId] || {}) }; delete acc[date]; return { ...prev, [accountId]: acc }; });
    setApostasByAccount((prev) => { const acc = { ...(prev[accountId] || {}) }; delete acc[date]; return { ...prev, [accountId]: acc }; });
  };

  const activeAccount = accounts.find((a) => a.id === activeId);
  const activeReg = regByAccount[activeId] || {};
  const activeApostas = apostasByAccount[activeId] || {};

  const sortedDates = useMemo(() => {
    const dates = new Set([...Object.keys(activeReg), ...Object.keys(activeApostas)]);
    dates.add(openDate);
    return Array.from(dates).sort((a, b) => (a < b ? 1 : -1));
  }, [activeReg, activeApostas, openDate]);

  const StatusPill = ({ status }) => {
    const map = {
      match: { label: "Bateu", icon: Check, bg: "rgba(16,185,129,.15)", fg: "#34d399", border: "rgba(16,185,129,.3)" },
      mismatch: { label: "Não bateu", icon: X, bg: "rgba(244,63,94,.15)", fg: "#fb7185", border: "rgba(244,63,94,.3)" },
      pending: { label: "Sem dados", icon: AlertTriangle, bg: "rgba(113,113,122,.1)", fg: "#71717a", border: "rgba(113,113,122,.2)" },
    };
    const s = map[status];
    const Icon = s.icon;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, border: `1px solid ${s.border}`, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 500 }}>
        <Icon size={11} strokeWidth={2.5} /> {s.label}
      </span>
    );
  };

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }} className="mono">carregando registros…</div>;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid rgba(39,41,46,.8)", position: "sticky", top: 0, background: "rgba(11,13,16,.95)", backdropFilter: "blur(6px)", zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#fbbf24,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0b0d10", fontSize: 13 }}>GB</div>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 600, color: "#fafafa", margin: 0 }}>Gerenciamento Cash Big</h1>
              <p style={{ fontSize: 11, color: "#71717a", margin: 0 }} className="mono">bigbet · cashback 10% diário</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 11, color: "#52525b", height: 16 }} className="mono">
              {saveState === "saving" && "salvando…"}
              {saveState === "saved" && <span style={{ color: "#34d399" }}>salvo</span>}
              {saveState === "error" && <span style={{ color: "#fb7185" }}>erro ao salvar</span>}
            </div>
            <button onClick={() => supabase.auth.signOut()} title="Sair" style={{ background: "none", border: "none", color: "#52525b" }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => setActiveId(acc.id)}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                border: `1px solid ${activeId === acc.id ? "#fbbf24" : "#27292e"}`,
                background: activeId === acc.id ? "#fbbf24" : "#18181b",
                color: activeId === acc.id ? "#0b0d10" : "#a1a1aa",
              }}
            >
              {acc.nome}
            </button>
          ))}

          {addingAccount ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                autoFocus
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addAccount(); if (e.key === "Escape") setAddingAccount(false); }}
                placeholder="nome da conta"
                className="input-field"
                style={{ width: 150, borderRadius: 999, padding: "6px 12px" }}
              />
              <button onClick={addAccount} style={{ padding: 6, borderRadius: 999, background: "#fbbf24", border: "none", color: "#0b0d10" }}><Check size={14} strokeWidth={3} /></button>
              <button onClick={() => setAddingAccount(false)} style={{ padding: 6, borderRadius: 999, background: "#27292e", border: "none", color: "#a1a1aa" }}><X size={14} strokeWidth={3} /></button>
            </div>
          ) : (
            <button onClick={() => setAddingAccount(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500, border: "1px dashed #3f3f46", background: "transparent", color: "#71717a" }}>
              <Plus size={13} strokeWidth={2.5} /> conta
            </button>
          )}
        </div>

        {!activeAccount ? (
          <div style={{ borderRadius: 10, border: "1px dashed #27292e", padding: "60px 0", textAlign: "center", color: "#52525b" }}>
            <Wallet size={28} style={{ opacity: 0.4, marginBottom: 10 }} />
            <p style={{ fontSize: 14 }}>Nenhuma conta cadastrada ainda.</p>
            <p style={{ fontSize: 12 }}>Adicione a primeira conta bigbet acima para começar.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#a1a1aa", fontSize: 12 }} className="mono">
                <TrendingUp size={13} />
                {sortedDates.filter((d) => activeReg[d]?.saldo != null || (activeApostas[d] || []).length > 0).length} registros
              </div>
              {confirmDeleteAcc === activeAccount.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "#71717a" }}>excluir "{activeAccount.nome}" e todo histórico?</span>
                  <button onClick={() => deleteAccount(activeAccount.id)} style={{ background: "none", border: "none", color: "#fb7185", fontWeight: 500 }}>confirmar</button>
                  <button onClick={() => setConfirmDeleteAcc(null)} style={{ background: "none", border: "none", color: "#71717a" }}>cancelar</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteAcc(activeAccount.id)} style={{ background: "none", border: "none", color: "#3f3f46" }}><Trash2 size={14} /></button>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Calendar size={14} color="#52525b" />
              <input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} className="input-field" style={{ width: "auto" }} />
              <span style={{ fontSize: 12, color: "#52525b" }}>registrar/editar este dia abaixo</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedDates.map((date) => {
                const reg = activeReg[date] || {};
                const apostasDoDia = activeApostas[date] || [];
                const apostasOntem = activeApostas[prevDateStr(date)] || [];
                const regOntem = activeReg[prevDateStr(date)];

                const expectedFromYesterday = apostasOntem.length > 0 || regOntem ? totalCashback(apostasOntem) : null;
                const hasBalanceToday = reg.saldo != null;
                const hasBalanceYesterday = regOntem?.saldo != null;
                const delta = hasBalanceToday && hasBalanceYesterday ? Number(reg.saldo) - Number(regOntem.saldo) : null;

                let status = "pending";
                if (expectedFromYesterday != null && delta != null) {
                  status = Math.abs(delta - expectedFromYesterday) <= 0.5 ? "match" : "mismatch";
                }

                return (
                  <EntryCard
                    key={date}
                    date={date}
                    reg={reg}
                    apostas={apostasDoDia}
                    expectedFromYesterday={expectedFromYesterday}
                    delta={delta}
                    status={status}
                    isToday={date === openDate}
                    onChangeReg={(patch) => upsertRegistro(activeAccount.id, date, patch)}
                    onDeleteDay={() => deleteDay(activeAccount.id, date)}
                    onUploadImage={(file) => uploadImage(activeAccount.id, date, file)}
                    onAddAposta={() => addAposta(activeAccount.id, date)}
                    onChangeAposta={(apostaId, patch) => updateAposta(activeAccount.id, date, apostaId, patch)}
                    onDeleteAposta={(apostaId) => deleteAposta(activeAccount.id, date, apostaId)}
                    StatusPill={StatusPill}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EntryCard({
  date, reg, apostas, expectedFromYesterday, delta, status, isToday,
  onChangeReg, onDeleteDay, onUploadImage, onAddAposta, onChangeAposta, onDeleteAposta, StatusPill,
}) {
  const [expanded, setExpanded] = useState(isToday);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const expectedToday = totalCashback(apostas);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await onUploadImage(file);
    setUploading(false);
    e.target.value = "";
  };

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${isToday ? "rgba(251,191,36,.3)" : "#27292e"}`, background: isToday ? "rgba(251,191,36,.03)" : "rgba(24,24,27,.4)", overflow: "hidden" }}>
      <button onClick={() => setExpanded((e) => !e)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {expanded ? <ChevronDown size={15} color="#52525b" /> : <ChevronRight size={15} color="#52525b" />}
          <span className="mono" style={{ fontSize: 13, color: "#e4e4e7" }}>{fmtDate(date)}</span>
          {isToday && <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#fbbf24", fontWeight: 600 }}>hoje</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {apostas.length > 0 && (
            <span className="mono" style={{ fontSize: 12, color: "#71717a" }}>
              {apostas.length} {apostas.length === 1 ? "aposta" : "apostas"}
            </span>
          )}
          <StatusPill status={status} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "4px 16px 16px", borderTop: "1px solid rgba(39,41,46,.6)" }}>
          {/* Apostas do dia */}
          <div style={{ margin: "12px 0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500 }}>
                Apostas nesse dia
              </label>
              <button onClick={onAddAposta} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#fbbf24", background: "none", border: "1px dashed rgba(251,191,36,.4)", borderRadius: 6, padding: "4px 9px" }}>
                <Plus size={12} strokeWidth={2.5} /> adicionar aposta
              </button>
            </div>

            {apostas.length === 0 && (
              <div style={{ fontSize: 12, color: "#52525b", padding: "6px 0" }}>Nenhuma aposta registrada nesse dia.</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {apostas.map((aposta, idx) => (
                <div key={aposta.id} style={{ border: "1px solid #27292e", borderRadius: 8, padding: 10, background: "rgba(11,13,16,.4)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className="mono" style={{ fontSize: 11, color: "#52525b" }}>aposta #{idx + 1}</span>
                    <button onClick={() => onDeleteAposta(aposta.id)} style={{ background: "none", border: "none", color: "#3f3f46" }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10 }}>
                    <Field label="Valor da aposta">
                      <input type="number" step="0.01" defaultValue={aposta.valor_aposta ?? ""} onBlur={(e) => onChangeAposta(aposta.id, { valor_aposta: e.target.value === "" ? null : e.target.value })} placeholder="0,00" className="input-field" />
                    </Field>
                    <Field label="Time">
                      <input type="text" defaultValue={aposta.time ?? ""} onBlur={(e) => onChangeAposta(aposta.id, { time: e.target.value })} placeholder="ex: Flamengo" className="input-field" />
                    </Field>
                    <Field label="Odd">
                      <input type="number" step="0.01" defaultValue={aposta.odd ?? ""} onBlur={(e) => onChangeAposta(aposta.id, { odd: e.target.value === "" ? null : e.target.value })} placeholder="0,00" className="input-field" />
                    </Field>
                    <Field label="Cashback previsto">
                      <input type="number" step="0.01" defaultValue={aposta.cashback_previsto ?? ""} onBlur={(e) => onChangeAposta(aposta.id, { cashback_previsto: e.target.value === "" ? null : e.target.value })} placeholder={aposta.valor_aposta ? fmtMoney(Number(aposta.valor_aposta) * 0.1) : "auto (10%)"} className="input-field" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Saldo do dia */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "end", marginTop: 14 }}>
            <Field label="Saldo da conta nesse dia (print)">
              <input type="number" step="0.01" value={reg.saldo ?? ""} onChange={(e) => onChangeReg({ saldo: e.target.value })} placeholder="0,00" className="input-field" />
            </Field>
            <div className="mono" style={{ fontSize: 12 }}>
              <div style={{ color: "#71717a", marginBottom: 2 }}>Cashback esperado (p/ amanhã)</div>
              <div style={{ color: "#fbbf24", fontWeight: 600 }}>{apostas.length > 0 ? fmtMoney(expectedToday) : "—"}</div>
            </div>
            <div className="mono" style={{ fontSize: 12 }}>
              <div style={{ color: "#71717a", marginBottom: 2 }}>Variação vs. cashback de ontem</div>
              <div style={{ color: delta == null ? "#52525b" : "#e4e4e7" }}>
                {delta == null ? "sem dado do dia anterior" : `${fmtMoney(delta)} (esperado ${fmtMoney(expectedFromYesterday || 0)})`}
              </div>
            </div>
          </div>

          {/* Print do saldo */}
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 6 }}>
              Print do saldo
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {reg.imagem_url && (
                <img
                  src={reg.imagem_url}
                  alt="Print do saldo"
                  onClick={() => setLightbox(true)}
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #27292e", cursor: "pointer" }}
                />
              )}
              <label style={{ fontSize: 12, color: "#a1a1aa", border: "1px dashed #3f3f46", borderRadius: 6, padding: "8px 12px", cursor: "pointer" }}>
                {uploading ? "enviando…" : reg.imagem_url ? "trocar imagem" : "+ anexar print"}
                <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
              </label>
            </div>
          </div>

          {lightbox && reg.imagem_url && (
            <div
              onClick={() => setLightbox(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, cursor: "zoom-out" }}
            >
              <img src={reg.imagem_url} alt="Print do saldo ampliado" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 8 }} />
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button onClick={onDeleteDay} style={{ background: "none", border: "none", fontSize: 11, color: "#3f3f46", display: "flex", alignItems: "center", gap: 4 }}>
              <Trash2 size={11} /> limpar este dia
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
