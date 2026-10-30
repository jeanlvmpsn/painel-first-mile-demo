import assert from "node:assert/strict";
import { test } from "node:test";

import { montarRotasCurva, pontualidade, pontualidadePorTransportadora } from "../app/lib/curvaChegada.ts";
import { completarComBigQuery, lerRotasSistema } from "../app/lib/rotasSistema.ts";

const CAB = [
  "DATA", "ROUTE_ID", "ROTA", "TRANSPORTADORA", "PLACA", "VEICULO", "STATUS", "NAO_PLANEJADA",
  "ESTIMADOS", "COLETADOS", "INICIO_PLANEJADO", "FIM_PLANEJADO", "INICIO_ROTA", "FIM_ROTA",
  "A_CAMINHO_CD", "NO_CD", "DESCARREGANDO", "PRIMEIRA_COLETA", "CHEGOU_CD", "INICIO_DESCARGA",
  "ROTA_CONCLUIDA", "ESTADO_CONSULTADO", "ATUALIZADO_EM",
];
const linha = (o) => CAB.map((c) => o[c] ?? "");
const AT = "30/09/2026 21:40:00";

const ABA = [
  CAB,
  linha({ DATA: "30/09/2026", ROUTE_ID: "448315610", ROTA: "CPS_C26_DED_013", TRANSPORTADORA: "Alfa Logistics",
    PLACA: "DAI9H62", VEICULO: "Carreta", STATUS: "close", COLETADOS: "49",
    CHEGOU_CD: "2026-09-30 13:47:20", INICIO_DESCARGA: "2026-09-30 13:59:30", ATUALIZADO_EM: AT }),
  linha({ DATA: "30/09/2026", ROUTE_ID: "448316422", ROTA: "CAMPINAS_C27_189", TRANSPORTADORA: "Transportadora Grupo Vetor",
    STATUS: "active", COLETADOS: "791", NO_CD: "SIM", ATUALIZADO_EM: AT }),

  linha({ DATA: "30/09/2026", ROUTE_ID: "448321637", ROTA: "CAMPINAS_C24_252", TRANSPORTADORA: "Alfa Logistics",
    STATUS: "close", COLETADOS: "0", ATUALIZADO_EM: AT }),

  linha({ DATA: "30/09/2026", ROUTE_ID: "1", ROTA: "CAMPINAS_C01_999", STATUS: "pending", ATUALIZADO_EM: AT }),

  linha({ DATA: "29/09/2026", ROUTE_ID: "2", ROTA: "CAMPINAS_C01_221", STATUS: "close", COLETADOS: "9",
    CHEGOU_CD: "2026-09-29 15:00:00", ATUALIZADO_EM: "29/09/2026 23:50:00" }),
];

test("lerRotasSistema: chegada do historico, status e regra dos 2 pacotes", () => {
  const { chegadas, atualizadoEm } = lerRotasSistema(ABA, "30/09/2026");
  assert.equal(atualizadoEm, AT);
  assert.deepEqual(chegadas.map((c) => c.nome), ["CPS_C26_DED_013", "CAMPINAS_C27_189", "CAMPINAS_C24_252"]);
  const ded = chegadas[0];
  assert.equal(ded.coleta, "2026-09-30");
  assert.equal(ded.gatein, "2026-09-30 13:47:20");
  assert.equal(ded.dockin, "2026-09-30 13:59:30");
  assert.equal(ded.transportadora, "Alfa Logistics");
  assert.equal(ded.fonte, "sistema");
  assert.equal(chegadas[1].gatein, "");
  assert.equal(chegadas[2].valida, false);
  assert.deepEqual(lerRotasSistema([], "30/09/2026").chegadas, []);

  const { ids } = lerRotasSistema(ABA, "30/09/2026");
  assert.equal(ids.get("C01_999"), "1");
  assert.equal(ids.get("C26_DED_013"), "448315610");
});

test("completarComBigQuery: avulsa NAO PROGRAMADA da query casa pelo ID", () => {
  const sistema = lerRotasSistema(ABA, "30/09/2026").chegadas;
  const bq = [{ coleta: "2026-09-30", rotaId: "448316422", nome: "NÃO PROGRAMADA", placa: "", perfil: "", transportadora: "",
    doca: "D05", pacotes: 10, gatein: "", dockin: "", dockout: "", gateout: "", status: "close", valida: true, fonte: "bigquery" }];
  const m = completarComBigQuery(sistema, bq);
  assert.equal(m.length, 3);
  const c = m.find((x) => x.rotaId === "448316422");
  assert.equal(c.nome, "CAMPINAS_C27_189");
  assert.equal(c.doca, "D05");
});

test("completarComBigQuery: o sistema manda; a query so completa doca e gate-out", () => {
  const sistema = lerRotasSistema(ABA, "30/09/2026").chegadas;
  const bq = [
    { coleta: "2026-09-30", rotaId: "448315610", nome: "CPS_C26_DED_013", placa: "", perfil: "", transportadora: "ALFA",
      doca: "D12", pacotes: 40, gatein: "2026-09-30 13:10:00", dockin: "", dockout: "2026-09-30 14:10:00", gateout: "2026-09-30 14:20:00",
      status: "close", valida: true, fonte: "bigquery" },

    { coleta: "2026-09-30", rotaId: "9", nome: "CAMPINAS_C31_91", placa: "", perfil: "", transportadora: "Alfa Logistics",
      doca: "", pacotes: 439, gatein: "2026-09-30 15:00:00", dockin: "", dockout: "", gateout: "",
      status: "close", valida: true, fonte: "bigquery" },
  ];
  const m = completarComBigQuery(sistema, bq);
  assert.equal(m.length, 3);
  const ded = m.find((c) => c.nome === "CPS_C26_DED_013");

  assert.equal(ded.gatein, "2026-09-30 13:47:20");
  assert.equal(ded.doca, "D12");
  assert.equal(ded.dockout, "2026-09-30 14:10:00");
  assert.equal(ded.gateout, "2026-09-30 14:20:00");
  assert.equal(ded.pacotes, 49);
  assert.equal(ded.transportadora, "Alfa Logistics");
  assert.equal(m.find((c) => c.nome === "CAMPINAS_C31_91"), undefined);
  assert.deepEqual(completarComBigQuery([], bq), []);
});

test("pontualidade: cedo, no horario e atrasada contra o ETA, por transportadora", () => {
  const chegadas = lerRotasSistema(ABA, "30/09/2026").chegadas;
  const planejadas = [
    { rota: "CPS_C26_DED_013", transportadora: "Alfa Logistics", cluster: "C26", eta: "15:00:00", pacotes: 200 },
    { rota: "CAMPINAS_C27_189", transportadora: "Transportadora Grupo Vetor", cluster: "C27", eta: "18:00:00", pacotes: 900 },
  ];
  const { rotas, desconsideradas } = montarRotasCurva(planejadas, chegadas, "2026-09-30");
  assert.equal(desconsideradas, 1);
  const ded = rotas.find((r) => r.rota === "CPS_C26_DED_013");
  assert.equal(ded.situacao, "no CD");
  assert.equal(ded.atrasoMin, -73);
  assert.equal(pontualidade(ded), "cedo");
  assert.equal(pontualidade({ atrasoMin: 30 }), "no horário");
  assert.equal(pontualidade({ atrasoMin: -30 }), "no horário");
  assert.equal(pontualidade({ atrasoMin: 31 }), "atrasada");
  assert.equal(pontualidade({ atrasoMin: null }), null);

  const c27 = rotas.find((r) => r.rota === "CAMPINAS_C27_189");
  assert.equal(c27.situacao, "no CD");
  assert.equal(c27.gateinMin, null);

  const t = pontualidadePorTransportadora(rotas);
  assert.deepEqual(t, [{ transportadora: "Alfa Logistics", chegaram: 1, cedo: 1, noHorario: 0, atrasada: 0, semEta: 0 }]);
});

test("rota aberta e fechada sem coletar, com 'chegada' no historico: NS, nunca no CD", () => {
  const aba = [
    CAB,
    linha({ DATA: "01/10/2026", ROUTE_ID: "449000112", ROTA: "CAMPINAS_C01_112", TRANSPORTADORA: "Alfa Logistics",
      STATUS: "close", COLETADOS: "0", CHEGOU_CD: "2026-10-01 12:06:10", ATUALIZADO_EM: "01/10/2026 13:00:00" }),
  ];
  const { chegadas } = lerRotasSistema(aba, "01/10/2026");
  assert.equal(chegadas[0].valida, false);
  const plano = [{ rota: "CAMPINAS_C01_112", transportadora: "Alfa Logistics", cluster: "C01", eta: "15:00:00", pacotes: 300 }];
  const { rotas, desconsideradas } = montarRotasCurva(plano, chegadas, "2026-10-01");
  assert.equal(desconsideradas, 1);
  assert.equal(rotas[0].situacao, "NS");
  assert.equal(rotas[0].gateinMin, null);
  assert.equal(rotas[0].rotaId, "449000112");
  assert.deepEqual(pontualidadePorTransportadora(rotas), []);
});
