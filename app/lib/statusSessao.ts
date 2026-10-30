import { getSheetsClient } from "./sheets";
import { extrairCarimbos, type Carimbo } from "./ultimaAtualizacao";

const SPREADSHEET_ID =
  "demo-principal";

const ABA_PAINEL = "SEMI AUTO ATRIBUIÇÃO";
const TZ = "America/Sao_Paulo";

const ROTULOS = {
  atribuicao: "ultima atualizacao atribuicao",
  coleta: "ultima atualizacao",
} as const;

export type Fonte = keyof typeof ROTULOS;

export type StatusFonte = {
  fonte: Fonte;
  estado: "ok" | "erro" | "ausente";
  mensagem: string;
  quando: string | null;
  minutosAtras: number | null;
};

export type StatusSessao = {
  fontes: StatusFonte[];
  tutorial: string | null;
};

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function minutosDesde(carimbo: string): number | null {
  const m = carimbo.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const alvo = Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0));

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const p: Record<string, string> = {};
  for (const parte of partes) p[parte.type] = parte.value;
  const agora = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );

  return Math.round((agora - alvo) / 60000);
}

function montar(fonte: Fonte, linhas: string[][]): StatusFonte {
  const linha = linhas.find((l) => normalizar(String(l?.[0] ?? "")) === ROTULOS[fonte]);
  const bruto = String(linha?.[1] ?? "").trim();

  if (!bruto) {
    return { fonte, estado: "ausente", mensagem: "", quando: null, minutosAtras: null };
  }

  const quando = bruto.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/)?.[0] ?? null;
  const mensagem = bruto
    .replace(/^(OK|ERRO)\s*[—-]\s*/i, "")
    .replace(/\s*[—-]\s*\d{2}\/\d{2}\/\d{4}.*$/, "")
    .trim();

  return {
    fonte,
    estado: /^erro/i.test(bruto) ? "erro" : "ok",
    mensagem,
    quando,
    minutosAtras: quando ? minutosDesde(quando) : null,
  };
}

export async function lerStatusSessao(): Promise<StatusSessao> {
  try {
    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'" + ABA_PAINEL + "'!A1:B40",
    });
    const linhas = ((resp.data.values as string[][] | undefined) ?? []).map((l) =>
      (l ?? []).map((c) => String(c ?? "")),
    );

    const tutorial =
      linhas.find((l) => normalizar(String(l?.[0] ?? "")) === "tutorial")?.[1]?.trim() ||
      null;

    return {
      fontes: (Object.keys(ROTULOS) as Fonte[]).map((f) => montar(f, linhas)),
      tutorial,
    };
  } catch {
    return { fontes: [], tutorial: null };
  }
}

export async function lerCarimbos(): Promise<Carimbo[]> {
  try {
    const sheets = getSheetsClient();
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'" + ABA_PAINEL + "'!A1:B40",
    });
    const linhas = ((resp.data.values as string[][] | undefined) ?? []).map((l) =>
      (l ?? []).map((c) => String(c ?? "")),
    );
    return extrairCarimbos(linhas);
  } catch {
    return [];
  }
}
