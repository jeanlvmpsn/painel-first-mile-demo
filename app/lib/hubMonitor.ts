import { chaveId, chaveRota } from "./hb.ts";
import { ehDeCampinas, hubDaRota, hubPeloNome } from "./hubs.ts";
import { ehMelione } from "./melione.ts";

export function rotasDeOutroHub(atribuicao: { rota: string; hub?: string }[]): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const r of atribuicao) {
    const k = chaveRota(r.rota);
    const hub = hubDaRota(r.rota, r.hub);
    if (k && !ehDeCampinas(hub)) saida[k] = hub.toUpperCase();
  }
  return saida;
}

export function outrosHubsDaAtribuicao(planejadas: { rota: string; regiao?: string; tipoRota?: string }[]): Record<string, string> {
  return rotasDeOutroHub(planejadas.filter((r) => !ehMelione(r.tipoRota)).map((r) => ({ rota: r.rota, hub: r.regiao })));
}

export type FiltroCps = {
  aplicavel: boolean;
  ehCps: (rota: string, rotaId: string, rotaSemNome?: boolean) => boolean;

  rotasFora: number;
};

export function filtroCps(
  outros: Record<string, string>,
  visitas: { rota: string; rotaId: string; rotaSemNome: boolean; idParada: string }[],
  plano: { rota: string; idParada: string }[],
): FiltroCps {
  const aplicavel = Object.keys(outros).length > 0;

  const pontosCps = new Set<string>();
  for (const p of plano) {
    if (!p.rota || outros[chaveRota(p.rota)] || hubPeloNome(p.rota)) continue;
    if (chaveId(p.idParada)) pontosCps.add(chaveId(p.idParada));
  }
  const semConfig = pontosCps.size === 0;
  const avulsasCps = new Set<string>();
  for (const v of visitas) {
    if (v.rotaSemNome && (semConfig || pontosCps.has(chaveId(v.idParada)))) avulsasCps.add(v.rotaId || v.rota);
  }
  const avulsas = new Set(visitas.filter((v) => v.rotaSemNome).map((v) => v.rotaId || v.rota));
  const nomeFora = (rota: string) => Boolean(hubPeloNome(rota) || outros[chaveRota(rota)]);
  const ehCps = (rota: string, rotaId: string, rotaSemNome?: boolean) => {
    if (!aplicavel) return true;

    const avulsa = rotaSemNome || (rotaId !== "" && avulsas.has(rotaId) && (!rota || rota === rotaId || rota.startsWith("Avulsa ")));
    if (avulsa) return avulsasCps.has(rotaId || rota);
    return !nomeFora(rota);
  };
  const fora = new Set<string>();
  for (const v of visitas) if (!ehCps(v.rota, v.rotaId, v.rotaSemNome)) fora.add(v.rotaId || chaveRota(v.rota));
  return { aplicavel, ehCps, rotasFora: fora.size };
}
