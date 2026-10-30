import assert from "node:assert/strict";
import { test } from "node:test";

import { etapaDaRota, lerEtapasColeta } from "../app/lib/etapaColeta.ts";

const CAB = ["DATA", "ROUTE_ID", "ROTA", "STATUS", "INICIO_ROTA", "A_CAMINHO_CD", "NO_CD", "DESCARREGANDO", "CHEGOU_CD", "ATUALIZADO_EM", "PARADAS_TOTAL", "PARADAS_PENDENTES"];
const l = (id, rota, status, extra = {}) => {
  const o = { DATA: "06/10/2026", ROUTE_ID: id, ROTA: rota, STATUS: status, ...extra };
  return CAB.map((c) => o[c] ?? "");
};

test("etapa da coleta pela lista do sistema", () => {
  const e = lerEtapasColeta(
    [
      CAB,
      l("1", "CAMPINAS_C01_001", "active", { INICIO_ROTA: "2026-10-06 09:00:00", PARADAS_TOTAL: "8", PARADAS_PENDENTES: "3" }),

      l("2", "CAMPINAS_C01_002", "active", { PARADAS_TOTAL: "5", PARADAS_PENDENTES: "0" }),
      l("3", "CAMPINAS_C01_003", "active", { A_CAMINHO_CD: "SIM" }),
      l("4", "CAMPINAS_C01_004", "close"),
      l("5", "CAMPINAS_C01_005", "pending"),

      ["05/10/2026", "6", "CAMPINAS_C01_006", "close"],
    ],
    "06/10/2026",
  );
  assert.equal(etapaDaRota(e, "CAMPINAS_C01_001"), "coletando");
  assert.equal(etapaDaRota(e, "CPS_C01_002"), "finalizada");
  assert.equal(etapaDaRota(e, "CAMPINAS_C01_003"), "finalizada");
  assert.equal(etapaDaRota(e, "CAMPINAS_C01_004"), "finalizada");
  assert.equal(etapaDaRota(e, "CAMPINAS_C01_005"), "nao_iniciada");

  assert.equal(etapaDaRota(e, "CAMPINAS_C01_006"), "nao_iniciada");

  assert.equal(etapaDaRota(e, "QUALQUER", "4"), "finalizada");
});

test("aba antiga sem as colunas de paradas: so status e marcacoes", () => {
  const cab = ["DATA", "ROUTE_ID", "ROTA", "STATUS"];
  const e = lerEtapasColeta([cab, ["06/10/2026", "1", "R1", "active"], ["06/10/2026", "2", "R2", "close"]], "06/10/2026");
  assert.equal(etapaDaRota(e, "R1"), "coletando");
  assert.equal(etapaDaRota(e, "R2"), "finalizada");
});
