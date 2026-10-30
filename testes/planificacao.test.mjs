import assert from "node:assert/strict";
import { test } from "node:test";

import { rotasComCarga, rotasQuePodemAjudar } from "../app/lib/estouro.ts";
import { municipioDoPonto } from "../app/lib/municipios.ts";
import { chaveRotaPlanificacao, cidadesPorRota, mesmaCidade } from "../app/lib/planificacao.ts";

const CAMPINAS = [-22.9056, -47.0608];
const SUMARE = [-22.8219, -47.2669];
const HORTOLANDIA = [-22.8583, -47.22];
const MONTE_MOR = [-22.9467, -47.3158];
const POCOS = [-21.7878, -46.5614];

test("municipio do ponto pelos poligonos do IBGE, SP e MG", () => {
  assert.equal(municipioDoPonto(...CAMPINAS), "Campinas/SP");
  assert.equal(municipioDoPonto(...SUMARE), "Sumaré/SP");

  assert.equal(municipioDoPonto(...HORTOLANDIA), "Hortolândia/SP");
  assert.equal(municipioDoPonto(...MONTE_MOR), "Monte Mor/SP");
  assert.equal(municipioDoPonto(...POCOS), "Poços de Caldas/MG");

  assert.equal(municipioDoPonto(-8.05, -34.9), "");
  assert.equal(municipioDoPonto(NaN, 1), "");
});

test("nome da rota casa entre planificacao e config, com ou sem zero e prefixo", () => {
  assert.equal(chaveRotaPlanificacao("CAMPINAS_C05_062"), chaveRotaPlanificacao("CPS_C05_62"));
  assert.notEqual(chaveRotaPlanificacao("CAMPINAS_C05_62"), chaveRotaPlanificacao("CAMPINAS_C05_63"));
});

const p = (data, rota, [lat, lng], seq) => [data, rota, "C05_CPS", "Medio Fixo", String(seq), String(lat), String(lng), "30/09/2026 08:00:00"];
const ABA = [
  ["DATA", "ROTA", "CLUSTER", "VEICULO", "SEQ", "LAT", "LNG", "ATUALIZADO_EM"],
  p("30/09/2026", "CAMPINAS_C05_62", SUMARE, 1),
  p("30/09/2026", "CAMPINAS_C05_62", SUMARE, 2),
  p("30/09/2026", "CAMPINAS_C05_63", HORTOLANDIA, 1),
  p("30/09/2026", "CAMPINAS_C05_63", HORTOLANDIA, 2),
  p("30/09/2026", "CAMPINAS_C05_63", SUMARE, 3),
  p("30/09/2026", "CAMPINAS_C05_64", MONTE_MOR, 1),
  p("01/10/2026", "CAMPINAS_C05_62", CAMPINAS, 1),
];

test("cidades de cada rota, da que tem mais paradas para a que tem menos, so do dia", () => {
  const m = cidadesPorRota(ABA, "30/09/2026");
  assert.deepEqual(m.get(chaveRotaPlanificacao("CPS_C05_063")).cidades, ["Hortolândia/SP", "Sumaré/SP"]);
  assert.deepEqual(m.get(chaveRotaPlanificacao("CAMPINAS_C05_62")).cidades, ["Sumaré/SP"]);
  assert.deepEqual(cidadesPorRota(ABA, "01/10/2026").get(chaveRotaPlanificacao("CAMPINAS_C05_62")).cidades, ["Campinas/SP"]);
});

test("mesma cidade ignora acento e caixa", () => {
  assert.equal(mesmaCidade(["Sumaré/SP"], ["SUMARE/SP", "Hortolândia/SP"]), true);
  assert.equal(mesmaCidade(["Sumaré/SP"], ["Monte Mor/SP"]), false);
  assert.equal(mesmaCidade([], ["Sumaré/SP"]), false);
});

test("rotas que podem ajudar: so as que passam na mesma cidade", () => {
  const config = [
    ["VIGENCIA", "NOME_ROTA", "VEICULO", "ID_SELLER", "PACOTES", "PESO", "VOLUME", "CLUSTER"],
    ["30/09/2026", "CAMPINAS_C05_62", "VUC Fixo", "1", "100", "300", "17", "C05"],
    ["30/09/2026", "CAMPINAS_C05_63", "VUC Fixo", "2", "10", "100", "3", "C05"],
    ["30/09/2026", "CAMPINAS_C05_64", "VUC Fixo", "3", "10", "100", "2", "C05"],
  ];
  const { rotas } = rotasComCarga(config, "30/09/2026");
  const cidades = cidadesPorRota(ABA, "30/09/2026");
  for (const r of rotas) r.cidades = cidades.get(chaveRotaPlanificacao(r.rota))?.cidades ?? [];
  const alvo = rotas.find((r) => r.rota === "CAMPINAS_C05_62");

  assert.deepEqual(rotasQuePodemAjudar(alvo, rotas).map((a) => a.rota.rota), ["CAMPINAS_C05_63"]);

  alvo.cidades = [];
  assert.deepEqual(rotasQuePodemAjudar(alvo, rotas).map((a) => a.rota.rota), [
    "CAMPINAS_C05_64",
    "CAMPINAS_C05_63",
  ]);
});
