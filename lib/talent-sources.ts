import { getSecret, saveSecret } from "@/lib/secure-settings";

export type TalentProvider = "apollo" | "serpapi";

export type TalentSearchInput = {
  title: string;
  city: string;
  additionalCity: string;
  description: string;
  keywords: string[];
  nationwide: boolean;
};

export type TalentCandidate = {
  id: string;
  name: string;
  title: string;
  city: string;
  state: string;
  profileUrl?: string;
  company?: string;
  source: "Apollo" | "Google via SerpApi";
  summary?: string;
};

export type ProviderSearchStatus = {
  provider: TalentProvider;
  label: string;
  status: "success" | "error";
  count: number;
  message: string;
};

const PROVIDERS: Record<TalentProvider, { key: string; label: string }> = {
  apollo: { key: "talent_source_apollo_api_key", label: "Apollo.io" },
  serpapi: { key: "talent_source_serpapi_api_key", label: "SerpApi" },
};

const BRAZIL_STATES: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA",
  ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO",
  maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR",
  pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO",
  roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE",
  tocantins: "TO",
};

function plain(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function normalizeState(value: unknown) {
  const state = plain(value);
  if (/^[A-Za-z]{2}$/.test(state)) return state.toUpperCase();
  return BRAZIL_STATES[withoutAccents(state)] || "";
}

function locationFromText(value: string) {
  const stateMatch = value.match(/(?:,|\-|\/|\s)(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:\b|,)/i);
  if (!stateMatch) return { city: "", state: "" };
  const state = stateMatch[1].toUpperCase();
  const before = value.slice(Math.max(0, stateMatch.index! - 55), stateMatch.index).trim();
  const cityMatch = before.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40})$/);
  return { city: cityMatch?.[1]?.replace(/^[,;|\-\s]+/, "").trim() || "", state };
}

function providerError(label: string, response: Response, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const detail = plain(record.error) || plain(record.error_message) || plain(record.message);
  if (response.status === 401 || response.status === 403) return `${label}: chave recusada ou sem permissão para esta API.`;
  if (response.status === 429) return `${label}: limite de requisições ou créditos atingido.`;
  return `${label}: falha ${response.status}${detail ? ` — ${detail}` : ""}.`;
}

export async function getTalentSourceStatuses() {
  const entries = await Promise.all(
    (Object.keys(PROVIDERS) as TalentProvider[]).map(async (provider) => {
      const saved = await getSecret(PROVIDERS[provider].key);
      return {
        provider,
        label: PROVIDERS[provider].label,
        configured: Boolean(saved),
        updatedAt: saved?.updatedAt || null,
      };
    }),
  );
  return entries;
}

export async function saveTalentSourceKey(provider: TalentProvider, apiKey: string) {
  await saveSecret(PROVIDERS[provider].key, apiKey);
}

export async function testTalentSourceKey(provider: TalentProvider, apiKey: string) {
  const response = provider === "apollo"
    ? await fetch("https://api.apollo.io/api/v1/users/api_profile", {
        headers: { Accept: "application/json", "x-api-key": apiKey },
        cache: "no-store",
      })
    : await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(providerError(PROVIDERS[provider].label, response, payload));
  return true;
}

async function searchApollo(apiKey: string, input: TalentSearchInput) {
  const params = new URLSearchParams();
  params.append("person_titles[]", input.title);
  params.set("include_similar_titles", "true");
  params.set("page", "1");
  params.set("per_page", "10");
  if (input.keywords.length) params.set("q_keywords", input.keywords.join(" OR "));
  const locations = input.nationwide
    ? ["Brazil"]
    : [input.city, input.additionalCity].filter(Boolean);
  locations.forEach((location) => params.append("person_locations[]", location));

  const searchResponse = await fetch(`https://api.apollo.io/api/v1/mixed_people/api_search?${params.toString()}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });
  const searchPayload = await searchResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!searchResponse.ok) throw new Error(providerError("Apollo.io", searchResponse, searchPayload));
  const people = Array.isArray(searchPayload?.people) ? searchPayload.people as Array<Record<string, unknown>> : [];
  if (!people.length) return [] as TalentCandidate[];

  const details = people.slice(0, 10).map((person) => ({ id: plain(person.id) })).filter((item) => item.id);
  const enrichResponse = await fetch("https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ details }),
    cache: "no-store",
  });
  const enrichPayload = await enrichResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!enrichResponse.ok) throw new Error(providerError("Apollo.io", enrichResponse, enrichPayload));
  const matches = Array.isArray(enrichPayload?.matches) ? enrichPayload.matches as Array<Record<string, unknown>> : [];

  return matches.filter(Boolean).map((person): TalentCandidate => {
    const organization = person.organization && typeof person.organization === "object"
      ? person.organization as Record<string, unknown>
      : {};
    const city = plain(person.city);
    const state = normalizeState(person.state);
    return {
      id: `apollo:${plain(person.id)}`,
      name: plain(person.name) || [plain(person.first_name), plain(person.last_name)].filter(Boolean).join(" ") || "Profissional Apollo",
      title: plain(person.title) || input.title,
      city,
      state,
      profileUrl: plain(person.linkedin_url) || undefined,
      company: plain(organization.name) || undefined,
      source: "Apollo",
    };
  });
}

function serpCandidate(result: Record<string, unknown>, index: number): TalentCandidate | null {
  const link = plain(result.link);
  if (!/https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/in\//i.test(link)) return null;
  const rawTitle = plain(result.title).replace(/\s*[|·-]\s*LinkedIn\s*$/i, "").trim();
  const titleParts = rawTitle.split(/\s+[–—-]\s+/);
  const name = titleParts.shift()?.trim() || "Perfil profissional";
  const title = titleParts.join(" — ").trim() || "Perfil no LinkedIn";
  const summary = plain(result.snippet);
  const location = locationFromText(`${rawTitle} ${summary}`);
  return {
    id: `serpapi:${plain(result.position) || index}:${link}`,
    name,
    title,
    city: location.city,
    state: location.state,
    profileUrl: link,
    source: "Google via SerpApi",
    summary: summary || undefined,
  };
}

async function searchSerpApi(apiKey: string, input: TalentSearchInput) {
  const locationQuery = input.nationwide
    ? '("Brasil" OR "Brazil")'
    : [input.city, input.additionalCity].filter(Boolean).map((item) => `"${item}"`).join(" OR ");
  const keywordQuery = input.keywords.map((item) => `"${item}"`).join(" ");
  const query = `site:linkedin.com/in/ "${input.title}" (${locationQuery}) ${keywordQuery}`.trim();
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    google_domain: "google.com.br",
    gl: "br",
    hl: "pt-br",
    num: "20",
    filter: "0",
  });
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || plain(payload?.error)) throw new Error(providerError("SerpApi", response, payload));
  const organic = Array.isArray(payload?.organic_results) ? payload.organic_results as Array<Record<string, unknown>> : [];
  return organic.map(serpCandidate).filter((candidate): candidate is TalentCandidate => Boolean(candidate));
}

function deduplicate(candidates: TalentCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.profileUrl?.toLowerCase().replace(/\/$/, "") || `${candidate.name}|${candidate.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchTalentSources(input: TalentSearchInput) {
  const configured = (await Promise.all(
    (Object.keys(PROVIDERS) as TalentProvider[]).map(async (provider) => ({
      provider,
      saved: await getSecret(PROVIDERS[provider].key),
    })),
  )).filter((entry) => entry.saved);

  if (!configured.length) {
    return {
      candidates: [] as TalentCandidate[],
      providers: [] as ProviderSearchStatus[],
      configured: false,
    };
  }

  const settled = await Promise.all(configured.map(async ({ provider, saved }) => {
    try {
      const candidates = provider === "apollo"
        ? await searchApollo(saved!.value, input)
        : await searchSerpApi(saved!.value, input);
      return {
        candidates,
        status: {
          provider,
          label: PROVIDERS[provider].label,
          status: "success" as const,
          count: candidates.length,
          message: `${PROVIDERS[provider].label} pesquisou e retornou ${candidates.length} perfil(is).`,
        },
      };
    } catch (error) {
      return {
        candidates: [] as TalentCandidate[],
        status: {
          provider,
          label: PROVIDERS[provider].label,
          status: "error" as const,
          count: 0,
          message: error instanceof Error ? error.message : `${PROVIDERS[provider].label}: erro na busca.`,
        },
      };
    }
  }));

  return {
    candidates: deduplicate(settled.flatMap((result) => result.candidates)),
    providers: settled.map((result) => result.status),
    configured: true,
  };
}

export function isTalentProvider(value: unknown): value is TalentProvider {
  return value === "apollo" || value === "serpapi";
}
