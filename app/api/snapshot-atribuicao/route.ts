import { NextRequest, NextResponse } from "next/server";
import { registrarHistoricoColetaDoRelatorio } from "../../lib/avulsasDados";
import { registrarConfigDeHoje } from "../../lib/configHistoricoDados";
import { registrarSnapshotScheduling } from "../../lib/scheduling";
import {
  registrarSnapshotDoDia,
  registrarSnapshotRotasBQ,
  registrarSnapshotColetas,
} from "../../lib/sheets";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { erro: "CRON_SECRET nao configurado no ambiente." },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }

  async function tentar<T>(nome: string, fn: () => Promise<T>) {
    try {
      return { ok: true as const, resultado: await fn() };
    } catch (err) {
      return {
        ok: false as const,
        erro: err instanceof Error ? err.message : "Erro desconhecido.",
        alvo: nome,
      };
    }
  }

  const atribuicao = await tentar("HISTORICO_ATRIBUICAO", registrarSnapshotDoDia);
  const rotasBQ = await tentar("HISTORICO_ROTAS_BQ", registrarSnapshotRotasBQ);

  const coletas = await tentar("HISTORICO_COLETAS", registrarSnapshotColetas);

  const scheduling = await tentar(
    "HISTORICO_SCHEDULING",
    registrarSnapshotScheduling,
  );

  const coletaAvulsas = await tentar(
    "HISTORICO_COLETA_AVULSAS",
    registrarHistoricoColetaDoRelatorio,
  );

  const config = await tentar("HISTORICO_CONFIG", registrarConfigDeHoje);

  const todas = [atribuicao, rotasBQ, coletas, scheduling, coletaAvulsas, config];
  const falhas = todas.filter((r) => !r.ok);
  return NextResponse.json(
    { atribuicao, rotasBQ, coletas, scheduling, coletaAvulsas, config },
    { status: falhas.length === todas.length ? 500 : 200 }
  );
}
