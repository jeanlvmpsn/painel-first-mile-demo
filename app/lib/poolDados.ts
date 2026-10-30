import { getSheetsClient } from "./sheets";
import { semanaDe, type LinhaPool } from "./pool";

const PLANILHA_POOL = "demo-pool";
const HUB = "CPS";
const SA = "a conta de serviço do painel";

export type LeituraPool = {
  linhas: LinhaPool[];
  aba: string | null;
  semana: number | null;
  ano: number | null;

  atualizadoEm: string;
  abasDisponiveis: string[];
  erro: string | null;
};

const vazio = (erro: string | null, extra: Partial<LeituraPool> = {}): LeituraPool => ({
  linhas: [],
  aba: null,
  semana: null,
  ano: null,
  atualizadoEm: "",
  abasDisponiveis: [],
  erro,
  ...extra,
});

const normalizarCab = (c: unknown) =>
  String(c ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

function abaDaSemana(titulos: string[], semana: number): string | null {
  const alvo = new RegExp("^W0*" + semana + "(\\b|\\s|$)", "i");
  return titulos.find((t) => alvo.test(t.trim())) ?? null;
}

export async function getPoolCps(dataBR: string): Promise<LeituraPool> {
  const sem = semanaDe(dataBR);
  if (!sem) return vazio("Data invalida: " + dataBR);

  const sheets = getSheetsClient();

  let titulos: string[];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: PLANILHA_POOL });
    titulos = (meta.data.sheets ?? [])
      .map((s) => s.properties?.title ?? "")
      .filter(Boolean);
  } catch (e) {
    const codigo = (e as { code?: number }).code;
    if (codigo === 403 || codigo === 404) {
      return vazio(
        "A planilha do pool nao esta compartilhada com a conta de servico do painel. " +
          "Compartilhe a planilha do pool como Leitor com " + SA + "."
      );
    }
    return vazio("Nao foi possivel abrir a planilha do pool: " + String(e));
  }

  const semanais = titulos.filter((t) => /^W\d{1,2}\b/i.test(t.trim())).sort();
  const aba = abaDaSemana(titulos, sem.semana);
  if (!aba) {
    return vazio(
      "Nao existe aba da semana W" + sem.semana + " nessa planilha. " +
        "Abas de semana encontradas: " + (semanais.join(", ") || "nenhuma") + ".",
      { abasDisponiveis: semanais, semana: sem.semana, ano: sem.ano }
    );
  }

  let valores: string[][];
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: PLANILHA_POOL,
      range: "'" + aba + "'!A1:N",
    });
    valores = (data.values as string[][] | undefined) ?? [];
  } catch (e) {
    return vazio("Nao foi possivel ler a aba " + aba + ": " + String(e), {
      abasDisponiveis: semanais,
    });
  }

  if (valores.length < 2) {
    return vazio("A aba " + aba + " esta vazia.", { abasDisponiveis: semanais });
  }

  const cab = valores[0].map(normalizarCab);
  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTp = col("TRANSPORTADOR", "TRANSPORTADORA");
  const iHub = col("HUB");
  const iCluster = col("CLUSTER");
  const iPerfil = col("PERFIL_VEICULO", "PERFIL_PADRAO", "PERFIL");
  const iSegSex = col("POOL_SEG_SEX", "POOL_SEGSEX");
  const iSab = col("POOL_SABADO", "POOL_SAB");

  const faltando = (
    [
      ["TRANSPORTADOR", iTp],
      ["HUB", iHub],
      ["CLUSTER", iCluster],
      ["PERFIL_VEICULO", iPerfil],
      ["POOL SEG-SEX", iSegSex],
      ["POOL SABADO", iSab],
    ] as [string, number][]
  )
    .filter(([, i]) => i < 0)
    .map(([n]) => n);
  if (faltando.length > 0) {
    return vazio(
      "A aba " + aba + " mudou de formato: nao achei a(s) coluna(s) " +
        faltando.join(", ") + ".",
      { abasDisponiveis: semanais, aba }
    );
  }

  const carimbo = valores[0]
    .map((c) => String(c ?? ""))
    .find((c) => /atualiza/i.test(c));
  const atualizadoEm = carimbo
    ? (carimbo.match(/(\d{2}\/\d{2}\/\d{4}[^|]*)/)?.[1] ?? carimbo).trim()
    : "";

  const linhas: LinhaPool[] = valores
    .slice(1)
    .filter((l) => String(l[iHub] ?? "").trim().toUpperCase() === HUB)
    .map((l) => ({
      transportadora: String(l[iTp] ?? "").trim(),
      hub: HUB,
      cluster: String(l[iCluster] ?? "").trim(),
      perfil: String(l[iPerfil] ?? "").trim(),
      segSex: num(l[iSegSex]),
      sabado: num(l[iSab]),
      semana: sem.semana,
      ano: sem.ano,
    }))
    .filter((l) => l.transportadora && l.perfil);

  if (linhas.length === 0) {
    return vazio(
      "A aba " + aba + " nao tem nenhuma linha com HUB = " + HUB + ".",
      { abasDisponiveis: semanais, aba, semana: sem.semana, ano: sem.ano }
    );
  }

  return {
    linhas,
    aba,
    semana: sem.semana,
    ano: sem.ano,
    atualizadoEm,
    abasDisponiveis: semanais,
    erro: null,
  };
}
