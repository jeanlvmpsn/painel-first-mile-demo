import { NextResponse } from "next/server";

import { esquecerLeitura, gravarTratativa, type NovaTratativa } from "../../lib/monitorD0Dados";
import { limparCacheSheets } from "../../lib/sheets";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

export async function POST(req: Request) {
  let corpo: Partial<NovaTratativa>;
  try {
    corpo = (await req.json()) as Partial<NovaTratativa>;
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }
  const t: NovaTratativa = {
    data: texto(corpo.data, 10),
    chave: texto(corpo.chave, 120),
    rota: texto(corpo.rota, 120),
    idParada: texto(corpo.idParada, 80),
    parada: texto(corpo.parada, 200),
    tratado: corpo.tratado === true,
    comentario: texto(corpo.comentario, 1000),
    autor: texto(corpo.autor, 80),
    motivoImpacto: texto(corpo.motivoImpacto, 80),
    excluido: corpo.excluido === true,
    tratativaHxh: texto(corpo.tratativaHxh, 80),
  };
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(t.data) || !t.chave) {
    return NextResponse.json({ ok: false, erro: "Data ou chave invalida." }, { status: 400 });
  }
  try {
    const r = await gravarTratativa(t);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function PUT() {
  esquecerLeitura();
  limparCacheSheets();
  return NextResponse.json({ ok: true });
}
