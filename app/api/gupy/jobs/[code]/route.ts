import { NextResponse } from 'next/server';
import { getGupyToken } from '@/lib/gupy-config';

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d+$/.test(code)) return NextResponse.json({ error: 'Código de vaga inválido.' }, { status: 400 });
  try {
    const saved = await getGupyToken();
    if (!saved) return NextResponse.json({ error: 'Cadastre o token Gupy em Configurações.' }, { status: 503 });
    const base = process.env.GUPY_API_BASE_URL || 'https://api.gupy.io/api/v1';
    const response = await fetch(`${base}/jobs/${code}`, { headers: { Authorization: `Bearer ${saved.token}`, 'Content-Type': 'application/json' }, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) return NextResponse.json({ error: response.status === 404 ? 'Vaga não encontrada na Gupy.' : `Não foi possível importar a vaga (Gupy ${response.status}).` }, { status: response.status });
    return NextResponse.json({ code, job: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Erro interno.' }, { status: 500 }); }
}
