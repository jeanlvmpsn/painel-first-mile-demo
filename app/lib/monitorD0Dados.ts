import { HB_SPREADSHEET_ID } from "./hbDados";
import { rotasComCarga } from "./estouro";
import { chaveId, chaveRota, mapaDePontos } from "./hb";
import { getRespostasForm, getSheetsClient, SPREADSHEET_ID } from "./sheets";
import {
  CAB_TRATATIVAS,
  chaveOcorrencia,
  clusterDaVisita,
  clusterDosPontos,
  lerHistoricoPontos,
  lerMotivosImpacto,
  lerPlanoDoDia,
  fotosDasRotas,
  rotasComForms,
  lerConsultasDosPontos,
  lerRotasDosPontos,
  lerSaldoDosPontos,
  lerTratativas,
  lerVisitas,
  projecaoPorPonto,
  linhasCulpOp,
  nsSemReversao,
  ocorrenciasDoDia,
  type ConsultaPonto,
  type EstimadoRota,
  type HistoricoPonto,
  type PlanoParada,
  type RotaMonitoring,
  type RotaNs,
  type SaldoPonto,
  type Tratativa,
  type Visita,
} from "./monitorD0";
import { getRotasPlanejadas } from "./atribuicoes";
import { filtroCps, outrosHubsDaAtribuicao } from "./hubMonitor";
import { lerEntregasExpress, type EntregasExpress } from "./expressEntregas";
import { lerRotasSistemaHoje, type RotaSistemaHoje } from "./pontualidadeRotas";
import { comCota, PROCESSO_ID } from "./upgradeDados";
import { mapearPontos, type PontoMapa, type RotaConfigMapa } from "./mapeamento";
import { lerMonitoring } from "./monitoringSeller";

const FAIXA = "COLETAS_D0!A1:AZ";

const ABA_TRATATIVAS = "MONITOR_D0_TRATATIVAS";
const FAIXA_TRATATIVAS = ABA_TRATATIVAS + "!A:L";

const ABA_MOTIVOS = "MONITOR_D0_MOTIVOS";
const FAIXA_MOTIVOS = ABA_MOTIVOS + "!A:C";

const ABA_ROTAS_PONTOS = "MONITORING_SELLER_ROTAS";

const FAIXA_ROTAS_SISTEMA = "ROTAS_SISTEMA!A:AD";

const FAIXA_EXPRESS = "EXPRESS_ENTREGAS!A:T";

const ABA_HISTORICO = "HIST_PONTOS_30D";

const VALIDADE_MS = 60_000;
const VALIDADE_HISTORICO_MS = 30 * 60_000;

const VALIDADE_PLANO_MS = 5 * 60_000;
const ABA_EXTRACAO = "Extração Config";
const ABA_FORMULAS = "Formulas";

export type LeituraMonitorD0 = {
  visitas: Visita[];
  tratativas: Record<string, Tratativa>;
  historico: Record<string, HistoricoPonto>;
  plano: PlanoParada[];
  rotasPontos: RotaMonitoring[];

  rotasSistema: RotaSistemaHoje[];

  entregasExpress: Record<string, EntregasExpress>;

  consultasPontos: Record<string, ConsultaPonto>;

  cargaRotas: Record<string, number>;

  projecaoPontos: Record<string, number>;

  estimadoRotas: Record<string, EstimadoRota>;

  fotos: Record<string, string>;

  saldosPontos: Record<string, SaldoPonto>;

  motivos: string[];

  mapeamento: PontoMapa[];

  clusterPontos: Record<string, string>;
  erro: string | null;

  desatualizadoDesde: string | null;

  lidoEm: string;
};

const comoTexto = (v: unknown[][] | null | undefined) =>
  ((v ?? []) as unknown[][]).map((l) => (l ?? []).map((x) => String(x ?? "")));

const horaSP = (ms: number, comSegundos = false) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    ...(comSegundos ? { second: "2-digit" } : {}),
  }).format(ms);

type Bruto = {
  coletas: string[][];
  trat: string[][];
  rotas: string[][];
  motivos: string[][];
  sistema: string[][];
  express: string[][];
};

const ausentes = new Map<string, number>();
let ultimaPlanilha: { quando: number; bruto: Bruto } | null = null;
let ultimoHistorico: { quando: number; linhas: string[][] } | null = null;
let ultimoPlano: {
  quando: number;
  dataBR: string;
  plano: PlanoParada[];
  carga: Record<string, number>;
  projecao: Record<string, number>;
  rotasMapa: RotaConfigMapa[];
  clusterPontos: Record<string, string>;
} | null = null;

let ultimoSaldo: { quando: number; linhas: string[][] } | null = null;
const VALIDADE_SALDO_MS = 3 * 60_000;

let ultimasFotos: { quando: number; dataBR: string; fotos: Record<string, string>; respondidas: string[] } | null = null;

export async function lerFormsDoDia(dataBR: string): Promise<{ fotos: Record<string, string>; respondidas: string[] }> {
  if (ultimasFotos && ultimasFotos.dataBR === dataBR && Date.now() - ultimasFotos.quando < 5 * 60_000) return ultimasFotos;
  try {
    const respostas = await comCota(() => getRespostasForm());
    ultimasFotos = { quando: Date.now(), dataBR, fotos: fotosDasRotas(respostas, dataBR), respondidas: rotasComForms(respostas, dataBR) };
  } catch {
    if (!ultimasFotos || ultimasFotos.dataBR !== dataBR) ultimasFotos = { quando: Date.now(), dataBR, fotos: {}, respondidas: [] };
  }
  return ultimasFotos;
}
const lerFotos = async (dataBR: string) => (await lerFormsDoDia(dataBR)).fotos;

async function lerSaldos(): Promise<string[][]> {
  if (ultimoSaldo && Date.now() - ultimoSaldo.quando < VALIDADE_SALDO_MS) return ultimoSaldo.linhas;
  try {
    const r = await comCota(() =>
      getSheetsClient().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "MONITORING_SELLER!A:Z" }),
    );
    ultimoSaldo = { quando: Date.now(), linhas: comoTexto(r.data.values) };
  } catch {
    if (!ultimoSaldo) ultimoSaldo = { quando: Date.now(), linhas: [] };
  }
  return ultimoSaldo.linhas;
}

async function lerPlano(
  dataBR: string,
): Promise<{
  plano: PlanoParada[];
  carga: Record<string, number>;
  projecao: Record<string, number>;
  rotasMapa: RotaConfigMapa[];
  clusterPontos: Record<string, string>;
}> {
  if (ultimoPlano && ultimoPlano.dataBR === dataBR && Date.now() - ultimoPlano.quando < VALIDADE_PLANO_MS) {
    return ultimoPlano;
  }
  try {
    const sheets = getSheetsClient();
    const [ext, form] = await Promise.all([
      comCota(() => sheets.spreadsheets.values.get({ spreadsheetId: HB_SPREADSHEET_ID, range: "'" + ABA_EXTRACAO + "'!A:AZ" })),
      comCota(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId: HB_SPREADSHEET_ID,
          range: ABA_FORMULAS + "!A:AK",
          valueRenderOption: "UNFORMATTED_VALUE",
        }),
      ),
    ]);
    const extracao = comoTexto(ext.data.values);
    const formulas = comoTexto(form.data.values);
    const plano = lerPlanoDoDia(extracao, formulas, dataBR);

    const clusterPontos = clusterDosPontos(plano, mapaDePontos(formulas));

    const rotasConfig = rotasComCarga(extracao, dataBR).rotas;
    const carga = Object.fromEntries(rotasConfig.map((r) => [chaveRota(r.rota), r.pacotes]));

    const projecao = projecaoPorPonto(rotasConfig);

    const rotasMapa = rotasConfig.map((r) => ({
      rota: r.rota,
      veiculo: r.veiculo,
      transportadora: r.transportadora,
      uso: r.usoPeso === null && r.usoVolume === null ? null : Math.max(r.usoPeso ?? 0, r.usoVolume ?? 0),
    }));
    ultimoPlano = { quando: Date.now(), dataBR, plano, carga, projecao, rotasMapa, clusterPontos };
  } catch {
    if (!ultimoPlano || ultimoPlano.dataBR !== dataBR) ultimoPlano = { quando: Date.now(), dataBR, plano: [], carga: {}, projecao: {}, rotasMapa: [], clusterPontos: {} };
  }
  return ultimoPlano;
}

async function lerPlanilhaDoPainel(): Promise<{ bruto: Bruto; quando: number }> {
  if (ultimaPlanilha && Date.now() - ultimaPlanilha.quando < VALIDADE_MS) return ultimaPlanilha;
  const opcionais = [FAIXA_TRATATIVAS, ABA_ROTAS_PONTOS + "!A:N", FAIXA_MOTIVOS, FAIXA_ROTAS_SISTEMA, FAIXA_EXPRESS].filter(
    (f) => !(ausentes.has(f) && Date.now() - (ausentes.get(f) ?? 0) < 10 * 60_000),
  );
  const ler = (ranges: string[]) =>
    comCota(() => getSheetsClient().spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges }));
  let valores: Record<string, string[][]> = {};
  try {
    const r = await ler([FAIXA, ...opcionais]);
    (r.data.valueRanges ?? []).forEach((vr, k) => (valores[[FAIXA, ...opcionais][k]] = comoTexto(vr.values)));
  } catch (e) {
    if (!/unable to parse range/i.test(String((e as Error).message))) throw e;

    valores = { [FAIXA]: comoTexto((await ler([FAIXA])).data.valueRanges?.[0]?.values) };
    for (const f of opcionais) {
      try {
        valores[f] = comoTexto((await ler([f])).data.valueRanges?.[0]?.values);
      } catch {
        ausentes.set(f, Date.now());
      }
    }
  }
  ultimaPlanilha = {
    quando: Date.now(),
    bruto: {
      coletas: valores[FAIXA] ?? [],
      trat: valores[FAIXA_TRATATIVAS] ?? [],
      rotas: valores[ABA_ROTAS_PONTOS + "!A:N"] ?? [],
      sistema: valores[FAIXA_ROTAS_SISTEMA] ?? [],
      express: valores[FAIXA_EXPRESS] ?? [],
      motivos: valores[FAIXA_MOTIVOS] ?? [],
    },
  };
  return ultimaPlanilha;
}

async function lerHistorico(): Promise<string[][]> {
  if (ultimoHistorico && Date.now() - ultimoHistorico.quando < VALIDADE_HISTORICO_MS) return ultimoHistorico.linhas;
  try {
    const r = await comCota(() =>
      getSheetsClient().spreadsheets.values.get({ spreadsheetId: PROCESSO_ID, range: ABA_HISTORICO + "!A:I" }),
    );
    ultimoHistorico = { quando: Date.now(), linhas: comoTexto(r.data.values) };
  } catch {
    if (!ultimoHistorico) ultimoHistorico = { quando: Date.now(), linhas: [] };
  }
  return ultimoHistorico.linhas;
}

function estimadoDasRotas(
  plano: PlanoParada[],
  saldos: Record<string, SaldoPonto>,
  projecao: Record<string, number>,
): Record<string, EstimadoRota> {
  const pontos = new Map<string, Set<string>>();
  for (const p of plano) {
    const id = chaveId(p.idParada);
    if (!p.rota || !id) continue;
    const k = chaveRota(p.rota);
    pontos.set(k, (pontos.get(k) ?? new Set<string>()).add(id));
  }
  const saida: Record<string, EstimadoRota> = {};
  for (const [k, ids] of pontos) {
    let estimados = 0;
    for (const id of ids) estimados += saldos[id]?.estimados || projecao[id] || 0;
    saida[k] = { estimados, pontos: ids.size };
  }
  return saida;
}

function minutoSP(): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
}

export async function lerMonitorD0(dataBR: string): Promise<LeituraMonitorD0> {
  const [hist, doPlano, saldoBruto, fotos] = await Promise.all([lerHistorico(), lerPlano(dataBR), lerSaldos(), lerFotos(dataBR)]);
  const plano = doPlano.plano;
  const cargaRotas = doPlano.carga;
  const historico = Object.fromEntries(lerHistoricoPontos(hist));
  const todosSaldos = lerSaldoDosPontos(saldoBruto);
  const estimadoRotas = estimadoDasRotas(plano, todosSaldos, doPlano.projecao);
  const linhasMonitoring = lerMonitoring(saldoBruto);
  const montar = (b: Bruto, quando: number, desatualizadoDesde: string | null): LeituraMonitorD0 => {
    const visitas = lerVisitas(b.coletas, dataBR);
    const rotasPontos = lerRotasDosPontos(b.rotas, dataBR);

    const saldosPontos = Object.fromEntries(
      [...new Set(visitas.map((v) => chaveId(v.idParada)))].filter((id) => todosSaldos[id]).map((id) => [id, todosSaldos[id]]),
    );
    const projecaoPontos = Object.fromEntries(
      [...new Set(visitas.map((v) => chaveId(v.idParada)))]
        .filter((id) => doPlano.projecao[id] !== undefined)
        .map((id) => [id, doPlano.projecao[id]]),
    );
    return {
    visitas,
    saldosPontos,
    cargaRotas,
    projecaoPontos,
    estimadoRotas,
    fotos,
    tratativas: Object.fromEntries(lerTratativas(b.trat, dataBR)),
    historico,
    plano,
    rotasPontos,
    consultasPontos: lerConsultasDosPontos(b.rotas, dataBR),
    rotasSistema: lerRotasSistemaHoje(b.sistema, dataBR),
    entregasExpress: lerEntregasExpress(b.express, dataBR),
    motivos: lerMotivosImpacto(b.motivos),
    mapeamento: mapearPontos({
      monitoring: linhasMonitoring,
      plano,
      rotasConfig: doPlano.rotasMapa,
      rotasPontos,
      visitas,
      agoraMin: minutoSP(),
    }),
    clusterPontos: doPlano.clusterPontos,
    erro: null,
    desatualizadoDesde,
    lidoEm: horaSP(quando, true),
  };
  };
  try {
    const { bruto, quando } = await lerPlanilhaDoPainel();
    return montar(bruto, quando, null);
  } catch (e) {
    if (ultimaPlanilha) return montar(ultimaPlanilha.bruto, ultimaPlanilha.quando, horaSP(ultimaPlanilha.quando));
    return {
      visitas: [],
      tratativas: {},
      historico,
      plano,
      rotasPontos: [],
      consultasPontos: {},
      rotasSistema: [],
      entregasExpress: {},
      saldosPontos: {},
      cargaRotas,
      projecaoPontos: {},
      estimadoRotas,
      fotos,
      motivos: lerMotivosImpacto([]),
      mapeamento: [],
      clusterPontos: doPlano.clusterPontos,
      erro: (e as Error).message,
      desatualizadoDesde: null,
      lidoEm: "",
    };
  }
}

export function esquecerLeitura() {
  ultimaPlanilha = null;
}

export async function culpOpDoDia(dataBR: string, agoraMin: number): Promise<string[]> {
  const [l, planejadas] = await Promise.all([lerMonitorD0(dataBR), getRotasPlanejadas(dataBR, dataBR).catch(() => [])]);
  if (l.erro) return [];
  const cps = filtroCps(outrosHubsDaAtribuicao(planejadas), l.visitas, l.plano);
  const itens = ocorrenciasDoDia(l.visitas, agoraMin, l.plano, l.rotasPontos, l.saldosPontos)
    .filter((o) => cps.ehCps(o.visita.rota, o.visita.rotaId, o.visita.rotaSemNome))
    .map((o) => ({
    ...o,
    cluster: clusterDaVisita(o.visita, l.visitas, l.clusterPontos),
    trat: l.tratativas[chaveOcorrencia(o.visita)],
  }));
  return linhasCulpOp(itens);
}

export type NovaTratativa = {
  data: string;
  chave: string;
  rota: string;
  idParada: string;
  parada: string;
  tratado: boolean;
  comentario: string;
  autor: string;
  motivoImpacto: string;
  excluido: boolean;
  tratativaHxh: string;
};

async function garantirAba(aba: string, cabecalho: string[]): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await comCota(() =>
    sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" }),
  );
  const existe = (meta.data.sheets ?? []).some((s) => s.properties?.title === aba);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: aba } } }] },
    });
    ausentes.clear();
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: aba + "!A1",
    valueInputOption: "RAW",
    requestBody: { values: [cabecalho] },
  });
}

let abaTratativasOk = false;

let filaGravacao: Promise<unknown> = Promise.resolve();

export function gravarTratativa(t: NovaTratativa): Promise<{ atualizadoEm: string }> {
  const vez = filaGravacao.then(() => gravarTratativaAgora(t));
  filaGravacao = vez.catch(() => null);
  return vez;
}

async function gravarTratativaAgora(t: NovaTratativa): Promise<{ atualizadoEm: string }> {
  if (!abaTratativasOk) {
    await garantirAba(ABA_TRATATIVAS, CAB_TRATATIVAS);
    abaTratativasOk = true;
  }
  const sheets = getSheetsClient();
  const atual = await comCota(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: ABA_TRATATIVAS + "!A:B" }),
  ).then((r) => comoTexto(r.data.values));
  const atualizadoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());
  const linha = [t.data, t.chave, t.rota, t.idParada, t.parada, t.tratado ? "SIM" : "", t.comentario, t.autor, atualizadoEm, t.motivoImpacto, t.excluido ? "SIM" : "", t.tratativaHxh];
  const idxs = atual.flatMap((l, i) => (i > 0 && l[0] === t.data && l[1] === t.chave ? [i] : []));
  if (idxs.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data: idxs.map((idx) => ({ range: `${ABA_TRATATIVAS}!A${idx + 1}:L${idx + 1}`, values: [linha] })),
      },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: FAIXA_TRATATIVAS,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [linha] },
    });
  }

  ultimaPlanilha = null;
  return { atualizadoEm };
}

let abaMotivosOk = false;

export async function gravarMotivo(motivo: string, autor: string): Promise<void> {
  if (!abaMotivosOk) {
    await garantirAba(ABA_MOTIVOS, ["MOTIVO", "AUTOR", "CRIADO_EM"]);
    abaMotivosOk = true;
  }
  const criadoEm = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
  await getSheetsClient().spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: FAIXA_MOTIVOS,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [[motivo, autor, criadoEm]] },
  });
  ultimaPlanilha = null;
}

export async function nsSemReversaoDoDia(dataBR: string, rotasNs: RotaNs[]) {
  if (!rotasNs.length) return { ofensores: [], pontos: [] };
  const [l, saldoBruto] = await Promise.all([lerMonitorD0(dataBR), lerSaldos()]);
  if (l.erro) return null;
  return nsSemReversao(rotasNs, l.visitas, l.plano, lerSaldoDosPontos(saldoBruto), l.rotasPontos);
}
