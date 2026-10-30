import municipios from "./municipiosCps.json" with { type: "json" };

type Anel = number[][];
type Municipio = { nome: string; uf: string; bbox: number[]; poligonos: Anel[][] };

const LISTA = municipios as Municipio[];

function dentroDoAnel(lng: number, lat: number, anel: Anel): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function municipioDoPonto(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  for (const m of LISTA) {
    const [x0, y0, x1, y1] = m.bbox;
    if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
    for (const [externo, ...buracos] of m.poligonos) {
      if (dentroDoAnel(lng, lat, externo) && !buracos.some((b) => dentroDoAnel(lng, lat, b))) {
        return m.nome + "/" + m.uf;
      }
    }
  }
  return "";
}
