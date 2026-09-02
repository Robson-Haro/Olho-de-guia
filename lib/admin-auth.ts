import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Proteção das rotas administrativas.
 *
 * As rotas `/api/admin/*` gravam a chave do Serper e o token da Gupy e não
 * tinham nenhuma autenticação: quem conhecesse a URL do sistema em produção
 * podia sobrescrever as duas credenciais. A criptografia AES-256 protege os
 * dados guardados no Supabase, mas não impede a escrita por um terceiro.
 *
 * A solução definitiva é o Supabase Auth restrito ao domínio corporativo, que
 * já está na lista de pendências. Esta trava é a proteção imediata e foi
 * desenhada para sair do caminho quando aquela chegar.
 *
 * Comportamento:
 * - LEITURA de status continua aberta. Ela não expõe credencial nenhuma, só
 *   informa se a integração está configurada, e é o que a tela usa ao abrir.
 * - ESCRITA exige o cabeçalho `x-eureka-admin-key` igual à variável de
 *   ambiente `EUREKA_ADMIN_KEY`.
 * - Sem a variável configurada, a escrita é NEGADA com instrução explícita.
 *   Falhar fechado é deliberado: a alternativa seria um sistema que parece
 *   protegido e não está.
 */
export const ADMIN_KEY_HEADER = "x-eureka-admin-key";

export type AdminAuthResult = { ok: true } | { ok: false; status: number; error: string; code: string };

function equals(left: string, right: string) {
  // Comparação de tempo constante sobre o resumo: o comprimento das duas
  // entradas deixa de vazar pelo tempo de resposta.
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

export function authorizeAdminWrite(request: Request): AdminAuthResult {
  const expected = (process.env.EUREKA_ADMIN_KEY || "").trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "ADMIN_KEY_NOT_CONFIGURED",
      error: "Defina a variável de ambiente EUREKA_ADMIN_KEY na Vercel para liberar a gravação de credenciais. Sem ela, qualquer pessoa com a URL poderia sobrescrever as chaves.",
    };
  }
  if (expected.length < 16) {
    return {
      ok: false,
      status: 503,
      code: "ADMIN_KEY_TOO_SHORT",
      error: "A variável EUREKA_ADMIN_KEY precisa ter ao menos 16 caracteres.",
    };
  }
  const provided = (request.headers.get(ADMIN_KEY_HEADER) || "").trim();
  if (!provided || !equals(provided, expected)) {
    return {
      ok: false,
      status: 401,
      code: "ADMIN_KEY_INVALID",
      error: "Senha administrativa ausente ou incorreta.",
    };
  }
  return { ok: true };
}

export function isAdminKeyConfigured() {
  return (process.env.EUREKA_ADMIN_KEY || "").trim().length >= 16;
}
