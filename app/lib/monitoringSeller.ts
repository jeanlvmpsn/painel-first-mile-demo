import { chaveId } from "./hb.ts";

export type Numeros = { edpu: number; backlog: number; early: number };

export type LinhaMonitoring = {
  customerId: string;

  entidade: string;
  tipo: string;
  nome: string;
  estimado: Numeros;
  preparado: Numeros;
  coletado: Numeros;
  atualizadoEm: string;
};

const soma = (n: Numeros) => n.edpu + n.backlog + n.early;

export const totalEstimado = (l: LinhaMonitoring) => soma(l.estimado);
export const totalPreparado = (l: LinhaMonitoring) => soma(l.preparado);
export const totalColetado = (l: LinhaMonitoring) => soma(l.coletado);

const numero = (v: unknown) => {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function lerMonitoring(linhas: string[][]): LinhaMonitoring[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map((c) => String(c ?? "").trim().toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const col = {
    atualizado: i("ATUALIZADO_EM"),
    customer: i("CUSTOMER_ID"),
    entidade: i("RELATED_ENTITY_ID"),
    tipo: i("TIPO"),
    nome: i("NOME"),
  };
  if (col.customer < 0 && col.entidade < 0) return [];
  const nums = (l: string[], prefixo: string): Numeros => ({
    edpu: numero(l[i(prefixo + "_EDPU")]),
    backlog: numero(l[i(prefixo + "_BACKLOG")]),
    early: numero(l[i(prefixo + "_EARLY")]),
  });
  const txt = (l: string[], c: number) => (c < 0 ? "" : String(l[c] ?? "").trim());

  const saida: LinhaMonitoring[] = [];
  for (const l of linhas.slice(1)) {
    const customerId = txt(l, col.customer);
    const entidade = txt(l, col.entidade);
    if (!customerId && !entidade) continue;
    saida.push({
      customerId,
      entidade,
      tipo: txt(l, col.tipo),
      nome: txt(l, col.nome),
      estimado: nums(l, "ESTIMADO"),
      preparado: nums(l, "PREPARADO"),
      coletado: nums(l, "COLETADO"),
      atualizadoEm: txt(l, col.atualizado),
    });
  }
  return saida;
}

export function idsDaLinha(l: LinhaMonitoring): string[] {
  const ids = new Set<string>();
  const entidade = chaveId(l.entidade);
  if (entidade) ids.add(entidade);
  if (/_/.test(entidade)) ids.add(entidade.split("_")[0]);
  if (l.customerId && l.tipo.toLowerCase() !== "place") ids.add(chaveId(l.customerId));
  ids.delete("");
  return [...ids];
}

export function indexarMonitoring(
  linhas: LinhaMonitoring[],
): Map<string, LinhaMonitoring[]> {
  const mapa = new Map<string, LinhaMonitoring[]>();
  for (const l of linhas) {
    for (const id of idsDaLinha(l)) {
      const lista = mapa.get(id) ?? [];
      lista.push(l);
      mapa.set(id, lista);
    }
  }
  return mapa;
}

export function estimadoDoId(
  indice: Map<string, LinhaMonitoring[]>,
  id: string,
): number | null {
  const achadas = indice.get(chaveId(id));
  if (!achadas?.length) return null;
  return achadas.reduce((s, l) => s + totalEstimado(l), 0);
}
