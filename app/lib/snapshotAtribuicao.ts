import { temPlaca } from "./express.ts";

export type RotaViva = {
  rota: string;
  start: string;
  transportadora: string;
  placa: string;
  hub?: string;
  motorista?: string;
  statusMotorista?: string;
  tipoRota?: string;
  perfil?: string;
  veiculo?: string;
};

const I_PLACA = 4;

export function linhaDoHistorico(dataBR: string, a: RotaViva): string[] {
  return [
    dataBR,
    a.rota,
    a.start,
    a.transportadora,
    a.placa,
    a.hub ?? "",
    a.motorista ?? "",
    a.statusMotorista ?? "",
    a.tipoRota ?? "",
    a.perfil ?? "",
    a.veiculo ?? "",
  ];
}

const chaveRota = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

export function completarSnapshot(
  historico: string[][],
  vivas: RotaViva[],
  dataBR: string,
): { atualizacoes: { indice: number; valores: string[] }[]; novas: string[][] } {
  const porRota = new Map<string, RotaViva>();
  for (const v of vivas) if (v.rota.trim()) porRota.set(chaveRota(v.rota), v);

  const atualizacoes: { indice: number; valores: string[] }[] = [];
  const vistas = new Set<string>();
  historico.forEach((linha, indice) => {
    if (String(linha[0] ?? "").trim() !== dataBR) return;
    const k = chaveRota(linha[1]);
    vistas.add(k);
    const viva = porRota.get(k);
    if (!viva) return;

    const nova = linhaDoHistorico(dataBR, viva);
    const antes = Array.from({ length: nova.length }, (_, i) => String(linha[i] ?? "").trim());
    const valores = antes.map((gravado, i) => {
      if (i < 2) return gravado;
      const vivo = nova[i].trim();
      if (i === I_PLACA) return temPlaca(vivo) ? vivo : gravado;
      return vivo || gravado;
    });
    if (valores.some((v, i) => v !== antes[i])) atualizacoes.push({ indice, valores });
  });

  const novas = [...porRota.entries()]
    .filter(([k]) => !vistas.has(k))
    .map(([, v]) => linhaDoHistorico(dataBR, v));
  return { atualizacoes, novas };
}
