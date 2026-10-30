import { chaveRota, texto } from "./hb.ts";
import { classificarPontualidade } from "./relatorioTipos.ts";

export type Motivo = "Parada cedo" | "NSE" | "Parada tarde" | "Apoio" | "normal";

export const MOTIVOS: Motivo[] = ["Parada cedo", "NSE", "Parada tarde", "Apoio", "normal"];

export type Sentido = "cedo" | "atrasada";

export const SENTIDO: Record<Motivo, Sentido | null> = {
  "Parada cedo": "cedo",
  NSE: "cedo",
  "Parada tarde": "atrasada",
  Apoio: "atrasada",
  normal: null,
};

const chaveTexto = (v: unknown) =>
  texto(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export function ehSemEspaco(motivo: unknown): boolean {
  return chaveTexto(motivo).includes("espaco");
}

export function ehNaoProgramada(planejado: unknown): boolean {
  const p = texto(planejado).toLowerCase();
  return p === "nao" || p === "não" || p === "no" || p === "false";
}

export type ColetaDaRota = {
  coletados: number;
  semEspaco: number;
  naoProgramadas: number;
  paradasCedo: number;
  paradasTarde: number;

  detalheCedo?: string[];
  detalheTarde?: string[];
};

const vazia = (): ColetaDaRota => ({
  coletados: 0,
  semEspaco: 0,
  naoProgramadas: 0,
  paradasCedo: 0,
  paradasTarde: 0,
  detalheCedo: [],
  detalheTarde: [],
});

type ParadaComMotivo = {
  parada?: string;
  rota: string;
  rotaSemNome?: boolean;
  rotaId?: string;
  coletados: number;
  motivo?: string;
  planejado?: string;
  pontualidade?: string;
};

function chaves(nome: string, id: string, semNome: boolean): string[] {
  const k: string[] = [];
  if (id) k.push("ID:" + id);
  if (!semNome && nome) k.push(chaveRota(nome));
  return k;
}

function somar(mapa: Map<string, ColetaDaRota>, ks: string[], c: ColetaDaRota) {
  const atual = ks.map((k) => mapa.get(k)).find(Boolean) ?? vazia();
  atual.coletados += c.coletados;
  atual.semEspaco += c.semEspaco;
  atual.naoProgramadas += c.naoProgramadas;
  atual.paradasCedo += c.paradasCedo;
  atual.paradasTarde += c.paradasTarde;
  atual.detalheCedo = [...(atual.detalheCedo ?? []), ...(c.detalheCedo ?? [])];
  atual.detalheTarde = [...(atual.detalheTarde ?? []), ...(c.detalheTarde ?? [])];
  for (const k of ks) mapa.set(k, atual);
}

export function coletaPorRota(paradas: ParadaComMotivo[]): Map<string, ColetaDaRota> {
  const mapa = new Map<string, ColetaDaRota>();
  for (const p of paradas) {
    const semNome = !!p.rotaSemNome;
    const ks = chaves(semNome ? "" : p.rota, texto(p.rotaId) || (semNome ? texto(p.rota) : ""), semNome);
    if (!ks.length) continue;
    const pont = classificarPontualidade(p.pontualidade ?? "");
    const nse = ehSemEspaco(p.motivo);

    const cedo = pont === "early" && !nse;
    const tarde = pont === "late";
    const rotulo = (texto(p.parada) || "?") + " (" + texto(p.pontualidade) + ")";
    somar(mapa, ks, {
      coletados: p.coletados || 0,
      semEspaco: nse ? 1 : 0,
      naoProgramadas: ehNaoProgramada(p.planejado) ? 1 : 0,
      paradasCedo: cedo ? 1 : 0,
      paradasTarde: tarde ? 1 : 0,
      detalheCedo: cedo ? [rotulo] : [],
      detalheTarde: tarde ? [rotulo] : [],
    });
  }
  return mapa;
}

export type LinhaHistoricoColeta = {
  rota: string;
  id: string;
  coletados?: number;
  motivo?: string;
  semEspaco?: number;
  naoPlanejadas?: number;
  paradasCedo?: number;
  paradasTarde?: number;
};

export function coletaDoHistorico(linhas: LinhaHistoricoColeta[]): Map<string, ColetaDaRota> {
  const mapa = new Map<string, ColetaDaRota>();
  for (const l of linhas) {
    const ks = chaves(l.rota, texto(l.id), false);
    if (!ks.length) continue;
    const semEspaco =
      l.semEspaco !== undefined ? l.semEspaco : texto(l.motivo).split(",").filter((m) => ehSemEspaco(m)).length;
    const c: ColetaDaRota = {
      coletados: l.coletados ?? 0,
      semEspaco,
      naoProgramadas: l.naoPlanejadas ?? 0,
      paradasCedo: l.paradasCedo ?? 0,
      paradasTarde: l.paradasTarde ?? 0,
    };
    for (const k of ks) mapa.set(k, c);
  }
  return mapa;
}

export type Diagnostico = {
  motivos: Motivo[];
  semEspaco: number;
  naoProgramadas: number;
  paradasCedo: number;
  paradasTarde: number;
  detalheCedo: string[];
  detalheTarde: string[];
};

export function diagnosticar(coleta: ColetaDaRota | undefined, sentido?: Sentido): Diagnostico | null {
  if (!coleta) return null;
  const achados: Motivo[] = [];
  if (coleta.paradasCedo > 0) achados.push("Parada cedo");

  if (coleta.semEspaco > 0 && coleta.coletados > 0) achados.push("NSE");
  if (coleta.paradasTarde > 0) achados.push("Parada tarde");
  if (coleta.naoProgramadas > 0) achados.push("Apoio");
  const motivos = sentido ? achados.filter((m) => SENTIDO[m] === sentido) : achados;
  if (!motivos.length) motivos.push("normal");
  return {
    motivos,
    semEspaco: coleta.semEspaco,
    naoProgramadas: coleta.naoProgramadas,
    paradasCedo: coleta.paradasCedo,
    paradasTarde: coleta.paradasTarde,
    detalheCedo: coleta.detalheCedo ?? [],
    detalheTarde: coleta.detalheTarde ?? [],
  };
}

export function diagnosticoDasRotas<R extends { rota: string; rotaId: string }>(
  rotas: R[],
  coletas: Map<string, ColetaDaRota>,
  sentido: (r: R) => Sentido | null,
): (R & { diagnostico: Diagnostico | null })[] {
  const achar = (r: R) => (r.rotaId && coletas.get("ID:" + r.rotaId)) || coletas.get(chaveRota(r.rota));
  return rotas.map((r) => {
    const s = sentido(r);
    return { ...r, diagnostico: s ? diagnosticar(achar(r), s) : null };
  });
}
