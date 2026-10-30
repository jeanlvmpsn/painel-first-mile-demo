import { getRotasPlanejadas } from "./atribuicoes";
import { rotasComCarga } from "./estouro";
import {
  CAB_HISTORICO_FECHAMENTO_HB,
  compararComListaCurada,
  ehParadaHB,
  lerHistoricoFechamentoHB,
  lerParadasHB,
  linhaHistoricoFechamentoHB,
  monitoramentoHB,
  puOficialDoDia,
  type ComparacaoLista,
  type FechamentoHBSalvo,
  type ParadaHBReal,
} from "./hbFechamento";
import { chaveId, chaveRota, montarListaHB, porId } from "./hb";
import { HB_SPREADSHEET_ID } from "./hbDados";
import { somenteCampinas } from "./hubs";
import { metaDoMes } from "./metas";
import { getMonitoringSeller } from "./monitoringSellerDados";
import { metricasDeAtribuicao, montarFechamento, type Fechamento } from "./relatorioTipos";
import { getParadasDoDia, getRotasDoDia, getSheetsClient, gravarFechamentoNoHistorico, SPREADSHEET_ID } from "./sheets";
import { PROCESSO_ID } from "./upgradeDados";

const ABA_PARADAS = "HB_PARADAS";
const ABA_PU = "HB_PU_OFICIAL";

const ABA_HISTORICO = "HISTORICO_FECHAMENTO_HB";

export type DadosFechamentoHB = {
  fechamento: Fechamento;
  rotasConfig: number | null;
  temColeta: boolean;
  temMonitoramento: boolean;

  puOficial: { data: string; numerador: number; denominador: number; pu: number } | null;
  paradasHB: number;
  rotasHB: string[];
  atualizadoEm: string;
  comparacao: ComparacaoLista;
  aviso: string;
  erro: string | null;
};

async function lerAba(planilha: string, faixa: string, cru = false): Promise<string[][]> {
  const r = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: planilha,
    range: faixa,
    ...(cru ? { valueRenderOption: "UNFORMATTED_VALUE" } : {}),
  });
  return ((r.data.values ?? []) as unknown[][]).map((l) => (l ?? []).map((v) => String(v ?? "")));
}

const semAba = () => [] as string[][];

export async function carregarFechamentoHB(dataBR: string, hojeBR: string): Promise<DadosFechamentoHB> {
  const ehHoje = dataBR === hojeBR;
  const dataISO = dataBR.split("/").reverse().join("-");
  const vazio: DadosFechamentoHB = {
    fechamento: montarFechamento({ paradas: [], rotasAtribuidas: 0, ns: 0, capacidadeTotal: null, rotasPerfilMenor: null }),
    rotasConfig: null,
    temColeta: false,
    temMonitoramento: false,
    puOficial: null,
    paradasHB: 0,
    rotasHB: [],
    atualizadoEm: "",
    comparacao: { paradas: [], soNaListaCurada: [] },
    aviso: "",
    erro: null,
  };

  try {
    const [abaParadas, abaPu, coletas, doDia, planejadas, monitoring, config, curada] = await Promise.all([
      lerAba(PROCESSO_ID, ABA_PARADAS + "!A:Z", true).catch(semAba),
      lerAba(PROCESSO_ID, ABA_PU + "!A:Z", true).catch(semAba),
      getParadasDoDia(dataBR),
      getRotasDoDia(dataBR, ehHoje),
      getRotasPlanejadas(dataBR, hojeBR),
      ehHoje ? getMonitoringSeller() : Promise.resolve([]),
      lerAba(HB_SPREADSHEET_ID, "'Extração Config'!A:AZ").catch(semAba),
      lerAba(HB_SPREADSHEET_ID, "'H&B'!A:C", true).catch(semAba),
    ]);

    const { paradas, atualizadoEm } = lerParadasHB(abaParadas);
    if (!paradas.size) {
      return {
        ...vazio,
        erro:
          "A aba HB_PARADAS não existe ou está vazia na planilha de processos. " +
          "Rode a atualização das paradas H&B.",
      };
    }

    const coletasHB = coletas.filter((p) => ehParadaHB(paradas, p.parada));

    const daConfig = rotasComCarga(config, dataBR).rotas;
    const configHB = daConfig.filter((r) => r.detalhe.some((p) => ehParadaHB(paradas, p.id)));
    const rotasHB = new Set<string>([
      ...coletasHB.filter((p) => !p.rotaSemNome).map((p) => chaveRota(p.rota)),
      ...configHB.map((r) => chaveRota(r.rota)),
    ]);
    rotasHB.delete("");
    const ehRotaHB = (rota: string) => rotasHB.has(chaveRota(rota));

    const atribuidasHB = doDia.rotas.filter((r) => ehRotaHB(r.rota));
    const atrib = metricasDeAtribuicao(somenteCampinas(planejadas).filter((r) => ehRotaHB(r.rota)));
    const ns = atribuidasHB.filter((r) => r.ns);
    const monitoramento = monitoramentoHB(monitoring, paradas, coletasHB);

    const fechamento = montarFechamento({
      paradas: coletasHB,
      rotasAtribuidas: doDia.comparavel ? atribuidasHB.length : atrib.rotas,
      ns: doDia.comparavel ? ns.length : 0,
      rotasNs: ns.map((r) => r.rota),
      monitoramento,
      capacidadeTotal: null,
      rotasPerfilMenor: atrib.perfilMenor,
      alvoPu: metaDoMes(dataBR).puSuccess,
    });

    const idsDoDia = new Set<string>();
    for (const r of configHB) for (const p of r.detalhe) if (ehParadaHB(paradas, p.id)) idsDoDia.add(p.id);
    for (const p of coletasHB) idsDoDia.add(p.parada);
    const doDiaHB = new Map<string, ParadaHBReal>();
    for (const id of idsDoDia) {
      const p = porId(paradas, chaveId(id));
      if (p) doDiaHB.set(p.id, p);
    }
    const comparacao = compararComListaCurada([...doDiaHB.values()], paradas, montarListaHB(curada));

    return {
      fechamento,
      rotasConfig: daConfig.length ? configHB.length : null,
      temColeta: coletasHB.length > 0,
      temMonitoramento: monitoramento !== null,
      puOficial: puOficialDoDia(abaPu, dataISO),
      paradasHB: comparacao.paradas.length,
      rotasHB: [...rotasHB].sort(),
      atualizadoEm,
      comparacao,
      aviso: coletas.length && !coletasHB.length ? "Nenhuma linha da COLETAS_D0 de hoje é de parada H&B." : "",
      erro: null,
    };
  } catch (e) {
    return { ...vazio, erro: (e as Error).message };
  }
}

export async function gravarFechamentoHBDoDia(
  hojeBR: string,
  gravadoEm: string,
): Promise<{ dataBR: string; linhaGravada: number; pu: number }> {
  const d = await carregarFechamentoHB(hojeBR, hojeBR);
  if (d.erro) throw new Error(d.erro);
  const salvo: FechamentoHBSalvo = {
    fechamento: d.fechamento,
    rotasConfig: d.rotasConfig,
    paradasHB: d.paradasHB,
    rotasHB: d.rotasHB.length,
    temColeta: d.temColeta,
    temMonitoramento: d.temMonitoramento,
    atualizadoEm: d.atualizadoEm,
  };
  const r = await gravarFechamentoNoHistorico(
    CAB_HISTORICO_FECHAMENTO_HB,
    linhaHistoricoFechamentoHB(salvo, hojeBR, gravadoEm),
    ABA_HISTORICO,
  );
  return { ...r, pu: Number(d.fechamento.pacotes.pu.toFixed(2)) };
}

export type FechamentoHBDoHistorico = {
  salvo: FechamentoHBSalvo | null;
  gravadoEm: string;

  puOficial: DadosFechamentoHB["puOficial"];
  erro: string | null;
};

export async function carregarFechamentoHBSalvo(dataBR: string): Promise<FechamentoHBDoHistorico> {
  const dataISO = dataBR.split("/").reverse().join("-");
  try {
    const [historico, abaPu] = await Promise.all([
      lerAba(SPREADSHEET_ID, "'" + ABA_HISTORICO + "'!A:Z").catch(semAba),
      lerAba(PROCESSO_ID, ABA_PU + "!A:Z", true).catch(semAba),
    ]);
    const achado = lerHistoricoFechamentoHB(historico, dataBR);
    return {
      salvo: achado?.salvo ?? null,
      gravadoEm: achado?.gravadoEm ?? "",
      puOficial: puOficialDoDia(abaPu, dataISO),
      erro: null,
    };
  } catch (e) {
    return { salvo: null, gravadoEm: "", puOficial: null, erro: (e as Error).message };
  }
}
