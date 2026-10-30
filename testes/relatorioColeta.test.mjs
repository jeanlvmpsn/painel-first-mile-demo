import assert from "node:assert/strict";
import { test } from "node:test";

import { colunaIdParada, ehLinhaDoCd, semLinhasDoCd } from "../app/lib/relatorioColeta.ts";

const CAB = ["Data da rota", "ID do Rota", "Nome da Rota", "ID de parada", "Nome", "Pontualidade"];

test("linha da parada CAMPINAS (o CD, sem ID) sai; parada normal fica", () => {
  const iParada = colunaIdParada(CAB);
  assert.equal(iParada, 3);
  const cd = ["06/10/2026", "451438478", "CAMPINAS_C01_521", "", "CAMPINAS", "12:50hs - early"];
  const parada = ["06/10/2026", "451438478", "CAMPINAS_C01_521", "162722767", "PRATAMETAL", "11:21hs - on_time"];

  const semId = ["06/10/2026", "451438478", "CAMPINAS_C01_521", "", "OUTRO", ""];
  assert.equal(ehLinhaDoCd(cd, iParada), true);
  assert.equal(ehLinhaDoCd(parada, iParada), false);
  assert.equal(ehLinhaDoCd(semId, iParada), false);
  assert.deepEqual(semLinhasDoCd([CAB, cd, parada, semId]), [CAB, parada, semId]);
});

test("sem a coluna de ID de parada nada sai", () => {
  const cab = ["Data", "Rota"];
  const linhas = [cab, ["06/10/2026", "CAMPINAS"]];
  assert.deepEqual(semLinhasDoCd(linhas), linhas);
});
