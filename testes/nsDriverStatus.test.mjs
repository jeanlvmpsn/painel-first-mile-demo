import assert from "node:assert/strict";
import test from "node:test";

import { CAB_STATUS_NS, chaveNs, lerStatusNs, linhaStatusNs, statusNsValido } from "../app/lib/nsDriverStatus.ts";

test("reversao da rota NS: ultima marca do dia vale, por id ou nome", () => {
  assert.equal(statusNsValido("sem reversao"), "Sem reversão");
  assert.equal(statusNsValido("REVERTIDO PARCIAL"), "Revertido parcial");
  assert.equal(statusNsValido("outra coisa"), null);
  const linhas = [
    [...CAB_STATUS_NS],
    linhaStatusNs("27/10/2026", "CAMPINAS_C27_439", "111", "Sem reversão", "Ana", "27/10/2026 10:00:00"),
    linhaStatusNs("27/10/2026", "CAMPINAS_C27_439", "111", "Revertido parcial", "Lu", "27/10/2026 11:00:00"),

    linhaStatusNs("27/10/2026", "CAMPINAS_C04_482", "", "Revertido", "Ana", "27/10/2026 11:30:00"),

    linhaStatusNs("27/10/2026", "CAMPINAS_C08_480", "222", "Revertido", "Ana", "27/10/2026 09:00:00"),
    linhaStatusNs("27/10/2026", "CAMPINAS_C08_480", "222", null, "Ana", "27/10/2026 09:30:00"),

    linhaStatusNs("26/10/2026", "CAMPINAS_C22_497", "333", "Revertido", "Ana", "26/10/2026 18:00:00"),
  ];
  const m = lerStatusNs(linhas, "27/10/2026");
  assert.deepEqual(m[chaveNs("CAMPINAS_C27_439", "111")], { status: "Revertido parcial", autor: "Lu", registradoEm: "27/10/2026 11:00:00" });
  assert.equal(m[chaveNs("CAMPINAS_C04_482", "")].status, "Revertido");
  assert.equal(m[chaveNs("CAMPINAS_C08_480", "222")], undefined);
  assert.equal(m[chaveNs("CAMPINAS_C22_497", "333")], undefined);
});
