// Abas centrais da planilha principal: atribuicao, Forms, relatorio de
// coleta e os historicos dessas fontes.
import type { Celula } from "./planilhaFalsa";
import type { Registro } from "./gerador";
import {
  br, brTraco, dia, diasAnteriores, hash, hhmm, hojeISO, minutoSimulado, nomeDaRota, PERFIS_VEICULO, rng, rotaComecou,
  rotaTerminou, somarDias, visitada, type RotaDia,
} from "./mundo";
import { ateQuando, carimbo, carimboAgora, PRINCIPAL } from "./util";

const DIAS_HIST = 40;

const capacidade = (perfil: string) => PERFIS_VEICULO.find((p) => p.perfil === perfil)?.cap ?? 0;

// Rotas que aparecem na tela de atribuicao (avulsa nao entra).
const rotasAtribuidas = (iso: string) => dia(iso).rotas.filter((r) => !r.avulsa);

// Em D+1 / D+2 parte das rotas ainda esta sem veiculo.
function placaNoDia(r: RotaDia, iso: string): string {
  if (!r.motorista) return "não atribuído";
  const futuro = iso > hojeISO();
  if (futuro) {
    const dias = iso === somarDias(hojeISO(), 1) ? 0.72 : 0.4;
    if (rng(r.nome + iso).chance(1 - dias)) return "não atribuído";
  }
  return r.motorista.placa;
}

function linhaAtribuicao(r: RotaDia, iso: string): Celula[] {
  const placa = placaNoDia(r, iso);
  const comVeiculo = placa !== "não atribuído";
  const veiculo = comVeiculo ? r.veiculo : "";
  const menor = comVeiculo && r.motorista ? capacidade(r.motorista.perfil.perfil) < capacidade(r.perfil) : false;
  return [
    br(iso),
    r.nome,
    hhmm(r.start),
    r.transportadora,
    placa,
    r.hub,
    comVeiculo ? r.motorista!.nome : "",
    comVeiculo ? "assigned" : "not_assigned",
    comVeiculo ? (rng("st" + r.nome + iso).chance(0.9) ? "accepted" : "pending") : "not_assigned",
    r.tipo,
    r.perfil,
    veiculo,
    comVeiculo ? (menor ? "SIM" : "NÃO") : "",
  ];
}

function atribuicao(): Celula[][] {
  const h = hojeISO();
  const cab = ["DATA", "ROTA", "START", "TRANSPORTADORA", "PLACA", "HUB", "MOTORISTA", "STATUS_VEICULO", "STATUS_MOTORISTA", "TIPO_ROTA", "PERFIL", "VEICULO", "PERFIL_MENOR"];
  const linhas: Celula[][] = [cab];
  for (const iso of [h, somarDias(h, 1), somarDias(h, 2)]) {
    for (const r of rotasAtribuidas(iso)) linhas.push(linhaAtribuicao(r, iso));
  }
  return linhas;
}

function historicoAtribuicao(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ROTA", "START", "TRANSPORTADORA", "PLACA", "HUB", "MOTORISTA", "STATUS_MOTORISTA", "TIPO_ROTA", "PERFIL", "VEICULO"]];
  for (const iso of diasAnteriores(hojeISO(), DIAS_HIST)) {
    for (const r of rotasAtribuidas(iso)) {
      const l = linhaAtribuicao(r, iso);
      linhas.push([l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[8], l[9], l[10], l[11]]);
    }
  }
  return linhas;
}

function carimbos(): Celula[][] {
  return [
    ["Painel", "Status"],
    ["Ultima atualizacao atribuicao", "OK — rotas do dia gravadas — " + carimboAgora(6)],
    ["Ultima atualizacao", "OK — relatório de coleta — " + carimboAgora(4)],
    ["Ultima atualizacao scheduling", "OK — pedidos de veículo — " + carimboAgora(12)],
    ["Ultima atualizacao avulsas", "OK — rotas avulsas — " + carimboAgora(9)],
    ["Ultima atualizacao reports", "OK — reports — " + carimboAgora(6)],
    ["Ultima atualizacao forms", "OK — respostas do Forms — " + carimboAgora(3)],
    ["Tutorial", ""],
  ];
}

// --- Forms de final de rota ------------------------------------------------

function respostasDoDia(iso: string): Celula[][] {
  const saida: Celula[][] = [];
  const agora = minutoSimulado(iso);
  for (const r of dia(iso).rotas) {
    if (r.ns || r.hub !== "CPS" || !r.respondeForms || !r.motorista) continue;
    if (!rotaTerminou(r, iso)) continue;
    const fim = Math.max(...r.paradas.map((p) => p.horaReal));
    const x = rng("forms" + r.id);
    const quando = fim + x.int(20, 120);
    if (quando > agora && iso === hojeISO()) continue;
    const isoCarimbo = quando >= 24 * 60 ? somarDias(iso, 1) : iso;
    if (isoCarimbo > hojeISO()) continue;
    const idTexto = r.avulsa || x.chance(0.85) ? r.id : x.chance(0.5) ? r.nome + " " + r.id : r.nome;
    saida.push([
      carimbo(isoCarimbo, quando % (24 * 60), x.int(0, 59)),
      "motorista" + (hash(r.motorista.id) % 900 + 100) + "@exemplo.com",
      br(iso),
      r.transportadora,
      r.avulsa ? "AVULSA" : x.chance(0.95) ? r.nome : r.nome.replace("CAMPINAS_", "CPS_"),
      r.motorista.perfil.veiculo,
      r.motorista.placa,
      "/demo/foto-bau.svg",
      r.estouro ? "Sim" : "Não",
      idTexto,
    ]);
  }
  return saida;
}

function respostas(): Celula[][] {
  const cab = ["Carimbo de data/hora", "Endereço de e-mail", "Data de execução da rota", "TRANSPORTADORA", "Nome da rota", "Perfil do veículo", "Placa", "Foto do Baú", "A rota deu estouro?", "ID da rota"];
  const linhas: Celula[][] = [cab];
  for (const iso of [...diasAnteriores(hojeISO(), DIAS_HIST), hojeISO()]) linhas.push(...respostasDoDia(iso));
  return linhas;
}

// --- Relatorio de coleta (COLETAS_D0) ---------------------------------------

export const CAB_COLETAS = [
  "ID do Rota", "Nome da Rota", "ID de Parada", "Parada", "Pacotes estimados", "Pacotes preparados",
  "Pacotes coletados", "Motivo", "Pacotes não preparados/Não estão na agência", "Pacotes não cabem no veículo",
  "Fora de área", "Planejado", "Data da rota", "Pontualidade", "Transportadora", "Hora de coleta concluída",
  "Conformidade Handshake", "Horários", "ID do motorista",
];

// Linhas do relatorio de um dia (so rotas que ja comecaram e sairam).
export function linhasColeta(iso: string): Celula[][] {
  const saida: Celula[][] = [];
  for (const r of dia(iso).rotas) {
    if (r.ns || r.hub !== "CPS" || !rotaComecou(r, iso)) continue;
    for (const p of r.paradas) {
      const foi = visitada(p, iso);
      const janela = hhmm(p.ponto.janelaIni) + " a " + hhmm(p.ponto.janelaFim) + " hs";
      saida.push([
        r.id,
        r.nome,
        p.ponto.id,
        p.ponto.nome,
        p.estimados,
        foi ? p.preparados : "",
        foi ? p.coletados : "",
        foi ? p.motivo : "",
        foi ? p.naoPreparados : "",
        foi ? p.naoCabem : "",
        foi ? (p.foraDeArea ? "Sim" : "Não") : "",
        p.planejada ? "Sim" : "Não",
        brTraco(iso),
        foi ? hhmm(p.horaReal) + "hs - " + p.pontualidade : "",
        r.transportadora,
        foi && p.coletados > 0 ? hhmm(p.horaReal + 4) : "",
        foi ? p.handshake : "",
        janela,
        r.motorista?.id ?? "",
      ]);
    }
  }
  return saida;
}

function coletasD0(): Celula[][] {
  return [CAB_COLETAS, ...linhasColeta(hojeISO())];
}

function historicoColetas(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "NOME_ROTA", "ID_ROTA", "TRANSPORTADORA", "PARADAS", "PACOTES_COLETADOS", "PACOTES_ESTIMADOS", "MOTIVO", "ATUALIZADO_EM", "SEM_ESPACO", "NAO_PLANEJADAS", "PARADAS_CEDO", "PARADAS_TARDE"]];
  for (const iso of diasAnteriores(hojeISO(), DIAS_HIST)) {
    for (const r of dia(iso).rotas) {
      if (r.ns || r.hub !== "CPS" || !r.paradas.length) continue;
      const motivos = [...new Set(r.paradas.map((p) => p.motivo).filter(Boolean))];
      linhas.push([
        br(iso),
        nomeDaRota(r),
        r.id,
        r.transportadora,
        r.paradas.length,
        r.paradas.reduce((s, p) => s + p.coletados, 0),
        r.paradas.reduce((s, p) => s + p.estimados, 0),
        motivos.join(", "),
        carimbo(somarDias(iso, 1), 3 * 60 + 30),
        r.paradas.filter((p) => p.motivo === "Não tenho mais espaço").length,
        r.paradas.filter((p) => !p.planejada).length,
        r.paradas.filter((p) => p.pontualidade === "early" && p.motivo !== "Não tenho mais espaço").length,
        r.paradas.filter((p) => p.pontualidade === "late").length,
      ]);
    }
  }
  return linhas;
}

// --- Numeros do dia (MONITORAMENTO, NOC, CONFIG_ROTAS) ----------------------

function totaisDoDia(iso: string) {
  const rotas = dia(iso).rotas.filter((r) => r.hub === "CPS");
  const paradas = rotas.flatMap((r) => r.paradas.map((p) => ({ r, p })));
  const estimados = paradas.filter(({ r }) => !r.avulsa).reduce((s, { p }) => s + p.estimados, 0);
  const coletados = paradas.filter(({ r, p }) => !r.ns && visitada(p, iso)).reduce((s, { p }) => s + p.coletados, 0);
  return {
    estimados,
    coletados,
    avulsas: rotas.filter((r) => r.avulsa && rotaComecou(r, iso)).length,
    planejadas: rotas.filter((r) => !r.avulsa).length,
    paradas: paradas.length,
  };
}

const diasComHoje = () => [...diasAnteriores(hojeISO(), DIAS_HIST), hojeISO()];

function monitoramento(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ESTIMADOS", "COLETADOS", "ROTAS_AVULSAS", "ROTAS_PLANEJADAS", "PARADAS_TOTAL", "ATUALIZADO_EM"]];
  for (const iso of diasComHoje()) {
    const t = totaisDoDia(iso);
    linhas.push([br(iso), t.estimados, t.coletados, t.avulsas, t.planejadas, t.paradas, iso === hojeISO() ? carimboAgora(4) : carimbo(iso, 23 * 60 + 50)]);
  }
  return linhas;
}

function noc(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "FORECAST_DIA", "ETIQUETA_IMPRESSA", "ATUALIZADO_EM"]];
  for (const iso of diasComHoje()) {
    const t = totaisDoDia(iso);
    const x = rng("noc" + iso);
    linhas.push([br(iso), Math.round(t.estimados * (1 + (x() - 0.4) * 0.12)), Math.round(t.estimados * (0.35 + x() * 0.15)), carimbo(iso, 7 * 60 + 10)]);
  }
  return linhas;
}

function configRotas(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "ROTAS_CONFIG", "PARADAS_PLANEJADAS"]];
  for (const iso of [...diasComHoje(), somarDias(hojeISO(), 1)]) {
    const rotas = dia(iso).rotas.filter((r) => !r.avulsa && r.hub === "CPS" && r.tipo === "first_mile");
    linhas.push([iso, rotas.length + rng("cfg" + iso).int(0, 3), rotas.reduce((s, r) => s + r.paradas.length, 0)]);
  }
  return linhas;
}

export const ABAS_PRINCIPAL: Registro = {
  [PRINCIPAL]: {
    "ATRIBUIÇÃO": atribuicao,
    HISTORICO_ATRIBUICAO: historicoAtribuicao,
    "SEMI AUTO ATRIBUIÇÃO": carimbos,
    "Respostas ao formulário 1": respostas,
    COLETAS_D0: coletasD0,
    HISTORICO_COLETAS: historicoColetas,
    MONITORAMENTO: monitoramento,
    NOC: noc,
    CONFIG_ROTAS: configRotas,
  },
};

export { ateQuando };
