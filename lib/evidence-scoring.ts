export type EvidenceStatus = "confirmed" | "unconfirmed" | "failed";

export type CandidateEvidence = {
  criterion: "role" | "seniority" | "required" | "domain" | "leadership" | "geography";
  label: string;
  status: EvidenceStatus;
  score: number;
  maxScore: number;
  /** Falso quando o critério não pôde ser observado e por isso saiu da conta. */
  observable: boolean;
  evidence: string;
};

export type EvidenceAssessmentInput = {
  jobTitle: string;
  /**
   * Títulos equivalentes produzidos pelo motor multilíngue. A vaga pode ser
   * "Gerente de Produção" e o mercado usar "Production Manager".
   */
  roleAlternatives?: string[];
  /**
   * Núcleo funcional da vaga já traduzido para os três idiomas pelo léxico do
   * motor Python. Esta camada NÃO mantém a própria lista de equivalências: era
   * exatamente a duplicação de vocabulário entre os dois motores que fazia um
   * aprovar quem o outro reprovava.
   */
  roleCore?: string[];
  /** Conceitos de domínio da vaga, cada um com os seus sinônimos. */
  domainConcepts?: string[][];
  candidateTitle: string;
  candidateText: string;
  requiredConcepts: Array<{ label: string; aliases: string[] }>;
  geographicMatch: "city" | "subdivision" | "country" | "targeted" | "unknown";
  geographicLabel?: string;
};

export type EvidenceAssessment = {
  eligible: boolean;
  score: number;
  /** Quantos critérios independentes foram efetivamente confirmados. */
  confirmedSignals: number;
  classification: "high" | "validate" | "expansion" | "rejected";
  rejectionReasons: string[];
  evidence: CandidateEvidence[];
};

const SENIORITY: Array<{ rank: number; terms: string[] }> = [
  { rank: 8, terms: ["chief", "ceo", "cfo", "coo", "chro", "c-level", "presidente"] },
  { rank: 7, terms: ["vice president", "vp", "diretor", "diretora", "director"] },
  { rank: 6, terms: ["gerente executivo", "executive manager", "head", "gerente senior", "senior manager", "gerente", "manager"] },
  { rank: 5, terms: ["coordenador", "coordenadora", "coordinator", "lead"] },
  { rank: 4, terms: ["supervisor", "supervisora"] },
  { rank: 3, terms: ["especialista", "specialist", "consultor", "consultant"] },
  { rank: 2, terms: ["analista", "analyst"] },
  { rank: 1, terms: ["assistente", "assistant", "auxiliar", "estagiario", "intern"] },
];

const LEADERSHIP_SIGNALS = [
  "lideranca", "liderando", "liderar", "leading", "leadership", "gestao de equipe",
  "team management", "responsavel pela area", "head of", "diretos", "direct reports",
  "gestao de pessoas", "people management", "lidero", "liderei", "coordenei",
];

/**
 * Equivalências de reserva. Usadas SOMENTE quando o motor Python não enviou o
 * núcleo funcional — por exemplo numa pesquisa salva antes desta versão. Em
 * operação normal quem manda é o léxico, que cobre qualquer cargo.
 */
const FALLBACK_ROLE_EQUIVALENTS: Record<string, string[]> = {
  remuneracao: ["remuneracao", "compensation", "rewards", "compensacion"],
  beneficios: ["beneficios", "benefits"],
  recrutamento: ["recrutamento", "recruiting", "recruitment", "reclutamiento", "talent acquisition"],
  selecao: ["selecao", "selection", "seleccion", "staffing"],
  producao: ["producao", "production", "manufacturing", "produccion"],
  manutencao: ["manutencao", "maintenance", "mantenimiento", "reliability"],
  qualidade: ["qualidade", "quality", "calidad"],
  logistica: ["logistica", "logistics", "supply chain"],
  suprimentos: ["suprimentos", "procurement", "purchasing", "compras", "sourcing"],
  financeiro: ["financeiro", "finance", "financiero", "financial"],
  comercial: ["comercial", "sales", "commercial", "ventas"],
  dados: ["dados", "data", "datos", "analytics"],
  processos: ["processos", "process", "procesos"],
  folha: ["folha", "payroll", "nomina"],
};

const STOP = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "com", "the", "of", "and",
  "senior", "junior", "pleno", "executivo", "executiva", "executive",
  "gerente", "manager", "head", "diretor", "director", "coordenador", "coordinator",
  "supervisor", "analista", "analyst", "especialista", "specialist",
]);

export function normalizeEvidenceText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function contains(text: string, term: string) {
  const haystack = normalizeEvidenceText(text);
  const needle = normalizeEvidenceText(term).trim();
  if (!needle) return false;
  // Limite de palavra dos dois lados: sem isso "ti" é encontrado dentro de
  // "gestão" e "cto" dentro de "director".
  return new RegExp(`(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`).test(haystack);
}

function seniorityRank(value: string) {
  const normalized = normalizeEvidenceText(value);
  return SENIORITY.find((level) => level.terms.some((term) => normalized.includes(term)))?.rank || 0;
}

function roleTokens(value: string) {
  return [...new Set(
    normalizeEvidenceText(value)
      .replace(/[^a-z0-9+# ]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP.has(token)),
  )];
}

function excerpt(text: string, term: string) {
  const normalized = normalizeEvidenceText(text);
  const index = normalized.indexOf(normalizeEvidenceText(term));
  if (index < 0) return "";
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + term.length + 75);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function signalEvidence(text: string, signals: string[]) {
  const signal = signals.find((item) => contains(text, item));
  return signal ? excerpt(text, signal) : "";
}

/**
 * Aderência funcional. O núcleo enviado pelo léxico decide primeiro: se o
 * profissional exerce a função em qualquer um dos três idiomas, a cobertura é
 * cheia. A comparação por palavras do título é o caminho de reserva.
 */
function assessRole(input: EvidenceAssessmentInput) {
  const core = (input.roleCore || []).filter(Boolean);
  const inTitle = core.find((term) => contains(input.candidateTitle, term));
  const inText = inTitle ? "" : core.find((term) => contains(input.candidateText, term));

  const roleOptions = [...new Set([input.jobTitle, ...(input.roleAlternatives || [])].filter(Boolean))];
  let bestTokenCoverage = 0;
  let bestRole = input.jobTitle;
  let matchedTokens: string[] = [];
  for (const role of roleOptions) {
    const tokens = roleTokens(role);
    if (!tokens.length) continue;
    const matched: string[] = [];
    let weighted = 0;
    for (const token of tokens) {
      const aliases = FALLBACK_ROLE_EQUIVALENTS[token] || [token];
      if (aliases.some((alias) => contains(input.candidateTitle, alias))) {
        matched.push(token);
        weighted += 1;
      } else if (aliases.some((alias) => contains(input.candidateText, alias))) {
        matched.push(token);
        weighted += 0.6;
      }
    }
    const coverage = weighted / tokens.length;
    if (coverage > bestTokenCoverage) {
      bestTokenCoverage = coverage;
      bestRole = role;
      matchedTokens = matched;
    }
  }

  const coverage = Math.max(inTitle ? 1 : inText ? 0.62 : 0, bestTokenCoverage);
  const evidence = inTitle
    ? `função no título: ${inTitle}`
    : inText
      ? `função no trecho público: ${inText}`
      : matchedTokens.length
        ? `termos do cargo: ${matchedTokens.join(", ")}${bestRole !== input.jobTitle ? ` · título equivalente: ${bestRole}` : ""}`
        : "sem evidência pública do cargo";
  return { coverage, evidence };
}

/** Conta CONCEITOS de domínio confirmados, não termos: "bovino" e "beef" são um. */
function assessDomain(input: EvidenceAssessmentInput) {
  const concepts = (input.domainConcepts || []).filter((group) => group?.length);
  if (!concepts.length) return { confirmed: 0, total: 0, evidence: "" };
  const hits = concepts
    .map((group) => group.find((term) => term.length > 3 && contains(input.candidateText, term)))
    .filter((term): term is string => Boolean(term));
  return {
    confirmed: hits.length,
    total: concepts.length,
    evidence: hits.length ? `domínio confirmado: ${[...new Set(hits)].slice(0, 5).join(", ")}` : "",
  };
}

export function assessCandidateEvidence(input: EvidenceAssessmentInput): EvidenceAssessment {
  const candidateText = [input.candidateTitle, input.candidateText].filter(Boolean).join(" · ");
  const role = assessRole(input);
  const domain = assessDomain({ ...input, candidateText });

  const jobRank = seniorityRank(input.jobTitle);
  const candidateRank = seniorityRank(input.candidateTitle);
  const seniorityDistance = jobRank && candidateRank ? Math.abs(jobRank - candidateRank) : null;

  const requiredMatches = input.requiredConcepts.map((concept) => {
    const alias = concept.aliases.find((item) => contains(candidateText, item));
    return { ...concept, alias, excerpt: alias ? excerpt(candidateText, alias) : "" };
  });
  const requiredConfirmed = requiredMatches.filter((item) => item.alias);

  const leadershipExcerpt = signalEvidence(candidateText, LEADERSHIP_SIGNALS);
  const leadershipRequired = jobRank >= 5;
  const explicitlyDivergent = normalizeEvidenceText(input.geographicLabel || "").includes("divergente");
  const geographyObservable = input.geographicMatch !== "targeted" && input.geographicMatch !== "unknown";

  // ------------------------------------------------------------------ //
  // NOTA NORMALIZADA PELO QUE É OBSERVÁVEL
  //
  // A versão anterior dividia todo candidato por um total fixo de 100 pontos,
  // dos quais 20 dependiam de sinais que quase nunca aparecem num trecho de
  // 160 caracteres: escopo global e cidade confirmada. O efeito medido é que
  // um Supervisor de Abate perfeito chegava no máximo a 62 e nunca saía de
  // "expansão" — a régua tinha sido calibrada para um cargo executivo global e
  // aplicada a toda a operação.
  //
  // Cada critério agora declara se pôde ser observado NAQUELE perfil. O que não
  // pôde sai do numerador E do denominador: ausência de evidência deixa de ser
  // tratada como evidência de ausência. Em troca, a confiança cai — e é a
  // confiança que impede o perfil magro de subir ao topo.
  // ------------------------------------------------------------------ //
  const criteria: CandidateEvidence[] = [
    {
      criterion: "role",
      label: "Aderência funcional",
      status: role.coverage >= 0.75 ? "confirmed" : role.coverage >= 0.34 ? "unconfirmed" : "failed",
      score: Math.round(30 * role.coverage),
      maxScore: 30,
      observable: true,
      evidence: role.evidence,
    },
    {
      criterion: "seniority",
      label: "Senioridade atual",
      status: seniorityDistance === 0 ? "confirmed" : seniorityDistance === 1 ? "unconfirmed" : candidateRank ? "failed" : "unconfirmed",
      score: seniorityDistance === 0 ? 20 : seniorityDistance === 1 ? 12 : 0,
      maxScore: 20,
      // Sem nível visível no trecho, o critério não é observável. Antes, isso
      // era pontuado como zero e derrubava a nota de quem só tinha um título
      // curto no índice do Google.
      observable: Boolean(jobRank && candidateRank),
      evidence: candidateRank ? input.candidateTitle : "senioridade não visível no trecho público",
    },
    {
      criterion: "required",
      label: "Critérios obrigatórios",
      status: !input.requiredConcepts.length || requiredConfirmed.length === input.requiredConcepts.length
        ? "confirmed"
        : requiredConfirmed.length ? "unconfirmed" : "failed",
      score: input.requiredConcepts.length
        ? Math.round(25 * requiredConfirmed.length / input.requiredConcepts.length)
        : 0,
      maxScore: 25,
      observable: input.requiredConcepts.length > 0,
      evidence: input.requiredConcepts.length
        ? requiredMatches.map((item) => item.alias
          ? `${item.label}: ${item.excerpt || item.alias}`
          : `${item.label}: não confirmado no trecho público`).join(" | ")
        : "nenhum critério obrigatório informado",
    },
    {
      criterion: "domain",
      label: "Domínio da vaga",
      status: domain.confirmed >= 2 ? "confirmed" : domain.confirmed ? "unconfirmed" : "failed",
      // Dois conceitos já valem a nota cheia: exigir que um trecho de 160
      // caracteres repita o vocabulário inteiro da vaga é exigir o impossível.
      score: Math.round(20 * Math.min(1, domain.confirmed / 2)),
      maxScore: 20,
      observable: domain.total > 0,
      evidence: domain.evidence || "domínio da vaga não confirmado no trecho público",
    },
    {
      criterion: "leadership",
      label: "Liderança da função",
      status: leadershipExcerpt ? "confirmed" : "unconfirmed",
      score: leadershipExcerpt ? 10 : 0,
      maxScore: 10,
      // Só entra na conta quando a vaga é de liderança. Numa vaga de analista,
      // cobrar evidência de liderança penalizava o candidato certo.
      observable: leadershipRequired,
      evidence: leadershipExcerpt || "liderança não confirmada no trecho público",
    },
    {
      criterion: "geography",
      label: "Localização atual",
      status: explicitlyDivergent
        ? "failed"
        : input.geographicMatch === "city" || input.geographicMatch === "subdivision"
          ? "confirmed"
          : "unconfirmed",
      score: input.geographicMatch === "city" ? 15 : input.geographicMatch === "subdivision" ? 12 : input.geographicMatch === "country" ? 8 : 0,
      maxScore: 15,
      // Cerca de quatro em cada cinco trechos do LinkedIn não trazem
      // localização estruturada. Punir isso é punir o índice do Google, não o
      // candidato — a consulta já foi direcionada à região pedida.
      observable: geographyObservable,
      evidence: input.geographicLabel || "localização não confirmada",
    },
  ];

  const observable = criteria.filter((item) => item.observable);
  const obtained = observable.reduce((total, item) => total + item.score, 0);
  const available = observable.reduce((total, item) => total + item.maxScore, 0);
  const normalized = available ? (obtained / available) * 100 : 0;

  // TRAVA DE PRECISÃO. Normalizar sozinho tem um efeito perverso: quanto menos
  // se vê de um perfil, menos critérios entram no denominador e mais fácil fica
  // acertar todos. Sem esta trava, o topo da lista passaria a ser ocupado por
  // quem tem menos informação pública. O fator de confiança corrige isso: quem
  // confirma um único critério não alcança o topo, ainda que o acerte.
  const confirmedSignals = criteria.filter((item) => item.status === "confirmed" && item.observable).length;
  const confidenceFactor = 0.70 + 0.075 * Math.min(4, confirmedSignals);
  const score = Math.round(Math.max(0, Math.min(100, normalized * confidenceFactor)));

  const rejectionReasons: string[] = [];
  // Elegibilidade pela MESMA regra do motor Python: exerce a função, ou
  // demonstra o domínio. Nenhum dos dois, e o perfil não entra.
  if (role.coverage < 0.34 && domain.confirmed < 2) {
    rejectionReasons.push("sem evidência pública da função nem do domínio da vaga");
  }
  if (jobRank >= 6 && candidateRank > 0 && candidateRank < 5) {
    rejectionReasons.push("senioridade atual muito abaixo da vaga");
  }
  if (jobRank >= 7 && candidateRank > 0 && candidateRank < 6) {
    rejectionReasons.push("senioridade atual incompatível com posição executiva");
  }
  if (explicitlyDivergent) rejectionReasons.push("localização atual explicitamente fora do escopo");

  const eligible = rejectionReasons.length === 0;
  const finalScore = eligible ? score : Math.min(score, 45);
  const classification = !eligible
    ? "rejected"
    : finalScore >= 78
      ? "high"
      : finalScore >= 60
        ? "validate"
        : "expansion";

  return {
    eligible,
    score: finalScore,
    confirmedSignals,
    classification,
    rejectionReasons,
    evidence: criteria,
  };
}
