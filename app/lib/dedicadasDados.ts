import {
  atualizarCadastro,
  dedicadasDoDia,
  lerCadastroDedicadas,
  lerBaseDedicadas,
  lerHistDedicadas,
  lerNomesDedicadas,
  rotasDedUnicas,
  apelidoDa,
  CAB_NOMES_DEDICADAS,
  linhasCadastroDedicadas,
  linhasHistDedicadas,
  CAB_DEDICADAS_HIST,
  type DiaDedicada,
  type DiaHistorico,
  type LinhaBaseDedicada,
  type RotaDedHoje,
} from "./dedicadas";
import { temForms } from "./monitorD0";
import { lerFormsDoDia, lerMonitorD0 } from "./monitorD0Dados";
import { getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { comCota, PROCESSO_ID } from "./upgradeDados";

const ABA_CADASTRO = "DEDICADAS";
const ABA_HIST = "DEDICADAS_HIST";

const ABA_NOMES = "DEDICADAS_NOMES";

const DIAS_HIST = 120;
const VALIDADE_MS = 5 * 60_000;

const ABA_BASE = "HIST_DEDICADAS_30D";
const VALIDADE_BASE_MS = 30 * 60_000;

const comoTexto = (v: unknown[][] | null | undefined) =>
  ((v ?? []) as unknown[][]).map((l) => (l ?? []).map((x) => String(x ?? "")));

let cache: { quando: number; cadastro: string[][]; hist: string[][]; nomes: string[][] } | null = null;
let cacheBase: { quando: number; linhas: string[][] } | null = null;

async function lerBase(): Promise<string[][]> {
  if (cacheBase && Date.now() - cacheBase.quando < VALIDADE_BASE_MS) return cacheBase.linhas;
  try {
    const r = await comCota(() =>
      getSheetsClient().spreadsheets.values.get({ spreadsheetId: PROCESSO_ID, range: ABA_BASE + "!A:E" }),
    );
    cacheBase = { quando: Date.now(), linhas: comoTexto(r.data.values) };
  } catch {
    if (!cacheBase) cacheBase = { quando: Date.now(), linhas: [] };
  }
  return cacheBase.linhas;
}

async function lerAbas(forcar = false): Promise<{ cadastro: string[][]; hist: string[][]; nomes: string[][] }> {
  if (!forcar && cache && Date.now() - cache.quando < VALIDADE_MS) return cache;
  const ler = async (range: string) => {
    try {
      const r = await comCota(() => getSheetsClient().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range }));
      return comoTexto(r.data.values);
    } catch (e) {
      if (/unable to parse range/i.test(String((e as Error).message))) return [];
      throw e;
    }
  };
  const [cadastro, hist, nomes] = await Promise.all([ler(ABA_CADASTRO + "!A:G"), ler(ABA_HIST + "!A:P"), ler(ABA_NOMES + "!A:E")]);
  cache = { quando: Date.now(), cadastro, hist, nomes };
  return cache;
}

export type LeituraDedicadas = {
  dias: DiaDedicada[];
  historico: Record<string, DiaHistorico[]>;

  base: LinhaBaseDedicada[];

  rotasDed: RotaDedHoje[];
  erro: string | null;
  lidoEm: string;
};

export async function lerDedicadas(dataBR: string, agoraMin: number): Promise<LeituraDedicadas> {
  const [m, abas, baseBruta, forms] = await Promise.all([
    lerMonitorD0(dataBR),
    lerAbas().catch(() => ({ cadastro: [], hist: [], nomes: [] })),
    lerBase(),
    lerFormsDoDia(dataBR),
  ]);
  const respondidas = new Set(forms.respondidas);

  const cadastro = atualizarCadastro(lerCadastroDedicadas(abas.cadastro), m.visitas, m.plano, dataBR);
  const nomes = lerNomesDedicadas(abas.nomes);

  const dias = dedicadasDoDia(cadastro, m.visitas, m.plano, m.historico, agoraMin, dataBR).map((d) => ({
    ...d,
    apelido: apelidoDa(d, nomes),
    formsFeito: d.rotas.some((r) => r.ehDedicada && !r.soNoPlano && temForms(respondidas, r.rota, r.rotaId)),
  }));
  const historico = Object.fromEntries(lerHistDedicadas(abas.hist));
  return {
    dias,
    historico,
    base: lerBaseDedicadas(baseBruta),
    rotasDed: rotasDedUnicas(m.visitas, m.plano),
    erro: m.erro,
    lidoEm: m.lidoEm,
  };
}

async function garantirAba(aba: string): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await comCota(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets.properties.title" }));
  if ((meta.data.sheets ?? []).some((s) => s.properties?.title === aba)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: aba } } }] },
  });
}

async function regravar(aba: string, linhas: (string | number)[][]): Promise<void> {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: aba });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: aba + "!A1",
    valueInputOption: "RAW",
    requestBody: { values: linhas },
  });
}

const iso = (br: string) => br.split("/").reverse().join("-");

export async function gravarDedicadasDoDia(
  dataBR: string,
  agoraMin: number,
  gravadoEm: string,
): Promise<{ dedicadas: number; linhas: number }> {
  const [m, abas] = await Promise.all([lerMonitorD0(dataBR), lerAbas(true)]);
  if (m.erro) throw new Error("Relatorio de coleta indisponivel: " + m.erro);
  const cadastro = atualizarCadastro(lerCadastroDedicadas(abas.cadastro), m.visitas, m.plano, dataBR);
  const novas = linhasHistDedicadas(dedicadasDoDia(cadastro, m.visitas, m.plano, m.historico, agoraMin, dataBR), dataBR, gravadoEm);

  const corte = new Date(Date.now() - DIAS_HIST * 86_400_000).toISOString().slice(0, 10);
  const antigas = abas.hist.slice(1).filter((l) => {
    const d = String(l[0] ?? "").trim();
    return d && d !== dataBR && iso(d) >= corte;
  });

  await Promise.all([garantirAba(ABA_CADASTRO), garantirAba(ABA_HIST)]);
  await regravar(ABA_CADASTRO, linhasCadastroDedicadas(cadastro));
  await regravar(ABA_HIST, [CAB_DEDICADAS_HIST, ...antigas, ...novas]);
  cache = null;
  return { dedicadas: cadastro.length, linhas: novas.length };
}

let filaNomes: Promise<unknown> = Promise.resolve();

export function gravarNomeDedicada(chave: string, ids: string[], apelido: string, autor: string): Promise<void> {
  const vez = filaNomes.then(async () => {
    await garantirAba(ABA_NOMES);
    const sheets = getSheetsClient();
    const atual = comoTexto(
      (await comCota(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: ABA_NOMES + "!A:A" }))).data.values,
    );
    const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date());
    const linha = [chave, ids.join(" "), apelido, autor, quando];
    if (!atual.length || String(atual[0]?.[0] ?? "").toUpperCase() !== "CHAVE") {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: ABA_NOMES + "!A1",
        valueInputOption: "RAW",
        requestBody: { values: [CAB_NOMES_DEDICADAS] },
      });
    }
    const idx = atual.findIndex((l, i) => i > 0 && String(l[0] ?? "").trim() === chave);
    if (idx > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${ABA_NOMES}!A${idx + 1}:E${idx + 1}`,
        valueInputOption: "RAW",
        requestBody: { values: [linha] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: ABA_NOMES + "!A:E",
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [linha] },
      });
    }
    cache = null;
  });
  filaNomes = vez.catch(() => null);
  return vez;
}
