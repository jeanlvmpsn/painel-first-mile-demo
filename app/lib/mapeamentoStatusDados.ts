import { CAB_STATUS_MAPA, lerStatusMapa, linhaStatusMapa, type MarcaMapa, type StatusMapa } from "./mapeamentoStatus";
import { getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { comCota } from "./upgradeDados";

const ABA = "MAPEAMENTO_STATUS";
const FAIXA = ABA + "!A:E";

let abaOk = false;
async function garantirAba(): Promise<void> {
  if (abaOk) return;
  const sheets = getSheetsClient();
  const meta = await comCota(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
  if (!meta.data.sheets?.some((s) => s.properties?.title === ABA)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: ABA } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: ABA + "!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...CAB_STATUS_MAPA]] },
    });
  }
  abaOk = true;
}

async function lerLinhas(): Promise<string[][]> {
  try {
    const r = await comCota(() => getSheetsClient().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: FAIXA }));
    return (r.data.values ?? []).map((l) => (l ?? []).map((c) => String(c ?? "")));
  } catch (e) {
    if (/Unable to parse range/i.test((e as Error).message)) return [];
    throw e;
  }
}

const agoraSP = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" })
    .format(new Date())
    .replace(",", "");

export async function lerStatusDoMapa(dataBR: string): Promise<Record<string, MarcaMapa>> {
  return lerStatusMapa(await lerLinhas(), dataBR);
}

export async function gravarStatusDoMapa(
  dataBR: string,
  idParada: string,
  status: StatusMapa | null,
  autor: string,
): Promise<Record<string, MarcaMapa>> {
  await garantirAba();
  await comCota(() =>
    getSheetsClient().spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: FAIXA,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [linhaStatusMapa(dataBR, idParada, status, autor, agoraSP())] },
    }),
  );
  return lerStatusDoMapa(dataBR);
}
