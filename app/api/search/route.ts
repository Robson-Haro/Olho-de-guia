import { NextResponse } from "next/server";
import { searchTalentSources } from "@/lib/talent-sources";
import { geographicLocationLabel, getCountryProfile } from "@/lib/geography";

type SearchRequest = {
  title?: string;
  titleVariants?: string[];
  countryCode?: string;
  subdivision?: string;
  cities?: string[];
  countrywide?: boolean;
  // Compatibilidade com pesquisas salvas antes da inteligência internacional.
  city?: string;
  additionalCity?: string;
  description?: string;
  keywords?: string[];
  semanticKeywords?: string[];
  requiredKeywordConcepts?: Array<{ label?: string; aliases?: string[] }>;
  nationwide?: boolean;
  maxCandidates?: number;
  strictRequiredKeywords?: boolean;
};

function clean(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function manualStrategies(
  title: string,
  geography: { countryCode: string; subdivision: string; cities: string[]; countrywide: boolean },
  keywords: string[],
) {
  const profile = getCountryProfile(geography.countryCode);
  const countryTerms = profile.aliases.map((item) => `"${item}"`).join(" OR ");
  const cityTerms = geography.cities.map((item) => `"${item}"`).join(" OR ");
  const locations = geography.countrywide
    ? `(${countryTerms})`
    : [cityTerms ? `(${cityTerms})` : "", geography.subdivision ? `"${geography.subdivision}"` : "", `(${countryTerms})`]
        .filter(Boolean)
        .join(" AND ");
  const skills = keywords.map((item) => `"${item}"`).join(" AND ");
  const base = [`"${title}"`, skills, `(${locations})`].filter(Boolean).join(" AND ");
  return [
    { label: "LinkedIn via Google — pesquisa manual", query: `site:linkedin.com/in/ ${base}` },
    { label: "Currículos públicos — pesquisa manual", query: `${base} (currículo OR resume OR perfil profissional)` },
    { label: `LinkedIn ${profile.name} — pesquisa manual`, query: `site:linkedin.com/in/ "${title}" (${locations}) ${skills}` },
  ].map(({ label, query }) => ({
    label,
    query,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as SearchRequest;
    const title = clean(body.title, 150);
    const countryCode = clean(body.countryCode, 2).toUpperCase() || "BR";
    const country = getCountryProfile(countryCode).name;
    const subdivision = clean(body.subdivision, 120);
    const legacyCities = [clean(body.city, 100), clean(body.additionalCity, 100)].filter(Boolean);
    const cities = Array.isArray(body.cities)
      ? [...new Set(body.cities.map((item) => clean(item, 100)).filter(Boolean))].slice(0, 20)
      : legacyCities;
    const description = clean(body.description, 10000);
    const countrywide = body.countrywide === true || body.nationwide === true;
    const requestedMaximum = Number(body.maxCandidates);
    const maxCandidates = Number.isFinite(requestedMaximum)
      ? Math.min(20, Math.max(1, Math.trunc(requestedMaximum)))
      : 20;
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((item) => clean(item, 80)).filter(Boolean).slice(0, 4)
      : [];
    const titleVariants = Array.isArray(body.titleVariants)
      ? body.titleVariants.map((item) => clean(item, 150)).filter(Boolean).slice(0, 10)
      : [];
    const semanticKeywords = Array.isArray(body.semanticKeywords)
      ? body.semanticKeywords.map((item) => clean(item, 80)).filter(Boolean).slice(0, 12)
      : [];
    const requiredKeywordConcepts = Array.isArray(body.requiredKeywordConcepts)
      ? body.requiredKeywordConcepts.map((concept) => ({
          label: clean(concept?.label, 100),
          aliases: Array.isArray(concept?.aliases)
            ? concept.aliases.map((alias) => clean(alias, 100)).filter(Boolean).slice(0, 16)
            : [],
        })).filter((concept) => concept.label && concept.aliases.length).slice(0, 12)
      : [];
    if (!title || !description || (!countrywide && !cities.length)) {
      return NextResponse.json(
        { error: "Título, descrição, país e ao menos uma cidade são obrigatórios, exceto em buscas para todo o país." },
        { status: 400 },
      );
    }

    const geography = { countryCode, subdivision, cities, countrywide };
    const strategies = manualStrategies(title, geography, keywords);
    const result = await searchTalentSources({
      title,
      titleVariants,
      countryCode,
      country,
      subdivision,
      cities,
      description,
      keywords,
      semanticKeywords,
      requiredKeywordConcepts,
      countrywide,
      maxCandidates,
      strictRequiredKeywords: body.strictRequiredKeywords === true,
    });

    if (!result.configured) {
      return NextResponse.json({
        error: "O Serper ainda não está configurado. Abra Configurações, cole a chave da API e ative a conexão.",
        code: "TALENT_SOURCE_NOT_CONFIGURED",
        completed: false,
        candidates: [],
        pool: [],
        providers: [],
        strategies,
      }, { status: 503 });
    }

    const succeeded = result.providers.filter((provider) => provider.status === "success");
    if (!succeeded.length) {
      return NextResponse.json({
        error: result.providers.map((provider) => provider.message).join(" "),
        code: "ALL_TALENT_SOURCES_FAILED",
        completed: false,
        candidates: [],
        pool: [],
        providers: result.providers,
        strategies,
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      completed: true,
      candidates: result.candidates,
      // Reserva ranqueada enviada ao motor Python: ele reordena um conjunto
      // amplo, e não apenas os perfis que já entrariam na lista final.
      pool: result.pool,
      total: result.candidates.length,
      evaluated: result.pool.length,
      geography: {
        ...geography,
        country,
        label: geographicLocationLabel(geography),
      },
      providers: result.providers,
      strategies,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível executar a busca." },
      { status: 500 },
    );
  }
}
