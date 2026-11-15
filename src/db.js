import { supabase, DEMO } from "./config";

const TABELA = { casas: "sb_casas", parcerias: "sb_parcerias", contas: "sb_contas", surebets: "sb_surebets" };

// ---------- modo demo (localStorage) ----------
const chave = (t) => `surebet_demo_${t}`;
const lsLer = (t) => { try { return JSON.parse(localStorage.getItem(chave(t)) || "[]"); } catch { return []; } };
const lsGravar = (t, linhas) => { try { localStorage.setItem(chave(t), JSON.stringify(linhas)); } catch {} };
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export async function listar(t) {
  if (DEMO) return lsLer(t);
  // Supabase devolve no máximo 1000 linhas por vez: busca em páginas
  const todas = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(TABELA[t]).select("*").order("created_at", { ascending: true }).range(de, de + 999);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todas;
}

export async function inserir(t, linha) {
  if (DEMO) {
    const nova = { id: novoId(), created_at: new Date().toISOString(), ...linha };
    lsGravar(t, [...lsLer(t), nova]);
    return nova;
  }
  const { data, error } = await supabase.from(TABELA[t]).insert(linha).select().single();
  if (error) throw error;
  return data;
}

export async function atualizar(t, id, patch) {
  if (DEMO) {
    lsGravar(t, lsLer(t).map((l) => (l.id === id ? { ...l, ...patch } : l)));
    return;
  }
  const { error } = await supabase.from(TABELA[t]).update(patch).eq("id", id);
  if (error) throw error;
}

export async function excluir(t, id) {
  if (DEMO) {
    lsGravar(t, lsLer(t).filter((l) => l.id !== id));
    // imita o "on delete cascade" do banco
    if (t === "casas") lsGravar("contas", lsLer("contas").filter((c) => c.casa_id !== id));
    if (t === "parcerias") lsGravar("contas", lsLer("contas").filter((c) => c.parceria_id !== id));
    return;
  }
  const { error } = await supabase.from(TABELA[t]).delete().eq("id", id);
  if (error) throw error;
}
