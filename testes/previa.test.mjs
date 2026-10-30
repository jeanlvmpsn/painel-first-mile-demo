import assert from "node:assert/strict";
import { test } from "node:test";

import {
  metricasPrevia,
  listarHubs,
  proximoDiaOperacao,
  textoPrevia,
} from "../app/lib/previa.ts";

const rota = (extra = {}) => ({
  data: "12/09/2026",
  rota: extra.rota ?? "CAMPINAS_C01_1",
  start: "09:00",
  transportadora: extra.transportadora ?? "ZETA",
  placa: extra.placa ?? "ABC1D23",
  regiao: extra.regiao ?? "CPS",
  cluster: "C01",
  atribuida: extra.atribuida ?? true,
  motorista: "",
  statusVeiculo: "",
  statusMotorista: "",
  tipoRota: extra.tipoRota ?? "first_mile",
});

test("GAP conta rota SEM transportadora, nao rota sem veiculo", () => {
  const m = metricasPrevia([
    rota({ transportadora: "", atribuida: false }),
    rota({ transportadora: "ZETA", atribuida: false }),
    rota({ transportadora: "ZETA", atribuida: true }),
  ]);
  assert.equal(m.rotas, 3);
  assert.equal(m.semTransportadora, 1);
  assert.equal(m.semAtribuicao, 2);
});

test("M1 conta so Express", () => {
  const m = metricasPrevia([
    rota({ tipoRota: "express" }),
    rota({ tipoRota: "first_mile" }),
    rota({ tipoRota: "" }),
  ]);
  assert.equal(m.m1, 1, "vazio nao e Express nem entra como FM chutado");
});

test("porHub separa o sabado, que roda nos hubs satelite", () => {
  const m = metricasPrevia([
    rota({ regiao: "BRXSP14", transportadora: "" }),
    rota({ regiao: "BRXSP14", transportadora: "" }),
    rota({ regiao: "CPS" }),
  ]);
  assert.deepEqual(m.porHub, [
    { hub: "BRXSP14", rotas: 2, semTransportadora: 2 },
    { hub: "CPS", rotas: 1, semTransportadora: 0 },
  ]);
});

test("sem atribuicao detalha por transportadora e a lista FECHA com o total", () => {
  const m = metricasPrevia([
    rota({ transportadora: "ORION", atribuida: false }),
    rota({ transportadora: "ORION", atribuida: false }),
    rota({ transportadora: "ALFA", atribuida: false }),
    rota({ transportadora: "ALFA", atribuida: true }),

    rota({ transportadora: "", atribuida: false }),
  ]);
  assert.equal(m.semAtribuicao, 4);

  assert.deepEqual(
    m.semAtribuicaoPorTp.map((t) => ({
      transportadora: t.transportadora,
      rotas: t.rotas,
    })),
    [
      { transportadora: "ORION", rotas: 2 },
      { transportadora: "ALFA", rotas: 1 },
      { transportadora: "Sem transportadora", rotas: 1 },
    ]
  );
  const soma = m.semAtribuicaoPorTp.reduce((a, t) => a + t.rotas, 0);
  assert.equal(soma, m.semAtribuicao, "a lista tem que fechar com o total");
});

test("o detalhe repete o titulo depois de uma linha em branco", () => {
  const m = metricasPrevia([
    rota({ transportadora: "ORION", atribuida: false }),
    rota({ transportadora: "ALFA", atribuida: false }),
    rota({ transportadora: "ALFA", atribuida: false }),
  ]);
  const linhas = textoPrevia(m, "12/09/2026").split("\n");
  const i = linhas.indexOf("*Rotas sem atribuição:* 03");
  assert.ok(i > 0);
  assert.equal(linhas[i + 1], "");
  assert.equal(linhas[i + 2], "*Rotas sem atribuição:*");
  assert.equal(linhas[i + 3], "ALFA - 02");
  assert.equal(linhas[i + 4], "ORION - 01");
});

test("texto sai no formato do template", () => {
  const m = metricasPrevia([
    rota({ transportadora: "", atribuida: false }),
    rota({ tipoRota: "express", atribuida: false }),
  ]);
  const txt = textoPrevia(m, "12/09/2026", {
    rotasConfig: null,
    aceitos: 17,
    recusados: 0,
  });
  const linhas = txt.split("\n");
  assert.equal(linhas[0], "Prévia Status FM - 12/09");
  assert.ok(txt.includes("*Rotas atribuição:* 02"));
  assert.ok(txt.includes("*Schedulings aceitos:* 17"));
  assert.ok(txt.includes("*Recusados:* 00"));
  assert.ok(txt.includes("*M1:* 01"));
  assert.ok(txt.includes("*GAP de Rotas:* 01"));
  assert.ok(txt.includes("*Rotas sem atribuição:* 02"));

  assert.ok(txt.includes("*Rotas Config:* ___"));
  assert.ok(txt.includes("*Rotas Não descarregadas D-1:* 00"));
  assert.ok(txt.includes("*Rotas Avulsas:* 00"));
});

test("GAP lista cada rota sem transportadora, com o rotulo fixo", () => {
  const m = metricasPrevia([
    rota({ rota: "CPS_C03_2", transportadora: "" }),
    rota({ rota: "CPS_C01_1", transportadora: "" }),
    rota({ rota: "CPS_C02_1", transportadora: "ZETA" }),
  ]);
  assert.deepEqual(m.gapRotas, ["CPS_C01_1", "CPS_C03_2"]);
  assert.equal(m.gapRotas.length, m.semTransportadora);
  const linhas = textoPrevia(m, "12/09/2026").split("\n");
  const i = linhas.indexOf("*GAP de Rotas:*");
  assert.ok(i > 0);
  assert.equal(linhas[i - 1], "");
  assert.equal(linhas[i + 1], "CPS_C01_1 - Sem transportadora");
  assert.equal(linhas[i + 2], "CPS_C03_2 - Sem transportadora");
});

test("valor zero nao abre lista nenhuma", () => {
  const m = metricasPrevia([rota({ transportadora: "ZETA", atribuida: true })]);
  assert.equal(m.semTransportadora, 0);
  assert.equal(m.semAtribuicao, 0);
  const linhas = textoPrevia(m, "12/09/2026").split("\n");
  const titulos = linhas.filter(
    (l) => l === "*GAP de Rotas:*" || (l.startsWith("*Rotas sem atribui") && !/[0-9]/.test(l))
  );
  assert.deepEqual(titulos, [], "00 nao pode abrir bloco de detalhe");
  assert.ok(!linhas.some((l) => l.endsWith(" - Sem transportadora")));
});

test("a previa do sabado ja e a de segunda: domingo nao opera", () => {
  assert.equal(proximoDiaOperacao("2026-09-12"), "2026-09-14");
  assert.equal(proximoDiaOperacao("2026-09-11"), "2026-09-12");
  assert.equal(proximoDiaOperacao("2026-09-14"), "2026-09-15");

  assert.equal(proximoDiaOperacao("2026-09-13"), "2026-09-14");

  assert.equal(proximoDiaOperacao("2026-09-30"), "2026-10-01");
  assert.equal(proximoDiaOperacao("2026-12-31"), "2027-01-01");
});

test("no sabado a lista de sem atribuicao mostra o HUB de cada pendencia", () => {
  const m = metricasPrevia([
    rota({ transportadora: "ALFA", regiao: "BRXSP7", atribuida: false }),
    rota({ transportadora: "ALFA", regiao: "BRXSP7", atribuida: false }),
    rota({ transportadora: "ALFA", regiao: "BRXSP5", atribuida: false }),
    rota({ transportadora: "ALFA", regiao: "CPS", atribuida: false }),
    rota({ transportadora: "ORION", regiao: "CPS", atribuida: false }),
  ]);

  const alfa = m.semAtribuicaoPorTp.find((t) => t.transportadora === "ALFA");
  assert.equal(alfa.rotas, 4);

  assert.deepEqual(alfa.porHub, [
    { hub: "BRXSP7", rotas: 2 },
    { hub: "BRXSP5", rotas: 1 },
    { hub: "CPS", rotas: 1 },
  ]);
  const soma = alfa.porHub.reduce((a, h) => a + h.rotas, 0);
  assert.equal(soma, alfa.rotas, "a quebra por hub tem que fechar com o total");

  const linhas = textoPrevia(m, "12/09/2026").split("\n");
  const i = linhas.indexOf("*Rotas sem atribuição:*");
  assert.ok(i > 0);
  assert.equal(linhas[i + 1], "");
  assert.equal(linhas[i + 2], "ALFA - 04");
  assert.equal(linhas[i + 3], "BRXSP7 - 02, BRXSP5 - 01 e CPS - 01");
  assert.equal(linhas[i + 4], "");
  assert.equal(linhas[i + 5], "ORION - 01");
  assert.equal(linhas[i + 6], "CPS - 01");
});

test("em dia util, com um HUB so, a linha de HUB nao existe", () => {
  const m = metricasPrevia([
    rota({ transportadora: "ALFA", regiao: "CPS", atribuida: false }),
    rota({ transportadora: "ALFA", regiao: "CPS", atribuida: false }),
    rota({ transportadora: "ORION", regiao: "CPS", atribuida: false }),
  ]);
  const linhas = textoPrevia(m, "11/09/2026").split("\n");
  const i = linhas.indexOf("ALFA - 02");
  assert.ok(i > 0);
  assert.equal(linhas[i + 1], "ORION - 01", "nao pode entrar linha de hub");
  assert.ok(!linhas.some((l) => l.startsWith("CPS - ")));
});

test("listarHubs escreve virgula entre todos e 'e' antes do ultimo", () => {
  const h = (hub, rotas) => ({ hub, rotas });
  assert.equal(listarHubs([h("CPS", 3)]), "CPS - 03");
  assert.equal(listarHubs([h("CPS", 3), h("BRXSP5", 1)]), "CPS - 03 e BRXSP5 - 01");
  assert.equal(
    listarHubs([h("BRXSP7", 7), h("BRXSP5", 2), h("CPS", 1)]),
    "BRXSP7 - 07, BRXSP5 - 02 e CPS - 01"
  );
  assert.equal(listarHubs([]), "");
});

test("A DEFINIR conta como rota em aberto: entra no GAP de rotas", () => {
  const m = metricasPrevia([
    rota({ rota: "CPS_C05_7", transportadora: "A DEFINIR", atribuida: false }),
    rota({ rota: "CPS_C01_1", transportadora: "A Definir Ltda" }),
    rota({ rota: "CPS_C02_1", transportadora: "ZETA" }),
    rota({ rota: "CPS_C03_2", transportadora: "" }),
  ]);
  assert.equal(m.semTransportadora, 3);
  assert.deepEqual(m.gapRotas, ["CPS_C01_1", "CPS_C03_2", "CPS_C05_7"]);

  assert.deepEqual(m.semAtribuicaoPorTp.map((t) => [t.transportadora, t.rotas]), [["Sem transportadora", 1]]);
  assert.equal(m.porHub[0].semTransportadora, 3);
});
