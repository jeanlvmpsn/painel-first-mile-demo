import { chaveRota, texto } from "./hb.ts";
import { municipioDoPonto } from "./municipios.ts";

export function chaveRotaPlanificacao(v: unknown): string {
  return chaveRota(v)
    .split("_")
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
    .join("_");
}

export type CidadesDaRota = {
  cluster: string;

  cidades: string[];
};

export function cidadesPorRota(
  linhas: string[][],
  dataBR: string,
  municipio: (lat: number, lng: number) => string = municipioDoPonto,
): Map<string, CidadesDaRota> {
  const saida = new Map<string, CidadesDaRota>();
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = { data: i("DATA"), rota: i("ROTA"), cluster: i("CLUSTER"), lat: i("LAT"), lng: i("LNG") };
  if (c.rota < 0 || c.lat < 0 || c.lng < 0) return saida;

  const contagem = new Map<string, { cluster: string; porCidade: Map<string, number> }>();
  for (const l of linhas.slice(1)) {
    if (c.data >= 0 && texto(l[c.data]) !== dataBR) continue;
    const k = chaveRotaPlanificacao(l[c.rota]);
    if (!k) continue;
    const r = contagem.get(k) ?? {
      cluster: c.cluster >= 0 ? texto(l[c.cluster]) : "",
      porCidade: new Map<string, number>(),
    };
    const cidade = municipio(Number(texto(l[c.lat])), Number(texto(l[c.lng])));
    if (cidade) r.porCidade.set(cidade, (r.porCidade.get(cidade) ?? 0) + 1);
    contagem.set(k, r);
  }
  for (const [k, r] of contagem) {
    saida.set(k, {
      cluster: r.cluster,
      cidades: [...r.porCidade.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        .map(([cidade]) => cidade),
    });
  }
  return saida;
}

export function mesmaCidade(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false;
  const k = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  const conjunto = new Set(a.map(k));
  return b.some((c) => conjunto.has(k(c)));
}
