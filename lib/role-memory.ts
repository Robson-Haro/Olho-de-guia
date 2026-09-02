import { createClient } from "@supabase/supabase-js";

/**
 * Memória de vagas — como o Eureka aprende o perfil de contratação da casa.
 *
 * O que aprende NÃO é um modelo treinado. É memória organizacional com
 * contadores, e isso é uma escolha, não uma limitação:
 *
 * - **É auditável.** Dá para abrir e ler exatamente o que o sistema aprendeu:
 *   quais títulos de mercado renderam aprovação, quais renderam descarte,
 *   quais empresas aparecem entre os aprovados. Um modelo ajustado seria uma
 *   caixa-preta que ninguém do time conseguiria explicar ao requisitante — ou
 *   a uma auditoria.
 * - **É reversível.** Uma decisão errada de um recrutador é uma linha que se
 *   apaga, não um viés que ficou dentro dos pesos.
 * - **É imediato.** Aprende a partir da primeira decisão, sem precisar de
 *   milhares de exemplos.
 *
 * O que a memória influencia: quais consultas o Google recebe e como os perfis
 * são ordenados. O que ela NUNCA faz: aprovar sozinha um perfil que as regras
 * de aderência reprovaram. O aprendizado amplia e reordena; ele não abre a
 * porta lateral que a Onda 1 fechou.
 */

export type RoleDecision = "aprovado" | "descartado" | "contratado";

export type RoleMemory = {
  roleKey: string;
  /** Títulos de mercado que já produziram candidatos aprovados. */
  confirmedTitles: Array<{ title: string; approvals: number }>;
  /** Títulos que já produziram descartes e nenhuma aprovação. */
  demotedTitles: string[];
  /** Termos que aparecem nos perfis aprovados com frequência. */
  confirmedTerms: Array<{ term: string; approvals: number }>;
  /** Empregadores recorrentes entre os aprovados. */
  companies: Array<{ company: string; approvals: number }>;
  approvedCount: number;
  discardedCount: number;
  hiredCount: number;
  searchCount: number;
  updatedAt: string | null;
};

export const EMPTY_MEMORY: RoleMemory = {
  roleKey: "",
  confirmedTitles: [],
  demotedTitles: [],
  confirmedTerms: [],
  companies: [],
  approvedCount: 0,
  discardedCount: 0,
  hiredCount: 0,
  searchCount: 0,
  updatedAt: null,
};

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LEVEL_WORDS = new Set([
  "estagiario", "estagiaria", "intern", "trainee", "pasante", "auxiliar",
  "assistente", "assistant", "analista", "analyst", "especialista", "specialist",
  "consultor", "consultant", "supervisor", "supervisora", "coordenador",
  "coordenadora", "coordinator", "lead", "gerente", "gestor", "gestora",
  "manager", "head", "jefe", "diretor", "diretora", "director", "vp",
  "presidente", "chief", "senior", "junior", "pleno", "sr", "jr",
]);

const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "com", "the", "of", "and",
  "a", "o", "as", "os", "no", "na", "y", "del", "la", "el",
]);

/**
 * Chave estável da vaga.
 *
 * Deriva do NÚCLEO funcional, sem hierarquia. Assim "Supervisor de Abate",
 * "Coordenador de Abate" e "Abate Supervisor" compartilham a mesma memória —
 * que é o comportamento desejado: o que a casa aprendeu sobre onde encontrar
 * gente de abate não muda porque o nível da vaga mudou.
 *
 * Quando o léxico já traduziu o núcleo, ele é a base preferida: garante que a
 * mesma vaga escrita em inglês caia na mesma memória.
 */
export function roleKeyFor(title: string, roleCore: string[] = []) {
  const fromCore = roleCore
    .map(normalize)
    .filter((term) => term.length > 3 && !LEVEL_WORDS.has(term))
    .sort();
  if (fromCore.length) return fromCore.slice(0, 3).join("-").slice(0, 80);
  const fromTitle = normalize(title)
    .split(" ")
    .filter((word) => word.length > 2 && !LEVEL_WORDS.has(word) && !STOP_WORDS.has(word))
    .sort();
  return fromTitle.slice(0, 3).join("-").slice(0, 80) || "vaga-sem-nucleo";
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isMemoryConfigured() {
  return supabaseAdmin() !== null;
}

type MemoryRow = {
  role_key: string;
  confirmed_titles: Array<{ title: string; approvals: number }> | null;
  demoted_titles: string[] | null;
  confirmed_terms: Array<{ term: string; approvals: number }> | null;
  companies: Array<{ company: string; approvals: number }> | null;
  approved_count: number | null;
  discarded_count: number | null;
  hired_count: number | null;
  search_count: number | null;
  updated_at: string | null;
};

function fromRow(row: MemoryRow): RoleMemory {
  return {
    roleKey: row.role_key,
    confirmedTitles: row.confirmed_titles || [],
    demotedTitles: row.demoted_titles || [],
    confirmedTerms: row.confirmed_terms || [],
    companies: row.companies || [],
    approvedCount: row.approved_count || 0,
    discardedCount: row.discarded_count || 0,
    hiredCount: row.hired_count || 0,
    searchCount: row.search_count || 0,
    updatedAt: row.updated_at,
  };
}

/** Lê o que a casa já aprendeu sobre esta família de vaga. Nunca lança. */
export async function readRoleMemory(roleKey: string): Promise<RoleMemory> {
  const client = supabaseAdmin();
  if (!client || !roleKey) return { ...EMPTY_MEMORY, roleKey };
  try {
    const { data, error } = await client
      .from("role_memory")
      .select("*")
      .eq("role_key", roleKey)
      .maybeSingle();
    if (error || !data) return { ...EMPTY_MEMORY, roleKey };
    return fromRow(data as MemoryRow);
  } catch {
    // Memória indisponível reduz a inteligência da busca; nunca a interrompe.
    return { ...EMPTY_MEMORY, roleKey };
  }
}

export async function registerSearch(roleKey: string, title: string) {
  const client = supabaseAdmin();
  if (!client || !roleKey) return;
  try {
    const current = await readRoleMemory(roleKey);
    await client.from("role_memory").upsert({
      role_key: roleKey,
      role_label: title.slice(0, 160),
      confirmed_titles: current.confirmedTitles,
      demoted_titles: current.demotedTitles,
      confirmed_terms: current.confirmedTerms,
      companies: current.companies,
      approved_count: current.approvedCount,
      discarded_count: current.discardedCount,
      hired_count: current.hiredCount,
      search_count: current.searchCount + 1,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // silencioso por desenho
  }
}

export type FeedbackInput = {
  roleKey: string;
  roleLabel: string;
  profileUrl: string;
  candidateTitle: string;
  company?: string;
  summary?: string;
  decision: RoleDecision;
  reason?: string;
  decidedBy?: string;
};

const TERM_STOP = new Set([
  ...STOP_WORDS,
  "linkedin", "perfil", "profissional", "experiencia", "empresa", "atuacao",
  "gestao", "equipe", "processos", "resultados", "lideranca", "projetos",
]);

function meaningfulTerms(text: string) {
  return [...new Set(
    normalize(text)
      .split(" ")
      .filter((word) => word.length > 3 && !TERM_STOP.has(word) && !LEVEL_WORDS.has(word) && !/^\d+$/.test(word)),
  )].slice(0, 12);
}

function bump<T extends Record<string, unknown>>(
  list: T[],
  keyField: keyof T,
  key: string,
  countField: keyof T,
  delta: number,
  limit: number,
) {
  const existing = list.find((item) => normalize(String(item[keyField])) === normalize(key));
  if (existing) {
    (existing[countField] as unknown as number) = Math.max(0, (Number(existing[countField]) || 0) + delta);
  } else if (delta > 0) {
    list.push({ [keyField]: key, [countField]: delta } as unknown as T);
  }
  return list
    .filter((item) => (Number(item[countField]) || 0) > 0)
    .sort((left, right) => (Number(right[countField]) || 0) - (Number(left[countField]) || 0))
    .slice(0, limit);
}

/**
 * Registra a decisão do recrutador e reagrega a memória da família de vaga.
 *
 * A agregação é o "aprendizado": o título do perfil aprovado passa a valer como
 * título de mercado confirmado e entra nas próximas consultas; os termos que
 * aparecem nos perfis aprovados passam a contar como domínio confirmado; e um
 * título que só produziu descartes entra na lista de rebaixamento — que
 * **rebaixa, nunca elimina**, porque uma decisão pontual de um recrutador não
 * pode fechar uma porta para sempre.
 */
export async function recordFeedback(input: FeedbackInput): Promise<RoleMemory | null> {
  const client = supabaseAdmin();
  if (!client || !input.roleKey || !input.profileUrl) return null;
  const decidedAt = new Date().toISOString();
  try {
    await client.from("candidate_feedback").upsert({
      role_key: input.roleKey,
      profile_url: input.profileUrl,
      candidate_title: input.candidateTitle.slice(0, 200),
      company: (input.company || "").slice(0, 160),
      summary: (input.summary || "").slice(0, 600),
      decision: input.decision,
      reason: (input.reason || "").slice(0, 400),
      decided_by: (input.decidedBy || "").slice(0, 160),
      decided_at: decidedAt,
    }, { onConflict: "role_key,profile_url" });

    const current = await readRoleMemory(input.roleKey);
    const positive = input.decision === "aprovado" || input.decision === "contratado";
    // Uma contratação vale mais do que uma aprovação de triagem: é o único
    // sinal que passou por entrevista, requisitante e proposta.
    const weight = input.decision === "contratado" ? 3 : 1;
    const title = input.candidateTitle.trim();

    let confirmedTitles = current.confirmedTitles;
    let confirmedTerms = current.confirmedTerms;
    let companies = current.companies;
    if (title && !/^perfil profissional/i.test(title)) {
      confirmedTitles = bump(confirmedTitles, "title", title, "approvals", positive ? weight : -1, 24);
    }
    for (const term of meaningfulTerms([title, input.summary].filter(Boolean).join(" "))) {
      confirmedTerms = bump(confirmedTerms, "term", term, "approvals", positive ? weight : -1, 40);
    }
    if (positive && input.company) {
      companies = bump(companies, "company", input.company.trim(), "approvals", weight, 24);
    }

    // Rebaixamento exige evidência repetida: dois descartes e nenhuma
    // aprovação. Um "não" isolado é ruído, não aprendizado.
    const negativeTitles = new Set(current.demotedTitles);
    if (!positive && title) {
      const stillConfirmed = confirmedTitles.some((item) => normalize(item.title) === normalize(title));
      const { count } = await client
        .from("candidate_feedback")
        .select("profile_url", { count: "exact", head: true })
        .eq("role_key", input.roleKey)
        .eq("decision", "descartado")
        .ilike("candidate_title", title);
      if (!stillConfirmed && (count || 0) >= 2) negativeTitles.add(title);
    }
    if (positive && title) negativeTitles.delete(title);

    const updated = {
      role_key: input.roleKey,
      role_label: input.roleLabel.slice(0, 160),
      confirmed_titles: confirmedTitles,
      demoted_titles: [...negativeTitles].slice(0, 24),
      confirmed_terms: confirmedTerms,
      companies,
      approved_count: current.approvedCount + (input.decision === "aprovado" ? 1 : 0),
      discarded_count: current.discardedCount + (input.decision === "descartado" ? 1 : 0),
      hired_count: current.hiredCount + (input.decision === "contratado" ? 1 : 0),
      search_count: current.searchCount,
      updated_at: decidedAt,
    };
    await client.from("role_memory").upsert(updated);
    return fromRow(updated as unknown as MemoryRow);
  } catch {
    return null;
  }
}

/**
 * Traduz a memória em sinais utilizáveis pela busca.
 *
 * Só entra o que passou de um limiar de confirmação: um único aprovado não faz
 * um título virar padrão da casa. O objetivo é que a memória some sinal, não
 * que ela repita o acaso da primeira busca.
 */
export function memorySignals(memory: RoleMemory, minimumApprovals = 2) {
  return {
    learnedTitles: memory.confirmedTitles
      .filter((item) => item.approvals >= minimumApprovals)
      .map((item) => item.title)
      .slice(0, 8),
    learnedTerms: memory.confirmedTerms
      .filter((item) => item.approvals >= minimumApprovals)
      .map((item) => item.term)
      .slice(0, 16),
    learnedCompanies: memory.companies
      .filter((item) => item.approvals >= minimumApprovals)
      .map((item) => item.company)
      .slice(0, 10),
    demotedTitles: memory.demotedTitles.slice(0, 16),
    /** Verdadeiro quando já há histórico suficiente para influenciar a busca. */
    active: memory.approvedCount + memory.hiredCount >= minimumApprovals,
  };
}
