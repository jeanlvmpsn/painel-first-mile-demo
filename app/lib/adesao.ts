export type PontoAdesao = {
  data: string;
  transportadora: string;

  total: number;

  concluidas: number;

  ns: number;
};

export type Periodo = "dia" | "semana" | "mes";
export type Escala = "bruto" | "percentual";

export const TODAS = "__todas__";

function pedacos(dataBR: string): [number, number, number] | null {
  const m = String(dataBR ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return [Number(m[3]), Number(m[2]), Number(m[1])];
}

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function agrupadorDe(
  dataBR: string,
  periodo: Periodo
): { chave: string; rotulo: string } | null {
  const p = pedacos(dataBR);
  if (!p) return null;
  const [ano, mes, dia] = p;
  const d = new Date(Date.UTC(ano, mes - 1, dia));

  if (periodo === "dia") {
    return {
      chave: d.toISOString().slice(0, 10),
      rotulo: String(dia).padStart(2, "0") + "/" + String(mes).padStart(2, "0"),
    };
  }

  if (periodo === "mes") {
    return {
      chave: ano + "-" + String(mes).padStart(2, "0"),
      rotulo: MESES[mes - 1] + "/" + String(ano).slice(2),
    };
  }

  const diaDaSemana = d.getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  const segunda = new Date(d.getTime() - recuo * 86400000);

  return {
    chave: segunda.toISOString().slice(0, 10),
    rotulo: "W" + semanaISO(d),
  };
}

function semanaISO(d: Date): number {
  const quinta = new Date(d.getTime());
  const desloca = (quinta.getUTCDay() + 6) % 7;
  quinta.setUTCDate(quinta.getUTCDate() - desloca + 3);
  const primeira = new Date(Date.UTC(quinta.getUTCFullYear(), 0, 4));
  const deslocaPrimeira = (primeira.getUTCDay() + 6) % 7;
  primeira.setUTCDate(primeira.getUTCDate() - deslocaPrimeira + 3);
  return 1 + Math.round((quinta.getTime() - primeira.getTime()) / 604800000);
}

export type Serie = {
  nome: string;

  valores: (number | null)[];

  base: (number | null)[];

  concluidas: (number | null)[];
};

export type SerieAgrupada = {
  eixo: { chave: string; rotulo: string }[];
  series: Serie[];

  rotasNoPeriodo: number[];
};

type Acumulado = { total: number; concluidas: number; ns: number };

function vazio(): Acumulado {
  return { total: 0, concluidas: 0, ns: 0 };
}

function somar(a: Acumulado, p: PontoAdesao): void {
  a.total += p.total;
  a.concluidas += p.concluidas;
  a.ns += p.ns;
}

function valorDe(a: Acumulado, escala: Escala): number | null {
  if (escala === "bruto") return a.concluidas;
  const base = a.total - a.ns;
  if (base <= 0) return null;
  return (a.concluidas / base) * 100;
}

export const MAX_DIAS = 15;

export function agruparAdesao(
  pontos: PontoAdesao[],
  opcoes: {
    periodo: Periodo;
    escala: Escala;
    transportadoras: string[];

    periodos?: string[];
  }
): SerieAgrupada {
  const { periodo, escala, transportadoras, periodos = [] } = opcoes;

  const rotulos = new Map<string, string>();
  const porBase = new Map<string, Acumulado>();
  const porTp = new Map<string, Map<string, Acumulado>>();

  for (const p of pontos) {
    const g = agrupadorDe(p.data, periodo);
    if (!g) continue;
    if (periodos.length > 0 && !periodos.includes(g.chave)) continue;
    rotulos.set(g.chave, g.rotulo);

    const b = porBase.get(g.chave) ?? vazio();
    somar(b, p);
    porBase.set(g.chave, b);

    if (!transportadoras.includes(p.transportadora)) continue;
    const dela = porTp.get(p.transportadora) ?? new Map<string, Acumulado>();
    const a = dela.get(g.chave) ?? vazio();
    somar(a, p);
    dela.set(g.chave, a);
    porTp.set(p.transportadora, dela);
  }

  let chaves = [...rotulos.keys()].sort();
  if (periodo === "dia" && periodos.length === 0) {
    chaves = chaves.slice(-MAX_DIAS);
  }
  const eixo = chaves.map((chave) => ({ chave, rotulo: rotulos.get(chave)! }));

  const series: Serie[] = transportadoras.map((nome) => {
    const dela = porTp.get(nome);
    const acs = chaves.map((chave) => dela?.get(chave) ?? null);
    return {
      nome,
      valores: acs.map((a) => (a ? valorDe(a, escala) : null)),
      base: acs.map((a) => (a ? Math.max(a.total - a.ns, 0) : null)),
      concluidas: acs.map((a) => (a ? a.concluidas : null)),
    };
  });

  return {
    eixo,
    series,
    rotasNoPeriodo: chaves.map((chave) => porBase.get(chave)?.total ?? 0),
  };
}

export function periodosDisponiveis(
  pontos: PontoAdesao[],
  periodo: Periodo
): { chave: string; rotulo: string }[] {
  const rotulos = new Map<string, string>();
  for (const p of pontos) {
    const g = agrupadorDe(p.data, periodo);
    if (g) rotulos.set(g.chave, g.rotulo);
  }
  const lista = [...rotulos.keys()]
    .sort()
    .map((chave) => ({ chave, rotulo: rotulos.get(chave)! }));

  return periodo === "dia" ? lista.slice(-MAX_DIAS) : lista;
}

export function transportadorasDaSerie(pontos: PontoAdesao[]): string[] {
  const soma = new Map<string, number>();
  for (const p of pontos) {
    soma.set(p.transportadora, (soma.get(p.transportadora) ?? 0) + p.total);
  }
  return [...soma.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([nome]) => nome);
}
