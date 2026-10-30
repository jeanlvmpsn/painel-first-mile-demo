import { criarClienteFalso } from "./demo/planilhaFalsa";
import { classificarPontualidade, type ParadaColeta } from "./relatorioTipos";
import { extrairIdRota } from "./dashboardUtils";
import { hubDaRota, OUTRO_HUB_NO_TEXTO, somenteCampinas } from "./hubs";
import { ehNaoProgramada, ehSemEspaco } from "./motivosCurva";
import { colunaIdParada, ehLinhaDoCd } from "./relatorioColeta";
import { corrigirDataForm } from "./datasForm";
import { diasDoPeriodo } from "./periodo";
import { completarSnapshot, linhaDoHistorico } from "./snapshotAtribuicao";

export const SPREADSHEET_ID =
  "demo-principal";

const ABA_ATRIBUICAO = "ATRIBUIÇÃO";
const ABA_RESPOSTAS = "Respostas ao formulário 1";
const ABA_HISTORICO = "HISTORICO_ATRIBUICAO";
const ABA_ROTAS_BQ = "ROTAS_BQ";
const ABA_ROTAS_BQ_HIST = "HISTORICO_ROTAS_BQ";

const ABA_COLETAS = "COLETAS_D0";
const ABA_MONITORAMENTO = "MONITORAMENTO";

const ABA_COLETAS_HIST = "HISTORICO_COLETAS";

export type RotaAtribuida = {
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

export type RespostaForm = {
  carimbo: string;
  email: string;
  dataExecucao: string;
  transportadora: string;
  rota: string;
  perfilVeiculo: string;
  placa: string;
  fotoBau: string;
  estourou: string;
  idRota: string;

  rotaNoRelatorio?: string;

  duplicataDe?: string;
};

export type RotaStatus = RotaAtribuida & {
  status: "concluida" | "pendente" | "avulsa";
  resposta?: RespostaForm;

  matchAproximado?: boolean;

  matchPorId?: boolean;

  ns?: NsInfo;

  coletouZero?: boolean;

  idRota?: string;

  data?: string;
};

export type RotasDoDia = {
  rotas: RotaStatus[];

  comparavel: boolean;

  respostasOrfas: RespostaForm[];

  respostasRepetidas: RespostaForm[];
};

function normalizar(valor: string | undefined | null): string {
  return (valor ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

const PREFIXOS_OUTRO_HUB = OUTRO_HUB_NO_TEXTO;

const ROTAS_DE_APOIO = /REVERS|RESGATE|SOCORRO/i;

function extrairNucleoRota(rota: string): string | null {
  if (PREFIXOS_OUTRO_HUB.test(rota)) return null;
  if (ROTAS_DE_APOIO.test(rota)) return null;
  const match = rota.match(/C(\d{2})\D{0,3}(\d{2,4})/i);
  if (!match) return null;
  const numero = parseInt(match[2], 10);
  if (Number.isNaN(numero)) return null;
  return `C${match[1]}_${numero}`;
}

function normalizarDataBR(valor: string | undefined | null): string {
  const texto = (valor ?? "").toString().trim();
  let m = texto.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return texto;
}

function nucleosCompativeis(rotaA: string, rotaB: string): boolean {
  const a = extrairNucleoRota(rotaA);
  const b = extrairNucleoRota(rotaB);
  if (!a || !b) return true;
  return a === b;
}

export type ResumoRota = {
  paradas: number;
  coletados: number;
  estimados: number;
  motivos: string[];
};

export type NsInfo = {
  motivo: string;
  origem: "motivo" | "ausencia";
  paradas: number;
  estimados: number;
};

const CORTE_NS_HORA = 21;

const MOTIVOS_IMPEDITIVOS = [
  "problemamecanico",
  "naopossocontinuardirigindo",
  "cancelada",

  "naopasseipeloendereco",
];

function chaveTexto(v: string | undefined | null): string {
  return String(v ?? "").toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

function motivoImpeditivo(motivos: string[]): string | null {
  for (const m of motivos) {
    const k = chaveTexto(m);
    if (k && MOTIVOS_IMPEDITIVOS.some((alvo) => k.indexOf(alvo) >= 0)) return m;
  }
  return null;
}

function horaAgoraSP(): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false,
    }).format(new Date())
  );
}

function horaDoCarimbo(v: string): number | null {
  const m = String(v ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) : null;
}

function podeInferirAusencia(ehHoje: boolean, carimbo: string): boolean {
  if (ehHoje) return horaAgoraSP() >= CORTE_NS_HORA;

  const h = horaDoCarimbo(carimbo);
  return h === null ? true : h >= CORTE_NS_HORA;
}

function avaliarNs(
  resumo: ResumoRota | undefined,
  liberaAusencia: boolean
): NsInfo | null {
  if (resumo) {
    if (resumo.coletados > 0) return null;
    const motivo = motivoImpeditivo(resumo.motivos);
    if (!motivo) return null;
    return {
      motivo,
      origem: "motivo",
      paradas: resumo.paradas,
      estimados: resumo.estimados,
    };
  }
  if (!liberaAusencia) return null;
  return { motivo: "", origem: "ausencia", paradas: 0, estimados: 0 };
}

export function formatarDataBR(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const CACHE_LEITURA_MS = 45_000;
type Leitura = { quando: number; promessa: Promise<unknown> };
const leituras = new Map<string, Leitura>();
let clienteUnico: ReturnType<typeof criarClienteFalso> | null = null;

export function limparCacheSheets(): void {
  leituras.clear();
}

function copiarResposta(r: unknown): unknown {
  const resp = r as { data?: { values?: unknown[][]; valueRanges?: { values?: unknown[][] }[] } };
  if (!resp?.data) return r;
  const copiar = (v?: unknown[][]) => v?.map((l) => (Array.isArray(l) ? [...l] : l));
  return {
    ...resp,
    data: {
      ...resp.data,
      ...(resp.data.values ? { values: copiar(resp.data.values) } : {}),
      ...(resp.data.valueRanges ? { valueRanges: resp.data.valueRanges.map((vr) => ({ ...vr, values: copiar(vr.values) })) } : {}),
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function comCache(alvo: any, nome: string): void {
  const original = alvo[nome].bind(alvo);
  alvo[nome] = (params: unknown, ...resto: unknown[]) => {
    if (resto.length) return original(params, ...resto);
    const agora = Date.now();
    for (const [k, l] of leituras) if (agora - l.quando >= CACHE_LEITURA_MS) leituras.delete(k);
    const chave = nome + JSON.stringify(params);
    let l = leituras.get(chave);
    if (!l) {
      const promessa = original(params) as Promise<unknown>;
      l = { quando: agora, promessa };
      leituras.set(chave, l);

      promessa.catch(() => {
        if (leituras.get(chave)?.promessa === promessa) leituras.delete(chave);
      });
    }
    return l.promessa.then(copiarResposta);
  };
}

function limpaAoGravar(alvo: any, nome: string): void {
  const original = alvo[nome].bind(alvo);
  alvo[nome] = (...args: unknown[]) => {
    limparCacheSheets();
    const r = original(...args);

    if (r && typeof r.finally === "function") return r.finally(limparCacheSheets);
    return r;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function getSheetsClient() {
  if (clienteUnico) return clienteUnico;

  const cliente = criarClienteFalso();
  comCache(cliente.spreadsheets.values, "get");
  comCache(cliente.spreadsheets.values, "batchGet");
  for (const nome of ["update", "append", "clear", "batchUpdate"]) limpaAoGravar(cliente.spreadsheets.values, nome);
  limpaAoGravar(cliente.spreadsheets, "batchUpdate");
  clienteUnico = cliente;
  return cliente;
}

async function getRange(range: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return (data.values as string[][] | undefined) ?? [];
}

export async function getAtribuicaoDoDia(dataBR?: string): Promise<RotaAtribuida[]> {
  const linhas = await getRange(`${ABA_ATRIBUICAO}!A1:Z`);
  if (linhas.length < 2) return [];

  const cabecalho = (linhas[0] ?? []).map((c) =>
    normalizar(c).replace(/[^A-Z0-9]/g, "")
  );
  const achar = (apelidos: string[]) =>
    cabecalho.findIndex((c) => apelidos.includes(c));

  const iRota = achar(["ROTA", "NOMEROTA", "NOMEDAROTA"]);
  const iStart = achar(["START", "INICIO", "HORARIO", "HORA"]);
  const iTransp = achar(["TRANSPORTADORA", "CARRIER", "MLP"]);
  const iPlaca = achar(["PLACA", "VEICULO"]);
  const iData = achar(["DATA", "DATADAROTA"]);
  const iHub = achar(["HUB", "REGIAO", "BASE"]);
  const iMotorista = achar(["MOTORISTA"]);
  const iStatusMotorista = achar(["STATUS_MOTORISTA", "STATUSMOTORISTA"]);
  const iTipoRota = achar(["TIPO_ROTA", "TIPOROTA", "ROUTETYPE"]);
  const iPerfil = achar(["PERFIL"]);

  const col = {
    rota: iRota >= 0 ? iRota : 0,
    start: iStart >= 0 ? iStart : 1,
    transportadora: iTransp >= 0 ? iTransp : 2,
    placa: iPlaca >= 0 ? iPlaca : 3,
    hub: iHub,
    motorista: iMotorista,
    statusMotorista: iStatusMotorista,
    tipoRota: iTipoRota,
    perfil: iPerfil,

    veiculo: cabecalho.findIndex(
      (c, i) => i !== (iPlaca >= 0 ? iPlaca : 3) && (c === "VEICULO" || c === "TIPOVEICULO"),
    ),
  };

  const corpo = linhas.slice(1).filter((linha) => (linha[col.rota] ?? "").trim());

  const hoje = formatarDataBR(new Date());
  const alvo = dataBR ?? hoje;

  if (iData < 0 && alvo !== hoje) return [];
  let usadas = corpo;
  if (iData >= 0) {
    const doDia = corpo.filter(
      (linha) => normalizarDataBR(linha[iData] ?? "") === alvo
    );

    usadas = doDia;
  }

  return usadas.map((linha) => ({
    rota: (linha[col.rota] ?? "").trim(),
    start: (linha[col.start] ?? "").trim(),
    transportadora: (linha[col.transportadora] ?? "").trim(),
    placa: (linha[col.placa] ?? "").trim(),
    hub: hubDaRota(linha[col.rota], col.hub >= 0 ? linha[col.hub] : ""),
    motorista:
      col.motorista >= 0 ? String(linha[col.motorista] ?? "").trim() : "",
    statusMotorista:
      col.statusMotorista >= 0
        ? String(linha[col.statusMotorista] ?? "").trim()
        : "",
    tipoRota: col.tipoRota >= 0 ? String(linha[col.tipoRota] ?? "").trim() : "",
    perfil: col.perfil >= 0 ? String(linha[col.perfil] ?? "").trim() : "",
    veiculo: col.veiculo >= 0 ? String(linha[col.veiculo] ?? "").trim() : "",
  }));
}

export async function getAtribuicaoHistorica(dataBR: string): Promise<RotaAtribuida[]> {
  let linhas: string[][];
  try {
    linhas = await getRange(`${ABA_HISTORICO}!A2:K`);
  } catch {
    return [];
  }
  return linhas
    .filter((linha) => linha[0] === dataBR)
    .map((linha) => ({
      rota: linha[1] ?? "",
      start: linha[2] ?? "",
      transportadora: linha[3] ?? "",
      placa: linha[4] ?? "",
      hub: hubDaRota(linha[1], linha[5]),
      motorista: linha[6] ?? "",

      statusMotorista: (linha[7] ?? "").trim() || "não gravado",
    tipoRota: linha[8] ?? "",
      perfil: linha[9] ?? "",
      veiculo: linha[10] ?? "",
    }));
}

export async function getAtribuicaoHistoricaPorDia(): Promise<
  Map<string, RotaAtribuida[]>
> {
  let linhas: string[][];
  try {
    linhas = await getRange(`${ABA_HISTORICO}!A2:K`);
  } catch {
    return new Map();
  }
  const mapa = new Map<string, RotaAtribuida[]>();
  for (const linha of linhas) {
    const data = String(linha[0] ?? "").trim();
    if (!data) continue;
    const lista = mapa.get(data) ?? [];
    lista.push({
      rota: linha[1] ?? "",
      start: linha[2] ?? "",
      transportadora: linha[3] ?? "",
      placa: linha[4] ?? "",
      hub: hubDaRota(linha[1], linha[5]),
      motorista: linha[6] ?? "",
      statusMotorista: (linha[7] ?? "").trim() || "não gravado",
      tipoRota: linha[8] ?? "",
      perfil: linha[9] ?? "",
      veiculo: linha[10] ?? "",
    });
    mapa.set(data, lista);
  }
  return mapa;
}

export async function getRespostasForm(): Promise<RespostaForm[]> {
  const linhas = await getRange(`'${ABA_RESPOSTAS}'!A2:J`);
  return linhas
    .filter((linha) => linha[0])
    .map((linha) => ({
      carimbo: linha[0] ?? "",
      email: linha[1] ?? "",

      dataExecucao: corrigirDataForm(linha[2], linha[0]),
      transportadora: linha[3] ?? "",
      rota: linha[4] ?? "",
      perfilVeiculo: linha[5] ?? "",
      placa: linha[6] ?? "",
      fotoBau: linha[7] ?? "",
      estourou: linha[8] ?? "",
      idRota: linha[9] ?? "",
    }));
}

function momentoDaResposta(r: RespostaForm): number {
  const m = String(r.carimbo || "").match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) return 0;
  return new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? 0)
  ).getTime();
}

function cruzarComAtribuicao(
  atribuicoes: RotaAtribuida[],
  respostasRecebidas: RespostaForm[],
  indice: IndiceRotas
): {
  rotas: RotaStatus[];
  respostasOrfas: RespostaForm[];
  respostasRepetidas: RespostaForm[];
} {
  const respostasDoDia = [...respostasRecebidas].sort(
    (a, b) => momentoDaResposta(b) - momentoDaResposta(a)
  );

  const respostasPorId = new Map<string, RespostaForm>();
  const respostasPorChave = new Map<string, RespostaForm>();
  const respostasPorRota = new Map<string, RespostaForm>();
  const respostasPorNucleo = new Map<string, RespostaForm>();

  const respostasPorRotaRelatorio = new Map<string, RespostaForm>();
  for (const resposta of respostasDoDia) {
    const idDigitado = extrairIdRota(resposta.idRota);
    if (idDigitado && !respostasPorId.has(idDigitado)) {
      respostasPorId.set(idDigitado, resposta);
    }
    if (idDigitado) {
      const rotaDoRelatorio = indice.rotaPorId.get(idDigitado);
      const chaveRelatorio = rotaDoRelatorio ? normalizar(rotaDoRelatorio) : "";
      if (chaveRelatorio && !respostasPorRotaRelatorio.has(chaveRelatorio)) {
        respostasPorRotaRelatorio.set(chaveRelatorio, resposta);
      }
    }
    const chave = `${normalizar(resposta.placa)}|${normalizar(resposta.rota)}`;
    if (!respostasPorChave.has(chave)) {
      respostasPorChave.set(chave, resposta);
    }
    const chaveRota = normalizar(resposta.rota);
    if (chaveRota && !respostasPorRota.has(chaveRota)) {
      respostasPorRota.set(chaveRota, resposta);
    }
    const nucleo = extrairNucleoRota(resposta.rota);
    if (nucleo && !respostasPorNucleo.has(nucleo)) {
      respostasPorNucleo.set(nucleo, resposta);
    }
  }

  const usadas = new Set<RespostaForm>();
  const rotas = atribuicoes.map((atribuicao) => {
    let resposta: RespostaForm | undefined;
    let matchAproximado = false;
    let matchPorId = false;

    const idDaRota = extrairIdRota(indice.idPorRota.get(normalizar(atribuicao.rota)));
    if (idDaRota) {
      const candidata = respostasPorId.get(idDaRota);
      if (
        candidata &&
        !usadas.has(candidata) &&
        nucleosCompativeis(atribuicao.rota, candidata.rota)
      ) {
        resposta = candidata;
        matchPorId = true;
      }
    }

    if (!resposta) {
      const porRelatorio = respostasPorRotaRelatorio.get(
        normalizar(atribuicao.rota)
      );
      if (porRelatorio && !usadas.has(porRelatorio)) {
        resposta = porRelatorio;
        matchPorId = true;
      }
    }

    if (!resposta) {
      const chave = `${normalizar(atribuicao.placa)}|${normalizar(atribuicao.rota)}`;
      resposta =
        respostasPorChave.get(chave) ?? respostasPorRota.get(normalizar(atribuicao.rota));
    }

    if (!resposta) {
      const nucleo = extrairNucleoRota(atribuicao.rota);
      const respostaAproximada = nucleo ? respostasPorNucleo.get(nucleo) : undefined;
      if (respostaAproximada) {
        resposta = respostaAproximada;
        matchAproximado = true;
      }
    }

    if (resposta) {
      usadas.add(resposta);
    }
    return {
      ...atribuicao,
      status: resposta ? ("concluida" as const) : ("pendente" as const),
      resposta,
      matchAproximado,
      matchPorId,
    };
  });

  const rotaPorNome = new Map<string, RotaStatus>();
  for (const rota of rotas) rotaPorNome.set(normalizar(rota.rota), rota);

  let repescou = true;
  while (repescou) {
    repescou = false;
    for (const resposta of respostasDoDia) {
      if (usadas.has(resposta)) continue;

      const idDigitado = extrairIdRota(resposta.idRota);
      const rotaDoRelatorio = idDigitado
        ? indice.rotaPorId.get(idDigitado)
        : undefined;
      if (!rotaDoRelatorio) continue;

      const alvo = rotaPorNome.get(normalizar(rotaDoRelatorio));
      if (!alvo) continue;

      const podeTomar =
        !alvo.resposta || (alvo.matchAproximado === true && !alvo.matchPorId);
      if (!podeTomar) continue;

      const anterior = alvo.resposta;
      alvo.resposta = resposta;
      alvo.status = "concluida";
      alvo.matchPorId = true;
      alvo.matchAproximado = false;
      usadas.add(resposta);
      if (anterior) usadas.delete(anterior);
      repescou = true;
    }
  }

  const sobraram = respostasDoDia.filter((resposta) => !usadas.has(resposta));

  const rotaComResposta = new Map<string, RotaStatus>();
  for (const rota of rotas) {
    if (rota.resposta) rotaComResposta.set(normalizar(rota.rota), rota);
  }

  const orfas: RespostaForm[] = [];
  const repetidas: RespostaForm[] = [];
  for (const sobra of sobraram) {
    const id = extrairIdRota(sobra.idRota);
    const rotaDoId = id ? indice.rotaPorId.get(id) : undefined;

    const nomesPossiveis = [rotaDoId, sobra.rota].filter(Boolean) as string[];
    let coberta: RotaStatus | undefined;
    for (const nome of nomesPossiveis) {
      const achou = rotaComResposta.get(normalizar(nome));
      if (achou) {
        coberta = achou;
        break;
      }
    }
    if (!coberta) {
      const nucleo = extrairNucleoRota(sobra.rota);
      if (nucleo) {
        coberta = rotas.find(
          (r) => Boolean(r.resposta) && extrairNucleoRota(r.rota) === nucleo
        );
      }
    }
    if (coberta) {
      sobra.duplicataDe = coberta.rota;
      repetidas.push(sobra);
    } else {
      orfas.push(sobra);
    }
  }
  const respostasOrfas = orfas;
  const respostasRepetidas = repetidas;

  return { rotas, respostasOrfas, respostasRepetidas };
}

type LinhaRotaBQ = {
  data: string;
  rota: string;
  id: string;
  transportadora: string;

  paradas?: number;
  coletados?: number;
  estimados?: number;
  motivo?: string;
  atualizadoEm?: string;

  semEspaco?: number;
  naoPlanejadas?: number;

  paradasCedo?: number;
  paradasTarde?: number;
};

async function lerRotasBQ(aba: string): Promise<LinhaRotaBQ[]> {
  let cabecalho: string[][];
  try {
    cabecalho = await getRange(`'${aba}'!A1:AZ1`);
  } catch {
    return [];
  }
  const titulos = (cabecalho[0] ?? []).map((t) => normalizar(t));
  const achar = (nomes: string[]) => titulos.findIndex((t) => nomes.includes(t));

  const iIdParada = colunaIdParada(cabecalho[0] ?? []);

  const iData = achar(["DATA", "ROUTE_DATE", "DATADAROTA"]);
  const iRota = achar(["NOME_ROTA", "ROTA", "SHP_LG_CODE", "NOMEDAROTA"]);
  const iId = achar(["ID_ROTA", "IDROTA", "SHP_LG_ROUTE_ID", "IDDOROTA"]);
  const iMlp = achar(["TRANSPORTADORA", "CARRIER", "MLP"]);

  const iPar = achar(["PARADAS"]);
  const iCol = achar(["PACOTESCOLETADOS", "PACOTES_COLETADOS"]);
  const iEst = achar(["PACOTESESTIMADOS", "PACOTES_ESTIMADOS"]);
  const iMot = achar(["MOTIVO", "MOTIVOS"]);
  const iAtu = achar(["ATUALIZADOEM", "ATUALIZADO_EM"]);
  const iPlan = achar(["PLANEJADO"]);
  const iSemEsp = achar(["SEM_ESPACO"]);
  const iNaoPlan = achar(["NAO_PLANEJADAS"]);
  const iPont = achar(["PONTUALIDADE"]);
  const iCedo = achar(["PARADAS_CEDO"]);
  const iTarde = achar(["PARADAS_TARDE"]);
  if (iData < 0 || iRota < 0 || iId < 0) return [];
  const usados = [iData, iRota, iId, iMlp, iPar, iCol, iEst, iMot, iAtu, iPlan, iSemEsp, iNaoPlan, iPont, iCedo, iTarde].filter(
    (i) => i >= 0
  );
  const min = iIdParada >= 0 ? 0 : Math.min(...usados);
  const max = iIdParada >= 0 ? Math.max(...usados, titulos.length - 1) : Math.max(...usados);

  const letra = (i: number) =>
    i < 26
      ? String.fromCharCode(65 + i)
      : String.fromCharCode(64 + Math.floor(i / 26)) +
        String.fromCharCode(65 + (i % 26));
  let linhas: string[][];
  try {
    linhas = await getRange(`'${aba}'!${letra(min)}2:${letra(max)}`);
  } catch {
    return [];
  }
  const saida: LinhaRotaBQ[] = [];
  const txt = (linha: string[], i: number) =>
    i < 0 ? undefined : String(linha[i - min] ?? "").trim();
  const num = (linha: string[], i: number) => {
    const v = txt(linha, i);
    if (!v) return undefined;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isNaN(n) ? undefined : n;
  };
  for (const linha of linhas) {
    if (iIdParada >= 0 && ehLinhaDoCd(linha, iIdParada)) continue;
    const data = normalizarDataBR(linha[iData - min] ?? "");
    const rota = (linha[iRota - min] ?? "").trim();
    if (!data || !rota) continue;
    saida.push({
      data,
      rota,
      id: (linha[iId - min] ?? "").trim(),
      transportadora: iMlp >= 0 ? (linha[iMlp - min] ?? "").trim() : "",
      paradas: num(linha, iPar),
      coletados: num(linha, iCol),
      estimados: num(linha, iEst),
      motivo: txt(linha, iMot),
      atualizadoEm: txt(linha, iAtu),
      semEspaco: iSemEsp >= 0 ? num(linha, iSemEsp) : iMot >= 0 ? (ehSemEspaco(txt(linha, iMot)) ? 1 : 0) : undefined,
      naoPlanejadas:
        iNaoPlan >= 0 ? num(linha, iNaoPlan) : iPlan >= 0 ? (ehNaoProgramada(txt(linha, iPlan)) ? 1 : 0) : undefined,

      paradasCedo:
        iCedo >= 0
          ? num(linha, iCedo)
          : iPont >= 0
            ? classificarPontualidade(txt(linha, iPont) ?? "") === "early" && !ehSemEspaco(txt(linha, iMot))
              ? 1
              : 0
            : undefined,
      paradasTarde:
        iTarde >= 0 ? num(linha, iTarde) : iPont >= 0 ? (classificarPontualidade(txt(linha, iPont) ?? "") === "late" ? 1 : 0) : undefined,
    });
  }
  return saida;
}

type IndiceRotas = {
  idPorRota: Map<string, string>;
  rotaPorId: Map<string, string>;

  dataPorId: Map<string, string>;

  resumoPorRota: Map<string, ResumoRota>;

  atualizadoEm: string;
};

function montarIndice(
  dataBR: string,
  vivas: LinhaRotaBQ[][],
  historicas: LinhaRotaBQ[][],
): IndiceRotas {
  const montar = (linhas: LinhaRotaBQ[]): IndiceRotas => {
    const idPorRota = new Map<string, string>();
    const rotaPorId = new Map<string, string>();
    const dataPorId = new Map<string, string>();
    const resumoPorRota = new Map<string, ResumoRota>();
    let atualizadoEm = "";
    for (const l of linhas) {
      if (l.id && l.data) {
        const idQualquerDia = extrairIdRota(l.id);
        if (idQualquerDia && !dataPorId.has(idQualquerDia)) {
          dataPorId.set(idQualquerDia, l.data);
        }
      }
      if (l.data !== dataBR) continue;
      const chaveRota = normalizar(l.rota);
      if (!chaveRota) continue;
      if (l.id) {
        if (!idPorRota.has(chaveRota)) idPorRota.set(chaveRota, l.id);
        const id = extrairIdRota(l.id);
        if (id && !rotaPorId.has(id)) rotaPorId.set(id, l.rota);
      }
      if (l.atualizadoEm) atualizadoEm = l.atualizadoEm;

      const temResumo = l.coletados !== undefined || l.paradas !== undefined;
      if (temResumo) {
        const r = resumoPorRota.get(chaveRota) ?? {
          paradas: 0,
          coletados: 0,
          estimados: 0,
          motivos: [] as string[],
        };
        r.paradas += l.paradas ?? 1;
        r.coletados += l.coletados ?? 0;
        r.estimados += l.estimados ?? 0;
        if (l.motivo && r.motivos.indexOf(l.motivo) < 0) r.motivos.push(l.motivo);
        resumoPorRota.set(chaveRota, r);
      }
    }
    return { idPorRota, rotaPorId, dataPorId, resumoPorRota, atualizadoEm };
  };

  const indice: IndiceRotas = {
    idPorRota: new Map(),
    rotaPorId: new Map(),
    dataPorId: new Map(),
    resumoPorRota: new Map(),
    atualizadoEm: "",
  };
  const acumular = (linhas: LinhaRotaBQ[]) => {
    const parcial = montar(linhas);
    parcial.idPorRota.forEach((v, k) => {
      if (!indice.idPorRota.has(k)) indice.idPorRota.set(k, v);
    });
    parcial.rotaPorId.forEach((v, k) => {
      if (!indice.rotaPorId.has(k)) indice.rotaPorId.set(k, v);
    });
    parcial.dataPorId.forEach((v, k) => {
      if (!indice.dataPorId.has(k)) indice.dataPorId.set(k, v);
    });
    parcial.resumoPorRota.forEach((v, k) => {
      if (!indice.resumoPorRota.has(k)) indice.resumoPorRota.set(k, v);
    });
    if (!indice.atualizadoEm && parcial.atualizadoEm) {
      indice.atualizadoEm = parcial.atualizadoEm;
    }
  };

  for (const linhas of vivas) acumular(linhas);

  if (indice.idPorRota.size === 0 || indice.resumoPorRota.size === 0) {
    for (const linhas of historicas) acumular(linhas);
  }
  return indice;
}

export type FontesIndice = {
  vivas: LinhaRotaBQ[][];
  historicas: LinhaRotaBQ[][];
};

export async function lerFontesIndice(): Promise<FontesIndice> {
  const [coletas, bq, coletasHist, bqHist] = await Promise.all([
    lerRotasBQ(ABA_COLETAS),
    lerRotasBQ(ABA_ROTAS_BQ),
    lerRotasBQ(ABA_COLETAS_HIST),
    lerRotasBQ(ABA_ROTAS_BQ_HIST),
  ]);
  return { vivas: [coletas, bq], historicas: [coletasHist, bqHist] };
}

export function indiceDoDia(dataBR: string, fontes: FontesIndice): IndiceRotas {
  return montarIndice(dataBR, fontes.vivas, fontes.historicas);
}

async function getIndiceRotas(dataBR: string): Promise<IndiceRotas> {
  const vivas = await Promise.all([lerRotasBQ(ABA_COLETAS), lerRotasBQ(ABA_ROTAS_BQ)]);
  const soVivas = montarIndice(dataBR, vivas, []);
  if (soVivas.idPorRota.size > 0 && soVivas.resumoPorRota.size > 0) {
    return soVivas;
  }
  const historicas = await Promise.all([lerRotasBQ(ABA_COLETAS_HIST), lerRotasBQ(ABA_ROTAS_BQ_HIST)]);
  return montarIndice(dataBR, vivas, historicas);
}

function aplicarIds(
  rotas: RotaStatus[],
  orfas: RespostaForm[],
  indice: IndiceRotas
): void {
  for (const rota of rotas) {
    rota.idRota = indice.idPorRota.get(normalizar(rota.rota)) ?? rota.resposta?.idRota;
  }
  for (const orfa of orfas) {
    const idDigitado = extrairIdRota(orfa.idRota);
    const rotaDoId = idDigitado ? indice.rotaPorId.get(idDigitado) : undefined;
    if (idDigitado && rotaDoId) {
      orfa.idRota = idDigitado;
      orfa.rotaNoRelatorio = rotaDoId;
      continue;
    }

    const porNome = indice.idPorRota.get(normalizar(orfa.rota));
    if (porNome) {
      orfa.idRota = porNome;
      orfa.rotaNoRelatorio = orfa.rota;
      continue;
    }
  }
}

function aplicarNs(rotas: RotaStatus[], indice: IndiceRotas, ehHoje: boolean): void {
  const temBaseDeColeta = indice.resumoPorRota.size > 0;
  const libera =
    temBaseDeColeta && podeInferirAusencia(ehHoje, indice.atualizadoEm);
  for (const rota of rotas) {
    const resumo = indice.resumoPorRota.get(normalizar(rota.rota));
    const ns = avaliarNs(resumo, libera);
    if (ns) {
      rota.ns = ns;
    } else if (resumo && resumo.coletados === 0) {
      rota.coletouZero = true;
    }
  }
}

export async function getRotasDoDia(
  dataExecucao: string,
  ehHoje: boolean,
  prontos?: {
    atribuicoes?: RotaAtribuida[];
    respostas?: RespostaForm[];
    indice?: IndiceRotas;
  }
): Promise<RotasDoDia> {
  const [atribuicoes, respostas, indice] = await Promise.all([
    prontos?.atribuicoes ??
      (ehHoje ? getAtribuicaoDoDia() : getAtribuicaoHistorica(dataExecucao)),
    prontos?.respostas ?? getRespostasForm(),
    prontos?.indice ?? getIndiceRotas(dataExecucao),
  ]);

  const diaDaResposta = (r: RespostaForm): string => {
    const id = extrairIdRota(r.idRota);
    const doRelatorio = id ? indice.dataPorId.get(id) : undefined;
    return doRelatorio || r.dataExecucao;
  };
  const respostasDoDia = respostas.filter(
    (r) => diaDaResposta(r) === dataExecucao
  );

  if (atribuicoes.length === 0) {
    const respostasPorChave = new Map<string, RespostaForm>();
    for (const resposta of respostasDoDia) {
      const chave = `${normalizar(resposta.placa)}|${normalizar(resposta.rota)}`;
      if (!respostasPorChave.has(chave)) {
        respostasPorChave.set(chave, resposta);
      }
    }
    const rotas = Array.from(respostasPorChave.values()).map((resposta) => ({
      rota: resposta.rota,
      start: "",
      transportadora: resposta.transportadora,
      placa: resposta.placa,
      status: "concluida" as const,
      resposta,
    }));
    aplicarIds(rotas, [], indice);
    return {
      rotas,
      comparavel: false,
      respostasOrfas: [],
      respostasRepetidas: [],
    };
  }

  const { rotas, respostasOrfas, respostasRepetidas } = cruzarComAtribuicao(
    atribuicoes,
    respostasDoDia,
    indice
  );
  aplicarIds(rotas, respostasOrfas, indice);
  aplicarNs(rotas, indice, ehHoje);

  return {
    rotas: somenteCampinas(rotas),
    comparavel: true,
    respostasOrfas,
    respostasRepetidas,
  };
}

export const MAX_DIAS_PERIODO = 31;

export type RotasDoPeriodo = RotasDoDia & {
  diasSemAtribuicao: string[];
};

export async function getRotasDoPeriodo(
  inicioBR: string,
  fimBR: string,
  hojeBR: string,
): Promise<RotasDoPeriodo> {
  const dias = diasDoPeriodo(inicioBR, fimBR, MAX_DIAS_PERIODO);
  const temHoje = dias.includes(hojeBR);
  const [porDia, respostas, fontes, deHoje] = await Promise.all([
    getAtribuicaoHistoricaPorDia(),
    getRespostasForm(),
    lerFontesIndice(),
    temHoje ? getAtribuicaoDoDia() : Promise.resolve([] as RotaAtribuida[]),
  ]);

  const saida: RotasDoPeriodo = {
    rotas: [],
    comparavel: true,
    respostasOrfas: [],
    respostasRepetidas: [],
    diasSemAtribuicao: [],
  };
  for (const dia of dias) {
    const ehHoje = dia === hojeBR;

    const atribuicoes = ehHoje ? deHoje : (porDia.get(dia) ?? []);
    const doDia = await getRotasDoDia(dia, ehHoje, {
      atribuicoes,
      respostas,
      indice: indiceDoDia(dia, fontes),
    });
    if (!doDia.comparavel) {
      if (doDia.rotas.length === 0) continue;
      saida.comparavel = false;
      saida.diasSemAtribuicao.push(dia);
    }
    for (const r of doDia.rotas) saida.rotas.push({ ...r, data: dia });
    saida.respostasOrfas.push(...doDia.respostasOrfas);
    saida.respostasRepetidas.push(...doDia.respostasRepetidas);
  }
  return saida;
}

const CAB_HISTORICO = [
  "DATA",
  "ROTA",
  "START",
  "TRANSPORTADORA",
  "PLACA",
  "HUB",
  "MOTORISTA",
  "STATUS_MOTORISTA",
  "TIPO_ROTA",
  "PERFIL",
  "VEICULO",
];

async function garantirCabecalhoHistorico(): Promise<void> {
  const sheets = getSheetsClient();
  const atual = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_HISTORICO}!A1:K1`,
  });
  const linha = (atual.data.values?.[0] ?? []) as string[];

  let faltando = false;
  for (let i = 0; i < CAB_HISTORICO.length; i++) {
    if (!String(linha[i] ?? "").trim()) faltando = true;
  }
  if (!faltando) return;

  const completo = CAB_HISTORICO.map(
    (nome, i) => String(linha[i] ?? "").trim() || nome,
  );
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_HISTORICO}!A1:K1`,
    valueInputOption: "RAW",
    requestBody: { values: [completo] },
  });
}

async function garantirAbaHistorico(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = meta.data.sheets?.some(
    (s) => s.properties?.title === ABA_HISTORICO
  );
  if (existe) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: ABA_HISTORICO } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_HISTORICO}!A1:K1`,
    valueInputOption: "RAW",
    requestBody: { values: [CAB_HISTORICO] },
  });
}

async function completarSnapshotDoDia(dataBR: string): Promise<{ atualizadas: number; novas: number }> {
  const vivas = await getAtribuicaoDoDia(dataBR);
  if (vivas.length === 0) return { atualizadas: 0, novas: 0 };
  const linhas = await getRange(`${ABA_HISTORICO}!A2:K`);
  if (!linhas.some((l) => String(l[0] ?? "").trim() === dataBR)) return { atualizadas: 0, novas: 0 };

  const { atualizacoes, novas } = completarSnapshot(linhas, vivas, dataBR);
  const sheets = getSheetsClient();
  if (atualizacoes.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",

        data: atualizacoes.map((a) => ({
          range: `${ABA_HISTORICO}!A${a.indice + 2}:K${a.indice + 2}`,
          values: [a.valores],
        })),
      },
    });
  }
  if (novas.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ABA_HISTORICO}!A:K`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: novas },
    });
  }
  return { atualizadas: atualizacoes.length, novas: novas.length };
}

export async function registrarSnapshotDoDia(): Promise<{
  criado: boolean;
  linhas: number;
  dataBR: string;

  completado?: { atualizadas: number; novas: number };

  ontem?: { dataBR: string; atualizadas: number; novas: number };
}> {
  await garantirAbaHistorico();
  await garantirCabecalhoHistorico();

  const ontemBR = formatarDataBR(new Date(Date.now() - 86400000));
  const ontem = { dataBR: ontemBR, ...(await completarSnapshotDoDia(ontemBR)) };

  const dataBR = formatarDataBR(new Date());
  const jaExiste = await getAtribuicaoHistorica(dataBR);
  if (jaExiste.length > 0) {
    const completado = await completarSnapshotDoDia(dataBR);
    return { criado: false, linhas: jaExiste.length, dataBR, completado, ontem };
  }

  const atribuicoes = await getAtribuicaoDoDia();
  if (atribuicoes.length === 0) {
    return { criado: false, linhas: 0, dataBR, ontem };
  }

  const sheets = getSheetsClient();
  const valores = atribuicoes.map((a) => linhaDoHistorico(dataBR, a));
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_HISTORICO}!A:K`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: valores },
  });

  return { criado: true, linhas: valores.length, dataBR, ontem };
}

async function garantirAbaHistoricoRotas(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = meta.data.sheets?.some(
    (s) => s.properties?.title === ABA_ROTAS_BQ_HIST
  );
  if (existe) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ addSheet: { properties: { title: ABA_ROTAS_BQ_HIST } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${ABA_ROTAS_BQ_HIST}'!A1:D1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["DATA", "NOME_ROTA", "ID_ROTA", "TRANSPORTADORA"]],
    },
  });
}

export async function registrarSnapshotRotasBQ(): Promise<{
  datas: string[];
  linhas: number;
}> {
  await garantirAbaHistoricoRotas();
  const atuais = await lerRotasBQ(ABA_ROTAS_BQ);
  if (atuais.length === 0) return { datas: [], linhas: 0 };
  const hoje = formatarDataBR(new Date());
  const jaSalvas = new Set(
    (await lerRotasBQ(ABA_ROTAS_BQ_HIST)).map((l) => l.data)
  );
  const novas = atuais.filter(
    (l) => l.data !== hoje && l.id && !jaSalvas.has(l.data)
  );
  if (novas.length === 0) return { datas: [], linhas: 0 };
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${ABA_ROTAS_BQ_HIST}'!A:D`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: novas.map((l) => [l.data, l.rota, l.id, l.transportadora]),
    },
  });
  return {
    datas: [...new Set(novas.map((l) => l.data))].sort(),
    linhas: novas.length,
  };
}

const CAB_HIST_COLETAS = [
  "DATA",
  "NOME_ROTA",
  "ID_ROTA",
  "TRANSPORTADORA",
  "PARADAS",
  "PACOTES_COLETADOS",
  "PACOTES_ESTIMADOS",
  "MOTIVOS",
  "ATUALIZADO_EM",

  "SEM_ESPACO",
  "NAO_PLANEJADAS",
  "PARADAS_CEDO",
  "PARADAS_TARDE",
];

async function garantirAbaHistoricoColetas(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = meta.data.sheets?.some(
    (s) => s.properties?.title === ABA_COLETAS_HIST
  );
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ABA_COLETAS_HIST } } }],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${ABA_COLETAS_HIST}'!A1:M1`,
    valueInputOption: "RAW",
    requestBody: { values: [CAB_HIST_COLETAS] },
  });
}

export async function registrarSnapshotColetas(): Promise<{
  datas: string[];
  linhas: number;
}> {
  await garantirAbaHistoricoColetas();

  const doDia = await lerRotasBQ(ABA_COLETAS);
  if (doDia.length === 0) return { datas: [], linhas: 0 };

  type Acumulado = {
    data: string;
    rota: string;
    id: string;
    transportadora: string;
    paradas: number;
    coletados: number;
    estimados: number;
    motivos: string[];
    semEspaco: number;
    naoPlanejadas: number;
    paradasCedo: number;
    paradasTarde: number;
  };

  const porRota = new Map<string, Acumulado>();
  for (const l of doDia) {
    if (!l.data || !l.rota) continue;
    const chave = `${l.data}|${normalizar(l.rota)}`;
    const atual: Acumulado = porRota.get(chave) ?? {
      data: l.data,
      rota: l.rota,
      id: "",
      transportadora: "",
      paradas: 0,
      coletados: 0,
      estimados: 0,
      motivos: [],
      semEspaco: 0,
      naoPlanejadas: 0,
      paradasCedo: 0,
      paradasTarde: 0,
    };
    atual.paradas += l.paradas ?? 1;
    atual.semEspaco += l.semEspaco ?? 0;
    atual.naoPlanejadas += l.naoPlanejadas ?? 0;
    atual.paradasCedo += l.paradasCedo ?? 0;
    atual.paradasTarde += l.paradasTarde ?? 0;
    atual.coletados += l.coletados ?? 0;
    atual.estimados += l.estimados ?? 0;
    if (!atual.id && l.id) atual.id = l.id;
    if (!atual.transportadora && l.transportadora) {
      atual.transportadora = l.transportadora;
    }
    if (l.motivo && !atual.motivos.includes(l.motivo)) {
      atual.motivos.push(l.motivo);
    }
    porRota.set(chave, atual);
  }

  const datas = [...new Set([...porRota.values()].map((a) => a.data))];
  const agora = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const anteriores = await lerRotasBQ(ABA_COLETAS_HIST);
  const preservadas = anteriores
    .filter((l) => !datas.includes(l.data))
    .map((l) => [
      l.data,
      l.rota,
      l.id ?? "",
      l.transportadora ?? "",
      l.paradas ?? "",
      l.coletados ?? "",
      l.estimados ?? "",
      l.motivo ?? "",
      l.atualizadoEm ?? "",
      l.semEspaco ?? "",
      l.naoPlanejadas ?? "",
      l.paradasCedo ?? "",
      l.paradasTarde ?? "",
    ]);

  const novas = [...porRota.values()].map((a) => [
    a.data,
    a.rota,
    a.id,
    a.transportadora,
    a.paradas,
    a.coletados,
    a.estimados,
    a.motivos.join(", "),
    agora,
    a.semEspaco,
    a.naoPlanejadas,
    a.paradasCedo,
    a.paradasTarde,
  ]);

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${ABA_COLETAS_HIST}'!A2:M`,
  });

  const corpo = [...preservadas, ...novas];
  if (corpo.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${ABA_COLETAS_HIST}'!A2`,
      valueInputOption: "RAW",
      requestBody: { values: corpo },
    });
  }

  return { datas, linhas: novas.length };
}

export async function getHistoricoColetasDoDia(dataBR: string): Promise<LinhaRotaBQ[]> {
  return (await lerRotasBQ(ABA_COLETAS_HIST)).filter((l) => l.data === dataBR);
}

export async function getParadasDoDia(
  dataBR: string
): Promise<ParadaColeta[]> {
  let cabecalho: string[][];
  try {
    cabecalho = await getRange(`'${ABA_COLETAS}'!A1:AZ1`);
  } catch {
    return [];
  }
  const titulos = (cabecalho[0] ?? []).map((t) => normalizar(t));
  const achar = (nomes: string[]) => titulos.findIndex((t) => nomes.includes(t));
  const iData = achar(["DATADAROTA", "DATA"]);
  const iRota = achar(["NOMEDAROTA", "NOME_ROTA", "ROTA"]);
  const iMot = achar(["IDDOMOTORISTA", "ID_MOTORISTA"]);
  const iParada = achar(["IDDEPARADA", "ID_PARADA"]);
  const iPont = achar(["PONTUALIDADE"]);
  const iEst = achar(["PACOTESESTIMADOS"]);
  const iCol = achar(["PACOTESCOLETADOS"]);
  const iPlan = achar(["PLANEJADO"]);
  const iPrep = achar(["PACOTESPREPARADOS", "PACOTES_PREPARADOS"]);
  const iTransp = achar(["TRANSPORTADORA", "CARRIER"]);
  const iMotivo = achar(["MOTIVO", "MOTIVOS"]);
  const iIdParada = colunaIdParada(cabecalho[0] ?? []);
  if (iData < 0 || iRota < 0) return [];

  let linhas: string[][];
  try {
    linhas = await getRange(`'${ABA_COLETAS}'!A2:AZ`);
  } catch {
    return [];
  }
  const txt = (l: string[], i: number) =>
    i < 0 ? "" : String(l[i] ?? "").trim();
  const num = (l: string[], i: number) => {
    if (i < 0) return 0;
    const v = String(l[i] ?? "").trim();
    if (!v) return 0;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isNaN(n) ? 0 : n;
  };
  const iId = achar(["IDDOROTA", "ID_ROTA", "IDROTA"]);
  const saida: ParadaColeta[] = [];
  for (const l of linhas) {
    if (ehLinhaDoCd(l, iIdParada)) continue;

    const nome = txt(l, iRota);
    const idRota = txt(l, iId);
    const rota = nome || idRota;
    if (!rota) continue;
    if (normalizarDataBR(txt(l, iData)) !== dataBR) continue;
    saida.push({
      rota,
      rotaSemNome: !nome,
      motorista: txt(l, iMot),
      parada: txt(l, iParada),
      pontualidade: txt(l, iPont),
      transportadora: txt(l, iTransp),
      estimados: num(l, iEst),
      coletados: num(l, iCol),
      preparados: num(l, iPrep),
      planejado: txt(l, iPlan),
      motivo: txt(l, iMotivo),
      rotaId: idRota,
    });
  }
  return saida;
}

export type LinhaMonitoramento = {
  estimados: number;
  coletados: number;
  rotasAvulsas: number;
  rotasPlanejadas: number;
  paradasTotal: number;
  atualizadoEm: string;
};

export async function getMonitoramentoDoDia(
  dataBR: string
): Promise<LinhaMonitoramento | null> {
  let linhas: string[][];
  try {
    linhas = await getRange(`'${ABA_MONITORAMENTO}'!A1:Z`);
  } catch {
    return null;
  }
  if (linhas.length < 2) return null;
  const titulos = (linhas[0] ?? []).map((t) => normalizar(t));
  const achar = (nomes: string[]) => titulos.findIndex((t) => nomes.includes(t));
  const iData = achar(["DATA"]);
  if (iData < 0) return null;
  const alvo = linhas.slice(1).find(
    (l) => normalizarDataBR(String(l[iData] ?? "").trim()) === dataBR
  );
  if (!alvo) return null;

  const num = (nomes: string[]) => {
    const i = achar(nomes);
    if (i < 0) return 0;
    const v = String(alvo[i] ?? "").trim();
    if (!v) return 0;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isNaN(n) ? 0 : n;
  };
  const iAtu = achar(["ATUALIZADOEM", "ATUALIZADO_EM"]);
  return {
    estimados: num(["ESTIMADOS"]),
    coletados: num(["COLETADOS"]),
    rotasAvulsas: num(["ROTASAVULSAS", "ROTAS_AVULSAS"]),
    rotasPlanejadas: num(["ROTASPLANEJADAS", "ROTAS_PLANEJADAS"]),
    paradasTotal: num(["PARADASTOTAL", "PARADAS_TOTAL"]),
    atualizadoEm: iAtu >= 0 ? String(alvo[iAtu] ?? "").trim() : "",
  };
}

export type LinhaNoc = {
  forecast: number | null;
  backlog: number | null;
  atualizadoEm: string;
};

export async function getNocDoDia(dataBR: string): Promise<LinhaNoc | null> {
  let linhas: string[][];
  try {
    linhas = await getRange(`'NOC'!A1:Z`);
  } catch {
    return null;
  }
  if (linhas.length < 2) return null;
  const titulos = (linhas[0] ?? []).map((t) => normalizar(t));
  const achar = (nomes: string[]) => titulos.findIndex((t) => nomes.includes(t));
  const iData = achar(["DATA"]);
  if (iData < 0) return null;

  const alvo = linhas
    .slice(1)
    .filter((l) => normalizarDataBR(String(l[iData] ?? "").trim()) === dataBR)
    .pop();
  if (!alvo) return null;
  const num = (nomes: string[]) => {
    const i = achar(nomes);
    const v = i < 0 ? "" : String(alvo[i] ?? "").trim();
    if (!v) return null;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const iAtu = achar(["ATUALIZADOEM", "ATUALIZADO_EM"]);
  return {
    forecast: num(["FORECAST_DIA", "FORECASTDIA"]),
    backlog: num(["ETIQUETA_IMPRESSA", "ETIQUETAIMPRESSA"]),
    atualizadoEm: iAtu >= 0 ? String(alvo[iAtu] ?? "").trim() : "",
  };
}

const ABA_CONFIG = "CONFIG_ROTAS";

export async function getRotasConfigDoDia(
  dataBR: string
): Promise<number | null> {
  let linhas: string[][];
  try {
    linhas = await getRange(`'${ABA_CONFIG}'!A1:Z`);
  } catch {
    return null;
  }
  if (linhas.length < 2) return null;
  const titulos = (linhas[0] ?? []).map((t) => normalizar(t));
  const iData = titulos.findIndex((t) => ["VIGENCIA", "DATA"].includes(t));
  const iQtd = titulos.findIndex((t) =>
    ["ROTASCONFIG", "ROTAS_CONFIG", "ROTAS"].includes(t)
  );
  if (iData < 0 || iQtd < 0) return null;

  const paraBR = (v: string) => {
    const bruto = String(v ?? "").trim();
    const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    return normalizarDataBR(bruto);
  };

  for (const l of linhas.slice(1)) {
    if (paraBR(String(l[iData] ?? "")) !== dataBR) continue;
    const bruto = String(l[iQtd] ?? "").trim();
    if (!bruto) return null;
    const n = Number(bruto.replace(/\./g, "").replace(",", "."));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

const ABA_HISTORICO_FECHAMENTO = "HISTORICO_FECHAMENTO";

async function garantirAbaFechamento(cabecalho: string[], aba: string): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existe = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === aba
  );
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: aba } } },
        ],
      },
    });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${aba}'!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [cabecalho] },
  });
}

export async function gravarFechamentoNoHistorico(
  cabecalho: string[],
  linha: (string | number)[],
  aba: string = ABA_HISTORICO_FECHAMENTO
): Promise<{ dataBR: string; linhaGravada: number }> {
  await garantirAbaFechamento(cabecalho, aba);
  const sheets = getSheetsClient();
  const dataBR = String(linha[0]);

  const atuais = await getRange(`'${aba}'!A2:A`);
  let alvo = atuais.length + 2;
  for (let i = 0; i < atuais.length; i++) {
    if (normalizarDataBR(String(atuais[i]?.[0] ?? "").trim()) === dataBR) {
      alvo = i + 2;
      break;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${aba}'!A${alvo}`,
    valueInputOption: "RAW",
    requestBody: { values: [linha] },
  });
  return { dataBR, linhaGravada: alvo };
}

export async function getFechamentoHistorico(
  dataBR: string
): Promise<Record<string, string> | null> {
  let linhas: string[][];
  try {
    linhas = await getRange(`'${ABA_HISTORICO_FECHAMENTO}'!A1:Z`);
  } catch {
    return null;
  }
  if (linhas.length < 2) return null;
  const titulos = (linhas[0] ?? []).map((t) => normalizar(t));
  const iData = titulos.indexOf("DATA");
  if (iData < 0) return null;
  const alvo = linhas
    .slice(1)
    .find((l) => normalizarDataBR(String(l[iData] ?? "").trim()) === dataBR);
  if (!alvo) return null;
  const saida: Record<string, string> = {};
  titulos.forEach((t, i) => {
    if (t) saida[t] = String(alvo[i] ?? "").trim();
  });
  return saida;
}
