import {
  CAB_ACOES,
  categoriaValida,
  lerAcoes,
  linhaAcao,
  listaCausas,
  listaResponsaveis,
  responsavelValido,
  ultimaVersao,
  type AcaoPonto,
  type NovaAcao,
} from "./acoesPontos";
import { getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { comCota } from "./upgradeDados";

const ABA = "ACOES_PONTOS";
const FAIXA = ABA + "!A:N";

const comoTexto = (v: unknown[][] | null | undefined) => (v ?? []).map((l) => (l ?? []).map((c) => String(c ?? "")));

const ABA_CAUSAS = "ACOES_CAUSAS";
const FAIXA_CAUSAS = ABA_CAUSAS + "!A:C";

const ABA_RESPONSAVEIS = "ACOES_RESPONSAVEIS";
const FAIXA_RESPONSAVEIS = ABA_RESPONSAVEIS + "!A:C";

const colunaA1 = (i: number): string => (i >= 26 ? colunaA1(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

const abasOk = new Set<string>();
async function garantirAba(aba: string, cabecalho: readonly string[]): Promise<void> {
  if (abasOk.has(aba)) return;
  const sheets = getSheetsClient();
  const meta = await comCota(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
  if (!meta.data.sheets?.some((s) => s.properties?.title === aba)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: aba } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: aba + "!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...cabecalho]] },
    });
  } else {
    const r = await comCota(() => sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: aba + "!1:1" }));
    const atual = r.data.values?.[0] ?? [];
    if (atual.length > 0 && atual.length < cabecalho.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: aba + "!" + colunaA1(atual.length) + "1",
        valueInputOption: "RAW",
        requestBody: { values: [cabecalho.slice(atual.length)] },
      });
    }
  }
  abasOk.add(aba);
}

async function lerFaixa(faixa: string): Promise<string[][]> {
  try {
    const r = await comCota(() => getSheetsClient().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: faixa }));
    return comoTexto(r.data.values);
  } catch (e) {
    if (/Unable to parse range/i.test((e as Error).message)) return [];
    throw e;
  }
}
const lerLinhas = () => lerFaixa(FAIXA);

export async function lerAcoesPontos(): Promise<Record<string, AcaoPonto>> {
  return lerAcoes(await lerLinhas());
}

export async function lerCausas(): Promise<string[]> {
  return listaCausas((await lerFaixa(FAIXA_CAUSAS)).slice(1).map((l) => l[0] ?? ""));
}

export async function lerResponsaveis(): Promise<string[]> {
  return listaResponsaveis((await lerFaixa(FAIXA_RESPONSAVEIS)).slice(1).map((l) => l[0] ?? ""));
}

async function gravarOpcao(
  nome: string,
  autor: string,
  ler: () => Promise<string[]>,
  aba: string,
  faixa: string,
  coluna: string,
): Promise<string[]> {
  const atuais = await ler();
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!nome || atuais.some((c) => norm(c) === norm(nome))) return atuais;
  await garantirAba(aba, [coluna, "AUTOR", "CRIADO_EM"]);
  await comCota(() =>
    getSheetsClient().spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: faixa,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[nome, autor, agoraSP()]] },
    }),
  );
  return ler();
}

export function gravarCausa(causa: string, autor: string): Promise<string[]> {
  return gravarOpcao(categoriaValida(causa), autor, lerCausas, ABA_CAUSAS, FAIXA_CAUSAS, "CAUSA");
}

export function gravarResponsavel(time: string, autor: string): Promise<string[]> {
  return gravarOpcao(responsavelValido(time), autor, lerResponsaveis, ABA_RESPONSAVEIS, FAIXA_RESPONSAVEIS, "RESPONSAVEL");
}

const agoraSP = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" })
    .format(new Date())
    .replace(",", "");

let fila: Promise<unknown> = Promise.resolve();

export function gravarAcaoPonto(n: NovaAcao): Promise<Record<string, AcaoPonto>> {
  const vez = fila.then(async () => {
    await garantirAba(ABA, CAB_ACOES);
    const linhas = await lerLinhas();
    const versao = ultimaVersao(linhas, n.idParada) + 1;
    await comCota(() =>
      getSheetsClient().spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: FAIXA,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [linhaAcao(n, versao, agoraSP())] },
      }),
    );
    return lerAcoes(await lerLinhas());
  });
  fila = vez.catch(() => null);
  return vez;
}
