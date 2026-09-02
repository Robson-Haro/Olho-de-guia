/**
 * Camada de leitura do Eureka — cliente neutro de provedor.
 *
 * Três princípios governam este arquivo:
 *
 * 1. DEGRADAÇÃO SEGURA. Sem chave configurada, sem rede, com erro do provedor
 *    ou com resposta inválida, tudo devolve `null` e o sistema segue exatamente
 *    como antes, decidindo pelo léxico. A leitura por modelo AMPLIA o que o
 *    Eureka enxerga; ela nunca é pré-requisito para a busca funcionar.
 *
 * 2. A CHAVE NUNCA SAI DO SERVIDOR. Nenhuma variável aqui é `NEXT_PUBLIC_`.
 *
 * 3. TEXTO DE TERCEIRO É DADO, NUNCA INSTRUÇÃO. Descrições de vaga e trechos de
 *    perfil do LinkedIn são conteúdo não confiável: qualquer um pode escrever
 *    "ignore as instruções anteriores" no próprio perfil. Todo conteúdo externo
 *    entra delimitado e o sistema instrui o modelo a tratá-lo como dado.
 */

export type LlmProvider = "anthropic" | "openai" | "compatible";

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxOutputTokens: number;
  timeoutMs: number;
};

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  // Mais barato e mais rápido da linha, suficiente para extração estruturada.
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-5.4-nano",
  compatible: "",
};

const DEFAULT_BASE_URLS: Record<LlmProvider, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
  compatible: "",
};

function readProvider(): LlmProvider {
  const value = (process.env.EUREKA_LLM_PROVIDER || "anthropic").trim().toLowerCase();
  return value === "openai" || value === "compatible" ? value : "anthropic";
}

export function getLlmConfig(): LlmConfig | null {
  const apiKey = (process.env.EUREKA_LLM_API_KEY || "").trim();
  if (!apiKey) return null;
  const provider = readProvider();
  const baseUrl = (process.env.EUREKA_LLM_BASE_URL || "").trim() || DEFAULT_BASE_URLS[provider];
  const model = (process.env.EUREKA_LLM_MODEL || "").trim() || DEFAULT_MODELS[provider];
  // O modo "compatible" cobre qualquer serviço com a interface da OpenAI —
  // inclusive o endpoint compatível do Google e implantações internas. Nesse
  // modo, endereço e modelo são obrigatórios porque não há padrão a assumir.
  if (!model || !baseUrl) return null;
  return {
    provider,
    apiKey,
    model,
    baseUrl,
    maxOutputTokens: Math.max(512, Math.min(8192, Number(process.env.EUREKA_LLM_MAX_TOKENS) || 4096)),
    timeoutMs: Math.max(8000, Math.min(60000, Number(process.env.EUREKA_LLM_TIMEOUT_MS) || 30000)),
  };
}

export function isLlmConfigured() {
  return getLlmConfig() !== null;
}

/**
 * Delimita conteúdo de terceiro. O marcador aleatório impede que o próprio
 * texto feche o bloco e passe a ser lido como instrução.
 */
export function untrusted(label: string, content: string, limit = 12000) {
  const fence = `===${label.toUpperCase()}_${Math.random().toString(36).slice(2, 10)}===`;
  const safe = String(content || "").slice(0, limit).split(fence).join("");
  return `${fence}\n${safe}\n${fence}`;
}

function extractJson(text: string): unknown {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  // Modelos às vezes envolvem o JSON em cerca de código ou em uma frase.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

type ProviderResponse = { text: string; inputTokens: number; outputTokens: number };

async function callAnthropic(config: LlmConfig, system: string, user: string, signal: AbortSignal): Promise<ProviderResponse> {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxOutputTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal,
  });
  if (!response.ok) throw new Error(`LLM ${response.status}`);
  const payload = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: (payload.content || []).filter((part) => part?.type === "text").map((part) => part.text || "").join(""),
    inputTokens: payload.usage?.input_tokens || 0,
    outputTokens: payload.usage?.output_tokens || 0,
  };
}

async function callOpenAiShape(config: LlmConfig, system: string, user: string, signal: AbortSignal): Promise<ProviderResponse> {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      max_completion_tokens: config.maxOutputTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
  });
  if (!response.ok) throw new Error(`LLM ${response.status}`);
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: payload.choices?.[0]?.message?.content || "",
    inputTokens: payload.usage?.prompt_tokens || 0,
    outputTokens: payload.usage?.completion_tokens || 0,
  };
}

export type LlmResult<T> = { data: T; inputTokens: number; outputTokens: number } | null;

/**
 * Uma chamada ao modelo, com resposta em JSON validada pelo chamador.
 * Qualquer falha devolve `null` — jamais lança.
 */
export async function completeJson<T>(
  system: string,
  user: string,
  validate: (value: unknown) => T | null,
  config: LlmConfig | null = getLlmConfig(),
): Promise<LlmResult<T>> {
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = config.provider === "anthropic"
      ? await callAnthropic(config, system, user, controller.signal)
      : await callOpenAiShape(config, system, user, controller.signal);
    const parsed = extractJson(response.text);
    if (parsed === null) return null;
    const data = validate(parsed);
    if (data === null) return null;
    return { data, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
  } catch {
    // Silêncio deliberado: a busca continua pelo caminho determinístico.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Custo estimado em dólares, para exibir a conta ao recrutador. */
export function estimateCostUsd(inputTokens: number, outputTokens: number) {
  const inputPerMillion = Number(process.env.EUREKA_LLM_INPUT_USD_PER_MTOK) || 1;
  const outputPerMillion = Number(process.env.EUREKA_LLM_OUTPUT_USD_PER_MTOK) || 5;
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}
