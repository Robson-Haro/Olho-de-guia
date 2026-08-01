import { NextResponse } from "next/server";

type SearchRequest = {
  title?: string;
  city?: string;
  additionalCity?: string;
  description?: string;
  keywords?: string[];
};

function clean(value: unknown, limit = 500) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as SearchRequest;
    const title = clean(body.title, 150);
    const city = clean(body.city, 100);
    const additionalCity = clean(body.additionalCity, 100);
    const keywords = Array.isArray(body.keywords) ? body.keywords.map((item) => clean(item, 80)).filter(Boolean).slice(0, 4) : [];
    if (!title || !city || !clean(body.description, 10000)) {
      return NextResponse.json({ error: "Título, descrição e cidade são obrigatórios." }, { status: 400 });
    }

    const locations = [city, additionalCity].filter(Boolean).map((item) => `"${item}"`).join(" OR ");
    const skills = keywords.map((item) => `"${item}"`).join(" AND ");
    const base = [`"${title}"`, skills, `(${locations})`].filter(Boolean).join(" AND ");
    const strategies = [
      { label: "LinkedIn — perfis", query: `site:linkedin.com/in ${base}`, engine: "google" },
      { label: "Busca ampla no Google", query: `${base} (currículo OR resume OR perfil)`, engine: "google" },
      { label: "LinkedIn — variação regional", query: `site:br.linkedin.com/in "${title}" (${locations}) ${skills}`, engine: "google" },
      { label: "Busca complementar no Bing", query: `${base} perfil profissional`, engine: "bing" },
    ].map(({ label, query, engine }) => ({
      label,
      query,
      url: engine === "bing" ? `https://www.bing.com/search?q=${encodeURIComponent(query)}` : `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    }));
    return NextResponse.json({ ok: true, strategies });
  } catch {
    return NextResponse.json({ error: "Não foi possível montar a busca." }, { status: 400 });
  }
}
