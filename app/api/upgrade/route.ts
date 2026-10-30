import { NextResponse } from "next/server";

import {
  CORTE_PADRAO,
  PISO_BASE,
  candidatos,
  idValido,
  motivoValido,
  type LinhaDrop,
} from "../../lib/upgrade";
import {
  estadoPedido,
  lerAbaSolicitacao,
  lerBase,
  solicitar,
} from "../../lib/upgradeDados";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown) => String(v ?? "").trim();
const erro = (msg: string, status = 400) =>
  NextResponse.json({ ok: false, erro: msg }, { status });

function periodo(sp: URLSearchParams, base: { inicio: string; fim: string }) {
  const i = texto(sp.get("inicio"));
  const f = texto(sp.get("fim"));
  const inicio = DATA.test(i) && i > base.inicio ? i : base.inicio;
  const fim = DATA.test(f) && f < base.fim ? f : base.fim;
  return { inicio, fim: fim < inicio ? inicio : fim };
}

const noPeriodo = (l: { data: string }, p: { inicio: string; fim: string }) =>
  l.data >= p.inicio && l.data <= p.fim;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const acao = sp.get("acao");
  try {
    if (acao === "pedido") {
      const e = await estadoPedido(texto(sp.get("id")));
      return e ? NextResponse.json({ ok: true, ...e }) : erro("Pedido nao encontrado.", 404);
    }

    const base = await lerBase();
    if (!base.linhas.length) {
      return erro(
        "A base de candidatos esta vazia: rode atualizarBaseCandidatos() no script da planilha.",
        503,
      );
    }
    const p = periodo(sp, base);
    const corte = Number(sp.get("corte")) > 0 ? Number(sp.get("corte")) : CORTE_PADRAO;
    const info = { atualizadoEm: base.atualizadoEm, baseInicio: base.inicio, baseFim: base.fim, ...p };

    if (acao === "resumo") {
      let sol: Awaited<ReturnType<typeof lerAbaSolicitacao>> = { solicitacoes: [], solicitantes: [], avisoBaseOriginal: "" };
      let avisoSolicitacao = "";
      try {
        sol = await lerAbaSolicitacao();
      } catch (e) {
        avisoSolicitacao = (e as Error).message;
      }

      const lista = candidatos(base.linhas.filter((l) => noPeriodo(l, p)), p.fim, corte).filter(
        (c) => c.geral.estimados >= PISO_BASE,
      );
      if (sol.avisoBaseOriginal) avisoSolicitacao = [avisoSolicitacao, sol.avisoBaseOriginal].filter(Boolean).join(" ");
      return NextResponse.json({ ok: true, info, candidatos: lista, ...sol, avisoSolicitacao });
    }

    const id = texto(sp.get("id"));
    if (acao === "seller") {
      if (!idValido("seller", id)) return erro("ID de seller invalido.");
      const linhas: LinhaDrop[] = base.linhas.filter((l) => l.sellerId === id && noPeriodo(l, p));
      return NextResponse.json({ ok: true, info, linhas });
    }
    return erro("Acao desconhecida.");
  } catch (e) {
    return erro((e as Error).message, 500);
  }
}

export async function POST(req: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return erro("Corpo invalido.");
  }
  const sellerId = texto(corpo.sellerId);
  const placeId = texto(corpo.placeId);
  const solicitante = texto(corpo.solicitante);
  const inicio = texto(corpo.inicio);
  const fim = texto(corpo.fim);
  if (!idValido("seller", sellerId)) return erro("ID de seller invalido.");
  if (!idValido("place", placeId)) return erro("Escolha o place da solicitacao.");
  if (!solicitante) return erro("Informe o solicitante.");
  if (!DATA.test(inicio) || !DATA.test(fim) || inicio > fim) return erro("Periodo invalido.");

  if (motivoValido(corpo.motivo) !== "quantidade" && !texto(corpo.evidenciaVolume)) {
    return erro("Informe a evidencia do pacote (link das fotos).");
  }
  try {
    const r = await solicitar(
      {
        sellerId,
        sellerNome: texto(corpo.sellerNome),
        placeId,
        placeNome: texto(corpo.placeNome),
        estado: texto(corpo.estado) || "SP",
        solicitante,
        motivo: motivoValido(corpo.motivo),
        evidenciaVolume: texto(corpo.evidenciaVolume),
      },
      inicio,
      fim,
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
}
