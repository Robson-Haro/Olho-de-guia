import { NextResponse } from "next/server";
import { authorizeAdminWrite, isAdminKeyConfigured } from "@/lib/admin-auth";
import {
  getTalentSourceStatuses,
  isTalentProvider,
  saveTalentSourceKey,
  testTalentSourceKey,
} from "@/lib/talent-sources";

export async function GET() {
  try {
    // A leitura de status não expõe credencial: informa apenas se a
    // integração está ativa. `adminKeyConfigured` permite que a tela avise
    // quando a senha administrativa ainda não foi definida na Vercel.
    return NextResponse.json({
      sources: await getTalentSourceStatuses(),
      adminKeyConfigured: isAdminKeyConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const authorized = authorizeAdminWrite(request);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error, code: authorized.code }, { status: authorized.status });
  }
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
