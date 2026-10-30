import { VEICULOS, type TipoVeiculo } from "./estouro.ts";

export const MAX_IDS = 20;

export const CAB_FILA_PERFIL = ["PEDIDO", "CRIADO_EM", "IDS", "INICIO", "FIM", "STATUS", "RESULTADO", "ERRO"];

export function idsValidos(bruto: unknown): string[] {
  const ids = String(bruto ?? "")
    .split(/[\s,;]+/)
    .filter((i) => /^[0-9_]{3,40}$/.test(i));
  return [...new Set(ids)];
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const txt = (v: unknown) => String(v ?? "").trim();

export type CategoriaPerfil = {
  categoria: string;
  estimados: number;
  coletados: number;
  volMedioM3: number;
  volMaxM3: number;
};

export type PerfilId = {
  id: string;
  seller: string;
  nome: string;
  dias: number;
  estimados: number;
  coletados: number;

  pctColeta: number | null;
  volMedioM3: number | null;
  volMaxM3: number | null;
  categorias: CategoriaPerfil[];

  plano: {
    dias: number;
    pesoKg: number;
    volumeM3: number;
    pacotes: number;
    pesoMedioKg: number | null;
    pesoDiaKg: number;
    volumeDiaM3: number;
    pacotesDia: number;
  } | null;

  veiculoMinimo: TipoVeiculo | null;
};

export function veiculoMinimo(pesoKg: number, volumeM3: number): TipoVeiculo | null {
  return VEICULOS.find((v) => pesoKg <= v.pesoMaxKg && volumeM3 <= v.cubagemM3) ?? null;
}

type Bruto = { coleta?: Record<string, unknown>[]; plano?: Record<string, unknown>[] };

export function montarPerfil(json: string, ids: string[]): PerfilId[] {
  let bruto: Bruto;
  try {
    bruto = JSON.parse(json) as Bruto;
  } catch {
    return [];
  }
  const porId = new Map<string, PerfilId>();
  const pega = (id: string) => {
    let p = porId.get(id);
    if (!p) {
      p = {
        id, seller: "", nome: "", dias: 0, estimados: 0, coletados: 0, pctColeta: null,
        volMedioM3: null, volMaxM3: null, categorias: [], plano: null, veiculoMinimo: null,
      };
      porId.set(id, p);
    }
    return p;
  };

  for (const l of bruto.coleta ?? []) {
    const p = pega(txt(l.ID));
    p.seller = p.seller || txt(l.SELLER);
    p.nome = p.nome || txt(l.NOME);
    p.dias = Math.max(p.dias, num(l.DIAS));
    p.categorias.push({
      categoria: txt(l.CATEGORIA),
      estimados: num(l.ESTIMADOS),
      coletados: num(l.COLETADOS),
      volMedioM3: num(l.VOL_MEDIO_M3),
      volMaxM3: num(l.VOL_MAX_M3),
    });
  }
  for (const l of bruto.plano ?? []) {
    const p = pega(txt(l.ID));
    const dias = num(l.DIAS);
    const pesoKg = num(l.PESO_KG);
    const volumeM3 = num(l.VOL_M3);
    const pacotes = num(l.PACOTES);
    p.plano = {
      dias,
      pesoKg,
      volumeM3,
      pacotes,
      pesoMedioKg: pacotes > 0 ? pesoKg / pacotes : null,
      pesoDiaKg: dias > 0 ? pesoKg / dias : 0,
      volumeDiaM3: dias > 0 ? volumeM3 / dias : 0,
      pacotesDia: dias > 0 ? pacotes / dias : 0,
    };
  }

  for (const p of porId.values()) {
    p.categorias.sort((a, b) => b.estimados - a.estimados);
    p.estimados = p.categorias.reduce((s, c) => s + c.estimados, 0);
    p.coletados = p.categorias.reduce((s, c) => s + c.coletados, 0);
    p.pctColeta = p.estimados > 0 ? p.coletados / p.estimados : null;
    if (p.estimados > 0) {
      p.volMedioM3 = p.categorias.reduce((s, c) => s + c.volMedioM3 * c.estimados, 0) / p.estimados;
      p.volMaxM3 = Math.max(...p.categorias.map((c) => c.volMaxM3));
    }
    if (p.plano) p.veiculoMinimo = veiculoMinimo(p.plano.pesoDiaKg, p.plano.volumeDiaM3);
  }

  const ordem = (id: string) => {
    const i = ids.indexOf(id);
    return i < 0 ? ids.length : i;
  };
  return [...porId.values()].sort((a, b) => ordem(a.id) - ordem(b.id) || b.estimados - a.estimados);
}
