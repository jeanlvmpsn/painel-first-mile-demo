import assert from "node:assert/strict";
import { test } from "node:test";

import { filtroCps, outrosHubsDaAtribuicao, rotasDeOutroHub } from "../app/lib/hubMonitor.ts";

const vis = (rota, rotaId, idParada, semNome = false) => ({ rota: semNome ? rotaId : rota, rotaId, rotaSemNome: semNome, idParada });

test("rotasDeOutroHub: so as de outro hub, nome manda sobre a coluna", () => {
  const r = rotasDeOutroHub([
    { rota: "CAMPINAS_C01_1", hub: "CPS" },
    { rota: "CAMPINAS_C01_2", hub: "BRXSP5" },
    { rota: "CAMPINAS_C01_3", hub: "" },
    { rota: "BRXMG3_C02_9", hub: "" },
    { rota: "CAMPINAS_C01_4", hub: "BRXSP2" },
  ]);
  assert.deepEqual(Object.values(r).sort(), ["BRXMG3", "BRXSP5"]);
});

test("filtroCps: nomeadas pela atribuicao, avulsas pelos pontos da config", () => {
  const outros = rotasDeOutroHub([{ rota: "CAMPINAS_C01_2", hub: "BRXSP5" }]);
  const visitas = [
    vis("CAMPINAS_C01_1", "10", "P1"),
    vis("CAMPINAS_C01_2", "20", "P9"),
    vis("", "30", "P1", true),
    vis("", "40", "P9", true),
  ];
  const plano = [
    { rota: "CAMPINAS_C01_1", idParada: "P1" },
    { rota: "CAMPINAS_C01_2", idParada: "P9" },
  ];
  const f = filtroCps(outros, visitas, plano);
  assert.equal(f.aplicavel, true);
  assert.equal(f.ehCps("CAMPINAS_C01_1", "10"), true);
  assert.equal(f.ehCps("CAMPINAS_C01_2", "20"), false);
  assert.equal(f.ehCps("CPS_C01_2", ""), false);
  assert.equal(f.ehCps("BRXSP14_C03_1", ""), false);
  assert.equal(f.ehCps("30", "30", true), true);
  assert.equal(f.ehCps("40", "40", true), false);

  assert.equal(f.ehCps("Avulsa 40", "40"), false);
  assert.equal(f.rotasFora, 2);
});

test("filtroCps: dia util (ninguem de outro hub) nao tira nada", () => {
  const f = filtroCps({}, [vis("", "40", "P9", true)], [{ rota: "CAMPINAS_C01_1", idParada: "P1" }]);
  assert.equal(f.aplicavel, false);
  assert.equal(f.ehCps("40", "40", true), true);
  assert.equal(f.rotasFora, 0);
});

test("outrosHubsDaAtribuicao: pela coluna HUB (regiao), MeliOne fica de fora", () => {
  const r = outrosHubsDaAtribuicao([
    { rota: "CAMPINAS_C01_1", regiao: "CPS", tipoRota: "first_mile" },
    { rota: "CAMPINAS_C01_2", regiao: "BRXSP5", tipoRota: "first_mile" },
    { rota: "CAMPINAS_C07_186", regiao: "SSP12", tipoRota: "melione" },
  ]);
  assert.deepEqual(Object.values(r), ["BRXSP5"]);
});
