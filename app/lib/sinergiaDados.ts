import { getSheetsClient } from "./sheets";
import { type LinhaSinergia } from "./sinergia";

const PLANILHA_POOL = "demo-pool";
const HUB = "CPS";

export type LeituraSinergia = {
  linhas: LinhaSinergia[];
  aba: string | null;
  erro: string | null;
};

const normalizar = (c: unknown) =>
  String(c ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function lerAba(
  valores: string[][],
  aba: string,
): { linhas: LinhaSinergia[]; erro: string | null } {
  const iCab = valores.findIndex((l) => {
    const c = l.map(normalizar);
    return c.includes("CLUSTER") && c.includes("TOP1");
  });
  if (iCab < 0) {
    return { linhas: [], erro: "a aba " + aba + " nao tem CLUSTER e TOP1" };
  }

  const debaixo = valores[iCab].map(normalizar);
  const decima = iCab > 0 ? valores[iCab - 1].map(normalizar) : [];
  const largura = Math.max(debaixo.length, decima.length);
  const cab: string[] = [];
  for (let i = 0; i < largura; i++) cab.push(debaixo[i] || decima[i] || "");

  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iTp = col("MLP", "TRANSPORTADORA", "TRANSPORTADOR");
  const iHub = col("HUB");
  const iCluster = col("CLUSTER");
  const iTops = ["TOP1", "TOP2", "TOP3", "TOP4", "TOP5"]
    .map((n) => col(n))
    .filter((i) => i >= 0);

  if (iTp < 0) {
    return {
      linhas: [],
      erro:
        "a aba " + aba + " nao tem coluna de transportadora (achei: " +
        cab.filter(Boolean).join(", ") + ")",
    };
  }

  const linhas: LinhaSinergia[] = [];
  for (const l of valores.slice(iCab + 1)) {
    const hub = String(l[iHub] ?? "").trim().toUpperCase();
    if (iHub >= 0 && hub !== HUB) continue;
    const transportadora = String(l[iTp] ?? "").trim();
    const origem = String(l[iCluster] ?? "").trim();
    if (!transportadora || !origem) continue;
    const tops = iTops
      .map((i) => String(l[i] ?? "").trim())
      .filter((v) => v && v !== "0");
    if (tops.length === 0) continue;
    linhas.push({ transportadora, hub, origem, tops });
  }

  return { linhas, erro: null };
}

export async function getSinergiasCps(): Promise<LeituraSinergia> {
  const sheets = getSheetsClient();

  let titulos: string[] = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: PLANILHA_POOL });
    titulos = (meta.data.sheets ?? [])
      .map((a) => String(a.properties?.title ?? ""))
      .filter(Boolean);
  } catch (e) {
    return {
      linhas: [],
      aba: null,
      erro: "Nao foi possivel abrir a planilha do pool: " + String(e),
    };
  }

  const candidatas = titulos.filter((t) => normalizar(t) === "SINERGIAS");
  if (candidatas.length === 0) {
    return { linhas: [], aba: null, erro: "A planilha do pool nao tem aba Sinergias." };
  }

  let ultimoErro: string | null = null;
  let semLinhas: string | null = null;
  for (const aba of candidatas) {
    let valores: string[][] = [];
    try {
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId: PLANILHA_POOL,
        range: "'" + aba + "'!A1:N",
      });
      valores = (data.values as string[][] | undefined) ?? [];
    } catch (e) {
      ultimoErro = "nao deu para ler a aba " + aba + ": " + String(e);
      continue;
    }
    const lida = lerAba(valores, aba);
    if (lida.erro) {
      ultimoErro = lida.erro;
      continue;
    }

    if (lida.linhas.length > 0) return { linhas: lida.linhas, aba, erro: null };
    if (!semLinhas) semLinhas = aba;
  }

  if (semLinhas) return { linhas: [], aba: semLinhas, erro: null };
  return { linhas: [], aba: null, erro: ultimoErro };
}
