import { getSheetsClient } from "./sheets";
import { extrairCluster } from "./dashboardUtils";
import { ehDeOutraBase, hubPeloNome } from "./hubs";
import type { RotaPlanejada } from "./atribuicaoUtils";

const SPREADSHEET_ID =
  "demo-principal";

const ABA_ATRIBUICAO = "ATRIBUIÇÃO";
const ABA_HISTORICO = "HISTORICO_ATRIBUICAO";

const SEM_PLACA = "naoatribuido";

function chave(v: string | undefined | null): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function mapearColunas(cabecalho: string[]) {
  const achar = (...nomes: string[]) => {
    for (const nome of nomes) {
      const i = cabecalho.findIndex((c) => chave(c) === nome);
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    data: achar("data"),
    rota: achar("rota", "nomedarota"),
    start: achar("start", "horario", "inicio"),
    transportadora: achar("transportadora", "carrier"),
    placa: achar("placa", "veiculo"),
    regiao: achar("hub", "regiao", "base", "origem"),
    motorista: achar("motorista", "nomemotorista"),
    statusVeiculo: achar("status_veiculo", "statusveiculo"),
    statusMotorista: achar("status_motorista", "statusmotorista"),
    tipoRota: achar("tipo_rota", "tiporota", "routetype"),

    perfil: achar("perfil"),
    veiculoTipo: achar("veiculo", "tipo_veiculo"),
    perfilMenor: achar("perfil_menor", "perfilmenor"),
  };
}

function simNaoOuIndefinido(linha: string[], i: number): boolean | undefined {
  if (i < 0) return undefined;
  const bruto = String(linha[i] ?? "").trim().toUpperCase();
  if (!bruto) return undefined;
  return bruto === "SIM";
}

async function lerAba(aba: string): Promise<RotaPlanejada[]> {
  const sheets = getSheetsClient();
  let linhas: string[][] = [];
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: aba + "!A1:Z",
    });
    linhas = (resp.data.values ?? []) as string[][];
  } catch {
    return [];
  }
  if (linhas.length < 2) return [];

  const col = mapearColunas(linhas[0] ?? []);
  if (col.rota < 0) return [];

  const saida: RotaPlanejada[] = [];
  for (const linha of linhas.slice(1)) {
    const rota = String(linha[col.rota] ?? "").trim();
    if (!rota) continue;

    if (ehDeOutraBase(rota)) continue;

    const placaBruta =
      col.placa >= 0 ? String(linha[col.placa] ?? "").trim() : "";
    const semPlaca = !placaBruta || chave(placaBruta) === SEM_PLACA;

    const regiaoBruta =
      col.regiao >= 0 ? String(linha[col.regiao] ?? "").trim() : "";

    saida.push({
      data: col.data >= 0 ? String(linha[col.data] ?? "").trim() : "",
      rota,
      start: col.start >= 0 ? String(linha[col.start] ?? "").trim() : "",
      transportadora:
        col.transportadora >= 0
          ? String(linha[col.transportadora] ?? "").trim()
          : "",
      placa: semPlaca ? "" : placaBruta,

      regiao: hubPeloNome(rota) || (regiaoBruta ? regiaoBruta.toUpperCase() : "CPS"),
      cluster: extrairCluster(rota) ?? "sem cluster",
      atribuida: !semPlaca,
      motorista:
        col.motorista >= 0 ? String(linha[col.motorista] ?? "").trim() : "",
      statusVeiculo:
        col.statusVeiculo >= 0 ? String(linha[col.statusVeiculo] ?? "").trim() : "",
      statusMotorista:
        col.statusMotorista >= 0
          ? String(linha[col.statusMotorista] ?? "").trim() || "não gravado"
          : "",
        tipoRota:
          col.tipoRota >= 0 ? String(linha[col.tipoRota] ?? "").trim() : "",
        perfil: col.perfil >= 0 ? String(linha[col.perfil] ?? "").trim() : "",
      veiculoTipo:
        col.veiculoTipo >= 0 ? String(linha[col.veiculoTipo] ?? "").trim() : "",
      perfilMenor: simNaoOuIndefinido(linha, col.perfilMenor),
    });
  }
  return saida;
}

export async function getRotasPlanejadas(
  dataBR: string,
  hojeBR: string,
): Promise<RotaPlanejada[]> {
  const [doDia, historico] = await Promise.all([
    lerAba(ABA_ATRIBUICAO),
    lerAba(ABA_HISTORICO),
  ]);

  const porRota = new Map<string, RotaPlanejada>();

  for (const r of historico) {
    if (r.data === dataBR) porRota.set(chave(r.rota), { ...r, doHistorico: true });
  }

  for (const r of doDia) {
    const data = r.data || hojeBR;
    if (data === dataBR) porRota.set(chave(r.rota), { ...r, data });
  }

  return [...porRota.values()].sort((a, b) =>
    a.rota.localeCompare(b.rota, "pt-BR"),
  );
}

function brParaISO(dataBR: string): string {
  const [dia, mes, ano] = dataBR.split("/");
  return `${ano}-${mes}-${dia}`;
}

export async function getRotasPlanejadasPeriodo(
  dataInicioBR: string,
  dataFimBR: string,
  hojeBR: string,
): Promise<RotaPlanejada[]> {
  const inicioISO = brParaISO(dataInicioBR);
  const fimISO = brParaISO(dataFimBR);
  const noPeriodo = (dataBR: string) => {
    const iso = brParaISO(dataBR);
    return iso >= inicioISO && iso <= fimISO;
  };

  const [doDia, historico] = await Promise.all([
    lerAba(ABA_ATRIBUICAO),
    lerAba(ABA_HISTORICO),
  ]);

  const porRota = new Map<string, RotaPlanejada>();

  for (const r of historico) {
    if (noPeriodo(r.data)) porRota.set(r.data + "|" + chave(r.rota), r);
  }

  for (const r of doDia) {
    const data = r.data || hojeBR;
    if (noPeriodo(data))
      porRota.set(data + "|" + chave(r.rota), { ...r, data });
  }

  return [...porRota.values()].sort((a, b) => {
    const porData = brParaISO(a.data).localeCompare(brParaISO(b.data));
    return porData !== 0 ? porData : a.rota.localeCompare(b.rota, "pt-BR");
  });
}
