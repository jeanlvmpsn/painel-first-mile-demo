import assert from "node:assert/strict";
import { test } from "node:test";

import {
  faixasDaCurva,
  horaDosMinutos,
  lerChegadas,
  minutosDoEta,
  minutosDoHorario,
  montarRotasCurva,
  resumoDaCurva,
  rotasDaBarra,
} from "../app/lib/curvaChegada.ts";

const ABA = [
  ["COLETA", "ROTA", "PLACA", "PERFIL_VEICULO", "MLP", "NOME_DA_ROTA", "DOCA", "QTD_PACOTES", "GATEIN", "ASSIGNMENT", "DOCKIN", "DOCKOUT", "GATEOUT", "USUARIO_YMS", "HORA_CHEGADA", "STATUS_ROTA", "YMS_QUANTITY_SHIPMENT", "VERIFICADOR", "ATUALIZADO_EM"],

  ["2026-09-30", "1", "ABC1D23", "VUC", "Alfa", "CAMPINAS_C05_062", "D12", "320", "2026-09-30T18:40:00", "", "2026-09-30T18:50:00", "2026-09-30T19:30:00", "2026-09-30T19:40:00", "", "18h", "close", "", "1", "30/09/2026 19:45:00"],

  ["2026-09-30", "2", "", "Van", "ZETA", "CPS_C05_063", "", "80", "", "", "", "", "", "", "", "in_progress", "", "1", "30/09/2026 19:45:00"],

  ["2026-09-30", "3", "", "Van", "ZETA", "CAMPINAS_C07_374", "", "1", "", "", "", "", "", "", "", "close", "", "0", "30/09/2026 19:45:00"],

  ["2026-09-30", "4", "", "Van", "JM", "NÃO PROGRAMADA", "D03", "50", "2026-10-01 00:20:00", "", "2026-10-01 00:30:00", "", "", "", "0h", "in_progress", "", "1", "30/09/2026 19:45:00"],

  ["2026-09-29", "5", "", "Van", "JM", "CAMPINAS_C05_062", "", "10", "2026-09-29T17:00:00", "", "", "", "", "", "17h", "close", "", "1", "30/09/2026 19:45:00"],
];

const PLANO = [
  { rota: "CAMPINAS_C05_062", transportadora: "Alfa", cluster: "C05", eta: "18:00:00", pacotes: 300 },
  { rota: "CAMPINAS_C05_063", transportadora: "ZETA", cluster: "C05", eta: "19:20:00", pacotes: 90 },
  { rota: "CAMPINAS_C07_374", transportadora: "ZETA", cluster: "C07", eta: "17:00:00", pacotes: 40 },
  { rota: "CAMPINAS_C09_001", transportadora: "Alfa", cluster: "C09", eta: "20:00:00", pacotes: 60 },
];

test("horarios: ETA de madrugada e do dia seguinte; gate-in apos meia-noite passa de 24h", () => {
  assert.equal(minutosDoEta("18:40:00"), 18 * 60 + 40);
  assert.equal(minutosDoEta("00:30"), 24 * 60 + 30);
  assert.equal(minutosDoEta(""), null);
  assert.equal(minutosDoHorario("2026-09-30T18:40:00", "2026-09-30"), 18 * 60 + 40);
  assert.equal(minutosDoHorario("2026-10-01 00:20:00", "2026-09-30"), 24 * 60 + 20);
  assert.equal(horaDosMinutos(24 * 60 + 20), "00:20 (+1)");
});

test("rotas da curva: planejado x chegada, fora da config e desconsideradas", () => {
  const { chegadas, atualizadoEm } = lerChegadas(ABA);
  assert.equal(atualizadoEm, "30/09/2026 19:45:00");
  const { rotas, desconsideradas } = montarRotasCurva(PLANO, chegadas, "2026-09-30");
  assert.equal(desconsideradas, 1);
  const por = Object.fromEntries(rotas.map((r) => [r.rota, r]));
  assert.equal(por.CAMPINAS_C05_062.situacao, "no CD");
  assert.equal(por.CAMPINAS_C05_062.atrasoMin, 40);

  assert.equal(por.CAMPINAS_C05_063.situacao, "coletando");
  assert.equal(por.CAMPINAS_C09_001.situacao, "não iniciada");

  assert.equal(por.CAMPINAS_C07_374.situacao, "NS");
  assert.equal(por.CAMPINAS_C07_374.foraDaCurva, true);
  assert.equal(por.CAMPINAS_C07_374.rotaId, "3");

  assert.equal(por.Avulsa.planejada, false);
  assert.equal(por.Avulsa.situacao, "no CD");
  assert.equal(por.Avulsa.rotaId, "4");
  assert.equal(por.CAMPINAS_C05_062.rotaId, "1");
});

test("avulsas: cada uma pelo seu ID (antes todas viravam uma so) e ID das rotas sem chegada", () => {
  const segunda = ["2026-09-30", "6", "", "Van", "JM", "NÃO PROGRAMADA", "", "30", "2026-09-30T15:00:00", "", "", "", "", "", "15h", "close", "", "1", "30/09/2026 19:45:00"];
  const { chegadas } = lerChegadas([...ABA, segunda]);
  const ids = new Map([["C09_001", "777"]]);
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30", ids);
  assert.deepEqual(rotas.filter((r) => !r.planejada).map((r) => r.rotaId).sort(), ["4", "6"]);
  assert.equal(rotas.find((r) => r.rota === "CAMPINAS_C09_001").rotaId, "777");
});

test("faixas por hora e resumo em veiculos e pacotes", () => {
  const { chegadas } = lerChegadas(ABA);
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30");
  const v = Object.fromEntries(faixasDaCurva(rotas, "veiculos").map((f) => [f.hora, f]));
  assert.deepEqual([v[18].planejado, v[18].executado, v[18].transito], [1, 1, 0]);

  assert.deepEqual([v[19].planejado, v[19].transito], [1, 0]);
  assert.equal(v[20].planejado, 1);
  assert.equal(v[24].executado, 1);
  assert.equal(v[24].rotulo, "00:00 - 00:59");
  assert.equal(v[8].planejado, 0);
  const p = Object.fromEntries(faixasDaCurva(rotas, "pacotes").map((f) => [f.hora, f]));
  assert.deepEqual([p[18].planejado, p[18].executado, p[19].transito], [300, 320, 0]);
  assert.deepEqual(resumoDaCurva(rotas, "veiculos"), {
    planejadas: 3,
    coletando: 1,
    chegaram: 2,
    transito: 0,
    descarregando: 1,
    finalizadas: 1,
  });
  assert.equal(resumoDaCurva(rotas, "pacotes").chegaram, 370);
});

test("ultimo gate-in do dia, para avisar YMS atrasado", async () => {
  const { ultimoGatein } = await import("../app/lib/curvaChegada.ts");
  const { chegadas } = lerChegadas(ABA);
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30");
  assert.equal(horaDosMinutos(ultimoGatein(rotas)), "00:20 (+1)");
  assert.equal(ultimoGatein([]), null);
});

test("rotas por tras de cada barra: mesma regra das faixas", async () => {
  const { rotasDaBarra } = await import("../app/lib/curvaChegada.ts");
  const { chegadas } = lerChegadas(ABA);
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30");
  const nomes = (l) => l.map((r) => r.rota).sort();
  assert.deepEqual(nomes(rotasDaBarra(rotas, 18, "planejado")), ["CAMPINAS_C05_062"]);
  assert.deepEqual(nomes(rotasDaBarra(rotas, 18, "executado")), ["CAMPINAS_C05_062"]);
  assert.deepEqual(rotasDaBarra(rotas, 19, "transito"), []);
  assert.deepEqual(nomes(rotasDaBarra(rotas, 24, "executado")), ["Avulsa"]);
  assert.deepEqual(rotasDaBarra(rotas, 20, "executado"), []);

  for (const f of faixasDaCurva(rotas, "veiculos")) {
    assert.equal(rotasDaBarra(rotas, f.hora, "planejado").length, f.planejado);
    assert.equal(rotasDaBarra(rotas, f.hora, "executado").length, f.executado);
    assert.equal(rotasDaBarra(rotas, f.hora, "transito").length, f.transito);
  }
});

test("situacao de cada rota: a caminho, no CD sem horario, fechada sem chegada, NS", () => {
  const base = { coleta: "2026-09-30", placa: "", perfil: "", transportadora: "", doca: "", pacotes: 50, gatein: "",
    dockin: "", dockout: "", gateout: "", valida: true };
  const chegadas = [
    { ...base, rotaId: "10", nome: "CAMPINAS_C05_062", status: "active", etapa: "a caminho" },
    { ...base, rotaId: "11", nome: "CAMPINAS_C05_063", status: "active", etapa: "no CD" },
    { ...base, rotaId: "12", nome: "CAMPINAS_C07_374", status: "close" },
  ];
  const ns = new Set(["C09_001"]);
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30", new Map(), ns);
  const sit = Object.fromEntries(rotas.map((r) => [r.rota, r.situacao]));
  assert.deepEqual(sit, {
    CAMPINAS_C05_062: "a caminho do CD",
    CAMPINAS_C05_063: "no CD",
    CAMPINAS_C07_374: "fechada sem chegada",
    CAMPINAS_C09_001: "NS",
  });

  const v = Object.fromEntries(faixasDaCurva(rotas, "veiculos").map((f) => [f.hora, f]));
  assert.equal(v[18].transito, 1);
  assert.equal(v[19].transito, 0);
  assert.equal(resumoDaCurva(rotas, "veiculos").transito, 1);
});

test("NS oficial do painel ganha da chegada (rota cancelada com evento de chegada)", () => {
  const base = { coleta: "2026-09-30", placa: "", perfil: "", transportadora: "", doca: "", pacotes: 5,
    dockin: "", dockout: "", gateout: "", valida: true };
  const chegadas = [{ ...base, rotaId: "20", nome: "CAMPINAS_C05_062", status: "close", gatein: "2026-09-30 12:06:00" }];
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30", new Map(), new Set(["C05_062"]));
  const r = rotas.find((x) => x.rota === "CAMPINAS_C05_062");
  assert.equal(r.situacao, "NS");
  assert.equal(r.foraDaCurva, true);
  assert.equal(r.rotaId, "20");
  const v = Object.fromEntries(faixasDaCurva(rotas, "veiculos").map((f) => [f.hora, f]));
  assert.equal(v[12].executado, 0);
  assert.equal(v[18].planejado, 0);
});

test("gate-in antes das 7h do proprio dia nao e chegada (saida para a rota)", () => {
  const base = { coleta: "2026-09-30", placa: "", perfil: "", transportadora: "", doca: "", pacotes: 50,
    dockin: "", dockout: "", gateout: "", valida: true };
  const chegadas = [
    { ...base, rotaId: "30", nome: "CAMPINAS_C05_062", status: "active", gatein: "2026-09-30 03:10:00" },

    { ...base, rotaId: "31", nome: "CAMPINAS_C05_063", status: "close", gatein: "2026-09-30 07:00:00" },

    { ...base, rotaId: "32", nome: "CAMPINAS_C09_001", status: "close", gatein: "2026-10-01 03:10:00" },
  ];
  const { rotas } = montarRotasCurva(PLANO, chegadas, "2026-09-30");
  const por = Object.fromEntries(rotas.map((r) => [r.rota, r]));
  assert.equal(por.CAMPINAS_C05_062.situacao, "coletando");
  assert.equal(por.CAMPINAS_C05_062.gateinMin, null);
  assert.equal(por.CAMPINAS_C05_063.gateinMin, 7 * 60);
  assert.equal(por.CAMPINAS_C09_001.gateinMin, 27 * 60 + 10);
  const v = Object.fromEntries(faixasDaCurva(rotas, "veiculos").map((f) => [f.hora, f]));
  assert.equal(v[3], undefined);
});

test("ultima chegada do dia pela query: so o D0, valida, regra das 7h", async () => {
  const { ultimaChegadaDaQuery } = await import("../app/lib/curvaChegada.ts");
  const { chegadas } = lerChegadas(ABA);

  assert.deepEqual(ultimaChegadaDaQuery(chegadas, "2026-09-30"), { quando: "00:20 (+1)", rota: "Avulsa 4" });

  assert.deepEqual(ultimaChegadaDaQuery(chegadas, "2026-09-29"), { quando: "17:00", rota: "CAMPINAS_C05_062" });

  const madrugada = { ...chegadas[0], coleta: "2026-10-01", gatein: "2026-10-01 03:00:00" };
  assert.equal(ultimaChegadaDaQuery([...chegadas, madrugada], "2026-10-01"), null);
  const tarde = { ...chegadas[0], coleta: "2026-10-01", gatein: "2026-10-01T14:50:00" };
  assert.deepEqual(ultimaChegadaDaQuery([...chegadas, tarde], "2026-10-01"), { quando: "14:50", rota: "CAMPINAS_C05_062" });
});

test("rota NS que o sistema registrou como chegada: fora da curva, mas aparece no clique da barra do sistema", () => {
  const c = (rotaId, nome, gatein, valida, extra = {}) => ({
    coleta: "2026-10-03", rotaId, nome, placa: "", perfil: "", transportadora: "TP", doca: "", pacotes: valida ? 50 : 0,
    gatein, dockin: "", dockout: "", gateout: "", status: "close", valida, fonte: "sistema", ...extra,
  });
  const plano = [
    { rota: "CAMPINAS_C01_1", transportadora: "TP", cluster: "C01", eta: "12:00:00", pacotes: 40 },
    { rota: "CAMPINAS_C01_2", transportadora: "TP", cluster: "C01", eta: "13:00:00", pacotes: 40 },
  ];
  const { rotas } = montarRotasCurva(
    plano,
    [
      c("11", "CAMPINAS_C01_1", "2026-10-03 09:12:00", false),
      c("12", "CAMPINAS_C01_2", "2026-10-03 12:50:00", true),

      c("99", "", "2026-10-03 09:40:00", false),
    ],
    "2026-10-03",
  );
  const ns = rotas.find((r) => r.rota === "CAMPINAS_C01_1");
  assert.equal(ns.situacao, "NS");
  assert.equal(ns.foraDaCurva, true);
  assert.equal(ns.gateinMin, null);
  assert.equal(ns.chegadaSistemaMin, 9 * 60 + 12);

  assert.equal(faixasDaCurva(rotas, "veiculos").find((f) => f.hora === 9)?.executado ?? 0, 0);
  assert.deepEqual(rotasDaBarra(rotas, 9, "executado"), []);

  assert.deepEqual(rotasDaBarra(rotas, 9, "executado", true).map((r) => r.rotaId), ["11", "99"]);
  assert.deepEqual(rotasDaBarra(rotas, 12, "executado", true).map((r) => r.rota), ["CAMPINAS_C01_2"]);
});
