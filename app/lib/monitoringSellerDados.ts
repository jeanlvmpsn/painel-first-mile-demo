import { getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { lerMonitoring, type LinhaMonitoring } from "./monitoringSeller";

const ABA = "MONITORING_SELLER";

export async function getMonitoringSeller(): Promise<LinhaMonitoring[]> {
  try {
    const sheets = getSheetsClient();
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: ABA + "!A:Z",
    });
    return lerMonitoring((r.data.values ?? []) as string[][]);
  } catch {
    return [];
  }
}
