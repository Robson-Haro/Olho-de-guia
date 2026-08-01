import { NextResponse } from "next/server";
import {
  getTalentSourceStatuses,
  isTalentProvider,
  saveTalentSourceKey,
  testTalentSourceKey,
} from "@/lib/talent-sources";

export async function GET() {
  try {
    return NextResponse.json({ sources: await getTalentSourceStatuses() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { provider?: unknown; apiKey?: unknown; action?: unknown };
    if (!isTalentProvider(body.provider)) {
      return NextResponse.json({ error: "Fonte de talentos inválida." }, { status: 400 });
    }
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (apiKey.length < 12) {
      return NextResponse.json({ error: "Informe uma chave de API válida." }, { status: 400 });
    }
    if (body.action !== "test" && body.action !== "save") {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    await testTalentSourceKey(body.provider, apiKey);
    if (body.action === "save") await saveTalentSourceKey(body.provider, apiKey);
    return NextResponse.json({
      ok: true,
      saved: body.action === "save",
      message: body.action === "save"
        ? "Fonte testada, criptografada e ativada."
        : "Conexão confirmada com a fonte de talentos.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
