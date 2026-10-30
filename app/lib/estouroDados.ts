import { HB_SPREADSHEET_ID } from "./hbDados";
import { chaveId, chaveRota, porId } from "./hb";
import {
  aplicarAtribuicao,
  cidadesDasParadas,
  cidadesDosPontos,
  lerCapacidades,
  lerPrevisao,
  rotasAgora,
  rotasComCarga,
  type LeituraCarga,
  type RotaAgora,
  type VeiculoDaRota,
} from "./estouro";
import { getRotasPlanejadas } from "./atribuicoes";
import type { MapaApoio } from "./apoioCidades";
import { montarMapaApoio } from "./caminhoCidades";
import { SPREADSHEET_ID, getSheetsClient } from "./sheets";
import { chaveRotaPlanificacao, cidadesPorRota } from "./planificacao";
import { estimadoDoId, indexarMonitoring } from "./monitoringSeller";
import { getMonitoringSeller } from "./monitoringSellerDados";
import { PROCESSO_ID } from "./upgradeDados";

const ABA_EXTRACAO = "Extração Config";

const ABA_REPLANEJAMENTO = "REPLANEJAMENTO";

const ABA_PLANIFICACAO = "PLANIFICACAO";

const ABA_CAPACIDADE = "CAPACIDADE_VEICULOS";

const ABA_APOIO = "CIDADES_APOIO";

async function lerBaseCapacidade(): Promise<unknown[][]> {
  const r = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: ABA_CAPACIDADE + "!A:Z",

    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (r.data.values ?? []) as unknown[][];
}

export type InfoAgora = {
  previsaoEm: string;

  monitoramentoEm: string;

  paradasSemPrevisao: number;
  paradas: number;
  avisos: string[];
};

export type LeituraCargaAgora = LeituraCarga & {
  erro: string | null;
  agora: RotaAgora[];
  info: InfoAgora;

  apoio: MapaApoio;
};

async function lerAba(planilha: string, faixa: string): Promise<string[][]> {
  const r = await getSheetsClient().spreadsheets.values.get({ spreadsheetId: planilha, range: faixa });
  return (r.data.values ?? []) as string[][];
}

async function tentar<T>(fn: () => Promise<T>, padrao: T, avisos: string[], aviso: string): Promise<T> {
  try {
    return await fn();
  } catch {
    avisos.push(aviso);
    return padrao;
  }
}

export async function lerCargaDoDia(dataBR: string, hojeBR: string): Promise<LeituraCargaAgora> {
  const vazio: InfoAgora = { previsaoEm: "", monitoramentoEm: "", paradasSemPrevisao: 0, paradas: 0, avisos: [] };
  const ehHoje = dataBR === hojeBR;
  const dataISO = dataBR.split("/").reverse().join("-");
  try {
    const avisos: string[] = [];

    const [config, replanejamento, monitoring, planificacao, planejadas, baseCapacidade, tabelaApoio] = await Promise.all([
      lerAba(HB_SPREADSHEET_ID, "'" + ABA_EXTRACAO + "'!A:AZ"),
      tentar(() => lerAba(PROCESSO_ID, ABA_REPLANEJAMENTO + "!A:Z"), [] as string[][], avisos,
        "Não consegui ler a aba REPLANEJAMENTO."),
      ehHoje ? getMonitoringSeller() : Promise.resolve([]),
      tentar(() => lerAba(SPREADSHEET_ID, ABA_PLANIFICACAO + "!A:Z"), [] as string[][], avisos,
        "Não consegui ler a aba PLANIFICACAO: as rotas que podem ajudar saem só pelo cluster."),

      tentar(() => getRotasPlanejadas(dataBR, hojeBR), [], avisos,
        "Não consegui ler a atribuição: peso e cubagem máximos são os do veículo da config."),
      tentar(lerBaseCapacidade, [] as unknown[][], avisos,
        "Não consegui ler a aba CAPACIDADE_VEICULOS: peso e cubagem máximos são os da tabela de portes."),

      lerAba(SPREADSHEET_ID, ABA_APOIO + "!A:B").catch(() => [] as string[][]),
    ]);

    const leitura = rotasComCarga(config, dataBR);
    const { previsao, atualizadoEm } = lerPrevisao(replanejamento, dataISO, chaveId);
    if (replanejamento.length > 1 && previsao.size === 0) {
      avisos.push("A aba REPLANEJAMENTO não tem previsão para " + dataBR + ".");
    }

    const indice = indexarMonitoring(monitoring);
    const agora = rotasAgora(
      leitura.rotas,
      {
        previsao,
        pacotesAgora: monitoring.length ? (id) => estimadoDoId(indice, id) : undefined,
      },
      { id: chaveId, rota: chaveRota },
    );

    const veiculos = new Map<string, VeiculoDaRota>();
    for (const r of planejadas) {
      veiculos.set(chaveRotaPlanificacao(r.rota), { pedido: r.perfil ?? "", atribuido: r.veiculoTipo ?? "" });
    }
    const capacidades = lerCapacidades(baseCapacidade);
    aplicarAtribuicao(leitura.rotas, veiculos, chaveRotaPlanificacao, capacidades);
    aplicarAtribuicao(agora, veiculos, chaveRotaPlanificacao, capacidades);

    const cidades = cidadesPorRota(planificacao, dataBR);
    for (const r of [...leitura.rotas, ...agora]) {
      r.cidades = cidades.get(chaveRotaPlanificacao(r.rota))?.cidades ?? [];
    }

    const cidadePonto = cidadesDosPontos(replanejamento, chaveId);
    for (const r of [...leitura.rotas, ...agora]) {
      for (const p of r.detalhe) p.cidade = porId(cidadePonto, chaveId(p.id)) ?? "";
      if (!r.cidades?.length) r.cidades = cidadesDasParadas(r.detalhe);
    }
    if (planificacao.length > 1 && cidades.size === 0) {
      avisos.push("A aba PLANIFICACAO não tem rotas de " + dataBR + ": as rotas que podem ajudar saem só pelo cluster.");
    }

    const apoio = montarMapaApoio(
      [...leitura.rotas, ...agora].flatMap((r) => r.cidades ?? []),
      tabelaApoio,
    );

    let paradas = 0;
    let semPrevisao = 0;
    for (const r of agora) {
      for (const p of r.detalhe) {
        paradas++;
        if (p.origemPorPacote !== "previsão") semPrevisao++;
      }
    }

    return {
      ...leitura,
      erro: null,
      agora,
      apoio,
      info: {
        previsaoEm: atualizadoEm,
        monitoramentoEm: monitoring[0]?.atualizadoEm ?? "",
        paradasSemPrevisao: semPrevisao,
        paradas,
        avisos,
      },
    };
  } catch (e) {
    return { rotas: [], aviso: "", erro: (e as Error).message, agora: [], info: vazio, apoio: {} };
  }
}
