import { CAB_FILA_PERFIL } from "./perfil";
import { getSheetsClient } from "./sheets";
import { PROCESSO_ID, comCota } from "./upgradeDados";

const ABA = "FILA_PERFIL";
let filaExiste = false;

async function garantirFila(): Promise<void> {
  if (filaExiste) return;
  const sheets = getSheetsClient();
  const meta = await comCota(() =>
    sheets.spreadsheets.get({ spreadsheetId: PROCESSO_ID, fields: "sheets.properties.title" }),
  );
  if (!(meta.data.sheets ?? []).some((s) => s.properties?.title === ABA)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: PROCESSO_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: ABA } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: PROCESSO_ID,
      range: ABA + "!A1",
      valueInputOption: "RAW",
      requestBody: { values: [CAB_FILA_PERFIL] },
    });
  }
  filaExiste = true;
}

export async function pedirPerfil(ids: string[], inicio: string, fim: string): Promise<string> {
  await garantirFila();
  const pedido = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await comCota(() =>
    getSheetsClient().spreadsheets.values.append({
      spreadsheetId: PROCESSO_ID,
      range: ABA + "!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [[pedido, agora, ids.join(" "), inicio, fim, "pendente", "", ""]] },
    }),
  );
  return pedido;
}

export async function estadoPerfil(
  pedido: string,
): Promise<{ status: string; resultado: string; erro: string; ids: string } | null> {
  const r = await comCota(() =>
    getSheetsClient().spreadsheets.values.get({ spreadsheetId: PROCESSO_ID, range: ABA + "!A2:H" }),
  );
  const l = ((r.data.values ?? []) as string[][]).find((x) => x[0] === pedido);
  if (!l) return null;
  return { ids: l[2] ?? "", status: l[5] ?? "", resultado: l[6] ?? "", erro: l[7] ?? "" };
}
