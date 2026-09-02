import { NextResponse } from "next/server";
import { searchTalentSources } from "@/lib/talent-sources";
import { geographicLocationLabel, getCountryProfile } from "@/lib/geography";
import { isGenderKey } from "@/lib/gender-inference";
import { interpretJob, mergeVocabulary } from "@/lib/ai-reader";
import { estimateCostUsd, isLlmConfigured } from "@/lib/llm";
import { memorySignals, readRoleMemory, registerSearch, roleKeyFor } from "@/lib/role-memory";

type SearchRequest = {
  title?: string;
  marketSegment?: string;
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
  // Vocabulário produzido pelo léxico do motor Python. As duas camadas passam a
  // julgar sobre o MESMO conjunto de termos.
  roleCore?: string[];
  domainConcepts?: string[][];
  levelTerms?: string[];
  nationwide?: boolean;
  maxCandidates?: number;
  strictRequiredKeywords?: boolean;
  genderKey?: string;
  includeUnknownGender?: boolean;
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
    const marketSegment = clean(body.marketSegment, 80);
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
      ? body.titleVariants.map((item) => clean(item, 150)).filter(Boolean).slice(0, 16)
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
    const roleCore = Array.isArray(body.roleCore)
      ? body.roleCore.map((item) => clean(item, 80)).filter(Boolean).slice(0, 80)
      : [];
    const levelTerms = Array.isArray(body.levelTerms)
      ? body.levelTerms.map((item) => clean(item, 40)).filter(Boolean).slice(0, 12)
      : [];
    const domainConcepts = Array.isArray(body.domainConcepts)
      ? body.domainConcepts
          .filter((group): group is string[] => Array.isArray(group))
          .map((group) => group.map((item) => clean(item, 80)).filter(Boolean).slice(0, 12))
          .filter((group) => group.length)
          .slice(0, 14)
      : [];

    if (!title || !description || (!countrywide && !cities.length)) {
      return NextResponse.json(
        { error: "Título, descrição, país e ao menos uma cidade são obrigatórios, exceto em buscas para todo o país." },
        { status: 400 },
      );
    }

    // Chave de gênero. Valor desconhecido é tratado como desligado: nenhuma
    // busca deve aplicar um recorte que o servidor não reconhece.
    const genderKey = isGenderKey(body.genderKey) ? body.genderKey : "";

    // ---------------------------------------------------------------- //
    // ETAPA DE LEITURA (Onda 2)
    //
    // O modelo lê a vaga e devolve vocabulário de mercado que o léxico não
    // cobre. O resultado é SOMADO ao do léxico, nunca substitui: se não houver
    // chave, se a rede falhar ou se a resposta vier inválida, a busca segue
    // exatamente como na Onda 1.
    // ---------------------------------------------------------------- //
    const reading = await interpretJob(title, description);
    const vocabulary = mergeVocabulary(
      { roleCore, domainConcepts, titleVariants, levelTerms },
      reading?.data || null,
    );

    // ---------------------------------------------------------------- //
    // MEMÓRIA DA VAGA
    //
    // A chave deriva do núcleo funcional, sem hierarquia: "Supervisor de
    // Abate" e "Coordenador de Abate" compartilham o que a casa já aprendeu.
    // ---------------------------------------------------------------- //
    const roleKey = roleKeyFor(title, vocabulary.roleCore);
    const memory = await readRoleMemory(roleKey);
    const learned = memorySignals(memory);
    void registerSearch(roleKey, title);

    const geography = { countryCode, subdivision, cities, countrywide };
    const strategies = manualStrategies(title, geography, keywords);
    const result = await searchTalentSources({
      title,
      marketSegment,
      countryCode,
      country,
      subdivision,
      cities,
      description,
      keywords,
      semanticKeywords,
      requiredKeywordConcepts,
      roleCore: vocabulary.roleCore,
      domainConcepts: vocabulary.domainConcepts,
      levelTerms: vocabulary.levelTerms,
      titleVariants: vocabulary.titleVariants,
      learnedTitles: learned.learnedTitles,
      learnedTerms: learned.learnedTerms,
      learnedCompanies: learned.learnedCompanies,
      demotedTitles: learned.demotedTitles,
      countrywide,
      maxCandidates,
      strictRequiredKeywords: body.strictRequiredKeywords === true,
      genderKey,
      includeUnknownGender: body.includeUnknownGender === true,
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
      mappedCompanies: result.mappedCompanies,
      genderAudit: result.genderAudit,
      strategies,
      // Vocabulário efetivamente usado, devolvido para que o motor Python
      // ranqueie sobre exatamente o mesmo conjunto de termos.
      vocabulary: {
        roleCore: vocabulary.roleCore,
        domainConcepts: vocabulary.domainConcepts,
        titleVariants: vocabulary.titleVariants,
        levelTerms: vocabulary.levelTerms,
      },
      aiReading: {
        configured: isLlmConfigured(),
        applied: vocabulary.aiApplied,
        notes: reading?.data.notes || "",
        addedTerms: vocabulary.aiApplied
          ? Math.max(0, vocabulary.roleCore.length - roleCore.length)
            + Math.max(0, vocabulary.domainConcepts.length - domainConcepts.length)
            + Math.max(0, vocabulary.titleVariants.length - titleVariants.length)
          : 0,
        costUsd: reading ? Number(estimateCostUsd(reading.inputTokens, reading.outputTokens).toFixed(5)) : 0,
      },
      memory: {
        roleKey,
        roleLabel: title,
        active: learned.active,
        searchCount: memory.searchCount,
        approvedCount: memory.approvedCount,
        discardedCount: memory.discardedCount,
        hiredCount: memory.hiredCount,
        learnedTitles: learned.learnedTitles,
        learnedTerms: learned.learnedTerms,
        learnedCompanies: learned.learnedCompanies,
        demotedTitles: learned.demotedTitles,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível executar a busca." },
      { status: 500 },
    );
  }
}
