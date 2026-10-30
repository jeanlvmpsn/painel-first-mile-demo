export type LinhaDrop = {
  data: string;
  sellerId: string;
  sellerNome: string;
  placeId: string;
  placeNome: string;
  estimados: number;
  coletados: number;

  estado?: string;

  cluster?: string;
};

export function clusterPadrao(bruto: unknown): string {
  const m = String(bruto ?? "").trim().match(/^c?(\d{1,3})$/i);
  return m ? "C" + m[1].padStart(2, "0") : "";
}

export const CORTE_PADRAO = 20;

export function siglaEstado(bruto: unknown): string {
  const t = String(bruto ?? "").trim().toUpperCase();
  const m = t.match(/(?:^|-)([A-Z]{2})$/);
  return m ? m[1] : "";
}

export function estadoDoSeller(linhas: LinhaDrop[]): string {
  const vezes = new Map<string, number>();
  for (const l of linhas) if (l.estado) vezes.set(l.estado, (vezes.get(l.estado) ?? 0) + 1);
  return [...vezes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
export const JANELA_PADRAO = 30;
export const DIAS_RECENTES = 7;

const texto = (v: unknown) => String(v ?? "").trim();
const numero = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;

const foraDoDrop = (l: { estimados: number; coletados: number; placeNome: string }) =>
  (l.estimados === 0 && l.coletados === 0) || l.placeNome.toUpperCase() === "CAMPINAS";

export function normalizarLinhas(brutas: Record<string, unknown>[]): LinhaDrop[] {
  return brutas
    .map((b) => ({
      data: texto(b.route_date).slice(0, 10),
      sellerId: texto(b.shp_sender_id),
      sellerNome: texto(b.shp_sender_nickname),
      placeId: texto(b.SHP_RELATED_ENTITY_ID),
      placeNome: texto(b.SHP_LG_CUST_DISPLAY_NAME),
      estimados: numero(b.total_estimados),
      coletados: numero(b.total_coletados),
      estado: siglaEstado(b.shp_sender_state_id),
      cluster: clusterPadrao(b.cluster),
    }))
    // Se entrasse, o dia contaria como dia com drop e puxaria a media para baixo.
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.data) && !foraDoDrop(l))
    .sort(
      (a, b) =>
        b.data.localeCompare(a.data) || b.coletados - a.coletados,
    );
}

export type Medias = {
  dias: number;
  somaEstimados: number;
  somaColetados: number;
  estimados: number;
  coletados: number;
};

export function medias(linhas: LinhaDrop[]): Medias {
  const dias = new Set(linhas.map((l) => l.data)).size;
  const somaEstimados = linhas.reduce((a, l) => a + l.estimados, 0);
  const somaColetados = linhas.reduce((a, l) => a + l.coletados, 0);
  return {
    dias,
    somaEstimados,
    somaColetados,
    estimados: dias ? somaEstimados / dias : 0,
    coletados: dias ? somaColetados / dias : 0,
  };
}

export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * 86400000)
    .toISOString()
    .slice(0, 10);
}

export type Status = "passivel" | "em-alta" | "em-baixa" | "abaixo";

export const ROTULO_STATUS: Record<Status, string> = {
  passivel: "Passível de upgrade",
  "em-alta": "Em alta na última semana",
  "em-baixa": "Em baixa na última semana",
  abaixo: "Abaixo do corte",
};

export type Avaliacao = {
  geral: Medias;
  recente: Medias;
  status: Status;
};

export function avaliar(
  linhas: LinhaDrop[],
  fimISO: string,
  corte = CORTE_PADRAO,
  diasRecentes = DIAS_RECENTES,
): Avaliacao {
  const geral = medias(linhas);
  const desde = somarDias(fimISO, -(diasRecentes - 1));
  const recente = medias(linhas.filter((l) => l.data >= desde && l.data <= fimISO));
  let status: Status = "passivel";
  const semanaAcima = recente.dias > 0 && recente.estimados >= corte;

  if (geral.estimados < corte) status = semanaAcima ? "em-alta" : "abaixo";
  else if (!semanaAcima) status = "em-baixa";
  return { geral, recente, status };
}

export type SellerNoPlace = Avaliacao & {
  sellerId: string;
  sellerNome: string;
};

const ORDEM_STATUS: Record<Status, number> = {
  passivel: 0,
  "em-alta": 1,
  "em-baixa": 2,
  abaixo: 3,
};

export function sellersDoPlace(
  linhas: LinhaDrop[],
  fimISO: string,
  corte = CORTE_PADRAO,
): SellerNoPlace[] {
  const grupos = new Map<string, LinhaDrop[]>();
  for (const l of linhas) {
    grupos.set(l.sellerId, [...(grupos.get(l.sellerId) ?? []), l]);
  }
  return [...grupos.entries()]
    .map(([sellerId, doSeller]) => ({
      sellerId,
      sellerNome: doSeller[0]?.sellerNome ?? "",
      ...avaliar(doSeller, fimISO, corte),
    }))
    .sort(
      (a, b) =>
        ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status] ||
        b.geral.estimados - a.geral.estimados,
    );
}

export function categoriaPdf(bruta: unknown): string {
  return String(bruta ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
}

export function nomeDoPdf(sellerId: string, mediaEstimados: number, categoria = ""): string {
  const cat = categoriaPdf(categoria);
  return "SELLER_" + sellerId + "_" + Math.round(mediaEstimados) + "PCTS_DIA" + (cat ? "(" + cat + ")" : "");
}

export function idValido(tipo: "seller" | "place", id: string): boolean {
  return tipo === "seller"
    ? /^\d{1,20}$/.test(id)
    : /^[A-Za-z0-9_-]{1,40}$/.test(id);
}

export const PISO_BASE = 15;
export const PISO_BUSCA = 1;

export type PlaceDia = {
  data: string;
  placeId: string;
  placeNome: string;
  estimados: number;
  coletados: number;
  sellers: number;
};

const semAcento = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

export function porCabecalho(linhas: unknown[][]): Record<string, unknown>[] {
  const cab = (linhas[0] ?? []).map((c) => String(c ?? "").trim());
  return linhas.slice(1).map((l) => {
    const o: Record<string, unknown> = {};
    cab.forEach((c, i) => (o[c] = l[i]));
    return o;
  });
}

export function normalizarPlaces(brutas: Record<string, unknown>[]): PlaceDia[] {
  return brutas
    .map((b) => ({
      data: texto(b.route_date).slice(0, 10),
      placeId: texto(b.SHP_RELATED_ENTITY_ID),
      placeNome: texto(b.SHP_LG_CUST_DISPLAY_NAME),
      estimados: numero(b.total_estimados),
      coletados: numero(b.total_coletados),
      sellers: numero(b.sellers),
    }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.data) && p.placeId && !foraDoDrop(p));
}

export function mediasPlace(dias: PlaceDia[]): Medias {
  return medias(
    dias.map((p) => ({
      data: p.data,
      sellerId: "",
      sellerNome: "",
      placeId: p.placeId,
      placeNome: p.placeNome,
      estimados: p.estimados,
      coletados: p.coletados,
    })),
  );
}

export type Candidato = Avaliacao & {
  sellerId: string;
  sellerNome: string;

  placeId: string;
  placeNome: string;
  places: number;

  cluster: string;
  clusters: string[];
};

export function candidatos(
  linhas: LinhaDrop[],
  fimISO: string,
  corte = CORTE_PADRAO,
): Candidato[] {
  const grupos = new Map<string, LinhaDrop[]>();
  for (const l of linhas) grupos.set(l.sellerId, [...(grupos.get(l.sellerId) ?? []), l]);
  return [...grupos.entries()]
    .map(([sellerId, doSeller]) => {
      const porPlace = new Map<string, { nome: string; est: number; cluster: string }>();
      for (const l of doSeller) {
        const p = porPlace.get(l.placeId) ?? { nome: l.placeNome, est: 0, cluster: "" };
        p.est += l.estimados;
        if (!p.cluster && l.cluster) p.cluster = l.cluster;
        porPlace.set(l.placeId, p);
      }
      const ordenados = [...porPlace.entries()].sort((a, b) => b[1].est - a[1].est);
      const [placeId, principal] = ordenados[0];

      const clusters = [...new Set(ordenados.map(([, p]) => p.cluster).filter(Boolean))];
      return {
        sellerId,
        sellerNome: doSeller[0].sellerNome,
        placeId,
        placeNome: principal.nome,
        places: porPlace.size,
        cluster: principal.cluster || clusters[0] || "",
        clusters,
        ...avaliar(doSeller, fimISO, corte),
      };
    })
    .sort(
      (a, b) =>
        ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status] ||
        b.geral.estimados - a.geral.estimados,
    );
}

export const CAB_SOLICITACAO = {
  sellerId: ["ID SELLER SENDER", "SELLER SENDER", "ID SELLER", "SELLER ID"],
  sellerNome: ["NOME SELLER SENDER", "NOME SELLER", "NOME DO SELLER"],
  placeId: ["K74", "ID PLACE", "PLACE ID"],
  placeNome: ["NOME PLACE", "NOME DO PLACE"],
  estado: ["ESTADO DO SELLER", "ESTADO"],
  upDown: ["UP ou DOWN ?", "UP OU DOWN"],
  motivo: ["MOTIVO"],
  evidenciaVolume: ["SE FOR VOLUMOSO, TEM EVIDENCIAS?"],
  solicitante: ["SOLICITANTE"],
  link: ["LINK DA EVIDENCIA"],
  status: ["STATUS"],
  statusFinal: ["STATUS FINAL"],

  resultado: ["RESULTADO"],
  feedback: ["FEEDBACK"],
  prazoAtivacao: ["PRAZO ATIVAÇÃO", "PRAZO DE ATIVAÇÃO"],
} as const;

export type ColunasSolicitacao = Record<keyof typeof CAB_SOLICITACAO, number>;

export function colunasSolicitacao(cabecalho: unknown[]): ColunasSolicitacao {
  const cab = cabecalho.map(semAcento);
  const saida = {} as ColunasSolicitacao;
  for (const [chave, nomes] of Object.entries(CAB_SOLICITACAO)) {
    let i = -1;
    for (const nome of nomes) {
      i = cab.indexOf(semAcento(nome));
      if (i >= 0) break;
    }
    saida[chave as keyof ColunasSolicitacao] = i;
  }
  return saida;
}

export type MotivoUpgrade = "quantidade" | "volumoso" | "fragil" | "peso";

export const MOTIVOS_UPGRADE: Record<MotivoUpgrade, { rotulo: string; texto: string }> = {
  quantidade: { rotulo: "Quantidade (alta volumetria)", texto: "alta volumetria (>20pcts/dia)" },

  volumoso: { rotulo: "Volumoso", texto: "volumoso" },
  fragil: { rotulo: "Frágil", texto: "Frágil" },
  peso: { rotulo: "Peso (pacotes pesados)", texto: "peso" },
};

export const MOTIVO_UPGRADE = MOTIVOS_UPGRADE.quantidade.texto;
export const STATUS_NOVA = "Pendente";

export function motivoValido(m: unknown): MotivoUpgrade {
  return m === "volumoso" || m === "fragil" || m === "peso" ? m : "quantidade";
}

export type NovaSolicitacao = {
  sellerId: string;
  sellerNome: string;
  placeId: string;
  placeNome: string;
  estado: string;
  solicitante: string;
  motivo?: MotivoUpgrade;

  evidenciaVolume?: string;

  categoria?: string;
};

export function linhaSolicitacao(
  c: ColunasSolicitacao,
  largura: number,
  s: NovaSolicitacao,
): string[] {
  const linha = new Array<string>(largura).fill("");
  const por = (i: number, v: string) => {
    if (i >= 0 && i < largura) linha[i] = v;
  };
  por(c.sellerId, s.sellerId);
  por(c.sellerNome, s.sellerNome);
  por(c.placeId, s.placeId);
  por(c.placeNome, s.placeNome);
  por(c.estado, s.estado);
  por(c.upDown, "UP");
  por(c.motivo, MOTIVOS_UPGRADE[s.motivo ?? "quantidade"].texto);

  if (s.motivo && s.motivo !== "quantidade") {
    por(c.evidenciaVolume, s.evidenciaVolume ?? "");
    por(c.link, s.evidenciaVolume ?? "");
  }
  por(c.solicitante, s.solicitante);
  por(c.status, STATUS_NOVA);
  return linha;
}

export type Solicitacao = {
  sellerId: string;
  placeId: string;
  placeNome: string;
  solicitante: string;
  link: string;
  status: string;
  statusFinal: string;

  origemFinal?: "base" | "copia";
  resultado?: string;
  feedback?: string;

  prazoAtivacao?: string;
};

export function lerSolicitacoes(linhas: unknown[][]): {
  solicitacoes: Solicitacao[];
  solicitantes: string[];
} {
  const c = colunasSolicitacao(linhas[0] ?? []);
  const pega = (l: unknown[], i: number) => (i >= 0 ? texto(l[i]) : "");
  const solicitacoes: Solicitacao[] = [];
  const nomes = new Map<string, number>();
  for (const l of linhas.slice(1)) {
    const sellerId = pega(l, c.sellerId).replace(/\D/g, "");
    const solicitante = pega(l, c.solicitante);
    if (solicitante) nomes.set(solicitante, (nomes.get(solicitante) ?? 0) + 1);
    if (!sellerId) continue;
    solicitacoes.push({
      sellerId,
      placeId: pega(l, c.placeId),
      placeNome: pega(l, c.placeNome),
      solicitante,
      link: pega(l, c.link),
      status: pega(l, c.status),
      statusFinal: pega(l, c.statusFinal),
      resultado: pega(l, c.resultado),
      feedback: pega(l, c.feedback),
      prazoAtivacao: pega(l, c.prazoAtivacao),
    });
  }
  const solicitantes = [...nomes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([n]) => n);
  return { solicitacoes, solicitantes };
}

export const CAB_FILA = [
  "PEDIDO",
  "CRIADO_EM",
  "SELLER_ID",
  "PLACE_ID",
  "INICIO",
  "FIM",
  "LINHA_SOLICITACAO",
  "STATUS",
  "LINK",
  "ERRO",
  "CATEGORIA",
];

export function linhaDaFaixa(faixa: string | null | undefined): number {
  const m = String(faixa ?? "").match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : 0;
}

export type SeloSolicitacao = {
  texto: string;
  tom: "pendente" | "solicitado" | "recusado" | "aceito";
};

export function motivoDaRecusa(s: Pick<Solicitacao, "status" | "statusFinal" | "resultado" | "feedback">): string {
  if (seloSolicitacao(s.status, s.statusFinal).tom !== "recusado") return "";
  return texto(s.resultado) || texto(s.feedback);
}

export function seloSolicitacao(status: string, statusFinal = ""): SeloSolicitacao {
  const k = semAcento(status);
  const f = semAcento(statusFinal);
  if (f.startsWith("processad")) return { texto: "Upgrade aceito", tom: "aceito" };
  if (/^(resusad|recusad|erro)/.test(f) || k.startsWith("recusad")) {
    return { texto: "Upgrade recusado", tom: "recusado" };
  }
  if (k.startsWith("pendente")) return { texto: "Upgrade sinalizado, falta solicitar", tom: "pendente" };
  return { texto: "Upgrade solicitado, aguardando resposta", tom: "solicitado" };
}

export type RespostaOriginal = {
  statusFinal: string;
  resultado: string;
  feedback: string;
  quando: string;
  prazoAtivacao: string;
};

export function lerBaseOriginal(linhas: unknown[][]): Map<string, RespostaOriginal> {
  const mapa = new Map<string, RespostaOriginal>();
  const iCab = linhas.slice(0, 10).findIndex((l) => (l ?? []).some((c) => semAcento(c) === "sellerid"));
  if (iCab < 0) return mapa;
  const cab = (linhas[iCab] ?? []).map(semAcento);
  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(semAcento(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    seller: col("Seller_id"),
    final: col("STATUS FINAL"),
    resultado: col("RESULTADO"),
    feedback: col("FEEDBACK"),
    quando: col("Carimbo de data/hora"),
    tipo: col("SOLICITACAO"),
    prazoAtivacao: col("PRAZO ATIVAÇÃO", "PRAZO DE ATIVAÇÃO"),
  };
  const pega = (l: unknown[], i: number) => (i >= 0 ? texto(l[i]) : "");
  for (const l of linhas.slice(iCab + 1)) {
    const seller = pega(l, c.seller).replace(/\D/g, "");
    if (!seller) continue;

    const tipo = semAcento(pega(l, c.tipo));
    if (tipo && !tipo.includes("up")) continue;

    mapa.set(seller, {
      statusFinal: pega(l, c.final),
      resultado: pega(l, c.resultado),
      feedback: pega(l, c.feedback),
      quando: pega(l, c.quando),
      prazoAtivacao: pega(l, c.prazoAtivacao),
    });
  }
  return mapa;
}

export function comBaseOriginal(solicitacoes: Solicitacao[], base: Map<string, RespostaOriginal>): Solicitacao[] {
  const saida = solicitacoes.map((s) => {
    const o = base.get(s.sellerId);
    if (!o) return { ...s, origemFinal: s.statusFinal ? ("copia" as const) : undefined };
    return {
      ...s,
      statusFinal: o.statusFinal || s.statusFinal,
      origemFinal: o.statusFinal ? ("base" as const) : s.statusFinal ? ("copia" as const) : undefined,
      resultado: o.resultado || s.resultado,
      feedback: o.feedback || s.feedback,
      prazoAtivacao: o.prazoAtivacao || s.prazoAtivacao,
    };
  });
  const naAba = new Set(solicitacoes.map((s) => s.sellerId));
  for (const [sellerId, o] of base) {
    if (naAba.has(sellerId)) continue;
    saida.push({
      sellerId,
      placeId: "",
      placeNome: "",
      solicitante: "",
      link: "",
      status: "Solicitado",
      statusFinal: o.statusFinal,
      origemFinal: "base",
      resultado: o.resultado,
      feedback: o.feedback,
      prazoAtivacao: o.prazoAtivacao,
    });
  }
  return saida;
}

export type AtivacaoUpgrade = { estado: "agendada" | "concluida"; dataBR: string };

export function ativacaoDoUpgrade(prazo: string | undefined, hojeISO: string): AtivacaoUpgrade | null {
  const t = texto(prazo);
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  let iso = "";
  if (m) iso = m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  else if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) iso = m[1] + "-" + m[2] + "-" + m[3];
  if (!iso) return null;
  const dataBR = iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
  return { estado: iso <= hojeISO ? "concluida" : "agendada", dataBR };
}
