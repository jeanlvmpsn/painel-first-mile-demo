import assert from "node:assert/strict";
import { test } from "node:test";

import {
  algumFiltroAtivo,
  alternar,
  filtrarLinhas,
  filtrosVazios,
} from "../app/lib/poolFiltros.ts";

const linha = (extra) => ({
  transportadora: "ALFA",
  cluster: "C01",
  perfil: "VUC",
  dentroDoPool: 0,
  desafio: 0,
  sobra: 0,
  aceites: 0,
  recusas: 0,
  semResposta: 0,
  culpaPlanejamento: 0,
  culpaTransportadora: 0,
  ...extra,
});

test("sem nada escolhido, nao tira nenhuma linha", () => {
  const linhas = [linha({}), linha({ transportadora: "ZETA" })];
  assert.equal(filtrarLinhas(linhas, filtrosVazios()).length, 2);
  assert.equal(algumFiltroAtivo(filtrosVazios()), false);
});

test("transportadora, perfil e cluster somam: precisa passar nos tres", () => {
  const linhas = [
    linha({}),
    linha({ cluster: "C04" }),
    linha({ transportadora: "ZETA" }),
  ];
  const f = {
    ...filtrosVazios(),
    transportadoras: ["ALFA"],
    clusters: ["C01"],
  };
  const r = filtrarLinhas(linhas, f);
  assert.equal(r.length, 1);
  assert.equal(r[0].cluster, "C01");
});

test("multipla escolha e OU dentro do mesmo grupo", () => {
  const linhas = [
    linha({ cluster: "C01" }),
    linha({ cluster: "C04" }),
    linha({ cluster: "C09" }),
  ];
  const f = { ...filtrosVazios(), clusters: ["C01", "C09"] };
  assert.equal(filtrarLinhas(linhas, f).length, 2);
});

test("situacao filtra por quantidade, nao por rotulo", () => {
  const linhas = [
    linha({ dentroDoPool: 3 }),
    linha({ desafio: 1 }),
    linha({ sobra: 2 }),
  ];
  const so = (m) => filtrarLinhas(linhas, { ...filtrosVazios(), marcas: [m] });
  assert.equal(so("dentro").length, 1);
  assert.equal(so("desafio").length, 1);
  assert.equal(so("sobra").length, 1);
});

test("linha com desafio E sobra aparece nos dois filtros", () => {
  const linhas = [linha({ desafio: 1, sobra: 1 })];
  assert.equal(
    filtrarLinhas(linhas, { ...filtrosVazios(), marcas: ["desafio"] }).length,
    1,
  );
  assert.equal(
    filtrarLinhas(linhas, { ...filtrosVazios(), marcas: ["sobra"] }).length,
    1,
  );
});

test("culpabilidade e resposta filtram cada uma no seu campo", () => {
  const linhas = [
    linha({ recusas: 1, culpaPlanejamento: 1 }),
    linha({ recusas: 1, culpaTransportadora: 1 }),
    linha({ aceites: 5 }),
    linha({ semResposta: 2 }),
  ];
  assert.equal(
    filtrarLinhas(linhas, { ...filtrosVazios(), culpas: ["tp"] }).length,
    1,
  );
  assert.equal(
    filtrarLinhas(linhas, { ...filtrosVazios(), respostas: ["aceito"] }).length,
    1,
  );
  assert.equal(
    filtrarLinhas(linhas, { ...filtrosVazios(), respostas: ["recusado"] })
      .length,
    2,
  );
});

test("grupos diferentes se acumulam", () => {
  const linhas = [
    linha({ desafio: 1, recusas: 1, culpaPlanejamento: 1 }),
    linha({ desafio: 1, aceites: 1 }),
  ];
  const f = { ...filtrosVazios(), marcas: ["desafio"], culpas: ["plan"] };
  assert.equal(filtrarLinhas(linhas, f).length, 1);
});

test("linha do pool some se a situacao filtrar", () => {
  const so = { transportadora: "ALFA", cluster: "C01", perfil: "VUC" };
  assert.equal(filtrarLinhas([so], filtrosVazios()).length, 1);
  assert.equal(
    filtrarLinhas([so], { ...filtrosVazios(), marcas: ["sobra"] }).length,
    0,
  );
});

test("alternar poe e tira sem duplicar", () => {
  assert.deepEqual(alternar([], "C01"), ["C01"]);
  assert.deepEqual(alternar(["C01"], "C04"), ["C01", "C04"]);
  assert.deepEqual(alternar(["C01", "C04"], "C01"), ["C04"]);
});
