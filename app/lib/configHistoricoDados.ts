import { assinaturaDoPlano, CAB_HISTORICO_CONFIG, linhasDaConfig, substituirDia } from "./configHistorico";
import type { RotaPlanejada } from "./curvaChegada";
import { rotasComCarga } from "./estouro";
import { HB_SPREADSHEET_ID } from "./hbDados";
import { ehDeOutraBase } from "./hubs";
import { formatarDataBR, getSheetsClient, SPREADSHEET_ID } from "./sheets";

export const ABA_HISTORICO_CONFIG = "HISTORICO_CONFIG";
const CELULA_ASSINATURA = ABA_HISTORICO_CONFIG + "!I1";
const DIAS_GUARDADOS = 90;
const TZ = "America/Sao_Paulo";

export function planejadasDaConfig(config: string[][], dataBR: string): RotaPlanejada[] {
  return rotasComCarga(config, dataBR)
    .rotas.filter((r) => !ehDeOutraBase(r.rota))
    .map((r) => ({ rota: r.rota, transportadora: r.transportadora, cluster: r.cluster, eta: r.eta, pacotes: r.pacotes }));
}

async function ler(range: string): Promise<string[][]> {
  const r = await getSheetsClient().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  return ((r.data.values ?? []) as unknown[][]).map((l) => (l ?? []).map((v) => String(v ?? "")));
}

export function lerHistoricoConfig(): Promise<string[][]> {
  return ler(ABA_HISTORICO_CONFIG + "!A:G");
}

async function garantirAba(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  if (meta.data.sheets?.some((s) => s.properties?.title === ABA_HISTORICO_CONFIG)) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: ABA_HISTORICO_CONFIG } } }] },
  });
}

export async function registrarConfigDoDia(
  planejadas: RotaPlanejada[],
  dataBR: string,
): Promise<{ gravado: boolean; rotas: number }> {
  if (!planejadas.length) return { gravado: false, rotas: 0 };
  const assinatura = assinaturaDoPlano(planejadas, dataBR);
  const guardada = await ler(CELULA_ASSINATURA).catch(() => [] as string[][]);
  if (guardada[0]?.[0] === assinatura) return { gravado: false, rotas: planejadas.length };

  await garantirAba();
  const historico = await lerHistoricoConfig();
  const agora = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "medium" }).format(new Date());
  const limite = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Date.now() - DIAS_GUARDADOS * 86400000));
  const linhas = substituirDia(
    historico.length ? historico : [CAB_HISTORICO_CONFIG],
    linhasDaConfig(planejadas, dataBR, agora),
    dataBR,
    limite,
  );

  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: ABA_HISTORICO_CONFIG });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: ABA_HISTORICO_CONFIG + "!A1", values: linhas },
        { range: CELULA_ASSINATURA, values: [[assinatura]] },
      ],
    },
  });
  return { gravado: true, rotas: planejadas.length };
}

export async function registrarConfigDeHoje(): Promise<{ dataBR: string; gravado: boolean; rotas: number }> {
  const dataBR = formatarDataBR(new Date());
  const r = await getSheetsClient().spreadsheets.values.get({
    spreadsheetId: HB_SPREADSHEET_ID,
    range: "'Extração Config'!A:AZ",
  });
  const config = ((r.data.values ?? []) as unknown[][]).map((l) => (l ?? []).map((v) => String(v ?? "")));
  return { dataBR, ...(await registrarConfigDoDia(planejadasDaConfig(config, dataBR), dataBR)) };
}
