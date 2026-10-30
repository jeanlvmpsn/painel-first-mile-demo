export type RotaPlanejada = {
  data: string;
  rota: string;
  start: string;
  transportadora: string;
  placa: string;
  regiao: string;
  cluster: string;
  atribuida: boolean;

  motorista?: string;
  statusVeiculo?: string;
  statusMotorista?: string;

  tipoRota?: string;

  perfil?: string;
  veiculoTipo?: string;

  perfilMenor?: boolean;

  doHistorico?: boolean;
};

export type TipoRota = "FM" | "Express";

export function tipoDaRota(tipoRota: string | undefined): TipoRota | null {
  const t = String(tipoRota ?? "").trim().toLowerCase();
  if (!t) return null;
  return t === "express" ? "Express" : "FM";
}

export const PERFIS = [
  "Carreta",
  "Truck",
  "Toco",
  "Médio",
  "HR",
  "VUC",
  "Van",
  "Utilitário",
] as const;

export const PERFIL_OUTROS = "Outros";

const PADROES_PERFIL: { perfil: string; regex: RegExp }[] = [
  { perfil: "Carreta", regex: /\bcarretas?\b/ },
  { perfil: "Truck", regex: /\btrucks?\b/ },
  { perfil: "Toco", regex: /\btocos?\b/ },

  { perfil: "Médio", regex: /\bmedios?\b|(^|[^0-9])3\s*\/\s*4([^0-9]|$)/ },
  { perfil: "HR", regex: /\bhr\b/ },
  { perfil: "VUC", regex: /\bvucs?\b/ },

  { perfil: "Van", regex: /\bvans?\b|\byellow pool\b/ },
  { perfil: "Utilitário", regex: /\butilitarios?\b/ },
];

export function perfilCanonico(nome: string | undefined | null): string {
  const limpo = String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (!limpo) return "";
  for (const p of PADROES_PERFIL) if (p.regex.test(limpo)) return p.perfil;
  return PERFIL_OUTROS;
}

export const SEM_PERFIL = "Sem perfil";
export const SEM_RESPOSTA = "Sem resposta";

export function perfilPlanejado(r: { perfil?: string }): string {
  return perfilCanonico(r.perfil) || SEM_PERFIL;
}

export function perfilAtendido(r: { resposta?: { perfilVeiculo?: string } }): string {
  if (!r.resposta) return SEM_RESPOSTA;
  return perfilCanonico(r.resposta.perfilVeiculo) || SEM_PERFIL;
}

export function opcoesDePerfil(valores: Iterable<string>): string[] {
  const achados = new Set(valores);
  return [...PERFIS, PERFIL_OUTROS, SEM_PERFIL, SEM_RESPOSTA].filter((p) => achados.has(p));
}

export type Grupo = {
  chave: string;
  total: number;
  atribuidas: number;
  naoAtribuidas: number;
  percAtribuidas: number;

  semPorRegiao: { regiao: string; qtd: number }[];
};

export type Ordem =
  | "maisNaoAtribuidas"
  | "menosNaoAtribuidas"
  | "maiorVolume"
  | "nome";

export function agrupar(
  rotas: RotaPlanejada[],
  campo: (r: RotaPlanejada) => string,
): Grupo[] {
  const mapa = new Map<string, Grupo>();
  const pendentes = new Map<string, Map<string, number>>();
  for (const r of rotas) {
    const chave = campo(r) || "Sem transportadora";
    const atual = mapa.get(chave) ?? {
      chave,
      total: 0,
      atribuidas: 0,
      naoAtribuidas: 0,
      percAtribuidas: 0,
      semPorRegiao: [],
    };
    atual.total += 1;
    if (r.atribuida) {
      atual.atribuidas += 1;
    } else {
      atual.naoAtribuidas += 1;
      const porRegiao = pendentes.get(chave) ?? new Map<string, number>();
      porRegiao.set(r.regiao, (porRegiao.get(r.regiao) ?? 0) + 1);
      pendentes.set(chave, porRegiao);
    }
    mapa.set(chave, atual);
  }
  const saida = [...mapa.values()];
  for (const g of saida) {
    g.percAtribuidas = g.total > 0 ? (g.atribuidas / g.total) * 100 : 0;
    const porRegiao = pendentes.get(g.chave) ?? new Map<string, number>();
    g.semPorRegiao = [...porRegiao.entries()]
      .map(([regiao, qtd]) => ({ regiao, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }
  return saida;
}

export function ordenar(grupos: Grupo[], ordem: Ordem): Grupo[] {
  const copia = [...grupos];
  switch (ordem) {
    case "maisNaoAtribuidas":
      return copia.sort(
        (a, b) => b.naoAtribuidas - a.naoAtribuidas || b.total - a.total,
      );
    case "menosNaoAtribuidas":
      return copia.sort(
        (a, b) => a.naoAtribuidas - b.naoAtribuidas || b.total - a.total,
      );
    case "maiorVolume":
      return copia.sort((a, b) => b.total - a.total);
    case "nome":
      return copia.sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
  }
}

export function resumir(rotas: RotaPlanejada[]) {
  const total = rotas.length;
  const atribuidas = rotas.filter((r) => r.atribuida).length;
  const naoAtribuidas = total - atribuidas;
  return {
    total,
    atribuidas,
    naoAtribuidas,
    percAtribuidas: total > 0 ? (atribuidas / total) * 100 : 0,
    percNaoAtribuidas: total > 0 ? (naoAtribuidas / total) * 100 : 0,
  };
}

export function formatarPercentual(valor: number): string {
  const inteiro = Math.round(valor);
  if (inteiro === 100 && valor < 100) return "99%";
  if (inteiro === 0 && valor > 0) return "1%";
  return inteiro + "%";
}

export function valoresUnicos(
  rotas: RotaPlanejada[],
  campo: (r: RotaPlanejada) => string,
): string[] {
  const set = new Set<string>();
  for (const r of rotas) {
    const v = campo(r);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
