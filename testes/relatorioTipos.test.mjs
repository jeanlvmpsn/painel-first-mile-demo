import assert from "node:assert/strict";
import { test } from "node:test";

import { ehSabado } from "../app/lib/relatorioTipos.ts";

test("ehSabado nao depende do fuso do servidor", () => {
  assert.equal(ehSabado("12/09/2026"), true);
  assert.equal(ehSabado("22/08/2026"), true);
  assert.equal(ehSabado("11/09/2026"), false, "sexta");
  assert.equal(ehSabado("13/09/2026"), false, "domingo");
  assert.equal(ehSabado("14/09/2026"), false, "segunda");
  assert.equal(ehSabado(""), false);
  assert.equal(ehSabado("2026-09-12"), false, "so aceita dd/MM/yyyy");
});
