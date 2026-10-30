import { NextResponse } from "next/server";

import { gravarNomeDedicada } from "../../../lib/dedicadasDados";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let corpo: { chave?: unknown; ids?: unknown; apelido?: unknown; autor?: unknown };
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }
  const chave = String(corpo.chave ?? "").trim().slice(0, 500);
  const ids = (Array.isArray(corpo.ids) ? corpo.ids : []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 50);
  const apelido = String(corpo.apelido ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const autor = String(corpo.autor ?? "").trim().slice(0, 80);
  if (!chave) return NextResponse.json({ ok: false, erro: "Chave vazia." }, { status: 400 });
  try {
    await gravarNomeDedicada(chave, ids, apelido, autor);
    return NextResponse.json({ ok: true, apelido });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
