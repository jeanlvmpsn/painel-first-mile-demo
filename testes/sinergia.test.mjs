import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarSinergia, montarAtendimentos } from "../app/lib/sinergia.ts";
import { clusterCanonico, transportadoraCanonica } from "../app/lib/pool.ts";

const decl = (tp, origem, tops) => ({
  transportadora: tp,
  hub: "CPS",
  origem,
  tops,
});

const lc = (cluster, extra = {}) => ({
  transportadora: "Alfa Logistics",
  cluster,
  perfil: "VUC",
  dentroDoPool: 0,
  desafio: 0,
  sobra: 0,
  recusas: 0,
  culpaPlanejamento: 0,
  culpaTransportadora: 0,
  sinergia: 0,
  sinergiaCedida: 0,
  ...extra,
});

const aplicar = (linhas, decls) =>
  aplicarSinergia(
    linhas,
    montarAtendimentos(decls, transportadoraCanonica, clusterCanonico),
    transportadoraCanonica,
  );

const achar = (r, cluster) => r.find((l) => l.cluster === cluster);

const ALFA = [decl("Alfa Logistics", "5", ["1", "11"]), decl("Alfa Logistics", "11", ["5"])];

test("sobra na origem cobre desafio no cluster declarado", () => {
  const r = aplicar([lc("C05", { sobra: 2 }), lc("C01", { desafio: 2 })], ALFA);
  assert.equal(achar(r, "C01").desafio, 0);
  assert.equal(achar(r, "C01").sinergia, 2);
  assert.equal(achar(r, "C01").dentroDoPool, 2);
  assert.equal(achar(r, "C05").sobra, 0);
  assert.equal(achar(r, "C05").sinergiaCedida, 2);
});

test("o caminho de volta nao vale sozinho", () => {
  const r = aplicar([lc("C01", { sobra: 3 }), lc("C05", { desafio: 3 })], ALFA);
  assert.equal(achar(r, "C05").desafio, 3);
  assert.equal(achar(r, "C01").sobra, 3);
});

test("o caminho de volta vale quando a planilha declara os dois sentidos", () => {
  const r = aplicar([lc("C11", { sobra: 2 }), lc("C05", { desafio: 2 })], ALFA);
  assert.equal(achar(r, "C05").desafio, 0);
  assert.equal(achar(r, "C05").sinergia, 2);
});

test("dois destinos da mesma origem nao se atendem entre si", () => {
  const r = aplicar([lc("C01", { sobra: 4 }), lc("C11", { desafio: 4 })], ALFA);
  assert.equal(achar(r, "C11").desafio, 4);
  assert.equal(achar(r, "C01").sobra, 4);
});

test("sem nenhuma declaracao, nada e abatido", () => {
  const r = aplicar([lc("C05", { sobra: 5 }), lc("C01", { desafio: 3 })], []);
  assert.equal(achar(r, "C01").desafio, 3);
});

test("sinergia nao atravessa transportadora", () => {
  const r = aplicar(
    [lc("C05", { sobra: 4, transportadora: "ZETA" }), lc("C01", { desafio: 4 })],
    ALFA,
  );
  assert.equal(achar(r, "C01").desafio, 4);
});

test("sinergia nao troca o tipo do carro", () => {
  const r = aplicar(
    [lc("C05", { sobra: 4, perfil: "Van" }), lc("C01", { desafio: 4 })],
    ALFA,
  );
  assert.equal(achar(r, "C01").desafio, 4);
});

test("cobre so ate onde a sobra alcanca", () => {
  const r = aplicar([lc("C05", { sobra: 1 }), lc("C01", { desafio: 4 })], ALFA);
  assert.equal(achar(r, "C01").sinergia, 1);
  assert.equal(achar(r, "C01").desafio, 3);
});

test("uma sobra so cobre um desafio de cada vez", () => {
  const r = aplicar(
    [lc("C05", { sobra: 3 }), lc("C01", { desafio: 2 }), lc("C11", { desafio: 2 })],
    ALFA,
  );
  assert.equal(r.reduce((s, l) => s + l.sinergia, 0), 3);
  assert.equal(r.reduce((s, l) => s + l.desafio, 0), 1);
});

test("sinergia nao muda a culpa: acima do pool e culpa do planejamento", () => {
  const r = aplicar(
    [lc("C05", { sobra: 2 }), lc("C01", { desafio: 2, recusas: 1 })],
    ALFA,
  );
  assert.equal(achar(r, "C01").culpaPlanejamento, 1);
  assert.equal(achar(r, "C01").culpaTransportadora, 0);
});

test("sinergia abate o desafio mas a culpa segue o desafio de origem", () => {
  const r = aplicar(
    [lc("C05", { sobra: 1 }), lc("C01", { desafio: 3, recusas: 3 })],
    ALFA,
  );
  assert.equal(achar(r, "C01").desafio, 2);
  assert.equal(achar(r, "C01").culpaPlanejamento, 3);
  assert.equal(achar(r, "C01").culpaTransportadora, 0);
});

test("cluster escrito como numero na planilha vira C0X", () => {
  const m = montarAtendimentos(ALFA, transportadoraCanonica, clusterCanonico);
  const chave = transportadoraCanonica("Alfa Logistics") + "|C05";
  assert.ok(m.get(chave).has("C01"));
  assert.ok(m.get(chave).has("C11"));
});

test("linhas repetidas da mesma origem somam destinos", () => {
  const m = montarAtendimentos(
    [decl("ZETA", "8", ["15"]), decl("ZETA", "8", ["10", "9"])],
    transportadoraCanonica,
    clusterCanonico,
  );
  const destinos = m.get(transportadoraCanonica("ZETA") + "|C08");
  assert.equal(destinos.size, 3);
});
