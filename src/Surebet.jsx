import React, { useState, useEffect, useCallback } from "react";
import { listar } from "./db";
import { buscarCotacao, lerCache } from "../cotacao";
import NovaSurebet from "./NovaSurebet";
import Registro from "./Registro";
import Cadastros from "./Cadastros";
import { Seletor } from "./ui";
import { Calculator, ClipboardList, Users, RefreshCw } from "lucide-react";

const SUBABAS = [
  { id: "nova", label: "Nova Surebet", Icon: Calculator },
  { id: "registro", label: "Registro", Icon: ClipboardList },
  { id: "cadastros", label: "Parcerias & Casas", Icon: Users },
];

export default function Surebet() {
  const [pagina, setPagina] = useState("nova");
  const [dados, setDados] = useState({ casas: [], parcerias: [], contas: [], surebets: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(null);
  const [vis, setVis] = useState("USD");

  // ---------- cotação (mesma fonte/cache da Calculadora) ----------
  const [rate, setRate] = useState(null);
  const atualizarCotacao = useCallback(async (forcar) => {
    if (!forcar) { const c = lerCache(); if (c) { setRate(c); return; } }
    try { setRate(await buscarCotacao()); } catch (e) { console.error("Erro ao buscar cotação", e); setRate((r) => r || { value: 5.4, eur: 0.92, fonte: "cotação padrão (Binance indisponível)" }); }
  }, []);
  useEffect(() => {
    atualizarCotacao(false);
    const t = setInterval(() => atualizarCotacao(true), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [atualizarCotacao]);
  const taxa = { usd: rate?.value || 5.4, eur: rate?.eur || 0.92 };

  // ---------- dados ----------
  const recarregar = useCallback(async () => {
    try {
      const [casas, parcerias, contas, surebets] = await Promise.all(["casas", "parcerias", "contas", "surebets"].map(listar));
      setDados({ casas, parcerias, contas, surebets });
      setErro("");
    } catch (e) {
      console.error(e);
      setErro("Não consegui ler as tabelas da aba Surebet. Você já rodou o migration_surebet.sql no Supabase? (" + (e.message || e) + ")");
    }
    setCarregando(false);
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  const editar = (sb) => { setEditando(sb); setPagina("nova"); window.scrollTo(0, 0); };
  const props = { ...dados, taxa, vis, recarregar };

  return (
    <div>
      {/* sub-abas + cotação + moeda de visualização */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 4, background: "#151833", border: "1px solid #2a2f52", borderRadius: 10, padding: 4 }}>
          {SUBABAS.map(({ id, label, Icon }) => {
            const ativo = pagina === id;
            return (
              <button key={id} onClick={() => setPagina(id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 7, fontSize: 12.5, fontWeight: 700, border: "none", background: ativo ? "linear-gradient(135deg,#f08a24,#c96512)" : "transparent", color: ativo ? "#fff" : "#8b90b3" }}>
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>
        <div className="mono" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 11.5, color: "#8b90b3" }}>
          <span>US$ 1 = R$ {taxa.usd.toFixed(3)} · € {taxa.eur.toFixed(3)}</span>
          <span style={{ color: rate?.fonte === "Binance" ? "#00e676" : "#f59e0b" }}>{rate ? rate.fonte : "buscando…"}</span>
          <button onClick={() => atualizarCotacao(true)} title="Atualizar cotação" style={{ background: "none", border: "none", color: "#8b90b3", padding: 0, display: "flex" }}><RefreshCw size={13} /></button>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            ver em:
            <Seletor small opcoes={[["USD", "US$"], ["BRL", "R$"], ["EUR", "€"]]} value={vis} onChange={setVis} />
          </span>
        </div>
      </div>

      {erro && <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,90,106,.12)", border: "1px solid rgba(255,90,106,.4)", color: "#ff8a95", fontSize: 12.5, marginBottom: 16 }}>{erro}</div>}

      {carregando ? (
        <div className="mono" style={{ color: "#8b90b3", textAlign: "center", padding: 40 }}>carregando…</div>
      ) : pagina === "nova" ? (
        <NovaSurebet {...props} editando={editando} onSalvo={() => { setEditando(null); setPagina("registro"); }} onCancelarEdicao={() => setEditando(null)} irCadastros={() => setPagina("cadastros")} />
      ) : pagina === "registro" ? (
        <Registro {...props} onEditar={editar} />
      ) : (
        <Cadastros {...props} />
      )}
    </div>
  );
}
