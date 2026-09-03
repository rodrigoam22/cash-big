import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import Calculadora from "./Calculadora";
import {
  Plus, Trash2, Check, X, ChevronLeft, ChevronRight,
  Wallet, LogOut, Sparkles, AlertTriangle,
} from "lucide-react";

// ---------- date / week helpers (semana = domingo a sábado) ----------
const todayStr = () => new Date().toISOString().slice(0, 10);
const toDate = (iso) => new Date(iso + "T00:00:00");
const isoOf = (d) => d.toISOString().slice(0, 10);
const fmtDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const fmtMoney = (v) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const weekStartOf = (iso) => {
  const d = toDate(iso);
  d.setDate(d.getDate() - d.getDay()); // getDay: 0=domingo
  return isoOf(d);
};
const weekEndOf = (weekStartIso) => {
  const d = toDate(weekStartIso);
  d.setDate(d.getDate() + 6);
  return isoOf(d);
};
const addWeeks = (weekStartIso, n) => {
  const d = toDate(weekStartIso);
  d.setDate(d.getDate() + 7 * n);
  return isoOf(d);
};
const fmtWeekRange = (weekStartIso) => `${fmtDate(weekStartIso)} — ${fmtDate(weekEndOf(weekStartIso))}`;

const cashbackDe = (aposta) => {
  if (aposta.resultado !== "red") return 0; // só perda gera cashback
  return aposta.cashback_previsto != null
    ? Number(aposta.cashback_previsto)
    : (aposta.valor_aposta ? Number(aposta.valor_aposta) * 0.2 : 0);
};

const totalCashback = (apostas) => (apostas || []).reduce((acc, a) => acc + cashbackDe(a), 0);

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
  const [apostasByAccount, setApostasByAccount] = useState({}); // {accountId: {weekStart: [aposta,...]}}
  const [statusByAccount, setStatusByAccount] = useState({});   // {accountId: {weekStart: {id, usada}}}
  const [loading, setLoading] = useState(true);
  const [newAccountName, setNewAccountName] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(weekStartOf(todayStr()));
  const [saveState, setSaveState] = useState("idle");
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState(null);
  const [pagina, setPagina] = useState("semanas"); // "semanas" | "calculadora"

  const currentWeek = weekStartOf(todayStr());
  const todayDow = toDate(todayStr()).getDay(); // 0 domingo ... 6 sábado
  const isViewingCurrentWeek = selectedWeek === currentWeek;

  const loadAll = useCallback(async () => {
    setLoading(true);
    const { data: accs } = await supabase.from("contas").select("*").order("criado_em", { ascending: true });
    setAccounts(accs || []);
    if (accs && accs.length) {
      setActiveId((prev) => prev || accs[0].id);
      const ids = accs.map((a) => a.id);

      const { data: apostas } = await supabase.from("apostas").select("*").in("conta_id", ids).order("criado_em", { ascending: true });
      const apGrouped = {};
      for (const acc of accs) apGrouped[acc.id] = {};
      for (const a of apostas || []) {
        const ws = weekStartOf(a.data);
        if (!apGrouped[a.conta_id][ws]) apGrouped[a.conta_id][ws] = [];
        apGrouped[a.conta_id][ws].push(a);
      }
      setApostasByAccount(apGrouped);

      const { data: statuses } = await supabase.from("semana_status").select("*").in("conta_id", ids);
      const stGrouped = {};
      for (const acc of accs) stGrouped[acc.id] = {};
      for (const s of statuses || []) stGrouped[s.conta_id][s.semana_inicio] = s;
      setStatusByAccount(stGrouped);
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
      setApostasByAccount((prev) => ({ ...prev, [data.id]: {} }));
      setStatusByAccount((prev) => ({ ...prev, [data.id]: {} }));
      setActiveId(data.id);
    }
    setNewAccountName("");
    setAddingAccount(false);
  };

  const deleteAccount = async (id) => {
    await supabase.from("contas").delete().eq("id", id);
    const next = accounts.filter((a) => a.id !== id);
    setAccounts(next);
    setApostasByAccount((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setStatusByAccount((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (activeId === id) setActiveId(next[0]?.id ?? null);
    setConfirmDeleteAcc(null);
  };

  // ---------- status semanal (usada / não usada) ----------
  const toggleUsada = async (accountId, weekStart, usada) => {
    setSaveState("saving");
    const current = statusByAccount[accountId]?.[weekStart];
    setStatusByAccount((prev) => ({
      ...prev,
      [accountId]: { ...(prev[accountId] || {}), [weekStart]: { ...(current || {}), usada } },
    }));
    const { data, error } = await supabase
      .from("semana_status")
      .upsert({ conta_id: accountId, semana_inicio: weekStart, usada, atualizado_em: new Date().toISOString() }, { onConflict: "conta_id,semana_inicio" })
      .select()
      .single();
    if (!error && data) {
      setStatusByAccount((prev) => ({ ...prev, [accountId]: { ...(prev[accountId] || {}), [weekStart]: data } }));
      setSaveState("saved");
    } else setSaveState("error");
    setTimeout(() => setSaveState("idle"), 1000);
  };

  // ---------- apostas ----------
  const addAposta = async (accountId, weekStart) => {
    setSaveState("saving");
    const defaultDate = isViewingCurrentWeekFor(weekStart) ? todayStr() : weekStart;
    const { data, error } = await supabase
      .from("apostas")
      .insert({ conta_id: accountId, data: defaultDate, valor_aposta: null, time: "", odd: null, cashback_previsto: null })
      .select()
      .single();
    if (!error && data) {
      setApostasByAccount((prev) => {
        const acc = { ...(prev[accountId] || {}) };
        acc[weekStart] = [...(acc[weekStart] || []), data];
        return { ...prev, [accountId]: acc };
      });
      // marca a conta como usada automaticamente ao lançar uma aposta
      toggleUsada(accountId, weekStart, true);
      setSaveState("saved");
    } else setSaveState("error");
    setTimeout(() => setSaveState("idle"), 1000);
  };

  function isViewingCurrentWeekFor(weekStart) {
    return weekStart === currentWeek;
  }

  const updateAposta = async (accountId, weekStart, apostaId, patch) => {
    setSaveState("saving");
    setApostasByAccount((prev) => {
      const acc = { ...(prev[accountId] || {}) };
      acc[weekStart] = (acc[weekStart] || []).map((a) => (a.id === apostaId ? { ...a, ...patch } : a));
      return { ...prev, [accountId]: acc };
    });
    const { error } = await supabase.from("apostas").update(patch).eq("id", apostaId);
    setSaveState(error ? "error" : "saved");
    setTimeout(() => setSaveState("idle"), 1000);
    if (patch.data) loadAll(); // data mudou de semana — recarrega agrupamento
  };

  const deleteAposta = async (accountId, weekStart, apostaId) => {
    await supabase.from("apostas").delete().eq("id", apostaId);
    setApostasByAccount((prev) => {
      const acc = { ...(prev[accountId] || {}) };
      acc[weekStart] = (acc[weekStart] || []).filter((a) => a.id !== apostaId);
      return { ...prev, [accountId]: acc };
    });
  };

  const clearWeek = async (accountId, weekStart) => {
    const apostaIds = (apostasByAccount[accountId]?.[weekStart] || []).map((a) => a.id);
    if (apostaIds.length) await supabase.from("apostas").delete().in("id", apostaIds);
    const status = statusByAccount[accountId]?.[weekStart];
    if (status?.id) await supabase.from("semana_status").delete().eq("id", status.id);
    setApostasByAccount((prev) => { const acc = { ...(prev[accountId] || {}) }; delete acc[weekStart]; return { ...prev, [accountId]: acc }; });
    setStatusByAccount((prev) => { const acc = { ...(prev[accountId] || {}) }; delete acc[weekStart]; return { ...prev, [accountId]: acc }; });
  };

  // ---------- avisos globais (baseados na semana ATUAL, não na visualizada) ----------
  const accountsNotUsedThisWeek = useMemo(() => {
    return accounts.filter((acc) => !(statusByAccount[acc.id]?.[currentWeek]?.usada));
  }, [accounts, statusByAccount, currentWeek]);

  const totalCashbackSemanaTodasContas = useMemo(() => {
    return accounts.reduce((acc, a) => acc + totalCashback(apostasByAccount[a.id]?.[selectedWeek] || []), 0);
  }, [accounts, apostasByAccount, selectedWeek]);

  const activeAccount = accounts.find((a) => a.id === activeId);
  const apostasDaSemana = apostasByAccount[activeId]?.[selectedWeek] || [];
  const statusDaSemana = statusByAccount[activeId]?.[selectedWeek];

  if (loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a" }} className="mono">carregando registros…</div>;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid rgba(39,41,46,.8)", position: "sticky", top: 0, background: "rgba(11,13,16,.95)", backdropFilter: "blur(6px)", zIndex: 20 }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#fbbf24,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0b0d10", fontSize: 13, flexShrink: 0 }}>GB</div>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 600, color: "#fafafa", margin: 0 }}>Gerenciamento Cash Big</h1>
              <p style={{ fontSize: 11, color: "#71717a", margin: 0 }} className="mono">bigbet · cashback 20% semanal</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", rowGap: 8 }}>
            <div style={{ display: "flex", gap: 4, background: "#18181b", border: "1px solid #27292e", borderRadius: 999, padding: 3 }}>
              <button
                onClick={() => setPagina("semanas")}
                style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: pagina === "semanas" ? "#fbbf24" : "transparent", color: pagina === "semanas" ? "#0b0d10" : "#a1a1aa" }}
              >Contas</button>
              <button
                onClick={() => setPagina("calculadora")}
                style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, border: "none", background: pagina === "calculadora" ? "#fbbf24" : "transparent", color: pagina === "calculadora" ? "#0b0d10" : "#a1a1aa" }}
              >Calculadora</button>
            </div>
            <div style={{ fontSize: 11, color: "#52525b", height: 16 }} className="mono">
              {saveState === "saving" && "salvando…"}
              {saveState === "saved" && <span style={{ color: "#34d399" }}>salvo</span>}
              {saveState === "error" && <span style={{ color: "#fb7185" }}>erro ao salvar</span>}
            </div>
            <button onClick={() => supabase.auth.signOut()} title="Sair" style={{ background: "none", border: "none", color: "#52525b" }}>
              <LogOut size={16} />
            </button>
            <img src="/avatar.png" alt="avatar" style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #27292e", objectFit: "cover" }} />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px" }}>
        {pagina === "calculadora" ? (
          <Calculadora />
        ) : (
        <>


        {/* Avisos globais */}
        {todayDow === 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#34d399" }}>
            <Sparkles size={15} />
            Nova semana de cashback começou hoje — todas as contas foram liberadas novamente.
          </div>
        )}
        {todayDow === 6 && accountsNotUsedThisWeek.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#fb7185" }}>
            <AlertTriangle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>Hoje é sábado, último dia da semana de cashback. Ainda não usadas: <strong>{accountsNotUsedThisWeek.map((a) => a.nome).join(", ")}</strong>.</span>
          </div>
        )}

        {/* Contador de contas */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12, color: "#71717a" }} className="mono">
          <Wallet size={13} />
          {accounts.length} {accounts.length === 1 ? "conta cadastrada" : "contas cadastradas"}
        </div>

        {/* Abas de conta */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {accounts.map((acc) => {
            const usadaAtual = statusByAccount[acc.id]?.[currentWeek]?.usada;
            return (
              <button
                key={acc.id}
                onClick={() => setActiveId(acc.id)}
                style={{
                  position: "relative", padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                  border: `1px solid ${activeId === acc.id ? "#fbbf24" : "#27292e"}`,
                  background: activeId === acc.id ? "#fbbf24" : "#18181b",
                  color: activeId === acc.id ? "#0b0d10" : "#a1a1aa",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: usadaAtual ? "#34d399" : "#52525b" }} />
                {acc.nome}
              </button>
            );
          })}

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
            {/* Navegação de semana */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setSelectedWeek((w) => addWeeks(w, -1))} style={{ background: "#18181b", border: "1px solid #27292e", borderRadius: 6, color: "#a1a1aa", padding: 6 }}>
                  <ChevronLeft size={15} />
                </button>
                <div style={{ fontSize: 13, color: "#e4e4e7", minWidth: 140, textAlign: "center" }} className="mono">
                  {fmtWeekRange(selectedWeek)}
                  {isViewingCurrentWeek && <span style={{ color: "#fbbf24", marginLeft: 6, fontSize: 11 }}>· atual</span>}
                </div>
                <button onClick={() => setSelectedWeek((w) => addWeeks(w, 1))} style={{ background: "#18181b", border: "1px solid #27292e", borderRadius: 6, color: "#a1a1aa", padding: 6 }}>
                  <ChevronRight size={15} />
                </button>
                {!isViewingCurrentWeek && (
                  <button onClick={() => setSelectedWeek(currentWeek)} style={{ fontSize: 11.5, color: "#fbbf24", background: "none", border: "none" }}>
                    ir para semana atual
                  </button>
                )}
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

            {/* Total geral da semana (todas as contas) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
              <span style={{ fontSize: 12.5, color: "#d4a72c" }}>Cashback previsto da semana · todas as contas</span>
              <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: "#fbbf24" }}>{fmtMoney(totalCashbackSemanaTodasContas)}</span>
            </div>

            {/* Card da semana */}
            <div style={{ borderRadius: 10, border: "1px solid #27292e", background: "rgba(24,24,27,.4)", padding: 18 }}>
              {/* Toggle usada */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, marginBottom: 4 }}>
                    Conta usada nessa semana?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => toggleUsada(activeAccount.id, selectedWeek, true)}
                      style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${statusDaSemana?.usada ? "#34d399" : "#3f3f46"}`, background: statusDaSemana?.usada ? "rgba(16,185,129,.15)" : "transparent", color: statusDaSemana?.usada ? "#34d399" : "#71717a" }}
                    >Usada</button>
                    <button
                      onClick={() => toggleUsada(activeAccount.id, selectedWeek, false)}
                      style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${statusDaSemana && !statusDaSemana.usada ? "#52525b" : "#3f3f46"}`, background: statusDaSemana && !statusDaSemana.usada ? "#3f3f46" : "transparent", color: statusDaSemana && !statusDaSemana.usada ? "#e4e4e7" : "#71717a" }}
                    >Não usada</button>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#71717a" }} className="mono">cashback previsto (20%)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fbbf24" }} className="mono">{fmtMoney(totalCashback(apostasDaSemana))}</div>
                </div>
              </div>

              {/* Apostas da semana */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500 }}>
                  Apostas dessa semana
                </label>
                <button onClick={() => addAposta(activeAccount.id, selectedWeek)} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#fbbf24", background: "none", border: "1px dashed rgba(251,191,36,.4)", borderRadius: 6, padding: "4px 9px" }}>
                  <Plus size={12} strokeWidth={2.5} /> adicionar aposta
                </button>
              </div>

              {apostasDaSemana.length === 0 && (
                <div style={{ fontSize: 12, color: "#52525b", padding: "6px 0 12px" }}>Nenhuma aposta registrada nessa semana.</div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {apostasDaSemana.map((aposta, idx) => {
                  const corResultado = aposta.resultado === "red" ? "#f43f5e" : aposta.resultado === "green" ? "#22c55e" : "#3f3f46";
                  return (
                  <div key={aposta.id} style={{ border: "1px solid #27292e", borderLeft: `3px solid ${corResultado}`, borderRadius: 8, padding: 10, background: "rgba(11,13,16,.4)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="mono" style={{ fontSize: 11, color: "#52525b" }}>aposta #{idx + 1}</span>
                      <button onClick={() => deleteAposta(activeAccount.id, selectedWeek, aposta.id)} style={{ background: "none", border: "none", color: "#3f3f46" }}>
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#71717a", fontWeight: 500, display: "block", marginBottom: 4 }}>Resultado</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[
                          { v: "pendente", label: "Pendente", on: "#3f3f46", onFg: "#e4e4e7" },
                          { v: "green", label: "Green", on: "rgba(34,197,94,.18)", onFg: "#4ade80", border: "rgba(34,197,94,.4)" },
                          { v: "red", label: "Red", on: "rgba(244,63,94,.18)", onFg: "#fb7185", border: "rgba(244,63,94,.4)" },
                        ].map((opt) => (
                          <button
                            key={opt.v}
                            onClick={() => updateAposta(activeAccount.id, selectedWeek, aposta.id, { resultado: opt.v })}
                            style={{
                              padding: "5px 11px", borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                              border: `1px solid ${aposta.resultado === opt.v ? (opt.border || "#71717a") : "#3f3f46"}`,
                              background: aposta.resultado === opt.v ? opt.on : "transparent",
                              color: aposta.resultado === opt.v ? opt.onFg : "#71717a",
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(105px,1fr))", gap: 10 }}>
                      <Field label="Data">
                        <input type="date" defaultValue={aposta.data} onBlur={(e) => updateAposta(activeAccount.id, selectedWeek, aposta.id, { data: e.target.value })} className="input-field" />
                      </Field>
                      <Field label="Valor da aposta">
                        <input type="number" step="0.01" defaultValue={aposta.valor_aposta ?? ""} onBlur={(e) => updateAposta(activeAccount.id, selectedWeek, aposta.id, { valor_aposta: e.target.value === "" ? null : e.target.value })} placeholder="0,00" className="input-field" />
                      </Field>
                      <Field label="Time">
                        <input type="text" defaultValue={aposta.time ?? ""} onBlur={(e) => updateAposta(activeAccount.id, selectedWeek, aposta.id, { time: e.target.value })} placeholder="ex: Flamengo" className="input-field" />
                      </Field>
                      <Field label="Odd">
                        <input type="number" step="0.01" defaultValue={aposta.odd ?? ""} onBlur={(e) => updateAposta(activeAccount.id, selectedWeek, aposta.id, { odd: e.target.value === "" ? null : e.target.value })} placeholder="0,00" className="input-field" />
                      </Field>
                      <Field label="Cashback previsto">
                        <input type="number" step="0.01" defaultValue={aposta.cashback_previsto ?? ""} onBlur={(e) => updateAposta(activeAccount.id, selectedWeek, aposta.id, { cashback_previsto: e.target.value === "" ? null : e.target.value })} placeholder={aposta.valor_aposta ? fmtMoney(Number(aposta.valor_aposta) * 0.2) : "auto (20%)"} className="input-field" />
                      </Field>
                    </div>

                    {aposta.resultado !== "red" && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#71717a" }}>
                        {aposta.resultado === "green" ? "Green — não entra no cashback." : "Pendente — só conta pro cashback se marcada como Red."}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => clearWeek(activeAccount.id, selectedWeek)} style={{ background: "none", border: "none", fontSize: 11, color: "#3f3f46", display: "flex", alignItems: "center", gap: 4 }}>
                  <Trash2 size={11} /> limpar essa semana
                </button>
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>
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
