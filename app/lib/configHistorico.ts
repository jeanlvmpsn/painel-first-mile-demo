import { chaveRota, texto } from "./hb.ts";
import type { RotaPlanejada } from "./curvaChegada.ts";

export const CAB_HISTORICO_CONFIG = ["DATA", "ROTA", "TRANSPORTADORA", "CLUSTER", "ETA", "PACOTES", "ATUALIZADO_EM"];

export function linhasDaConfig(planejadas: RotaPlanejada[], dataBR: string, agora: string): string[][] {
  return planejadas.map((p) => [dataBR, p.rota, p.transportadora, p.cluster, p.eta, String(p.pacotes), agora]);
}

export function lerConfigHistorica(linhas: string[][], dataBR: string): RotaPlanejada[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    rota: i("ROTA"),
    transportadora: i("TRANSPORTADORA"),
    cluster: i("CLUSTER"),
    eta: i("ETA"),
    pacotes: i("PACOTES"),
  };
  if (c.data < 0 || c.rota < 0) return [];
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  return linhas
    .slice(1)
    .filter((l) => v(l, c.data) === dataBR && v(l, c.rota))
    .map((l) => ({
      rota: v(l, c.rota),
      transportadora: v(l, c.transportadora),
      cluster: v(l, c.cluster),
      eta: v(l, c.eta),
      pacotes: Number(v(l, c.pacotes).replace(",", ".")) || 0,
    }));
}

export function substituirDia(
  historico: string[][],
  novas: string[][],
  dataBR: string,
  limiteISO: string,
): string[][] {
  const corpo = historico.slice(1).filter((l) => {
    const d = texto(l[0]);
    if (!d || d === dataBR) return false;
    return d.split("/").reverse().join("-") >= limiteISO;
  });
  return [CAB_HISTORICO_CONFIG, ...corpo, ...novas];
}

export function assinaturaDoPlano(planejadas: RotaPlanejada[], dataBR: string): string {
  const texto_ = planejadas
    .map((p) => chaveRota(p.rota) + "|" + texto(p.eta) + "|" + Math.round(p.pacotes))
    .sort()
    .join(";");
  let h = 5381;
  for (let i = 0; i < texto_.length; i++) h = ((h * 33) ^ texto_.charCodeAt(i)) >>> 0;
  return dataBR + "|" + planejadas.length + "|" + h.toString(36);
}
