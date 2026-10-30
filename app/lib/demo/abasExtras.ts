// Abas de planejamento: scheduling (pedidos de veiculo), pool das
// transportadoras, sinergias e o controle de rotas avulsas.
import type { Celula } from "./planilhaFalsa";
import type { Registro } from "./gerador";
import {
  br, CLUSTERS, dia, diaDaSemana, diasAnteriores, hhmm, hojeISO, minutoSimulado, rng, somarDias, TRANSPORTADORAS,
  transportadorasDoCluster, type RotaDia,
} from "./mundo";
import { etaDaRota, rotasCps } from "./abasOperacao";
import { AVULSAS, carimbo, carimboAgora, POOL, PRINCIPAL } from "./util";

// --- scheduling ---------------------------------------------------------------

const MOTIVOS_RECUSA = ["Sem veículo disponível", "Motorista indisponível", "Perfil não disponível na frota", "Manutenção do veículo"];
const CAB_SCHED = ["DATA", "TRAVEL_ID", "TRANSPORTADORA", "STATUS", "MOTIVO", "PERFIL", "ZONA", "ETA", "DESTINO"];

// Um pedido por rota planejada (rota regular, dedicada). Recusa vira um
// segundo pedido para outra transportadora.
function pedidosDoDia(iso: string): Celula[][] {
  const hoje = hojeISO();
  const distancia = Math.round((Date.parse(iso) - Date.parse(hoje)) / 86400000);
  const saida: Celula[][] = [];
  const sabado = diaDaSemana(iso) === 6;
  const pedidas = rotasCps(iso).filter((r) => !r.avulsa && r.tipo === "first_mile");
  pedidas.forEach((r: RotaDia, k) => {
    const x = rng("sched" + iso + r.nome);
    const zona = r.cluster + "_CPS" + (sabado ? "_SABADO" : "");
    const travel = String(7_000_000 + (Date.parse(iso) / 86400000) * 500 + k);
    const eta = hhmm(r.start);
    const tp = r.emAberto ? transportadorasDoCluster(r.cluster)[0] : r.transportadora;
    let status = "accepted";
    if (distancia >= 3) status = x.chance(0.55) ? "defined" : x.chance(0.9) ? "accepted" : "rejected";
    else if (distancia >= 1) status = x.chance(0.12) ? "defined" : x.chance(0.9) ? "accepted" : "rejected";
    else status = r.emAberto ? "rejected" : x.chance(0.95) ? "accepted" : x.chance(0.5) ? "canceled" : "rejected";
    if (distancia < 0) status = r.emAberto ? "rejected" : x.chance(0.93) ? "accepted" : x.chance(0.4) ? "canceled" : "rejected";
    saida.push([br(iso), travel, tp, status, status === "rejected" ? x.pick(MOTIVOS_RECUSA) : "", r.perfil, zona, eta, "CAMPINAS"]);
    if (status === "rejected" && !r.emAberto) {
      const outra = transportadorasDoCluster(r.cluster).find((t) => t !== tp) ?? TRANSPORTADORAS[0];
      saida.push([br(iso), travel + "1", outra, distancia > 0 && x.chance(0.4) ? "defined" : "accepted", "", r.perfil, zona, eta, "CAMPINAS"]);
    }
  });
  return saida;
}

const scheduling = () => [CAB_SCHED, ...[0, 1, 2, 3, 4].flatMap((n) => pedidosDoDia(somarDias(hojeISO(), n)))];
const historicoScheduling = () => [CAB_SCHED, ...diasAnteriores(hojeISO(), 40).flatMap(pedidosDoDia)];

// Recusas que chegaram depois das 11h da vespera (atrapalham o planejamento).
function recusasPos11h(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "TRAVEL_ID", "TRANSPORTADORA", "ZONA", "ETA", "DETECTADA_EM"]];
  for (const iso of [...diasAnteriores(hojeISO(), 20), hojeISO(), somarDias(hojeISO(), 1)]) {
    for (const l of pedidosDoDia(iso)) {
      if (l[3] !== "rejected") continue;
      const x = rng("pos11" + l[1]);
      if (!x.chance(0.35)) continue;
      linhas.push([l[0], l[1], l[2], l[6], l[7], carimbo(somarDias(iso, -1), 11 * 60 + x.int(5, 300))]);
    }
  }
  return linhas;
}

function recusasBase11h(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "BASE_EM"]];
  for (const iso of [...diasAnteriores(hojeISO(), 20), hojeISO(), somarDias(hojeISO(), 1)]) linhas.push([br(iso), carimbo(somarDias(iso, -1), 11 * 60 + 2)]);
  return linhas;
}

// --- pool das transportadoras --------------------------------------------------

// Pool declarado: o tipico de rotas que a transportadora roda em cada
// cluster/perfil, com folga (ou falta) de um carro.
function linhasPool(): Celula[][] {
  const conta = new Map<string, { seg: number[]; sab: number[] }>();
  for (const iso of diasAnteriores(hojeISO(), 21)) {
    const sab = diaDaSemana(iso) === 6;
    if (diaDaSemana(iso) === 0) continue;
    const doDia = new Map<string, number>();
    for (const r of rotasCps(iso)) {
      if (r.avulsa || r.tipo !== "first_mile" || r.emAberto) continue;
      const k = r.transportadora + "|" + r.cluster + "|" + r.perfil;
      doDia.set(k, (doDia.get(k) ?? 0) + 1);
    }
    for (const [k, n] of doDia) {
      const c = conta.get(k) ?? { seg: [], sab: [] };
      (sab ? c.sab : c.seg).push(n);
      conta.set(k, c);
    }
  }
  const media = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0);
  const linhas: Celula[][] = [];
  for (const [k, c] of [...conta.entries()].sort()) {
    const [tp, cluster, perfil] = k.split("|");
    const x = rng("pool" + k);
    const ajuste = x.chance(0.2) ? -1 : x.chance(0.25) ? 1 : 0;
    linhas.push([tp, "CPS", cluster, perfil, Math.max(0, media(c.seg) + ajuste), media(c.sab)]);
  }
  return linhas;
}

function abaPool(): Celula[][] {
  return [
    ["TRANSPORTADOR", "HUB", "CLUSTER", "PERFIL_VEICULO", "POOL SEG-SEX", "POOL SABADO", "Atualizado em " + carimbo(somarDias(hojeISO(), -2), 17 * 60)],
    ...linhasPool(),
  ];
}

// Sinergias: em quais outros clusters a transportadora consegue cobrir falta.
function sinergias(): Celula[][] {
  const linhas: Celula[][] = [["Sinergias entre clusters"], ["MLP", "HUB", "CLUSTER", "TOP1", "TOP2", "TOP3"]];
  CLUSTERS.forEach((c, i) => {
    for (const tp of transportadorasDoCluster(c.codigo)) {
      const viz = [CLUSTERS[(i + 1) % CLUSTERS.length].codigo, CLUSTERS[(i + CLUSTERS.length - 1) % CLUSTERS.length].codigo, CLUSTERS[(i + 2) % CLUSTERS.length].codigo];
      linhas.push([tp, "CPS", c.codigo, ...viz]);
    }
  });
  return linhas;
}

// Abas semanais W1..W53 (a tela abre a da semana da data).
const ABAS_POOL: Record<string, () => Celula[][]> = { Sinergias: sinergias, Instruções: () => [["Pool semanal por transportadora"]] };
for (let w = 1; w <= 53; w++) ABAS_POOL["W" + String(w).padStart(2, "0")] = abaPool;

// --- avulsas -------------------------------------------------------------------

const MOTIVOS_AVULSA = ["Backlog", "NSE", "Backlog drop off", "Erro config", "NS driver", "Área inacessível"];
const CRIADORES = ["Ana (CCO)", "Bruno (Exec)", "Carla (Place)"];

function controleAvulsas(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "TRANSPORTADORA", "ID", "MOTIVO", "PAGAMENTO", "Criador", "CLUSTER", "ROTA IMPACTADA", "MLP IMPACTADO", "PAGAMENTO", "LINK", "OBS"]];
  for (const iso of [...diasAnteriores(hojeISO(), 40), hojeISO()]) {
    for (const r of dia(iso).rotas) {
      if (!r.avulsa) continue;
      const x = rng("ctrl" + r.id);
      if (iso === hojeISO() && (r.start > minutoSimulado(iso) || x.chance(0.4))) continue;
      if (!x.chance(0.9)) continue;
      const m = r.origem?.motivo ?? "";
      const motivo = /espaço|cabem|Parcial/.test(m) ? "NSE" : /inacess/i.test(m) ? "Área inacessível" : /preparados/.test(m) ? "Backlog drop off" : x.chance(0.7) ? "Backlog" : x.pick(MOTIVOS_AVULSA);
      linhas.push([
        br(iso), r.transportadora, r.id, motivo, motivo === "NSE" || motivo === "NS driver" ? "Não pagar" : "Pagar", x.pick(CRIADORES), r.cluster,
        r.origem?.rota ?? "", r.origem?.transportadora ?? "", iso < hojeISO() ? (x.chance(0.85) ? "Aprovado" : "Reprovado") : "Pendente", "", "",
      ]);
    }
  }
  return linhas;
}

function historicoColetaAvulsas(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ID", "TRANSPORTADORA", "COLETADO", "PACOTES_COLETADOS"]];
  for (const iso of diasAnteriores(hojeISO(), 40)) {
    for (const r of dia(iso).rotas) {
      if (!r.avulsa) continue;
      const pac = r.paradas.reduce((s, p) => s + p.coletados, 0);
      linhas.push([br(iso), r.id, r.transportadora, pac > 0 ? "Sim" : "Não", pac]);
    }
  }
  return linhas;
}

void etaDaRota;
void carimboAgora;

export const ABAS_EXTRAS: Registro = {
  [PRINCIPAL]: {
    SCHEDULING: scheduling,
    HISTORICO_SCHEDULING: historicoScheduling,
    RECUSAS_POS_11H: recusasPos11h,
    RECUSAS_BASE_11H: recusasBase11h,
  },
  [POOL]: ABAS_POOL,
  [AVULSAS]: {
    "CONTROLE DE AVULSAS": controleAvulsas,
    HISTORICO_COLETA_AVULSAS: historicoColetaAvulsas,
  },
};
