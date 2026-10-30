import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SEM_PERFIL,
  SEM_RESPOSTA,
  opcoesDePerfil,
  perfilAtendido,
  perfilPlanejado,
} from "../app/lib/atribuicaoUtils.ts";
import { diasDoPeriodo } from "../app/lib/periodo.ts";

test("periodo lista os dias, atravessa o mes e respeita o limite", () => {
  assert.deepEqual(diasDoPeriodo("29/09/2026", "02/10/2026", 31), [
    "29/09/2026",
    "30/09/2026",
    "01/10/2026",
    "02/10/2026",
  ]);
  assert.deepEqual(diasDoPeriodo("29/09/2026", "29/09/2026", 31), ["29/09/2026"]);
  assert.equal(diasDoPeriodo("01/01/2026", "31/12/2026", 31).length, 31);
  assert.deepEqual(diasDoPeriodo("02/10/2026", "29/09/2026", 31), []);
});

test("perfil planejado e o PERFIL da atribuicao; sem ele, Sem perfil", () => {
  assert.equal(perfilPlanejado({ perfil: "VUC Fixo" }), "VUC");
  assert.equal(perfilPlanejado({ perfil: "Carreta Rental" }), "Carreta");
  assert.equal(perfilPlanejado({ perfil: "" }), SEM_PERFIL);
  assert.equal(perfilPlanejado({}), SEM_PERFIL);
});

test("perfil atendido e o do Forms; sem resposta e Sem resposta, nao Sem perfil", () => {
  assert.equal(perfilAtendido({ resposta: { perfilVeiculo: "Van" } }), "Van");
  assert.equal(perfilAtendido({ perfil: "VUC Fixo" }), SEM_RESPOSTA);
  assert.equal(perfilAtendido({ resposta: { perfilVeiculo: "" } }), SEM_PERFIL);
});

test("opcoes do filtro na ordem da frota, baldes sem dado no fim", () => {
  assert.deepEqual(
    opcoesDePerfil([SEM_RESPOSTA, "VUC", "Carreta", "VUC", SEM_PERFIL]),
    ["Carreta", "VUC", SEM_PERFIL, SEM_RESPOSTA],
  );
});

test("3/4 e o mesmo porte que Medio", () => {
  assert.equal(perfilAtendido({ resposta: { perfilVeiculo: "3/4" } }), "Médio");
  assert.equal(perfilAtendido({ resposta: { perfilVeiculo: "Caminhão 3 / 4" } }), "Médio");
  assert.equal(perfilPlanejado({ perfil: "Médio Fixo" }), "Médio");

  assert.notEqual(perfilPlanejado({ perfil: "13/45" }), "Médio");
});
