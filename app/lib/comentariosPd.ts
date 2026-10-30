import { chaveId } from "./hb.ts";
import { statusMapaValido, type StatusMapa } from "./mapeamentoStatus.ts";

export const CAB_COMENTARIOS_PD = [
  "DATA", "ID_PARADA", "PONTO", "CLUSTER", "OBS", "COMENTARIO", "AUTOR", "REGISTRADO_EM",
] as const;

export type VersaoComentario = {
  obs: StatusMapa | null;
  comentario: string;
  autor: string;

  registradoEm: string;
};

export type ComentarioPd = VersaoComentario & {
  data: string;
  idParada: string;
  ponto: string;
  cluster: string;

  historico: VersaoComentario[];
};

export type NovoComentario = {
  data: string;
  idParada: string;
  ponto: string;
  cluster: string;
  obs: string;
  comentario: string;
  autor: string;
};

const texto = (v: unknown) => String(v ?? "").trim();

export const chaveComentario = (data: string, idParada: string) => texto(data) + "|" + chaveId(idParada);

export function lerComentariosPd(linhas: string[][]): Record<string, ComentarioPd> {
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = Object.fromEntries(CAB_COMENTARIOS_PD.map((n) => [n, i(n)])) as Record<(typeof CAB_COMENTARIOS_PD)[number], number>;
  if (c.ID_PARADA < 0 || c.DATA < 0) return {};
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const saida: Record<string, ComentarioPd> = {};
  for (const l of linhas.slice(1)) {
    const data = v(l, c.DATA);
    const idParada = v(l, c.ID_PARADA);
    if (!data || !chaveId(idParada)) continue;
    const k = chaveComentario(data, idParada);
    const versao: VersaoComentario = {
      obs: statusMapaValido(v(l, c.OBS)),
      comentario: v(l, c.COMENTARIO),
      autor: v(l, c.AUTOR),
      registradoEm: v(l, c.REGISTRADO_EM),
    };
    const antes = saida[k];
    const historico = [versao, ...(antes?.historico ?? [])];
    if (!versao.obs && !versao.comentario) {
      delete saida[k];
      continue;
    }
    saida[k] = {
      ...versao,
      data,
      idParada,
      ponto: v(l, c.PONTO) || antes?.ponto || "",
      cluster: v(l, c.CLUSTER) || antes?.cluster || "",
      historico,
    };
  }
  return saida;
}

export function linhaComentarioPd(n: NovoComentario, registradoEm: string): string[] {
  return [
    texto(n.data),
    texto(n.idParada),
    texto(n.ponto),
    texto(n.cluster),
    statusMapaValido(n.obs) ?? "",
    texto(n.comentario),
    texto(n.autor),
    registradoEm,
  ];
}
