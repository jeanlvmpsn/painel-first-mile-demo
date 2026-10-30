import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assinaturaDoPlano,
  CAB_HISTORICO_CONFIG,
  lerConfigHistorica,
  linhasDaConfig,
  substituirDia,
} from "../app/lib/configHistorico.ts";

const PLANO = [
  { rota: "CAMPINAS_C05_062", transportadora: "Alfa", cluster: "C05", eta: "18:00:00", pacotes: 300 },
  { rota: "CPS_C26_DED_013", transportadora: "Alfa", cluster: "C26", eta: "15:00:00", pacotes: 263 },
];

test("historico da config: grava, le de volta e troca so o dia", () => {
  const ontem = linhasDaConfig(PLANO, "30/09/2026", "30/09/2026 10:00:00");
  let aba = substituirDia([CAB_HISTORICO_CONFIG], ontem, "30/09/2026", "2026-07-01");
  assert.deepEqual(lerConfigHistorica(aba, "30/09/2026"), PLANO);

  const hoje = linhasDaConfig(PLANO.slice(0, 1), "01/10/2026", "01/10/2026 10:00:00");
  aba = substituirDia(aba, hoje, "01/10/2026", "2026-07-01");
  aba = substituirDia(aba, hoje, "01/10/2026", "2026-07-01");
  assert.equal(lerConfigHistorica(aba, "01/10/2026").length, 1);
  assert.equal(lerConfigHistorica(aba, "30/09/2026").length, 2);

  aba = substituirDia(aba, hoje, "01/10/2026", "2026-10-01");
  assert.equal(lerConfigHistorica(aba, "30/09/2026").length, 0);
  assert.deepEqual(lerConfigHistorica([], "30/09/2026"), []);
});

test("assinatura do plano: muda com ETA ou pacotes, nao com a ordem", () => {
  const a = assinaturaDoPlano(PLANO, "01/10/2026");
  assert.equal(assinaturaDoPlano([...PLANO].reverse(), "01/10/2026"), a);
  assert.notEqual(assinaturaDoPlano([{ ...PLANO[0], eta: "18:30:00" }, PLANO[1]], "01/10/2026"), a);
  assert.notEqual(assinaturaDoPlano([{ ...PLANO[0], pacotes: 301 }, PLANO[1]], "01/10/2026"), a);
  assert.notEqual(assinaturaDoPlano(PLANO, "02/10/2026"), a);
});
