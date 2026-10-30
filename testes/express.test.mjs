import assert from "node:assert/strict";
import { test } from "node:test";

import {
  contarExpress,
  contarExpressSemPlaca,
  ehExpress,
  placasExpress,
  placasRepetidas,
  temPlaca,
  textoExpress,
} from "../app/lib/express.ts";

const r = (extra) => ({
  rota: "CPS_C01_MEL_001",
  placa: "TAR3C98",
  tipoRota: "express",
  ...extra,
});

test("express e reconhecida em qualquer caixa", () => {
  assert.equal(ehExpress("express"), true);
  assert.equal(ehExpress("Express"), true);
  assert.equal(ehExpress("first_mile"), false);
  assert.equal(ehExpress(undefined), false);
});

test("o texto que a aba grava no lugar da placa nao conta como placa", () => {
  assert.equal(temPlaca("TAR3C98"), true);
  assert.equal(temPlaca("NAO ATRIBUIDO"), false);
  assert.equal(temPlaca("NÃO ATRIBUIDO"), false);
  assert.equal(temPlaca("Não Atribuído"), false);
  assert.equal(temPlaca("NAO_ATRIBUIDO"), false);
  assert.equal(temPlaca(""), false);
  assert.equal(temPlaca("   "), false);
  assert.equal(temPlaca(undefined), false);
});

test("so entram express com placa, uma linha por rota, em ordem", () => {
  const lista = [
    r({ rota: "CPS_C01_MEL_001", placa: "UBC8B58" }),
    r({ rota: "CPS_C01_MEL_002", placa: "TAR3C98" }),
    r({ rota: "CPS_C01_MEL_003", placa: "NÃO ATRIBUIDO" }),
    r({ rota: "CPS_C01_004", tipoRota: "first_mile", placa: "AAA1A11" }),
  ];
  assert.deepEqual(placasExpress(lista), ["TAR3C98", "UBC8B58"]);
});

test("mesma rota repetida na aba conta uma vez so", () => {
  const lista = [
    r({ rota: "CPS_C01_MEL_001", placa: "TAR3C98" }),
    r({ rota: "cps_c01_mel_001 ", placa: "tar3c98" }),
  ];
  assert.deepEqual(placasExpress(lista), ["TAR3C98"]);
  assert.equal(contarExpress(lista), 1);
});

test("placa em duas rotas express aparece duas vezes e bate com o painel", () => {
  const lista = [
    r({ rota: "CPS_C01_MEL_001", placa: "TAR3C98" }),
    r({ rota: "CPS_C02_MEL_002", placa: "TAR3C98" }),
    r({ rota: "CPS_C03_MEL_003", placa: "UBC8B58" }),
  ];
  const placas = placasExpress(lista);
  assert.deepEqual(placas, ["TAR3C98", "TAR3C98", "UBC8B58"]);
  assert.equal(placas.length, contarExpress(lista));
  assert.deepEqual(placasRepetidas(placas), [{ placa: "TAR3C98", rotas: 2 }]);
  assert.match(textoExpress(placas), /são 03 no total/);
});

test("conta quantas express ficaram sem placa", () => {
  const lista = [
    r({ rota: "CPS_C01_MEL_001" }),
    r({ rota: "CPS_C01_MEL_002", placa: "" }),
    r({ rota: "CPS_C01_MEL_003", placa: "NÃO ATRIBUIDO" }),
    r({ rota: "CPS_C01_004", tipoRota: "first_mile", placa: "" }),
  ];
  assert.equal(contarExpressSemPlaca(lista), 2);
  assert.equal(contarExpress(lista), 3);
});

test("o texto sai exatamente como ele manda no grupo", () => {
  assert.equal(
    textoExpress(["TAR3C98", "TAR3E35"]),
    "Bom dia time,\n\n" +
      "Segue relação das expresss de hoje, são 02 no total\n\n" +
      "TAR3C98\nTAR3E35",
  );
});

test("uma so fica no singular", () => {
  assert.match(textoExpress(["TAR3C98"]), /é 01 no total/);
});

test("dia sem express nao inventa lista", () => {
  assert.equal(textoExpress([]), "Bom dia time,\n\nHoje não temos expresss.");
});
