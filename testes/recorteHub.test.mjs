import assert from "node:assert/strict";
import { test } from "node:test";

import { recortarCampinas } from "../app/lib/recorteHub.ts";

const p = (rota, parada, extra = {}) => ({
  rota,
  parada,
  transportadora: "",
  motorista: "",
  pontualidade: "",
  estimados: 0,
  coletados: 0,
  preparados: 0,
  planejado: "Sim",
  ...extra,
});

test("dia so de Campinas: nada muda", () => {
  const paradas = [p("CAMPINAS_C01_1", "10"), p("777", "99", { rotaSemNome: true })];
  const r = recortarCampinas(paradas, [{ rota: "CAMPINAS_C01_1", regiao: "CPS" }], []);
  assert.equal(r.aplicado, false);
  assert.equal(r.paradas, paradas);
  assert.equal(r.avulsasCps, 1);
});

test("sabado: tira as rotas de outro hub e as avulsas sem ponto CPS na config", () => {
  const atribuicao = [
    { rota: "CAMPINAS_C01_1", regiao: "CPS" },
    { rota: "CAMPINAS_C01_2", regiao: "BRXSP5" },
  ];
  const config = [
    { rota: "CPS_C01_1", detalhe: [{ id: "10" }, { id: "11" }] },
    { rota: "CPS_C01_2", detalhe: [{ id: "20" }] },
  ];
  const paradas = [
    p("CAMPINAS_C01_1", "10"),
    p("CAMPINAS_C01_2", "20"),

    p("777", "11", { rotaSemNome: true }),
    p("777", "55", { rotaSemNome: true }),

    p("888", "20", { rotaSemNome: true }),
    p("999", "56", { rotaSemNome: true }),
  ];
  const r = recortarCampinas(paradas, atribuicao, config);
  assert.equal(r.aplicado, true);
  assert.deepEqual(
    r.paradas.map((x) => [x.rota, x.parada]),
    [["CAMPINAS_C01_1", "10"], ["777", "11"], ["777", "55"]],
  );
  assert.equal(r.avulsasCps, 1);
  assert.equal(r.avulsasFora, 2);
  assert.equal(r.rotasFora, 1);
});

test("sem config do dia: as avulsas ficam (nao da para separar)", () => {
  const r = recortarCampinas(
    [p("CAMPINAS_C01_2", "20"), p("777", "11", { rotaSemNome: true })],
    [{ rota: "CAMPINAS_C01_1", regiao: "CPS" }, { rota: "CAMPINAS_C01_2", regiao: "BRXSP14" }],
    null,
  );
  assert.equal(r.semConfig, true);
  assert.deepEqual(r.paradas.map((x) => x.rota), ["777"]);
  assert.equal(r.avulsasCps, 1);
});

test("estimados e coletados so dos pontos CPS, pelo Monitoramento por Sellers", async () => {
  const { pacotesCampinas } = await import("../app/lib/recorteHub.ts");
  const n = (edpu) => ({ edpu, backlog: 0, early: 0 });
  const linha = (entidade, est, col, tipo = "place", customerId = "") => ({
    customerId,
    entidade,
    tipo,
    nome: "",
    estimado: n(est),
    preparado: n(0),
    coletado: n(col),
    atualizadoEm: "03/10/2026 15:00:00",
  });
  const r = recortarCampinas(
    [p("CAMPINAS_C01_1", "10"), p("CAMPINAS_C01_2", "20")],
    [{ rota: "CAMPINAS_C01_1", regiao: "CPS" }, { rota: "CAMPINAS_C01_2", regiao: "BRXSP5" }],
    [{ rota: "CPS_C01_1", detalhe: [{ id: "10" }, { id: "12" }] }, { rota: "CPS_C01_2", detalhe: [{ id: "20" }] }],
  );
  const pac = pacotesCampinas([linha("10", 100, 80), linha("12", 50, 0), linha("20", 900, 900)], r.pontosCps);

  assert.equal(pac.estimados, 150);
  assert.equal(pac.coletados, 80);
  assert.equal(pacotesCampinas([], r.pontosCps), null);
});

test("fechamento: numero da tela menos so os pontos de outro hub", async () => {
  const { pacotesSemOutrosHubs } = await import("../app/lib/recorteHub.ts");
  const n = (edpu) => ({ edpu, backlog: 0, early: 0 });
  const linha = (entidade, est, col) => ({
    customerId: "",
    entidade,
    tipo: "place",
    nome: "",
    estimado: n(est),
    preparado: n(0),
    coletado: n(col),
    atualizadoEm: "13/10/2026 21:05:00",
  });
  const r = recortarCampinas(
    [p("CAMPINAS_C01_1", "10"), p("CAMPINAS_C01_2", "20"), p("CAMPINAS_C01_2", "30")],
    [{ rota: "CAMPINAS_C01_1", regiao: "CPS" }, { rota: "CAMPINAS_C01_2", regiao: "BRXSP5" }],

    [{ rota: "CPS_C01_1", detalhe: [{ id: "10" }, { id: "30" }] }, { rota: "CPS_C01_2", detalhe: [{ id: "20" }, { id: "40" }] }],
  );
  assert.deepEqual([...r.pontosFora].sort(), ["20", "40"]);

  const linhas = [linha("10", 100, 80), linha("20", 50, 10), linha("40", 25, 0), linha("99", 300, 200)];
  const pac = pacotesSemOutrosHubs({ estimados: 1000, coletados: 800 }, linhas, r.pontosFora);
  assert.equal(pac.estimados, 925);
  assert.equal(pac.coletados, 790);
  assert.deepEqual(pac.descontados, { estimados: 75, coletados: 10 });

  assert.equal(pacotesSemOutrosHubs(null, linhas, r.pontosFora), null);
  assert.equal(pacotesSemOutrosHubs({ estimados: 1, coletados: 1 }, [], r.pontosFora), null);
});
