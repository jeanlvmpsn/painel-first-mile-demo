// Planilha falsa em memoria: imita a parte da Google Sheets API que o painel
// usa (spreadsheets.get / batchUpdate e values.get / batchGet / update /
// append / clear / batchUpdate). Os dados vem do gerador da demo, por dia; as
// gravacoes ficam so na memoria do servidor.

import { abaGerada, abasConhecidas } from "./gerador";

export type Celula = string | number | boolean;
type Aba = { id: number; linhas: Celula[][] };

// planilha -> aba -> linhas. Recriada quando o dia muda (dados do dia novo).
let diaAtual = "";
const planilhas = new Map<string, Map<string, Aba>>();
let proximoId = 1000;

const TZ = "America/Sao_Paulo";
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function planilha(id: string): Map<string, Aba> {
  const hoje = hojeISO();
  if (hoje !== diaAtual) {
    planilhas.clear();
    diaAtual = hoje;
  }
  let p = planilhas.get(id);
  if (!p) {
    p = new Map();
    planilhas.set(id, p);
  }
  return p;
}

function aba(planilhaId: string, titulo: string, criar = false): Aba | null {
  const p = planilha(planilhaId);
  let a = p.get(titulo);
  if (a) return a;
  const linhas = abaGerada(planilhaId, titulo);
  if (!linhas && !criar) return null;
  a = { id: proximoId++, linhas: linhas ?? [] };
  p.set(titulo, a);
  return a;
}

// --- A1 ----------------------------------------------------------------------

type Faixa = { aba: string; l0: number; c0: number; l1: number; c1: number };

function colunaParaIndice(letras: string): number {
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function indiceParaColuna(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function lerFaixa(range: string): Faixa {
  const bang = range.lastIndexOf("!");
  let nome = bang >= 0 ? range.slice(0, bang) : range;
  const ref = bang >= 0 ? range.slice(bang + 1) : "";
  if (nome.startsWith("'") && nome.endsWith("'")) nome = nome.slice(1, -1).replace(/''/g, "'");
  const f: Faixa = { aba: nome, l0: 0, c0: 0, l1: Infinity, c1: Infinity };
  if (!ref) return f;
  const [a, b] = ref.split(":");
  const parte = (s: string) => {
    const m = /^([A-Za-z]*)(\d*)$/.exec(s.trim());
    if (!m) return { c: null as number | null, l: null as number | null };
    return { c: m[1] ? colunaParaIndice(m[1]) : null, l: m[2] ? Number(m[2]) - 1 : null };
  };
  const p0 = parte(a);
  const p1 = b === undefined ? p0 : parte(b);
  f.c0 = p0.c ?? 0;
  f.l0 = p0.l ?? 0;
  f.c1 = p1.c ?? (b === undefined && p0.c !== null ? p0.c : Infinity);
  f.l1 = p1.l ?? (b === undefined && p0.l !== null ? p0.l : Infinity);
  if (b === undefined && p0.c !== null && p0.l !== null) {
    f.c1 = p0.c;
    f.l1 = p0.l;
  }
  return f;
}

function nomeFaixa(f: Faixa, linhas: number, colunas: number): string {
  const aba = /^[A-Za-z0-9_]+$/.test(f.aba) ? f.aba : "'" + f.aba.replace(/'/g, "''") + "'";
  const fim = (Number.isFinite(f.l1) ? f.l1 : f.l0 + Math.max(linhas, 1) - 1) + 1;
  const cFim = Number.isFinite(f.c1) ? f.c1 : f.c0 + Math.max(colunas, 1) - 1;
  return `${aba}!${indiceParaColuna(f.c0)}${f.l0 + 1}:${indiceParaColuna(cFim)}${fim}`;
}

// --- valores -----------------------------------------------------------------

const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

function serial(dd: number, mm: number, aaaa: number, h = 0, mi = 0, s = 0): number {
  const base = Date.UTC(1899, 11, 30);
  return (Date.UTC(aaaa, mm - 1, dd, h, mi, s) - base) / 86_400_000;
}

function formatado(v: Celula): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}

function cru(v: Celula): Celula {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "") return "";
  const d = DATA_BR.exec(t);
  if (d) return serial(+d[1], +d[2], +d[3], +(d[4] ?? 0), +(d[5] ?? 0), +(d[6] ?? 0));
  const h = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (h) return (+h[1] * 3600 + +h[2] * 60 + +(h[3] ?? 0)) / 86_400;
  if (/^-?\d+(\.\d+)?$/.test(t) && t.length < 16) return Number(t);
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+(,\d+)?%$/.test(t)) return Number(t.replace("%", "").replace(",", ".")) / 100;
  if (t === "TRUE" || t === "FALSE") return t === "TRUE";
  return v;
}

function recortar(linhas: Celula[][], f: Faixa, render?: string): Celula[][] {
  const saida: Celula[][] = [];
  const fimL = Math.min(f.l1, linhas.length - 1);
  for (let i = f.l0; i <= fimL; i++) {
    const l = linhas[i] ?? [];
    const fimC = Math.min(f.c1, l.length - 1);
    const linha: Celula[] = [];
    for (let j = f.c0; j <= fimC; j++) {
      const v = l[j] ?? "";
      linha.push(render === "UNFORMATTED_VALUE" ? cru(v) : formatado(v));
    }
    while (linha.length && (linha[linha.length - 1] === "" || linha[linha.length - 1] === undefined)) linha.pop();
    saida.push(linha);
  }
  while (saida.length && saida[saida.length - 1].length === 0) saida.pop();
  return saida;
}

function escrever(a: Aba, f: Faixa, valores: Celula[][]): void {
  valores.forEach((linha, i) => {
    const li = f.l0 + i;
    while (a.linhas.length <= li) a.linhas.push([]);
    const alvo = a.linhas[li];
    linha.forEach((v, j) => {
      const cj = f.c0 + j;
      while (alvo.length <= cj) alvo.push("");
      alvo[cj] = v === null || v === undefined ? "" : v;
    });
  });
}

function ultimaLinhaComDado(a: Aba): number {
  for (let i = a.linhas.length - 1; i >= 0; i--) if (a.linhas[i].some((v) => v !== "" && v !== undefined)) return i;
  return -1;
}

function erroAba(nome: string): Error {
  const e = new Error(`Unable to parse range: ${nome}`) as Error & { code: number };
  e.code = 400;
  return e;
}

// --- cliente -----------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
// Parametros soltos como os da API real (valueInputOption, insertDataOption...).
type P = Record<string, any> & { spreadsheetId: string };
const ok = <T>(data: T) => Promise.resolve({ data, status: 200 });

function ler(params: P & { range: string; valueRenderOption?: string }) {
  const f = lerFaixa(params.range);
  const a = aba(params.spreadsheetId, f.aba);
  if (!a) throw erroAba(params.range);
  const values = recortar(a.linhas, f, params.valueRenderOption);
  return { range: nomeFaixa(f, values.length, Math.max(0, ...values.map((l) => l.length))), majorDimension: "ROWS", ...(values.length ? { values } : {}) };
}

export function criarClienteFalso() {
  const values = {
    get: (params: P & { range: string }) => {
      try {
        return ok(ler(params));
      } catch (e) {
        return Promise.reject(e);
      }
    },
    batchGet: (params: P & { ranges: string[]; valueRenderOption?: string }) => {
      try {
        return ok({ spreadsheetId: params.spreadsheetId, valueRanges: params.ranges.map((range) => ler({ ...params, range })) });
      } catch (e) {
        return Promise.reject(e);
      }
    },
    update: (params: P & { range: string }) => {
      const f = lerFaixa(params.range);
      const a = aba(params.spreadsheetId, f.aba);
      if (!a) return Promise.reject(erroAba(params.range));
      const v: Celula[][] = params.requestBody?.values ?? [];
      escrever(a, f, v);
      return ok({ updatedRange: params.range, updatedRows: v.length });
    },
    append: (params: P & { range: string }) => {
      const f = lerFaixa(params.range);
      const a = aba(params.spreadsheetId, f.aba);
      if (!a) return Promise.reject(erroAba(params.range));
      const v: Celula[][] = params.requestBody?.values ?? [];
      const inicio = ultimaLinhaComDado(a) + 1;
      escrever(a, { ...f, l0: inicio }, v);
      return ok({ updates: { updatedRange: nomeFaixa({ ...f, l0: inicio, l1: inicio + v.length - 1 }, v.length, 1), updatedRows: v.length } });
    },
    clear: (params: P & { range: string }) => {
      const f = lerFaixa(params.range);
      const a = aba(params.spreadsheetId, f.aba);
      if (!a) return Promise.reject(erroAba(params.range));
      for (let i = f.l0; i < a.linhas.length && i <= f.l1; i++) {
        const l = a.linhas[i];
        for (let j = f.c0; j < l.length && j <= f.c1; j++) l[j] = "";
      }
      return ok({ clearedRange: params.range });
    },
    batchUpdate: (params: P) => {
      for (const d of (params.requestBody?.data ?? []) as { range: string; values: Celula[][] }[]) {
        const f = lerFaixa(d.range);
        const a = aba(params.spreadsheetId, f.aba);
        if (!a) return Promise.reject(erroAba(d.range));
        escrever(a, f, d.values ?? []);
      }
      return ok({ totalUpdatedRows: (params.requestBody?.data ?? []).length });
    },
  };

  const spreadsheets = {
    values,
    get: (params: P) => {
      const p = planilha(params.spreadsheetId);
      for (const t of abasConhecidas(params.spreadsheetId)) aba(params.spreadsheetId, t);
      const sheets = [...p.entries()].map(([title, a], index) => ({
        properties: { title, sheetId: a.id, index, sheetType: "GRID", gridProperties: { rowCount: Math.max(1000, a.linhas.length), columnCount: 52 } },
      }));
      return ok({ spreadsheetId: params.spreadsheetId, properties: { title: "Demo", locale: "pt_BR", timeZone: TZ }, sheets });
    },
    batchUpdate: (params: P) => {
      for (const r of (params.requestBody?.requests ?? []) as { addSheet?: { properties?: { title?: string } } }[]) {
        const t = r.addSheet?.properties?.title;
        if (t) aba(params.spreadsheetId, t, true);
      }
      return ok({ spreadsheetId: params.spreadsheetId, replies: [] });
    },
  };

  return { spreadsheets };
}
