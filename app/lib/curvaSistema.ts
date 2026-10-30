import { texto } from "./hb.ts";
import { PRIMEIRA_CHEGADA_MIN, type Faixa, type Medida, type RotaCurva } from "./curvaChegada.ts";

export type ResumoSistema = {
  aCaminho: number;
  chegaram: number;
  descarregando: number;
  finalizadas: number;
};

export type CurvaSistema = {
  resumo: ResumoSistema;
  faixas: Faixa[];

  madrugada: number;
};

export type LeituraSistema = {
  curvas: Partial<Record<Medida, CurvaSistema>>;
  atualizadoEm: string;
};

const TIPOS: Record<string, Medida> = { pacotes: "pacotes", veiculos: "veiculos" };

export function lerCurvaSistema(linhas: string[][], dataBR: string): LeituraSistema {
  const vazio: LeituraSistema = { curvas: {}, atualizadoEm: "" };
  if (linhas.length < 2) return vazio;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    tipo: i("TIPO"),
    faixa: i("FAIXA"),
    planejado: i("PLANEJADO"),
    executado: i("EXECUTADO"),
    transito: i("EM_TRANSITO"),
    aCaminho: i("A_CAMINHO"),
    chegaram: i("CHEGARAM"),
    descarregando: i("DESCARREGANDO"),
    finalizadas: i("FINALIZADAS"),
    atualizado: i("ATUALIZADO_EM"),
  };
  if (c.data < 0 || c.tipo < 0 || c.faixa < 0) return vazio;
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const n = (l: string[], k: number) => Number(v(l, k).replace(",", ".")) || 0;

  const porTipo = new Map<Medida, { resumo: ResumoSistema; faixas: Map<number, Faixa> }>();
  let atualizadoEm = "";
  for (const l of linhas.slice(1)) {
    if (v(l, c.data) !== dataBR) continue;
    const medida = TIPOS[v(l, c.tipo).toLowerCase()];
    const hora = v(l, c.faixa).match(/^(\d{1,2}):/);
    if (!medida || !hora) continue;
    const at = v(l, c.atualizado);
    if (at > atualizadoEm) atualizadoEm = at;
    const t = porTipo.get(medida) ?? {
      resumo: {
        aCaminho: n(l, c.aCaminho),
        chegaram: n(l, c.chegaram),
        descarregando: n(l, c.descarregando),
        finalizadas: n(l, c.finalizadas),
      },
      faixas: new Map<number, Faixa>(),
    };
    porTipo.set(medida, t);
    const h = Number(hora[1]);
    t.faixas.set(h, {
      hora: h,
      rotulo: v(l, c.faixa),
      planejado: n(l, c.planejado),
      executado: n(l, c.executado),
      transito: n(l, c.transito),
    });
  }

  const curvas: LeituraSistema["curvas"] = {};
  for (const [medida, t] of porTipo) {
    const primeiraHora = PRIMEIRA_CHEGADA_MIN / 60;
    const ordenadas = [...t.faixas.values()].sort((a, b) => a.hora - b.hora);
    const madrugada = ordenadas.filter((f) => f.hora < primeiraHora).reduce((s, f) => s + f.executado, 0);
    const todas = ordenadas.filter((f) => f.hora >= primeiraHora);

    const comMovimento = todas.filter((f) => f.planejado || f.executado || f.transito).map((f) => f.hora);
    const de = Math.min(8, ...comMovimento);
    const ate = Math.max(22, ...comMovimento);
    curvas[medida] = { resumo: t.resumo, faixas: todas.filter((f) => f.hora >= de && f.hora <= ate), madrugada };
  }
  return { curvas, atualizadoEm };
}

export function minutosDaCopia(atualizadoEm: string): number | null {
  const m = atualizadoEm.match(/(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function comPlanejadoDaConfig(sistema: Faixa[], plano: Faixa[]): Faixa[] {
  const porHora = new Map<number, Faixa>();
  for (const f of sistema) porHora.set(f.hora, { ...f, planejado: 0 });
  for (const p of plano) {
    if (!p.planejado) continue;
    const f = porHora.get(p.hora) ?? { hora: p.hora, rotulo: p.rotulo, planejado: 0, executado: 0, transito: 0 };
    f.planejado = p.planejado;
    porHora.set(p.hora, f);
  }
  const horas = [...porHora.keys()];
  const de = Math.min(...horas);
  const ate = Math.max(...horas);
  const saida: Faixa[] = [];
  for (let h = de; h <= ate; h++) {
    const hh = String(h % 24).padStart(2, "0");
    saida.push(porHora.get(h) ?? { hora: h, rotulo: hh + ":00 - " + hh + ":59", planejado: 0, executado: 0, transito: 0 });
  }
  return saida;
}

export function semNsNoExecutado(faixas: Faixa[], rotas: RotaCurva[], medida: Medida): Faixa[] {
  if (medida !== "veiculos") return faixas;
  const porHora = new Map<number, number>();
  for (const r of rotas) {
    if (!r.foraDaCurva || r.chegadaSistemaMin == null) continue;
    const h = Math.floor(r.chegadaSistemaMin / 60);
    porHora.set(h, (porHora.get(h) ?? 0) + 1);
  }
  if (!porHora.size) return faixas;
  return faixas.map((f) => {
    const ns = porHora.get(f.hora);
    return ns ? { ...f, executado: Math.max(0, f.executado - ns) } : f;
  });
}
