import { chaveId, chaveRota, mapaDePontos, paradasPlanejadas, rotasDoDia } from "./hb.ts";
import { lerMonitoring, totalColetado, totalEstimado, totalPreparado } from "./monitoringSeller.ts";
import { ehLinhaDoCd } from "./relatorioColeta.ts";
import { classificarPontualidade, type OfensorSemReversao, type Pontualidade } from "./relatorioTipos.ts";

export type Culpa = "ME" | "SELLER" | "PLACE";

export type CulpaPrevia = {
  culpa: Culpa | null;
  categoria: string;
  incidente: string;
};

export type Visita = {
  rota: string;
  rotaId: string;
  rotaSemNome: boolean;
  transportadora: string;
  idParada: string;
  nomeParada: string;
  ehPlace: boolean;
  estimados: number;
  preparados: number;
  coletados: number;
  naoPreparados: number;
  naoCabem: number;
  motivo: string;
  pontualidade: Pontualidade | null;

  hora: string;

  janela: string;
  janelaFimMin: number | null;
  foraDeArea: boolean;
  handshake: "agree" | "disagree" | "";
  planejado: string;

  visitada: boolean;
};

const chave = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

const texto = (v: unknown) => String(v ?? "").trim();

function numero(v: unknown): number {
  const s = texto(v);
  if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function sim(v: unknown): boolean {
  return ["SIM", "S", "TRUE", "1", "YES", "Y", "SI"].includes(chave(v));
}

function dataBR(v: unknown): string {
  const s = texto(v);
  let m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function horaDe(...vs: unknown[]): string {
  for (const v of vs) {
    const m = texto(v).match(/(\d{1,2}):(\d{2})/);
    if (m) return m[1].padStart(2, "0") + ":" + m[2];
  }
  return "";
}

export function fimDaJanela(janela: string): number | null {
  const horas = [...String(janela ?? "").matchAll(/(\d{1,2}):(\d{2})/g)];
  const ult = horas[horas.length - 1];
  return ult ? Number(ult[1]) * 60 + Number(ult[2]) : null;
}

export function lerVisitas(linhas: string[][], dataPedidaBR: string): Visita[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map(chave);
  const col = (...nomes: string[]) => cab.findIndex((c) => nomes.some((n) => c === n || c.startsWith(n)));
  const i = {
    data: col("DATADAROTA"),
    rotaId: col("IDDOROTA", "IDDAROTA", "IDROTA"),
    rota: col("NOMEDAROTA"),
    idParada: col("IDDEPARADA", "IDPARADA"),
    parada: cab.findIndex((c) => c === "PARADA"),
    tipo: col("TIPODEPARADA"),
    est: col("PACOTESESTIMADOS"),
    prep: col("PACOTESPREPARADOS"),
    col: col("PACOTESCOLETADOS"),
    naoPrep: col("PACOTESNAOPREPARADOS"),
    naoCabem: col("PACOTESNAOCABEM"),
    motivo: cab.findIndex((c) => c === "MOTIVO" || c === "MOTIVOS"),
    fora: col("FORADEAREA"),
    plan: col("PLANEJADO"),
    pont: col("PONTUALIDADE"),
    transp: col("TRANSPORTADORA"),
    hora: col("HORADECOLETACONCLUIDA"),
    hs: col("CONFORMIDADEHANDSHAKE", "CONFORMIDADE"),
    janela: col("HORARIOS"),
  };
  if (i.idParada < 0 || (i.rota < 0 && i.rotaId < 0)) return [];
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const saida: Visita[] = [];
  for (const l of linhas.slice(1)) {
    if (ehLinhaDoCd(l, i.idParada)) continue;
    if (i.data >= 0 && dataBR(l[i.data]) !== dataPedidaBR) continue;
    const idParada = v(l, i.idParada);
    const nome = v(l, i.rota);
    const rotaId = v(l, i.rotaId);
    if (!idParada || (!nome && !rotaId)) continue;
    const motivo = v(l, i.motivo);
    const pontTexto = v(l, i.pont);
    const coletados = numero(v(l, i.col));
    const horaConcluida = v(l, i.hora);
    const hs = chave(v(l, i.hs));
    const tipo = chave(v(l, i.tipo));
    saida.push({
      rota: nome || rotaId,
      rotaId,
      rotaSemNome: !nome,
      transportadora: v(l, i.transp),
      idParada,
      nomeParada: v(l, i.parada),

      ehPlace: tipo ? tipo.includes("AGENC") || tipo.includes("PLACE") : idParada.includes("_"),
      estimados: numero(v(l, i.est)),
      preparados: numero(v(l, i.prep)),
      coletados,
      naoPreparados: numero(v(l, i.naoPrep)),
      naoCabem: numero(v(l, i.naoCabem)),
      motivo,
      pontualidade: classificarPontualidade(pontTexto),
      hora: horaDe(horaConcluida, pontTexto),
      janela: v(l, i.janela),
      janelaFimMin: fimDaJanela(v(l, i.janela)),
      foraDeArea: sim(v(l, i.fora)),
      handshake: hs.startsWith("AGREE") ? "agree" : hs.startsWith("DISAGREE") ? "disagree" : "",
      planejado: v(l, i.plan),
      visitada: !!(horaConcluida || motivo || pontTexto || coletados > 0),
    });
  }
  return saida;
}

export const deixados = (v: Visita) => Math.max(0, v.estimados - v.coletados);

const m = (v: Visita) => chave(v.motivo);
const tem = (v: Visita, ...trechos: string[]) => trechos.some((t) => m(v).includes(t));

export function culpaPrevia(v: Visita): CulpaPrevia | null {
  if (!deixados(v)) return null;
  const c = culpaPelaOcorrencia(v);
  if (c && v.handshake === "disagree" && (c.culpa === "SELLER" || c.culpa === "PLACE")) {
    return { ...c, incidente: c.incidente + " · contestado no handshake" };
  }
  return c;
}

export const ocDependeDeHandshake = (v: Visita) =>
  tem(v, "AGENCIA", "PREPARADOS", "PARCIAL", "NAOHAPACOTES", "MAUESTADO") || v.naoPreparados > 0;

function culpaPelaOcorrencia(v: Visita): CulpaPrevia | null {
  if (!v.visitada || (!deixados(v) && !v.motivo)) return null;
  const noHorario = v.pontualidade === "onTime" && !v.foraDeArea;
  const cedo = v.pontualidade === "early";
  const hs = v.handshake !== "";
  const doPonto: Culpa = v.ehPlace ? "PLACE" : "SELLER";
  const me = (categoria: string, incidente: string): CulpaPrevia => ({ culpa: "ME", categoria, incidente });

  if (tem(v, "ACIMADOPESO")) return me("1. NS capacidad", "1.2 Vehículo sobrepeso");
  if (tem(v, "FRAGIL")) return me("1. NS capacidad", "1.3 Vehículo bultos frágil");
  if (tem(v, "ESPACO")) return me("1. NS capacidad", "1.1 Vehículo sin espacio");
  if (v.naoCabem > 0) return me("7. Colecta Parcial", "7.2 No entran en el vehículo");
  if (tem(v, "MECANICO")) return me("2. NS Driver", "2.1 Problema mecánico");
  if (tem(v, "CONTINUARDIRIGINDO")) return me("2. NS Driver", "2.2 No puedo seguir conduciendo");
  if (tem(v, "NAOPASSEI")) return me("2. NS Driver", "2.3 No pasé por el domicilio");
  if (tem(v, "ACIDENTE", "ROUBARAM")) return me("2. NS Driver", "2.4 Otros");
  if (tem(v, "CANCELADA")) return me("3. NS Carrier", "3.2 Ruta cancelada");
  if (tem(v, "INACESSIVEL")) return me("10. Zona inaccesible", "10.1 Zona inaccesible");
  if (tem(v, "INCORRETO")) return me("11. Dirección incorrecta", "11.2 Dirección nueva");
  if (tem(v, "FECHADO")) {
    if (v.foraDeArea) return me("5. Local Cerrado", "5.2 Pickup fuera de geo");
    if (!noHorario) return me("5. Local Cerrado", "5.1 Pickup not on time");
    return v.ehPlace
      ? { culpa: "PLACE", categoria: "5. Local Cerrado", incidente: "5.4 Local Cerrado on time, dentro geo Place" }
      : { culpa: "SELLER", categoria: "5. Local Cerrado", incidente: "5.3 Local Cerrado on time, dentro geo Seller" };
  }
  if (tem(v, "CODIGO")) {
    return v.foraDeArea
      ? me("8. El vendedor no tiene el código de autorización", "8.2 Código fuera de geo")
      : { culpa: "SELLER", categoria: "8. El vendedor no tiene el código de autorización", incidente: "8.1 El vendedor no tiene el código de autorización" };
  }
  if (tem(v, "MAUESTADO")) {
    return v.coletados === 0 && noHorario && hs
      ? { culpa: "SELLER", categoria: "12. Paquetes o etiquetas están en mal estado", incidente: "12.6 Paquetes o etiquetas están en mal estado On time con HS" }
      : { culpa: "SELLER", categoria: "7. Colecta Parcial", incidente: "7.1 Paquete o etiqueta en mal estado" };
  }
  if (tem(v, "AGENCIA")) {
    if (cedo) return me("7. Colecta Parcial", "7.6 No están en la agencia colecta early");
    return v.coletados > 0
      ? { culpa: "PLACE", categoria: "7. Colecta Parcial", incidente: "7.4 No están en la agencia" }
      : { culpa: "PLACE", categoria: "13. No están en la agencia", incidente: "13.1 No están en la agencia" };
  }
  if (tem(v, "NAOHAPACOTES")) {
    if (cedo) return me("4. Sin Paquetes", "4.4 Pickup Early");
    return v.ehPlace
      ? { culpa: "PLACE", categoria: "4. Sin Paquetes", incidente: "4.11 Not delivered by place" }
      : { culpa: "SELLER", categoria: "4. Sin Paquetes", incidente: "4.10 Not delivered by seller" };
  }

  if (tem(v, "PREPARADOS", "PARCIAL") || v.naoPreparados > 0) {
    if (v.coletados === 0) {
      if (cedo) return me("4. Sin Paquetes", "4.4 Pickup Early");
      return v.ehPlace
        ? { culpa: "PLACE", categoria: "4. Sin Paquetes", incidente: "4.11 Not delivered by place" }
        : { culpa: "SELLER", categoria: "4. Sin Paquetes", incidente: "4.8 Not prepared by seller" };
    }
    if (cedo) {
      return hs
        ? me("7. Colecta Parcial", "7.5 No están preparados colecta early")
        : me("9. Colecta Parcial sin Hand Shake", "9.4 Pickup Early");
    }
    if (hs) {
      return v.ehPlace
        ? { culpa: doPonto, categoria: "7. Colecta Parcial", incidente: "7.4 No están en la agencia" }
        : { culpa: doPonto, categoria: "7. Colecta Parcial", incidente: "7.3 No están preparados" };
    }
    return v.ehPlace
      ? { culpa: doPonto, categoria: "9. Colecta Parcial sin Hand Shake", incidente: "9.11 Not delivered by place" }
      : { culpa: doPonto, categoria: "9. Colecta Parcial sin Hand Shake", incidente: "9.8 Not prepared by seller" };
  }

  if (!v.motivo) return me("7. Colecta Parcial", "Deixou pacote sem OC");
  return { culpa: null, categoria: "Motivo fora da regra", incidente: v.motivo };
}

export type StatusOcorrencia = "semImpacto" | "revertido" | "repassado" | "parcial" | "aguardando" | "semNovaColeta";

export type TipoAlerta = "NSE" | "Coleta parcial" | "Não preparados / agência" | "NS" | "Ponto com problema" | "Não visitado";

export const TIPOS_ALERTA: TipoAlerta[] = ["Coleta parcial", "Não preparados / agência", "NSE", "NS", "Ponto com problema", "Não visitado"];

export type Nivel = "critico" | "atencao" | "ok";

export type Cobertura = {
  rota: string;
  rotaId: string;
  transportadora: string;
  janela: string;
  hora: string;
  coletados: number;

  fonte: "relatorio" | "plano" | "monitoramento";
};

export type RotaMonitoring = {
  idParada: string;
  rotaId: string;
  rota: string;

  status: string;
  preparados: number;
  coletados: number;
  restantes: number;
  transportadora: string;
  veiculo: string;
  janela: string;

  atualizadoEm: string;
};

export const finalizada = (status: string) => /finish|complet|collect|done|success/i.test(status);
export const falhou = (status: string) => /fail|cancel|reject|declin/i.test(status);

export function lerRotasDosPontos(linhas: string[][], dataPedidaBR: string): RotaMonitoring[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map(chave);
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    em: i("ATUALIZADOEM"),
    id: i("IDPARADA"),
    rotaId: i("ROUTEID"),
    rota: i("ROUTENAME"),
    status: i("STATUS"),
    prep: i("PREPARADOS"),
    col: i("COLETADOS"),
    rest: i("RESTANTES"),
    transp: i("TRANSPORTADORA"),
    veic: i("VEICULO"),
    janela: i("JANELA"),
  };
  if (c.id < 0 || c.rota < 0) return [];
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const saida: RotaMonitoring[] = [];
  for (const l of linhas.slice(1)) {
    if (c.data >= 0 && dataBR(l[c.data]) !== dataPedidaBR) continue;
    const idParada = v(l, c.id);
    const rotaId = v(l, c.rotaId);

    const rota = v(l, c.rota) || (rotaId ? "Avulsa " + rotaId : "");
    if (!idParada || !rota) continue;
    saida.push({
      idParada,
      rotaId,
      rota,
      status: v(l, c.status),
      preparados: numero(v(l, c.prep)),
      coletados: numero(v(l, c.col)),
      restantes: numero(v(l, c.rest)),
      transportadora: v(l, c.transp),
      veiculo: v(l, c.veic),
      janela: v(l, c.janela),
      atualizadoEm: v(l, c.em),
    });
  }
  return saida;
}

export type ConsultaPonto = {
  em: string;
  resultado: "rotas" | "semRotas" | "erro";

  detalhe: string;
};

export function lerConsultasDosPontos(linhas: string[][], dataPedidaBR: string): Record<string, ConsultaPonto> {
  if (linhas.length < 2) return {};
  const cab = (linhas[0] ?? []).map(chave);
  const i = (n: string) => cab.indexOf(n);
  const c = { data: i("DATA"), em: i("ATUALIZADOEM"), id: i("IDPARADA"), rotaId: i("ROUTEID"), rota: i("ROUTENAME"), status: i("STATUS") };
  if (c.id < 0) return {};
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const saida: Record<string, ConsultaPonto> = {};
  for (const l of linhas.slice(1)) {
    if (c.data >= 0 && dataBR(l[c.data]) !== dataPedidaBR) continue;
    const id = chaveId(v(l, c.id));
    if (!id) continue;
    const em = v(l, c.em);
    const status = v(l, c.status);
    const temRota = !!(v(l, c.rota) || v(l, c.rotaId));
    const atual: ConsultaPonto = temRota
      ? { em, resultado: "rotas", detalhe: "" }
      : /^ERRO/i.test(status)
        ? {
            em,
            resultado: "erro",
            detalhe: /CUSTOMER/i.test(status)
              ? "ponto sem customerId no MONITORING_SELLER"
              : status.replace(/^ERRO_?/i, "").replace(/_/g, " ").trim(),
          }
        : { em, resultado: "semRotas", detalhe: "" };
    const antes = saida[id];

    if (!antes || quandoOrdenavel(em) > quandoOrdenavel(antes.em) || (em === antes.em && temRota)) saida[id] = atual;
  }
  return saida;
}

export type EstimadoRota = { estimados: number; pontos: number };

export type PlanoParada = {
  rota: string;
  idParada: string;

  inicio: string;
};

export type Ocorrencia = {
  visita: Visita;
  culpa: CulpaPrevia;
  tipo: TipoAlerta;
  deixados: number;

  revertidos: number;

  pendentes: number;
  status: StatusOcorrencia;
  nivel: Nivel;
  revertidaPor: Cobertura[];
  coberturaPrevista: Cobertura[];

  rotasDoPonto: RotaDoPonto[];

  saldoPonto?: SaldoPonto;

  abatidoPeloPonto?: number;
};

export type SaldoPonto = {
  estimados: number;
  coletados: number;
  preparados: number;
  atualizadoEm: string;

  backlog?: number;
};

export function lerSaldoDosPontos(linhas: string[][]): Record<string, SaldoPonto> {
  const saida: Record<string, SaldoPonto> = {};
  for (const l of lerMonitoring(linhas)) {
    const s = {
      estimados: totalEstimado(l),
      coletados: totalColetado(l),
      preparados: totalPreparado(l),
      atualizadoEm: l.atualizadoEm,
      backlog: l.estimado.backlog,
    };
    const ids = [chaveId(l.entidade), l.tipo.toLowerCase() !== "place" ? chaveId(l.customerId) : ""].filter(Boolean);
    for (const id of ids) if (!saida[id]) saida[id] = s;
  }
  return saida;
}

function limitarPeloSaldoDoPonto(ocorrencias: Ocorrencia[], saldos: Record<string, SaldoPonto>): Ocorrencia[] {
  const porPonto = new Map<string, Ocorrencia[]>();
  for (const o of ocorrencias) {
    const k = chaveId(o.visita.idParada);
    if (saldos[k]) porPonto.set(k, [...(porPonto.get(k) ?? []), o]);
  }
  const ajuste = new Map<Ocorrencia, Ocorrencia>();
  for (const [k, os] of porPonto) {
    const s = saldos[k];
    let resta = Math.max(0, s.estimados - s.coletados);
    const recentes = os.slice().sort((a, b) => (b.visita.hora || b.visita.janela).localeCompare(a.visita.hora || a.visita.janela));
    for (const o of recentes) {
      const fica = Math.min(o.pendentes, resta);
      resta -= fica;
      const abatido = o.pendentes - fica;
      if (!abatido) {
        ajuste.set(o, { ...o, saldoPonto: s });
        continue;
      }
      const status: StatusOcorrencia = fica === 0 ? "revertido" : o.status;
      ajuste.set(o, {
        ...o,
        pendentes: fica,
        revertidos: o.revertidos + abatido,
        status,
        nivel: nivelDa(status, fica),
        saldoPonto: s,
        abatidoPeloPonto: abatido,
      });
    }
  }
  return ocorrencias.map((o) => ajuste.get(o) ?? o);
}

export type RotaDoPonto = {
  rota: string;
  rotaId: string;
  transportadora: string;
  janela: string;
  estimados: number;
  coletados: number;

  situacao: "passou" | "aguardando" | "semInicio" | "falhou";

  preparados?: number;
  restantes?: number;
  veiculo?: string;

  consultadoEm?: string;

  estaOcorrencia: boolean;
};

const cobertura = (o: Visita): Cobertura => ({
  rota: o.rota,
  rotaId: o.rotaId,
  transportadora: o.transportadora,
  janela: o.janela,
  hora: o.hora,
  coletados: o.coletados,
  fonte: "relatorio",
});

function horaDaConfig(v: unknown): string {
  const s = texto(v);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return m[1].padStart(2, "0") + ":" + m[2];
  const n = Number(s.replace(",", "."));
  if (Number.isFinite(n) && n > 0 && n < 1) {
    const min = Math.round(n * 24 * 60);
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }
  return "";
}

export function lerPlanoDoDia(extracao: string[][], formulas: string[][], dataPedidaBR: string): PlanoParada[] {
  const doDia = rotasDoDia(extracao, dataPedidaBR);
  const paradas = paradasPlanejadas(doDia, mapaDePontos(formulas), { has: () => true });

  const inicioPorRota = new Map<string, string>();
  const iCab = extracao.slice(0, 10).findIndex((l) => (l ?? []).map(chave).includes("NOMEROTA"));
  if (iCab >= 0) {
    const cab = (extracao[iCab] ?? []).map(chave);
    const cRota = cab.indexOf("NOMEROTA");
    const cIni = cab.indexOf("STARTTIME");
    const cVig = cab.findIndex((c) => c === "VIGENCIA" || c === "DATA");
    if (cIni >= 0) {
      for (const l of extracao.slice(iCab + 1)) {
        if (cVig >= 0 && dataBR(l?.[cVig]) !== dataPedidaBR) continue;
        const k = chaveRota(l?.[cRota]);
        if (k && !inicioPorRota.get(k)) inicioPorRota.set(k, horaDaConfig(l?.[cIni]));
      }
    }
  }
  const vistos = new Set<string>();
  const saida: PlanoParada[] = [];
  for (const p of paradas) {
    const k = chaveRota(p.rota) + "|" + chaveId(p.parada);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push({ rota: texto(p.rota), idParada: texto(p.parada), inicio: inicioPorRota.get(chaveRota(p.rota)) ?? "" });
  }
  return saida;
}

const mesmaRota = (a: Visita, b: Visita) => (a.rotaId || a.rota) === (b.rotaId || b.rota);

const depois = (a: Visita, b: Visita, pos: Map<Visita, number>) => {
  if (b === a) return false;
  const empate = !!a.hora && a.hora === b.hora;
  if (mesmaRota(a, b)) {
    return b.visitada && !!a.hora && !!b.hora && (b.hora > a.hora || (empate && (pos.get(b) ?? 0) > (pos.get(a) ?? 0)));
  }
  if (empate && b.visitada) return (pos.get(b) ?? 0) > (pos.get(a) ?? 0);
  return !b.visitada || !a.hora || !b.hora || b.hora >= a.hora;
};

export function tipoDoAlerta(c: CulpaPrevia, v: Visita): TipoAlerta {
  if (!v.visitada) return "Não visitado";
  const cat = c.categoria;

  if (!c.incidente.startsWith("7.2") && tem(v, "AGENCIA", "PREPARADOS")) return "Não preparados / agência";
  if (cat.startsWith("1.") || c.incidente.startsWith("7.2")) return "NSE";
  if (cat.startsWith("2.") || cat.startsWith("3.")) return "NS";
  if (cat.startsWith("7.") || cat.startsWith("9.")) return "Coleta parcial";
  return "Ponto com problema";
}

const TOLERANCIA_NAO_VISITADO_MIN = 30;

const naoVisitada = (v: Visita, agoraMin: number | null) =>
  !v.visitada &&
  v.estimados > 0 &&
  agoraMin !== null &&
  v.janelaFimMin !== null &&
  agoraMin > v.janelaFimMin + TOLERANCIA_NAO_VISITADO_MIN;

export function nivelDa(status: StatusOcorrencia, pendentes: number): Nivel {
  if (pendentes <= 0) return "ok";
  if ((status === "semNovaColeta" || status === "parcial") && pendentes >= 50) return "critico";
  return "atencao";
}

export function ocorrenciasDoDia(
  visitas: Visita[],
  agoraMin: number | null = null,
  plano: PlanoParada[] = [],
  rotasMonitoring: RotaMonitoring[] = [],
  saldosPontos: Record<string, SaldoPonto> = {},
): Ocorrencia[] {
  const monitoringPorPonto = new Map<string, RotaMonitoring[]>();
  for (const r of rotasMonitoring) {
    const k = chaveId(r.idParada);
    monitoringPorPonto.set(k, [...(monitoringPorPonto.get(k) ?? []), r]);
  }
  const porPonto = new Map<string, Visita[]>();
  for (const v of visitas) porPonto.set(v.idParada, [...(porPonto.get(v.idParada) ?? []), v]);
  const planoPorPonto = new Map<string, PlanoParada[]>();
  for (const p of plano) {
    const k = chaveId(p.idParada);
    planoPorPonto.set(k, [...(planoPorPonto.get(k) ?? []), p]);
  }
  const pos = new Map(visitas.map((v, i) => [v, i]));
  const saida: Ocorrencia[] = [];
  for (const v of visitas) {
    const atrasada = naoVisitada(v, agoraMin);
    const culpa: CulpaPrevia | null = atrasada
      ?
        { culpa: "ME", categoria: "2. NS Driver", incidente: "Não visitado: janela " + (v.janela || "?") + " passou sem coleta" }
      : culpaPrevia(v);
    if (!culpa) continue;
    let d = atrasada ? v.estimados : deixados(v);

    const seguintes = (porPonto.get(v.idParada) ?? []).filter((o) =>
      atrasada ? o !== v && !mesmaRota(v, o) : depois(v, o, pos),
    );
    const coletaram = seguintes.filter((o) => o.visitada && o.coletados > 0);
    const passaramDepois = atrasada ? [] : seguintes.filter((o) => o.visitada);
    const vaoPassar = seguintes.filter((o) => !o.visitada && !naoVisitada(o, agoraMin));

    const noRelatorio = new Set((porPonto.get(v.idParada) ?? []).map((o) => chaveRota(o.rota)));

    const api = monitoringPorPonto.get(chaveId(v.idParada)) ?? [];

    const visitadasNoRelatorio = new Set(
      (porPonto.get(v.idParada) ?? [])
        .filter((o) => o.visitada)
        .flatMap((o) => [chaveRota(o.rota), o.rotaId ? "ID:" + o.rotaId : ""])
        .filter(Boolean),
    );

    const jaPassou = (r: { rota: string; rotaId: string }) =>
      r.rotaId ? visitadasNoRelatorio.has("ID:" + r.rotaId) : visitadasNoRelatorio.has(chaveRota(r.rota));
    const ehEsta = (r: { rota: string; rotaId: string }) =>
      r.rotaId && v.rotaId ? r.rotaId === v.rotaId : chaveRota(r.rota) === chaveRota(v.rota);

    const apiEsta = api.find((r) => ehEsta(r) && !falhou(r.status) && (finalizada(r.status) || r.coletados > 0));
    if (apiEsta && apiEsta.coletados >= v.coletados) d = Math.min(d, apiEsta.restantes);

    const inicioDe = (j: string) => (j.match(/(\d{1,2}):(\d{2})/)?.slice(1, 3).map((x) => x.padStart(2, "0")).join(":") ?? "");
    const corte = inicioDe(v.janela) || v.hora;
    const apiDepois =
      atrasada || !corte
        ? []
        : api.filter((r) => !ehEsta(r) && !falhou(r.status) && r.coletados > 0 && !jaPassou(r) && inicioDe(r.janela) > corte);
    const doApi = api.filter(
      (r) => !ehEsta(r) && !finalizada(r.status) && !falhou(r.status) && !jaPassou(r),
    );

    const naApi = (o: Visita) =>
      api.some((r) => (r.rotaId && o.rotaId ? r.rotaId === o.rotaId : chaveRota(r.rota) === chaveRota(o.rota)));
    const foraDaApi = api.length ? (porPonto.get(v.idParada) ?? []).filter((o) => !naApi(o)) : [];
    const doPlano = api.length
      ? []
      : (planoPorPonto.get(chaveId(v.idParada)) ?? []).filter((p) => !noRelatorio.has(chaveRota(p.rota)));
    const previstas: Cobertura[] = api.length
      ? [
          ...doApi.map(
            (r): Cobertura => ({
              rota: r.rota,
              rotaId: r.rotaId,
              transportadora: r.transportadora,
              janela: r.janela,
              hora: "",
              coletados: 0,
              fonte: "monitoramento",
            }),
          ),
          ...vaoPassar.filter((o) => foraDaApi.includes(o)).map(cobertura),
        ]
      : [
          ...vaoPassar.map(cobertura),
          ...doPlano.map(
            (p): Cobertura => ({
              rota: p.rota,
              rotaId: "",
              transportadora: "",
              janela: p.inicio ? "início " + p.inicio : "",
              hora: "",
              coletados: 0,
              fonte: "plano",
            }),
          ),
        ];
    const revertidos = Math.min(
      d,
      coletaram.reduce((s, o) => s + o.coletados, 0) + apiDepois.reduce((s, r) => s + r.coletados, 0),
    );
    const repassado = d - revertidos > 0 && passaramDepois.length > 0;
    const pendentes = repassado ? 0 : d - revertidos;
    const status: StatusOcorrencia =
      d === 0
        ? "semImpacto"
        : repassado
          ? "repassado"
          : pendentes === 0
          ? "revertido"
          : previstas.length
            ? "aguardando"
            : revertidos > 0
              ? "parcial"
              : "semNovaColeta";
    saida.push({
      visita: v,
      culpa,
      tipo: tipoDoAlerta(culpa, v),
      deixados: d,
      revertidos,
      pendentes,
      status,
      nivel: nivelDa(status, pendentes),
      revertidaPor: [
        ...coletaram.map(cobertura),
        ...apiDepois.map(
          (r): Cobertura => ({
            rota: r.rota,
            rotaId: r.rotaId,
            transportadora: r.transportadora,
            janela: r.janela,
            hora: "",
            coletados: r.coletados,
            fonte: "monitoramento",
          }),
        ),
      ],
      rotasDoPonto: api.length
        ? [
            ...api.map(
              (r): RotaDoPonto => ({
                rota: r.rota,
                rotaId: r.rotaId,
                transportadora: r.transportadora,
                janela: r.janela,
                estimados: r.preparados,
                coletados: r.coletados,
                preparados: r.preparados,
                restantes: r.restantes,
                veiculo: r.veiculo,
                consultadoEm: r.atualizadoEm,

                situacao: falhou(r.status)
                  ? "falhou"
                  : finalizada(r.status) || jaPassou(r)
                    ? "passou"
                    : noRelatorio.has(chaveRota(r.rota)) ||
                          (!!r.rotaId && (porPonto.get(v.idParada) ?? []).some((o) => o.rotaId === r.rotaId))
                        ? "aguardando"
                        : "semInicio",
                estaOcorrencia: ehEsta(r),
              }),
            ),
            ...foraDaApi.map(
              (o): RotaDoPonto => ({
                rota: o.rotaSemNome ? "Avulsa " + o.rotaId : o.rota,
                rotaId: o.rotaId,
                transportadora: o.transportadora,
                janela: o.janela,
                estimados: o.estimados,
                coletados: o.coletados,
                situacao: o.visitada ? "passou" : "aguardando",
                estaOcorrencia: o === v,
              }),
            ),
          ].sort((a, b) => a.janela.localeCompare(b.janela))
        : [
        ...(porPonto.get(v.idParada) ?? [])
          .slice()
          .sort((a, b) => (a.visitada === b.visitada ? (a.hora || a.janela).localeCompare(b.hora || b.janela) : a.visitada ? -1 : 1))
          .map(
            (o): RotaDoPonto => ({
              rota: o.rota,
              rotaId: o.rotaId,
              transportadora: o.transportadora,
              janela: o.janela,
              estimados: o.estimados,
              coletados: o.coletados,
              situacao: o.visitada ? "passou" : "aguardando",
              estaOcorrencia: o === v,
            }),
          ),
        ...doPlano.map(
          (p): RotaDoPonto => ({
            rota: p.rota,
            rotaId: "",
            transportadora: "",
            janela: p.inicio ? "início da rota " + p.inicio : "",
            estimados: 0,
            coletados: 0,
            situacao: "semInicio",
            estaOcorrencia: false,
          }),
        ),
      ],
      coberturaPrevista: previstas,
    });
  }
  return limitarPeloSaldoDoPonto(saida, saldosPontos);
}

export const DESVIO_FORECAST_MIN = 100;

export function projecaoPorPonto(rotas: { detalhe: { id: string; pacotes: number }[] }[]): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const r of rotas) {
    for (const p of r.detalhe) {
      const id = chaveId(p.id);
      if (id) saida[id] = (saida[id] ?? 0) + (p.pacotes || 0);
    }
  }
  return saida;
}

export type DesvioForecast = {
  tipo: "desvio" | "backlog";
  projetado: number;
  real: number;
  desvio: number;

  deixadosAntes: number | null;
};

export function desvioDeForecast(
  projecao: Record<string, number>,
  idParada: string,
  real: number,
  deixadosAntes: number | null = null,
): DesvioForecast | null {
  const projetado = projecao[chaveId(idParada)];
  if (projetado === undefined || !(real > 0)) return null;
  const desvio = real - projetado;
  if (desvio < DESVIO_FORECAST_MIN) return null;
  const tipo = deixadosAntes !== null && deixadosAntes >= DESVIO_FORECAST_MIN ? "backlog" : "desvio";
  return { tipo, projetado, real, desvio, deixadosAntes };
}

export const preocupa = (o: Ocorrencia) => o.status === "semNovaColeta" || o.status === "parcial";

export function clusterDoNome(rota: string): string | null {
  const m = String(rota ?? "").match(/(?:^|_)C(\d{1,3})(?:_|$)/i);
  return m ? "C" + m[1].padStart(2, "0") : null;
}

export function clusterDaVisita(v: Visita, visitas: Visita[], porPonto: Record<string, string> = {}): string {
  const proprio = v.rotaSemNome ? null : clusterDoNome(v.rota);
  if (proprio) return proprio;
  for (const o of visitas) {
    if (o.idParada === v.idParada && !o.rotaSemNome) {
      const c = clusterDoNome(o.rota);
      if (c) return c;
    }
  }
  return porPonto[chaveId(v.idParada)] ?? "Sem cluster";
}

export function clusterDosPontos(
  plano: { rota: string; idParada: string }[],
  base: Map<string, Set<string>>,
): Record<string, string> {
  const votar = (pares: [string, string][]) => {
    const votos = new Map<string, Map<string, number>>();
    for (const [rota, idParada] of pares) {
      const id = chaveId(idParada);
      const c = clusterDoNome(rota);
      if (!id || !c) continue;
      const m = votos.get(id) ?? new Map<string, number>();
      m.set(c, (m.get(c) ?? 0) + 1);
      votos.set(id, m);
    }
    const saida: Record<string, string> = {};
    for (const [id, m] of votos) saida[id] = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return saida;
  };
  const daBase = votar([...base].flatMap(([rota, ids]) => [...ids].map((id) => [rota, id] as [string, string])));
  return { ...daBase, ...votar(plano.map((p) => [p.rota, p.idParada])) };
}

export const OPS_POR_CLUSTER: Record<string, string> = {
  C01: "Ana", C02: "Ana", C03: "Ana", C06: "Ana",
  C04: "Bruno", C05: "Bruno", C10: "Bruno", C11: "Bruno",
  C07: "Carla", C08: "Carla", C09: "Carla", C12: "Carla",
};

export const opsDoCluster = (cluster: string) => OPS_POR_CLUSTER[cluster] ?? "Sem OPS";

export const CAB_TRATATIVAS = [
  "DATA", "CHAVE", "ROTA", "ID_PARADA", "PARADA", "TRATADO", "COMENTARIO", "AUTOR", "ATUALIZADO_EM", "MOTIVO_IMPACTO",
  "EXCLUIDO", "TRATATIVA_HXH",
];

export const TRATATIVAS_HXH = [
  "Sem risco",
  "Risco",
  "Buscando veículo para avulsa",
  "Buscando apoio",
  "Aguardando próximo veículo",
  "Pacotes pendentes não preparados",
  "Local fechado",
  "Sem reversão",
  "Revertido",
];

export type Tratativa = {
  tratado: boolean;
  comentario: string;
  autor: string;
  atualizadoEm: string;

  motivoImpacto: string;

  excluido: boolean;

  tratativaHxh: string;
};

export const MOTIVOS_IMPACTO_PADRAO = ["Gap de capacidade", "Comportamental", "Sin drop off", "Impacto express"];

export function lerMotivosImpacto(linhas: string[][]): string[] {
  const vistos = new Set(MOTIVOS_IMPACTO_PADRAO.map(chave));
  const saida = [...MOTIVOS_IMPACTO_PADRAO];
  for (const l of linhas.slice(1)) {
    const m = texto(l?.[0]);
    if (!m || vistos.has(chave(m))) continue;
    vistos.add(chave(m));
    saida.push(m);
  }
  return saida;
}

export const chaveOcorrencia = (v: Visita) => v.idParada + "|" + (v.rotaId || v.rota);

function quandoOrdenavel(v: string): string {
  const m = texto(v).match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? m[3] + m[2] + m[1] + m[4] + m[5] + (m[6] ?? "00") : "";
}

export function lerTratativas(linhas: string[][], dataPedidaBR: string): Map<string, Tratativa> {
  const mapa = new Map<string, Tratativa>();
  const quando = new Map<string, string>();
  if (linhas.length < 2) return mapa;
  const cab = (linhas[0] ?? []).map(chave);
  const i = (n: string) => cab.indexOf(n);
  const [iData, iChave, iTrat, iCom, iAutor, iEm, iMot, iExc, iHxh] = [
    "DATA", "CHAVE", "TRATADO", "COMENTARIO", "AUTOR", "ATUALIZADOEM", "MOTIVOIMPACTO", "EXCLUIDO", "TRATATIVAHXH",
  ].map(i);
  if (iData < 0 || iChave < 0) return mapa;
  for (const l of linhas.slice(1)) {
    if (dataBR(l[iData]) !== dataPedidaBR) continue;
    const k = texto(l[iChave]);
    if (!k) continue;
    const em = iEm >= 0 ? quandoOrdenavel(l[iEm]) : "";
    if (mapa.has(k) && em < (quando.get(k) ?? "")) continue;
    quando.set(k, em);
    mapa.set(k, {
      tratado: iTrat >= 0 && sim(l[iTrat]),
      comentario: iCom >= 0 ? texto(l[iCom]) : "",
      autor: iAutor >= 0 ? texto(l[iAutor]) : "",
      atualizadoEm: iEm >= 0 ? texto(l[iEm]) : "",
      motivoImpacto: iMot >= 0 ? texto(l[iMot]) : "",
      excluido: iExc >= 0 && /^(SIM|S|TRUE|1|X)$/i.test(texto(l[iExc])),
      tratativaHxh: iHxh >= 0 ? texto(l[iHxh]) : "",
    });
  }
  return mapa;
}

export type HistoricoPonto = {
  dias: number;
  estimados: number;
  coletados: number;
  naoColetados: number;
  diasComPerda: number;
  ultimaPerda: string;
  culpaPrincipal: string;
  incidentePrincipal: string;

  naoColetadosDiaAnterior: number | null;
  diaAnterior: string;
};

export function lerHistoricoPontos(linhas: string[][]): Map<string, HistoricoPonto> {
  const mapa = new Map<string, HistoricoPonto>();
  if (linhas.length < 2) return mapa;
  const cab = (linhas[0] ?? []).map(chave);
  const i = (n: string) => cab.indexOf(n);
  const c = {
    ponto: i("PONTO"),
    dias: i("DIAS"),
    est: i("ESTIMADOS"),
    col: i("COLETADOS"),
    nc: i("NAOCOLETADOS"),
    perda: i("DIASCOMPERDA"),
    ultima: i("ULTIMAPERDA"),
    culpa: i("CULPAPRINCIPAL"),
    inc: i("INCIDENTEPRINCIPAL"),
    ncAnt: i("NAOCOLETADOSDIAANTERIOR"),
    diaAnt: i("DIAANTERIOR"),
  };
  if (c.ponto < 0) return mapa;
  const n = (l: string[], k: number) => (k < 0 ? 0 : numero(l[k]));
  for (const l of linhas.slice(1)) {
    const ponto = texto(l[c.ponto]);
    if (!ponto) continue;
    mapa.set(ponto, {
      dias: n(l, c.dias),
      estimados: n(l, c.est),
      coletados: n(l, c.col),
      naoColetados: n(l, c.nc),
      diasComPerda: n(l, c.perda),
      ultimaPerda: c.ultima < 0 ? "" : texto(l[c.ultima]).slice(0, 10),
      culpaPrincipal: c.culpa < 0 ? "" : texto(l[c.culpa]),
      incidentePrincipal: c.inc < 0 ? "" : texto(l[c.inc]),
      naoColetadosDiaAnterior: c.ncAnt < 0 ? null : n(l, c.ncAnt),
      diaAnterior: c.diaAnt < 0 ? "" : texto(l[c.diaAnt]).slice(0, 10),
    });
  }
  return mapa;
}

export type RiscoHistorico = "recorrente" | "eventual" | "semPerda" | "semHistorico";

export function riscoDoHistorico(h: HistoricoPonto | undefined): RiscoHistorico {
  if (!h || h.dias <= 0) return "semHistorico";
  if (h.diasComPerda <= 0) return "semPerda";
  const taxa = h.estimados > 0 ? h.naoColetados / h.estimados : 0;
  if (h.diasComPerda / h.dias >= 0.3 || taxa >= 0.1) return "recorrente";
  return "eventual";
}

const GENERICAS = new Set(["TRANSPORTADORA", "TRANSPORTES", "TRANSPORTE", "GRUPO", "LOGISTICA", "LOGISTICS", "LTDA", "EXPRESS"]);

export function nomeCurtoTransportadora(nome: string): string {
  const palavras = texto(nome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  return palavras.find((p) => !GENERICAS.has(p)) ?? palavras[0] ?? "";
}

const juntarComE = (itens: string[]) =>
  itens.length <= 1 ? itens.join("") : itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];

export const MINIMO_CULP_OP = 100;

export type ClusterCulpOp<T> = {
  cluster: string;
  pacotes: number;

  transportadoras: string[];
  motivos: string[];

  itens: T[];
};

export function culpOpPorCluster<T extends Ocorrencia & { cluster: string; trat?: Tratativa }>(
  ocorrencias: T[],
  minimo = MINIMO_CULP_OP,
): ClusterCulpOp<T>[] {
  const porCluster = new Map<string, { pacotes: number; transp: Map<string, number>; motivos: Map<string, number>; itens: T[] }>();
  for (const o of ocorrencias) {
    if (o.culpa.culpa !== "ME" || o.trat?.excluido || o.pendentes <= 0 || o.pendentes < minimo) continue;
    const c = porCluster.get(o.cluster) ?? { pacotes: 0, transp: new Map(), motivos: new Map(), itens: [] as T[] };
    c.pacotes += o.pendentes;
    c.itens.push(o);
    const t = nomeCurtoTransportadora(o.visita.transportadora);
    if (t) c.transp.set(t, (c.transp.get(t) ?? 0) + o.pendentes);
    const m = o.trat?.motivoImpacto;
    if (m) c.motivos.set(m, (c.motivos.get(m) ?? 0) + o.pendentes);
    porCluster.set(o.cluster, c);
  }
  const ordem = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return [...porCluster.entries()]
    .map(([cluster, c]) => ({
      cluster,
      pacotes: c.pacotes,
      transportadoras: ordem(c.transp),
      motivos: ordem(c.motivos),
      itens: c.itens.slice().sort((a, b) => b.pendentes - a.pendentes),
    }))
    .sort((a, b) => b.pacotes - a.pacotes);
}

export const linhaCulpOp = (c: ClusterCulpOp<unknown>) =>
  c.cluster + ": " + juntarComE(c.transportadoras) + " - " + c.pacotes.toLocaleString("pt-BR") + " pcts" +
  " - " + (c.motivos.length ? c.motivos.join(" / ") : "___");

export function linhasCulpOp(
  ocorrencias: (Ocorrencia & { cluster: string; trat?: Tratativa })[],
  top = 3,
  minimo = MINIMO_CULP_OP,
): string[] {
  return culpOpPorCluster(ocorrencias, minimo).slice(0, top).map(linhaCulpOp);
}

export type RotaNs = { rota: string; rotaId?: string; transportadora: string };

export type PontoNsSemReversao = {
  rota: string;
  transportadora: string;
  idParada: string;
  nome: string;

  esperados: number | null;
  semReversao: number;
  fonte: "monitoramento" | "relatorio";
};

export function nsSemReversao(
  rotasNs: RotaNs[],
  visitas: Visita[],
  plano: PlanoParada[],
  saldos: Record<string, SaldoPonto>,
  rotasMonitoring: RotaMonitoring[] = [],
): { ofensores: OfensorSemReversao[]; pontos: PontoNsSemReversao[] } {
  const pontos: PontoNsSemReversao[] = [];
  const vistos = new Set<string>();
  const porPonto = new Map<string, Visita[]>();
  for (const v of visitas) {
    const k = chaveId(v.idParada);
    porPonto.set(k, [...(porPonto.get(k) ?? []), v]);
  }
  for (const ns of rotasNs) {
    const ehDela = (r: { rota: string; rotaId: string }) =>
      (!!ns.rotaId && r.rotaId === ns.rotaId) || chaveRota(r.rota) === chaveRota(ns.rota);
    const linhas = visitas.filter(ehDela);
    const ids = [
      ...new Set([
        ...linhas.map((v) => chaveId(v.idParada)),
        ...plano.filter((p) => chaveRota(p.rota) === chaveRota(ns.rota)).map((p) => chaveId(p.idParada)),
      ]),
    ].filter(Boolean);
    for (const id of ids) {
      if (vistos.has(id)) continue;
      vistos.add(id);
      const daNs = linhas.filter((v) => chaveId(v.idParada) === id);
      const api = rotasMonitoring.find((r) => chaveId(r.idParada) === id && ehDela(r));
      const esperados = daNs.length
        ? Math.max(...daNs.map((v) => v.preparados || v.estimados))
        : api
          ? api.preparados
          : null;
      const saldo = saldos[id];
      let semReversao: number;
      let fonte: PontoNsSemReversao["fonte"];
      if (saldo) {
        const resto = Math.max(0, saldo.estimados - saldo.coletados);
        semReversao = esperados === null ? resto : Math.min(esperados, resto);
        fonte = "monitoramento";
      } else {
        const outras = (porPonto.get(id) ?? []).filter((v) => !ehDela(v)).reduce((s, v) => s + v.coletados, 0);
        semReversao = esperados === null ? 0 : Math.max(0, esperados - outras);
        fonte = "relatorio";
      }
      if (semReversao <= 0) continue;
      const nome = (porPonto.get(id) ?? []).find((v) => v.nomeParada)?.nomeParada ?? "";
      pontos.push({
        rota: ns.rota,
        transportadora: ns.transportadora || daNs.find((v) => v.transportadora)?.transportadora || "Sem transportadora",
        idParada: id,
        nome,
        esperados,
        semReversao,
        fonte,
      });
    }
  }
  const porTp = new Map<string, { pacotes: number; rotas: Set<string>; paradas: number }>();
  for (const p of pontos) {
    const o = porTp.get(p.transportadora) ?? { pacotes: 0, rotas: new Set<string>(), paradas: 0 };
    o.pacotes += p.semReversao;
    o.rotas.add(chaveRota(p.rota));
    o.paradas++;
    porTp.set(p.transportadora, o);
  }
  const ofensores = [...porTp.entries()]
    .map(([transportadora, o]) => ({ transportadora, pacotes: o.pacotes, rotas: o.rotas.size, paradas: o.paradas }))
    .sort((a, b) => b.pacotes - a.pacotes || a.transportadora.localeCompare(b.transportadora, "pt-BR"));
  return { ofensores, pontos };
}

export type RespostaComFoto = { carimbo: string; dataExecucao: string; rota: string; idRota: string; fotoBau: string };

const diaDe = (v: string) => {
  const m = texto(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[1].padStart(2, "0") + "/" + m[2].padStart(2, "0") + "/" + m[3] : "";
};

export function fotosDasRotas(respostas: RespostaComFoto[], dataPedidaBR: string): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const r of respostas) {
    const foto = texto(r.fotoBau);
    if (!foto) continue;
    if ((diaDe(r.dataExecucao) || diaDe(r.carimbo)) !== dataPedidaBR) continue;
    for (const id of new Set((texto(r.idRota) + " " + texto(r.rota)).match(/[0-9]{6,}/g) ?? [])) saida["ID:" + id] = foto;
    const nome = chaveRota(r.rota);
    if (nome) saida["N:" + nome] = foto;
  }
  return saida;
}

export function rotasComForms(respostas: RespostaComFoto[], dataPedidaBR: string): string[] {
  const saida = new Set<string>();
  for (const r of respostas) {
    if ((diaDe(r.dataExecucao) || diaDe(r.carimbo)) !== dataPedidaBR) continue;
    for (const id of new Set((texto(r.idRota) + " " + texto(r.rota)).match(/[0-9]{6,}/g) ?? [])) saida.add("ID:" + id);
    const nome = chaveRota(r.rota);
    if (nome) saida.add("N:" + nome);
  }
  return [...saida];
}

export const temForms = (respondidas: Set<string>, rota: string, rotaId: string) =>
  (!!rotaId && respondidas.has("ID:" + rotaId)) || (!!chaveRota(rota) && respondidas.has("N:" + chaveRota(rota)));

export const fotoDaRota = (fotos: Record<string, string>, rota: string, rotaId: string) =>
  (rotaId && fotos["ID:" + rotaId]) || fotos["N:" + chaveRota(rota)] || "";
