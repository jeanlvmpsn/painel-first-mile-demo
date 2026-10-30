import { NextResponse } from "next/server";

import { getPoolCps } from "../../lib/poolDados";
import { lerCarimbos, minutosDesde } from "../../lib/statusSessao";
import {
  carimboDaAba,
  type RespostaUltimaAtualizacao,
} from "../../lib/ultimaAtualizacao";

export const dynamic = "force-dynamic";

const TZ = "America/Sao_Paulo";

export async function GET(req: Request) {
  const caminho = new URL(req.url).searchParams.get("caminho") || "/";

  if (caminho.startsWith("/pool")) {
    const hojeBR = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ }).format(new Date());
    try {
      const pool = await getPoolCps(hojeBR);
      return NextResponse.json({
        quando: pool.atualizadoEm || null,
        estado: pool.atualizadoEm ? "ok" : "ausente",
        mensagem: pool.aba ? "aba " + pool.aba : "",
        minutosAtras: null,
      } satisfies RespostaUltimaAtualizacao);
    } catch {
      return NextResponse.json(ausente());
    }
  }

  const carimbo = carimboDaAba(caminho, await lerCarimbos());
  if (!carimbo) return NextResponse.json(ausente());
  return NextResponse.json({
    quando: carimbo.quando,
    estado: carimbo.estado,
    mensagem: carimbo.mensagem,
    minutosAtras: carimbo.quando ? minutosDesde(carimbo.quando) : null,
  } satisfies RespostaUltimaAtualizacao);
}

function ausente(): RespostaUltimaAtualizacao {
  return { quando: null, estado: "ausente", mensagem: "", minutosAtras: null };
}
