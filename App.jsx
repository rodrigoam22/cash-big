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

// ================= LOGIN =================
function Login({ onLoggedIn }) {
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
    else onLoggedIn();
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
  const [session, setSession] = useState(undefined); // undefined = checking, null = logged out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }} className="mono">carregando…</div>;
  }
  if (!session) return <Login onLoggedIn={() => {}} />;
  return <Dashboard />;
}

// ================= DASHBOARD =================
function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [entriesByAccount, setEntriesByAccount] = useState({});
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
      const { data: regs } = await supabase.from("registros").select("*").in("conta_id", accs.map((a) => a.id));
      const grouped = {};
      for (const acc of accs) grouped[acc.id] = {};
      for (const r of regs || []) {
        grouped[r.conta_id][r.data] = r;
      }
      setEntriesByAccount(grouped);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addAccount = async () => {
    const nome = newAccountName.trim();
    if (!nome) return;
    const { data, error } = await supabase.from("contas").insert({ nome }).select().single();
    if (!error && data) {
      setAccounts((prev) => [...prev, data]);
      setEntriesByAccount((prev) => ({ ...prev, [data.id]: {} }));
      setActiveId(data.id);
    }
    setNewAccountName("");
    setAddingAccount(false);
  };

  const deleteAccount = async (id) => {
    await supabase.from("contas").delete().eq("id", id);
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    setEntriesByAccount((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    setConfirmDeleteAcc(null);
  };

  const upsertEntry = async (accountId, date, patch) => {
    setSaveState("saving");
    const current = entriesByAccount[accountId]?.[date] || {};
    const merged = { ...current, ...patch, conta_id: accountId, data: date };
    // optimistic update
    setEntriesByAccount((prev) => ({
      ...prev,
      [accountId]: { ...(prev[accountId] || {}), [date]: merged },
    }));
    const payload = {
      conta_id: accountId,
      data: date,
      teve_aposta: merged.teve_aposta ?? null,
      valor_aposta: merged.valor_aposta === "" ? null : merged.valor_aposta,
      time: merged.time || null,
      odd: merged.odd === "" ? null : merged.odd,
      cashback_previsto: merged.cashback_previsto === "" ? null : merged.cashback_previsto,
      saldo: merged.saldo === "" ? null : merged.saldo,
      atualizado_em: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("registros")
      .upsert(payload, { onConflict: "conta_id,data" })
      .select()
      .single();
    if (!error && data) {
      setEntriesByAccount((prev) => ({
        ...prev,
        [accountId]: { ...(prev[accountId] || {}), [date]: data },
      }));
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
    setTimeout(() => setSaveState("idle"), 1200);
  };

  const deleteEntry = async (accountId, date) => {
    const entry = entriesByAccount[accountId]?.[date];
    if (entry?.id) await supabase.from("registros").delete().eq("id", entry.id);
    setEntriesByAccount((prev) => {
      const acc = { ...(prev[accountId] || {}) };
      delete acc[date];
      return { ...prev, [accountId]: acc };
    });
  };

  const activeAccount = accounts.find((a) => a.id === activeId);
  const activeEntries = entriesByAccount[activeId] || {};

  const sortedDates = useMemo(() => {
    const dates = new Set(Object.keys(activeEntries));
    dates.add(openDate);
    return Array.from(dates).sort((a, b) => (a < b ? 1 : -1));
  }, [activeEntries, openDate]);

  const getExpectedCashback = (entry) => {
    if (!entry) return null;
    if (entry.teve_aposta !== true) return 0;
    if (entry.cashback_previsto != null) return Number(entry.cashback_previsto);
    if (entry.valor_aposta) return Number(entry.valor_aposta) * 0.1;
    return null;
  };

  const StatusPill = ({ status }) => {
    const map = {
      match: { label: "Bateu", cls: "match", icon: Check },
      mismatch: { label: "Não bateu", cls: "mismatch", icon: X },
      pending: { label: "Sem dados", cls: "pending", icon: AlertTriangle },
    };
    const s = map[status];
    const Icon = s.icon;
    const colors = {
      match: { bg: "rgba(16,185,129,.15)", fg: "#34d399", border: "rgba(16,185,129,.3)" },
      mismatch: { bg: "rgba(244,63,94,.15)", fg: "#fb7185", border: "rgba(244,63,94,.3)" },
      pending: { bg: "rgba(113,113,122,.1)", fg: "#71717a", border: "rgba(113,113,122,.2)" },
    }[s.cls];
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.fg, fontSize: 11, fontWeight: 500 }}>
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
                {sortedDates.filter((d) => activeEntries[d]?.teve_aposta != null || activeEntries[d]?.saldo != null).length} registros
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
                const entry = activeEntries[date] || {};
                const prevEntry = activeEntries[prevDateStr(date)];
                const expectedFromYesterday = getExpectedCashback(prevEntry);
                const hasBalanceToday = entry.saldo != null;
                const hasBalanceYesterday = prevEntry?.saldo != null;
                const delta = hasBalanceToday && hasBalanceYesterday ? Number(entry.saldo) - Number(prevEntry.saldo) : null;
                let status = "pending";
                if (expectedFromYesterday != null && delta != null) {
                  status = Math.abs(delta - expectedFromYesterday) <= 0.5 ? "match" : "mismatch";
                }
                return (
                  <EntryCard
                    key={date}
                    date={date}
                    entry={entry}
                    expectedFromYesterday={expectedFromYesterday}
                    delta={delta}
                    status={status}
                    isToday={date === openDate}
                    onChange={(patch) => upsertEntry(activeAccount.id, date, patch)}
                    onDelete={() => deleteEntry(activeAccount.id, date)}
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

function EntryCard({ date, entry, expectedFromYesterday, delta, status, isToday, onChange, onDelete, StatusPill }) {
  const [expanded, setExpanded] = useState(isToday);
  const expectedToday = entry.teve_aposta === true
    ? (entry.cashback_previsto != null ? Number(entry.cashback_previsto) : (entry.valor_aposta ? Number(entry.valor_aposta) * 0.1 : 0))
    : 0;

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${isToday ? "rgba(251,191,36,.3)" : "#27292e"}`, background: isToday ? "rgba(251,191,36,.03)" : "rgba(24,24,27,.4)", overflow: "hidden" }}>
      <button onClick={() => setExpanded((e) => !e)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {expanded ? <ChevronDown size={15} color="#52525b" /> : <ChevronRight size={15} color="#52525b" />}
          <span className="mono" style={{ fontSize: 13, color: "#e4e4e7" }}>{fmtDate(date)}</span>
          {isToday && <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#fbbf24", fontWeight: 600 }}>hoje</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {entry.teve_aposta === true && (
            <span className="mono" style={{ fontSize: 12, color: "#71717a" }}>aposta {fmtMoney(entry.valor_aposta || 0)}</span>
          )}
          <StatusPill status={status} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "4px 16px 16px", borderTop: "1px solid rgba(39,41,46,.6)" }}>
          <div style={{ margin: "12px 0" }}>
            <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 6 }}>
              Teve aposta nesse dia?
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onChange({ teve_aposta: true })}
                style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${entry.teve_aposta === true ? "#fbbf24" : "#3f3f46"}`, background: entry.teve_aposta === true ? "#fbbf24" : "transparent", color: entry.teve_aposta === true ? "#0b0d10" : "#71717a" }}
              >Sim</button>
              <button
                onClick={() => onChange({ teve_aposta: false, valor_aposta: "", time: "", odd: "", cashback_previsto: "" })}
                style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${entry.teve_aposta === false ? "#52525b" : "#3f3f46"}`, background: entry.teve_aposta === false ? "#3f3f46" : "transparent", color: entry.teve_aposta === false ? "#e4e4e7" : "#71717a" }}
              >Não</button>
            </div>
          </div>

          {entry.teve_aposta === true && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 14 }}>
              <Field label="Valor da aposta">
                <input type="number" step="0.01" value={entry.valor_aposta ?? ""} onChange={(e) => onChange({ valor_aposta: e.target.value })} placeholder="0,00" className="input-field" />
              </Field>
              <Field label="Time">
                <input type="text" value={entry.time ?? ""} onChange={(e) => onChange({ time: e.target.value })} placeholder="ex: Flamengo" className="input-field" />
              </Field>
              <Field label="Odd">
                <input type="number" step="0.01" value={entry.odd ?? ""} onChange={(e) => onChange({ odd: e.target.value })} placeholder="0,00" className="input-field" />
              </Field>
              <Field label="Cashback previsto">
                <input type="number" step="0.01" value={entry.cashback_previsto ?? ""} onChange={(e) => onChange({ cashback_previsto: e.target.value })} placeholder={entry.valor_aposta ? fmtMoney(Number(entry.valor_aposta) * 0.1) : "auto (10%)"} className="input-field" />
              </Field>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "end" }}>
            <Field label="Saldo da conta nesse dia (print)">
              <input type="number" step="0.01" value={entry.saldo ?? ""} onChange={(e) => onChange({ saldo: e.target.value })} placeholder="0,00" className="input-field" />
            </Field>
            <div className="mono" style={{ fontSize: 12 }}>
              <div style={{ color: "#71717a", marginBottom: 2 }}>Cashback esperado (p/ amanhã)</div>
              <div style={{ color: "#fbbf24", fontWeight: 600 }}>{entry.teve_aposta === true ? fmtMoney(expectedToday) : "—"}</div>
            </div>
            <div className="mono" style={{ fontSize: 12 }}>
              <div style={{ color: "#71717a", marginBottom: 2 }}>Variação vs. cashback de ontem</div>
              <div style={{ color: delta == null ? "#52525b" : "#e4e4e7" }}>
                {delta == null ? "sem dado do dia anterior" : `${fmtMoney(delta)} (esperado ${fmtMoney(expectedFromYesterday || 0)})`}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button onClick={onDelete} style={{ background: "none", border: "none", fontSize: 11, color: "#3f3f46", display: "flex", alignItems: "center", gap: 4 }}>
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
