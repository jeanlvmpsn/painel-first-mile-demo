export type SellerHB = {
  id: string;
  nome: string;
  rotulo: string;
};

export type ParadaHB = {
  rota?: string;
  rotaSemNome?: boolean;
  parada?: string;
  estimados?: number;
  transportadora?: string;

  planejada?: boolean;
};

export type LinhaHB = {
  rota: string;

  avulsa: boolean;
  eta: string;
  seller: string;
  estimados: number;

  naColeta: boolean;

  doMonitoramento: boolean;

  repetida?: boolean;
  placa: string;
  transportadora: string;
};

export function texto(v: unknown): string {
  return String(v ?? "").trim();
}

export function chaveId(v: unknown): string {
  const t = texto(v).replace(/\s+/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return t.replace(/[.,]/g, "");
  const m = t.match(/^(\d+)[.,]0+$/);
  return m ? m[1] : t;
}

export function idDoUsuarioBrp(v: unknown): string {
  const t = chaveId(v).toUpperCase();
  const m = /^BRP(\d+)\d$/.exec(t) ?? /^BRP(\d+)/.exec(t);
  return m ? m[1] : "";
}

export function porId<T>(mapa: Map<string, T>, k: string): T | undefined {
  if (!k) return undefined;
  const direto = mapa.get(k);
  if (direto !== undefined) return direto;
  const alt = idDoUsuarioBrp(k);
  return alt ? mapa.get(alt) : undefined;
}

export function chaveRota(v: unknown): string {
  return texto(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^(CAMPINAS|CPS)_+/, "");
}

export function montarListaHB(linhas: string[][]): Map<string, SellerHB> {
  const mapa = new Map<string, SellerHB>();
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i] ?? [];
    const id = chaveId(l[0]);
    if (!id) continue;
    const nome = texto(l[1]);
    const rotulo = texto(l[2]) || nome || id;
    mapa.set(id, { id, nome, rotulo });
  }
  return mapa;
}

export function montarHB(entrada: {
  paradas: ParadaHB[];
  sellers: Map<string, SellerHB>;
  etaPorRota: Record<string, string>;
  placaPorRota: Record<string, string>;

  estimadoMonitoramento?: (id: string) => number | null;
}): LinhaHB[] {
  const { paradas, sellers } = entrada;

  const porRota = (r: Record<string, string>) => {
    const m = new Map<string, string>();
    for (const [rota, v] of Object.entries(r)) {
      const k = chaveRota(rota);
      if (k && v) m.set(k, v);
    }
    return m;
  };
  const etaPorRota = porRota(entrada.etaPorRota);
  const placaPorRota = porRota(entrada.placaPorRota);
  const porChave = new Map<string, LinhaHB>();

  const idsDaLinha = new Map<string, Set<string>>();

  for (const p of paradas) {
    const rota = texto(p.rota);
    const id = chaveId(p.parada);
    if (!rota || !id) continue;
    const seller = sellers.get(id);
    if (!seller) continue;

    const chave = chaveRota(rota) + "|" + seller.rotulo;
    const daColeta = !p.planejada;
    const estimado = daColeta ? Number(p.estimados ?? 0) : 0;
    if (!idsDaLinha.has(chave)) idsDaLinha.set(chave, new Set());
    idsDaLinha.get(chave)!.add(id);
    const atual = porChave.get(chave);
    if (atual) {
      atual.estimados = Math.max(atual.estimados, estimado);
      atual.naColeta = atual.naColeta || daColeta;
      if (!atual.transportadora) atual.transportadora = texto(p.transportadora);
      continue;
    }
    porChave.set(chave, {
      rota,
      avulsa: Boolean(p.rotaSemNome),
      eta: texto(etaPorRota.get(chaveRota(rota))),
      seller: seller.rotulo,
      estimados: estimado,
      naColeta: daColeta,
      doMonitoramento: false,
      placa: texto(placaPorRota.get(chaveRota(rota))),
      transportadora: texto(p.transportadora),
    });
  }

  if (entrada.estimadoMonitoramento) {
    for (const [chave, linha] of porChave) {
      if (linha.naColeta) continue;
      let maior: number | null = null;
      for (const id of idsDaLinha.get(chave) ?? []) {
        const e = entrada.estimadoMonitoramento(id);
        if (e !== null && (maior === null || e > maior)) maior = e;
      }
      if (maior === null) continue;
      linha.estimados = maior;
      linha.doMonitoramento = true;
    }
  }

  const linhas = [...porChave.values()].sort(
    (a, b) =>
      a.seller.localeCompare(b.seller, "pt-BR") ||
      a.rota.localeCompare(b.rota, "pt-BR"),
  );

  const primeira = new Map<string, LinhaHB>();
  for (const l of linhas) {
    const p = primeira.get(l.seller);
    if (!p) {
      primeira.set(l.seller, l);
      continue;
    }
    if (l.estimados > p.estimados) {
      p.estimados = l.estimados;

      if (!p.naColeta) {
        p.naColeta = l.naColeta;
        p.doMonitoramento = l.doMonitoramento;
      }
    }
    l.estimados = 0;
    l.repetida = true;
  }
  return linhas;
}

export function resumoHB(linhas: LinhaHB[]): {
  rotas: number;
  sellers: number;
  estimados: number;
} {
  const rotas = new Set(linhas.map((l) => l.rota));
  const sellers = new Set(linhas.map((l) => l.seller));
  let estimados = 0;
  for (const l of linhas) estimados += l.estimados;
  return { rotas: rotas.size, sellers: sellers.size, estimados };
}

const semAcento = (t: unknown) =>
  texto(t)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");

export function dataParaBR(bruto: unknown): string {
  const t = texto(bruto);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[3].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + m[1];
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? "20" + m[3] : m[3];
    return m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + ano;
  }
  return t;
}

function cabecalho(linhas: string[][], obrigatoria: string) {
  const i = linhas.slice(0, 10).findIndex((l) => (l ?? []).map(semAcento).includes(obrigatoria));
  if (i < 0) return null;
  const cab = (linhas[i] ?? []).map(semAcento);
  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const c = cab.indexOf(n);
      if (c >= 0) return c;
    }
    return -1;
  };
  return { linha: i, col };
}

export type RotasDoDia = {
  etaPorRota: Map<string, string>;

  paradas: ParadaHB[] | null;
  aviso: string;
};

export function rotasDoDia(linhas: string[][], dataBR: string): RotasDoDia {
  const saida: RotasDoDia = { etaPorRota: new Map(), paradas: null, aviso: "" };
  const c = cabecalho(linhas, "NOME_ROTA");
  const cVig = c ? c.col("VIGENCIA", "DATA") : -1;
  if (!c || cVig < 0) {
    saida.aviso = "A aba Extracao Config nao tem as colunas VIGENCIA e NOME_ROTA.";
    return saida;
  }
  const cRota = c.col("NOME_ROTA");
  const cEta = c.col("ETA");
  const cSeller = c.col("ID_SELLER");
  if (cSeller >= 0) saida.paradas = [];
  const datas = new Set<string>();
  for (const l of linhas.slice(c.linha + 1)) {
    const data = dataParaBR(l?.[cVig]);
    if (data) datas.add(data);
    const rota = texto(l?.[cRota]);
    if (data !== dataBR || !rota) continue;
    if (!saida.etaPorRota.get(rota)) saida.etaPorRota.set(rota, cEta >= 0 ? texto(l[cEta]) : "");
    if (saida.paradas && texto(l[cSeller])) {
      saida.paradas.push({ rota, rotaSemNome: false, parada: texto(l[cSeller]), planejada: true });
    }
  }
  if (!saida.etaPorRota.size) {
    const vistas = [...datas].slice(-3).join(", ");
    saida.aviso =
      "A aba Extracao Config nao tem rotas de " + dataBR +
      (vistas ? " (datas encontradas: " + vistas + ")" : "") +
      ". Atualize a extracao da query; ate la o report mostra so o que ja passou no relatorio de coleta.";
  }
  return saida;
}

export function mapaDePontos(linhas: string[][]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const c = cabecalho(linhas, "NOME_ROTA");
  const cSeller = c ? c.col("ID_SELLER") : -1;
  if (!c || cSeller < 0) return mapa;
  const cRota = c.col("NOME_ROTA");
  for (const l of linhas.slice(c.linha + 1)) {
    const rota = chaveRota(l?.[cRota]);
    const id = chaveId(l?.[cSeller]);
    if (!rota || !id) continue;
    if (!mapa.has(rota)) mapa.set(rota, new Set());
    mapa.get(rota)!.add(id);
  }
  return mapa;
}

export function paradasPlanejadas(
  rotas: RotasDoDia,
  mapa: Map<string, Set<string>>,
  sellers: Pick<Map<string, unknown>, "has">,
  rotasExtras: string[] = [],
): ParadaHB[] {
  const saida: ParadaHB[] = [...(rotas.paradas ?? [])];
  const comSellerNaExtracao = new Set(saida.map((p) => chaveRota(p.rota)));

  const doDia = new Map<string, string>();
  for (const rota of [...rotas.etaPorRota.keys(), ...rotasExtras]) {
    const k = chaveRota(rota);
    if (k && !doDia.has(k)) doDia.set(k, texto(rota));
  }

  for (const [k, rota] of doDia) {
    if (comSellerNaExtracao.has(k)) continue;
    for (const id of mapa.get(k) ?? []) {
      if (sellers.has(id)) saida.push({ rota, rotaSemNome: false, parada: id, planejada: true });
    }
  }
  return saida;
}

export function diagnosticarRota(entrada: {
  rota: string;

  seller?: string;
  dataBR: string;
  sellers: Map<string, SellerHB>;
  extracao: string[][];
  mapa: Map<string, Set<string>>;
  atribuidas: { rota?: string; placa?: string }[];
  coleta: ParadaHB[];
  linhas: LinhaHB[];
}): string[] {
  const { dataBR, sellers, extracao, mapa, atribuidas, coleta, linhas } = entrada;
  const alvo = chaveRota(entrada.rota);
  if (!alvo) return [];
  const hb = (ids: Iterable<string>) => {
    const achados = new Set<string>();
    for (const id of ids) {
      const s = sellers.get(chaveId(id));
      if (s) achados.add(s.rotulo + " (" + chaveId(id) + ")");
    }
    return [...achados];
  };
  const lista = (xs: string[]) => (xs.length ? xs.join(", ") : "nenhum");
  const out: string[] = [];
  const idSeller = chaveId(entrada.seller);

  const temSeller = (ids: Iterable<string>) => {
    if (!idSeller) return "";
    for (const id of ids) if (chaveId(id) === idSeller) return " Seller " + idSeller + ": sim.";
    return " Seller " + idSeller + ": nao.";
  };

  if (idSeller) {
    const s = sellers.get(idSeller);
    out.push(
      s
        ? "Lista H&B: seller " + idSeller + " esta la, como " + s.rotulo + "."
        : "Lista H&B: seller " + idSeller + " NAO esta na lista - sem ele na aba H&B, nenhuma rota dele entra no report.",
    );
  }

  const noReport = linhas.filter((l) => chaveRota(l.rota) === alvo);
  out.push(
    noReport.length
      ? "Report: aparece em " + noReport.length + " linha(s) - " + noReport.map((l) => l.seller).join(", ") + "."
      : "Report: nao aparece.",
  );

  const atr = atribuidas.filter((r) => chaveRota(r.rota) === alvo);
  out.push(
    atr.length
      ? "Atribuicao de hoje: sim, como " + texto(atr[0].rota) + (texto(atr[0].placa) ? ", placa " + texto(atr[0].placa) : "") + "."
      : "Atribuicao de hoje: nao encontrada.",
  );

  const c = cabecalho(extracao, "NOME_ROTA");
  if (!c) {
    out.push("Extracao Config: aba sem cabecalho NOME_ROTA.");
  } else {
    const cVig = c.col("VIGENCIA", "DATA");
    const cRota = c.col("NOME_ROTA");
    const cSeller = c.col("ID_SELLER");
    const datas = new Set<string>();
    const idsHoje: string[] = [];
    let hoje = 0;
    for (const l of extracao.slice(c.linha + 1)) {
      if (chaveRota(l?.[cRota]) !== alvo) continue;
      const data = cVig >= 0 ? dataParaBR(l?.[cVig]) : "";
      datas.add(data);
      if (data !== dataBR) continue;
      hoje++;
      if (cSeller >= 0 && texto(l[cSeller])) idsHoje.push(texto(l[cSeller]));
    }
    if (hoje) {
      out.push(
        "Extracao Config de hoje: sim (" + hoje + " linha(s))" +
          (cSeller >= 0
            ? "; sellers H&B nela: " + lista(hb(idsHoje)) + (idsHoje.length ? "" : " (ID_SELLER vazio)")
            : "; a aba nao tem coluna ID_SELLER") + "." +
          (cSeller >= 0 && idsHoje.length ? temSeller(idsHoje) : ""),
      );
    } else {
      out.push(
        "Extracao Config de hoje: nao" +
          (datas.size ? " (aparece em " + [...datas].slice(-3).join(", ") + ")" : "") + ".",
      );
    }
  }

  const doMapa = mapa.get(alvo);
  out.push(
    doMapa
      ? "Formulas: " + doMapa.size + " seller(s) mapeados; H&B: " + lista(hb(doMapa)) + "." + temSeller(doMapa)
      : "Formulas: rota nao esta no mapa.",
  );

  const col = coleta.filter((p) => chaveRota(p.rota) === alvo);
  out.push(
    col.length
      ? "Relatorio de coleta de hoje: " + col.length + " parada(s); H&B: " + lista(hb(col.map((p) => texto(p.parada)))) + "." +
          temSeller(col.map((p) => texto(p.parada)))
      : "Relatorio de coleta de hoje: nenhuma parada ainda.",
  );
  return out;
}
