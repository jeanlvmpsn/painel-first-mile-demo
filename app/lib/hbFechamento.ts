import { chaveId, porId, texto } from "./hb.ts";
import type { LinhaMonitoring } from "./monitoringSeller.ts";
import { totalColetado, totalEstimado } from "./monitoringSeller.ts";
import { metricasDeColeta, type Fechamento, type Monitoramento, type ParadaColeta } from "./relatorioTipos.ts";

export type PuOficialHB = { data: string; numerador: number; denominador: number; pu: number };

export type ParadaHBReal = {
  id: string;
  sellerId: string;
  seller: string;

  pacotesHb: number;
  oversize: number;
  dias: number;
  ultimoDia: string;
};

export function lerParadasHB(linhas: string[][]): { paradas: Map<string, ParadaHBReal>; atualizadoEm: string } {
  const paradas = new Map<string, ParadaHBReal>();
  if (linhas.length < 2) return { paradas, atualizadoEm: "" };
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    id: i("ID_PARADA"),
    sellerId: i("SELLER_ID"),
    seller: i("SELLER"),
    pacotes: i("PACOTES_HB"),
    oversize: i("OVERSIZE"),
    dias: i("DIAS_COM_HB"),
    ultimo: i("ULTIMO_DIA"),
    atualizado: i("ATUALIZADO_EM"),
  };
  if (c.id < 0) return { paradas, atualizadoEm: "" };
  const num = (l: string[], k: number) => (k < 0 ? 0 : Number(texto(l[k])) || 0);
  let atualizadoEm = "";
  for (const l of linhas.slice(1)) {
    const id = chaveId(l[c.id]);
    if (!id) continue;
    paradas.set(id, {
      id,
      sellerId: c.sellerId < 0 ? "" : chaveId(l[c.sellerId]),
      seller: c.seller < 0 ? "" : texto(l[c.seller]),
      pacotesHb: num(l, c.pacotes),
      oversize: num(l, c.oversize),
      dias: num(l, c.dias),
      ultimoDia: c.ultimo < 0 ? "" : texto(l[c.ultimo]),
    });
    if (!atualizadoEm && c.atualizado >= 0) atualizadoEm = texto(l[c.atualizado]);
  }
  return { paradas, atualizadoEm };
}

export function ehParadaHB(paradas: Map<string, ParadaHBReal>, id: unknown): boolean {
  return porId(paradas, chaveId(id)) !== undefined;
}

export function puOficialDoDia(
  linhas: string[][],
  dataISO: string,
): { data: string; numerador: number; denominador: number; pu: number } | null {
  if (linhas.length < 2) return null;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const [iData, iNum, iDen] = ["DATA", "NUMERADOR", "DENOMINADOR"].map((n) => cab.indexOf(n));
  if (iData < 0 || iNum < 0 || iDen < 0) return null;
  const dias = linhas
    .slice(1)
    .map((l) => ({
      data: texto(l[iData]).slice(0, 10),
      numerador: Number(texto(l[iNum])) || 0,
      denominador: Number(texto(l[iDen])) || 0,
    }))
    .filter((d) => d.data && d.data <= dataISO && d.denominador >= MINIMO_DENOMINADOR)
    .sort((a, b) => b.data.localeCompare(a.data));
  const d = dias[0];
  return d ? { ...d, pu: (d.numerador / d.denominador) * 100 } : null;
}

const MINIMO_DENOMINADOR = 100;

export function comPacotesHB(f: Fechamento, oficial: PuOficialHB | null, dataISO: string): Fechamento {
  if (!oficial || oficial.data !== dataISO) return { ...f, sprExec: null, pacotesPendentes: true };
  const pu = oficial.denominador > 0 ? (oficial.numerador / oficial.denominador) * 100 : 0;
  return {
    ...f,
    pacotes: {
      ...f.pacotes,
      estimados: oficial.denominador,
      coletados: oficial.numerador,
      estimadosPorParada: oficial.denominador,
      pu,
      puNoAlvo: pu >= f.pacotes.alvoPu,
    },
    sprExec: f.rotasTT > 0 ? oficial.numerador / f.rotasTT : null,
    pacotesPendentes: false,
  };
}

export function monitoramentoHB(
  linhas: LinhaMonitoring[],
  paradas: Map<string, ParadaHBReal>,
  coletasHB: ParadaColeta[],
): Monitoramento | null {
  const doHB = linhas.filter(
    (l) =>
      ehParadaHB(paradas, l.entidade) ||
      (l.tipo.toLowerCase() !== "place" && ehParadaHB(paradas, l.customerId)),
  );
  if (!doHB.length) return null;
  const m = metricasDeColeta(coletasHB);
  return {
    estimados: doHB.reduce((s, l) => s + totalEstimado(l), 0),
    coletados: doHB.reduce((s, l) => s + totalColetado(l), 0),
    rotasAvulsas: m.rotasAvulsas,
    paradasTotal: m.totalParadas,
  };
}

export type ComparacaoLista = {
  paradas: (ParadaHBReal & { naListaCurada: boolean })[];

  soNaListaCurada: string[];
};

export function compararComListaCurada(
  doDia: ParadaHBReal[],
  todas: Map<string, ParadaHBReal>,
  curada: Map<string, { rotulo: string }>,
): ComparacaoLista {
  const sellerDe = (p: ParadaHBReal) => p.sellerId || p.id.split("_")[0];
  const naCurada = (p: ParadaHBReal) => curada.has(sellerDe(p)) || curada.has(p.id.split("_")[0]);
  const sellersReais = new Set([...todas.values()].flatMap((p) => [sellerDe(p), p.id.split("_")[0]]));
  return {
    paradas: doDia
      .map((p) => ({ ...p, naListaCurada: naCurada(p) }))
      .sort((a, b) => b.pacotesHb - a.pacotesHb),
    soNaListaCurada: [...curada.entries()]
      .filter(([id]) => !sellersReais.has(id))
      .map(([id, s]) => s.rotulo + " (" + id + ")"),
  };
}

export const CAB_HISTORICO_FECHAMENTO_HB = [
  "DATA",
  "ESTIMADOS",
  "COLETADOS",
  "PU",
  "ROTAS_HB",
  "PARADAS_HB",
  "ROTAS_ATRIBUIDAS",
  "NS",
  "ROTAS_TT",
  "ROTAS_CONFIG",
  "DADOS",
  "GRAVADO_EM",
];

export type FechamentoHBSalvo = {
  fechamento: Fechamento;
  rotasConfig: number | null;
  paradasHB: number;
  rotasHB: number;
  temColeta: boolean;
  temMonitoramento: boolean;

  atualizadoEm: string;
};

export function linhaHistoricoFechamentoHB(
  d: FechamentoHBSalvo,
  dataBR: string,
  gravadoEm: string,
): (string | number)[] {
  const f = d.fechamento;
  return [
    dataBR,
    f.pacotes.estimados,
    f.pacotes.coletados,
    Number(f.pacotes.pu.toFixed(2)),
    d.rotasHB,
    d.paradasHB,
    f.rotasAtribuidas,
    f.ns,
    f.rotasTT,
    d.rotasConfig ?? "",
    JSON.stringify(d),
    gravadoEm,
  ];
}

function dataBRDe(v: string): string {
  const t = texto(v);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1];
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return br ? br[1].padStart(2, "0") + "/" + br[2].padStart(2, "0") + "/" + br[3] : t;
}

export function lerHistoricoFechamentoHB(
  linhas: string[][],
  dataBR: string,
): { salvo: FechamentoHBSalvo; gravadoEm: string } | null {
  if (linhas.length < 2) return null;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const [iData, iDados, iGravado] = ["DATA", "DADOS", "GRAVADO_EM"].map((n) => cab.indexOf(n));
  if (iData < 0 || iDados < 0) return null;
  for (let i = linhas.length - 1; i >= 1; i--) {
    const l = linhas[i] ?? [];
    if (dataBRDe(l[iData] ?? "") !== dataBR) continue;
    try {
      const salvo = JSON.parse(texto(l[iDados])) as FechamentoHBSalvo;
      if (!salvo || !salvo.fechamento || !salvo.fechamento.pacotes) return null;
      return { salvo, gravadoEm: iGravado >= 0 ? texto(l[iGravado]) : "" };
    } catch {
      return null;
    }
  }
  return null;
}
