import { chaveRota } from "./hb.ts";

const texto = (v: unknown) => String(v ?? "").trim();

export const RISCO_PENDENTES_MIN = 5;
export const RISCO_ANTES_COLETA_MIN = 45;

export type EntregasExpress = {
  rotaId: string;
  rota: string;
  pendentes: number;
  falhas: number;
  sucesso: number;
  pacotes: number | null;

  paradas: number | null;

  sacas: number | null;

  paradasPendentes: number | null;

  sacasEntregues: number | null;

  consultadoEm: string;
};

const num = (v: string): number | null => {
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const hhmm = (v: string) => texto(v).match(/(\d{2}:\d{2})(?::\d{2})?$/)?.[1] ?? "";
export const minutosDe = (h: string): number | null => {
  const m = texto(h).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function lerEntregasExpress(linhas: string[][], dataBR: string): Record<string, EntregasExpress> {
  const saida: Record<string, EntregasExpress> = {};
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    id: i("ROUTE_ID"),
    rota: i("ROTA"),
    pend: i("PENDENTES"),
    falhas: i("FALHAS"),
    sucesso: i("SUCESSO"),
    pacotes: i("PACOTES"),
    paradas: i("PARADAS"),
    sacas: i("SACAS"),
    paradasPend: i("PARADAS_PENDENTES"),
    sacasEnt: i("SACAS_ENTREGUES"),
    em: i("CONSULTADO_EM"),
  };
  if (c.id < 0 || c.pend < 0) return saida;
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  for (const l of linhas.slice(1)) {
    if (c.data >= 0 && v(l, c.data) !== dataBR) continue;
    const pendentes = num(v(l, c.pend));
    if (pendentes === null) continue;
    const e: EntregasExpress = {
      rotaId: v(l, c.id),
      rota: v(l, c.rota),
      pendentes,
      falhas: num(v(l, c.falhas)) ?? 0,
      sucesso: num(v(l, c.sucesso)) ?? 0,
      pacotes: num(v(l, c.pacotes)),
      paradas: num(v(l, c.paradas)),
      sacas: num(v(l, c.sacas)),
      paradasPendentes: num(v(l, c.paradasPend)),
      sacasEntregues: num(v(l, c.sacasEnt)),
      consultadoEm: hhmm(v(l, c.em)),
    };
    if (e.rotaId) saida["ID:" + e.rotaId] = e;
    if (e.rota) saida[chaveRota(e.rota)] = e;
  }
  return saida;
}

export type NivelExpress = "concluidas" | "andamento" | "risco" | "v1" | "v1Logou" | "coletando" | "nsRota";

export function ehExpress10(e: EntregasExpress): boolean {
  return e.pendentes === 0 && e.sucesso === 0 && e.falhas === 0 && !e.pacotes && !e.paradas && !e.sacas;
}

export type RiscoExpress = {
  nivel: NivelExpress;
  feitas: number;
  total: number;

  texto: string;
  curto: string;
};

export function riscoExpress(
  e: EntregasExpress,
  ctx: {
    inicioColetaMin: number | null;
    janelaIniMin?: number | null;
    agoraMin: number;

    nsRota?: boolean;

    logouColeta?: boolean;

    coletando?: boolean;
  },
): RiscoExpress {
  const feitas = e.sucesso + e.falhas;
  const total = feitas + e.pendentes;
  const fracao = feitas + "/" + total;
  const base = "Entregas " + fracao;
  const r = (nivel: NivelExpress, curto: string, texto = curto): RiscoExpress => ({ nivel, feitas, total, texto, curto });
  if (ctx.nsRota) return r("nsRota", "NS Express", "Rota NS (não saiu para a coleta) · " + base);
  if (ehExpress10(e)) {
    return ctx.logouColeta
      ? r("v1Logou", "Express 1.0 · logou", "Express 1.0 · já logou na coleta")
      : r("v1", "Express 1.0 · risco alto", "Express 1.0 · sem visibilidade das entregas");
  }
  if (e.pendentes > 0 && ctx.coletando) return r("coletando", "Coletando · entregas " + fracao, base + " · já coletando");
  if (e.pendentes === 0) return r("concluidas", "Entregas concluídas");
  const ref = ctx.inicioColetaMin ?? ctx.janelaIniMin ?? null;
  if (ref !== null && e.pendentes >= RISCO_PENDENTES_MIN && ref - ctx.agoraMin <= RISCO_ANTES_COLETA_MIN) {
    const falta = ref - ctx.agoraMin;
    return r(
      "risco",
      "Risco · " + base,
      base + " · faltam " + e.pendentes + " entregas e " +
        (falta > 0 ? falta + " min para o início da coleta" : "a coleta já devia ter começado"),
    );
  }
  return r("andamento", base);
}

export function janelaDaRota(janelas: string[]): { ini: number | null; fim: number | null } {
  let ini: number | null = null;
  let fim: number | null = null;
  for (const j of janelas) {
    const hs = [...texto(j).matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
    if (!hs.length) continue;
    ini = ini === null ? hs[0] : Math.min(ini, hs[0]);
    const f = hs[hs.length - 1];
    fim = fim === null ? f : Math.max(fim, f);
  }
  return { ini, fim };
}
