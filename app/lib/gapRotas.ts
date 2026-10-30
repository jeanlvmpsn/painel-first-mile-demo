import type { RotaPlanejada } from "./atribuicaoUtils.ts";
import { chaveId, chaveRota } from "./hb.ts";
import { numeroReport } from "./relatorioTipos.ts";

export const MINIMO_GAP = 100;

export type ParadaPlanejada = { rota: string; idParada: string; nome?: string; pacotes?: number | null };

export const ehTransportadoraFake = (tp: string) =>
  /a\s*definir/i.test(
    String(tp ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );

export type AcaoGap = "incluir" | "excluir" | "auto";

export type AjusteGap = {
  rota: string;

  idParada: string;
  acao: AcaoGap;
  autor: string;
  registradoEm: string;
};

export type PontoGap = {
  id: string;
  nome: string;

  pacotes: number | null;

  destaque: boolean;

  noPlano: boolean;
  ajuste: AjusteGap | null;
  noReport: boolean;
};

export type RotaGap = {
  rota: string;
  transportadora: string;
  start: string;

  automatica: boolean;
  ajuste: AjusteGap | null;
  noReport: boolean;
  pontos: PontoGap[];
};

export type ResultadoGap = {
  rotas: RotaGap[];
  tiradas: RotaGap[];

  outras: { rota: string; transportadora: string }[];
};

export const CAB_AJUSTES_GAP = ["DATA", "ROTA", "ID_PARADA", "ACAO", "AUTOR", "REGISTRADO_EM"] as const;

const texto = (v: unknown) => String(v ?? "").trim();
const chaveAjuste = (rota: string, id: string) => chaveRota(rota) + "|" + chaveId(id);

export function lerAjustesGap(linhas: string[][], dataBR: string): Map<string, AjusteGap> {
  const saida = new Map<string, AjusteGap>();
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = { data: i("DATA"), rota: i("ROTA"), id: i("ID_PARADA"), acao: i("ACAO"), autor: i("AUTOR"), em: i("REGISTRADO_EM") };
  if (c.data < 0 || c.rota < 0 || c.acao < 0) return saida;
  for (const l of linhas.slice(1)) {
    if (texto(l[c.data]) !== dataBR) continue;
    const rota = texto(l[c.rota]);
    const acao = texto(l[c.acao]).toLowerCase();
    if (!rota || (acao !== "incluir" && acao !== "excluir" && acao !== "auto")) continue;
    const idParada = c.id >= 0 ? texto(l[c.id]) : "";
    saida.set(chaveAjuste(rota, idParada), {
      rota,
      idParada,
      acao,
      autor: c.autor >= 0 ? texto(l[c.autor]) : "",
      registradoEm: c.em >= 0 ? texto(l[c.em]) : "",
    });
  }
  return saida;
}

export function linhaAjusteGap(dataBR: string, a: Omit<AjusteGap, "registradoEm">, registradoEm: string): string[] {
  return [dataBR, a.rota, a.idParada, a.acao, a.autor, registradoEm];
}

const valido = (a: AjusteGap | undefined) => (a && a.acao !== "auto" ? a : null);

export function montarGap(e: {
  rotas: RotaPlanejada[];

  paradas: ParadaPlanejada[];
  ajustes: Map<string, AjusteGap>;
}): ResultadoGap {
  const paradasPorRota = new Map<string, Map<string, { nome: string; pacotes: number | null }>>();
  const nomes = new Map<string, string>();
  for (const p of e.paradas) {
    const k = chaveRota(p.rota);
    const id = chaveId(p.idParada);
    if (!k || !id) continue;
    const nome = texto(p.nome);
    if (nome && !nomes.has(id)) nomes.set(id, nome);
    const daRota = paradasPorRota.get(k) ?? new Map<string, { nome: string; pacotes: number | null }>();
    const antes = daRota.get(id);
    const pac = p.pacotes ?? null;
    daRota.set(id, {
      nome: antes?.nome || nome,
      pacotes: antes ? (antes.pacotes === null && pac === null ? null : (antes.pacotes ?? 0) + (pac ?? 0)) : pac,
    });
    paradasPorRota.set(k, daRota);
  }

  const incluidas = new Map<string, string[]>();
  for (const a of e.ajustes.values()) {
    if (!a.idParada || a.acao !== "incluir") continue;
    const k = chaveRota(a.rota);
    incluidas.set(k, [...(incluidas.get(k) ?? []), chaveId(a.idParada)]);
  }

  const ponto = (rota: string, id: string, plano: { nome: string; pacotes: number | null } | undefined): PontoGap => {
    const pacotes = plano ? plano.pacotes : null;
    const destaque = pacotes !== null && pacotes >= MINIMO_GAP;
    const ajuste = valido(e.ajustes.get(chaveAjuste(rota, id)));
    return {
      id,
      nome: plano?.nome || nomes.get(id) || id,
      pacotes,
      destaque,
      noPlano: !!plano,
      ajuste,
      noReport: ajuste ? ajuste.acao === "incluir" : destaque,
    };
  };

  const vistas = new Set<string>();
  const todas: RotaGap[] = [];
  for (const r of e.rotas) {
    const k = chaveRota(r.rota);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    const transportadora = texto(r.transportadora);
    const automatica = !transportadora || ehTransportadoraFake(transportadora);
    const ajuste = valido(e.ajustes.get(chaveAjuste(r.rota, "")));
    const doPlano = paradasPorRota.get(k) ?? new Map<string, { nome: string; pacotes: number | null }>();
    const extras = [...new Set(incluidas.get(k) ?? [])].filter((id) => !doPlano.has(id));
    const pontos = [...[...doPlano].map(([id, pl]) => ponto(r.rota, id, pl)), ...extras.map((id) => ponto(r.rota, id, undefined))]
      // Maior planejado primeiro: e a ordem de prioridade da acao.
      .sort((a, b) => (b.pacotes ?? -1) - (a.pacotes ?? -1) || a.nome.localeCompare(b.nome, "pt-BR"));
    todas.push({
      rota: texto(r.rota),
      transportadora,
      start: texto(r.start),
      automatica,
      ajuste,
      noReport: ajuste ? ajuste.acao === "incluir" : automatica,
      pontos,
    });
  }
  const porNome = (a: RotaGap, b: RotaGap) => a.rota.localeCompare(b.rota, "pt-BR", { numeric: true });
  return {
    rotas: todas.filter((r) => r.noReport).sort(porNome),
    tiradas: todas.filter((r) => !r.noReport && r.automatica).sort(porNome),
    outras: todas
      .filter((r) => !r.noReport && !r.automatica)
      .sort(porNome)
      .map((r) => ({ rota: r.rota, transportadora: r.transportadora })),
  };
}

const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

export function linhaPontoGap(p: PontoGap): string {
  const quem = p.nome && p.nome !== p.id ? p.nome + " - " + p.id : p.id;
  if (p.pacotes === null) return quem;
  return quem + " - " + int(p.pacotes) + " pcts";
}

export function textoGap(rotas: RotaGap[], dataBR: string): string {
  const [dia, mes] = String(dataBR ?? "").split("/");
  const blocos = rotas.map((r) => {
    const noReport = r.pontos.filter((p) => p.noReport);
    return [
      "*" + r.rota + "* - " + (r.transportadora || "Sem transportadora") +
        " (" + numeroReport(noReport.length) + " de " + numeroReport(r.pontos.length) + " paradas)",
      ...(noReport.length
        ? noReport.map(linhaPontoGap)
        : [r.pontos.some((p) => p.noPlano && p.pacotes !== null) ? "Nenhuma parada com " + MINIMO_GAP + "+ pcts planejados" : "Rota sem paradas na config do dia"]),
    ];
  });
  return [
    "*GAP de Rotas - " + dia + "/" + mes + "*",
    "*Rotas em aberto:* " + numeroReport(rotas.length),
    ...blocos.flatMap((b) => ["", ...b]),
  ].join("\n");
}

export type DadosGap = {
  dataBR: string;
  hojeBR: string;
  resultado: ResultadoGap;

  rotasDoDia: number;

  rotasNaConfig: number;

  fonteConfig: string;
  avisos: string[];
};
