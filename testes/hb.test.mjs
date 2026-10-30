import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chaveId,
  chaveRota,
  dataParaBR,
  diagnosticarRota,
  mapaDePontos,
  montarHB,
  montarListaHB,
  paradasPlanejadas,
  resumoHB,
  rotasDoDia,
} from "../app/lib/hb.ts";

const LISTA = [
  ["SELLER_ID", "SELLER", "PRODUTO"],
  ["111", "LOJAMAX FULL", "LOJAMAX"],
  ["222", "LOJAMAX ITAPEVA", "LOJAMAX"],
  ["333", "CASA E CUCINA", "FOGAO"],
  ["", "linha sem id", "IGNORAR"],
  ["444", "SO NOME", ""],
];

test("a lista ignora o cabecalho e a linha sem id", () => {
  const m = montarListaHB(LISTA);
  assert.equal(m.size, 4);
  assert.equal(m.has(""), false);
});

test("o rotulo e a coluna C; sem ela, cai para o nome", () => {
  const m = montarListaHB(LISTA);
  assert.equal(m.get("111").rotulo, "LOJAMAX");
  assert.equal(m.get("444").rotulo, "SO NOME");
});

test("so entra parada cujo id esta na lista - o antigo tirar os #N/A", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "CPS_C26_020", parada: "111", estimados: 10 },
      { rota: "CPS_C26_020", parada: "999", estimados: 500 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].estimados, 10);
});

test("duas paradas do mesmo rotulo na mesma rota ficam com o maior", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R1", parada: "111", estimados: 10 },
      { rota: "R1", parada: "222", estimados: 7 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].seller, "LOJAMAX");
  assert.equal(linhas[0].estimados, 10);
});

test("o mesmo seller em rotas diferentes vira duas linhas", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R2", parada: "111", estimados: 3 },
      { rota: "R1", parada: "111", estimados: 4 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(linhas.length, 2);
  assert.deepEqual(linhas.map((l) => l.rota), ["R1", "R2"]);

  assert.deepEqual(linhas.map((l) => l.estimados), [4, 0]);
});

test("seller em varias rotas: so a primeira linha leva o estimado", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R1", parada: "111", estimados: 100 },
      { rota: "R2", parada: "111", estimados: 100 },
      { rota: "R3", parada: "222", estimados: 100 },
      { rota: "R4", parada: "111", estimados: 120 },
      { rota: "R2", parada: "333", estimados: 7 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  const mega = linhas.filter((l) => l.seller === "LOJAMAX");
  assert.deepEqual(mega.map((l) => [l.rota, l.estimados]), [["R1", 120], ["R2", 0], ["R3", 0], ["R4", 0]]);
  assert.equal(linhas.find((l) => l.seller === "FOGAO").estimados, 7);
  assert.equal(resumoHB(linhas).estimados, 127);
  assert.deepEqual(mega.map((l) => Boolean(l.repetida)), [false, true, true, true]);
});

test("primeira linha sem coleta herda o estimado de uma rota de baixo", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R1", parada: "111", planejada: true },
      { rota: "R2", parada: "111", estimados: 50 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.deepEqual(
    linhas.map((l) => [l.rota, l.estimados, l.naColeta, Boolean(l.repetida)]),
    [["R1", 50, true, false], ["R2", 0, true, true]],
  );
});

test("ETA e placa entram por rota e faltando ficam vazios", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R1", parada: "111", estimados: 1 },
      { rota: "R2", parada: "333", estimados: 1 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: { R1: "21:59:00" },
    placaPorRota: { R1: "FLV6E90" },
  });
  const r1 = linhas.find((l) => l.rota === "R1");
  const r2 = linhas.find((l) => l.rota === "R2");
  assert.equal(r1.eta, "21:59:00");
  assert.equal(r1.placa, "FLV6E90");
  assert.equal(r2.eta, "");
  assert.equal(r2.placa, "");
});

test("ordena por seller e depois por rota", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R2", parada: "111", estimados: 1 },
      { rota: "R1", parada: "333", estimados: 1 },
      { rota: "R1", parada: "111", estimados: 1 },
      { rota: "R3", parada: "333", estimados: 1 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.deepEqual(
    linhas.map((l) => [l.seller, l.rota]),
    [["FOGAO", "R1"], ["FOGAO", "R3"], ["LOJAMAX", "R1"], ["LOJAMAX", "R2"]],
  );
});

test("parada sem rota ou sem id nao entra", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "", parada: "111", estimados: 9 },
      { rota: "R1", parada: "", estimados: 9 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(linhas.length, 0);
});

test("o resumo conta rotas e sellers distintos e soma os estimados", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "R1", parada: "111", estimados: 10 },
      { rota: "R1", parada: "333", estimados: 5 },
      { rota: "R2", parada: "111", estimados: 2 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });

  assert.deepEqual(resumoHB(linhas), { rotas: 2, sellers: 2, estimados: 15 });
});

test("rota sem nome vira avulsa na linha", () => {
  const linhas = montarHB({
    paradas: [
      { rota: "443687147", parada: "111", estimados: 543, rotaSemNome: true },
      { rota: "CPS_C26_013", parada: "111", estimados: 628 },
    ],
    sellers: montarListaHB(LISTA),
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(linhas.find((l) => l.rota === "443687147").avulsa, true);
  assert.equal(linhas.find((l) => l.rota === "CPS_C26_013").avulsa, false);
});

test("dataParaBR aceita os formatos que o Sheets devolve", () => {
  assert.equal(dataParaBR("25/09/2026"), "25/09/2026");
  assert.equal(dataParaBR("25/09/2026 00:00:00"), "25/09/2026");
  assert.equal(dataParaBR("2026-09-25"), "25/09/2026");
  assert.equal(dataParaBR("25/9/2026"), "25/09/2026");
  assert.equal(dataParaBR("25/09/26"), "25/09/2026");
});

test("rotas do dia pela Extracao Config, cabecalho com acento fora da linha 1", () => {
  const r = rotasDoDia(
    [
      ["EXTRATO"],
      ["VIGÊNCIA", "NOME_ROTA", "ETA", "START_TIME"],
      ["24/09/2026", "CPS_C12_DED_050", "13:00:00", "10:00:00"],
      ["2026-09-25", "CPS_C12_DED_050", "13:40:00", "10:00:00"],
      ["25/09/2026", "CPS_C11_DED_047", "19:40:00", "14:00:00"],
    ],
    "25/09/2026",
  );
  assert.equal(r.aviso, "");
  assert.deepEqual([...r.etaPorRota], [["CPS_C12_DED_050", "13:40:00"], ["CPS_C11_DED_047", "19:40:00"]]);
});

test("Extracao Config sem o dia vira aviso com as datas encontradas", () => {
  const r = rotasDoDia([["VIGENCIA", "NOME_ROTA", "ETA"], ["22/09/2026", "R1", "10:00:00"]], "25/09/2026");
  assert.equal(r.etaPorRota.size, 0);
  assert.match(r.aviso, /nao tem rotas de 25\/09\/2026.*22\/09\/2026/);
});

test("mapa da Formulas vale em qualquer data e rota planejada entra antes da coleta", () => {
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["20", "RJ", "RJ"], ["30", "GOMES", "GOMES"]]);

  const mapa = mapaDePontos([
    ["VIGENCIA", "NOME_ROTA", "ID_SELLER", "PACOTES"],
    ["22/09/2026", "CPS_C11_DED_047", "20", "150"],
    ["22/09/2026", "CPS_C12_DED_050", "30", "100"],
    ["22/09/2026", "CPS_C99_DED_001", "30", "10"],
    ["22/09/2026", "CPS_C12_DED_050", "999", "5"],
  ]);
  const doDia = rotasDoDia(
    [["VIGENCIA", "NOME_ROTA", "ETA"], ["25/09/2026", "CPS_C11_DED_047", "19:40:00"], ["25/09/2026", "CPS_C12_DED_050", "13:40:00"]],
    "25/09/2026",
  );
  const etaPorRota = Object.fromEntries(doDia.etaPorRota);
  const linhas = montarHB({
    paradas: [
      ...paradasPlanejadas(doDia, mapa, sellers),

      { rota: "CPS_C12_DED_050", parada: "30", estimados: 50 },
    ],
    sellers,
    etaPorRota,
    placaPorRota: {},
  });
  assert.deepEqual(
    linhas.map((l) => [l.rota, l.eta, l.seller, l.estimados]),
    [
      ["CPS_C12_DED_050", "13:40:00", "GOMES", 50],
      ["CPS_C11_DED_047", "19:40:00", "RJ", 0],
    ],
  );
});

test("Extracao Config com ID_SELLER dispensa a Formulas", () => {
  const r = rotasDoDia(
    [
      ["VIGENCIA", "NOME_ROTA", "ETA", "ID_SELLER", "PACOTES"],
      ["25/09/2026", "CPS_C12_DED_050", "13:40:00", "30", "105"],
      ["25/09/2026", "CPS_C12_DED_050", "13:40:00", "999", "5"],
    ],
    "25/09/2026",
  );

  assert.deepEqual(
    r.paradas.map((p) => [p.rota, p.parada, p.planejada, p.estimados]),
    [["CPS_C12_DED_050", "30", true, undefined], ["CPS_C12_DED_050", "999", true, undefined]],
  );
});

test("estimado so da coleta: achou fica travado, nao achou fica para preencher", () => {
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["20", "RJ", "RJ"], ["30", "GOMES", "GOMES"]]);
  const linhas = montarHB({
    paradas: [
      { rota: "R1", parada: "20", planejada: true },
      { rota: "R2", parada: "30", planejada: true },
      { rota: "R2", parada: "30", estimados: 50 },
    ],
    sellers,
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.deepEqual(
    linhas.map((l) => [l.rota, l.estimados, l.naColeta]),
    [["R2", 50, true], ["R1", 0, false]],
  );
});

test("Extracao Config sem ID_SELLER deixa o mapa para a Formulas", () => {
  const r = rotasDoDia([["VIGENCIA", "NOME_ROTA", "ETA"], ["25/09/2026", "R1", "10:00:00"]], "25/09/2026");
  assert.equal(r.paradas, null);
});

test("o mesmo id formatado de jeitos diferentes pelo Sheets bate", () => {
  assert.equal(chaveId("123.456.789"), "123456789");
  assert.equal(chaveId("123,456,789"), "123456789");
  assert.equal(chaveId(" 123456789.0 "), "123456789");
  assert.equal(chaveId("123456789"), "123456789");
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["123.456.789", "X", "COLCHAO"]]);
  const linhas = montarHB({
    paradas: [{ rota: "R1", parada: "123456789", estimados: 4 }],
    sellers,
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(linhas.length, 1);
});

test("CAMPINAS_ e CPS_ sao a mesma rota entre as fontes", () => {
  assert.equal(chaveRota("CAMPINAS_C15_370"), chaveRota("CPS_C15_370"));
  assert.equal(chaveRota(" cps_c12_ded_060 "), chaveRota("CPS_C12_DED_060"));
  assert.notEqual(chaveRota("CPS_C15_370"), chaveRota("CPS_C15_436"));
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["20", "RJ", "RJ"]]);
  const mapa = mapaDePontos([["NOME_ROTA", "ID_SELLER"], ["CPS_C15_370", "20"]]);
  const doDia = rotasDoDia([["VIGENCIA", "NOME_ROTA", "ETA"], ["29/09/2026", "CAMPINAS_C15_370", "18:00:00"]], "29/09/2026");
  const linhas = montarHB({
    paradas: [
      ...paradasPlanejadas(doDia, mapa, sellers),
      { rota: "CAMPINAS_C15_370", parada: "20", estimados: 30 },
    ],
    sellers,
    etaPorRota: Object.fromEntries(doDia.etaPorRota),
    placaPorRota: { CAMPINAS_C15_370: "ABC1D23" },
  });
  assert.deepEqual(
    linhas.map((l) => [l.rota, l.eta, l.estimados, l.placa]),
    [["CAMPINAS_C15_370", "18:00:00", 30, "ABC1D23"]],
  );
});

test("extracao com ID_SELLER em outras rotas nao apaga a rota sem seller nela", () => {
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["20", "RJ", "RJ"], ["30", "GOMES", "GOMES"]]);
  const mapa = mapaDePontos([["NOME_ROTA", "ID_SELLER"], ["CPS_C12_DED_060", "30"], ["CPS_C12_DED_050", "20"]]);
  const doDia = rotasDoDia(
    [
      ["VIGENCIA", "NOME_ROTA", "ETA", "ID_SELLER"],
      ["29/09/2026", "CPS_C12_DED_050", "13:40:00", "999"],
      ["29/09/2026", "CPS_C12_DED_060", "14:00:00", ""],
    ],
    "29/09/2026",
  );
  const linhas = montarHB({
    paradas: paradasPlanejadas(doDia, mapa, sellers),
    sellers,
    etaPorRota: {},
    placaPorRota: {},
  });

  assert.deepEqual(linhas.map((l) => [l.rota, l.seller]), [["CPS_C12_DED_060", "GOMES"]]);
});

test("rota da atribuicao que faltou na extracao entra pelo mapa", () => {
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["20", "RJ", "RJ"]]);
  const mapa = mapaDePontos([["NOME_ROTA", "ID_SELLER"], ["CAMPINAS_C15_370", "20"]]);
  const doDia = rotasDoDia([["VIGENCIA", "NOME_ROTA", "ETA"], ["29/09/2026", "CPS_C01_001", "10:00:00"]], "29/09/2026");
  const planejadas = paradasPlanejadas(doDia, mapa, sellers, ["CAMPINAS_C15_370", "CPS_C01_001"]);
  assert.deepEqual(planejadas.map((p) => p.rota), ["CAMPINAS_C15_370"]);
});

test("diagnostico diz o que cada fonte tem da rota e do seller", () => {
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["20", "RJ", "RJ"]]);
  const d = diagnosticarRota({
    rota: "CAMPINAS_C15_370",
    seller: "1131387475",
    dataBR: "29/09/2026",
    sellers,
    extracao: [["VIGENCIA", "NOME_ROTA", "ETA"], ["28/09/2026", "CPS_C15_370", "10:00"]],
    mapa: new Map(),
    atribuidas: [{ rota: "CAMPINAS_C15_370", placa: "ABC1D23" }],
    coleta: [{ rota: "CAMPINAS_C15_370", parada: "1.131.387.475" }],
    linhas: [],
  });
  assert.match(d[0], /seller 1131387475 NAO esta na lista/);
  assert.match(d[1], /nao aparece/);
  assert.match(d[2], /placa ABC1D23/);
  assert.match(d[3], /Extracao Config de hoje: nao \(aparece em 28\/09\/2026\)/);
  assert.match(d[4], /nao esta no mapa/);
  assert.match(d[5], /1 parada\(s\); H&B: nenhum\. Seller 1131387475: sim\./);
});
