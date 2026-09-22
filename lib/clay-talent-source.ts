import crypto from "node:crypto";
import type { TalentCandidate, TalentSearchInput } from "@/lib/talent-sources";
import { canonicalLinkedInProfileUrl } from "@/lib/profile-url";
import { issueClaySearchSession, readClaySearchSession } from "@/lib/talent-search-session";

const CLAY_API_BASE = "https://api.clay.com/public/v0";
const CLAY_TIMEOUT_MS = Math.max(6000, Number(process.env.EUREKA_CLAY_TIMEOUT_MS) || 18000);
const MAX_PAGES_PER_REQUEST = 3;

type ClayExperience = {
  company?: string;
  end_date?: string;
  location?: string;
  start_date?: string;
  title?: string;
};

type ClayPerson = {
  clay_profile_id?: string | number;
  first_name?: string;
  last_name?: string;
  name?: string;
  linkedin_url?: string;
  location?: { city?: string; name?: string; state_or_province?: string };
  matched_experiences?: ClayExperience[];
};

function quoted(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
}

function countryForClay(country: string) {
  const aliases: Record<string, string> = {
    BR: "Brazil", AR: "Argentina", CL: "Chile", CO: "Colombia", MX: "Mexico",
    PY: "Paraguay", UY: "Uruguay", US: "United States", CA: "Canada",
  };
  return aliases[country] || country;
}

function mainTitle(input: TalentSearchInput) {
  return [input.title, ...(input.titleVariants || [])]
    .map((item) => item.trim())
    .filter(Boolean)[0] || input.title;
}

function clayQuery(input: TalentSearchInput) {
  const conditions = [
    `location_country = "${quoted(countryForClay(input.countryCode))}"`,
    `experiences.any(is_current = true and job_title is_similar_to ("${quoted(mainTitle(input))}"))`,
  ];
  // A descrição estruturada nem sempre traz cada tecnologia. Em modo amplo,
  // o título semelhante faz a descoberta e o Eureka classifica a evidência;
  // no modo rigoroso, o primeiro requisito distintivo também vira filtro.
  const keyword = (input.requiredKeywordConcepts?.[0]?.aliases?.[0] || input.keywords[0] || "").trim();
  if (input.strictRequiredKeywords && keyword.length >= 4) {
    conditions.push(`experiences.any(is_current = true and description contains "${quoted(keyword)}")`);
  }
  // O tamanho da página é controlado pelo endpoint /run. Limitar o DSL a 50
  // acabava o iterador logo na primeira rodada e impedia o "buscar mais".
  return `select from people where ${conditions.join(" and ")}`;
}

function queryFingerprint(query: string) {
  return crypto.createHash("sha256").update(query).digest("base64url");
}

async function clayFetch(apiKey: string, path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAY_TIMEOUT_MS);
  try {
    const response = await fetch(`${CLAY_API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "clay-api-key": apiKey,
        ...(init?.headers || {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const detail = typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.error === "string"
          ? payload.error
          : `HTTP ${response.status}`;
      throw new Error(`Clay: ${detail}`);
    }
    return payload || {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Clay: a consulta ultrapassou ${Math.round(CLAY_TIMEOUT_MS / 1000)}s e foi interrompida.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function candidateFromClay(person: ClayPerson, index: number, input: TalentSearchInput): TalentCandidate | null {
  const experience = person.matched_experiences?.find((item) => !item.end_date) || person.matched_experiences?.[0];
  const name = (person.name || [person.first_name, person.last_name].filter(Boolean).join(" ")).trim();
  const profileUrl = canonicalLinkedInProfileUrl(person.linkedin_url);
  if (!name || !profileUrl) return null;
  const title = experience?.title?.trim() || input.title;
  const summary = [experience?.company, experience?.location, title].filter(Boolean).join(" · ");
  const evidence = normalized([title, summary].join(" "));
  const titleScore = normalized(title).includes(normalized(input.title)) ? 60 : 42;
  const keywordScore = input.keywords.filter((item) => evidence.includes(normalized(item))).length * 8;
  const compatibility = Math.min(92, Math.max(35, titleScore + keywordScore));
  return {
    id: `clay-${person.clay_profile_id || index}`,
    name,
    title,
    company: experience?.company?.trim() || "",
    city: person.location?.city?.trim() || "",
    state: person.location?.state_or_province?.trim() || "",
    country: input.country,
    profileUrl,
    source: "Clay · Busca estruturada",
    summary,
    compatibility,
    matchReason: `Clay identificou experiência atual compatível com ${input.title}. Confirme os requisitos no LinkedIn.`,
    geographicMatch: input.countrywide ? "country" : "unknown",
    geographicLabel: person.location?.name?.trim() || undefined,
    tier: input.keywords.length ? "B" : "A",
    tierLabel: input.keywords.length ? "Requisitos técnicos a confirmar no perfil" : "Cargo atual estruturado pelo Clay",
    eligible: true,
    fitClassification: input.keywords.length ? "validate" : "high",
    scoreBreakdown: { cargo: titleScore, senioridade: 0, competencias: keywordScore, localidade: 0, ruido: 0 },
  };
}

export async function testClayKey(apiKey: string) {
  await clayFetch(apiKey, "/search/query-mode/reference", { method: "GET" });
  return true;
}

export async function searchClay(apiKey: string, input: TalentSearchInput) {
  const startedAt = Date.now();
  const query = clayQuery(input);
  const fingerprint = queryFingerprint(query);
  let searchId = "";
  if (input.clayContinuationToken) {
    searchId = readClaySearchSession(input.clayContinuationToken, fingerprint).searchId;
  } else {
    const created = await clayFetch(apiKey, "/search/query-mode", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    searchId = typeof created.search_id === "string" ? created.search_id : "";
    if (!searchId) throw new Error("Clay: a busca não retornou um identificador.");
  }

  const excluded = new Set((input.excludedProfileUrls || []).map(canonicalLinkedInProfileUrl).filter(Boolean));
  const seen = new Set<string>();
  const pool: TalentCandidate[] = [];
  const pageLimit = Math.min(50, Math.max(20, input.maxCandidates));
  let hasMore = true;
  let exhaustionReason = "";
  let queries = 0;

  // O Clay trata search_id como iterador: cada /run seguinte entrega a próxima
  // página. Quando a página tiver perfis que já apareceram via Serper, avançamos
  // até três páginas para tentar completar a rodada sem repetir ninguém.
  while (hasMore && pool.length < input.maxCandidates && queries < MAX_PAGES_PER_REQUEST) {
    const page = await clayFetch(apiKey, `/search/query-mode/${encodeURIComponent(searchId)}/run`, {
      method: "POST",
      body: JSON.stringify({ limit: pageLimit }),
    });
    queries += 1;
    const people = Array.isArray(page.data) ? page.data as ClayPerson[] : [];
    people.map((person, index) => candidateFromClay(person, (queries * 1000) + index, input)).forEach((candidate) => {
      if (!candidate || excluded.has(candidate.profileUrl) || seen.has(candidate.profileUrl)) return;
      seen.add(candidate.profileUrl);
      pool.push(candidate);
    });
    hasMore = page.has_more === true;
    exhaustionReason = typeof page.exhaustion_reason === "string" ? page.exhaustion_reason : "";
  }

  pool.sort((a, b) => b.compatibility - a.compatibility);
  return {
    candidates: pool.slice(0, input.maxCandidates),
    pool: pool.slice(0, Math.min(240, Math.max(100, input.maxCandidates * 2))),
    queries,
    poolSize: pool.length,
    elapsedMs: Date.now() - startedAt,
    hasMore,
    continuationToken: hasMore ? issueClaySearchSession(searchId, fingerprint) : "",
    exhaustionReason,
  };
}
