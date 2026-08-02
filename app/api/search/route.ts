import { NextResponse } from "next/server";
import { searchTalentSources } from "@/lib/talent-sources";

type SearchRequest = {
  title?: string;
  titleVariants?: string[];
  city?: string;
  additionalCity?: string;
  description?: string;
  keywords?: string[];
  semanticKeywords?: string[];
  nationwide?: boolean;
};

function clean(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function manualStrategies(title: string, city: string, additionalCity: string, keywords: string[], nationwide: boolean) {
  const locations = nationwide
    ? '"Brasil" OR "Brazil"'
    : [city, additionalCity].filter(Boolean).map((item) => `"${item}"`).join(" OR ");
  const skills = keywords.map((item) => `"${item}"`).join(" AND ");
  const base = [`"${title}"`, skills, `(${locations})`].filter(Boolean).join(" AND ");
  return [
    { label: "LinkedIn via Google — pesquisa manual", query: `site:linkedin.com/in/ ${base}` },
    { label: "Currículos públicos — pesquisa manual", query: `${base} (currículo OR resume OR perfil profissional)` },
    { label: "LinkedIn Brasil — pesquisa manual", query: `site:br.linkedin.com/in/ "${title}" (${locations}) ${skills}` },
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
    const city = clean(body.city, 100);
    const additionalCity = clean(body.additionalCity, 100);
    const description = clean(body.description, 10000);
    const nationwide = body.nationwide === true;
    const keywords = Array.isArray(body.keywords)
      ? body.keywords.map((item) => clean(item, 80)).filter(Boolean).slice(0, 4)
      : [];
    const titleVariants = Array.isArray(body.titleVariants)
      ? body.titleVariants.map((item) => clean(item, 150)).filter(Boolean).slice(0, 10)
      : [];
    const semanticKeywords = Array.isArray(body.semanticKeywords)
      ? body.semanticKeywords.map((item) => clean(item, 80)).filter(Boolean).slice(0, 12)
      : [];
    if (!title || !description || (!nationwide && !city)) {
      return NextResponse.json(
        { error: "Título, descrição e cidade são obrigatórios, exceto em buscas para todo o Brasil." },
        { status: 400 },
      );
    }

    const strategies = manualStrategies(title, city, additionalCity, keywords, nationwide);
    const result = await searchTalentSources({
      title,
      titleVariants,
      city,
      additionalCity,
      description,
      keywords,
      semanticKeywords,
      nationwide,
    });

    if (!result.configured) {
      return NextResponse.json({
        error: "O Serper ainda não está configurado. Abra Configurações, cole a chave da API e ative a conexão.",
        code: "TALENT_SOURCE_NOT_CONFIGURED",
        completed: false,
        candidates: [],
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
        providers: result.providers,
        strategies,
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      completed: true,
      candidates: result.candidates,
      total: result.candidates.length,
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
