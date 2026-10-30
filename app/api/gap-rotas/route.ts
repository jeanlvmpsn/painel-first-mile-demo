import { NextResponse } from "next/server";

import { gravarAjusteGap } from "../../lib/gapRotasDados";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;
const ACOES = new Set(["incluir", "excluir", "auto"]);

export async function POST(req: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }
  const data = texto(corpo.data, 10);
  const a = {
    rota: texto(corpo.rota, 80),
    idParada: texto(corpo.idParada, 80),
    acao: texto(corpo.acao, 10) as "incluir" | "excluir" | "auto",
    autor: texto(corpo.autor, 80),
  };
  if (!DATA_BR.test(data)) return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
  if (!a.rota) return NextResponse.json({ ok: false, erro: "Rota vazia." }, { status: 400 });
  if (!ACOES.has(a.acao)) return NextResponse.json({ ok: false, erro: "Acao invalida." }, { status: 400 });
  if (!a.autor) return NextResponse.json({ ok: false, erro: 'Preencha "Seu nome" para assinar o ajuste.' }, { status: 400 });
  try {
    await gravarAjusteGap(data, a);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
