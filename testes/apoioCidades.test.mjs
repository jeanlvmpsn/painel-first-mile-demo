import assert from "node:assert/strict";
import { test } from "node:test";

import { chaveCidade, lerTabelaApoio, motivoDeApoio } from "../app/lib/apoioCidades.ts";
import { montarMapaApoio, noCaminho } from "../app/lib/caminhoCidades.ts";
import { rotasQuePodemAjudar, VEICULOS } from "../app/lib/estouro.ts";

test("chave de cidade ignora UF, acento e caixa", () => {
  assert.equal(chaveCidade("Santo Antônio de Posse/SP"), "SANTO ANTONIO DE POSSE");
  assert.equal(chaveCidade("amparo - sp"), "AMPARO");
  assert.equal(chaveCidade(" SERRA  NEGRA "), "SERRA NEGRA");
});

test("caminho automatico: Serra Negra apoia Amparo, o inverso nao; longe nao", () => {
  assert.equal(noCaminho("Serra Negra/SP", "Amparo/SP"), true);
  assert.equal(noCaminho("Amparo/SP", "Serra Negra/SP"), false);
  assert.equal(noCaminho("Itatiba/SP", "Valinhos/SP"), true);

  assert.equal(noCaminho("Amparo/SP", "Hortolândia/SP"), false);
  assert.equal(noCaminho("Amparo/SP", "Amparo/SP"), false);
});

test("planilha manda nas cidades que lista; vazio = so a propria", () => {
  const planilha = [
    ["CIDADE_DA_ROTA", "PODE_APOIAR"],
    ["Socorro", ""],
    ["Amparo", "Monte Alegre do Sul; Pedreira"],
    ["amparo/SP", "Jaguariúna"],
  ];
  const tabela = lerTabelaApoio(planilha);
  assert.deepEqual([...tabela.get("AMPARO")], ["MONTE ALEGRE DO SUL", "PEDREIRA", "JAGUARIUNA"]);
  assert.deepEqual([...tabela.get("SOCORRO")], []);

  const mapa = montarMapaApoio(["Socorro/SP", "Amparo/SP", "Serra Negra/SP", "Monte Alegre do Sul/SP"], planilha);
  assert.deepEqual(mapa.SOCORRO, { nome: "Socorro/SP", para: [], fonte: "planilha" });
  assert.deepEqual(mapa.AMPARO.para, ["Monte Alegre do Sul/SP", "PEDREIRA", "JAGUARIUNA"]);
  assert.equal(mapa["SERRA NEGRA"].fonte, "automático");
  assert.deepEqual(mapa["SERRA NEGRA"].para, ["Amparo/SP"]);
});

test("motivo: mesma cidade antes do caminho", () => {
  const mapa = { "SERRA NEGRA": { nome: "Serra Negra/SP", para: ["Amparo/SP"], fonte: "automático" } };
  assert.deepEqual(motivoDeApoio(["Serra Negra/SP"], ["Amparo/SP"], mapa), {
    tipo: "caminho", de: "Serra Negra/SP", para: "Amparo/SP", fonte: "automático",
  });
  assert.deepEqual(motivoDeApoio(["Serra Negra/SP", "Amparo/SP"], ["AMPARO/SP"], mapa), { tipo: "mesma", cidade: "AMPARO/SP" });
  assert.equal(motivoDeApoio(["Amparo/SP"], ["Serra Negra/SP"], mapa), null);
});

test("rotas que podem ajudar: mesma cidade e caminho, nunca contra o caminho", () => {
  const toco = VEICULOS.find((v) => v.tipo === "Toco");
  const rota = (nome, cidades, volumeM3, risco) => ({
    rota: nome, veiculo: "Toco", tipo: toco, transportadora: "", cluster: "C24", eta: "", paradas: 1,
    pacotes: 1, pesoKg: 100, volumeM3, usoPeso: 0, usoVolume: volumeM3 / toco.cubagemM3, risco, gargalo: null,
    detalhe: [], cidades,
  });
  const alvo = rota("C24_ALVO", ["Amparo/SP"], 60, "estouro");
  const todas = [
    alvo,
    rota("C24_AMPARO", ["Amparo/SP"], 20, "ok"),
    rota("C24_SERRA", ["Serra Negra/SP"], 5, "ok"),
    rota("C24_SOCORRO", ["Socorro/SP"], 5, "ok"),
  ];
  const mapa = montarMapaApoio(["Amparo/SP", "Serra Negra/SP", "Socorro/SP"], [["CIDADE_DA_ROTA", "PODE_APOIAR"], ["Socorro", ""]]);
  const lista = rotasQuePodemAjudar(alvo, todas, mapa);

  assert.deepEqual(lista.map((a) => [a.rota.rota, a.motivo.tipo]), [["C24_AMPARO", "mesma"], ["C24_SERRA", "caminho"]]);

  assert.deepEqual(rotasQuePodemAjudar(alvo, todas).map((a) => a.rota.rota), ["C24_AMPARO"]);
});

test("cidade de cada ponto pela previsao e cidades da rota dedicada pelas paradas", async () => {
  const { cidadesDosPontos, cidadesDasParadas } = await import("../app/lib/estouro.ts");
  const { chaveId } = await import("../app/lib/hb.ts");
  const linhas = [
    ["DATA", "ID_SELLER", "ADDRESS_ID", "PACOTES", "CIDADE", "UF_ID", "UF_NOME"],
    ["2026-09-30", "1350936795", "1594663858", "10", "Amparo", "BR-SP", "São Paulo"],
    ["2026-10-01", "1350936795", "1594663858", "12", "Amparo", "BR-SP", "São Paulo"],
    ["2026-09-30", "444058478", "1628899889", "5", "Pedreira", "", "São Paulo"],
    ["2026-09-30", "849817033_340850", "1324633908", "893", "", "", ""],
    ["2026-09-30", "301081049", "1594665200", "3", "Espírito Santo do Pinhal", "MG", ""],
  ];
  const m = cidadesDosPontos(linhas, chaveId);
  assert.equal(m.get(chaveId("1350936795")), "Amparo/SP");
  assert.equal(m.get(chaveId("444058478")), "Pedreira/SP");
  assert.equal(m.get(chaveId("301081049")), "Espírito Santo do Pinhal/MG");

  assert.equal(m.has(chaveId("849817033_340850")), false);

  const detalhe = [
    { id: "a", nome: "", pacotes: 5, pesoKg: 0, volumeM3: 0, cidade: "Pedreira/SP" },
    { id: "b", nome: "", pacotes: 40, pesoKg: 0, volumeM3: 0, cidade: "Amparo/SP" },
    { id: "c", nome: "", pacotes: 10, pesoKg: 0, volumeM3: 0 },
  ];
  assert.deepEqual(cidadesDasParadas(detalhe), ["Amparo/SP", "Pedreira/SP"]);
});

test("BRP casa com o id do usuario da previsao", async () => {
  const { idDoUsuarioBrp, porId } = await import("../app/lib/hb.ts");
  assert.equal(idDoUsuarioBrp("BRP3817427511"), "381742751");
  assert.equal(idDoUsuarioBrp("brp489592844VKM0"), "489592844");
  assert.equal(idDoUsuarioBrp("849817033_340850"), "");
  const m = new Map([["381742751", "Amparo/SP"], ["849817033_340850", "Amparo/SP"]]);
  assert.equal(porId(m, "BRP3817427511"), "Amparo/SP");
  assert.equal(porId(m, "849817033_340850"), "Amparo/SP");
  assert.equal(porId(m, "BRP999"), undefined);
  assert.equal(porId(m, ""), undefined);
});
