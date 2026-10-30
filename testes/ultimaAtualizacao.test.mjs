import assert from "node:assert/strict";
import { test } from "node:test";

import { carimboDaAba, extrairCarimbos } from "../app/lib/ultimaAtualizacao.ts";

const linhas = [
  ["Credencial", "abc"],
  ["Última atualização atribuição", "OK — 312 rotas — 24/09/2026 14:30:05"],
  ["Última atualização", "ERRO — sessão expirada 401 — 24/09/2026 13:00:00"],
  ["Tutorial", "https://x"],
];

test("le so as linhas de ultima atualizacao", () => {
  const c = extrairCarimbos(linhas);
  assert.equal(c.length, 2);
  assert.equal(c[0].rotulo, "ultima atualizacao atribuicao");
  assert.equal(c[0].quando, "24/09/2026 14:30:05");
  assert.equal(c[0].estado, "ok");
  assert.equal(c[1].estado, "erro");
});

test("cada aba pega o seu carimbo", () => {
  const c = extrairCarimbos(linhas);
  assert.equal(carimboDaAba("/atribuicoes", c).rotulo, "ultima atualizacao atribuicao");
  assert.equal(carimboDaAba("/avulsas", c).rotulo, "ultima atualizacao");
  assert.equal(carimboDaAba("/", c).rotulo, "ultima atualizacao atribuicao");
  assert.equal(carimboDaAba("/reports/hb", c).rotulo, "ultima atualizacao atribuicao");

  assert.equal(carimboDaAba("/scheduling", c), null);
});

test("linha propria da aba ganha da reserva", () => {
  const c = extrairCarimbos([
    ...linhas,
    ["Ultima atualizacao scheduling", "OK — 24/09/2026 14:00:00"],
    ["Ultima atualizacao avulsas", "OK — 24/09/2026 12:00:00"],
  ]);
  assert.equal(carimboDaAba("/scheduling", c).quando, "24/09/2026 14:00:00");
  assert.equal(carimboDaAba("/avulsas", c).quando, "24/09/2026 12:00:00");
});
