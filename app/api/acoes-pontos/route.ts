import { NextResponse } from "next/server";

import type { NovaAcao } from "../../lib/acoesPontos";
import {
  gravarAcaoPonto,
  gravarCausa,
  gravarResponsavel,
  lerAcoesPontos,
  lerCausas,
  lerResponsaveis,
} from "../../lib/acoesPontosDados";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

export async function GET() {
  try {
    const [acoes, causas, responsaveis] = await Promise.all([lerAcoesPontos(), lerCausas(), lerResponsaveis()]);
    return NextResponse.json({ ok: true, acoes, causas, responsaveis });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let corpo: Partial<NovaAcao> & { novaCausa?: string; novoResponsavel?: string };
  try {
    corpo = (await req.json()) as Partial<NovaAcao> & { novaCausa?: string; novoResponsavel?: string };
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }

  if (corpo.novaCausa !== undefined) {
    const causa = texto(corpo.novaCausa, 40);
    if (!causa) return NextResponse.json({ ok: false, erro: "Informe a causa." }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, causas: await gravarCausa(causa, texto(corpo.autor, 80)) });
    } catch (e) {
      return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
    }
  }

  if (corpo.novoResponsavel !== undefined) {
    const time = texto(corpo.novoResponsavel, 30);
    if (!time) return NextResponse.json({ ok: false, erro: "Informe o time." }, { status: 400 });
    try {
      return NextResponse.json({ ok: true, responsaveis: await gravarResponsavel(time, texto(corpo.autor, 80)) });
    } catch (e) {
      return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
    }
  }
  const n: NovaAcao = {
    idParada: texto(corpo.idParada, 80),
    ponto: texto(corpo.ponto, 200),
    cluster: texto(corpo.cluster, 20),
    categoria: texto(corpo.categoria, 40),
    responsavel: texto(corpo.responsavel, 30),
    status: texto(corpo.status, 40),
    idDirecional: texto(corpo.idDirecional, 80),
    nomeDirecional: texto(corpo.nomeDirecional, 200),
    comentario: texto(corpo.comentario, 2000),
    diaImpacto: texto(corpo.diaImpacto, 10),
    autor: texto(corpo.autor, 80),
    excluido: corpo.excluido === true,
  };
  if (!n.idParada) return NextResponse.json({ ok: false, erro: "Ponto sem ID." }, { status: 400 });
  if (!n.autor) return NextResponse.json({ ok: false, erro: "Preencha \"Seu nome\" nos filtros para assinar." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, acoes: await gravarAcaoPonto(n) });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
