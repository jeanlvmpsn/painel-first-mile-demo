import { NextResponse } from "next/server";

import { gravarComentarioPd, lerComentariosDoPd } from "../../lib/comentariosPdDados";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, comentarios: await lerComentariosDoPd() });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }
  const n = {
    data: texto(corpo.data, 10),
    idParada: texto(corpo.idParada, 80),
    ponto: texto(corpo.ponto, 200),
    cluster: texto(corpo.cluster, 20),
    obs: texto(corpo.obs, 40),
    comentario: texto(corpo.comentario, 2000),
    autor: texto(corpo.autor, 80),
  };
  if (!DATA_BR.test(n.data)) return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
  if (!n.idParada) return NextResponse.json({ ok: false, erro: "Ponto sem ID." }, { status: 400 });
  if (!n.autor) return NextResponse.json({ ok: false, erro: 'Preencha "Seu nome" nos filtros para assinar.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, comentarios: await gravarComentarioPd(n) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
