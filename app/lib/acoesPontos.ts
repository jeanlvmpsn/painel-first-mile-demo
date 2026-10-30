import { chaveId } from "./hb.ts";

export const CAB_ACOES = [
  "ID_PARADA", "VERSAO", "REGISTRADO_EM", "AUTOR", "PONTO", "CLUSTER", "CAUSA", "STATUS",
  "ACAO", "DIA_IMPACTO", "EXCLUIDO", "ID_DIRECIONAL", "NOME_DIRECIONAL", "RESPONSAVEL",
] as const;

export const STATUS_ACAO = ["A tratar", "Em tratativa", "Resolvido", "Reprovado"] as const;

export const STATUS_ACAO_ANTIGOS = ["Culpa transportadora", "Erro sistêmico"] as const;
export type StatusAcao = (typeof STATUS_ACAO)[number] | (typeof STATUS_ACAO_ANTIGOS)[number];

export const CATEGORIAS_ACAO = [
  "Capacidade", "Volumoso", "Frágil", "Horário", "Comportamental", "NS", "Pesado", "Área inacessível",
] as const;
export type CategoriaAcao = string;

export const RESPONSAVEIS_ACAO = ["Exec", "CCO", "Place", "Routing", "Planejamento"] as const;

export type VersaoAcao = {
  versao: number;

  registradoEm: string;
  autor: string;
  categoria: CategoriaAcao;

  responsavel: string;
  status: StatusAcao;

  idDirecional: string;
  nomeDirecional: string;
  comentario: string;

  diaImpacto: string;
  excluido: boolean;
};

export type AcaoPonto = VersaoAcao & {
  idParada: string;
  ponto: string;
  cluster: string;

  criadoEm: string;
  criadoPor: string;

  historico: VersaoAcao[];
};

export type NovaAcao = {
  idParada: string;
  ponto: string;
  cluster: string;
  categoria: string;
  responsavel?: string;
  status: string;
  idDirecional?: string;
  nomeDirecional?: string;
  comentario: string;
  diaImpacto: string;
  autor: string;
  excluido?: boolean;
};

const texto = (v: unknown) => String(v ?? "").trim();
const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function statusValido(v: unknown): StatusAcao {
  const t = semAcento(texto(v));
  return [...STATUS_ACAO, ...STATUS_ACAO_ANTIGOS].find((s) => semAcento(s) === t) ?? "A tratar";
}

export function categoriaValida(v: unknown): CategoriaAcao {
  const bruto = texto(v).replace(/\s+/g, " ").slice(0, 40);
  const t = semAcento(bruto);
  return CATEGORIAS_ACAO.find((c) => semAcento(c) === t) ?? (bruto || "Sem causa");
}

export function responsavelValido(v: unknown): string {
  const bruto = texto(v).replace(/\s+/g, " ").slice(0, 30);
  const t = semAcento(bruto);
  return RESPONSAVEIS_ACAO.find((c) => semAcento(c) === t) ?? bruto;
}

function listaComCriadas(padrao: readonly string[], criadas: string[], valida: (v: string) => string): string[] {
  const vistas = new Set(padrao.map(semAcento));
  const novas: string[] = [];
  for (const c of criadas) {
    const nome = valida(c);
    const k = semAcento(nome);
    if (!nome || vistas.has(k)) continue;
    vistas.add(k);
    novas.push(nome);
  }
  return [...padrao, ...novas.sort((a, b) => a.localeCompare(b, "pt-BR"))];
}

export function listaCausas(criadas: string[]): string[] {
  return listaComCriadas(CATEGORIAS_ACAO, criadas, categoriaValida);
}

export function listaResponsaveis(criados: string[]): string[] {
  return listaComCriadas(RESPONSAVEIS_ACAO, criados, responsavelValido);
}

export function ordemData(d: string): number {
  const m = texto(d).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return 0;
  return Number(m[3] + m[2] + m[1] + (m[4] ?? "00") + (m[5] ?? "00") + (m[6] ?? "00"));
}

export function lerAcoes(linhas: string[][]): Record<string, AcaoPonto> {
  if (linhas.length < 2) return {};
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = Object.fromEntries(CAB_ACOES.map((n) => [n, i(n)])) as Record<(typeof CAB_ACOES)[number], number>;
  if (c.CAUSA < 0) c.CAUSA = i("CATEGORIA");
  if (c.ACAO < 0) c.ACAO = i("COMENTARIO");
  if (c.ID_PARADA < 0) return {};
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const porPonto = new Map<string, { idParada: string; ponto: string; cluster: string; versoes: VersaoAcao[] }>();
  linhas.slice(1).forEach((l, n) => {
    const id = v(l, c.ID_PARADA);
    const k = chaveId(id);
    if (!k) return;
    const g = porPonto.get(k) ?? { idParada: id, ponto: "", cluster: "", versoes: [] };

    g.ponto = v(l, c.PONTO) || g.ponto;
    g.cluster = v(l, c.CLUSTER) || g.cluster;
    g.versoes.push({
      versao: Number(v(l, c.VERSAO)) || n + 1,
      registradoEm: v(l, c.REGISTRADO_EM),
      autor: v(l, c.AUTOR),
      categoria: categoriaValida(v(l, c.CAUSA)),
      responsavel: responsavelValido(v(l, c.RESPONSAVEL)),
      status: statusValido(v(l, c.STATUS)),
      idDirecional: v(l, c.ID_DIRECIONAL),
      nomeDirecional: v(l, c.NOME_DIRECIONAL),
      comentario: v(l, c.ACAO),
      diaImpacto: v(l, c.DIA_IMPACTO),
      excluido: /^sim$/i.test(v(l, c.EXCLUIDO)),
    });
    porPonto.set(k, g);
  });
  const saida: Record<string, AcaoPonto> = {};
  for (const [k, g] of porPonto) {
    const historico = g.versoes
      .slice()
      .sort((a, b) => b.versao - a.versao || ordemData(b.registradoEm) - ordemData(a.registradoEm));
    const atual = historico[0];
    if (!atual || atual.excluido) continue;
    const primeira = historico[historico.length - 1];
    saida[k] = {
      ...atual,
      idParada: g.idParada,
      ponto: g.ponto,
      cluster: g.cluster,
      criadoEm: primeira.registradoEm,
      criadoPor: primeira.autor,
      historico,
    };
  }
  return saida;
}

export function linhaAcao(n: NovaAcao, versao: number, registradoEm: string): string[] {
  const dir = chaveId(texto(n.idDirecional)) === chaveId(texto(n.idParada)) ? "" : texto(n.idDirecional);
  return [
    texto(n.idParada),
    String(versao),
    registradoEm,
    texto(n.autor),
    texto(n.ponto),
    texto(n.cluster),
    categoriaValida(n.categoria),
    statusValido(n.status),
    texto(n.comentario),
    texto(n.diaImpacto),
    n.excluido ? "SIM" : "",
    dir,
    dir ? texto(n.nomeDirecional) : "",
    responsavelValido(n.responsavel),
  ];
}

export function ultimaVersao(linhas: string[][], idParada: string): number {
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const iId = cab.indexOf("ID_PARADA");
  const iV = cab.indexOf("VERSAO");
  const k = chaveId(idParada);
  let max = 0;
  linhas.slice(1).forEach((l, n) => {
    if (chaveId(texto(l[iId])) !== k) return;
    max = Math.max(max, Number(texto(l[iV])) || n + 1);
  });
  return max;
}
