import { getSecret, saveSecret } from "@/lib/secure-settings";

export type TalentProvider = "serper";

export type TalentSearchInput = {
  title: string;
  titleVariants?: string[];
  city: string;
  additionalCity: string;
  description: string;
  keywords: string[];
  semanticKeywords?: string[];
  requiredKeywordConcepts?: RequiredKeywordConcept[];
  nationwide: boolean;
  maxCandidates: number;
};

export type TalentCandidate = {
  id: string;
  name: string;
  title: string;
  city: string;
  state: string;
  profileUrl: string;
  company?: string;
  source: "Google via Serper";
  summary?: string;
  compatibility: number;
  matchReason: string;
  matchedRequiredKeywords?: string[];
  missingRequiredKeywords?: string[];
};

export type ProviderSearchStatus = {
  provider: TalentProvider;
  label: string;
  status: "success" | "error";
  count: number;
  queries: number;
  message: string;
};

const PROVIDER = {
  key: "talent_source_serper_api_key",
  label: "Serper · Busca LinkedIn",
} as const;

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

function descriptionTerms(description: string) {
  const counts = meaningfulTokens(description).reduce<Record<string, number>>((result, token) => {
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

function calculateCompatibility(
  candidate: Pick<TalentCandidate, "title" | "company" | "city" | "state" | "summary">,
  input: TalentSearchInput,
) {
  const candidateText = [candidate.title, candidate.company, candidate.city, candidate.state, candidate.summary]
    .filter(Boolean)
    .join(" ");
  const normalizedCandidate = withoutAccents(candidateText);
  const titleTerms = unique(meaningfulTokens(input.title));
  const matchedTitle = titleTerms.filter((term) => normalizedCandidate.includes(term));
  const titleScore = titleTerms.length ? Math.round((matchedTitle.length / titleTerms.length) * 55) : 0;

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

  const requestedLocations = [input.city, input.additionalCity].filter(Boolean);
  const matchedLocation = input.nationwide || requestedLocations.some((location) => includesNormalized(candidateText, location));
  const locationScore = matchedLocation ? 15 : 0;
  const compatibility = Math.min(100, titleScore + keywordScore + locationScore);

  const reasons = [
    `${matchedTitle.length}/${titleTerms.length || 0} termo(s) do cargo`,
    `${matchedKeywords.length}/${keywordPhrases.length || 0} competência(s) pública(s)`,
    input.nationwide ? "busca nacional" : matchedLocation ? "localidade compatível" : "localidade não confirmada",
  ];
  return {
    compatibility,
    matchReason: reasons.join(" · "),
    matchedRequiredKeywords: requiredEvidence.matched,
    missingRequiredKeywords: requiredEvidence.missing,
  };
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
): TalentCandidate | null {
  const profileUrl = linkedinProfileUrl(result.link);
  if (!profileUrl) return null;
  const professional = parseProfessionalTitle(result.title);
  const summary = plain(result.snippet);
  const summaryLocation = locationFromText(summary);
  const location = summaryLocation.city || summaryLocation.state
    ? summaryLocation
    : locationFromText(plain(result.title));
  const baseCandidate = {
    title: professional.title,
    company: professional.company || undefined,
    city: location.city,
    state: location.state,
    summary: summary || undefined,
  };
  const publicEvidence = [
    baseCandidate.title,
    baseCandidate.company,
    baseCandidate.city,
    baseCandidate.state,
    baseCandidate.summary,
  ].filter(Boolean).join(" ");
  const requiredEvidence = requiredKeywordEvidence(publicEvidence, input.keywords, input.requiredKeywordConcepts);
  if (requiredEvidence.missing.length) return null;
  const score = calculateCompatibility(baseCandidate, input);
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

function searchQueries(input: TalentSearchInput) {
  // O X-Ray é a estratégia principal. Se o plano do Serper recusar o
  // operador, as consultas naturais com o caminho do LinkedIn assumem.
  const linkedinProfileHint = "linkedin.com/in";
  const locations = input.nationwide
    ? ["Brasil"]
    : [input.city, input.additionalCity].filter(Boolean);
  const requiredConcepts = requiredKeywordConcepts(input.keywords, input.requiredKeywordConcepts);
  const queryConcepts = requiredConcepts.filter((concept) => !requiredConcepts.some((possibleSource) =>
    (REQUIRED_KEYWORD_IMPLICATIONS[possibleSource.label] || []).includes(concept.label),
  ));
  const requiredNaturalTerms = queryConcepts
    .map((concept) => naturalSearchTerm(concept.aliases[0] || concept.label))
    .filter(Boolean);
  const titles = titleVariants(input.title, input.titleVariants);
  const primaryQuery = [linkedinProfileHint, titles[0], ...requiredNaturalTerms, ...locations]
    .map(naturalSearchTerm)
    .filter(Boolean)
    .join(" ");
  const naturalCandidates: SerperSearch[] = [
    { query: primaryQuery, page: 1 },
    ...titles.slice(1, 4).map((title) => ({
      query: [linkedinProfileHint, title, ...requiredNaturalTerms, ...locations]
        .map(naturalSearchTerm)
        .filter(Boolean)
        .join(" "),
      page: 1,
    })),
  ];
  const seenNatural = new Set<string>();
  const natural = naturalCandidates.filter((item) => {
    const key = `${item.query.toLowerCase()}|${item.page}`;
    if (seenNatural.has(key)) return false;
    seenNatural.add(key);
    return true;
  }).slice(0, 4);

  const xrayKeywordGroups = queryConcepts.map((concept) => {
    const aliases = concept.aliases.slice(0, 10).map((alias) => `"${naturalSearchTerm(alias)}"`).filter((alias) => alias !== '""');
    return aliases.length > 1 ? `(${aliases.join(" OR ")})` : aliases[0] || "";
  }).filter(Boolean);
  const xray: SerperSearch[] = titles.slice(0, 4).map((title) => ({
    query: `site:linkedin.com/in ${naturalSearchTerm(title)} ${xrayKeywordGroups.join(" ")} ${locations.map(naturalSearchTerm).join(" ")}`.replace(/\s+/g, " ").trim(),
    page: 1,
  }));
  if (xray.length < 4) {
    xray.push({
      query: `site:linkedin.com/in ${naturalSearchTerm(titles[0])} ${xrayKeywordGroups.join(" ")} ${locations.map(naturalSearchTerm).join(" ")}`.replace(/\s+/g, " ").trim(),
      page: 2,
    });
  }

  return {
    xray,
    natural,
    naturalFallback: { query: primaryQuery, page: 2 } satisfies SerperSearch,
  };
}

async function callSerper(apiKey: string, query: string, num = 10, page = 1) {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, gl: "br", hl: "pt-br", num, page }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || plain(payload?.error)) throw new Error(providerError(response, payload));
  return payload;
}

async function searchSerper(apiKey: string, input: TalentSearchInput) {
  const plan = searchQueries(input);
  const maxCandidates = Math.min(20, Math.max(1, Math.trunc(input.maxCandidates || 20)));
  const parsePayloads = (payloads: Array<Record<string, unknown> | null>) => payloads.flatMap((payload, payloadIndex) => {
    const organic = Array.isArray(payload?.organic)
      ? payload.organic as Array<Record<string, unknown>>
      : [];
    return organic
      .map((result, resultIndex) => serperCandidate(result, (payloadIndex * 100) + resultIndex, input))
      .filter((candidate): candidate is TalentCandidate => Boolean(candidate));
  });
  let queries = 0;
  let candidates: TalentCandidate[] = [];
  let firstError: Error | null = null;

  const runSequentially = async (searches: SerperSearch[]) => {
    let successful = 0;
    for (const item of searches) {
      if (candidates.length >= maxCandidates || queries >= 4) break;
      const remaining = maxCandidates - candidates.length;
      try {
        const payload = await callSerper(apiKey, item.query, Math.min(10, remaining), item.page);
        queries += 1;
        successful += 1;
        candidates = deduplicate([...candidates, ...parsePayloads([payload])]).slice(0, maxCandidates);
      } catch (error) {
        if (!firstError && error instanceof Error) firstError = error;
      }
    }
    return successful;
  };

  const successfulXray = await runSequentially(plan.xray);
  if ((!successfulXray || !candidates.length) && candidates.length < maxCandidates && queries < 4) {
    await runSequentially(plan.natural);
  }

  if (!queries) {
    throw firstError || new Error(`${PROVIDER.label}: nenhuma estratégia de busca pôde ser executada.`);
  }

  const fallbackThreshold = Math.min(8, maxCandidates);
  if (candidates.length < fallbackThreshold && candidates.length < maxCandidates && queries < 4) {
    try {
      const remaining = maxCandidates - candidates.length;
      const fallbackPayload = await callSerper(apiKey, plan.naturalFallback.query, Math.min(10, remaining), plan.naturalFallback.page);
      queries += 1;
      candidates = deduplicate([...candidates, ...parsePayloads([fallbackPayload])]).slice(0, maxCandidates);
    } catch {
      // A busca principal continua válida mesmo quando a página adicional falha.
    }
  }

  return {
    candidates: candidates.sort((a, b) => b.compatibility - a.compatibility).slice(0, maxCandidates),
    queries,
  };
}

function deduplicate(candidates: TalentCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.profileUrl.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      providers: [] as ProviderSearchStatus[],
      configured: false,
    };
  }

  try {
    const result = await searchSerper(saved.value, input);
    const candidates = result.candidates;
    const requiredCount = requiredKeywordConcepts(input.keywords, input.requiredKeywordConcepts).length;
    return {
      candidates,
      providers: [{
        provider: "serper" as const,
        label: PROVIDER.label,
        status: "success" as const,
        count: candidates.length,
        queries: result.queries,
        message: `${PROVIDER.label} executou ${result.queries} consulta(s) adaptativa(s) e retornou ${candidates.length} de até ${input.maxCandidates} perfil(is) público(s) do LinkedIn${requiredCount ? ` com ${requiredCount} palavra(s)-chave obrigatória(s) validada(s)` : ""}.`,
      }],
      configured: true,
    };
  } catch (error) {
    return {
      candidates: [] as TalentCandidate[],
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
