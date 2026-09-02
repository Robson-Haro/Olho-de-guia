import { NextResponse } from "next/server";
import { reviewCandidates } from "@/lib/ai-reader";
import { estimateCostUsd, isLlmConfigured } from "@/lib/llm";

/**
 * Parecer da camada de leitura sobre os perfis do topo.
 *
 * Regra de ouro desta rota: ela só recebe perfis que as regras de aderência JÁ
 * aprovaram. O modelo pode confirmar, rebaixar ou recomendar descarte — nunca
 * promover alguém que foi reprovado, porque esse alguém nem chega aqui. A
 * leitura melhora a ordem de uma lista já confiável; ela não é uma segunda
 * chance para o perfil errado.
 */

const MAX_REVIEWED = Math.max(5, Math.min(40, Number(process.env.EUREKA_LLM_REVIEW_LIMIT) || 25));

type ReviewRequest = {
  title?: string;
  description?: string;
  candidates?: Array<{
    id?: string;
    title?: string;
    company?: string;
    summary?: string;
    city?: string;
    state?: string;
  }>;
};

function clean(value: unknown, limit = 400) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function POST(request: Request) {
  try {
    if (!isLlmConfigured()) {
      // Não é erro: é o estado normal de quem ainda não ativou a leitura.
      return NextResponse.json({ ok: true, configured: false, verdicts: [] });
    }
    const body = await request.json() as ReviewRequest;
    const title = clean(body.title, 150);
    const description = clean(body.description, 12000);
    if (!title || !description) {
      return NextResponse.json({ error: "Título e descrição da vaga são obrigatórios." }, { status: 400 });
    }
    const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
      .map((candidate) => ({
        id: clean(candidate?.id, 400),
        title: clean(candidate?.title, 200),
        company: clean(candidate?.company, 160),
        summary: clean(candidate?.summary, 600),
        location: [clean(candidate?.city, 100), clean(candidate?.state, 60)].filter(Boolean).join(", "),
      }))
      .filter((candidate) => candidate.id)
      .slice(0, MAX_REVIEWED);

    if (!candidates.length) {
      return NextResponse.json({ ok: true, configured: true, verdicts: [] });
    }

    const result = await reviewCandidates({ title, description }, candidates);
    if (!result) {
      return NextResponse.json({
        ok: true,
        configured: true,
        applied: false,
        verdicts: [],
        message: "A leitura por IA não respondeu a tempo. A lista segue com a avaliação determinística.",
      });
    }

    // O modelo pode devolver ids que não enviamos; só aceitamos os nossos.
    const valid = new Set(candidates.map((candidate) => candidate.id));
    const verdicts = result.data.filter((verdict) => valid.has(verdict.id));

    return NextResponse.json({
      ok: true,
      configured: true,
      applied: verdicts.length > 0,
      reviewed: candidates.length,
      verdicts,
      costUsd: Number(estimateCostUsd(result.inputTokens, result.outputTokens).toFixed(5)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar os pareceres." },
      { status: 500 },
    );
  }
}
