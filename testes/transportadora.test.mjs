import assert from "node:assert/strict";
import { test } from "node:test";

import { mesmaTransportadora } from "../app/lib/dashboardUtils.ts";

test("mesma transportadora escrita de jeitos diferentes", () => {
  assert.ok(mesmaTransportadora("Alfa", "Alfa Logistics"));
  assert.ok(mesmaTransportadora("Vetor", "Transportadora Grupo Vetor"));
  assert.ok(mesmaTransportadora("BRAVO LOGÍSTICA", "bravo logistica"));
  assert.ok(mesmaTransportadora("JM Transportes", "JM"));
  assert.ok(!mesmaTransportadora("Alfa Logistics", "Vetor"));
  assert.ok(!mesmaTransportadora("", "Alfa"));
  assert.ok(!mesmaTransportadora("Transportadora", "Transportadora"));
});
