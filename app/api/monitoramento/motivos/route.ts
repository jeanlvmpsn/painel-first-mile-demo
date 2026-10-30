import { NextResponse } from "next/server";

import { gravarMotivo } from "../../../lib/monitorD0Dados";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let corpo: { motivo?: unknown; autor?: unknown };
  try {
    corpo = (await req.json()) as { motivo?: unknown; autor?: unknown };
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }
  const motivo = String(corpo.motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const autor = String(corpo.autor ?? "").trim().slice(0, 80);
  if (!motivo) return NextResponse.json({ ok: false, erro: "Motivo vazio." }, { status: 400 });
  try {
    await gravarMotivo(motivo, autor);
    return NextResponse.json({ ok: true, motivo });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
