export type PedidoParaPool = {
  transportadora: string;
  cluster: string;
  perfil: string;
  situacao: string | null;
};

export type LinhaPool = {
  transportadora: string;
  hub: string;
  cluster: string;
  perfil: string;
  segSex: number;
  sabado: number;
  semana: number;
  ano: number;
};

export type PoolConfrontado = {
  transportadora: string;
  cluster: string;
  perfil: string;
  pool: number;
  pedidos: number;
  aceites: number;
  recusas: number;

  semResposta: number;

  dentroDoPool: number;

  desafio: number;

  sobra: number;

  culpaPlanejamento: number;
  culpaTransportadora: number;

  aceitesAcimaDoPool: number;
};

export const TP_FORA_DA_ANALISE = [
  "KAPPA TRANSPORTES",
  "PRIMA LOG",
  "ESCUDO CARGO",
  "SIGMATRANSP",
];

const FORA = new Set(TP_FORA_DA_ANALISE.map((n) => n.toUpperCase()));

export function motivoDeFora(pedido: {
  transportadora: string;
  perfil: string;
}): string | null {
  if (/express/i.test(String(pedido.perfil ?? ""))) {
    return "Express — o pool dessas rotas fica em outra base";
  }
  if (FORA.has(String(pedido.transportadora ?? "").trim().toUpperCase())) {
    return "sem pool declarado em CPS";
  }
  return null;
}

export function semanaDe(
  dataBR: string
): { ano: number; semana: number } | null {
  const m = String(dataBR ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  if (Number.isNaN(d.getTime())) return null;

  const quinta = new Date(d.getTime());
  quinta.setUTCDate(quinta.getUTCDate() - ((quinta.getUTCDay() + 6) % 7) + 3);
  const primeira = new Date(Date.UTC(quinta.getUTCFullYear(), 0, 4));
  primeira.setUTCDate(
    primeira.getUTCDate() - ((primeira.getUTCDay() + 6) % 7) + 3
  );
  return {
    ano: quinta.getUTCFullYear(),
    semana:
      1 + Math.round((quinta.getTime() - primeira.getTime()) / 604800000),
  };
}

export function clusterCanonico(valor: string | undefined | null): string {
  const n = String(valor ?? "").match(/(\d+)/);
  if (!n) return "";

  const numero = Number(n[1]);
  if (numero <= 0) return "";
  return "C" + String(numero).padStart(2, "0");
}

export function repartirRecusas(
  pool: number,
  pedidos: number,
  recusas: number
): { planejamento: number; transportadora: number } {
  const excesso = Math.max(pedidos - pool, 0);
  const planejamento = Math.min(recusas, excesso);
  return { planejamento, transportadora: recusas - planejamento };
}

const APELIDOS: Record<string, string> = {
  ROTOCOOP: "ROTACOOP",
};

export function transportadoraCanonica(nome: string | undefined | null): string {
  const n = String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return APELIDOS[n] ?? n;
}

export function nomesUnificados(...fontes: string[][]): (nome: string) => string {
  const porChave = new Map<string, string>();
  for (const fonte of fontes) {
    for (const nome of fonte) {
      const k = transportadoraCanonica(nome);
      if (k && String(nome ?? "").trim()) porChave.set(k, String(nome).trim());
    }
  }
  return (nome: string) => porChave.get(transportadoraCanonica(nome)) ?? nome;
}

const chave = (tp: string, cluster: string, perfil: string) =>
  transportadoraCanonica(tp) + "|" + cluster + "|" + perfil;

export function confrontarPool(
  pedidos: PedidoParaPool[],
  pool: LinhaPool[],
  opcoes: {
    sabado: boolean;

    normalizarPerfil?: (perfil: string) => string;
  }
): PoolConfrontado[] {
  const perfilDe = opcoes.normalizarPerfil ?? ((p: string) => String(p ?? "").trim().toUpperCase());
  const capacidade = new Map<string, number>();

  const nomes = new Map<string, string>();
  for (const l of pool) {
    const k = chave(
      l.transportadora,
      clusterCanonico(l.cluster),
      perfilDe(l.perfil)
    );
    const qtd = opcoes.sabado ? l.sabado : l.segSex;
    capacidade.set(k, (capacidade.get(k) ?? 0) + qtd);
    if (!nomes.has(k)) nomes.set(k, l.transportadora);
  }

  const pools = new Map<string, PoolConfrontado>();
  const pegar = (tp: string, cluster: string, perfil: string): PoolConfrontado => {
    const k = chave(tp, cluster, perfil);
    let b = pools.get(k);
    if (!b) {
      b = {
        transportadora: nomes.get(k) ?? tp,
        cluster,
        perfil,
        pool: capacidade.get(k) ?? 0,
        pedidos: 0,
        aceites: 0,
        recusas: 0,
        semResposta: 0,
        dentroDoPool: 0,
        desafio: 0,
        sobra: 0,
        culpaPlanejamento: 0,
        culpaTransportadora: 0,
        aceitesAcimaDoPool: 0,
      };
      pools.set(k, b);
    }
    return b;
  };

  for (const p of pedidos) {
    if (p.situacao === "cancelado") continue;
    nomes.set(
      chave(p.transportadora, clusterCanonico(p.cluster), perfilDe(p.perfil)),
      p.transportadora
    );
    const b = pegar(
      p.transportadora,
      clusterCanonico(p.cluster),
      perfilDe(p.perfil)
    );
    b.pedidos++;
    if (p.situacao === "aceite") b.aceites++;
    else if (p.situacao === "recusa") b.recusas++;
    else b.semResposta++;
  }

  for (const [k, qtd] of capacidade) {
    if (qtd <= 0 || pools.has(k)) continue;
    const [, cluster, perfil] = k.split("|");
    pegar(nomes.get(k) ?? "", cluster, perfil);
  }

  for (const b of pools.values()) {
    b.dentroDoPool = Math.min(b.pedidos, b.pool);
    b.desafio = Math.max(b.pedidos - b.pool, 0);
    b.sobra = Math.max(b.pool - b.pedidos, 0);
    const r = repartirRecusas(b.pool, b.pedidos, b.recusas);
    b.culpaPlanejamento = r.planejamento;
    b.culpaTransportadora = r.transportadora;
    b.aceitesAcimaDoPool = Math.max(b.aceites - b.pool, 0);
  }

  return [...pools.values()].sort(
    (a, b) =>
      b.culpaTransportadora - a.culpaTransportadora ||
      b.culpaPlanejamento - a.culpaPlanejamento ||
      a.transportadora.localeCompare(b.transportadora, "pt-BR") ||
      a.cluster.localeCompare(b.cluster)
  );
}
