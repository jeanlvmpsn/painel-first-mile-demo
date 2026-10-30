// Abas de Dedicada, Upgrade e Capacidade.
import type { Celula } from "./planilhaFalsa";
import type { Registro } from "./gerador";
import {
  br, CLUSTERS, dia, diasAnteriores, hash, hhmm, hojeISO, minutoSimulado, pontos, rng, somarDias, visitada, type Ponto,
} from "./mundo";
import { etaDaRota, rotasCps, saldosDoDia } from "./abasOperacao";
import { carimbo, carimboAgora, PRINCIPAL, PROCESSO, UPGRADE_BASE, UPGRADE_ORIGINAL } from "./util";
import municipios from "../municipiosCps.json" with { type: "json" };
import { municipioDoPonto } from "../municipios";

// --- dedicadas -------------------------------------------------------------------

const pontosDedicados = () => {
  const ids = new Set<string>();
  for (const iso of diasAnteriores(hojeISO(), 30)) for (const r of dia(iso).rotas) if (r.dedicada) for (const p of r.paradas) ids.add(p.ponto.id);
  return pontos().filter((p) => ids.has(p.id));
};

function cadastroDedicadas(): Celula[][] {
  const linhas: Celula[][] = [["CHAVE", "CLUSTER", "IDS", "NOMES", "PRIMEIRA_VEZ", "ULTIMA_VEZ", "ALIASES"]];
  for (const p of pontosDedicados()) {
    const nomes = new Set<string>();
    for (const iso of diasAnteriores(hojeISO(), 30)) for (const r of dia(iso).rotas) if (r.dedicada && r.paradas.some((x) => x.ponto.id === p.id)) nomes.add(r.nome);
    linhas.push([p.id, p.cluster, p.id, [...nomes].slice(0, 5).join(" | "), br(somarDias(hojeISO(), -60)), br(somarDias(hojeISO(), -1)), ""]);
  }
  return linhas;
}

function histDedicadas(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "CHAVE", "CLUSTER", "ROTA", "ROTA_ID", "TRANSPORTADORA", "IDS", "ESTIMADOS", "COLETADOS", "PU", "STATUS", "HORA_COLETA", "PONTUALIDADE", "OCS", "GRAVADO_EM", "CARROS"]];
  for (const iso of diasAnteriores(hojeISO(), 30)) {
    for (const p of pontosDedicados()) {
      const rotas = rotasCps(iso).filter((r) => r.paradas.some((x) => x.ponto.id === p.id));
      const ded = rotas.filter((r) => r.dedicada);
      if (!ded.length) continue;
      const passagens = rotas.flatMap((r) => r.paradas.filter((x) => x.ponto.id === p.id).map((x) => ({ r, x })));
      const est = passagens.filter(({ r }) => !r.avulsa).reduce((s, { x }) => s + x.estimados, 0);
      const col = Math.min(est, passagens.reduce((s, { x }) => s + (x.coletados || 0), 0));
      const ns = ded.every((r) => r.ns);
      const status = ns ? "ns" : col >= est * 0.98 ? "completa" : "parcial";
      const primeira = passagens.filter(({ r }) => !r.ns).sort((a, b) => a.x.horaReal - b.x.horaReal)[0];
      const carros = passagens
        .filter(({ r }) => !r.ns)
        .map(({ r, x }) => [r.nome || "Avulsa " + r.id, r.id, hhmm(p.janelaIni) + " a " + hhmm(p.janelaFim) + " hs", hhmm(x.horaReal), x.coletados, r.dedicada ? 1 : 0].join("|"))
        .join(" ; ");
      linhas.push([
        br(iso), p.id, p.cluster, ded[0].nome, ded[0].id, ded[0].transportadora, p.id, est, col, est ? Number((col / est).toFixed(4)) : "",
        status, primeira ? hhmm(primeira.x.horaReal) : "", primeira?.x.pontualidade ?? "", [...new Set(passagens.map(({ x }) => x.motivo).filter(Boolean))].join(" | "),
        carimbo(iso, 23 * 60 + 30), carros,
      ]);
    }
  }
  return linhas;
}

function nomesDedicadas(): Celula[][] {
  const linhas: Celula[][] = [["CHAVE", "IDS", "APELIDO", "AUTOR", "ATUALIZADO_EM"]];
  const ded = pontosDedicados();
  if (ded[0]) linhas.push([ded[0].id, ded[0].id, "DED " + ded[0].cluster + " · " + ded[0].nome.toUpperCase(), "Ana (CCO)", "12/10/2026 10:20"]);
  return linhas;
}

// Base de 30 dias por ponto (estimado x coletado), para o grafico da dedicada.
function baseDedicadas30d(): Celula[][] {
  const linhas: Celula[][] = [["DIA", "PONTO", "ESTIMADOS", "COLETADOS", "NOME"]];
  const ids = new Set(pontosDedicados().map((p) => p.id));
  for (const iso of diasAnteriores(hojeISO(), 30)) {
    for (const [id, s] of saldosDoDia(iso)) if (ids.has(id)) linhas.push([iso, id, s.est, s.col, ""]);
  }
  return linhas;
}

// --- upgrade (sellers que dropam em agencia) -----------------------------------

type SellerDrop = { id: string; nick: string; peso: number };

const NICKS_A = ["LOJA", "CASA", "MEGA", "SUPER", "VIA", "BOX", "TOP", "PRIME", "MAIS", "NOVA"];
const NICKS_B = ["PRESENTES", "DECOR", "TECH", "FIT", "PET", "BABY", "AUTO", "FERRAMENTAS", "MODA", "GAMER", "LUZ", "COZINHA"];

// Sellers de cada agencia: alguns grandes (candidatos a upgrade).
function sellersDaAgencia(p: Ponto): SellerDrop[] {
  const x = rng("drop" + p.id);
  const n = Math.max(4, Math.min(28, Math.round(p.media / 6)));
  const lista: SellerDrop[] = [];
  for (let i = 0; i < n; i++) {
    const grande = i < 2 && x.chance(0.6);
    lista.push({ id: String(x.int(100000000, 1999999999)), nick: x.pick(NICKS_A) + x.pick(NICKS_B) + (x.chance(0.4) ? "_" + x.int(1, 99) : ""), peso: grande ? 4 + x() * 6 : 0.3 + x() * 1.5 });
  }
  const total = lista.reduce((s, l) => s + l.peso, 0);
  for (const l of lista) l.peso /= total;
  return lista;
}

const agencias = () => pontos().filter((p) => p.ehPlace);

function candidatos(): Celula[][] {
  const linhas: Celula[][] = [["route_date", "shp_sender_id", "shp_sender_nickname", "SHP_RELATED_ENTITY_ID", "SHP_LG_CUST_DISPLAY_NAME", "total_estimados", "total_coletados", "shp_sender_state_id", "cluster"]];
  for (const iso of diasAnteriores(hojeISO(), 35)) {
    const saldos = saldosDoDia(iso);
    for (const p of agencias()) {
      const s = saldos.get(p.id);
      if (!s || !s.est) continue;
      for (const sel of sellersDaAgencia(p)) {
        const est = Math.round(s.est * sel.peso * (0.8 + rng(sel.id + iso)() * 0.4));
        if (!est) continue;
        const col = Math.round(est * (s.col / s.est));
        linhas.push([iso, sel.id, sel.nick, p.id, p.nome, est, col, "BR-SP", p.cluster.slice(1)]);
      }
    }
  }
  return linhas;
}

function placesDia(): Celula[][] {
  const linhas: Celula[][] = [["route_date", "SHP_RELATED_ENTITY_ID", "SHP_LG_CUST_DISPLAY_NAME", "total_estimados", "total_coletados", "sellers"]];
  for (const iso of diasAnteriores(hojeISO(), 35)) {
    const saldos = saldosDoDia(iso);
    for (const p of agencias()) {
      const s = saldos.get(p.id);
      if (s?.est) linhas.push([iso, p.id, p.nome, s.est, s.col, sellersDaAgencia(p).length]);
    }
  }
  return linhas;
}

// Solicitacoes ja feitas pelo time e a resposta da base original.
const SOLICITANTES = ["Ana (CCO)", "Carla (Place)", "Diego (Planejamento)"];

function solicitadosAntes() {
  const saida: { sel: SellerDrop; p: Ponto; estado: "pendente" | "solicitado" | "aceito" | "recusado" }[] = [];
  for (const p of agencias()) {
    const grandes = sellersDaAgencia(p).filter((s) => s.peso > 0.2);
    for (const sel of grandes) {
      const x = rng("sol" + sel.id);
      if (!x.chance(0.45)) continue;
      saida.push({ sel, p, estado: x.pick(["pendente", "solicitado", "aceito", "aceito", "recusado"] as const) });
    }
  }
  return saida;
}

function solicitacoes(): Celula[][] {
  const linhas: Celula[][] = [["ID SELLER SENDER", "NOME SELLER SENDER", "K74", "NOME PLACE", "ESTADO DO SELLER", "UP ou DOWN ?", "MOTIVO", "SE FOR VOLUMOSO, TEM EVIDENCIAS?", "SOLICITANTE", "LINK DA EVIDENCIA", "STATUS", "STATUS FINAL", "RESULTADO", "FEEDBACK", "PRAZO ATIVAÇÃO"]];
  for (const s of solicitadosAntes()) {
    linhas.push([
      s.sel.id, s.sel.nick, s.p.id, s.p.nome, "SP", "UP", "alta volumetria (>20pcts/dia)", "", rng("q" + s.sel.id).pick(SOLICITANTES), "https://exemplo.com/evidencia.pdf",
      s.estado === "pendente" ? "Pendente" : "Solicitado", "", "", "", "",
    ]);
  }
  return linhas;
}

function respostasOriginais(): Celula[][] {
  const linhas: Celula[][] = [["Carimbo de data/hora", "Seller_id", "SOLICITACAO", "STATUS FINAL", "RESULTADO", "FEEDBACK", "PRAZO ATIVAÇÃO"]];
  for (const s of solicitadosAntes()) {
    if (s.estado !== "aceito" && s.estado !== "recusado") continue;
    const x = rng("orig" + s.sel.id);
    linhas.push([
      carimbo(somarDias(hojeISO(), -x.int(2, 20)), x.int(9 * 60, 17 * 60)), s.sel.id, "UPGRADE",
      s.estado === "aceito" ? "Processado" : "Recusado",
      s.estado === "recusado" ? x.pick(["Seller abaixo do volume mínimo", "Endereço fora da área de coleta", "Seller já possui coleta"]) : "",
      "", s.estado === "aceito" ? br(somarDias(hojeISO(), x.int(1, 10))) : "",
    ]);
  }
  return linhas;
}

// --- capacidade --------------------------------------------------------------------

function capacidadeVeiculos(): Celula[][] {
  return [
    ["SHP_LG_VEHICLE_TYPE", "SHP_LG_VEHICLE_TYPE_STATUS", "SHP_LG_VEHICLE_WEIGHT", "SHP_LG_VEHICLE_CAPACITY"],
    ["VUC Fixo", "active", 2200, 16],
    ["Van Fixo", "active", 1500, 9],
    ["HR Fixo", "active", 1950, 11.7],
    ["3/4 Fixo", "active", 3500, 25],
    ["Utilitário Fixo", "active", 500, 2],
    ["Express VUC", "active", 2000, 14],
  ];
}

function cidadesApoio(): Celula[][] {
  return [
    ["CIDADE_DA_ROTA", "PODE_APOIAR"],
    ["Sumaré", "Hortolândia"],
    ["Hortolândia", "Sumaré"],
    ["Valinhos", "Vinhedo"],
    ["Vinhedo", "Valinhos"],
    ["Americana", "Santa Bárbara d'Oeste"],
    ["Indaiatuba", "Salto"],
    ["Jundiaí", "Itupeva"],
    ["Paulínia", "Cosmópolis"],
    ["Limeira", "Cordeirópolis"],
    ["Mogi Mirim", "Mogi Guaçu"],
  ];
}

// Coordenada dentro do municipio do ponto (para a planificacao).
const LISTA_MUN = municipios as { nome: string; uf: string; bbox: number[] }[];
const coordCache = new Map<string, [number, number]>();
function coordenada(p: Ponto): [number, number] {
  const c = coordCache.get(p.id);
  if (c) return c;
  const m = LISTA_MUN.find((x) => x.nome === p.cidade && x.uf === "SP");
  const x = rng("geo" + p.id);
  let achada: [number, number] = [-22.9, -47.06];
  if (m) {
    const [x0, y0, x1, y1] = m.bbox;
    for (let i = 0; i < 60; i++) {
      const lat = y0 + (y1 - y0) * x();
      const lng = x0 + (x1 - x0) * x();
      if (municipioDoPonto(lat, lng) === m.nome + "/" + m.uf) {
        achada = [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
        break;
      }
    }
  }
  coordCache.set(p.id, achada);
  return achada;
}

function planificacao(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ROTA", "CLUSTER", "ID_PARADA", "LAT", "LNG"]];
  for (const iso of [hojeISO(), somarDias(hojeISO(), 1)]) {
    for (const r of rotasCps(iso)) {
      if (r.avulsa) continue;
      for (const p of r.paradas) {
        const [lat, lng] = coordenada(p.ponto);
        linhas.push([br(iso), r.nome, r.cluster, p.ponto.id, String(lat), String(lng)]);
      }
    }
  }
  return linhas;
}

// Previsao de pacotes por ponto (replanejamento) para hoje e amanha.
function replanejamento(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ID_SELLER", "PACOTES", "VOLUME_M3", "PESO_KG", "CIDADE", "UF_ID", "UF_NOME", "ATUALIZADO_EM"]];
  const em = carimbo(hojeISO(), 6 * 60 + 40);
  for (const iso of [hojeISO(), somarDias(hojeISO(), 1)]) {
    for (const [id, s] of saldosDoDia(iso)) {
      const p = pontos().find((x) => x.id === id);
      if (!p || !s.est) continue;
      const x = rng("prev" + id + iso);
      const pac = Math.max(1, Math.round(s.est * (0.85 + x() * 0.35)));
      const fator = 0.8 + rng("carga" + id)() * 0.6;
      linhas.push([iso, id, pac, (pac * 0.0145 * fator).toFixed(3), (pac * 1.5 * fator).toFixed(1), p.cidade, "SP", "São Paulo", em]);
    }
  }
  return linhas;
}

// --- acoes e comentarios ja registrados pelo time ------------------------------

const ACOES_TEXTO: Record<string, string> = {
  Capacidade: "Pedir VUC no lugar da Van nesta rota e reavaliar em uma semana.",
  Horário: "Alinhado com o seller abrir 30 min antes da janela.",
  Comportamental: "Feedback para a transportadora sobre a passagem antes da janela.",
  Volumoso: "Separar volumosos em rota própria às sextas.",
  "Área inacessível": "Mudar o ponto de parada para a rua lateral.",
};

function acoesPontos(): Celula[][] {
  const linhas: Celula[][] = [["ID_PARADA", "VERSAO", "REGISTRADO_EM", "AUTOR", "PONTO", "CLUSTER", "CAUSA", "STATUS", "ACAO", "DIA_IMPACTO", "EXCLUIDO", "ID_DIRECIONAL", "NOME_DIRECIONAL", "RESPONSAVEL"]];
  const problematicos = pontos().filter((p) => p.problematico).slice(0, 14);
  problematicos.forEach((p, i) => {
    const x = rng("acao" + p.id);
    const causa = x.pick(Object.keys(ACOES_TEXTO));
    const diasAtras = 1 + (i % 6);
    const dia = somarDias(hojeISO(), -diasAtras);
    linhas.push([p.id, 1, carimbo(dia, 10 * 60 + i * 13), x.pick(SOLICITANTES), p.nome, p.cluster, causa, "A tratar", ACOES_TEXTO[causa], br(dia), "", "", "", x.pick(["Exec", "CCO", "Place", "Routing"])]);
    if (x.chance(0.6)) {
      linhas.push([p.id, 2, carimbo(somarDias(dia, 1), 9 * 60 + i * 7), x.pick(SOLICITANTES), p.nome, p.cluster, causa, x.pick(["Em tratativa", "Resolvido"]), ACOES_TEXTO[causa], br(dia), "", "", "", x.pick(["Exec", "CCO", "Place"])]);
    }
  });
  return linhas;
}

function comentariosPd(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ID_PARADA", "PONTO", "CLUSTER", "OBS", "COMENTARIO", "AUTOR", "REGISTRADO_EM"]];
  const iso = hojeISO();
  let n = 0;
  for (const r of rotasCps(iso)) {
    for (const p of r.paradas) {
      if (!visitada(p, iso) || !p.motivo || n >= 10) continue;
      const x = rng("com" + p.ponto.id);
      if (!x.chance(0.5)) continue;
      n++;
      linhas.push([br(iso), p.ponto.id, p.ponto.nome, p.ponto.cluster, "", x.pick(["Seller avisado, reabre às 15h.", "Transportadora vai retornar no fim da rota.", "Pedido de avulsa aberto.", "Conferir amanhã se o volume se repete."]), x.pick(SOLICITANTES), carimbo(iso, Math.min(minutoSimulado(iso), p.horaReal + 40))]);
    }
  }
  return linhas;
}

// Plano de cada dia passado (a Extracao Config so tem o dia corrente).
function historicoConfig(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ROTA", "TRANSPORTADORA", "CLUSTER", "ETA", "PACOTES", "ATUALIZADO_EM"]];
  for (const iso of diasAnteriores(hojeISO(), 31)) {
    for (const r of rotasCps(iso)) {
      if (r.avulsa) continue;
      linhas.push([br(iso), r.nome, r.transportadora, r.cluster, hhmm(etaDaRota(r)), String(r.paradas.reduce((s, p) => s + p.estimados, 0)), carimbo(iso, 7 * 60)]);
    }
  }
  return linhas;
}

void minutoSimulado;
void visitada;
void hash;
void CLUSTERS;
void carimboAgora;

export const ABAS_MAIS: Registro = {
  [PRINCIPAL]: {
    DEDICADAS: cadastroDedicadas,
    DEDICADAS_HIST: histDedicadas,
    DEDICADAS_NOMES: nomesDedicadas,
    CAPACIDADE_VEICULOS: capacidadeVeiculos,
    CIDADES_APOIO: cidadesApoio,
    PLANIFICACAO: planificacao,
    ACOES_PONTOS: acoesPontos,
    ACOES_CAUSAS: () => [["CAUSA", "AUTOR", "CRIADO_EM"]],
    ACOES_RESPONSAVEIS: () => [["RESPONSAVEL", "AUTOR", "CRIADO_EM"]],
    PD_COMENTARIOS: comentariosPd,
    MAPEAMENTO_STATUS: () => [["DATA", "ID_PARADA", "STATUS", "AUTOR", "REGISTRADO_EM"]],
    NS_DRIVER_STATUS: () => [["DATA", "ROTA", "ROTA_ID", "STATUS", "AUTOR", "REGISTRADO_EM"]],
    GAP_ROTAS_AJUSTES: () => [["DATA", "ROTA", "ID_PARADA", "ACAO", "AUTOR", "REGISTRADO_EM"]],
    HISTORICO_CONFIG: historicoConfig,
  },
  [PROCESSO]: {
    HIST_DEDICADAS_30D: baseDedicadas30d,
    REPLANEJAMENTO: replanejamento,
    SOLICITACOES_UPGRADE: solicitacoes,
    FILA_UPGRADE: () => [["PEDIDO", "CRIADO_EM", "SELLER_ID", "PLACE_ID", "INICIO", "FIM", "LINHA_SOLICITACAO", "STATUS", "LINK", "ERRO", "CATEGORIA"]],
  },
  [UPGRADE_BASE]: {
    CANDIDATOS_UPGRADE: candidatos,
    PLACES_DIA: placesDia,
    INFO: () => [["ATUALIZADO_EM", carimbo(hojeISO(), 7 * 60 + 15)]],
  },
  [UPGRADE_ORIGINAL]: {
    "Form_Responses hard first mile": respostasOriginais,
  },
};
