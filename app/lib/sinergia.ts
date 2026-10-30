export type LinhaSinergia = {
  transportadora: string;
  hub: string;
  origem: string;
  tops: string[];
};

export type LinhaConfronto = {
  transportadora: string;
  cluster: string;
  perfil: string;
  dentroDoPool: number;
  desafio: number;
  sobra: number;
  recusas: number;
  culpaPlanejamento: number;
  culpaTransportadora: number;
  sinergia: number;
  sinergiaCedida: number;
};

export type Atendimentos = Map<string, Set<string>>;

export function montarAtendimentos(
  linhas: LinhaSinergia[],
  canonicoTp: (n: string) => string,
  canonicoCluster: (c: string) => string,
): Atendimentos {
  const mapa: Atendimentos = new Map();
  for (const l of linhas) {
    const tp = canonicoTp(l.transportadora);
    const origem = canonicoCluster(l.origem);
    if (!tp || !origem) continue;
    const chave = tp + "|" + origem;
    const destinos = mapa.get(chave) ?? new Set<string>();
    for (const t of l.tops) {
      const destino = canonicoCluster(t);
      if (destino && destino !== origem) destinos.add(destino);
    }
    if (destinos.size > 0) mapa.set(chave, destinos);
  }
  return mapa;
}

export function atende(
  atendimentos: Atendimentos,
  tpCanonico: string,
  origem: string,
  destino: string,
): boolean {
  return atendimentos.get(tpCanonico + "|" + origem)?.has(destino) ?? false;
}

export function aplicarSinergia<T extends LinhaConfronto>(
  linhas: T[],
  atendimentos: Atendimentos,
  canonicoTp: (n: string) => string,
): T[] {
  const copia = linhas.map((l) => ({ ...l, sinergia: 0, sinergiaCedida: 0 }));

  const baldes = new Map<string, { tp: string; linhas: typeof copia }>();
  for (const l of copia) {
    const tp = canonicoTp(l.transportadora);
    const k = tp + "||" + l.perfil;
    const atual = baldes.get(k) ?? { tp, linhas: [] };
    atual.linhas.push(l);
    baldes.set(k, atual);
  }

  for (const balde of baldes.values()) {
    const faltam = balde.linhas.filter((l) => l.desafio > 0);
    const sobram = balde.linhas.filter((l) => l.sobra > 0);
    for (const d of faltam) {
      for (const s of sobram) {
        if (d.desafio <= 0) break;
        if (s.sobra <= 0 || s.cluster === d.cluster) continue;

        if (!atende(atendimentos, balde.tp, s.cluster, d.cluster)) continue;
        const carros = Math.min(d.desafio, s.sobra);
        d.desafio -= carros;
        d.dentroDoPool += carros;
        d.sinergia += carros;
        s.sobra -= carros;
        s.sinergiaCedida += carros;
      }
    }
  }

  for (const l of copia) {
    const desafioDeOrigem = l.desafio + l.sinergia;
    const plan = Math.min(l.recusas, desafioDeOrigem);
    l.culpaPlanejamento = plan;
    l.culpaTransportadora = l.recusas - plan;
  }

  return copia;
}
