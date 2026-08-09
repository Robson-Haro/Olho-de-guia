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
