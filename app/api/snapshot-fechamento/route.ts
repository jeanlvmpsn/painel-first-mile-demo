import { NextResponse } from "next/server";

import {
  CAB_HISTORICO_FECHAMENTO,
  carregarFechamento,
  linhaHistoricoFechamento,
} from "../../lib/fechamento";
import { gravarFechamentoHBDoDia } from "../../lib/hbFechamentoDados";
import { gravarDedicadasDoDia } from "../../lib/dedicadasDados";
import { culpOpDoDia } from "../../lib/monitorD0Dados";
import { textoFechamento } from "../../lib/relatorioTipos";
import { formatarDataBR, gravarFechamentoNoHistorico } from "../../lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${segredo}`) {
      return NextResponse.json({ erro: "nao autorizado" }, { status: 401 });
    }
  }

  const agora = new Date();
  const hojeBR = formatarDataBR(agora);

  try {
    const dados = await carregarFechamento(hojeBR, hojeBR);

    const [h, m] = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(agora)
      .split(":")
      .map(Number);
    const culpOp = await culpOpDoDia(hojeBR, (h % 24) * 60 + m).catch(() => [] as string[]);

    const texto = textoFechamento(dados.fechamento, hojeBR, {
      schedulingsAceitos: dados.aceitos,
      rotasConfig: dados.rotasConfig,
      manuais: { culpOp: culpOp.join("\n") },
    });
    const gravadoEm = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "medium",
    }).format(agora);

    const resultado = await gravarFechamentoNoHistorico(
      CAB_HISTORICO_FECHAMENTO,
      linhaHistoricoFechamento(dados, hojeBR, gravadoEm, { culpOp, texto })
    );

    const dedicadas = await gravarDedicadasDoDia(hojeBR, (h % 24) * 60 + m, gravadoEm).catch((e: unknown) => ({
      erro: e instanceof Error ? e.message : String(e),
    }));

    const hb = await gravarFechamentoHBDoDia(hojeBR, gravadoEm).catch((e: unknown) => ({
      erro: e instanceof Error ? e.message : String(e),
    }));

    return NextResponse.json({
      ok: true,
      ...resultado,
      hb,
      dedicadas,

      pu: Number(dados.fechamento.pacotes.pu.toFixed(2)),
      ns: dados.fechamento.ns,
      rotasTT: dados.fechamento.rotasTT,
      temColeta: dados.temColeta,
      culpOp,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
