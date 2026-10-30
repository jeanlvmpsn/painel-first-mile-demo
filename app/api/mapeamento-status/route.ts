import { NextResponse } from "next/server";

import { statusMapaValido } from "../../lib/mapeamentoStatus";
import { gravarStatusDoMapa, lerStatusDoMapa } from "../../lib/mapeamentoStatusDados";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

export async function GET(req: Request) {
  const data = texto(new URL(req.url).searchParams.get("data"), 10);
  if (!DATA_BR.test(data)) return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, status: await lerStatusDoMapa(data) });
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
  const data = texto(corpo.data, 10);
  const idParada = texto(corpo.idParada, 80);
  const autor = texto(corpo.autor, 80);
  if (!DATA_BR.test(data)) return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
  if (!idParada) return NextResponse.json({ ok: false, erro: "Ponto sem ID." }, { status: 400 });
  if (!autor) return NextResponse.json({ ok: false, erro: 'Preencha "Seu nome" nos filtros para assinar.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, status: await gravarStatusDoMapa(data, idParada, statusMapaValido(corpo.status), autor) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
