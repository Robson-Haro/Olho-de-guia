import { getSecret, saveSecret } from "@/lib/secure-settings";
import { getCountryProfile, normalizeGeographyText } from "@/lib/geography";
import { getMarketSegment } from "@/lib/market-segments";

export type TalentProvider = "serper";

export type TalentSearchInput = {
  title: string;
  marketSegment?: string;
  mappedCompanies?: string[];
  titleVariants?: string[];
  countryCode: string;
  country: string;
  subdivision: string;
  cities: string[];
  description: string;
  keywords: string[];
  semanticKeywords?: string[];
  requiredKeywordConcepts?: RequiredKeywordConcept[];
  countrywide: boolean;
  maxCandidates: number;
  /** Quando verdadeiro, elimina quem não evidencia TODOS os conceitos obrigatórios. */
  strictRequiredKeywords?: boolean;
};

export type CandidateTier = "A" | "B" | "C";

export type TalentCandidate = {
  id: string;
  name: string;
  title: string;
  city: string;
  state: string;
  country: string;
  profileUrl: string;
  company?: string;
  source: "Google via Serper";
  summary?: string;
  compatibility: number;
  matchReason: string;
  matchedRequiredKeywords?: string[];
  missingRequiredKeywords?: string[];
  geographicMatch?: "city" | "subdivision" | "country" | "targeted" | "unknown";
  geographicLabel?: string;
  searchedLocations?: string[];
  /** A = todos os obrigatórios evidenciados · B = evidência parcial · C = sem evidência pública. */
  tier?: CandidateTier;
  tierLabel?: string;
  seniorityLabel?: string;
  scoreBreakdown?: {
    cargo: number;
    senioridade: number;
    competencias: number;
    localidade: number;
    ruido: number;
    evidencia?: number;
    segmento?: number;
  };
};

export type ProviderSearchStatus = {
  provider: TalentProvider;
  label: string;
  status: "success" | "error";
  count: number;
  queries: number;
  message: string;
  poolSize?: number;
  elapsedMs?: number;
  tiers?: { A: number; B: number; C: number };
  mappedCompanies?: string[];
};

const PROVIDER = {
  key: "talent_source_serper_api_key",
  label: "Serper · Busca LinkedIn",
} as const;

/**
 * Orçamento de consultas. Cada consulta com até 10 resultados custa 1 crédito
 * no Serper; pedir 11 a 100 resultados custa 2 créditos. Por isso paginamos de
 * 10 em 10: é o modo mais barato por perfil encontrado.
 */
const SEARCH_BUDGET = Math.max(4, Math.min(16, Number(process.env.EUREKA_SERPER_BUDGET) || 8));
const RESULTS_PER_QUERY = 10;
const PARALLEL_BATCH = 3;
const SERPER_TIMEOUT_MS = Math.max(6000, Number(process.env.EUREKA_SERPER_TIMEOUT_MS) || 12000);
const CACHE_TTL_MS = 10 * 60 * 1000;

const BRAZIL_STATES: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

const STATE_NAMES = [
  "Acre",
  "Alagoas",
  "Amapá",
  "Amazonas",
  "Bahia",
  "Ceará",
  "Distrito Federal",
  "Espírito Santo",
  "Goiás",
  "Maranhão",
  "Mato Grosso do Sul",
  "Mato Grosso",
  "Minas Gerais",
  "Pará",
  "Paraíba",
  "Paraná",
  "Pernambuco",
  "Piauí",
  "Rio de Janeiro",
  "Rio Grande do Norte",
  "Rio Grande do Sul",
  "Rondônia",
  "Roraima",
  "Santa Catarina",
  "São Paulo",
  "Sergipe",
  "Tocantins",
] as const;

const STATE_ABBREVIATIONS = Object.values(BRAZIL_STATES).join("|");
const STATE_NAME_PATTERN = STATE_NAMES.map(escapeRegExp).join("|");

const STOP_WORDS = new Set([
  "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos",
  "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por",
  "que", "se", "um", "uma", "the", "and", "at", "for", "in", "of", "to",
  "profissional", "profissionais", "responsavel", "responsabilidades", "vaga",
]);

/**
 * Palavras de alta frequência em descrições corporativas. Sem esta lista, o
 * ranking passa a premiar quem tem "gestão", "equipe" e "processos" no perfil —
 * ou seja, praticamente qualquer pessoa.
 */
const GENERIC_CORPORATE_TERMS = new Set([
  "gestao", "gestor", "equipe", "equipes", "processo", "processos", "area", "areas",
  "empresa", "empresas", "atividades", "atuacao", "atuar", "conhecimento", "experiencia",
  "desenvolvimento", "resultados", "resultado", "melhoria", "continua",
  "projetos", "projeto", "acoes", "clientes", "cliente", "negocio", "negocios",
  "superior", "completo", "graduacao", "ensino", "pacote", "office",
  "trabalho", "diaria", "diarias", "rotinas", "rotina", "apoio", "suporte",
  "garantir", "realizar", "acompanhar", "elaborar", "controle", "analise",
  "informacoes", "relatorios", "relatorio", "reuniao", "reunioes",
  "oportunidade", "beneficios", "salario", "contratacao", "regime",
  "disponibilidade", "requisito", "desejavel", "diferencial", "necessario",
]);

/**
 * Sinais fortes de que o trecho retornado é um anúncio, não uma descrição
 * profissional. Disponibilidade, formação e trabalho autônomo não reduzem a
 * aderência: isso criaria falsos negativos e prejudicaria buscas de estágio.
 */
const NOISE_SIGNALS: Array<{ pattern: RegExp; penalty: number; label: string }> = [
  { pattern: /\b(estamos contratando|we are hiring|estamos buscando|vem ser|venha ser)\b/i, penalty: 12, label: "possível anúncio de vaga" },
  { pattern: /\b(vagas? de emprego|job opening|oferta de empleo|banco de talentos)\b/i, penalty: 12, label: "possível anúncio de vaga" },
];

/** Níveis de senioridade reconhecidos em PT, EN e ES — espelham o motor Python. */
const SENIORITY_LEVELS: Array<{ key: string; label: string; terms: string[] }> = [
  { key: "intern", label: "Estágio", terms: ["estagiario", "estagiaria", "intern", "trainee", "pasante", "practicante"] },
  { key: "assistant", label: "Assistente/Auxiliar", terms: ["auxiliar", "assistente", "assistant", "asistente", "associate"] },
  { key: "analyst", label: "Analista", terms: ["analista", "analyst", "tecnico"] },
  { key: "specialist", label: "Especialista/Consultor", terms: ["especialista", "specialist", "consultor", "consultant", "expert"] },
  { key: "supervisor", label: "Supervisor", terms: ["supervisor", "supervisora", "encarregado", "encargado"] },
  { key: "coordinator", label: "Coordenador", terms: ["coordenador", "coordenadora", "coordinator", "coordinador", "lead"] },
  { key: "manager", label: "Gerente", terms: ["gerente", "gestor", "gestora", "manager", "head", "jefe", "jefa"] },
  { key: "director", label: "Diretor", terms: ["diretor", "diretora", "director", "directora", "vice president", "vp"] },
  { key: "executive", label: "Executivo C-Level", terms: ["presidente", "chief", "ceo", "cfo", "coo", "cto", "chro", "director ejecutivo"] },
];

const SENIORITY_ORDER = SENIORITY_LEVELS.map((level) => level.key);

export type RequiredKeywordConcept = {
  label: string;
  aliases: string[];
};

const REQUIRED_KEYWORD_EQUIVALENTS: Record<string, string[]> = {
  "Couro / Leather": [
    "couro", "couros", "leather", "leather industry", "cuero", "cueros", "piel",
  ],
  "Curtume / Tannery": [
    "curtume", "curtumes", "tannery", "tanneries", "tanning", "curtiembre",
    "curtiembres", "curtiduria", "curtiduría", "curtido de cuero",
  ],
  "Padronização de processos": [
    "padronização de processos", "padronizacao de processos", "process standardization",
    "process governance", "governança de processos", "governanca de processos",
    "estandarización de procesos", "estandarizacion de procesos",
  ],
};

const REQUIRED_KEYWORD_IMPLICATIONS: Record<string, string[]> = {
  "Curtume / Tannery": ["Couro / Leather"],
};

function plain(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function naturalSearchTerm(value: string) {
  return value
    .replace(/\b(?:site|inurl|intitle|filetype|cache|related|before|after):\S+/gi, " ")
    .replace(/["“”()[\]{}|]/g, " ")
    .replace(/\b(?:AND|OR)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Envolve o termo em aspas para que o Google trate como expressão exata. */
function exactPhrase(value: string) {
  const term = naturalSearchTerm(value);
  return term ? `"${term}"` : "";
}

function normalizeState(value: unknown) {
  const state = plain(value);
  if (/^[A-Za-z]{2}$/.test(state)) return state.toUpperCase();
  return BRAZIL_STATES[withoutAccents(state)] || "";
}

function normalizeLocation(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[,;|·\-\s]+|[,;|·\-\s]+$/g, "").trim();
}

export function locationFromText(value: string) {
  const text = plain(value);
  if (!text) return { city: "", state: "" };

  const abbreviated = text.match(
    new RegExp(`(?:^|[.;|·])\\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,48})\\s*[,/–—-]\\s*(${STATE_ABBREVIATIONS})\\b`, "i"),
  );
  if (abbreviated) {
    return {
      city: normalizeLocation(abbreviated[1]),
      state: abbreviated[2].toUpperCase(),
    };
  }

  const named = text.match(
    new RegExp(`(?:^|[.;|·])\\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,48})\\s*,\\s*(${STATE_NAME_PATTERN})(?:\\s*,\\s*Brasil)?\\b`, "i"),
  );
  if (named) {
    const city = normalizeLocation(named[1]);
    return { city, state: normalizeState(named[2]) };
  }

  const cityCountry = text.match(
    /(?:^|[.;|·])\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,48})\s*,\s*Brasil\b/i,
  );
  if (cityCountry) {
    const city = normalizeLocation(cityCountry[1]);
    return { city, state: normalizeState(city) };
  }

  return { city: "", state: "" };
}

function explicitCurrentLocation(value: string) {
  const match = plain(value).match(/\b(?:location|localiza(?:ç|c)[aã]o|ubicaci[oó]n)\s*:\s*([^·;|\n]{2,100})/i);
  return match ? normalizeLocation(match[1].replace(/\.{3,}.*$/, "")) : "";
}

function geographicEvidence(value: string, input: TalentSearchInput, searchedLocations: string[] = []) {
  const profile = getCountryProfile(input.countryCode);
  const explicitLocation = explicitCurrentLocation(value);
  // O início do resultado público representa o cabeçalho atual. Experiências
  // antigas aparecem depois e não podem confirmar residência.
  const evidenceText = explicitLocation || plain(value).slice(0, 320);
  const normalized = normalizeGeographyText(evidenceText);
  const matchedCity = input.cities.find((city) => includesNormalized(normalized, city)) || "";
  const matchedSubdivision = input.subdivision && includesNormalized(normalized, input.subdivision)
    ? input.subdivision
    : "";
  const matchedCountry = profile.aliases.some((alias) => includesNormalized(normalized, alias));
  const explicitLocationIsDivergent = Boolean(
    explicitLocation && !matchedCity && !matchedSubdivision && !matchedCountry,
  );

  if (explicitLocationIsDivergent) {
    return {
      city: "",
      state: "",
      country: "",
      geographicMatch: "unknown" as const,
      geographicLabel: `localização atual divergente: ${explicitLocation}`,
    };
  }

  const brazilLocation = input.countryCode === "BR" ? locationFromText(evidenceText) : { city: "", state: "" };
  const city = matchedCity || brazilLocation.city;
  const state = matchedSubdivision || brazilLocation.state;
  const country = city || state || matchedCountry ? profile.name : "";
  const geographicMatch: TalentCandidate["geographicMatch"] = matchedCity
    ? "city"
    : matchedSubdivision
      ? "subdivision"
      : matchedCountry
        ? "country"
        : searchedLocations.length
          ? "targeted"
          : "unknown";
  const geographicLabel = matchedCity
    ? `cidade atual confirmada: ${matchedCity}`
    : matchedSubdivision
      ? `${profile.subdivisionLabel.toLowerCase()} atual confirmado(a): ${matchedSubdivision}`
      : matchedCountry
        ? `país atual confirmado: ${profile.name}`
        : searchedLocations.length
          ? `consulta direcionada a ${searchedLocations.join(", ")}; localização não confirmada`
          : "localidade atual não confirmada no trecho público";
  return { city, state, country, geographicMatch, geographicLabel };
}

function linkedinProfileUrl(value: unknown) {
  const link = plain(value);
  if (!link) return "";
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase();
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "";
    if (!url.pathname.toLowerCase().startsWith("/in/")) return "";
    const slug = url.pathname.split("/").filter(Boolean)[1];
    if (!slug) return "";
    return `https://www.linkedin.com/in/${slug}`;
  } catch {
    return "";
  }
}

function meaningfulTokens(value: string) {
  return withoutAccents(value)
    .replace(/[^a-z0-9+#. ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

/**
 * Extrai termos distintivos da descrição. Diferente da versão anterior, descarta
 * o vocabulário corporativo genérico: o que sobra é o que realmente diferencia
 * um profissional aderente de um profissional qualquer.
 */
function descriptionTerms(description: string) {
  const counts = meaningfulTokens(description)
    .filter((token) => !GENERIC_CORPORATE_TERMS.has(token) && token.length > 3)
    .reduce<Record<string, number>>((result, token) => {
      result[token] = (result[token] || 0) + 1;
      return result;
    }, {});
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function includesNormalized(text: string, value: string) {
  return withoutAccents(text).includes(withoutAccents(value));
}

function excludedCandidateNames(description: string) {
  const section = plain(description).match(
    /\bexcluir\s+(?:os\s+)?candidatos?[^:\n]*:\s*([^\.\n]+)/i,
  )?.[1] || "";
  if (!section) return [] as string[];
  return unique(
    section
      .split(/\s*(?:,|;|\be\b|\band\b|\by\b)\s*/i)
      .map((name) => name.replace(/^[\s:–—-]+|[\s:–—-]+$/g, "").trim())
      .filter((name) => name.split(/\s+/).length >= 2 && name.length <= 100),
  );
}

function isExcludedCandidate(name: string, description: string) {
  const normalizedName = withoutAccents(name).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return excludedCandidateNames(description).some((excluded) => {
    const normalizedExcluded = withoutAccents(excluded).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return normalizedExcluded === normalizedName;
  });
}

function requiredKeywordConcepts(values: string[], supplied: RequiredKeywordConcept[] = []) {
  if (supplied.length) {
    return supplied.slice(0, 12).map((concept) => ({
      label: plain(concept.label).slice(0, 100),
      aliases: unique((Array.isArray(concept.aliases) ? concept.aliases : [])
        .map((alias) => plain(alias).slice(0, 100))
        .filter(Boolean))
        .slice(0, 16),
    })).filter((concept) => concept.label && concept.aliases.length);
  }
  const concepts: RequiredKeywordConcept[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const raw = plain(value).replace(/\s+/g, " ");
    if (!raw) continue;
    const matchingGroups = Object.entries(REQUIRED_KEYWORD_EQUIVALENTS)
      .filter(([, aliases]) => aliases.some((alias) => includesNormalized(raw, alias)));
    const resolved = matchingGroups.length
      ? matchingGroups.map(([label, aliases]) => ({ label, aliases }))
      : [{ label: raw, aliases: [raw] }];
    for (const concept of resolved) {
      const key = withoutAccents(concept.label);
      if (seen.has(key)) continue;
      seen.add(key);
      concepts.push({ label: concept.label, aliases: unique(concept.aliases) });
    }
  }
  return concepts;
}

function requiredKeywordEvidence(
  candidateText: string,
  keywords: string[],
  supplied: RequiredKeywordConcept[] = [],
) {
  const concepts = requiredKeywordConcepts(keywords, supplied);
  const directlyMatched = concepts
    .filter((concept) => concept.aliases.some((alias) => includesNormalized(candidateText, alias)))
    .map((concept) => concept.label);
  const matchedSet = new Set(directlyMatched);
  for (const label of directlyMatched) {
    for (const implied of REQUIRED_KEYWORD_IMPLICATIONS[label] || []) matchedSet.add(implied);
  }
  const matched = concepts.filter((concept) => matchedSet.has(concept.label)).map((concept) => concept.label);
  return {
    concepts,
    matched,
    missing: concepts.filter((concept) => !matchedSet.has(concept.label)).map((concept) => concept.label),
  };
}

function detectSeniority(value: string) {
  const normalized = withoutAccents(value);
  for (let index = SENIORITY_LEVELS.length - 1; index >= 0; index -= 1) {
    const level = SENIORITY_LEVELS[index];
    if (level.terms.some((term) => new RegExp(`\\b${escapeRegExp(withoutAccents(term))}`).test(normalized))) {
      return level;
    }
  }
  return null;
}

function seniorityAlignment(jobLevelKey: string | null, candidateLevelKey: string | null) {
  if (!jobLevelKey) return { score: 8, label: "senioridade da vaga não identificada" };
  if (!candidateLevelKey) return { score: 5, label: "senioridade não visível no trecho público" };
  const distance = Math.abs(SENIORITY_ORDER.indexOf(jobLevelKey) - SENIORITY_ORDER.indexOf(candidateLevelKey));
  if (distance === 0) return { score: 15, label: "senioridade equivalente" };
  if (distance === 1) return { score: 9, label: "senioridade adjacente" };
  if (distance === 2) return { score: 3, label: "senioridade distante" };
  return { score: 0, label: "senioridade incompatível" };
}

function noiseAssessment(candidateText: string) {
  const hits = NOISE_SIGNALS.filter((signal) => signal.pattern.test(candidateText));
  const penalty = Math.min(45, hits.reduce((total, signal) => total + signal.penalty, 0));
  return { penalty, labels: unique(hits.map((signal) => signal.label)) };
}

/**
 * Pontuação do cargo. A expressão exata do título vale muito mais do que a
 * soma de palavras soltas — era exatamente isso que permitia a um
 * "Gerente de Processos de RH" pontuar alto numa vaga de
 * "Gerente de Padronização de Processos" industrial.
 */
function roleScore(candidateTitleText: string, input: TalentSearchInput) {
  const titles = unique([input.title, ...(input.titleVariants || [])].map(naturalSearchTerm).filter(Boolean));
  const normalizedCandidate = withoutAccents(candidateTitleText);
  const exactHit = titles.find((title) => normalizedCandidate.includes(withoutAccents(title)));
  if (exactHit) return { score: 40, label: `cargo exato: ${exactHit}` };

  const coreTokens = unique(
    meaningfulTokens(input.title).filter((token) =>
      !SENIORITY_LEVELS.some((level) => level.terms.some((term) => withoutAccents(term) === token)),
    ),
  );
  if (!coreTokens.length) return { score: 12, label: "cargo genérico" };
  const matched = coreTokens.filter((token) => normalizedCandidate.includes(token));
  const coverage = matched.length / coreTokens.length;
  // Cobertura parcial é deliberadamente punida: 2 de 3 palavras não é
  // "quase o cargo certo", costuma ser outro cargo.
  const score = Math.round(coverage * coverage * 32);
  const label = coverage >= 0.99
    ? "todos os termos do cargo"
    : `${matched.length}/${coreTokens.length} termo(s) do cargo`;
  return { score, label };
}

function calculateCompatibility(
  candidate: Pick<TalentCandidate, "title" | "company" | "city" | "state" | "country" | "summary" | "geographicMatch" | "geographicLabel">,
  input: TalentSearchInput,
) {
  const titleText = [candidate.title, candidate.company].filter(Boolean).join(" ");
  const candidateText = [candidate.title, candidate.company, candidate.city, candidate.state, candidate.country, candidate.summary]
    .filter(Boolean)
    .join(" ");

  const role = roleScore(titleText || candidateText, input);
  const jobLevel = detectSeniority(input.title);
  const candidateLevel = detectSeniority(titleText);
  const seniority = seniorityAlignment(jobLevel?.key || null, candidateLevel?.key || null);

  const requiredEvidence = requiredKeywordEvidence(candidateText, input.keywords, input.requiredKeywordConcepts);
  const keywordPhrases = requiredEvidence.concepts.length
    ? requiredEvidence.concepts.map((concept) => concept.label)
    : descriptionTerms(input.description);
  const matchedKeywords = requiredEvidence.concepts.length
    ? requiredEvidence.matched
    : keywordPhrases.filter((keyword) => includesNormalized(candidateText, keyword));
  const keywordScore = keywordPhrases.length
    ? Math.round((matchedKeywords.length / keywordPhrases.length) * 30)
    : 0;

  const locationScore = candidate.geographicMatch === "city"
    ? 15
    : candidate.geographicMatch === "subdivision"
      ? 11
      : candidate.geographicMatch === "country"
        ? 7
        : candidate.geographicMatch === "targeted"
          ? 3
          : 0;

  const noise = noiseAssessment(candidateText);
  const mappedCompanies = unique((input.mappedCompanies || []).map(naturalSearchTerm).filter(Boolean));
  const matchedCompany = mappedCompanies.find((company) => includesNormalized(candidateText, company));
  const segmentScore = input.marketSegment ? (matchedCompany ? 10 : 2) : 0;
  const compatibility = Math.max(
    0,
    Math.min(100, role.score + seniority.score + keywordScore + locationScore + segmentScore - noise.penalty),
  );

  const tier: CandidateTier = !requiredEvidence.concepts.length
    ? "A"
    : requiredEvidence.missing.length === 0
      ? "A"
      : requiredEvidence.matched.length >= Math.ceil(requiredEvidence.concepts.length / 2)
        ? "B"
        : "C";
  const tierLabel = tier === "A"
    ? "evidência pública completa dos critérios obrigatórios"
    : tier === "B"
      ? "evidência parcial — confirmar no perfil antes de abordar"
      : "sem evidência pública dos critérios obrigatórios";

  const reasons = [
    role.label,
    seniority.label,
    `${matchedKeywords.length}/${keywordPhrases.length || 0} competência(s) pública(s)`,
    candidate.geographicLabel || "localidade não confirmada",
  ];
  if (input.marketSegment) reasons.push(matchedCompany ? `empresa do segmento: ${matchedCompany}` : "segmento direcionado pela consulta; empresa a confirmar");
  if (noise.labels.length) reasons.push(`atenção: ${noise.labels.join(", ")}`);

  return {
    compatibility,
    matchReason: reasons.join(" · "),
    matchedRequiredKeywords: requiredEvidence.matched,
    missingRequiredKeywords: requiredEvidence.missing,
    tier,
    tierLabel,
    seniorityLabel: candidateLevel?.label || "",
    scoreBreakdown: {
      cargo: role.score,
      senioridade: seniority.score,
      competencias: keywordScore,
      localidade: locationScore,
      ruido: -noise.penalty,
      segmento: segmentScore,
    },
  };
}

function passesMinimumProfessionalFit(
  candidate: Pick<TalentCandidate, "title" | "company" | "summary">,
  input: TalentSearchInput,
) {
  const titleText = [candidate.title, candidate.company].filter(Boolean).join(" ");
  const role = roleScore(titleText || candidate.summary || "", input);
  const jobLevel = detectSeniority(input.title);
  const candidateLevel = detectSeniority(titleText);
  if (role.score < 8) return false;
  if (!jobLevel) return true;
  const jobIndex = SENIORITY_ORDER.indexOf(jobLevel.key);
  if (!candidateLevel) return jobIndex < SENIORITY_ORDER.indexOf("manager");
  return Math.abs(jobIndex - SENIORITY_ORDER.indexOf(candidateLevel.key)) <= 1;
}

function parseProfessionalTitle(value: unknown) {
  const rawTitle = plain(value)
    .replace(/\s*[|·–—-]\s*LinkedIn\s*$/i, "")
    .trim();
  const parts = rawTitle.split(/\s+[|·–—-]\s+/).map((part) => part.trim()).filter(Boolean);
  const name = parts.shift() || "Perfil profissional";
  if (!parts.length) return { name, title: "Perfil profissional no LinkedIn", company: "" };
  if (parts.length === 1) {
    const atCompany = parts[0].match(/^(.+?)\s+(?:at|na|no|em)\s+(.+)$/i);
    return atCompany
      ? { name, title: atCompany[1].trim(), company: atCompany[2].trim() }
      : { name, title: parts[0], company: "" };
  }
  return {
    name,
    title: parts.slice(0, -1).join(" — "),
    company: parts.at(-1) || "",
  };
}

function serperCandidate(
  result: Record<string, unknown>,
  index: number,
  input: TalentSearchInput,
  searchedLocations: string[] = [],
): TalentCandidate | null {
  const profileUrl = linkedinProfileUrl(result.link);
  if (!profileUrl) return null;
  const professional = parseProfessionalTitle(result.title);
  if (isExcludedCandidate(professional.name, input.description)) return null;
  const summary = plain(result.snippet);
  const publicText = [plain(result.title), summary].filter(Boolean).join(" · ");
  const location = geographicEvidence(publicText, input, searchedLocations);
  const baseCandidate = {
    title: professional.title,
    company: professional.company || undefined,
    city: location.city,
    state: location.state,
    country: location.country,
    summary: summary || undefined,
    geographicMatch: location.geographicMatch,
    geographicLabel: location.geographicLabel,
    searchedLocations,
  };
  // O resultado do Google só entra no pool se houver evidência mínima de cargo
  // e senioridade. Localização e termos genéricos não compensam incompatibilidade.
  if (!passesMinimumProfessionalFit(baseCandidate, input)) return null;
  const score = calculateCompatibility(baseCandidate, input);

  // O trecho público do Google tem cerca de 160 caracteres. Eliminar de forma
  // definitiva quem não repete ali todas as palavras obrigatórias produzia
  // falso negativo em massa. Agora a evidência vira classificação (A/B/C) e a
  // eliminação só ocorre quando o modo estrito é pedido explicitamente.
  if (input.strictRequiredKeywords && score.tier !== "A") return null;

  return {
    id: `serper:${plain(result.position) || index}:${profileUrl}`,
    name: professional.name,
    ...baseCandidate,
    profileUrl,
    source: "Google via Serper",
    ...score,
  };
}

function providerError(response: Response, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const detail = plain(record.error) || plain(record.message);
  if (response.status === 401 || response.status === 403) {
    return `${PROVIDER.label}: chave recusada ou sem permissão.`;
  }
  if (response.status === 429) {
    return `${PROVIDER.label}: limite de consultas atingido. Verifique o saldo no Serper.`;
  }
  return `${PROVIDER.label}: falha ${response.status}${detail ? ` — ${detail}` : ""}.`;
}

type SerperSearch = {
  query: string;
  page: number;
  targetCities: string[];
  layer: "ancora" | "variante" | "dominio" | "profundidade" | "adaptativa";
};

function simplifiedTitle(value: string) {
  return naturalSearchTerm(value)
    .replace(/\b(?:j[uú]nior|jr\.?|pleno|s[eê]nior|sr\.?|i{1,3})\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleVariants(value: string, suppliedVariants: string[] = []) {
  const title = naturalSearchTerm(value);
  const variants = [
    title,
    ...suppliedVariants.map(naturalSearchTerm),
    simplifiedTitle(title),
  ];
  const aliases: Array<[RegExp, string]> = [
    [/administra(?:ç|c)[aã]o de pessoal/i, "departamento pessoal"],
    [/departamento pessoal/i, "administração de pessoal"],
    [/recrutamento (?:e|&) sele(?:ç|c)[aã]o/i, "talent acquisition"],
    [/talent acquisition/i, "recrutamento e seleção"],
    [/recursos humanos/i, "RH"],
    [/log[ií]stica/i, "supply chain"],
    [/supply chain/i, "logística"],
    [/compras/i, "procurement"],
    [/procurement/i, "compras"],
    [/tecnologia da informa(?:ç|c)[aã]o/i, "TI"],
  ];

  for (const [pattern, replacement] of aliases) {
    if (pattern.test(title)) variants.push(title.replace(pattern, replacement));
  }
  return unique(variants.map(naturalSearchTerm).filter(Boolean));
}

function citySearchGroups(cities: string[]) {
  const normalized = unique(cities.map(naturalSearchTerm).filter(Boolean));
  if (!normalized.length) return [[]] as string[][];
  const groupCount = Math.min(4, normalized.length);
  const groups = Array.from({ length: groupCount }, () => [] as string[]);
  normalized.forEach((city, index) => groups[index % groupCount].push(city));
  return groups;
}

function geographicQuery(input: TalentSearchInput, cities: string[]) {
  const profile = getCountryProfile(input.countryCode);
  const countryTerms = profile.aliases
    .slice(0, 4)
    .map(exactPhrase)
    .filter(Boolean);
  const countryExpression = countryTerms.length > 1 ? `(${countryTerms.join(" OR ")})` : countryTerms[0] || "";
  if (input.countrywide) return countryExpression;
  const cityTerms = cities.map(exactPhrase).filter(Boolean);
  const cityExpression = cityTerms.length > 1 ? `(${cityTerms.join(" OR ")})` : cityTerms[0] || "";
  return [cityExpression, input.subdivision ? exactPhrase(input.subdivision) : "", countryExpression]
    .filter(Boolean)
    .join(" ");
}

/**
 * Plano de busca em quatro camadas. A versão anterior repetia praticamente a
 * mesma consulta quatro vezes, mudando só as cidades — o que devolvia sempre o
 * mesmo conjunto de perfis. Aqui cada camada procura por um ângulo diferente.
 */
function buildSearchPlan(input: TalentSearchInput) {
  const requiredConcepts = requiredKeywordConcepts(input.keywords, input.requiredKeywordConcepts);
  const queryConcepts = requiredConcepts.filter((concept) => !requiredConcepts.some((possibleSource) =>
    (REQUIRED_KEYWORD_IMPLICATIONS[possibleSource.label] || []).includes(concept.label),
  ));
  const conceptGroups = queryConcepts.map((concept) => {
    const aliases = concept.aliases.slice(0, 10).map(exactPhrase).filter(Boolean);
    return aliases.length > 1 ? `(${aliases.join(" OR ")})` : aliases[0] || "";
  }).filter(Boolean);
  const conceptExpression = conceptGroups.join(" ");
  const discoveryConcept = conceptGroups[0]
    || exactPhrase((input.semanticKeywords || []).find((term) => !GENERIC_CORPORATE_TERMS.has(withoutAccents(term))) || "");
  const semanticConcepts = unique((input.semanticKeywords || [])
    .map(naturalSearchTerm)
    .filter((term) => term && !GENERIC_CORPORATE_TERMS.has(withoutAccents(term))))
    .slice(0, 4)
    .map(exactPhrase)
    .filter(Boolean);
  const semanticExpression = conceptExpression || semanticConcepts.slice(0, 3).join(" ");

  const titles = titleVariants(input.title, input.titleVariants);
  const groups = input.countrywide ? [[]] : citySearchGroups(input.cities);
  const sharedCities = input.countrywide ? [] : input.cities.slice(0, 8);
  const searches: SerperSearch[] = [];
  const companyExpression = (input.mappedCompanies || []).slice(0, 12).map(exactPhrase).filter(Boolean);
  const companies = companyExpression.length > 1 ? `(${companyExpression.join(" OR ")})` : companyExpression[0] || "";

  const push = (query: string, page: number, targetCities: string[], layer: SerperSearch["layer"]) => {
    const normalized = `site:linkedin.com/in ${query}`.replace(/\s+/g, " ").trim();
    searches.push({ query: normalized, page, targetCities, layer });
  };

  // Camada 1 — âncora: título exato entre aspas + conceitos + geografia.
  const primaryTitle = exactPhrase(titles[0] || input.title);
  for (const targetCities of groups.slice(0, 3)) {
    push(`${primaryTitle} ${semanticExpression} ${companies} ${geographicQuery(input, targetCities)}`, 1, targetCities, "ancora");
  }

  // Camada 2 — variantes de cargo com apenas o conceito mais distintivo. Exigir
  // todos os critérios no snippet do Google diminuía demais a cobertura.
  for (const variant of titles.slice(1, 6)) {
    push(`${exactPhrase(variant)} ${discoveryConcept} ${companies} ${geographicQuery(input, sharedCities)}`, 1, sharedCities, "variante");
  }

  // Camada 3 — domínio: quem tem a expertise mas usa outro nome de cargo.
  if (semanticExpression) {
    const jobLevel = detectSeniority(input.title);
    const levelExpression = jobLevel
      ? `(${jobLevel.terms.slice(0, 4).map(exactPhrase).filter(Boolean).join(" OR ")})`
      : "";
    push(`${discoveryConcept || semanticExpression} ${levelExpression} ${companies} ${geographicQuery(input, sharedCities)}`, 1, sharedCities, "dominio");
  }

  // Camada 4 — profundidade progressiva. A página 2 mantém o conceito mais
  // distintivo; a página 3 relaxa os critérios somente para ampliar o pool. O
  // ranking A/B/C continua impedindo que o perfil relaxado passe à frente.
  push(`${primaryTitle} ${discoveryConcept} ${geographicQuery(input, sharedCities)}`, 2, sharedCities, "profundidade");
  push(`${primaryTitle} ${geographicQuery(input, sharedCities)}`, 3, sharedCities, "profundidade");

  const seen = new Set<string>();
  return searches.filter((item) => {
    const key = `${item.query.toLowerCase()}|${item.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(4, SEARCH_BUDGET - 4));
}

/**
 * Segunda rodada orientada pelos resultados: reutiliza os títulos dos perfis
 * mais aderentes e combina cada um com conceitos ainda pouco evidenciados.
 * O aprendizado é limitado à busca atual, auditável e não altera pesos globais.
 */
function buildAdaptiveSearchPlan(
  input: TalentSearchInput,
  candidates: TalentCandidate[],
  usedSearches: SerperSearch[],
) {
  const used = new Set(usedSearches.map((item) => `${item.query.toLowerCase()}|${item.page}`));
  const concepts = requiredKeywordConcepts(input.keywords, input.requiredKeywordConcepts);
  const conceptExpression = concepts
    .slice(0, 3)
    .map((concept) => {
      const aliases = concept.aliases.slice(0, 5).map(exactPhrase).filter(Boolean);
      return aliases.length > 1 ? `(${aliases.join(" OR ")})` : aliases[0] || "";
    })
    .filter(Boolean)
    .join(" ");
  const learnedTitles = unique(
    orderCandidates(candidates)
      .map((candidate) => naturalSearchTerm(candidate.title))
      .filter((title) => title && !/^perfil profissional/i.test(title))
      .slice(0, 8),
  );
  const fallbackTitles = titleVariants(input.title, input.titleVariants).slice(1, 8);
  const titles = unique([...learnedTitles, ...fallbackTitles]);
  const cityGroups = input.countrywide ? [[]] : citySearchGroups(input.cities);
  const searches: SerperSearch[] = [];

  for (const [index, title] of titles.entries()) {
    const targetCities = cityGroups[index % cityGroups.length] || [];
    const query = `site:linkedin.com/in ${exactPhrase(title)} ${conceptExpression} ${geographicQuery(input, targetCities)}`
      .replace(/\s+/g, " ")
      .trim();
    const key = `${query.toLowerCase()}|1`;
    if (!used.has(key)) searches.push({ query, page: 1, targetCities, layer: "adaptativa" });
  }
  return searches.slice(0, Math.max(0, SEARCH_BUDGET - usedSearches.length));
}

const responseCache = new Map<string, { at: number; payload: Record<string, unknown> | null }>();

async function callSerper(apiKey: string, query: string, num = RESULTS_PER_QUERY, page = 1, countryCode = "BR") {
  const profile = getCountryProfile(countryCode);
  const cacheKey = `${countryCode}|${page}|${num}|${query}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.payload;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({ q: query, gl: profile.code.toLowerCase(), hl: profile.searchLanguage, num, page }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || plain(payload?.error)) throw new Error(providerError(response, payload));
    responseCache.set(cacheKey, { at: Date.now(), payload });
    if (responseCache.size > 200) responseCache.clear();
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${PROVIDER.label}: a consulta ultrapassou ${Math.round(SERPER_TIMEOUT_MS / 1000)}s e foi interrompida.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverSegmentCompanies(apiKey: string, input: TalentSearchInput) {
  const segment = getMarketSegment(input.marketSegment);
  if (!segment.value) return { companies: [] as string[], queries: 0 };
  const profile = getCountryProfile(input.countryCode);
  const queries = [
    `maiores empresas ${segment.searchTerms.slice(0, 2).join(" OR ")} ${profile.name}`,
    `empresas ${segment.searchTerms.slice(2).join(" OR ")} ${input.subdivision || profile.name}`,
  ];
  const settled = await Promise.allSettled(queries.map((query) => callSerper(apiKey, query, 10, 1, input.countryCode)));
  const publicText = settled.flatMap((outcome) => {
    if (outcome.status !== "fulfilled") return [];
    const organic = Array.isArray(outcome.value?.organic) ? outcome.value.organic as Array<Record<string, unknown>> : [];
    const knowledgeTitle = outcome.value?.knowledgeGraph && typeof outcome.value.knowledgeGraph === "object"
      ? plain((outcome.value.knowledgeGraph as Record<string, unknown>).title)
      : "";
    return [knowledgeTitle, ...organic.flatMap((result) => [plain(result.title), plain(result.snippet)])];
  }).join(" ");
  const validatedSeeds = (segment.seedCompanies || []).filter((company) => includesNormalized(publicText, company));
  // A base curada evita transformar títulos de matérias e diretórios em nomes
  // de empregadores. O Google valida e prioriza as empresas que aparecem agora;
  // as demais sementes garantem cobertura quando o snippet é curto.
  return {
    companies: unique([...validatedSeeds, ...(segment.seedCompanies || [])]).slice(0, 12),
    queries: settled.filter((outcome) => outcome.status === "fulfilled").length,
  };
}

function deduplicate(candidates: TalentCandidate[]) {
  const seen = new Map<string, TalentCandidate>();
  for (const candidate of candidates) {
    const key = candidate.profileUrl.toLowerCase().replace(/\/$/, "");
    const existing = seen.get(key);
    // Ao encontrar o mesmo perfil em consultas diferentes, mantém a leitura com
    // mais evidência (maior pontuação), não a primeira que apareceu.
    if (!existing || candidate.compatibility > existing.compatibility) seen.set(key, candidate);
  }
  return [...seen.values()];
}

const TIER_ORDER: Record<CandidateTier, number> = { A: 0, B: 1, C: 2 };

function orderCandidates(candidates: TalentCandidate[]) {
  return [...candidates].sort((a, b) => {
    const tierDelta = TIER_ORDER[a.tier || "A"] - TIER_ORDER[b.tier || "A"];
    if (tierDelta !== 0) return tierDelta;
    return b.compatibility - a.compatibility;
  });
}

async function searchSerper(apiKey: string, input: TalentSearchInput) {
  const startedAt = Date.now();
  const companyDiscovery = await discoverSegmentCompanies(apiKey, input);
  const enrichedInput = { ...input, mappedCompanies: companyDiscovery.companies };
  const plan = buildSearchPlan(enrichedInput);
  const maxCandidates = Math.min(20, Math.max(1, Math.trunc(input.maxCandidates || 20)));

  const parsePayload = (payload: Record<string, unknown> | null, search: SerperSearch, payloadIndex: number) => {
    const organic = Array.isArray(payload?.organic)
      ? payload.organic as Array<Record<string, unknown>>
      : [];
    return organic
      .map((result, resultIndex) => serperCandidate(result, (payloadIndex * 100) + resultIndex, enrichedInput, search.targetCities))
      .filter((candidate): candidate is TalentCandidate => Boolean(candidate));
  };

  let queries = companyDiscovery.queries;
  let talentQueries = 0;
  let pool: TalentCandidate[] = [];
  let firstError: Error | null = null;

  // Execução em lotes paralelos: o plano inteiro roda em ~2 rodadas de rede em
  // vez de até 6 chamadas sequenciais. É a causa direta da sensação de travado.
  for (let index = 0; index < plan.length; index += PARALLEL_BATCH) {
    const batch = plan.slice(index, index + PARALLEL_BATCH);
    const settled = await Promise.allSettled(
      batch.map((item) => callSerper(apiKey, item.query, RESULTS_PER_QUERY, item.page, input.countryCode)),
    );
    settled.forEach((outcome, batchIndex) => {
      if (outcome.status === "fulfilled") {
        queries += 1;
        talentQueries += 1;
        pool = pool.concat(parsePayload(outcome.value, batch[batchIndex], index + batchIndex));
      } else if (!firstError) {
        firstError = outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason));
      }
    });
    // Interrompe cedo apenas quando já existe folga real de perfis de primeira
    // linha — nunca antes de ter material suficiente para ranquear.
    const strongCandidates = deduplicate(pool).filter((candidate) => candidate.tier === "A");
    if (strongCandidates.length >= maxCandidates * 3) break;
  }

  const initialRanked = orderCandidates(deduplicate(pool));
  const initialStrong = initialRanked.filter((candidate) => candidate.tier === "A" || candidate.tier === "B");
  const shouldAdapt = initialRanked.length < maxCandidates * 2 || initialStrong.length < maxCandidates;
  if (shouldAdapt && talentQueries < SEARCH_BUDGET) {
    const adaptivePlan = buildAdaptiveSearchPlan(enrichedInput, initialRanked, plan)
      .slice(0, SEARCH_BUDGET - talentQueries);
    for (let index = 0; index < adaptivePlan.length; index += PARALLEL_BATCH) {
      const batch = adaptivePlan.slice(index, index + PARALLEL_BATCH);
      const settled = await Promise.allSettled(
        batch.map((item) => callSerper(apiKey, item.query, RESULTS_PER_QUERY, item.page, input.countryCode)),
      );
      settled.forEach((outcome, batchIndex) => {
        if (outcome.status === "fulfilled") {
          queries += 1;
          talentQueries += 1;
          pool = pool.concat(parsePayload(outcome.value, batch[batchIndex], plan.length + index + batchIndex));
        } else if (!firstError) {
          firstError = outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason));
        }
      });
    }
  }

  if (!talentQueries) {
    throw firstError || new Error(`${PROVIDER.label}: nenhuma estratégia de busca pôde ser executada.`);
  }

  // O corte acontece DEPOIS do ranking, nunca antes. Na versão anterior a lista
  // era truncada na ordem do Google e só então ordenada — o ranking existia,
  // mas não influenciava quem entrava na lista.
  const ranked = orderCandidates(deduplicate(pool));
  const tiers = {
    A: ranked.filter((candidate) => candidate.tier === "A").length,
    B: ranked.filter((candidate) => candidate.tier === "B").length,
    C: ranked.filter((candidate) => candidate.tier === "C").length,
  };

  return {
    candidates: ranked.slice(0, maxCandidates),
    pool: ranked.slice(0, Math.max(maxCandidates, 60)),
    queries,
    poolSize: ranked.length,
    tiers,
    elapsedMs: Date.now() - startedAt,
    mappedCompanies: companyDiscovery.companies,
  };
}

export async function getTalentSourceStatuses() {
  const saved = await getSecret(PROVIDER.key);
  return [{
    provider: "serper" as const,
    label: PROVIDER.label,
    configured: Boolean(saved),
    updatedAt: saved?.updatedAt || null,
  }];
}

export async function saveTalentSourceKey(provider: TalentProvider, apiKey: string) {
  if (provider !== "serper") throw new Error("Fonte de talentos inválida.");
  await saveSecret(PROVIDER.key, apiKey);
}

export async function testTalentSourceKey(provider: TalentProvider, apiKey: string) {
  if (provider !== "serper") throw new Error("Fonte de talentos inválida.");
  await callSerper(apiKey, "LinkedIn perfil profissional Talent Acquisition Brasil", 1);
  return true;
}

export async function searchTalentSources(input: TalentSearchInput) {
  const saved = await getSecret(PROVIDER.key);
  if (!saved) {
    return {
      candidates: [] as TalentCandidate[],
      pool: [] as TalentCandidate[],
      mappedCompanies: [] as string[],
      providers: [] as ProviderSearchStatus[],
      configured: false,
    };
  }

  try {
    const result = await searchSerper(saved.value, input);
    const requiredCount = requiredKeywordConcepts(input.keywords, input.requiredKeywordConcepts).length;
    const profile = getCountryProfile(input.countryCode);
    const scope = input.countrywide
      ? `todo o território de ${profile.name}`
      : `${input.cities.length} cidade(s) em ${[input.subdivision, profile.name].filter(Boolean).join(" · ")}`;
    const evidenceNote = requiredCount
      ? ` Evidência dos ${requiredCount} critério(s) obrigatório(s): ${result.tiers.A} perfil(is) completo(s), ${result.tiers.B} parcial(is), ${result.tiers.C} sem evidência pública.`
      : "";
    return {
      candidates: result.candidates,
      pool: result.pool,
      mappedCompanies: result.mappedCompanies,
      providers: [{
        provider: "serper" as const,
        label: PROVIDER.label,
        status: "success" as const,
        count: result.candidates.length,
        queries: result.queries,
        poolSize: result.poolSize,
        elapsedMs: result.elapsedMs,
        tiers: result.tiers,
        mappedCompanies: result.mappedCompanies,
        message: `${PROVIDER.label} executou ${result.queries} consulta(s) em ${(result.elapsedMs / 1000).toFixed(1)}s para ${scope}${result.mappedCompanies.length ? `, mapeou ${result.mappedCompanies.length} empresa(s) do segmento` : ""}, avaliou ${result.poolSize} perfil(is) público(s) e classificou os ${result.candidates.length} melhores.${evidenceNote}`,
      }],
      configured: true,
    };
  } catch (error) {
    return {
      candidates: [] as TalentCandidate[],
      pool: [] as TalentCandidate[],
      mappedCompanies: [] as string[],
      providers: [{
        provider: "serper" as const,
        label: PROVIDER.label,
        status: "error" as const,
        count: 0,
        queries: 0,
        message: error instanceof Error ? error.message : `${PROVIDER.label}: erro na busca.`,
      }],
      configured: true,
    };
  }
}

export function isTalentProvider(value: unknown): value is TalentProvider {
  return value === "serper";
}
