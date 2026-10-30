import assert from "node:assert/strict";
import { test } from "node:test";

import { CAB_STATUS_MAPA, lerStatusMapa, linhaStatusMapa, statusMapaValido } from "../app/lib/mapeamentoStatus.ts";

test("status do mapeamento: ultima linha do dia vale, vazio limpa, outro dia nao entra", () => {
  const l = (data, id, st, em) => linhaStatusMapa(data, id, statusMapaValido(st), "Ana", em);
  const r = lerStatusMapa(
    [
      [...CAB_STATUS_MAPA],
      l("15/10/2026", "849817033_22435", "acompanhar", "15/10/2026 14:00:00"),
      l("15/10/2026", "849817033_22435", "RISCO ALTO", "15/10/2026 14:30:00"),
      l("15/10/2026", "777", "Sem risco", "15/10/2026 14:00:00"),
      l("15/10/2026", "777", "", "15/10/2026 14:10:00"),
      l("14/10/2026", "888", "Acompanhar", "14/10/2026 18:00:00"),
    ],
    "15/10/2026",
  );
  assert.deepEqual(Object.keys(r), ["849817033_22435"]);
  assert.equal(r["849817033_22435"].status, "Risco alto");
  assert.equal(r["849817033_22435"].autor, "Ana");
  assert.equal(statusMapaValido("qualquer"), null);
  assert.equal(statusMapaValido("sem reversao"), "Sem reversão");
  assert.equal(statusMapaValido("ZERADO"), "Zerado");
  assert.equal(statusMapaValido("nao preparados"), "Não preparados");
  assert.equal(statusMapaValido("RISCO DE NAO PREPARADOS"), "Risco de não preparados");
});
