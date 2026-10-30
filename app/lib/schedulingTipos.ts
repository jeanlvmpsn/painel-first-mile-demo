export const SITUACOES = ["aceite", "recusa", "semResposta", "cancelado"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aceite: "Aceite",
  recusa: "Recusa",
  semResposta: "Sem resposta",
  cancelado: "Cancelado",
};

export type PedidoScheduling = {
  data: string;
  travelId: string;
  transportadora: string;
  situacao: Situacao | null;
  statusBruto: string;
  motivo: string;
  perfil: string;
  zona: string;
  cluster: string;
  hub: string;
  eta: string;
  destino: string;

  foraDoDia: boolean;

  recusaPos11h: string;
};

export const ROTULO_POS_11H = "Recusa pós 11h";

export const FORA_DO_DIA = "Fora da operação do dia";

export function dataParaISO(dataBR: string): string {
  const m = String(dataBR ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function ehSabado(dataISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return false;

  return new Date(dataISO + "T12:00:00").getDay() === 6;
}

export function lerZona(nome: string | null | undefined) {
  const partes = String(nome ?? "").trim().split("_");
  const marcaSabado = partes
    .slice(2)
    .some((p) =>
      p.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").startsWith("SABADO"),
    );
  return {
    cluster: (partes[0] ?? "").toUpperCase(),
    hub: (partes[1] ?? "").toUpperCase(),
    sabado: marcaSabado,
  };
}

export type Contagem = {
  chave: string;
  total: number;
  aceite: number;
  recusa: number;
  semResposta: number;
  cancelado: number;
  outro: number;

  pos11h: number;
};

export function contarPor(
  pedidos: PedidoScheduling[],
  chaveDe: (p: PedidoScheduling) => string,
): Contagem[] {
  const mapa = new Map<string, Contagem>();

  for (const p of pedidos) {
    const chave = chaveDe(p);
    let linha = mapa.get(chave);
    if (!linha) {
      linha = {
        chave,
        total: 0,
        aceite: 0,
        recusa: 0,
        semResposta: 0,
        cancelado: 0,
        outro: 0,
        pos11h: 0,
      };
      mapa.set(chave, linha);
    }
    linha.total++;
    if (p.situacao) linha[p.situacao]++;
    else linha.outro++;
    if (p.recusaPos11h) linha.pos11h++;
  }

  return [...mapa.values()];
}

export function contarHubs(
  pedidos: PedidoScheduling[],
): { hub: string; qtd: number }[] {
  const mapa = new Map<string, number>();
  for (const p of pedidos) {
    const chave = p.foraDoDia ? FORA_DO_DIA : p.hub || "SEM HUB";
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([hub, qtd]) => ({ hub, qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.hub.localeCompare(b.hub, "pt-BR"));
}

export function contarPorTransportadora(pedidos: PedidoScheduling[]): Contagem[] {
  return contarPor(pedidos, (p) => p.transportadora).sort(
    (a, b) => b.total - a.total || a.chave.localeCompare(b.chave, "pt-BR"),
  );
}
