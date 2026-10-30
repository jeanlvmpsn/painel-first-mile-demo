import assert from "node:assert/strict";
import { test } from "node:test";

import { idsValidos, montarPerfil, veiculoMinimo } from "../app/lib/perfil.ts";

test("IDs: so digito e _, sem repetir", () => {
  assert.deepEqual(idsValidos("849817033_133457897, 196671119\n196671119 abc; 12"), ["849817033_133457897", "196671119"]);
});

test("menor veiculo que leva a carga do dia", () => {
  assert.equal(veiculoMinimo(400, 1.5)?.tipo, "Utilitário");

  assert.equal(veiculoMinimo(1800, 5)?.tipo, "HR");
  assert.equal(veiculoMinimo(2100, 5)?.tipo, "VUC");

  assert.equal(veiculoMinimo(3000, 3)?.tipo, "Médio");
  assert.equal(veiculoMinimo(30000, 10), null);
});

test("junta coleta por categoria com o peso do planejamento", () => {
  const json = JSON.stringify({
    coleta: [
      { ID: "849817033_1", SELLER: "196671119", NOME: "ABEL_ELETRO", CATEGORIA: "ELETRO", ESTIMADOS: "80", COLETADOS: "70", DIAS: "5", VOL_MEDIO_M3: "0.02", VOL_MAX_M3: "0.3" },
      { ID: "849817033_1", SELLER: "196671119", NOME: "ABEL_ELETRO", CATEGORIA: "CASA", ESTIMADOS: "20", COLETADOS: "20", DIAS: "4", VOL_MEDIO_M3: "0.07", VOL_MAX_M3: "0.1" },
    ],
    plano: [{ ID: "849817033_1", DIAS: "5", PESO_KG: "1000", VOL_M3: "10", PACOTES: "100" }],
  });
  const [p] = montarPerfil(json, ["849817033_1"]);
  assert.equal(p.nome, "ABEL_ELETRO");
  assert.equal(p.estimados, 100);
  assert.equal(p.pctColeta, 0.9);
  assert.equal(p.categorias[0].categoria, "ELETRO");
  assert.equal(Math.round(p.volMedioM3 * 1000), 30);
  assert.equal(p.volMaxM3, 0.3);
  assert.equal(p.plano.pesoMedioKg, 10);
  assert.equal(p.plano.pesoDiaKg, 200);
  assert.equal(p.veiculoMinimo.tipo, "Utilitário");
});

test("JSON quebrado nao derruba a tela", () => {
  assert.deepEqual(montarPerfil("{", []), []);
});
