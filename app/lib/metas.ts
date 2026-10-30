export type Meta = {
  puSuccess: number;
  puOnTime: number;
  noPuSuccess: number;
  culpaMe: number;
  culpaSeller: number;
  culpaPlace: number;
};

const m = (
  puSuccess: number,
  puOnTime: number,
  noPuSuccess: number,
  culpaMe: number,
  culpaSeller: number,
  culpaPlace: number,
): Meta => ({ puSuccess, puOnTime, noPuSuccess, culpaMe, culpaSeller, culpaPlace });

export const METAS_2026: Record<number, Meta> = {
  1: m(91.3, 80.7, 8.7, 3.1, 4.8, 0.7),
  2: m(91.9, 81.7, 8.1, 3.6, 3.7, 0.8),
  3: m(92.5, 81.3, 7.5, 3.1, 3.6, 0.7),
  4: m(92.5, 83.1, 7.5, 3.3, 3.5, 0.7),
  5: m(92.9, 83.9, 7.1, 2.8, 3.7, 0.6),
  6: m(92.6, 82.5, 7.4, 3.0, 3.9, 0.5),
  7: m(93.0, 83.1, 7.0, 2.7, 3.8, 0.4),
  8: m(93.3, 85.7, 6.7, 2.6, 3.6, 0.4),
  9: m(93.0, 84.7, 7.0, 2.8, 3.8, 0.4),
  10: m(92.5, 82.2, 7.5, 3.2, 3.9, 0.4),
  11: m(92.4, 82.3, 7.6, 3.2, 4.0, 0.4),
  12: m(92.4, 82.3, 7.6, 3.1, 4.0, 0.4),
};

export const META_ANO_2026: Meta = m(92.6, 82.8, 7.4, 3.0, 3.9, 0.5);

export function metaDoMes(dataBR: string | undefined | null): Meta {
  const t = String(dataBR ?? "").trim();
  const p = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!p) return META_ANO_2026;
  const mes = Number(p[2]);
  return METAS_2026[mes] ?? META_ANO_2026;
}
