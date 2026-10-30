import assert from "node:assert/strict";
import { test } from "node:test";

import { CAB_COMENTARIOS_PD, chaveComentario, lerComentariosPd, linhaComentarioPd } from "../app/lib/comentariosPd.ts";

const l = (data, id, obs, comentario, em, extra = {}) =>
  linhaComentarioPd({ data, idParada: id, ponto: extra.ponto ?? "", cluster: extra.cluster ?? "", obs, comentario, autor: "Ana" }, em);

test("comentarios do PD: ultimo do dia vale, historico do mais novo ao mais antigo, vazio apaga", () => {
  const r = lerComentariosPd([
    [...CAB_COMENTARIOS_PD],
    l("15/10/2026", "849817033_94323121", "acompanhar", "seller vai preparar ate 17h", "15/10/2026 16:00:00", { ponto: "KAPLER MODAS", cluster: "C29" }),
    l("15/10/2026", "849817033_94323121", "nao preparados", "nao preparou", "15/10/2026 18:30:00"),
    l("14/10/2026", "849817033_94323121", "Zerado", "", "14/10/2026 19:00:00"),
    l("15/10/2026", "777", "Sem risco", "x", "15/10/2026 10:00:00"),
    l("15/10/2026", "777", "", "", "15/10/2026 10:05:00"),
  ]);
  const a = r[chaveComentario("15/10/2026", "849817033_94323121")];
  assert.equal(a.obs, "Não preparados");
  assert.equal(a.comentario, "nao preparou");
  assert.equal(a.ponto, "KAPLER MODAS");
  assert.equal(a.cluster, "C29");
  assert.deepEqual(a.historico.map((v) => v.obs), ["Não preparados", "Acompanhar"]);
  assert.equal(r[chaveComentario("14/10/2026", "849817033_94323121")].obs, "Zerado");
  assert.equal(r[chaveComentario("15/10/2026", "777")], undefined);
  assert.equal(l("15/10/2026", "1", "qualquer", "t", "")[4], "");
});
