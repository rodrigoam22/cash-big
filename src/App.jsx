import React, { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Calculadora from "./Calculadora";
import { LogOut, DollarSign } from "lucide-react";

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
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#fbbf24,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0b0d10" }}>
            <DollarSign size={19} strokeWidth={2.75} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fafafa" }}>Calculadora Anti PT</div>
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
  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid rgba(39,41,46,.8)", position: "sticky", top: 0, background: "rgba(11,13,16,.95)", backdropFilter: "blur(6px)", zIndex: 20 }}>
        <div style={{ maxWidth: 880, margin: "0 auto", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#fbbf24,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0b0d10", flexShrink: 0 }}>
              <DollarSign size={18} strokeWidth={2.75} />
            </div>
            <div>
              <h1 style={{ fontSize: 15, fontWeight: 600, color: "#fafafa", margin: 0 }}>Calculadora Anti PT</h1>
              <p style={{ fontSize: 11, color: "#71717a", margin: 0 }} className="mono">calculadora de dutching &amp; cashback</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={() => supabase.auth.signOut()} title="Sair" style={{ background: "none", border: "none", color: "#52525b" }}>
              <LogOut size={16} />
            </button>
            <img src="/avatar.png" alt="avatar" style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #27292e", objectFit: "cover" }} />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px" }}>
        <Calculadora />
      </div>
    </div>
  );
}
