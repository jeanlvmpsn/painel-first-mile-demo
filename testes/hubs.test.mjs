import assert from "node:assert/strict";
import { test } from "node:test";

import { ehDeCampinas, ehDeOutraBase, hubDaRota, hubPeloNome, OUTRO_HUB_NO_TEXTO, somenteCampinas } from "../app/lib/hubs.ts";

test("CPS e de Campinas; satelite nao e", () => {
  assert.equal(ehDeCampinas("CPS"), true);
  assert.equal(ehDeCampinas("cps"), true);
  assert.equal(ehDeCampinas(" CPS "), true);
  for (const h of ["BRXSP5", "BRXSP7", "BRXSP14", "BRXMG2", "BRXMG3"]) {
    assert.equal(ehDeCampinas(h), false, h + " e satelite");
  }
});

test("BRXSP2 e Campinas, nao satelite", () => {
  assert.equal(ehDeCampinas("BRXSP2"), true);
});

test("hub em branco fica, porque e dia sem o campo gravado", () => {
  assert.equal(ehDeCampinas(""), true);
  assert.equal(ehDeCampinas("   "), true);
  assert.equal(ehDeCampinas(undefined), true);
  assert.equal(ehDeCampinas(null), true);
});

test("hub novo e desconhecido fica de fora", () => {
  assert.equal(ehDeCampinas("BRXRJ1"), false);
});

test("o filtro so tira o que nao e de Campinas", () => {
  const rotas = [
    { rota: "A", hub: "CPS" },
    { rota: "B", hub: "BRXSP5" },
    { rota: "C", hub: "" },
    { rota: "D", hub: "BRXMG3" },
    { rota: "E", hub: "BRXSP2" },
  ];
  assert.deepEqual(
    somenteCampinas(rotas).map((r) => r.rota),
    ["A", "C", "E"]
  );

  const semHub = [{ rota: "A" }, { rota: "B" }];
  assert.equal(somenteCampinas(semHub).length, 2);
});

test("o filtro tambem entende 'regiao', que e como a RotaPlanejada chama", () => {
  const planejadas = [
    { rota: "A", regiao: "CPS" },
    { rota: "B", regiao: "BRXSP14" },
    { rota: "C", regiao: "" },
  ];
  assert.deepEqual(
    somenteCampinas(planejadas).map((r) => r.rota),
    ["A", "C"]
  );
});

test("hub pelo nome da rota: o nome ganha da coluna vazia", () => {
  assert.equal(hubPeloNome("BRXSP22_C01_14"), "BRXSP22");
  assert.equal(hubPeloNome("brxsp5_C03_101"), "BRXSP5");

  assert.equal(hubPeloNome("BRXSP2_C01_10"), "");
  assert.equal(hubPeloNome("CAMPINAS_C01_544"), "");
  assert.equal(hubDaRota("BRXSP22_C01_14", ""), "BRXSP22");
  assert.equal(hubDaRota("CAMPINAS_C01_544", "CPS"), "CPS");
  assert.equal(ehDeCampinas(hubDaRota("BRXSP22_C01_14", "CPS")), false);
});

test("outra base x satelite de sabado", () => {
  assert.equal(ehDeOutraBase("BRXSP22_C01_20"), true);
  assert.equal(ehDeOutraBase("BRXSP14_C02_5"), false);
  assert.equal(ehDeOutraBase("BRXMG3_C01_1"), false);
  assert.equal(ehDeOutraBase("BRXSP2_C01_10"), false);
  assert.equal(ehDeOutraBase("CAMPINAS_C15_370"), false);
});

test("texto do Forms com codigo de outra base, inclusive os novos", () => {
  for (const t of ["BRXSP22_C01_14", "rota BRXSP5 C03", "BRXMG3_C01", "BRXSP14"]) assert.equal(OUTRO_HUB_NO_TEXTO.test(t), true, t);
  for (const t of ["BRXSP2_C01_10", "CAMPINAS_C07_374", "BRXSP2"]) assert.equal(OUTRO_HUB_NO_TEXTO.test(t), false, t);
});
