/**
 * Gera uma chave estável para perfis públicos do LinkedIn.
 *
 * O Google pode devolver o mesmo perfil com `www`, subdomínio regional,
 * parâmetros de rastreamento ou barra final. Para uma nova rodada de busca,
 * essas variações não podem fazer a mesma pessoa voltar para a lista.
 */
export function canonicalLinkedInProfileUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.toLowerCase() !== "in" || !parts[1]) return "";
    return `https://www.linkedin.com/in/${parts[1].toLowerCase()}`;
  } catch {
    return "";
  }
}
