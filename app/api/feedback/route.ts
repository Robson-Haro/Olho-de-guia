import { NextResponse } from "next/server";
import { isMemoryConfigured, readRoleMemory, recordFeedback, type RoleDecision } from "@/lib/role-memory";

/**
 * Registro da decisão do recrutador — a porta de entrada do aprendizado.
 *
 * Cada "aprovar" ou "descartar" na tela chega aqui, é gravado e reagrega a
 * memória daquela família de vaga na mesma chamada. A resposta devolve a
 * memória atualizada, para que a tela mostre imediatamente o que o Eureka
 * acabou de aprender — o recrutador vê o efeito da própria decisão em vez de
 * alimentar uma caixa-preta.
 */

const DECISIONS: RoleDecision[] = ["aprovado", "descartado", "contratado"];

function clean(value: unknown, limit = 400) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export async function GET(request: Request) {
  const roleKey = clean(new URL(request.url).searchParams.get("roleKey"), 80);
  if (!roleKey) return NextResponse.json({ error: "Informe a chave da vaga." }, { status: 400 });
  return NextResponse.json({
    ok: true,
    configured: isMemoryConfigured(),
    memory: await readRoleMemory(roleKey),
  });
}

export async function POST(request: Request) {
  try {
    if (!isMemoryConfigured()) {
      return NextResponse.json({
        error: "A memória de vagas depende do Supabase configurado no servidor.",
        code: "MEMORY_NOT_CONFIGURED",
      }, { status: 503 });
    }
    const body = await request.json() as Record<string, unknown>;
    const decision = clean(body.decision, 20) as RoleDecision;
    if (!DECISIONS.includes(decision)) {
      return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
    }
    const roleKey = clean(body.roleKey, 80);
    const profileUrl = clean(body.profileUrl, 400);
    if (!roleKey || !profileUrl) {
      return NextResponse.json({ error: "Vaga e perfil são obrigatórios." }, { status: 400 });
    }

    const memory = await recordFeedback({
      roleKey,
      roleLabel: clean(body.roleLabel, 160),
      profileUrl,
      candidateTitle: clean(body.candidateTitle, 200),
      company: clean(body.company, 160),
      summary: clean(body.summary, 600),
      decision,
      reason: clean(body.reason, 400),
      decidedBy: clean(body.decidedBy, 160),
    });

    if (!memory) {
      return NextResponse.json({ error: "Não foi possível registrar a decisão." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, memory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao registrar a decisão." },
      { status: 500 },
    );
  }
}
