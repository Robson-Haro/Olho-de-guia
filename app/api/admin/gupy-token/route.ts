import { NextResponse } from 'next/server';
import { getGupyToken, isAdminAccessConfigured, isAdminKeyValid, saveGupyToken, testGupyToken } from '@/lib/gupy-config';

function authorizationError(request: Request) {
  if (!isAdminAccessConfigured()) {
    return NextResponse.json(
      { error: 'A chave administrativa ainda não está disponível neste deploy. Confira ADMIN_ACCESS_KEY na Vercel e faça um novo deploy.' },
      { status: 503 }
    );
  }
  if (!isAdminKeyValid(request.headers.get('x-admin-key'))) {
    return NextResponse.json({ error: 'Chave administrativa incorreta.' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const errorResponse = authorizationError(request);
  if (errorResponse) return errorResponse;
  try {
    const saved = await getGupyToken();
    return NextResponse.json({ configured: Boolean(saved), updatedAt: saved?.updatedAt || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const errorResponse = authorizationError(request);
  if (errorResponse) return errorResponse;
  try {
    const body = await request.json() as { token?: string; action?: string };
    const token = body.token?.trim();
    if (!token || token.length < 20) return NextResponse.json({ error: 'Informe um token Gupy válido.' }, { status: 400 });
    await testGupyToken(token);
    if (body.action === 'save') await saveGupyToken(token);
    return NextResponse.json({
      ok: true,
      saved: body.action === 'save',
      message: body.action === 'save' ? 'Token testado e salvo com segurança.' : 'Conexão com a Gupy confirmada.'
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 });
  }
}
