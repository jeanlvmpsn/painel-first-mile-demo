export type ParadaColeta = {
  idRota?: string;
  nomeRota?: string;
  dataRota?: string;
  transportadora?: string;
  parada?: string;
  coletados?: string | number;
  idParada?: string;
  planejado?: string;
};

export type Avulsa = {
  id: string;
  data: string;
  transportadora: string;
  paradas: number;

  coletados: number;

  origemColeta?: "relatorio" | "historico";
  link: string;

  forms?: FormsDaAvulsa;
};

export const LINK_BASE =
  "/demo/rota/";

export function linkDaAvulsa(id: string): string {
  const limpo = String(id ?? "").trim();
  return limpo ? LINK_BASE + limpo : "";
}

export function ehAvulsa(planejado: string | undefined | null): boolean {
  const p = String(planejado ?? "")
    .trim()
    .toLowerCase();
  return p === "nao" || p === "não" || p === "no" || p === "false";
}

export function ehNaoPagar(pagamento: string | undefined | null): boolean {
  const p = String(pagamento ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return p === "nao pagar" || p === "nao";
}

export function dataParaBR(bruta: string | undefined | null): string {
  const t = String(bruta ?? "").trim();
  const m = t.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return m[1] + "/" + m[2] + "/" + m[3];
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return iso[3] + "/" + iso[2] + "/" + iso[1];
  return t;
}

export function ehRotaSemNome(p: ParadaColeta): boolean {
  return !String(p.nomeRota ?? "").trim();
}

export function agruparAvulsas(
  paradas: ParadaColeta[],
  dataBR: string,
): Avulsa[] {
  const doDia = paradas.filter((p) => {
    const id = String(p.idRota ?? "").trim();
    if (!id) return false;
    if (!dataBR) return true;
    return dataParaBR(p.dataRota) === dataBR;
  });

  const avulsas = new Set<string>();
  for (const p of doDia) {
    if (ehRotaSemNome(p)) avulsas.add(String(p.idRota).trim());
  }

  const porId = new Map<string, Avulsa>();
  for (const p of doDia) {
    const id = String(p.idRota).trim();
    if (!avulsas.has(id)) continue;
    const achada = porId.get(id);
    if (achada) {
      achada.paradas += 1;
      achada.coletados += Number(String(p.coletados ?? "").replace(",", ".")) || 0;
      if (!achada.transportadora) {
        achada.transportadora = String(p.transportadora ?? "").trim();
      }
      continue;
    }
    porId.set(id, {
      id,
      data: dataParaBR(p.dataRota),
      transportadora: String(p.transportadora ?? "").trim(),
      paradas: 1,
      coletados: Number(String(p.coletados ?? "").replace(",", ".")) || 0,
      origemColeta: "relatorio",
      link: linkDaAvulsa(id),
    });
  }
  return [...porId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function opcoesDaColuna(valores: (string | undefined)[]): string[] {
  const porChave = new Map<string, { texto: string; vezes: number }>();
  for (const v of valores) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    const chave = t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    const achado = porChave.get(chave);
    if (achado) achado.vezes += 1;
    else porChave.set(chave, { texto: t, vezes: 1 });
  }
  return [...porChave.values()]
    .sort((a, b) => b.vezes - a.vezes || a.texto.localeCompare(b.texto, "pt-BR"))
    .map((o) => o.texto);
}

export type Registro = {
  id: string;
  data: string;
  transportadora: string;
  motivo: string;
  pagamento: string;
  criador: string;
  cluster: string;
  aprovacao: string;
  rotaImpactada: string;
  mlpImpactado: string;

  rotaImpactadaId?: string;
};

export function registroVazio(a: Avulsa): Registro {
  return {
    id: a.id,
    data: a.data,
    transportadora: a.transportadora,
    motivo: "",
    pagamento: "",
    criador: "",
    cluster: "",
    aprovacao: "",
    rotaImpactada: "",
    mlpImpactado: "",
  };
}

export function acharLinhaPorId(
  linhas: string[][],
  colunaId: number,
  id: string,
): number {
  const alvo = String(id ?? "").trim();
  if (!alvo) return -1;
  for (let i = 1; i < linhas.length; i += 1) {
    if (String(linhas[i]?.[colunaId] ?? "").trim() === alvo) return i;
  }
  return -1;
}

export const MOTIVOS = [
  "Ajuste de FMPP",
  "Ajuste de perfil",
  "Área inacessível",
  "Backlog",
  "Carga frágil",
  "Dispersão Fcst",
  "Erro config",
  "Erro exec",
  "Erro MLP",
  "Erro routing",
  "Liberação no XD",
  "M1 não atendida",
  "Não subiu em config",
  "NS Driver",
  "NSE",
  "NSE peso",
  "Rota cancelada",
  "Sin drop off",
  "Substituição programada",
];

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function motivoPadrao(bruto: string | undefined | null): string {
  const t = String(bruto ?? "").trim();
  if (!t) return "";
  const chave = semAcento(t);
  return MOTIVOS.find((m) => semAcento(m) === chave) ?? t;
}

export function formulaLink(url: string, texto: string): string {
  const u = String(url ?? "").trim();
  const t = String(texto ?? "").trim();
  if (!u || !t) return t;
  const limpo = (v: string) => v.replace(/"/g, "'");
  return '=HYPERLINK("' + limpo(u) + '";"' + limpo(t) + '")';
}

export type FiltrosAvulsas = {
  transportadoras: string[];
  clusters: string[];
  motivos: string[];
  busca: string;
};

export const filtrosVaziosAvulsas = (): FiltrosAvulsas => ({
  transportadoras: [],
  clusters: [],
  motivos: [],
  busca: "",
});

export function alternarValor(lista: string[], valor: string): string[] {
  return lista.includes(valor)
    ? lista.filter((v) => v !== valor)
    : [...lista, valor];
}

export function chaveAvulsa(data: string, id: string): string {
  return String(data ?? "") + "|" + String(id ?? "");
}

export function filtrarAvulsas(
  avulsas: Avulsa[],
  registros: Record<string, Registro>,
  f: FiltrosAvulsas,
): Avulsa[] {
  const busca = String(f.busca ?? "").trim();
  return avulsas.filter((a) => {
    const r = registros[chaveAvulsa(a.data, a.id)];
    if (busca && !a.id.includes(busca)) return false;
    if (
      f.transportadoras.length > 0 &&
      !f.transportadoras.includes(a.transportadora)
    ) {
      return false;
    }
    if (f.clusters.length > 0 && !f.clusters.includes(r?.cluster ?? "")) {
      return false;
    }
    if (f.motivos.length > 0 && !f.motivos.includes(r?.motivo ?? "")) {
      return false;
    }
    return true;
  });
}

export function textoRotaImpactada(
  rota: string | undefined | null,
  mlp: string | undefined | null,
): string {
  const r = String(rota ?? "").trim();
  const m = String(mlp ?? "").trim();
  if (r && m) return r + " - " + m;
  return r || m;
}

export type RespostaFoto = {
  carimbo?: string;
  dataExecucao?: string;
  rota?: string;
  idRota?: string;
  fotoBau?: string;
};

function momentoDoCarimbo(carimbo: string | undefined | null): number {
  const m = String(carimbo ?? "").match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) return 0;
  return Date.UTC(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0),
  );
}

function diaBR(texto: string | undefined | null): string {
  const m = String(texto ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + m[3] : "";
}

export type FormsDaAvulsa = { fotoBau: string };

export function formsDasAvulsas(
  avulsas: Pick<Avulsa, "id" | "data">[],
  respostas: RespostaFoto[],
): Record<string, FormsDaAvulsa> {
  const queridas = new Set(
    avulsas.map((a) => chaveAvulsa(a.data, String(a.id ?? "").trim())),
  );
  const melhor = new Map<string, RespostaFoto>();
  for (const r of respostas) {
    const dia = diaBR(r.dataExecucao) || diaBR(r.carimbo);
    if (!dia) continue;
    const bruto = String(r.idRota ?? "") + " " + String(r.rota ?? "");
    for (const id of new Set(bruto.match(/[0-9]{5,}/g) ?? [])) {
      const chave = chaveAvulsa(dia, id);
      if (!queridas.has(chave)) continue;
      const atual = melhor.get(chave);
      const temFoto = !!String(r.fotoBau ?? "").trim();
      const atualTemFoto = !!String(atual?.fotoBau ?? "").trim();
      if (
        !atual ||
        (temFoto && !atualTemFoto) ||
        (temFoto === atualTemFoto &&
          momentoDoCarimbo(r.carimbo) > momentoDoCarimbo(atual.carimbo))
      ) {
        melhor.set(chave, r);
      }
    }
  }
  const saida: Record<string, FormsDaAvulsa> = {};
  for (const [chave, r] of melhor) {
    saida[chave] = { fotoBau: String(r.fotoBau ?? "").trim() };
  }
  return saida;
}

export type ColetaSalva = {
  data: string;
  id: string;
  transportadora: string;
  coletados: number;

  linha?: number;
};

export function dataBRPadrao(bruta: string | undefined | null): string {
  const t = String(bruta ?? "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + m[3];
  return dataParaBR(t);
}

export function paraHistorico(avulsas: Avulsa[]): Avulsa[] {
  return avulsas.filter((a) => a.origemColeta === "relatorio" && a.data);
}

export function completarComHistorico(
  avulsas: Avulsa[],
  salvas: Map<string, ColetaSalva>,
  dias: string[],
): void {
  const naLista = new Set(avulsas.map((a) => chaveAvulsa(a.data, a.id)));
  for (const a of avulsas) {
    if (a.origemColeta === "relatorio") continue;
    const salva = salvas.get(chaveAvulsa(a.data, a.id));
    if (!salva) continue;
    a.coletados = salva.coletados;
    a.origemColeta = "historico";
    if (!a.transportadora) a.transportadora = salva.transportadora;
  }
  const doPeriodo = new Set(dias);
  for (const [chave, salva] of salvas) {
    if (naLista.has(chave) || !doPeriodo.has(salva.data)) continue;
    avulsas.push({
      id: salva.id,
      data: salva.data,
      transportadora: salva.transportadora,
      paradas: 0,
      coletados: salva.coletados,
      origemColeta: "historico",
      link: linkDaAvulsa(salva.id),
    });
  }
}

function serieParaBR(serie: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86400000);
  return (
    String(d.getUTCDate()).padStart(2, "0") +
    "/" +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    "/" +
    d.getUTCFullYear()
  );
}

const soLetras = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

export function lerColetasSalvas(linhas: unknown[][]): Map<string, ColetaSalva> {
  const salvas = new Map<string, ColetaSalva>();
  const cab = (linhas[0] ?? []).map(soLetras);
  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(soLetras(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iData = col("DATA", "DATA DA ROTA", "DIA");
  const iId = col("ID", "ID DA ROTA", "ID DO ROTA", "ID_ROTA", "ID AVULSA");
  const iTp = col("TRANSPORTADORA");
  const iPac = col(
    "PACOTES_COLETADOS",
    "PACOTES COLETADOS",
    "COLETADOS",
    "PACOTES",
    "QTD COLETADA",
    "QUANTIDADE COLETADA",
  );
  if (iData < 0 || iId < 0 || iPac < 0) return salvas;

  for (let n = 1; n < linhas.length; n += 1) {
    const l = linhas[n] ?? [];
    const bruta = l[iData];
    const data =
      typeof bruta === "number" ? serieParaBR(bruta) : dataBRPadrao(String(bruta ?? ""));

    const bId = l[iId];
    const id =
      typeof bId === "number"
        ? String(Math.round(bId))
        : String(bId ?? "").replace(/[.\s]/g, "").trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(data) || !id) continue;
    const bPac = l[iPac];
    const coletados =
      typeof bPac === "number"
        ? bPac
        : Number(String(bPac ?? "").replace(/\./g, "").replace(",", ".")) || 0;
    salvas.set(chaveAvulsa(data, id), {
      data,
      id,
      transportadora: iTp >= 0 ? String(l[iTp] ?? "").trim() : "",
      coletados,
      linha: n + 1,
    });
  }
  return salvas;
}
