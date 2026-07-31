import { NextResponse } from 'next/server';

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d+$/.test(code)) return NextResponse.json({ error: 'Código de vaga inválido.' }, { status: 400 });
  return NextResponse.json({ code, configured: false, message: 'Cadastre o token Gupy na área administrativa para ativar a importação.' }, { status: 503 });
}
