import assert from "node:assert/strict";
import { test } from "node:test";

import { METAS_2026, META_ANO_2026, metaDoMes } from "../app/lib/metas.ts";

test("a meta sai do mes da data do report", () => {
  assert.equal(metaDoMes("21/09/2026").puSuccess, 93);
  assert.equal(metaDoMes("05/08/2026").puSuccess, 93.3);
  assert.equal(metaDoMes("31/12/2026").puOnTime, 82.3);
  assert.equal(metaDoMes("01/01/2026").culpaSeller, 4.8);
});

test("data vazia ou em outro formato cai na meta do ano", () => {
  assert.deepEqual(metaDoMes(""), META_ANO_2026);
  assert.deepEqual(metaDoMes("2026-09-21"), META_ANO_2026);
  assert.deepEqual(metaDoMes(null), META_ANO_2026);
});

test("PU Success e No PU Success fecham 100 em todo mes", () => {
  for (let mes = 1; mes <= 12; mes++) {
    const meta = METAS_2026[mes];
    const soma = Math.round((meta.puSuccess + meta.noPuSuccess) * 10) / 10;
    assert.equal(soma, 100, "mes " + mes);
  }
});
