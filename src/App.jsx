import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Calculadora from "./Calculadora";
import Operacoes from "./Operacoes";
import Pagamento from "./Pagamento";
import { LogOut, DollarSign, Calculator as CalcIcon, ClipboardList, Wallet } from "lucide-react";

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
      <form onSubmit={handleSubmit} style={{ width: 320, padding: 28, background: "#151833", border: "1px solid #2a2f52", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#00e676,#00b85c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0b0e1d" }}>
            <DollarSign size={19} strokeWidth={2.75} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fafafa" }}>Duplo Green Dólar</div>
            <div style={{ fontSize: 11, color: "#8b90b3" }} className="mono">entre para continuar</div>
          </div>
        </div>
        <label style={{ fontSize: 11, color: "#8b90b3", textTransform: "uppercase", letterSpacing: 0.5 }}>E-mail</label>
        <input className="input-field" style={{ marginTop: 4, marginBottom: 14 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label style={{ fontSize: 11, color: "#8b90b3", textTransform: "uppercase", letterSpacing: 0.5 }}>Senha</label>
        <input className="input-field" style={{ marginTop: 4, marginBottom: 18 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div style={{ color: "#ff5a6a", fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: "#00e676", color: "#0b0e1d", fontWeight: 600, fontSize: 13 }}>
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
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8b90b3" }} className="mono">carregando…</div>;
  }
  if (!session) return <Login />;
  return <Dashboard />;
}

// ================= DASHBOARD =================
function Dashboard() {
  const [pagina, setPagina] = useState("calculadora"); // "calculadora" | "operacoes"

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ position: "sticky", top: 0, background: "rgba(11,14,29,.95)", backdropFilter: "blur(6px)", zIndex: 20, borderBottom: "1px solid rgba(42,47,82,.8)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 12, columnGap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderRadius: 14, background: "#151833", border: "1px solid #2a2f52" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#00e676", boxShadow: "0 0 10px #00e676", flexShrink: 0 }} />
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fafafa", margin: 0, letterSpacing: 0.3, textTransform: "uppercase", lineHeight: 1.1 }}>Duplo Green Dólar</h1>
              <p style={{ fontSize: 11, color: "#00e676", margin: "3px 0 0" }} className="mono">calculadora de dutching &amp; registro de operações</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
            {[
              { id: "calculadora", label: "Calculadora", Icon: CalcIcon, grad: "linear-gradient(135deg,#2f80c9,#1d5c99)" },
              { id: "operacoes", label: "Operações", Icon: ClipboardList, grad: "linear-gradient(135deg,#00d26a,#00a050)" },
              { id: "pagamento", label: "Pagamento", Icon: Wallet, grad: "linear-gradient(135deg,#8e5bd6,#6a3fb0)" },
            ].map(({ id, label, Icon, grad }) => {
              const ativo = pagina === id;
              return (
                <button
                  key={id}
                  onClick={() => setPagina(id)}
                  style={{ minWidth: 104, padding: "12px 14px", borderRadius: 12, border: ativo ? "2px solid #fff" : "2px solid transparent", background: grad, color: "#fff", fontSize: 12.5, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: ativo ? 1 : 0.72, transition: "opacity .15s" }}
                >
                  <Icon size={18} />
                  {label}
                </button>
              );
            })}
            <button onClick={() => supabase.auth.signOut()} title="Sair" style={{ background: "none", border: "none", color: "#6b7099", marginLeft: 4 }}>
              <LogOut size={17} />
            </button>
            <img src="/avatar.png" alt="avatar" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #2a2f52", objectFit: "cover" }} />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        {pagina === "operacoes" ? <Operacoes /> : pagina === "pagamento" ? <Pagamento /> : <Calculadora />}
      </div>
    </div>
  );
}
