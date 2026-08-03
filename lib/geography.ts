export type CountryProfile = {
  code: string;
  name: string;
  aliases: string[];
  searchLanguage: string;
  subdivisionLabel: string;
};

// ISO 3166-1 alpha-2. Os nomes são exibidos em português pelo Intl.DisplayNames,
// enquanto os perfis abaixo refinam idioma, nomenclatura regional e sinônimos.
export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

const PROFILES: Record<string, Partial<CountryProfile>> = {
  AR: { name: "Argentina", aliases: ["Argentina"], searchLanguage: "es", subdivisionLabel: "Província" },
  BO: { name: "Bolívia", aliases: ["Bolívia", "Bolivia"], searchLanguage: "es", subdivisionLabel: "Departamento" },
  BR: { name: "Brasil", aliases: ["Brasil", "Brazil"], searchLanguage: "pt-br", subdivisionLabel: "Estado" },
  CA: { name: "Canadá", aliases: ["Canadá", "Canada"], searchLanguage: "en", subdivisionLabel: "Província ou território" },
  CH: { name: "Suíça", aliases: ["Suíça", "Switzerland", "Schweiz", "Suisse"], searchLanguage: "de", subdivisionLabel: "Cantão" },
  CL: { name: "Chile", aliases: ["Chile"], searchLanguage: "es", subdivisionLabel: "Região" },
  CN: { name: "China", aliases: ["China", "中国"], searchLanguage: "zh-cn", subdivisionLabel: "Província ou região" },
  CO: { name: "Colômbia", aliases: ["Colômbia", "Colombia"], searchLanguage: "es", subdivisionLabel: "Departamento" },
  DE: { name: "Alemanha", aliases: ["Alemanha", "Germany", "Deutschland"], searchLanguage: "de", subdivisionLabel: "Estado" },
  EC: { name: "Equador", aliases: ["Equador", "Ecuador"], searchLanguage: "es", subdivisionLabel: "Província" },
  ES: { name: "Espanha", aliases: ["Espanha", "Spain", "España"], searchLanguage: "es", subdivisionLabel: "Comunidade ou província" },
  FR: { name: "França", aliases: ["França", "France"], searchLanguage: "fr", subdivisionLabel: "Região ou departamento" },
  GB: { name: "Reino Unido", aliases: ["Reino Unido", "United Kingdom", "UK", "Great Britain"], searchLanguage: "en", subdivisionLabel: "País ou região" },
  IT: { name: "Itália", aliases: ["Itália", "Italy", "Italia"], searchLanguage: "it", subdivisionLabel: "Região ou província" },
  MX: { name: "México", aliases: ["México", "Mexico"], searchLanguage: "es", subdivisionLabel: "Estado" },
  NL: { name: "Países Baixos", aliases: ["Países Baixos", "Netherlands", "Nederland", "Holanda"], searchLanguage: "nl", subdivisionLabel: "Província" },
  PA: { name: "Panamá", aliases: ["Panamá", "Panama"], searchLanguage: "es", subdivisionLabel: "Província" },
  PE: { name: "Peru", aliases: ["Peru", "Perú"], searchLanguage: "es", subdivisionLabel: "Região ou departamento" },
  PY: { name: "Paraguai", aliases: ["Paraguai", "Paraguay"], searchLanguage: "es", subdivisionLabel: "Departamento" },
  PT: { name: "Portugal", aliases: ["Portugal"], searchLanguage: "pt-pt", subdivisionLabel: "Distrito ou região" },
  SA: { name: "Arábia Saudita", aliases: ["Arábia Saudita", "Saudi Arabia", "المملكة العربية السعودية"], searchLanguage: "ar", subdivisionLabel: "Província" },
  US: { name: "Estados Unidos", aliases: ["Estados Unidos", "United States", "USA", "US"], searchLanguage: "en", subdivisionLabel: "Estado" },
  UY: { name: "Uruguai", aliases: ["Uruguai", "Uruguay"], searchLanguage: "es", subdivisionLabel: "Departamento" },
  VE: { name: "Venezuela", aliases: ["Venezuela"], searchLanguage: "es", subdivisionLabel: "Estado" },
};

const SPANISH_COUNTRIES = new Set([
  "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "ES", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE",
]);
const FRENCH_COUNTRIES = new Set(["BE", "BJ", "BF", "BI", "CD", "CF", "CG", "CI", "CM", "DJ", "FR", "GA", "GN", "HT", "LU", "MC", "ML", "NE", "RE", "RW", "SN", "TG"]);

const displayNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
  ? new Intl.DisplayNames(["pt-BR"], { type: "region" })
  : null;

function displayCountryName(code: string) {
  return displayNames?.of(code) || code;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeGeographyText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";
}

export function getCountryProfile(value: string): CountryProfile {
  const code = COUNTRY_CODES.includes(value.toUpperCase() as (typeof COUNTRY_CODES)[number])
    ? value.toUpperCase()
    : "BR";
  const configured = PROFILES[code] || {};
  const name = configured.name || displayCountryName(code);
  const searchLanguage = configured.searchLanguage
    || (SPANISH_COUNTRIES.has(code) ? "es" : FRENCH_COUNTRIES.has(code) ? "fr" : "en");
  return {
    code,
    name,
    aliases: unique([name, ...(configured.aliases || [])]),
    searchLanguage,
    subdivisionLabel: configured.subdivisionLabel || "Estado, província ou região",
  };
}

export const COUNTRY_OPTIONS = COUNTRY_CODES
  .map((code) => ({ code, name: getCountryProfile(code).name }))
  .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

export function findCountryCode(value: unknown, fallback = "BR") {
  const normalized = normalizeGeographyText(value);
  if (!normalized) return fallback;
  const directCode = normalized.toUpperCase();
  if (COUNTRY_CODES.includes(directCode as (typeof COUNTRY_CODES)[number])) return directCode;
  return COUNTRY_CODES.find((code) => {
    const profile = getCountryProfile(code);
    return profile.aliases.some((alias) => normalizeGeographyText(alias) === normalized);
  }) || fallback;
}

export function geographicLocationLabel(input: {
  countryCode: string;
  subdivision?: string;
  cities?: string[];
  countrywide?: boolean;
}) {
  const profile = getCountryProfile(input.countryCode);
  if (input.countrywide) return `Todo o país · ${profile.name}`;
  const cities = (input.cities || []).map((city) => city.trim()).filter(Boolean);
  return [cities.join(", "), input.subdivision?.trim(), profile.name].filter(Boolean).join(" · ");
}
