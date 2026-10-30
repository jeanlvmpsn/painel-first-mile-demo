import {
  CAB_FILA,
  comBaseOriginal,
  lerBaseOriginal,
  colunasSolicitacao,
  linhaDaFaixa,
  linhaSolicitacao,
  lerSolicitacoes,
  normalizarLinhas,
  normalizarPlaces,
  porCabecalho,
  type LinhaDrop,
  type NovaSolicitacao,
  type PlaceDia,
  type RespostaOriginal,
  type Solicitacao,
} from "./upgrade";
import { getSheetsClient } from "./sheets";

const BASE_ID = "demo-upgrade-base";
export const PROCESSO_ID = "demo-processo";
const ABA_FILA = "FILA_UPGRADE";
const ORIGINAL_ID = "demo-upgrade-original";

const ORIGINAL_GIDS = [1];

export type Base = {
  linhas: LinhaDrop[];
  places: PlaceDia[];
  atualizadoEm: string;
  inicio: string;
  fim: string;
};

const VALIDADE_MS = 10 * 60 * 1000;
let emMemoria: { quando: number; base: Base } | null = null;

export async function lerBase(): Promise<Base> {
  if (emMemoria && Date.now() - emMemoria.quando < VALIDADE_MS) return emMemoria.base;
  const r = await comCota(() =>
    getSheetsClient().spreadsheets.values.batchGet({
      spreadsheetId: BASE_ID,
      ranges: ["CANDIDATOS_UPGRADE!A:I", "PLACES_DIA!A:F", "INFO!A1:B10"],
    }),
  );
  const [cand, places, info] = (r.data.valueRanges ?? []).map(
    (v) => (v.values ?? []) as unknown[][],
  );
  const linhas = normalizarLinhas(porCabecalho(cand ?? []));
  const datas = linhas.map((l) => l.data).sort();
  const atualizado = (info ?? []).find((l) => String(l[0]) === "ATUALIZADO_EM");
  const base: Base = {
    linhas,
    places: normalizarPlaces(porCabecalho(places ?? [])),
    atualizadoEm: String(atualizado?.[1] ?? ""),
    inicio: datas[0] ?? "",
    fim: datas[datas.length - 1] ?? "",
  };
  emMemoria = { quando: Date.now(), base };
  return base;
}

const faixa = (aba: string, celulas: string) => "'" + aba.replace(/'/g, "''") + "'!" + celulas;

function ehCota(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /quota exceeded|rate limit|429/i.test(m);
}

export async function comCota<T>(fn: () => Promise<T>): Promise<T> {
  for (const espera of [4000, 12000]) {
    try {
      return await fn();
    } catch (e) {
      if (!ehCota(e)) throw e;
      await new Promise((r) => setTimeout(r, espera));
    }
  }
  try {
    return await fn();
  } catch (e) {
    if (ehCota(e)) {
      throw new Error(
        "O Google limitou as leituras da planilha neste minuto. Espere 1 minuto e tente de novo.",
      );
    }
    throw e;
  }
}

let abaAchada: string | null = null;
let abaAchadaId: number | null = null;

let falhaAba: { quando: number; erro: string } | null = null;

async function abaSolicitacao(): Promise<string> {
  if (abaAchada) return abaAchada;
  if (falhaAba && Date.now() - falhaAba.quando < 60_000) throw new Error(falhaAba.erro);
  const sheets = getSheetsClient();
  const meta = await comCota(() =>
    sheets.spreadsheets.get({
      spreadsheetId: PROCESSO_ID,
      fields: "sheets.properties(title,sheetType,sheetId)",
    }),
  );

  const normais = (meta.data.sheets ?? []).filter(
    (s) => (s.properties?.sheetType ?? "GRID") === "GRID" && s.properties?.title,
  );
  const titulos = normais.map((s) => s.properties?.title ?? "");
  const topo = await comCota(() =>
    sheets.spreadsheets.values.batchGet({
      spreadsheetId: PROCESSO_ID,
      ranges: titulos.map((t) => faixa(t, "A1:Z1")),
    }),
  );
  const i = (topo.data.valueRanges ?? []).findIndex((v) => {
    const c = colunasSolicitacao((v.values?.[0] ?? []) as unknown[]);
    return c.sellerId >= 0 && c.link >= 0;
  });
  if (i < 0) {
    const erro =
      "Nao achei a aba de solicitacao (cabecalho com ID SELLER SENDER e LINK DA EVIDENCIA).";
    falhaAba = { quando: Date.now(), erro };
    throw new Error(erro);
  }
  abaAchada = titulos[i];
  abaAchadaId = normais[i].properties?.sheetId ?? null;
  return abaAchada;
}

let solicitacoesEmMemoria: { quando: number; linhas: unknown[][] } | null = null;

async function linhasSolicitacao(): Promise<unknown[][]> {
  if (solicitacoesEmMemoria && Date.now() - solicitacoesEmMemoria.quando < 60_000) {
    return solicitacoesEmMemoria.linhas;
  }
  const aba = await abaSolicitacao();
  const r = await comCota(() =>
    getSheetsClient().spreadsheets.values.get({
      spreadsheetId: PROCESSO_ID,
      range: faixa(aba, "A1:Z"),
    }),
  );
  const linhas = (r.data.values ?? []) as unknown[][];
  solicitacoesEmMemoria = { quando: Date.now(), linhas };
  return linhas;
}

let originalEmMemoria: { quando: number; mapa: Map<string, RespostaOriginal> } | null = null;

let originalFalhou: { quando: number; erro: string } | null = null;

async function lerBaseOriginalDeRespostas(): Promise<Map<string, RespostaOriginal>> {
  if (originalEmMemoria && Date.now() - originalEmMemoria.quando < 5 * 60_000) return originalEmMemoria.mapa;
  if (originalFalhou && Date.now() - originalFalhou.quando < 5 * 60_000) throw new Error(originalFalhou.erro);
  try {
    return await lerBaseOriginalAgora();
  } catch (e) {
    originalFalhou = { quando: Date.now(), erro: (e as Error).message };
    throw e;
  }
}

async function lerBaseOriginalAgora(): Promise<Map<string, RespostaOriginal>> {
  const sheets = getSheetsClient();
  const meta = await comCota(() =>
    sheets.spreadsheets.get({ spreadsheetId: ORIGINAL_ID, fields: "sheets.properties(title,sheetId)" }),
  );
  const abas = (meta.data.sheets ?? []).map((s) => s.properties ?? {});
  const titulo =
    ORIGINAL_GIDS.map((id) => abas.find((a) => a.sheetId === id)?.title).find(Boolean) ??
    abas.find((a) => /hard\s*first\s*mile/i.test(a.title ?? ""))?.title;
  if (!titulo) throw new Error("aba Form_Responses nao encontrada na base original");
  const r = await comCota(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: ORIGINAL_ID, range: faixa(titulo, "A1:AF") }),
  );
  const mapa = lerBaseOriginal((r.data.values ?? []) as unknown[][]);
  originalEmMemoria = { quando: Date.now(), mapa };
  originalFalhou = null;
  return mapa;
}

export async function lerAbaSolicitacao(): Promise<{
  solicitacoes: Solicitacao[];
  solicitantes: string[];
  avisoBaseOriginal: string;
}> {
  const { solicitacoes, solicitantes } = lerSolicitacoes(await linhasSolicitacao());

  try {
    return { solicitacoes: comBaseOriginal(solicitacoes, await lerBaseOriginalDeRespostas()), solicitantes, avisoBaseOriginal: "" };
  } catch {
    return { solicitacoes, solicitantes, avisoBaseOriginal: "" };
  }
}

async function copiarMenusDaLinhaDeCima(numero: number, largura: number): Promise<void> {
  if (abaAchadaId === null || numero < 3 || largura < 1) return;
  try {
    await getSheetsClient().spreadsheets.batchUpdate({
      spreadsheetId: PROCESSO_ID,
      requestBody: {
        requests: [
          {
            copyPaste: {
              source: {
                sheetId: abaAchadaId,
                startRowIndex: numero - 2,
                endRowIndex: numero - 1,
                startColumnIndex: 0,
                endColumnIndex: largura,
              },
              destination: {
                sheetId: abaAchadaId,
                startRowIndex: numero - 1,
                endRowIndex: numero,
                startColumnIndex: 0,
                endColumnIndex: largura,
              },
              pasteType: "PASTE_DATA_VALIDATION",
            },
          },
        ],
      },
    });
  } catch (e) {
    console.error("Nao copiei o menu suspenso para a linha " + numero + ":", e);
  }
}

let filaExiste = false;

async function garantirFila(): Promise<void> {
  if (filaExiste) return;
  const sheets = getSheetsClient();
  const meta = await comCota(() =>
    sheets.spreadsheets.get({
      spreadsheetId: PROCESSO_ID,
      fields: "sheets.properties.title",
    }),
  );
  const existe = (meta.data.sheets ?? []).some((s) => s.properties?.title === ABA_FILA);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: PROCESSO_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: ABA_FILA } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: PROCESSO_ID,
      range: ABA_FILA + "!A1",
      valueInputOption: "RAW",
      requestBody: { values: [CAB_FILA] },
    });
  }
  filaExiste = true;
}

const agoraBR = () =>
  new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export async function solicitar(
  nova: NovaSolicitacao,
  inicio: string,
  fim: string,
): Promise<{ pedido: string; linha: number }> {
  const sheets = getSheetsClient();
  const aba = await abaSolicitacao();
  const cab = ((await linhasSolicitacao())[0] ?? []) as unknown[];
  const linha = linhaSolicitacao(colunasSolicitacao(cab), cab.length, nova);
  const gravado = await comCota(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: PROCESSO_ID,
      range: faixa(aba, "A1"),

      valueInputOption: "USER_ENTERED",
      requestBody: { values: [linha] },
    }),
  );
  const numero = linhaDaFaixa(gravado.data.updates?.updatedRange);

  solicitacoesEmMemoria = null;
  await copiarMenusDaLinhaDeCima(numero, cab.length);
  if (nova.motivo && nova.motivo !== "quantidade") return { pedido: "", linha: numero };

  await garantirFila();
  const pedido = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await comCota(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId: PROCESSO_ID,
      range: ABA_FILA + "!A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          pedido, agoraBR(), nova.sellerId, nova.placeId, inicio, fim, String(numero), "pendente", "", "",
          "",
        ]],
      },
    }),
  );
  return { pedido, linha: numero };
}

export async function estadoPedido(
  pedido: string,
): Promise<{ status: string; link: string; erro: string } | null> {
  const r = await comCota(() =>
    getSheetsClient().spreadsheets.values.get({
      spreadsheetId: PROCESSO_ID,
      range: ABA_FILA + "!A2:J",
    }),
  );
  const achado = ((r.data.values ?? []) as string[][]).find((l) => l[0] === pedido);
  if (!achado) return null;
  return { status: achado[7] ?? "", link: achado[8] ?? "", erro: achado[9] ?? "" };
}
