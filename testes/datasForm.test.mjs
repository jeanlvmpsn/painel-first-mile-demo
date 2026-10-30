import assert from "node:assert/strict";
import { test } from "node:test";

import { corrigirDataForm } from "../app/lib/datasForm.ts";

const C = (s) => s + " 18:30:00";

test("data boa passa intacta, so padronizada", () => {
  assert.equal(corrigirDataForm("11/09/2026", C("11/09/2026")), "11/09/2026");
  assert.equal(corrigirDataForm("1/9/2026", C("01/09/2026")), "01/09/2026");
  assert.equal(corrigirDataForm(" 11/09/2026 ", C("11/09/2026")), "11/09/2026");
});

test("ano de dois digitos vira o ano do carimbo", () => {
  assert.equal(corrigirDataForm("21/08/0026", C("24/08/2026")), "21/08/2026");
});

test("ano impossivel de qualquer feitio vem do carimbo", () => {
  assert.equal(corrigirDataForm("07/07/2027", C("07/07/2026")), "07/07/2026");
  assert.equal(corrigirDataForm("03/07/2926", C("03/07/2026")), "03/07/2026");
  assert.equal(corrigirDataForm("10/09/2006", C("10/09/2026")), "10/09/2026");
  assert.equal(corrigirDataForm("11/07/2206", C("12/07/2026")), "11/07/2026");

  assert.equal(corrigirDataForm("24/08/2024", C("24/08/2026")), "24/08/2026");
});

test("o dia e o mes sao do motorista, nao do carimbo", () => {
  assert.equal(corrigirDataForm("12/06/0026", C("18/06/2026")), "12/06/2026");
  assert.equal(corrigirDataForm("14/07/0026", C("15/07/2026")), "14/07/2026");
});

test("virada de ano: rota de 31/12 respondida em 01/01 nao vai pro futuro", () => {
  assert.equal(
    corrigirDataForm("31/12/2026", "01/01/2027 00:20:11"),
    "31/12/2026"
  );
  assert.equal(
    corrigirDataForm("31/12/0026", "01/01/2027 00:20:11"),
    "31/12/2026"
  );

  assert.equal(
    corrigirDataForm("01/01/2027", "01/01/2027 23:10:00"),
    "01/01/2027"
  );
});

test("sem data digitada nao ha o que consertar", () => {
  assert.equal(corrigirDataForm("", C("18/06/2026")), "");
  assert.equal(corrigirDataForm(null, C("18/06/2026")), "");
  assert.equal(corrigirDataForm("   ", C("18/06/2026")), "");
  assert.equal(corrigirDataForm("ontem", C("18/06/2026")), "");
});

test("dia ou mes impossivel nao vira chute", () => {
  assert.equal(corrigirDataForm("32/10/2026", C("30/10/2026")), "");
  assert.equal(corrigirDataForm("10/13/2026", C("10/12/2026")), "");
  assert.equal(corrigirDataForm("00/10/2026", C("10/10/2026")), "");
});

test("sem carimbo legivel, cai na regra do 20xx", () => {
  assert.equal(corrigirDataForm("21/08/0026", "38%"), "21/08/2026");
  assert.equal(corrigirDataForm("21/08/2026", ""), "21/08/2026");
});

test("data poucos dias a frente do carimbo nao volta um ano", () => {
  assert.equal(corrigirDataForm("28/08/2026", C("28/07/2026")), "28/08/2026");
  assert.equal(corrigirDataForm("12/08/2026", C("11/08/2026")), "12/08/2026");
  assert.equal(corrigirDataForm("10/09/2026", C("10/08/2026")), "10/09/2026");
});

test("so distancia de mais de meio ano e virada de ano", () => {
  assert.equal(
    corrigirDataForm("31/12/2026", "01/01/2027 00:20:11"),
    "31/12/2026"
  );

  assert.equal(
    corrigirDataForm("20/12/0026", "02/02/2027 09:00:00"),
    "20/12/2026"
  );
});
