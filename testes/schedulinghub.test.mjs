import assert from "node:assert/strict";
import { test } from "node:test";

import { FORA_DO_DIA, contarHubs } from "../app/lib/schedulingTipos.ts";
import { listarComE } from "../app/lib/relatorioTipos.ts";

const pedido = (extra = {}) => ({
  data: "12/09/2026",
  travelId: extra.travelId ?? "t1",
  transportadora: extra.transportadora ?? "ALFA",
  situacao: extra.situacao ?? "semResposta",
  statusBruto: "",
  motivo: "",
  perfil: "Vuc",
  zona: "",
  cluster: "C01",
  hub: extra.hub ?? "CPS",
  eta: "",
  destino: "",
  foraDoDia: extra.foraDoDia ?? false,
});

test("contarHubs ordena por quem tem mais pendencia", () => {
  const lista = contarHubs([
    pedido({ hub: "BRXSP14" }),
    pedido({ hub: "BRXSP14" }),
    pedido({ hub: "BRXSP14" }),
    pedido({ hub: "CPS" }),
    pedido({ hub: "BRXSP5" }),
  ]);
  assert.deepEqual(lista, [
    { hub: "BRXSP14", qtd: 3 },
    { hub: "BRXSP5", qtd: 1 },
    { hub: "CPS", qtd: 1 },
  ]);
  const soma = lista.reduce((a, h) => a + h.qtd, 0);
  assert.equal(soma, 5, "a quebra tem que fechar com o total");
});

test("pedido de outro dia nao soma num HUB que nao opera na data", () => {
  const lista = contarHubs([
    pedido({ hub: "CPS" }),
    pedido({ hub: "BRXSP5", foraDoDia: true }),
  ]);
  assert.deepEqual(lista, [
    { hub: "CPS", qtd: 1 },
    { hub: FORA_DO_DIA, qtd: 1 },
  ]);
});

test("pedido sem HUB gravado nao some da conta", () => {
  const lista = contarHubs([pedido({ hub: "" }), pedido({ hub: "CPS" })]);
  assert.equal(lista.length, 2);
  assert.ok(lista.some((h) => h.hub === "SEM HUB" && h.qtd === 1));
});

test("listarComE escreve virgula entre todos e 'e' antes do ultimo", () => {
  assert.equal(listarComE([]), "");
  assert.equal(listarComE(["CPS - 3"]), "CPS - 3");
  assert.equal(listarComE(["CPS - 3", "BRXSP5 - 1"]), "CPS - 3 e BRXSP5 - 1");
  assert.equal(
    listarComE(["BRXSP14 - 3", "BRXSP5 - 2", "CPS - 1"]),
    "BRXSP14 - 3, BRXSP5 - 2 e CPS - 1"
  );
});
