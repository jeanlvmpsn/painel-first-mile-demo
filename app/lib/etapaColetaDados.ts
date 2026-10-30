import { lerEtapasColeta, type EtapasColeta } from "./etapaColeta";
import { getSheetsClient, SPREADSHEET_ID } from "./sheets";

export async function getEtapasColeta(dataBR: string): Promise<EtapasColeta | null> {
  try {
    const r = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "ROTAS_SISTEMA!A:AD",
    });
    const linhas = ((r.data.values ?? []) as unknown[][]).map((l) => (l ?? []).map((x) => String(x ?? "")));
    const etapas = lerEtapasColeta(linhas, dataBR);
    return Object.keys(etapas).length ? etapas : null;
  } catch {
    return null;
  }
}
