import { chaveId } from "./hb.ts";

export const CAB_STATUS_MAPA = ["DATA", "ID_PARADA", "STATUS", "AUTOR", "REGISTRADO_EM"] as const;

export const STATUS_MAPA = [
  "Risco alto", "Risco moderado", "Risco de não preparados", "Sem risco", "Acompanhar", "Sem reversão", "Zerado",
  "Não preparados",
] as const;
export type StatusMapa = (typeof STATUS_MAPA)[number];

export type MarcaMapa = { status: StatusMapa; autor: string; registradoEm: string };

const texto = (v: unknown) => String(v ?? "").trim();
const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function statusMapaValido(v: unknown): StatusMapa | null {
  const t = semAcento(texto(v));
  return STATUS_MAPA.find((s) => semAcento(s) === t) ?? null;
}

export function lerStatusMapa(linhas: string[][], dataBR: string): Record<string, MarcaMapa> {
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = { data: i("DATA"), id: i("ID_PARADA"), status: i("STATUS"), autor: i("AUTOR"), em: i("REGISTRADO_EM") };
  if (c.id < 0 || c.status < 0) return {};
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const saida: Record<string, MarcaMapa> = {};
  for (const l of linhas.slice(1)) {
    if (c.data >= 0 && v(l, c.data) !== dataBR) continue;
    const k = chaveId(v(l, c.id));
    if (!k) continue;
    const status = statusMapaValido(v(l, c.status));

    if (!status) delete saida[k];
    else saida[k] = { status, autor: v(l, c.autor), registradoEm: v(l, c.em) };
  }
  return saida;
}

export function linhaStatusMapa(dataBR: string, idParada: string, status: StatusMapa | null, autor: string, registradoEm: string): string[] {
  return [dataBR, texto(idParada), status ?? "", texto(autor), registradoEm];
}
