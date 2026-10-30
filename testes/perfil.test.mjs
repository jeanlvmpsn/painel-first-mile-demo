import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PERFIS,
  PERFIL_OUTROS,
  perfilCanonico,
} from "../app/lib/atribuicaoUtils.ts";

test("junta os nomes que a API escreve de varios jeitos no mesmo porte", () => {
  assert.equal(perfilCanonico("VUC Fixo"), "VUC");
  assert.equal(perfilCanonico("VUC Elétrico"), "VUC");
  assert.equal(perfilCanonico("Express VUC"), "VUC");
  assert.equal(perfilCanonico("Rental VUC FM"), "VUC");
  assert.equal(perfilCanonico("Vuc"), "VUC");

  assert.equal(perfilCanonico("Truck Fixo"), "Truck");
  assert.equal(perfilCanonico("Toco Fixo"), "Toco");
  assert.equal(perfilCanonico("Medio Fixo"), "Médio");
  assert.equal(perfilCanonico("Médio"), "Médio");
  assert.equal(perfilCanonico("Express Van TKS 2025"), "Van");
  assert.equal(perfilCanonico("Express Van Frota Fixa"), "Van");
  assert.equal(perfilCanonico("HR"), "HR");
  assert.equal(perfilCanonico("Utilitário Fixo"), "Utilitário");
  assert.equal(perfilCanonico("Carreta"), "Carreta");
});

test("nome que ninguem reconhece vira Outros, nao some", () => {
  assert.equal(perfilCanonico("Bitrem Refrigerado"), PERFIL_OUTROS);
  assert.equal(perfilCanonico("qualquer coisa nova"), PERFIL_OUTROS);
});

test("perfil nao gravado e vazio, e isso NAO e Outros", () => {
  assert.equal(perfilCanonico(""), "");
  assert.equal(perfilCanonico("   "), "");
  assert.equal(perfilCanonico(undefined), "");
  assert.equal(perfilCanonico(null), "");
});

test("a lista de portes vai do maior pro menor", () => {
  assert.deepEqual([...PERFIS], [
    "Carreta",
    "Truck",
    "Toco",
    "Médio",
    "HR",
    "VUC",
    "Van",
    "Utilitário",
  ]);
});

test("hr so casa como palavra inteira", () => {
  assert.equal(perfilCanonico("Chronos"), PERFIL_OUTROS);
  assert.equal(perfilCanonico("HRV Fixo"), PERFIL_OUTROS);
  assert.equal(perfilCanonico("Caminhao HR"), "HR");
});

test("Yellow Pool e Van, mesmo sem a palavra van no texto", () => {
  assert.equal(perfilCanonico("Express Yellow Pool"), "Van");
  assert.equal(perfilCanonico("Express Yellow Pool"), "Van");

  assert.equal(perfilCanonico("Yellow Pool Large Van - Equipe unica"), "Van");
});
