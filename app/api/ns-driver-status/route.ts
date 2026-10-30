import { NextResponse } from "next/server";

import { statusNsValido } from "../../lib/nsDriverStatus";
import { gravarStatusNs, lerStatusNsDoDia } from "../../lib/nsDriverStatusDados";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

export async function GET(req: Request) {
  const data = texto(new URL(req.url).searchParams.get("data"), 10);
  if (!DATA_BR.test(data)) return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, status: await lerStatusNsDoDia(data) });
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
  const rota = texto(corpo.rota, 120);
  const rotaId = texto(corpo.rotaId, 40);
  const autor = texto(corpo.autor, 80);
  if (!DATA_BR.test(data)) return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
  if (!rota && !rotaId) return NextResponse.json({ ok: false, erro: "Rota sem nome nem ID." }, { status: 400 });
  if (!autor) return NextResponse.json({ ok: false, erro: 'Preencha "Seu nome" nos filtros para assinar.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, status: await gravarStatusNs(data, rota, rotaId, statusNsValido(corpo.status), autor) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
