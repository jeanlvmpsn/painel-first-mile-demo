import { chaveRota } from "./hb.ts";

export const CAB_STATUS_NS = ["DATA", "ROTA", "ROTA_ID", "STATUS", "AUTOR", "REGISTRADO_EM"] as const;

export const STATUS_NS = ["Revertido", "Revertido parcial", "Sem reversão"] as const;
export type StatusNs = (typeof STATUS_NS)[number];

export type MarcaNs = { status: StatusNs; autor: string; registradoEm: string };

const texto = (v: unknown) => String(v ?? "").trim();
const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const chaveNs = (rota: string, rotaId: string) => (texto(rotaId) ? "ID:" + texto(rotaId) : chaveRota(rota));

export function statusNsValido(v: unknown): StatusNs | null {
  const t = semAcento(texto(v));
  return STATUS_NS.find((s) => semAcento(s) === t) ?? null;
}

export function lerStatusNs(linhas: string[][], dataBR: string): Record<string, MarcaNs> {
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = { data: i("DATA"), rota: i("ROTA"), id: i("ROTA_ID"), status: i("STATUS"), autor: i("AUTOR"), em: i("REGISTRADO_EM") };
  if (c.status < 0 || (c.rota < 0 && c.id < 0)) return {};
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const saida: Record<string, MarcaNs> = {};
  for (const l of linhas.slice(1)) {
    if (c.data >= 0 && v(l, c.data) !== dataBR) continue;
    const k = chaveNs(v(l, c.rota), v(l, c.id));
    if (!k) continue;
    const status = statusNsValido(v(l, c.status));
    if (!status) delete saida[k];
    else saida[k] = { status, autor: v(l, c.autor), registradoEm: v(l, c.em) };
  }
  return saida;
}

export function linhaStatusNs(
  dataBR: string,
  rota: string,
  rotaId: string,
  status: StatusNs | null,
  autor: string,
  registradoEm: string,
): string[] {
  return [dataBR, texto(rota), texto(rotaId), status ?? "", texto(autor), registradoEm];
}
