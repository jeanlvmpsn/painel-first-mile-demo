import { chaveId, chaveRota, porId } from "./hb.ts";
import { ehDeCampinas } from "./hubs.ts";
import { totalColetado, totalEstimado, type LinhaMonitoring } from "./monitoringSeller.ts";
import type { ParadaColeta } from "./relatorioTipos.ts";

export type RecorteHub = {
  paradas: ParadaColeta[];

  aplicado: boolean;
  avulsasCps: number;
  avulsasFora: number;
  rotasFora: number;

  semConfig: boolean;

  pontosCps: Set<string>;

  pontosFora: Set<string>;
};

export function recortarCampinas(
  paradas: ParadaColeta[],
  atribuicao: { rota: string; regiao?: string }[],
  config: { rota: string; detalhe: { id: string }[] }[] | null,
): RecorteHub {
  const outras = new Set<string>();
  const cps = new Set<string>();
  for (const r of atribuicao) {
    const k = chaveRota(r.rota);
    if (!k) continue;
    if (ehDeCampinas(r.regiao)) cps.add(k);
    else outras.add(k);
  }
  const avulsasTodas = new Set(paradas.filter((p) => p.rotaSemNome).map((p) => p.rota));
  if (!outras.size) {
    return {
      paradas,
      aplicado: false,
      avulsasCps: avulsasTodas.size,
      avulsasFora: 0,
      rotasFora: 0,
      semConfig: false,
      pontosCps: new Set(),
      pontosFora: new Set(),
    };
  }

  const semConfig = !config || !config.length;
  const pontosCps = new Set<string>();
  for (const r of config ?? []) {
    if (!cps.has(chaveRota(r.rota))) continue;
    for (const p of r.detalhe) if (chaveId(p.id)) pontosCps.add(chaveId(p.id));
  }
  const avulsasCps = new Set<string>();
  for (const p of paradas) {
    if (p.rotaSemNome && (semConfig || pontosCps.has(chaveId(p.parada)))) avulsasCps.add(p.rota);
  }

  const rotasFora = new Set<string>();
  const saida = paradas.filter((p) => {
    if (p.rotaSemNome) return avulsasCps.has(p.rota);
    const fora = outras.has(chaveRota(p.rota));
    if (fora) rotasFora.add(chaveRota(p.rota));
    return !fora;
  });
  for (const p of saida) if (chaveId(p.parada)) pontosCps.add(chaveId(p.parada));
  const pontosFora = new Set<string>();
  for (const r of config ?? []) {
    if (!outras.has(chaveRota(r.rota))) continue;
    for (const p of r.detalhe) if (chaveId(p.id)) pontosFora.add(chaveId(p.id));
  }
  const ficou = new Set(saida);
  for (const p of paradas) if (!ficou.has(p) && chaveId(p.parada)) pontosFora.add(chaveId(p.parada));
  for (const id of pontosCps) pontosFora.delete(id);
  return {
    paradas: saida,
    aplicado: true,
    pontosCps,
    pontosFora,
    avulsasCps: avulsasCps.size,
    avulsasFora: avulsasTodas.size - avulsasCps.size,
    rotasFora: rotasFora.size,
    semConfig,
  };
}

export function pacotesSemOutrosHubs(
  tela: { estimados: number; coletados: number; atualizadoEm?: string } | null,
  linhas: LinhaMonitoring[],
  pontosFora: Set<string>,
): { estimados: number; coletados: number; atualizadoEm: string; descontados: { estimados: number; coletados: number } } | null {
  if (!tela || !linhas.length) return null;
  const mapa = new Map([...pontosFora].map((id) => [id, true]));
  const fora = (id: unknown) => porId(mapa, chaveId(id)) !== undefined;
  const deFora = linhas.filter((l) => fora(l.entidade) || (l.tipo.toLowerCase() !== "place" && fora(l.customerId)));
  const descontados = {
    estimados: deFora.reduce((s, l) => s + totalEstimado(l), 0),
    coletados: deFora.reduce((s, l) => s + totalColetado(l), 0),
  };
  return {
    estimados: Math.max(0, tela.estimados - descontados.estimados),
    coletados: Math.max(0, tela.coletados - descontados.coletados),
    atualizadoEm: tela.atualizadoEm || linhas[0]?.atualizadoEm || "",
    descontados,
  };
}

export function pacotesCampinas(
  linhas: LinhaMonitoring[],
  pontos: Set<string>,
): { estimados: number; coletados: number; atualizadoEm: string } | null {
  const mapa = new Map([...pontos].map((id) => [id, true]));
  const ehCps = (id: unknown) => porId(mapa, chaveId(id)) !== undefined;
  const doCps = linhas.filter(
    (l) => ehCps(l.entidade) || (l.tipo.toLowerCase() !== "place" && ehCps(l.customerId)),
  );
  if (!doCps.length) return null;
  return {
    estimados: doCps.reduce((s, l) => s + totalEstimado(l), 0),
    coletados: doCps.reduce((s, l) => s + totalColetado(l), 0),
    atualizadoEm: doCps[0]?.atualizadoEm ?? "",
  };
}
