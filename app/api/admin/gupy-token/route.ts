import { NextResponse } from 'next/server';
import { getGupyToken, isAdminKeyValid, saveGupyToken, testGupyToken } from '@/lib/gupy-config';

function authorized(request: Request) { return isAdminKeyValid(request.headers.get('x-admin-key')); }

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Acesso administrativo não autorizado.' }, { status: 401 });
  try {
    const saved = await getGupyToken();
    return NextResponse.json({ configured: Boolean(saved), updatedAt: saved?.updatedAt || null });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Acesso administrativo não autorizado.' }, { status: 401 });
  try {
    const body = await request.json() as { token?: string; action?: string };
    const token = body.token?.trim();
    if (!token || token.length < 20) return NextResponse.json({ error: 'Informe um token Gupy válido.' }, { status: 400 });
    await testGupyToken(token);
    if (body.action === 'save') await saveGupyToken(token);
    return NextResponse.json({ ok: true, saved: body.action === 'save', message: body.action === 'save' ? 'Token testado e salvo com segurança.' : 'Conexão com a Gupy confirmada.' });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 }); }
}
