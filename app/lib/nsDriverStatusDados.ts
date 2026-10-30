import { CAB_STATUS_NS, lerStatusNs, linhaStatusNs, type MarcaNs, type StatusNs } from "./nsDriverStatus";
import { getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { comCota } from "./upgradeDados";

const ABA = "NS_DRIVER_STATUS";
const FAIXA = ABA + "!A:F";

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
      requestBody: { values: [[...CAB_STATUS_NS]] },
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

export async function lerStatusNsDoDia(dataBR: string): Promise<Record<string, MarcaNs>> {
  return lerStatusNs(await lerLinhas(), dataBR);
}

export async function gravarStatusNs(
  dataBR: string,
  rota: string,
  rotaId: string,
  status: StatusNs | null,
  autor: string,
): Promise<Record<string, MarcaNs>> {
  await garantirAba();
  await comCota(() =>
    getSheetsClient().spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: FAIXA,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [linhaStatusNs(dataBR, rota, rotaId, status, autor, agoraSP())] },
    }),
  );
  return lerStatusNsDoDia(dataBR);
}
