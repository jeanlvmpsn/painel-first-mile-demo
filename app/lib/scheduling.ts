import { diferencaDoHistorico } from "./historicoDiff";
import { getSheetsClient } from "./sheets";
import {
  dataParaISO,
  ehSabado,
  lerZona,
  type PedidoScheduling,
  type Situacao,
} from "./schedulingTipos";

const SPREADSHEET_ID = "demo-principal";

const ABA_SCHEDULING = "SCHEDULING";

const ABA_HISTORICO = "HISTORICO_SCHEDULING";

const ABA_POS_11H = "RECUSAS_POS_11H";
const ABA_BASE_11H = "RECUSAS_BASE_11H";

const COLUNAS = {
  data: "DATA",
  travelId: "TRAVEL_ID",
  transportadora: "TRANSPORTADORA",
  status: "STATUS",
  motivo: "MOTIVO",
  perfil: "PERFIL",
  zona: "ZONA",
  eta: "ETA",
  destino: "DESTINO",
} as const;

const DE_STATUS: Record<string, Situacao> = {
  accepted: "aceite",
  rejected: "recusa",
  defined: "semResposta",
  canceled: "cancelado",
};

function clienteSheets() {
  return getSheetsClient();
}

function normalizar(valor: unknown): string {
  return String(valor ?? "").trim().toUpperCase();
}

function converter(linhas: string[][]): PedidoScheduling[] {
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].map(normalizar);
  const indice = (nome: string) => cabecalho.indexOf(normalizar(nome));

  const iData = indice(COLUNAS.data);
  const iStatus = indice(COLUNAS.status);

  if (iData < 0 || iStatus < 0) return [];

  const iTravel = indice(COLUNAS.travelId);
  const iTp = indice(COLUNAS.transportadora);
  const iMotivo = indice(COLUNAS.motivo);
  const iPerfil = indice(COLUNAS.perfil);
  const iZona = indice(COLUNAS.zona);
  const iEta = indice(COLUNAS.eta);
  const iDestino = indice(COLUNAS.destino);

  const pego = (linha: string[], i: number) =>
    i >= 0 ? String(linha[i] ?? "").trim() : "";

  const saida: PedidoScheduling[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    const data = pego(linha, iData);
    if (!data) continue;

    const bruto = pego(linha, iStatus).toLowerCase();
    const zona = pego(linha, iZona);
    const z = lerZona(zona);

    const fora = z.sabado && !ehSabado(dataParaISO(data));

    saida.push({
      data,
      travelId: pego(linha, iTravel),
      transportadora: pego(linha, iTp) || "Sem transportadora",
      situacao: DE_STATUS[bruto] ?? null,
      statusBruto: bruto,
      motivo: pego(linha, iMotivo),
      perfil: pego(linha, iPerfil),
      zona,
      cluster: z.cluster,
      hub: z.hub || "CPS",
      eta: pego(linha, iEta),
      destino: pego(linha, iDestino),
      foraDoDia: fora,
      recusaPos11h: "",
    });
  }

  return saida;
}

async function lerAba(
  sheets: ReturnType<typeof clienteSheets>,
  aba: string,
): Promise<string[][]> {
  try {
    const resposta = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${aba}!A:Z`,
    });
    return (resposta.data.values ?? []) as string[][];
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    if (/unable to parse range/i.test(msg)) return [];
    throw erro;
  }
}

function chavePos11h(
  data: string,
  travelId: string,
  zona: string,
  transportadora: string,
  eta: string,
): string {
  return data + "|" + (travelId || zona + "|" + transportadora + "|" + eta);
}

export async function lerBasesPos11h(): Promise<Record<string, string>> {
  const linhas = await lerAba(clienteSheets(), ABA_BASE_11H);
  const saida: Record<string, string> = {};
  if (linhas.length < 2) return saida;
  const cab = linhas[0].map(normalizar);
  const iD = cab.indexOf("DATA");
  const iEm = cab.indexOf("BASE_EM");
  if (iD < 0 || iEm < 0) return saida;
  for (const l of linhas.slice(1)) {
    const iso = dataParaISO(String(l[iD] ?? ""));
    if (iso && !saida[iso]) saida[iso] = String(l[iEm] ?? "").trim();
  }
  return saida;
}

export async function lerScheduling(): Promise<PedidoScheduling[]> {
  const sheets = clienteSheets();

  const [vivo, historico, pos11h] = await Promise.all([
    lerAba(sheets, ABA_SCHEDULING),
    lerAba(sheets, ABA_HISTORICO),
    lerAba(sheets, ABA_POS_11H),
  ]);

  const pedidos = [...converter(historico), ...converter(vivo)];

  const detectadas = new Map<string, string>();
  if (pos11h.length > 1) {
    const cab = pos11h[0].map(normalizar);
    const c = (n: string) => cab.indexOf(n);
    const [iD, iT, iTp, iZ, iE, iEm] = [
      c("DATA"), c("TRAVEL_ID"), c("TRANSPORTADORA"), c("ZONA"), c("ETA"), c("DETECTADA_EM"),
    ];
    for (const l of pos11h.slice(1)) {
      const v = (i: number) => (i >= 0 ? String(l[i] ?? "").trim() : "");
      detectadas.set(
        chavePos11h(v(iD), v(iT), v(iZ), v(iTp), v(iE)),
        v(iEm) || "registrada",
      );
    }
  }
  for (const p of pedidos) {
    p.recusaPos11h =
      detectadas.get(chavePos11h(p.data, p.travelId, p.zona, p.transportadora, p.eta)) ?? "";
  }

  const porChave = new Map<string, PedidoScheduling>();
  for (const p of pedidos) {
    const chave = p.travelId
      ? `${p.data}|${p.travelId}`
      : `${p.data}|${p.zona}|${p.transportadora}|${p.eta}`;
    porChave.set(chave, p);
  }

  return [...porChave.values()];
}

export async function registrarSnapshotScheduling(): Promise<{
  gravadas: number;
  detalhe: string;
}> {
  const sheets = clienteSheets();
  const vivo = await lerAba(sheets, ABA_SCHEDULING);
  if (vivo.length < 2) return { gravadas: 0, detalhe: "aba viva vazia" };

  const cabecalho = vivo[0];
  const iData = cabecalho.findIndex((c) => normalizar(c) === "DATA");
  const iTravel = cabecalho.findIndex((c) => normalizar(c) === "TRAVEL_ID");
  if (iData < 0) throw new Error("SCHEDULING sem coluna DATA.");

  const hojeISO = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });

  const chave = (linha: string[]) =>
    iTravel >= 0 && linha[iTravel]
      ? `${linha[iData]}|${linha[iTravel]}`
      : linha.join("|");

  const alvo = vivo.slice(1).filter((l) => {
    const iso = dataParaISO(String(l[iData] ?? ""));
    return iso !== "" && iso <= hojeISO;
  });
  if (alvo.length === 0) {
    return { gravadas: 0, detalhe: "nada na janela para gravar" };
  }

  const historico = await lerAba(sheets, ABA_HISTORICO);

  if (historico.length === 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ABA_HISTORICO } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ABA_HISTORICO}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [cabecalho] },
    });
  } else {
    const igual =
      historico[0].length === cabecalho.length &&
      historico[0].every((c, i) => normalizar(c) === normalizar(cabecalho[i]));
    if (!igual) {
      throw new Error(
        "HISTORICO_SCHEDULING tem cabecalho diferente da aba viva. " +
          "Alinhe as duas antes de gravar.",
      );
    }
  }

  const { novas, correcoes } = diferencaDoHistorico(
    alvo,
    historico.slice(1),
    chave,
  );

  if (correcoes.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "RAW",
        data: correcoes.map((c) => ({
          range: `${ABA_HISTORICO}!A${c.linha + 2}`,
          values: [c.valores],
        })),
      },
    });
  }

  if (novas.length === 0) {
    return {
      gravadas: 0,
      detalhe: correcoes.length + " linha(s) corrigida(s), nenhuma nova",
    };
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_HISTORICO}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: novas },
  });

  return {
    gravadas: novas.length,
    detalhe:
      novas.length + " nova(s), " + correcoes.length +
      " corrigida(s), ate " + hojeISO,
  };
}
