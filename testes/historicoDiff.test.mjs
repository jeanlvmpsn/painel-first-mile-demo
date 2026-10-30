import assert from "node:assert/strict";
import { test } from "node:test";

import { diferencaDoHistorico } from "../app/lib/historicoDiff.ts";

const chave = (l) => l[0] + "|" + l[1];

test("linha que nao existe no historico entra como nova", () => {
  const r = diferencaDoHistorico(
    [["16/09/2026", "T1", "aceite"]],
    [],
    chave,
  );
  assert.equal(r.novas.length, 1);
  assert.equal(r.correcoes.length, 0);
});

test("linha igual nao mexe em nada", () => {
  const linha = ["16/09/2026", "T1", "aceite"];
  const r = diferencaDoHistorico([linha], [linha], chave);
  assert.equal(r.novas.length, 0);
  assert.equal(r.correcoes.length, 0);
});

test("resposta que mudou depois vira correcao, nao duplicata", () => {
  const r = diferencaDoHistorico(
    [["16/09/2026", "T1", "aceite"]],
    [["16/09/2026", "T1", "semResposta"]],
    chave,
  );
  assert.equal(r.novas.length, 0, "nao pode duplicar a mesma rota");
  assert.deepEqual(r.correcoes, [
    { linha: 0, valores: ["16/09/2026", "T1", "aceite"] },
  ]);
});

test("a correcao aponta a posicao certa dentro do historico", () => {
  const r = diferencaDoHistorico(
    [["16/09/2026", "T3", "recusa"]],
    [
      ["15/09/2026", "T1", "aceite"],
      ["15/09/2026", "T2", "aceite"],
      ["16/09/2026", "T3", "aceite"],
    ],
    chave,
  );
  assert.equal(r.correcoes[0].linha, 2);
});

test("celula vazia cortada pela planilha nao conta como diferenca", () => {
  const r = diferencaDoHistorico(
    [["16/09/2026", "T1", "aceite", ""]],
    [["16/09/2026", "T1", "aceite"]],
    chave,
  );
  assert.equal(r.correcoes.length, 0);
});

test("aba viva repetindo a mesma rota grava uma vez so", () => {
  const r = diferencaDoHistorico(
    [
      ["16/09/2026", "T1", "aceite"],
      ["16/09/2026", "T1", "aceite"],
    ],
    [],
    chave,
  );
  assert.equal(r.novas.length, 1);
});

test("dia inteiro novo entra junto com correcao de outro dia", () => {
  const r = diferencaDoHistorico(
    [
      ["16/09/2026", "T9", "aceite"],
      ["15/09/2026", "T1", "recusa"],
    ],
    [["15/09/2026", "T1", "aceite"]],
    chave,
  );
  assert.equal(r.novas.length, 1);
  assert.equal(r.correcoes.length, 1);
});
