/**
 * Orçamento de palavras da consulta ao Google.
 *
 * O Google descarta silenciosamente o excedente de uma consulta longa. Com
 * título + 10 sinônimos da palavra-chave + 12 empresas + 8 cidades, o final da
 * consulta — justamente a geografia — era ignorado, e a busca voltava com
 * profissionais certos em países errados. Os blocos chegam aqui em ordem de
 * prioridade e o primeiro que não couber é descartado INTEIRO, preservando a
 * validade sintática dos grupos OR.
 */
export const MAX_QUERY_WORDS = 30;

export function boundedSearchQuery(parts: string[], limit = MAX_QUERY_WORDS) {
  const accepted: string[] = [];
  let words = 0;
  for (const part of parts) {
    const block = String(part || "").replace(/\s+/g, " ").trim();
    if (!block) continue;
    const cost = block.split(" ").length;
    if (words + cost > limit) continue;
    accepted.push(block);
    words += cost;
  }
  return accepted.join(" ");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cleanLocation(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[,;|·\-\s]+|[,;|·\-\s]+$/g, "").trim();
}

export function extractExplicitCurrentLocation(value: string) {
  const match = value.trim().match(/\b(?:location|localiza(?:ç|c)[aã]o|ubicaci[oó]n)\s*:\s*([^·;|\n]{2,100})/i);
  return match ? cleanLocation(match[1].replace(/\.{3,}.*$/, "")) : "";
}

export function extractExcludedCandidateNames(description: string) {
  const section = description.trim().match(
    /\bexcluir\s+(?:os\s+)?candidatos?[^:\n]*:\s*([^\.\n]+)/i,
  )?.[1] || "";
  if (!section) return [] as string[];
  return [...new Set(
    section
      .split(/\s*(?:,|;|\be\b|\band\b|\by\b)\s*/i)
      .map((name) => name.replace(/^[\s:–—-]+|[\s:–—-]+$/g, "").trim())
      .filter((name) => name.split(/\s+/).length >= 2 && name.length <= 100),
  )];
}

export function isExcludedCandidateName(name: string, description: string) {
  const normalizedName = normalize(name).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return extractExcludedCandidateNames(description).some((excluded) => {
    const normalizedExcluded = normalize(excluded).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    return normalizedExcluded === normalizedName;
  });
}
