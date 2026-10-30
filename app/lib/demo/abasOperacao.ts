// Abas da operacao em tempo real: plano do dia (config), Monitoramento por
// Sellers, rotas do sistema, curva de chegada e as tratativas da tela.
import type { Celula } from "./planilhaFalsa";
import type { Registro } from "./gerador";
import {
  br, dia, diasAnteriores, hash, hhmm, hojeISO, minutoSimulado, MOTIVOS, pontoPorId, pontos, rng, somarDias, visitada,
  type ParadaDia, type RotaDia,
} from "./mundo";
import { carimbo, carimboAgora, HB, PRINCIPAL, PROCESSO } from "./util";

// --- tempos de cada rota -------------------------------------------------------

// Chegada no CD: depois da ultima parada, com o deslocamento de volta.
export function chegadaDaRota(r: RotaDia): number {
  const ultima = r.paradas.length ? Math.max(...r.paradas.map((p) => p.horaReal)) : r.start + 120;
  return ultima + 50 + (hash(r.id) % 70);
}

export function etaDaRota(r: RotaDia): number {
  const ultima = r.paradas.length ? Math.max(...r.paradas.map((p) => p.previsto)) : r.start + 120;
  return ultima + 75;
}

const isoHora = (iso: string, min: number) => {
  const d = min >= 24 * 60 ? somarDias(iso, 1) : iso;
  return d + " " + hhmm(min % (24 * 60)) + ":" + String(min % 53).padStart(2, "0");
};

export const rotasCps = (iso: string) => dia(iso).rotas.filter((r) => r.hub === "CPS");
export const veiculoPlanejado = (r: RotaDia) => (r.tipo === "melione" ? "MeliOne VUC" : r.motorista?.perfil.veiculo || r.perfil + " Fixo");

// --- plano do dia (Extracao Config / Formulas) --------------------------------

const CAB_CONFIG = ["VIGENCIA", "NOME_ROTA", "START_TIME", "ETA", "VEICULO", "TRANSPORTADORA", "CLUSTER", "ID_SELLER", "NAME_CLIENTE", "CIDADE", "PACOTES", "PESO", "VOLUME"];

export function linhasConfig(iso: string): Celula[][] {
  const saida: Celula[][] = [];
  for (const r of rotasCps(iso)) {
    if (r.avulsa) continue;
    for (const p of r.paradas) {
      const x = rng("carga" + p.ponto.id);
      const fator = 0.8 + x() * 0.6;
      saida.push([
        iso,
        r.nome,
        hhmm(r.start) + ":00",
        hhmm(etaDaRota(r)),
        veiculoPlanejado(r),
        r.transportadora,
        r.cluster,
        p.ponto.id,
        p.ponto.nome,
        p.ponto.cidade,
        p.estimados,
        (p.estimados * 1.5 * fator).toFixed(1).replace(".", ","),
        (p.estimados * 0.0145 * fator).toFixed(3).replace(".", ","),
      ]);
    }
  }
  return saida;
}

const extracaoConfig = () => [CAB_CONFIG, ...linhasConfig(hojeISO())];
const extracaoConfigD1 = () => [CAB_CONFIG, ...linhasConfig(somarDias(hojeISO(), 1))];

// Mapa base rota -> pontos (as rotas de sempre de cada ponto).
function formulas(): Celula[][] {
  const linhas: Celula[][] = [["NOME_ROTA", "ID_SELLER", "NAME_CLIENTE", "CLUSTER", "CIDADE"]];
  const vistos = new Set<string>();
  for (const iso of [...diasAnteriores(hojeISO(), 14), hojeISO()]) {
    for (const r of rotasCps(iso)) {
      if (r.avulsa) continue;
      for (const p of r.paradas) {
        const k = r.nome + "|" + p.ponto.id;
        if (vistos.has(k)) continue;
        vistos.add(k);
        linhas.push([r.nome, p.ponto.id, p.ponto.nome, r.cluster, p.ponto.cidade]);
      }
    }
  }
  return linhas;
}

// --- Monitoramento por Sellers -------------------------------------------------

type Saldo = { est: number; prep: number; col: number };

export function saldosDoDia(iso: string): Map<string, Saldo> {
  const m = new Map<string, Saldo>();
  for (const r of rotasCps(iso)) {
    if (r.ns && !r.avulsa) {
      for (const p of r.paradas) {
        const s = m.get(p.ponto.id) ?? { est: 0, prep: 0, col: 0 };
        s.est += p.estimados;
        m.set(p.ponto.id, s);
      }
      continue;
    }
    for (const p of r.paradas) {
      const s = m.get(p.ponto.id) ?? { est: 0, prep: 0, col: 0 };
      if (!r.avulsa) s.est += p.estimados;
      if (visitada(p, iso)) {
        s.col += p.coletados;
        s.prep += p.preparados;
      } else if (!r.avulsa) s.prep += Math.round(p.estimados * 0.7);
      m.set(p.ponto.id, s);
    }
  }
  for (const s of m.values()) s.col = Math.min(s.col, s.est);
  return m;
}

function monitoringSeller(): Celula[][] {
  const iso = hojeISO();
  const saldos = saldosDoDia(iso);
  const em = carimboAgora(7);
  const linhas: Celula[][] = [[
    "ATUALIZADO_EM", "CUSTOMER_ID", "RELATED_ENTITY_ID", "TIPO", "NOME", "CIDADE",
    "ESTIMADO_EDPU", "ESTIMADO_BACKLOG", "ESTIMADO_EARLY", "PREPARADO_EDPU", "PREPARADO_BACKLOG", "PREPARADO_EARLY",
    "COLETADO_EDPU", "COLETADO_BACKLOG", "COLETADO_EARLY",
  ]];
  for (const p of pontos()) {
    const s = saldos.get(p.id) ?? { est: 0, prep: 0, col: 0 };
    const x = rng("ms" + p.id + iso);
    const backlog = s.est > 20 && x.chance(0.12) ? x.int(1, 12) : 0;
    const colBacklog = s.col >= backlog ? backlog : 0;
    linhas.push([
      em,
      p.ehPlace ? String(10000 + (hash(p.id) % 89999)) : p.sellerId,
      p.id,
      p.ehPlace ? "place" : "seller",
      p.nome,
      p.cidade,
      Math.max(0, s.est - backlog),
      backlog,
      0,
      Math.max(0, Math.min(s.prep, s.est) - backlog),
      backlog,
      0,
      Math.max(0, s.col - colBacklog),
      colBacklog,
      0,
    ]);
  }
  return linhas;
}

// Pontos com ocorrencia hoje: todas as rotas do dia que passam neles.
function monitoringSellerRotas(): Celula[][] {
  const iso = hojeISO();
  const agora = minutoSimulado(iso);
  const em = carimboAgora(5);
  const linhas: Celula[][] = [["DATA", "ATUALIZADO_EM", "ID_PARADA", "ROUTE_ID", "ROUTE_NAME", "STATUS", "PREPARADOS", "COLETADOS", "RESTANTES", "TRANSPORTADORA", "VEICULO", "JANELA"]];
  const porPonto = new Map<string, { r: RotaDia; p: ParadaDia }[]>();
  for (const r of rotasCps(iso)) {
    if (r.ns) continue;
    for (const p of r.paradas) porPonto.set(p.ponto.id, [...(porPonto.get(p.ponto.id) ?? []), { r, p }]);
  }
  for (const [id, lista] of porPonto) {
    const comProblema = lista.some(({ p }) => visitada(p, iso) && (p.motivo || p.estimados - p.coletados > 5));
    if (!comProblema) continue;
    for (const { r, p } of lista) {
      const foi = p.horaReal <= agora;
      const status = foi ? (p.coletados === 0 && p.motivo ? "failed" : "finished") : "pending";
      linhas.push([
        br(iso), em, id, r.id, r.nome, status,
        foi ? p.preparados : Math.round(p.estimados * 0.8),
        foi ? p.coletados : 0,
        foi ? Math.max(0, p.estimados - p.coletados) : p.estimados,
        r.transportadora,
        r.motorista?.placa ?? "",
        hhmm(p.ponto.janelaIni) + " a " + hhmm(p.ponto.janelaFim) + " hs",
      ]);
    }
  }
  return linhas;
}

// --- tratativas da tela (exemplos ja registrados pelo time) -------------------

const COMENTARIOS = [
  "Seller confirmou que reabre às 14h, avulsa solicitada.",
  "Transportadora acionada para retornar no fim da rota.",
  "Pacotes repassados para a rota seguinte do cluster.",
  "Seller pediu coleta amanhã cedo, sem urgência.",
  "Veículo saiu cheio da parada anterior; ajustar sequência amanhã.",
  "Local sem acesso por obra na rua, motorista orientado.",
  "Place informou que os pacotes chegaram depois da passagem.",
];
const AUTORES = ["Ana (CCO)", "Bruno (Exec)", "Carla (Place)", "Diego (Planejamento)"];
const MOTIVOS_IMPACTO = ["Gap de capacidade", "Comportamental", "Sin drop off", ""];

function tratativas(): Celula[][] {
  const iso = hojeISO();
  const linhas: Celula[][] = [["DATA", "CHAVE", "ROTA", "ID_PARADA", "PARADA", "TRATADO", "COMENTARIO", "AUTOR", "ATUALIZADO_EM", "MOTIVO_IMPACTO", "EXCLUIDO", "TRATATIVA_HXH"]];
  for (const r of rotasCps(iso)) {
    if (r.ns) continue;
    for (const p of r.paradas) {
      if (!visitada(p, iso) || !p.motivo) continue;
      const x = rng("trat" + r.id + p.ponto.id);
      if (!x.chance(0.45)) continue;
      linhas.push([
        br(iso),
        p.ponto.id + "|" + r.id,
        r.nome || r.id,
        p.ponto.id,
        p.ponto.nome,
        x.chance(0.6) ? "SIM" : "",
        x.pick(COMENTARIOS),
        x.pick(AUTORES),
        carimbo(iso, Math.min(minutoSimulado(iso), p.horaReal + x.int(15, 90))),
        x.pick(MOTIVOS_IMPACTO),
        "",
        "",
      ]);
    }
  }
  return linhas;
}

// --- rotas do sistema (login, chegada) -----------------------------------------

function rotasSistema(): Celula[][] {
  const iso = hojeISO();
  const agora = minutoSimulado(iso);
  const linhas: Celula[][] = [[
    "DATA", "ROUTE_ID", "ROTA", "TRANSPORTADORA", "PLACA", "VEICULO", "STATUS", "COLETADOS", "INICIO_PLANEJADO", "INICIO_ROTA",
    "CHEGOU_CD", "A_CAMINHO_CD", "NO_CD", "DESCARREGANDO", "INICIO_DESCARGA", "ATUALIZADO_EM",
  ]];
  const em = carimboAgora(5);
  for (const r of rotasCps(iso)) {
    if (r.emAberto) continue;
    const x = rng("login" + r.id);
    const atrasoLogin = x.chance(0.12) ? x.int(20, 70) : x.int(-10, 12);
    const logou = !r.ns && r.start + atrasoLogin <= agora;
    const chegada = chegadaDaRota(r);
    const chegou = !r.ns && chegada <= agora;
    const terminou = r.paradas.length > 0 && r.paradas.every((p) => p.horaReal <= agora);
    const coletados = r.paradas.filter((p) => p.horaReal <= agora).reduce((s, p) => s + p.coletados, 0);
    linhas.push([
      br(iso),
      r.id,
      r.nome,
      r.transportadora,
      r.motorista?.placa ?? "",
      r.motorista?.perfil.veiculo ?? "",
      r.ns ? "pending" : chegou && agora - chegada > 40 ? "close" : logou ? "active" : "pending",
      coletados,
      br(iso) + " " + hhmm(r.start) + ":00",
      logou ? br(iso) + " " + hhmm(r.start + atrasoLogin) + ":00" : "",
      chegou ? isoHora(iso, chegada) : "",
      !chegou && terminou ? "SIM" : "",
      chegou && agora - chegada <= 40 ? "SIM" : "",
      chegou && agora - chegada > 10 && agora - chegada <= 40 ? "SIM" : "",
      chegou ? isoHora(iso, chegada + 12) : "",
      em,
    ]);
  }
  return linhas;
}

function melioneEntregas(): Celula[][] {
  const iso = hojeISO();
  const agora = minutoSimulado(iso);
  const linhas: Celula[][] = [["DATA", "ROUTE_ID", "ROTA", "PENDENTES", "FALHAS", "SUCESSO", "PACOTES", "PARADAS", "SACAS", "PARADAS_PENDENTES", "SACAS_ENTREGUES", "CONSULTADO_EM"]];
  for (const r of rotasCps(iso).filter((x) => x.tipo === "melione")) {
    const x = rng("mel" + r.id);
    const pacotes = x.int(60, 140);
    const paradas = x.int(18, 40);
    const sacas = x.int(4, 9);
    const inicio = r.start - 150;
    const progresso = Math.max(0, Math.min(1, (agora - inicio) / 140));
    const feitos = Math.round(pacotes * progresso);
    const falhas = Math.round(feitos * 0.04);
    linhas.push([br(iso), r.id, r.nome, pacotes - feitos, falhas, feitos - falhas, pacotes, paradas, sacas, Math.round(paradas * (1 - progresso)), Math.round(sacas * progresso), carimboAgora(6)]);
  }
  return linhas;
}

// --- curva de chegada -----------------------------------------------------------

const CAB_CURVA = ["COLETA", "ROTA", "NOME_DA_ROTA", "PLACA", "PERFIL_VEICULO", "MLP", "DOCA", "QTD_PACOTES", "GATEIN", "DOCKIN", "DOCKOUT", "GATEOUT", "STATUS_ROTA", "VERIFICADOR", "ATUALIZADO_EM"];

function linhasCurva(iso: string, atualizado: string): Celula[][] {
  const agora = minutoSimulado(iso);
  const saida: Celula[][] = [];
  for (const r of rotasCps(iso)) {
    if (r.ns || !r.motorista || !r.paradas.length) continue;
    const chegada = chegadaDaRota(r);
    if (chegada > agora) continue;
    const pacotes = r.paradas.reduce((s, p) => s + p.coletados, 0);
    saida.push([
      iso, r.id, r.nome, r.motorista.placa, r.motorista.perfil.veiculo, r.transportadora, "D-" + (10 + (hash(r.id) % 30)), pacotes,
      isoHora(iso, chegada), isoHora(iso, chegada + 12), isoHora(iso, chegada + 40), isoHora(iso, chegada + 55), "close", pacotes < 2 ? "0" : "1", atualizado,
    ]);
  }
  return saida;
}

const curvaChegada = () => [CAB_CURVA, ...linhasCurva(hojeISO(), carimboAgora(20)), ...linhasCurva(somarDias(hojeISO(), -1), carimboAgora(20))];
const curvaChegadaHist = () => [CAB_CURVA, ...diasAnteriores(hojeISO(), 31).flatMap((iso) => linhasCurva(iso, carimbo(somarDias(iso, 1), 2 * 60)))];

function curvaSistema(): Celula[][] {
  const iso = hojeISO();
  const agora = minutoSimulado(iso);
  const linhas: Celula[][] = [["DATA", "TIPO", "FAIXA", "PLANEJADO", "EXECUTADO", "EM_TRANSITO", "A_CAMINHO", "CHEGARAM", "DESCARREGANDO", "FINALIZADAS", "ATUALIZADO_EM"]];
  const rotas = rotasCps(iso).filter((r) => !r.ns && r.paradas.length && !r.avulsa);
  const chegadas = rotas.map((r) => ({ eta: etaDaRota(r), chegada: chegadaDaRota(r), pacotes: r.paradas.reduce((s, p) => s + p.coletados, 0), plan: r.paradas.reduce((s, p) => s + p.estimados, 0) }));
  const chegaram = chegadas.filter((c) => c.chegada <= agora);
  const resumo = {
    aCaminho: rotas.filter((r) => r.paradas.every((p) => p.horaReal <= agora) && chegadaDaRota(r) > agora).length,
    chegaram: chegaram.length,
    descarregando: chegaram.filter((c) => agora - c.chegada <= 40).length,
    finalizadas: chegaram.filter((c) => agora - c.chegada > 40).length,
  };
  const em = carimboAgora(8);
  for (const tipo of ["pacotes", "veiculos"] as const) {
    for (let h = 9; h <= 23; h++) {
      const naHora = (m: number) => m >= h * 60 && m < (h + 1) * 60;
      const plan = chegadas.filter((c) => naHora(c.eta)).reduce((s, c) => s + (tipo === "pacotes" ? c.plan : 1), 0);
      const exec = chegadas.filter((c) => naHora(c.chegada) && c.chegada <= agora).reduce((s, c) => s + (tipo === "pacotes" ? c.pacotes : 1), 0);
      linhas.push([br(iso), tipo, String(h).padStart(2, "0") + ":00 - " + String(h + 1).padStart(2, "0") + ":00", plan, exec, 0, resumo.aCaminho, resumo.chegaram, resumo.descarregando, resumo.finalizadas, em]);
    }
  }
  return linhas;
}

// --- historico de perda por ponto (30 dias) ----------------------------------

export const CULPA_DO_MOTIVO: Record<string, [string, string]> = {
  [MOTIVOS.fechado]: ["SELLER", "5.3 Local Cerrado on time, dentro geo Seller"],
  [MOTIVOS.naoPreparado]: ["SELLER", "9.8 Not prepared by seller"],
  [MOTIVOS.semEspaco]: ["ME", "1.1 Vehículo sin espacio"],
  [MOTIVOS.parcial]: ["ME", "7.2 No entran en el vehículo"],
  [MOTIVOS.inacessivel]: ["ME", "5.2 Pickup fuera de geo"],
};

function histPontos(): Celula[][] {
  const linhas: Celula[][] = [["PONTO", "NOME", "DIAS", "ESTIMADOS", "COLETADOS", "NAO_COLETADOS", "DIAS_COM_PERDA", "ULTIMA_PERDA", "CULPA_PRINCIPAL", "INCIDENTE_PRINCIPAL", "NAO_COLETADOS_DIA_ANTERIOR", "DIA_ANTERIOR"]];
  type Acc = { dias: number; est: number; col: number; perda: number; ultima: string; motivos: Map<string, number>; ontem: number };
  const acc = new Map<string, Acc>();
  const ontem = somarDias(hojeISO(), -1);
  for (const iso of diasAnteriores(hojeISO(), 30)) {
    const motivosDoDia = new Map<string, string[]>();
    for (const r of rotasCps(iso)) for (const p of r.paradas) if (p.motivo) motivosDoDia.set(p.ponto.id, [...(motivosDoDia.get(p.ponto.id) ?? []), p.motivo]);
    for (const [id, s] of saldosDoDia(iso)) {
      const a = acc.get(id) ?? { dias: 0, est: 0, col: 0, perda: 0, ultima: "", motivos: new Map(), ontem: 0 };
      a.dias++;
      a.est += s.est;
      a.col += s.col;
      const perda = Math.max(0, s.est - s.col);
      if (perda > 3) {
        a.perda++;
        a.ultima = iso;
      }
      if (iso === ontem) a.ontem = perda;
      for (const m of motivosDoDia.get(id) ?? []) a.motivos.set(m, (a.motivos.get(m) ?? 0) + 1);
      acc.set(id, a);
    }
  }
  for (const [id, a] of acc) {
    const principal = [...a.motivos.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const [culpa, incidente] = principal ? CULPA_DO_MOTIVO[principal] ?? ["", ""] : ["", ""];
    linhas.push([id, pontoPorId(id)?.nome ?? "", a.dias, a.est, a.col, Math.max(0, a.est - a.col), a.perda, a.ultima, culpa, incidente, a.ontem, ontem]);
  }
  return linhas;
}

export const ABAS_OPERACAO: Registro = {
  [HB]: {
    "Extração Config": extracaoConfig,
    "Extração Config D+1": extracaoConfigD1,
    Formulas: formulas,
  },
  [PRINCIPAL]: {
    MONITORING_SELLER: monitoringSeller,
    MONITORING_SELLER_ROTAS: monitoringSellerRotas,
    MONITOR_D0_TRATATIVAS: tratativas,
    MONITOR_D0_MOTIVOS: () => [["MOTIVO", "AUTOR", "CRIADO_EM"], ["Chuva forte na região", "Ana (CCO)", "01/10/2026 09:12"]],
    ROTAS_SISTEMA: rotasSistema,
    MELIONE_ENTREGAS: melioneEntregas,
    CURVA_SISTEMA: curvaSistema,
  },
  [PROCESSO]: {
    HIST_PONTOS_30D: histPontos,
    CURVA_CHEGADA: curvaChegada,
    CURVA_CHEGADA_HIST: curvaChegadaHist,
  },
};
