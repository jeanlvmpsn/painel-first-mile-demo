import { ehSabado } from "./relatorioTipos";
import { ehDeCampinas, somenteCampinas } from "./hubs";
import { getRotasPlanejadas } from "./atribuicoes";
import { metaDoMes } from "./metas";
import {
  metricasDeAtribuicao,
  montarFechamento,
  type Fechamento,
} from "./relatorioTipos";
import { lerScheduling } from "./scheduling";
import { rotasComCarga } from "./estouro";
import { chaveId, chaveRota } from "./hb";
import { HB_SPREADSHEET_ID } from "./hbDados";
import { getMonitoringSeller } from "./monitoringSellerDados";
import { nsSemReversaoDoDia } from "./monitorD0Dados";
import { pacotesSemOutrosHubs, recortarCampinas, type RecorteHub } from "./recorteHub";
import {
  getMonitoramentoDoDia,
  getParadasDoDia,
  getRotasConfigDoDia,
  getRotasDoDia,
  getSheetsClient,
} from "./sheets";

export type DadosFechamento = {
  fechamento: Fechamento;
  aceitos: number | null;
  recusas: number | null;
  rotasConfig: number | null;

  temColeta: boolean;
  temMonitoramento: boolean;
  temAderencia: boolean;
  atualizadoEm: string;

  recorteHub:
    | (Omit<RecorteHub, "paradas" | "pontosCps" | "pontosFora"> & {
        pacotes: "monitoramento por sellers" | "coletas";

        descontados?: { estimados: number; coletados: number };
      })
    | null;
};

async function lerConfigDoDia(dataBR: string) {
  try {
    const r = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: HB_SPREADSHEET_ID,
      range: "'Extração Config'!A:AZ",
    });
    const linhas = ((r.data.values ?? []) as unknown[][]).map((l) => (l ?? []).map((v) => String(v ?? "")));
    return rotasComCarga(linhas, dataBR).rotas;
  } catch {
    return null;
  }
}

export async function carregarFechamento(
  dataBR: string,
  hojeBR: string
): Promise<DadosFechamento> {
  const ehHoje = dataBR === hojeBR;

  const [todasParadas, doDia, planejadas, scheduling, monitoramentoGeral, rotasConfig, config, porSeller] =
    await Promise.all([
      getParadasDoDia(dataBR),
      getRotasDoDia(dataBR, ehHoje),
      getRotasPlanejadas(dataBR, hojeBR),
      lerScheduling(),
      getMonitoramentoDoDia(dataBR),
      getRotasConfigDoDia(dataBR),
      lerConfigDoDia(dataBR),

      ehHoje ? getMonitoringSeller() : Promise.resolve([]),
    ]);

  const recorte = recortarCampinas(todasParadas, planejadas, config);
  const paradas = recorte.paradas;
  const pacotesCps = recorte.aplicado ? pacotesSemOutrosHubs(monitoramentoGeral, porSeller, recorte.pontosFora) : null;
  const monitoramento = !recorte.aplicado
    ? monitoramentoGeral
    : pacotesCps
      ? {
          estimados: pacotesCps.estimados,
          coletados: pacotesCps.coletados,
          rotasAvulsas: recorte.avulsasCps,
          rotasPlanejadas: monitoramentoGeral?.rotasPlanejadas ?? 0,
          paradasTotal: paradas.filter((p) => String(p.rota ?? "").trim()).length,
          atualizadoEm: pacotesCps.atualizadoEm || monitoramentoGeral?.atualizadoEm || "",
        }
      : null;

  const atrib = metricasDeAtribuicao(somenteCampinas(planejadas));
  const temAtribuicao = doDia.comparavel;
  const ns = doDia.rotas.filter((r) => r.ns).length;

  const montado = montarFechamento({
    paradas,
    rotasAtribuidas: temAtribuicao ? doDia.rotas.length : atrib.rotas,
    ns: temAtribuicao ? ns : 0,
    rotasNs: doDia.rotas.filter((r) => r.ns).map((r) => r.rota),
    monitoramento,

    capacidadeTotal: null,
    rotasPerfilMenor: atrib.perfilMenor,

    alvoPu: metaDoMes(dataBR).puSuccess,
  });

  const nsD0 =
    ehHoje && temAtribuicao
      ? await nsSemReversaoDoDia(
          dataBR,
          doDia.rotas
            .filter((r) => r.ns)
            .map((r) => ({ rota: r.rota, rotaId: r.idRota, transportadora: r.transportadora })),
        ).catch(() => null)
      : null;

  const rotasCps = new Set(somenteCampinas(planejadas).map((r) => chaveRota(r.rota)));
  const configCps = config && recorte.aplicado ? config.filter((r) => rotasCps.has(chaveRota(r.rota))) : config;
  const pontosPlanejados = new Set((configCps ?? []).flatMap((r) => r.detalhe.map((p) => chaveId(p.id))).filter(Boolean));
  const fechamento = {
    ...montado,
    ...(nsD0 ? { ofensores: nsD0.ofensores } : {}),
    ...(pontosPlanejados.size ? { totalParadas: pontosPlanejados.size } : {}),
  };

  const doDiaSched = scheduling.filter(
    (p) => p.data === dataBR && ehDeCampinas(p.hub),
  );
  const aceitos = doDiaSched.length
    ? doDiaSched.filter((p) => p.situacao === "aceite").length
    : null;
  const recusas = doDiaSched.length
    ? doDiaSched.filter((p) => p.situacao === "recusa").length
    : null;

  return {
    fechamento,
    aceitos,
    recusas,
    rotasConfig: ehSabado(dataBR) || recorte.aplicado ? fechamento.rotasAtribuidas : rotasConfig,
    temColeta: paradas.length > 0,
    temMonitoramento: monitoramento !== null,
    temAderencia: atrib.perfilMenor !== null,
    atualizadoEm: monitoramento?.atualizadoEm ?? "",
    recorteHub: recorte.aplicado
      ? {
          aplicado: true,
          avulsasCps: recorte.avulsasCps,
          avulsasFora: recorte.avulsasFora,
          rotasFora: recorte.rotasFora,
          semConfig: recorte.semConfig,
          pacotes: pacotesCps ? "monitoramento por sellers" : "coletas",
          descontados: pacotesCps?.descontados,
        }
      : null,
  };
}

export const CAB_HISTORICO_FECHAMENTO = [
  "DATA",
  "ESTIMADOS",
  "COLETADOS",
  "PU",
  "ROTAS_CONFIG",
  "ROTAS_ATRIBUICAO",
  "SCHEDULINGS_ACEITOS",
  "NS_DECLINIOS",
  "ADERENCIA_PERFIL",
  "SEGUNDA_SAIDA",
  "ROTAS_AVULSAS",
  "ROTAS_COM_ATRASO",
  "EARLY",
  "LATE",
  "ON_TIME",
  "TOTAL_PARADAS",
  "ROTAS_TT",
  "SPR_EXE",
  "OFENSORES",
  "GRAVADO_EM",

  "CULP_MELI",
  "TEXTO_REPORT",
];

export function linhaHistoricoFechamento(
  dados: DadosFechamento,
  dataBR: string,
  gravadoEm: string,
  extras: { culpMeli?: string[]; texto?: string } = {}
): (string | number)[] {
  const f = dados.fechamento;

  const ou = (v: number | null | undefined) =>
    v === null || v === undefined ? "" : v;
  return [
    dataBR,
    f.pacotes.estimados,
    f.pacotes.coletados,
    Number(f.pacotes.pu.toFixed(2)),
    ou(dados.rotasConfig),
    f.rotasAtribuidas,
    ou(dados.aceitos),
    f.ns,
    dados.temAderencia ? Number((f.aderenciaPerfil ?? 0).toFixed(2)) : "",
    f.segundaSaida,
    f.avulsas,
    dados.temColeta ? f.rotasComAtraso : "",
    dados.temColeta ? Number(f.early.toFixed(2)) : "",
    dados.temColeta ? Number(f.late.toFixed(2)) : "",
    dados.temColeta ? Number(f.onTime.toFixed(2)) : "",
    f.totalParadas,
    f.rotasTT,
    f.sprExec === null ? "" : Math.round(f.sprExec),
    f.ofensores
      .slice(0, 3)
      .map((o) => o.transportadora + " - " + o.pacotes + " pcts")
      .join(" | "),
    gravadoEm,
    (extras.culpMeli ?? []).join("\n"),
    extras.texto ?? "",
  ];
}
