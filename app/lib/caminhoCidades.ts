import { chaveCidade, lerTabelaApoio, type MapaApoio } from "./apoioCidades.ts";
import municipios from "./municipiosCps.json" with { type: "json" };

export const BASE = { lat: -22.84, lng: -47.21 };
export const DESVIO_MAXIMO = 0.15;
export const VIZINHA_KM = 25;

type Anel = number[][];
type Municipio = { nome: string; uf: string; bbox: number[]; poligonos: Anel[][] };

function centroDoAnel(anel: Anel): { lat: number; lng: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    const f = xj * yi - xi * yj;
    a += f;
    cx += (xj + xi) * f;
    cy += (yj + yi) * f;
  }
  if (a === 0) return { lat: anel[0][1], lng: anel[0][0], area: 0 };
  return { lat: cy / (3 * a), lng: cx / (3 * a), area: Math.abs(a / 2) };
}

let centros: Map<string, { lat: number; lng: number }> | null = null;
export function centroDaCidade(cidade: string): { lat: number; lng: number } | null {
  if (!centros) {
    centros = new Map();
    for (const m of municipios as Municipio[]) {
      const maior = m.poligonos
        .map(([externo]) => centroDoAnel(externo))
        .sort((a, b) => b.area - a.area)[0];
      if (maior) centros.set(chaveCidade(m.nome), { lat: maior.lat, lng: maior.lng });
    }
  }
  return centros.get(chaveCidade(cidade)) ?? null;
}

export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function noCaminho(de: string, para: string, base = BASE): boolean {
  const x = centroDaCidade(de);
  const y = centroDaCidade(para);
  if (!x || !y || chaveCidade(de) === chaveCidade(para)) return false;
  const xb = distanciaKm(x, base);
  const yb = distanciaKm(y, base);
  const xy = distanciaKm(x, y);
  return yb < xb && xy <= VIZINHA_KM && xy + yb <= xb * (1 + DESVIO_MAXIMO);
}

export function montarMapaApoio(cidades: string[], linhasPlanilha: unknown[][]): MapaApoio {
  const tabela = lerTabelaApoio(linhasPlanilha);
  const nomes = new Map(cidades.map((c) => [chaveCidade(c), c]));
  const unicas = [...nomes.values()];
  const mapa: MapaApoio = {};
  for (const x of unicas) {
    const k = chaveCidade(x);
    const daPlanilha = tabela.get(k);
    mapa[k] = daPlanilha
      ? { nome: x, para: [...daPlanilha].map((y) => nomes.get(y) ?? y), fonte: "planilha" }
      : {
          nome: x,
          para: unicas
            .filter((y) => noCaminho(x, y))
            .sort((a, b) => distanciaKm(centroDaCidade(x)!, centroDaCidade(a)!) - distanciaKm(centroDaCidade(x)!, centroDaCidade(b)!)),
          fonte: "automático",
        };
  }
  return mapa;
}
