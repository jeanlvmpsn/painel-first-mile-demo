export type Marca = "dentro" | "desafio" | "sinergia" | "sobra";
export type Culpa = "plan" | "tp";
export type Resposta = "aceito" | "recusado" | "sem";

export type FiltrosPool = {
  transportadoras: string[];
  perfis: string[];
  clusters: string[];
  marcas: string[];
  culpas: string[];
  respostas: string[];
};

export type LinhaFiltravel = {
  transportadora: string;
  cluster: string;
  perfil: string;
  dentroDoPool?: number;
  desafio?: number;
  sobra?: number;
  sinergia?: number;
  aceites?: number;
  recusas?: number;
  semResposta?: number;
  culpaPlanejamento?: number;
  culpaTransportadora?: number;
};

export function filtrosVazios(): FiltrosPool {
  return {
    transportadoras: [],
    perfis: [],
    clusters: [],
    marcas: [],
    culpas: [],
    respostas: [],
  };
}

export function algumFiltroAtivo(f: FiltrosPool): boolean {
  return (
    f.transportadoras.length +
      f.perfis.length +
      f.clusters.length +
      f.marcas.length +
      f.culpas.length +
      f.respostas.length >
    0
  );
}

export function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor)
    ? lista.filter((v) => v !== valor)
    : [...lista, valor];
}

const porTexto = (escolhidos: string[], valor: string): boolean =>
  escolhidos.length === 0 || escolhidos.includes(valor);

const porContagem = (
  escolhidos: string[],
  mapa: Record<string, number | undefined>,
): boolean =>
  escolhidos.length === 0 || escolhidos.some((k) => (mapa[k] ?? 0) > 0);

export function filtrarLinhas<T extends LinhaFiltravel>(
  linhas: T[],
  f: FiltrosPool,
): T[] {
  return linhas.filter(
    (l) =>
      porTexto(f.transportadoras, l.transportadora) &&
      porTexto(f.perfis, l.perfil) &&
      porTexto(f.clusters, l.cluster) &&
      porContagem(f.marcas, {
        dentro: l.dentroDoPool,
        desafio: l.desafio,
        sinergia: l.sinergia,
        sobra: l.sobra,
      }) &&
      porContagem(f.culpas, {
        plan: l.culpaPlanejamento,
        tp: l.culpaTransportadora,
      }) &&
      porContagem(f.respostas, {
        aceito: l.aceites,
        recusado: l.recusas,
        sem: l.semResposta,
      }),
  );
}
