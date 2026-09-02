import { NextResponse } from 'next/server';
import { authorizeAdminWrite, isAdminKeyConfigured } from '@/lib/admin-auth';
import { getGupyToken, saveGupyToken, testGupyToken } from '@/lib/gupy-config';

export async function GET() {
  try {
    const saved = await getGupyToken();
    return NextResponse.json({ configured: Boolean(saved), updatedAt: saved?.updatedAt || null, adminKeyConfigured: isAdminKeyConfigured() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 }); }
}

export async function POST(request: Request) {
  const authorized = authorizeAdminWrite(request);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error, code: authorized.code }, { status: authorized.status });
  }
  try {
    const body = await request.json() as { token?: string; action?: string };
    const token = body.token?.trim();
    if (!token || token.length < 20) return NextResponse.json({ error: 'Informe um token Gupy válido.' }, { status: 400 });
    await testGupyToken(token);
    if (body.action === 'save') await saveGupyToken(token);
    return NextResponse.json({ ok: true, saved: body.action === 'save', message: body.action === 'save' ? 'Token testado e salvo com segurança.' : 'Conexão com a Gupy confirmada.' });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 }); }
}
