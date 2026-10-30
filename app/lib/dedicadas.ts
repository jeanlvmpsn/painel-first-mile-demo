import { chaveId, chaveRota } from "./hb.ts";
import type { HistoricoPonto, PlanoParada, Visita } from "./monitorD0.ts";
import type { Pontualidade } from "./relatorioTipos.ts";

const texto = (v: unknown) => String(v ?? "").trim();

export const ehNomeDedicada = (rota: string) => /(^|[_\s-])DED([_\s-]|\d|$)/i.test(texto(rota));

export function clusterDoNome(rota: string): string {
  const m = /(?:^|_)C(\d{1,2})(?:_|$)/i.exec(texto(rota));
  return m ? "C" + m[1].padStart(2, "0") : "";
}

export type Dedicada = {
  chave: string;
  cluster: string;

  ids: string[];

  nomes: string[];
  primeiraVez: string;
  ultimaVez: string;

  aliases: string[];
};

export const CAB_DEDICADAS = ["CHAVE", "CLUSTER", "IDS", "NOMES", "PRIMEIRA_VEZ", "ULTIMA_VEZ", "ALIASES"];

export const ehIdDePonto = (id: string) => /\d/.test(id);

const lista = (v: unknown) =>
  texto(v)
    .split(/[\s,;|]+/)
    .map(chaveId)
    .filter((id) => id && ehIdDePonto(id));

function semRepetidas(ds: Dedicada[]): Dedicada[] {
  const saida: Dedicada[] = [];
  const porPontos = new Map<string, Dedicada>();
  const chaves = new Set<string>();
  for (const d of ds) {
    const k = [...new Set(d.ids)].sort().join(" ");
    const igual = porPontos.get(k);
    if (igual) {
      igual.nomes = [...new Set([...igual.nomes, ...d.nomes])].slice(0, 5);
      igual.aliases = [...new Set([...igual.aliases, d.chave, ...d.aliases])].filter((c) => c !== igual.chave);
      if (d.primeiraVez && (!igual.primeiraVez || isoDeBR(d.primeiraVez) < isoDeBR(igual.primeiraVez))) igual.primeiraVez = d.primeiraVez;
      if (d.ultimaVez && isoDeBR(d.ultimaVez) > isoDeBR(igual.ultimaVez || "")) igual.ultimaVez = d.ultimaVez;
      continue;
    }
    const nova = { ...d, ids: [...new Set(d.ids)].sort(), nomes: [...d.nomes], aliases: [...(d.aliases ?? [])] };

    if (chaves.has(nova.chave)) nova.chave = nova.ids.join("+");
    if (chaves.has(nova.chave)) continue;
    chaves.add(nova.chave);
    porPontos.set(k, nova);
    saida.push(nova);
  }
  return saida;
}

export function lerCadastroDedicadas(linhas: string[][]): Dedicada[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const [cChave, cCluster, cIds, cNomes, cPrim, cUlt, cAli] = CAB_DEDICADAS.map(i);
  if (cChave < 0 || cIds < 0) return [];
  return semRepetidas(linhas
    .slice(1)
    .map((l) => ({
      chave: texto(l[cChave]),
      cluster: cCluster >= 0 ? texto(l[cCluster]) : "",
      ids: lista(l[cIds]),
      nomes: cNomes >= 0 ? texto(l[cNomes]).split("|").map(texto).filter(Boolean) : [],
      primeiraVez: cPrim >= 0 ? texto(l[cPrim]) : "",
      ultimaVez: cUlt >= 0 ? texto(l[cUlt]) : "",
      aliases: cAli >= 0 ? texto(l[cAli]).split("|").map(texto).filter(Boolean) : [],
    }))
    .filter((d) => d.chave && d.ids.length));
}

export const linhasCadastroDedicadas = (ds: Dedicada[]): string[][] => [
  CAB_DEDICADAS,
  ...ds.map((d) => [d.chave, d.cluster, d.ids.join(" "), d.nomes.join(" | "), d.primeiraVez, d.ultimaVez, d.aliases.join(" | ")]),
];

function rotasDedDoDia(visitas: Visita[], plano: PlanoParada[]): { rota: string; ids: string[] }[] {
  const porRota = new Map<string, { rota: string; ids: Set<string> }>();
  const somar = (rota: string, id: string) => {
    if (!ehNomeDedicada(rota) || !chaveId(id) || !ehIdDePonto(chaveId(id))) return;
    const k = chaveRota(rota);
    const r = porRota.get(k) ?? { rota: texto(rota), ids: new Set<string>() };
    r.ids.add(chaveId(id));
    porRota.set(k, r);
  };

  for (const p of plano) somar(p.rota, p.idParada);
  const noPlano = new Set(porRota.keys());
  for (const v of visitas) if (!noPlano.has(chaveRota(v.rota))) somar(v.rota, v.idParada);
  return [...porRota.values()].map((r) => ({ rota: r.rota, ids: [...r.ids].sort() }));
}

export type RotaDedHoje = { rota: string; cluster: string; transportadora: string };

export function rotasDedUnicas(visitas: Visita[], plano: PlanoParada[]): RotaDedHoje[] {
  const porNome = new Map<string, RotaDedHoje>();
  const somar = (rota: string, transportadora: string) => {
    if (!ehNomeDedicada(rota)) return;
    const k = chaveRota(rota);
    const r = porNome.get(k) ?? { rota: texto(rota), cluster: clusterDoNome(rota), transportadora: "" };
    if (!r.transportadora && transportadora) r.transportadora = texto(transportadora);
    porNome.set(k, r);
  };
  for (const v of visitas) somar(v.rota, v.transportadora);
  for (const p of plano) somar(p.rota, "");
  return [...porNome.values()].sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR", { numeric: true }));
}

export function atualizarCadastro(cadastro: Dedicada[], visitas: Visita[], plano: PlanoParada[], dataBR: string): Dedicada[] {
  const saida = cadastro.map((d) => ({ ...d, ids: [...d.ids], nomes: [...d.nomes], aliases: [...(d.aliases ?? [])] }));
  const usadas = new Set<Dedicada>();
  const rotas = rotasDedDoDia(visitas, plano).sort((a, b) => b.ids.length - a.ids.length);
  for (const r of rotas) {
    const ids = new Set(r.ids);

    const mesma = [...usadas].find((x) => r.ids.every((id) => x.ids.includes(id)));
    if (mesma) {
      mesma.nomes = [...new Set([...mesma.nomes, r.rota])].slice(0, 5);
      continue;
    }
    let d: Dedicada | undefined;
    let comuns = 0;
    for (const x of saida) {
      if (usadas.has(x)) continue;
      const n = x.ids.filter((id) => ids.has(id)).length;
      if (n > comuns || (n === comuns && n > 0 && x.cluster === clusterDoNome(r.rota))) {
        d = x;
        comuns = n;
      }
    }
    if (d && comuns * 2 < Math.min(r.ids.length, d.ids.length)) d = undefined;
    if (d) {
      usadas.add(d);
      d.ids = r.ids;
      d.nomes = [r.rota, ...d.nomes.filter((n) => chaveRota(n) !== chaveRota(r.rota))].slice(0, 5);
      d.cluster = clusterDoNome(r.rota) || d.cluster;
      d.ultimaVez = dataBR;
    } else {
      const nova = {
        chave: r.ids.join("+"),
        cluster: clusterDoNome(r.rota),
        ids: r.ids,
        nomes: [r.rota],
        primeiraVez: dataBR,
        ultimaVez: dataBR,
        aliases: [] as string[],
      };
      usadas.add(nova);
      saida.push(nova);
    }
  }

  const final = saida.filter((x) => {
    if (usadas.has(x)) return true;

    const dona = [...usadas].find(
      (u) => x.ids.every((id) => u.ids.includes(id)) || u.ids.every((id) => x.ids.includes(id)),
    );
    if (!dona) return true;
    dona.aliases = [...new Set([...dona.aliases, x.chave, ...x.aliases])].filter((c) => c !== dona.chave);
    dona.nomes = [...new Set([...dona.nomes, ...x.nomes])].slice(0, 5);
    if (x.primeiraVez && (!dona.primeiraVez || isoDeBR(x.primeiraVez) < isoDeBR(dona.primeiraVez))) dona.primeiraVez = x.primeiraVez;
    return false;
  });
  return semRepetidas(final);
}

export type StatusDedicada = "completa" | "parcial" | "ns" | "aguardando" | "semRota";

export type RotaDaDedicada = {
  rota: string;
  rotaId: string;
  transportadora: string;
  ehDedicada: boolean;

  soNoPlano: boolean;
  janela: string;
  hora: string;
  pontualidade: Pontualidade | null;
  coletados: number;
};

export type PontoDaDedicada = {
  id: string;
  nome: string;
  estimados: number;
  coletados: number;
  motivos: string[];
  visitado: boolean;
  hist: HistoricoPonto | null;
};

export type Hist30 = {
  estimados: number;
  coletados: number;

  diasComPerda: number;
  dias: number;
  ultimaPerda: string;
  incidentePrincipal: string;
};

export type DiaDedicada = {
  chave: string;
  aliases: string[];
  cluster: string;

  apelido: string;

  formsFeito: boolean;
  nome: string;
  nomesAnteriores: string[];
  rotaId: string;
  transportadora: string;
  rotas: RotaDaDedicada[];
  pontos: PontoDaDedicada[];
  estimados: number;
  coletados: number;
  naoColetados: number;

  pu: number | null;
  status: StatusDedicada;
  janela: string;
  hora: string;
  pontualidade: Pontualidade | null;
  motivos: string[];
  hist30: Hist30 | null;
  primeiraVez: string;
};

const TOLERANCIA_NS_MIN = 30;

function somaHist(hs: HistoricoPonto[]): Hist30 | null {
  if (!hs.length) return null;
  const pior = hs.slice().sort((a, b) => b.naoColetados - a.naoColetados)[0];
  return {
    estimados: hs.reduce((s, h) => s + h.estimados, 0),
    coletados: hs.reduce((s, h) => s + h.coletados, 0),
    diasComPerda: Math.max(...hs.map((h) => h.diasComPerda)),
    dias: Math.max(...hs.map((h) => h.dias)),
    ultimaPerda: hs.map((h) => h.ultimaPerda).filter(Boolean).sort().pop() ?? "",
    incidentePrincipal: pior.naoColetados > 0 ? [pior.culpaPrincipal, pior.incidentePrincipal].filter(Boolean).join(" ") : "",
  };
}

export function dedicadasDoDia(
  cadastro: Dedicada[],
  visitas: Visita[],
  plano: PlanoParada[],
  historico: Record<string, HistoricoPonto>,
  agoraMin: number | null,

  dataBR?: string,
): DiaDedicada[] {
  const histPorId = new Map(Object.entries(historico).map(([k, h]) => [chaveId(k), h]));
  return cadastro.map((d): DiaDedicada => {
    const ids = new Set(d.ids);
    const rodouHoje = !dataBR || d.ultimaVez === dataBR;
    const doDia = rodouHoje ? visitas.filter((v) => ids.has(chaveId(v.idParada))) : [];
    const noRelatorio = new Set(doDia.map((v) => chaveRota(v.rota)));
    const planoDela = rodouHoje ? plano.filter((p) => ids.has(chaveId(p.idParada)) && !noRelatorio.has(chaveRota(p.rota))) : [];

    const porRota = new Map<string, RotaDaDedicada>();
    for (const v of doDia) {
      const k = v.rotaId || chaveRota(v.rota);
      const r = porRota.get(k) ?? {
        rota: v.rota,
        rotaId: v.rotaId,
        transportadora: v.transportadora,
        ehDedicada: ehNomeDedicada(v.rota),
        soNoPlano: false,
        janela: v.janela,
        hora: "",
        pontualidade: null,
        coletados: 0,
      };
      r.coletados += v.coletados;
      if (v.visitada && v.hora && v.hora > r.hora) r.hora = v.hora;
      if (!r.pontualidade && v.pontualidade) r.pontualidade = v.pontualidade;
      porRota.set(k, r);
    }
    for (const p of planoDela) {
      const k = chaveRota(p.rota);
      if (porRota.has(k)) continue;
      porRota.set(k, {
        rota: p.rota,
        rotaId: "",
        transportadora: "",
        ehDedicada: ehNomeDedicada(p.rota),
        soNoPlano: true,
        janela: p.inicio ? "início " + p.inicio : "",
        hora: "",
        pontualidade: null,
        coletados: 0,
      });
    }

    const pontosDaRota = (r: RotaDaDedicada) =>
      new Set(doDia.filter((v) => (v.rotaId || chaveRota(v.rota)) === (r.rotaId || chaveRota(r.rota))).map((v) => chaveId(v.idParada))).size ||
      planoDela.filter((p) => chaveRota(p.rota) === chaveRota(r.rota)).length;
    const rotas = [...porRota.values()].sort(
      (a, b) =>
        Number(b.ehDedicada) - Number(a.ehDedicada) ||
        pontosDaRota(b) - pontosDaRota(a) ||
        Number(clusterDoNome(b.rota) === d.cluster) - Number(clusterDoNome(a.rota) === d.cluster) ||
        a.rota.localeCompare(b.rota),
    );
    const principal = rotas.find((r) => r.ehDedicada) ?? rotas[0];

    const pontos: PontoDaDedicada[] = d.ids.map((id) => {
      const vs = doDia.filter((v) => chaveId(v.idParada) === id);
      const estimados = Math.max(0, ...vs.map((v) => v.estimados));
      return {
        id,
        nome: vs.find((v) => v.nomeParada)?.nomeParada ?? "",
        estimados,
        coletados: Math.min(estimados, vs.reduce((s, v) => s + v.coletados, 0)),
        motivos: [...new Set(vs.map((v) => v.motivo).filter(Boolean))],
        visitado: vs.some((v) => v.visitada),
        hist: histPorId.get(id) ?? null,
      };
    });
    const estimados = pontos.reduce((s, p) => s + p.estimados, 0);
    const coletados = pontos.reduce((s, p) => s + p.coletados, 0);
    const visitada = doDia.some((v) => v.visitada);
    const janelaPassou = doDia.some(
      (v) => !v.visitada && agoraMin !== null && v.janelaFimMin !== null && agoraMin > v.janelaFimMin + TOLERANCIA_NS_MIN,
    );
    const status: StatusDedicada = !rotas.length
      ? "semRota"
      : !visitada
        ? janelaPassou
          ? "ns"
          : "aguardando"
        : coletados >= estimados
          ? "completa"
          : "parcial";
    const visitadas = doDia.filter((v) => v.visitada);
    return {
      chave: d.chave,
      aliases: d.aliases ?? [],
      apelido: "",
      formsFeito: false,
      cluster: d.cluster || clusterDoNome(principal?.rota ?? ""),
      nome: principal?.ehDedicada ? principal.rota : d.nomes[0] ?? principal?.rota ?? "",
      nomesAnteriores: d.nomes.filter((n) => chaveRota(n) !== chaveRota(principal?.rota ?? "")),
      rotaId: principal?.rotaId ?? "",
      transportadora: principal?.transportadora ?? "",
      rotas,
      pontos,
      estimados,
      coletados,
      naoColetados: Math.max(0, estimados - coletados),
      pu: estimados > 0 ? coletados / estimados : null,
      status,
      janela: principal?.janela ?? "",
      hora: visitadas.map((v) => v.hora).filter(Boolean).sort().pop() ?? "",
      pontualidade: principal?.pontualidade ?? null,
      motivos: [...new Set(visitadas.map((v) => v.motivo).filter(Boolean))],
      hist30: somaHist(pontos.map((p) => p.hist).filter((h): h is HistoricoPonto => !!h)),
      primeiraVez: d.primeiraVez,
    };
  });
}

export const CAB_DEDICADAS_HIST = [
  "DATA", "CHAVE", "CLUSTER", "ROTA", "ROTA_ID", "TRANSPORTADORA", "IDS", "ESTIMADOS", "COLETADOS", "PU", "STATUS",
  "HORA_COLETA", "PONTUALIDADE", "OCS", "GRAVADO_EM", "CARROS",
];

export type CarroDia = {
  rota: string;
  rotaId: string;
  janela: string;
  hora: string;

  coletados: number;

  ded: boolean;

  passou: boolean;
};

export function carrosDaDedicada(d: Pick<DiaDedicada, "rotas">): CarroDia[] {
  return d.rotas.map((r) => ({
    rota: r.rota,
    rotaId: r.rotaId,
    janela: r.janela,
    hora: r.hora,
    coletados: r.coletados,
    ded: r.ehDedicada,
    passou: !!r.hora || r.coletados > 0,
  }));
}

const textoCarros = (cs: CarroDia[]) =>
  cs
    .filter((c) => c.passou)
    .map((c) => [c.rota, c.rotaId, c.janela, c.hora, c.coletados, c.ded ? 1 : 0].map((v) => String(v).replace(/[|;]/g, " ")).join("|"))
    .join(" ; ");

export function lerCarros(v: unknown): CarroDia[] {
  return texto(v)
    .split(";")
    .map((t) => t.split("|").map(texto))
    .filter((p) => p.length >= 6 && (p[0] || p[1]))
    .map(([rota, rotaId, janela, hora, coletados, ded]) => ({
      rota,
      rotaId,
      janela,
      hora,
      coletados: Number(coletados) || 0,
      ded: ded === "1",
      passou: true,
    }));
}

export function mediaPorCarro(serie: Pick<DiaSerie, "fonte" | "carros">[]): { media: number; carros: number; dias: number } | null {
  let soma = 0;
  let carros = 0;
  let dias = 0;
  for (const d of serie) {
    if (d.fonte === "hoje" || !d.carros?.length) continue;
    const passaram = d.carros.filter((c) => c.passou);
    const conta = passaram.some((c) => c.ded) ? passaram.filter((c) => c.ded) : passaram;
    if (!conta.length) continue;
    soma += conta.reduce((s, c) => s + c.coletados, 0);
    carros += conta.length;
    dias++;
  }
  return carros ? { media: Math.round(soma / carros), carros, dias } : null;
}

export function linhasHistDedicadas(dias: DiaDedicada[], dataBR: string, gravadoEm: string): (string | number)[][] {
  return dias
    .filter((d) => d.status !== "semRota")
    .map((d) => [
      dataBR, d.chave, d.cluster, d.nome, d.rotaId, d.transportadora, d.pontos.map((p) => p.id).join(" "),
      d.estimados, d.coletados, d.pu === null ? "" : Number(d.pu.toFixed(4)), d.status, d.hora, d.pontualidade ?? "",
      d.motivos.join(" | "), gravadoEm, textoCarros(carrosDaDedicada(d)),
    ]);
}

export type DiaHistorico = {
  data: string;
  estimados: number;
  coletados: number;
  pu: number | null;
  status: StatusDedicada;
  rota: string;
  ids: string[];

  carros: CarroDia[];
};

export function lerHistDedicadas(linhas: string[][]): Map<string, DiaHistorico[]> {
  const mapa = new Map<string, DiaHistorico[]>();
  if (linhas.length < 2) return mapa;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = { data: i("DATA"), chave: i("CHAVE"), est: i("ESTIMADOS"), col: i("COLETADOS"), pu: i("PU"), status: i("STATUS"), rota: i("ROTA"), ids: i("IDS"), carros: i("CARROS") };
  if (c.data < 0 || c.chave < 0) return mapa;
  const n = (v: unknown) => Number(texto(v).replace(",", ".")) || 0;
  const iso = (br: string) => br.split("/").reverse().join("-");
  for (const l of linhas.slice(1)) {
    const k = texto(l[c.chave]);
    if (!k) continue;
    const pu = texto(l[c.pu]);
    mapa.set(k, [
      ...(mapa.get(k) ?? []),
      {
        data: texto(l[c.data]),
        estimados: n(l[c.est]),
        coletados: n(l[c.col]),
        pu: pu ? n(pu) : null,
        status: (texto(l[c.status]) || "parcial") as StatusDedicada,
        rota: texto(l[c.rota]),
        ids: c.ids >= 0 ? lista(l[c.ids]) : [],
        carros: c.carros >= 0 ? lerCarros(l[c.carros]) : [],
      },
    ]);
  }

  for (const [k, dias] of mapa) {
    const porDia = new Map(dias.map((d) => [iso(d.data), d]));
    mapa.set(k, [...porDia.values()].sort((a, b) => iso(a.data).localeCompare(iso(b.data))));
  }
  return mapa;
}

export type LinhaBaseDedicada = { dia: string; ponto: string; estimados: number; coletados: number };

export function lerBaseDedicadas(linhas: string[][]): LinhaBaseDedicada[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const [iDia, iPonto, iEst, iCol] = ["DIA", "PONTO", "ESTIMADOS", "COLETADOS"].map((n) => cab.indexOf(n));
  if (iDia < 0 || iPonto < 0) return [];
  const n = (v: unknown) => Number(texto(v).replace(",", ".")) || 0;
  return linhas
    .slice(1)
    .map((l) => ({ dia: texto(l[iDia]).slice(0, 10), ponto: chaveId(l[iPonto]), estimados: n(l[iEst]), coletados: n(l[iCol]) }))
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.dia) && l.ponto);
}

export type DiaSerie = {
  dia: string;
  estimados: number;
  coletados: number;
  naoColetados: number;

  rota: string;

  fonte: "base" | "painel" | "hoje";

  carros: CarroDia[] | null;
};

const isoDeBR = (br: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(texto(br));
  return m ? m[3] + "-" + m[2] + "-" + m[1] : texto(br).slice(0, 10);
};

export function serieDosPontos(
  ids: string[],
  base: LinhaBaseDedicada[],
  gravados: DiaHistorico[],
  hoje: {
    dataBR: string;
    porPonto: Record<string, { estimados: number; coletados: number }>;
    rotas: string[];
    carros?: CarroDia[];
  } | null,
): DiaSerie[] {
  const pontos = new Set(ids.map(chaveId));
  const porDia = new Map<string, DiaSerie>();
  for (const l of base) {
    if (!pontos.has(l.ponto)) continue;
    const d = porDia.get(l.dia) ?? { dia: l.dia, estimados: 0, coletados: 0, naoColetados: 0, rota: "", fonte: "base" as const, carros: null };
    d.estimados += l.estimados;
    d.coletados += l.coletados;
    d.naoColetados = Math.max(0, d.estimados - d.coletados);
    porDia.set(l.dia, d);
  }
  const nomes = new Map<string, Set<string>>();

  const carros = new Map<string, Map<string, CarroDia>>();
  const juntarCarros = (dia: string, cs: CarroDia[]) => {
    const m = carros.get(dia) ?? new Map<string, CarroDia>();
    for (const c of cs) {
      const k = c.rotaId || chaveRota(c.rota);
      if (!m.has(k)) m.set(k, c);
    }
    carros.set(dia, m);
  };
  const soGravado = new Map<string, DiaSerie>();
  for (const g of gravados) {
    if (!g.ids.some((id) => pontos.has(id))) continue;
    const dia = isoDeBR(g.data);
    if (g.rota) nomes.set(dia, (nomes.get(dia) ?? new Set()).add(g.rota));
    if (g.carros?.length) juntarCarros(dia, g.carros);
    if (porDia.has(dia) || !g.ids.every((id) => pontos.has(id))) continue;
    const d = soGravado.get(dia) ?? { dia, estimados: 0, coletados: 0, naoColetados: 0, rota: "", fonte: "painel" as const, carros: null };
    d.estimados += g.estimados;
    d.coletados += g.coletados;
    d.naoColetados = Math.max(0, d.estimados - d.coletados);
    soGravado.set(dia, d);
  }
  for (const [dia, d] of soGravado) porDia.set(dia, d);
  if (hoje) {
    const dia = isoDeBR(hoje.dataBR);
    let estimados = 0;
    let coletados = 0;
    for (const id of pontos) {
      estimados += hoje.porPonto[id]?.estimados ?? 0;
      coletados += hoje.porPonto[id]?.coletados ?? 0;
    }
    if (estimados > 0) {
      porDia.set(dia, { dia, estimados, coletados, naoColetados: Math.max(0, estimados - coletados), rota: "", fonte: "hoje", carros: null });
      if (hoje.rotas.length) nomes.set(dia, new Set(hoje.rotas));
      if (hoje.carros?.length) {
        carros.delete(dia);
        juntarCarros(dia, hoje.carros);
      }
    }
  }
  for (const [dia, ns] of nomes) {
    const d = porDia.get(dia);
    if (d) d.rota = [...ns].join(", ");
  }
  for (const [dia, m] of carros) {
    const d = porDia.get(dia);
    if (d) d.carros = [...m.values()].sort((a, b) => (a.janela || a.hora).localeCompare(b.janela || b.hora) || a.rota.localeCompare(b.rota));
  }
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

export const CAB_NOMES_DEDICADAS = ["CHAVE", "IDS", "APELIDO", "AUTOR", "ATUALIZADO_EM"];

export function lerNomesDedicadas(linhas: string[][]): { porChave: Map<string, string>; porPontos: Map<string, string> } {
  const porChave = new Map<string, string>();
  const porPontos = new Map<string, string>();
  if (linhas.length < 2) return { porChave, porPontos };
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const [iChave, iIds, iApelido] = ["CHAVE", "IDS", "APELIDO"].map((n) => cab.indexOf(n));
  if (iChave < 0 || iApelido < 0) return { porChave, porPontos };
  for (const l of linhas.slice(1)) {
    const apelido = texto(l[iApelido]);
    const chave = texto(l[iChave]);
    if (chave) porChave.set(chave, apelido);
    const pontos = iIds >= 0 ? [...new Set(lista(l[iIds]))].sort().join(" ") : "";
    if (pontos) porPontos.set(pontos, apelido);
  }
  return { porChave, porPontos };
}

export function apelidoDa(
  d: { chave: string; aliases?: string[]; pontos: { id: string }[] },
  nomes: ReturnType<typeof lerNomesDedicadas>,
): string {
  if (nomes.porChave.has(d.chave)) return nomes.porChave.get(d.chave) ?? "";

  for (const a of d.aliases ?? []) if (nomes.porChave.get(a)) return nomes.porChave.get(a) ?? "";
  return nomes.porPontos.get([...new Set(d.pontos.map((p) => p.id))].sort().join(" ")) ?? "";
}

export const tituloDaDedicada = (d: Pick<DiaDedicada, "apelido" | "pontos" | "cluster" | "nome">) => {
  if (d.apelido) return d.apelido;
  const principal = d.pontos.slice().sort((a, b) => b.estimados - a.estimados)[0];
  return "DED " + (d.cluster ? d.cluster + " · " : "") + (principal?.nome || principal?.id || d.nome);
};
