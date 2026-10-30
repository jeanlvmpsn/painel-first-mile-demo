import { chaveId, chaveRota, texto, type ParadaHB } from "./hb.ts";
import {
  totalColetado,
  totalEstimado,
  totalPreparado,
  type LinhaMonitoring,
} from "./monitoringSeller.ts";

export type ParadaNaColeta = ParadaHB & {
  pontualidade?: string;
  planejado?: string;
  preparados?: number;
  coletados?: number;
};

export type RotaDaParada = {
  rota: string;
  eta: string;
  placa: string;
  transportadora: string;

  naColeta: boolean;

  pontualidade: string;
  estimados: number;
  preparados: number;
  coletados: number;
};

export type ResultadoParada = {
  id: string;
  nome: string;
  monitoring: LinhaMonitoring[];
  totais: { estimado: number; preparado: number; coletado: number } | null;
  rotas: RotaDaParada[];
};

export function idsDaBusca(bruto: string): string[] {
  const vistos = new Set<string>();
  for (const parte of String(bruto ?? "").split(/[\s,;]+/)) {
    const id = chaveId(parte);
    if (/^[A-Za-z0-9_]{3,40}$/.test(id)) vistos.add(id);
  }
  return [...vistos].slice(0, 20);
}

function casaComId(id: string): (parada: unknown) => boolean {
  const alvos = new Set([id]);
  if (id.includes("_")) alvos.add(id.split("_")[0]);
  return (parada) => alvos.has(chaveId(parada));
}

export function consultarParada(
  id: string,
  fontes: {
    indice: Map<string, LinhaMonitoring[]>;
    coleta: ParadaNaColeta[];
    planejadas: ParadaHB[];
    etaPorRota: Record<string, string>;
    placaPorRota: Record<string, string>;
  },
): ResultadoParada {
  const casa = casaComId(id);
  const monitoring = fontes.indice.get(id) ?? [];

  const eta = new Map<string, string>();
  for (const [r, v] of Object.entries(fontes.etaPorRota)) if (v) eta.set(chaveRota(r), v);
  const placa = new Map<string, string>();
  for (const [r, v] of Object.entries(fontes.placaPorRota)) if (v) placa.set(chaveRota(r), v);

  const porRota = new Map<string, RotaDaParada>();
  const nova = (rota: string): RotaDaParada => ({
    rota,
    eta: eta.get(chaveRota(rota)) ?? "",
    placa: placa.get(chaveRota(rota)) ?? "",
    transportadora: "",
    naColeta: false,
    pontualidade: "",
    estimados: 0,
    preparados: 0,
    coletados: 0,
  });

  for (const p of fontes.coleta) {
    const rota = texto(p.rota);
    if (!rota || !casa(p.parada)) continue;
    const k = chaveRota(rota);
    const r = porRota.get(k) ?? nova(rota);

    r.naColeta = true;
    r.estimados = Math.max(r.estimados, Number(p.estimados ?? 0));
    r.preparados = Math.max(r.preparados, Number(p.preparados ?? 0));
    r.coletados = Math.max(r.coletados, Number(p.coletados ?? 0));
    r.transportadora ||= texto(p.transportadora);
    r.pontualidade ||= texto(p.pontualidade);
    porRota.set(k, r);
  }
  for (const p of fontes.planejadas) {
    const rota = texto(p.rota);
    if (!rota || !casa(p.parada)) continue;
    const k = chaveRota(rota);
    if (!porRota.has(k)) porRota.set(k, nova(rota));
  }

  const totais = monitoring.length
    ? {
        estimado: monitoring.reduce((s, l) => s + totalEstimado(l), 0),
        preparado: monitoring.reduce((s, l) => s + totalPreparado(l), 0),
        coletado: monitoring.reduce((s, l) => s + totalColetado(l), 0),
      }
    : null;

  return {
    id,
    nome: monitoring[0]?.nome ?? "",
    monitoring,
    totais,

    rotas: [...porRota.values()].sort(
      (a, b) =>
        Number(b.naColeta) - Number(a.naColeta) ||
        (a.eta || "99").localeCompare(b.eta || "99") ||
        a.rota.localeCompare(b.rota, "pt-BR"),
    ),
  };
}
