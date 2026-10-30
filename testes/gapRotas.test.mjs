import assert from "node:assert/strict";
import { test } from "node:test";

import { ehTransportadoraFake, lerAjustesGap, montarGap, textoGap } from "../app/lib/gapRotas.ts";

const rota = (nome, transportadora = "", start = "08:00") => ({
  data: "23/10/2026", rota: nome, start, transportadora, placa: "", regiao: "CPS", cluster: "C05", atribuida: false,
});

const paradas = [
  { rota: "CAMPINAS_C05_215", idParada: "849_1", nome: "LOJA A", pacotes: 320 },
  { rota: "CAMPINAS_C05_215", idParada: "849_2", nome: "LOJA B", pacotes: 150 },
  { rota: "CAMPINAS_C05_215", idParada: "849_3", nome: "LOJA C", pacotes: 90 },
  { rota: "CAMPINAS_C05_215", idParada: "849_4", nome: "LOJA D", pacotes: 100 },
  { rota: "CAMPINAS_C05_216", idParada: "849_5", nome: "LOJA E", pacotes: 40 },
  { rota: "CAMPINAS_C07_300", idParada: "849_6", nome: "LOJA F", pacotes: 210 },
  { rota: "CAMPINAS_C04_100", idParada: "849_1", nome: "LOJA A", pacotes: 80 },

  { rota: "CAMPINAS_C10_403", idParada: "849_9", pacotes: null },
];
const CAB = ["DATA", "ROTA", "ID_PARADA", "ACAO", "AUTOR", "REGISTRADO_EM"];
const ROTAS = [
  rota("CAMPINAS_C05_215"),
  rota("CAMPINAS_C05_216"),
  rota("CAMPINAS_C07_300", "A DEFINIR"),
  rota("CAMPINAS_C10_403"),
  rota("CAMPINAS_C04_100", "Alfa"),
];

test("gap: transportadora fake", () => {
  assert.equal(ehTransportadoraFake("A DEFINIR"), true);
  assert.equal(ehTransportadoraFake("A Definir Logística"), true);
  assert.equal(ehTransportadoraFake("Alfa Logistics"), false);
});

test("gap: sem transportadora ou A DEFINIR entra, com as paradas de 100+ planejados na config de D+1", () => {
  const r = montarGap({ rotas: ROTAS, paradas, ajustes: new Map() });
  assert.deepEqual(r.rotas.map((x) => x.rota), ["CAMPINAS_C05_215", "CAMPINAS_C05_216", "CAMPINAS_C07_300", "CAMPINAS_C10_403"]);
  assert.deepEqual(r.outras, [{ rota: "CAMPINAS_C04_100", transportadora: "Alfa" }]);
  assert.deepEqual(r.rotas[0].pontos.map((p) => p.id + ":" + p.pacotes + ":" + p.noReport), [
    "849_1:320:true", "849_2:150:true", "849_4:100:true", "849_3:90:false",
  ]);
  const txt = textoGap(r.rotas, "23/10/2026").split("\n");
  assert.deepEqual(txt, [
    "*GAP de Rotas - 23/10*",
    "*Rotas em aberto:* 04",
    "",
    "*CAMPINAS_C05_215* - Sem transportadora (03 de 04 paradas)",
    "LOJA A - 849_1 - 320 pcts",
    "LOJA B - 849_2 - 150 pcts",
    "LOJA D - 849_4 - 100 pcts",
    "",
    "*CAMPINAS_C05_216* - Sem transportadora (00 de 01 paradas)",
    "Nenhuma parada com 100+ pcts planejados",
    "",
    "*CAMPINAS_C07_300* - A DEFINIR (01 de 01 paradas)",
    "LOJA F - 849_6 - 210 pcts",
    "",
    "*CAMPINAS_C10_403* - Sem transportadora (00 de 01 paradas)",
    "Rota sem paradas na config do dia",
  ]);
});

test("gap: ajustes do time - incluir rota com transportadora, tirar rota, marcar/desmarcar e incluir parada; o mais recente vale", () => {
  const ajustes = lerAjustesGap(
    [
      CAB,
      ["23/10/2026", "CAMPINAS_C04_100", "", "incluir", "Ana", "22/10/2026 18:00:00"],
      ["23/10/2026", "CAMPINAS_C05_216", "", "excluir", "Ana", "22/10/2026 18:01:00"],
      ["23/10/2026", "CAMPINAS_C05_215", "849_1", "excluir", "Ana", "22/10/2026 18:02:00"],
      ["23/10/2026", "CAMPINAS_C05_215", "849_3", "incluir", "Ana", "22/10/2026 18:03:00"],
      ["23/10/2026", "CAMPINAS_C05_215", "849_6", "incluir", "Ana", "22/10/2026 18:04:00"],

      ["23/10/2026", "CAMPINAS_C05_215", "849_1", "auto", "Ana", "22/10/2026 18:05:00"],

      ["22/10/2026", "CAMPINAS_C05_215", "849_2", "excluir", "Ana", "21/10/2026 18:00:00"],
    ],
    "23/10/2026",
  );
  const r = montarGap({ rotas: ROTAS, paradas, ajustes });
  assert.deepEqual(r.rotas.map((x) => x.rota), ["CAMPINAS_C04_100", "CAMPINAS_C05_215", "CAMPINAS_C07_300", "CAMPINAS_C10_403"]);
  assert.deepEqual(r.tiradas.map((x) => x.rota), ["CAMPINAS_C05_216"]);
  const c215 = r.rotas[1];
  assert.deepEqual(c215.pontos.filter((p) => p.noReport).map((p) => p.id), ["849_1", "849_2", "849_4", "849_3", "849_6"]);

  const fora = c215.pontos.find((p) => p.id === "849_6");
  assert.equal(fora.noPlano, false);
  assert.equal(fora.nome, "LOJA F");
  assert.equal(fora.pacotes, null);
  const txt = textoGap(r.rotas, "23/10/2026");
  assert.ok(txt.includes("*CAMPINAS_C04_100* - Alfa (00 de 01 paradas)"));
  assert.ok(txt.includes("\nLOJA F - 849_6\n") || txt.endsWith("\nLOJA F - 849_6"));
});
