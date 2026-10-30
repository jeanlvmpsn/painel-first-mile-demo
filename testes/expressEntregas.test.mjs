import assert from "node:assert/strict";
import { test } from "node:test";

import { janelaDaRota, lerEntregasExpress, riscoExpress } from "../app/lib/expressEntregas.ts";

const CAB = ["DATA", "ROUTE_ID", "ROTA", "PENDENTES", "FALHAS", "SUCESSO", "PONTOS", "PARADAS", "PACOTES", "CONSULTADO_EM"];
const ent = (o) => ({ rotaId: "1", rota: "J8_AM1", pendentes: 0, falhas: 0, sucesso: 0, pacotes: null, paradas: null, sacas: null, paradasPendentes: null, sacasEntregues: null, consultadoEm: "", ...o });

test("lerEntregasExpress: so o dia, por id e por nome", () => {
  const r = lerEntregasExpress(
    [
      CAB,
      ["09/10/2026", "453358851", "CAMPINAS_J8_AM1", "21", "1", "77", "107", "63", "195", "09/10/2026 10:40:12"],
      ["08/10/2026", "999", "J9_AM1", "0", "0", "50", "", "", "", "08/10/2026 18:00:00"],
      ["09/10/2026", "777", "J7_AM1", "", "", "", "", "", "", ""],
    ],
    "09/10/2026",
  );
  const e = r["ID:453358851"];
  assert.deepEqual(e, { rotaId: "453358851", rota: "CAMPINAS_J8_AM1", pendentes: 21, falhas: 1, sucesso: 77, pacotes: 195, paradas: 63, sacas: null, paradasPendentes: null, sacasEntregues: null, consultadoEm: "10:40" });
  assert.equal(Object.values(r).filter((x) => x.rotaId === "999").length, 0);
  assert.equal(r["ID:777"], undefined);
  assert.equal(Object.keys(r).length, 2);
  assert.deepEqual(lerEntregasExpress([["X"]], "09/10/2026"), {});
});

test("lerEntregasExpress: paradas pendentes pela coluna PARADAS_PENDENTES", () => {
  const r = lerEntregasExpress(
    [
      [...CAB, "SACAS", "PARADAS_PENDENTES", "SACAS_ENTREGUES"],
      ["13/10/2026", "455174826", "CAMPINAS_H3_AM1", "81", "0", "34", "100", "82", "115", "13/10/2026 12:07:12", "9", "61", "4"],
      ["13/10/2026", "455174827", "CAMPINAS_H4_AM1", "5", "0", "3", "4", "3", "8", "13/10/2026 12:07:12", "", ""],
    ],
    "13/10/2026",
  );
  assert.equal(r["ID:455174826"].paradasPendentes, 61);
  assert.equal(r["ID:455174826"].sacas, 9);
  assert.equal(r["ID:455174826"].sacasEntregues, 4);
  assert.equal(r["ID:455174827"].paradasPendentes, null);
});

test("janelaDaRota: primeira e ultima janela", () => {
  assert.deepEqual(janelaDaRota(["13:00 - 15:00 hs", "", "11:30 - 14:00 hs", "16:00 - 18:00"]), { ini: 690, fim: 1080 });
  assert.deepEqual(janelaDaRota([]), { ini: null, fim: null });
});

test("riscoExpress: Express 1.0 (tela de entregas zerada) e risco alto ate logar na coleta", () => {
  const ctx = { inicioColetaMin: 14 * 60, agoraMin: 13 * 60 };
  const zerada = ent({ pacotes: 0, paradas: 0, consultadoEm: "13:00" });
  const r = riscoExpress(zerada, ctx);
  assert.equal(r.nivel, "v1");
  assert.equal(r.texto, "Express 1.0 · sem visibilidade das entregas");
  assert.equal(riscoExpress(zerada, { ...ctx, logouColeta: true }).nivel, "v1Logou");

  assert.equal(riscoExpress(ent({ sucesso: 77, falhas: 1, pacotes: 195, paradas: 63 }), ctx).nivel, "concluidas");
});

test("lerEntregasExpress: coluna SACAS (alem dos pacotes)", () => {
  const r = lerEntregasExpress(
    [[...CAB, "SACAS"], ["13/10/2026", "455165943", "B3_AM1", "0", "0", "14", "6", "6", "5", "13/10/2026 11:00:00", "9"]],
    "13/10/2026",
  );
  assert.equal(r["ID:455165943"].sacas, 9);
  assert.equal(r["ID:455165943"].pacotes, 5);
});

test("riscoExpress: so progresso e um risco (5+ pendentes a 45 min ou menos do inicio da coleta)", () => {
  const ctx = { inicioColetaMin: 15 * 60 + 45, agoraMin: 13 * 60 };

  const longe = riscoExpress(ent({ pendentes: 40, sucesso: 15 }), ctx);
  assert.equal(longe.nivel, "andamento");
  assert.equal(longe.curto, "Entregas 15/55");

  const perto = riscoExpress(ent({ pendentes: 5, sucesso: 50 }), { ...ctx, agoraMin: 15 * 60 });
  assert.equal(perto.nivel, "risco");
  assert.equal(perto.curto, "Risco · Entregas 50/55");
  assert.match(perto.texto, /faltam 5 entregas e 45 min/);

  assert.equal(riscoExpress(ent({ pendentes: 4, sucesso: 50 }), { ...ctx, agoraMin: 15 * 60 }).nivel, "andamento");

  assert.match(riscoExpress(ent({ pendentes: 10, sucesso: 50 }), { ...ctx, agoraMin: 16 * 60 }).texto, /já devia ter começado/);

  assert.equal(riscoExpress(ent({ pendentes: 10 }), { inicioColetaMin: null, janelaIniMin: 13 * 60 + 30, agoraMin: 13 * 60 }).nivel, "risco");
  assert.equal(riscoExpress(ent({ pendentes: 10 }), { inicioColetaMin: null, agoraMin: 23 * 60 }).nivel, "andamento");

  assert.equal(riscoExpress(ent({ sucesso: 80 }), ctx).nivel, "concluidas");
  assert.equal(riscoExpress(ent({ pendentes: 1, sucesso: 63 }), { ...ctx, coletando: true }).curto, "Coletando · entregas 63/64");
  assert.equal(riscoExpress(ent({ pendentes: 90, sucesso: 14 }), { ...ctx, nsRota: true }).curto, "NS Express");
});
