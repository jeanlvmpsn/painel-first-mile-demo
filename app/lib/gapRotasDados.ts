import { getRotasPlanejadas } from "./atribuicoes";
import { rotasComCarga } from "./estouro";
import { chaveRota, mapaDePontos, paradasPlanejadas, rotasDoDia } from "./hb";
import { HB_SPREADSHEET_ID } from "./hbDados";
import { somenteCampinas } from "./hubs";
import { getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { comCota } from "./upgradeDados";
import {
  CAB_AJUSTES_GAP,
  lerAjustesGap,
  linhaAjusteGap,
  montarGap,
  type AjusteGap,
  type DadosGap,
  type ParadaPlanejada,
} from "./gapRotas";

const ABA_AJUSTES = "GAP_ROTAS_AJUSTES";
const FAIXA_AJUSTES = ABA_AJUSTES + "!A:F";
const ABA_EXTRACAO = "Extração Config";

const ABA_EXTRACAO_D1 = "Extração Config D+1";
const ABA_FORMULAS = "Formulas";

const VALIDADE_PLANO_MS = 5 * 60_000;

const comoTexto = (v: unknown[][] | null | undefined) =>
  ((v ?? []) as unknown[][]).map((l) => (l ?? []).map((x) => String(x ?? "")));

type PlanoBruto = { extracao: string[][]; extracaoD1: string[][]; formulas: string[][] };
let ultimoPlano: ({ quando: number } & PlanoBruto) | null = null;

async function lerPlanoBruto(): Promise<PlanoBruto> {
  if (ultimoPlano && Date.now() - ultimoPlano.quando < VALIDADE_PLANO_MS) return ultimoPlano;
  const sheets = getSheetsClient();
  const [ext, extD1, form] = await Promise.all([
    comCota(() => sheets.spreadsheets.values.get({ spreadsheetId: HB_SPREADSHEET_ID, range: "'" + ABA_EXTRACAO + "'!A:AZ" })),

    comCota(() => sheets.spreadsheets.values.get({ spreadsheetId: HB_SPREADSHEET_ID, range: "'" + ABA_EXTRACAO_D1 + "'!A:AZ" })).catch(
      () => null,
    ),
    comCota(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId: HB_SPREADSHEET_ID,
        range: ABA_FORMULAS + "!A:AK",
        valueRenderOption: "UNFORMATTED_VALUE",
      }),
    ),
  ]);
  ultimoPlano = {
    quando: Date.now(),
    extracao: comoTexto(ext.data.values),
    extracaoD1: comoTexto(extD1?.data.values),
    formulas: comoTexto(form.data.values),
  };
  return ultimoPlano;
}

async function lerLinhasAjustes(): Promise<string[][]> {
  try {
    const r = await comCota(() =>
      getSheetsClient().spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: FAIXA_AJUSTES }),
    );
    return comoTexto(r.data.values);
  } catch (e) {
    if (/Unable to parse range/i.test((e as Error).message)) return [];
    throw e;
  }
}

export async function carregarGap(dataBR: string, hojeBR: string): Promise<DadosGap> {
  const avisos: string[] = [];
  const [todas, ajustesBrutos, plano] = await Promise.all([
    getRotasPlanejadas(dataBR, hojeBR),
    lerLinhasAjustes().catch((e: Error) => {
      avisos.push("Não deu para ler os ajustes do time (" + e.message + "): o report saiu só com o critério automático.");
      return [] as string[][];
    }),
    lerPlanoBruto().catch((e: Error) => {
      avisos.push("Não deu para ler o plano (Extração Config/Formulas): " + e.message);
      return { extracao: [] as string[][], extracaoD1: [] as string[][], formulas: [] as string[][] };
    }),
  ]);
  const rotas = somenteCampinas(todas);

  const deD1 = plano.extracaoD1.length ? rotasComCarga(plano.extracaoD1, dataBR) : null;
  const config = deD1 && deD1.rotas.length ? deD1 : rotasComCarga(plano.extracao, dataBR);
  const fonte = deD1 && deD1.rotas.length ? ABA_EXTRACAO_D1 : ABA_EXTRACAO;
  if (config.aviso && config.rotas.length) avisos.push(config.aviso);
  const naConfig = new Set(config.rotas.map((r) => chaveRota(r.rota)));
  const paradas: ParadaPlanejada[] = config.rotas.flatMap((r) =>
    r.detalhe.map((d) => ({ rota: r.rota, idParada: d.id, nome: d.nome, pacotes: d.pacotes })),
  );

  const foraDaConfig = rotas.map((r) => r.rota).filter((r) => !naConfig.has(chaveRota(r)));
  for (const p of paradasPlanejadas(rotasDoDia([], dataBR), mapaDePontos(plano.formulas), { has: () => true }, foraDaConfig)) {
    paradas.push({ rota: String(p.rota ?? ""), idParada: String(p.parada ?? ""), pacotes: null });
  }
  if (!config.rotas.length) {
    avisos.push(
      "Nem a aba \u201c" + ABA_EXTRACAO_D1 + "\u201d nem a \u201c" + ABA_EXTRACAO + "\u201d (planilha do H&B) têm a config de " + dataBR +
        ": sem o planejado, nenhuma parada fica em evidência sozinha.",
    );
  }
  const resultado = montarGap({ rotas, paradas, ajustes: lerAjustesGap(ajustesBrutos, dataBR) });
  return {
    dataBR,
    hojeBR,
    resultado,
    rotasDoDia: rotas.length,
    rotasNaConfig: config.rotas.length,
    fonteConfig: config.rotas.length ? fonte : "",
    avisos,
  };
}

let abaOk = false;
async function garantirAba(): Promise<void> {
  if (abaOk) return;
  const sheets = getSheetsClient();
  const meta = await comCota(() => sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID }));
  if (!meta.data.sheets?.some((s) => s.properties?.title === ABA_AJUSTES)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: ABA_AJUSTES } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: ABA_AJUSTES + "!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...CAB_AJUSTES_GAP]] },
    });
  }
  abaOk = true;
}

const agoraSP = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" })
    .format(new Date())
    .replace(",", "");

export async function gravarAjusteGap(dataBR: string, a: Omit<AjusteGap, "registradoEm">): Promise<void> {
  await garantirAba();
  await comCota(() =>
    getSheetsClient().spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: FAIXA_AJUSTES,

      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [linhaAjusteGap(dataBR, a, agoraSP())] },
    }),
  );
}
