export type RotaDaAtribuicao = {
  data: string;
  rota: string;
  transportadora: string;
  cluster: string;
  hub: string;
  perfil: string;
};

export type PedidoDoScheduling = {
  data: string;
  transportadora: string;
  cluster: string;
  hub: string;
  perfil: string;
  situacao: "aceite" | "recusa" | "semResposta" | "cancelado" | null;
};

export type Veredito = "certa" | "ambigua" | "semPedido";

export type Achado = {
  cluster: string;
  hub: string;
  perfil: string;
  veredito: Veredito;
  rotasOrfas: string[];

  culpados: { transportadora: string; recusas: number; semResposta: number }[];

  responsavel: string | null;
};

const chave = (v: string) => String(v ?? "").trim().toUpperCase();

function agrupar<T>(itens: T[], chaveDe: (i: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const k = chaveDe(item);
    const atual = mapa.get(k);
    if (atual) atual.push(item);
    else mapa.set(k, [item]);
  }
  return mapa;
}

export function conciliar(
  rotas: RotaDaAtribuicao[],
  pedidos: PedidoDoScheduling[],
  dataBR: string,
): Achado[] {
  const doDia = <T extends { data: string }>(l: T[]) =>
    l.filter((x) => String(x.data).trim() === String(dataBR).trim());

  const balde = (x: { cluster: string; hub: string; perfil: string }) =>
    chave(x.cluster) + " " + chave(x.hub) + " " + chave(x.perfil);

  const orfas = doDia(rotas).filter((r) => chave(r.transportadora) === "");
  if (orfas.length === 0) return [];

  const porBaldePedido = agrupar(doDia(pedidos), balde);
  const achados: Achado[] = [];

  for (const [k, grupo] of agrupar(orfas, balde)) {
    const pedidosDoBalde = porBaldePedido.get(k) ?? [];

    const porTp = new Map<string, { recusas: number; semResposta: number }>();
    for (const p of pedidosDoBalde) {
      if (p.situacao !== "recusa" && p.situacao !== "semResposta") continue;
      const nome = String(p.transportadora ?? "").trim() || "Sem transportadora";
      const atual = porTp.get(nome) ?? { recusas: 0, semResposta: 0 };
      if (p.situacao === "recusa") atual.recusas++;
      else atual.semResposta++;
      porTp.set(nome, atual);
    }

    const culpados = [...porTp.entries()]
      .map(([transportadora, c]) => ({ transportadora, ...c }))
      .sort(
        (a, b) =>
          b.recusas + b.semResposta - (a.recusas + a.semResposta) ||
          a.transportadora.localeCompare(b.transportadora, "pt-BR"),
      );

    let veredito: Veredito;
    if (culpados.length === 0) veredito = "semPedido";
    else if (culpados.length === 1) veredito = "certa";
    else veredito = "ambigua";

    achados.push({
      cluster: grupo[0].cluster,
      hub: grupo[0].hub,
      perfil: grupo[0].perfil,
      veredito,
      rotasOrfas: grupo.map((r) => r.rota).sort((a, b) => a.localeCompare(b, "pt-BR")),
      culpados,
      responsavel: veredito === "certa" ? culpados[0].transportadora : null,
    });
  }

  return achados.sort(
    (a, b) =>
      b.rotasOrfas.length - a.rotasOrfas.length ||
      a.cluster.localeCompare(b.cluster, "pt-BR"),
  );
}

export function resumir(achados: Achado[]) {
  const conta = (v: Veredito) => achados.filter((a) => a.veredito === v).length;
  return {
    baldes: achados.length,
    rotasOrfas: achados.reduce((s, a) => s + a.rotasOrfas.length, 0),
    comResponsavel: conta("certa"),
    ambiguos: conta("ambigua"),
    semPedido: conta("semPedido"),
  };
}
