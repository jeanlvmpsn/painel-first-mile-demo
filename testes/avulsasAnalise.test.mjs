import assert from "node:assert/strict";
import { test } from "node:test";

import {
  categoriaDoMotivo,
  contarPorCategoria,
  contarPorCluster,
  contarPorTransportadora,
  resumoDePacotes,
} from "../app/lib/avulsasAnalise.ts";

const ESPERADO = {
  NSE: "NSE",
  "NSE Peso": "NSE",
  "Ajuste de Perfil": "NSE",
  "Ajuste de FMPP": "NSE",
  "ÁREA INACESSÍVEL": "NSE",
  "Área inacessível": "NSE",
  "Não subiu em Config": "NSE",
  "Carga Frágil": "NSE",
  "Dispersão Fcst": "NSE",
  "Substituição programada": "NSE",
  "NS Driver": "NS",
  NS: "NS",
  "M1 não atendida": "NS",
  "Rota cancelada": "NS",
  Backlog: "Backlog",
  "Sin drop off": "Backlog",
  "Erro MLP": "Erros",
  "Erro routing": "Erros",
  "Erro exec": "Erros",
  "Erro config": "Erros",
  "Liberação no XD": "Erros",
  "Atrasos MeliOne": "Outros",
  "Coleta cedo demais no place": "Outros",
  Apoio: "Outros",
  "Revertido pela mesma TSP": "Outros",
};

test("todo motivo da planilha cai na categoria certa", () => {
  for (const [motivo, cat] of Object.entries(ESPERADO)) {
    assert.equal(categoriaDoMotivo(motivo), cat, motivo);
  }
});

test("motivo novo ou vazio vai para Outros, nunca some da conta", () => {
  assert.equal(categoriaDoMotivo("Motivo que ainda nao existe"), "Outros");
  assert.equal(categoriaDoMotivo(""), "Outros");
  assert.equal(categoriaDoMotivo(undefined), "Outros");
});

test("config no nome nao faz virar erro, e erro config nao vira capacidade", () => {
  assert.equal(categoriaDoMotivo("Não subiu em Config"), "NSE");
  assert.equal(categoriaDoMotivo("Erro config"), "Erros");
});

test("por cluster conta, junta caixa diferente e ordena pelo maior", () => {
  const linhas = [{ cluster: "C01" }, { cluster: "c01" }, { cluster: "C05" }, { cluster: "" }];
  const r = contarPorCluster(linhas);
  assert.deepEqual(r.map((x) => x.rotulo), ["C01", "C05", "Sem cluster"]);
  assert.equal(r[0].vezes, 2);
  assert.equal(Math.round(r[0].porcento), 50);
});

test("por categoria soma os motivos de dentro e nao perde linha", () => {
  const linhas = [{ motivo: "NSE" }, { motivo: "NSE Peso" }, { motivo: "Backlog" }, { motivo: "Apoio" }];
  const r = contarPorCategoria(linhas);
  const cap = r.find((x) => x.categoria === "NSE");
  assert.equal(cap.vezes, 2);
  assert.equal(cap.motivos.length, 2);
  assert.equal(r.reduce((a, b) => a + b.vezes, 0), 4);
});

test("pacotes: total, SPR, menor, maior e faixas de 250", () => {
  const linhas = [
    { coletados: 0 },
    { coletados: 10 },
    { coletados: 100 },
    { coletados: 500 },
    {},
  ];
  const r = resumoDePacotes(linhas);
  assert.equal(r.avulsas, 5);
  assert.equal(r.comNumero, 4);
  assert.equal(r.total, 610);
  assert.equal(r.spr, 152.5);
  assert.equal(r.menor, 0);
  assert.equal(r.maior, 500);
  assert.deepEqual(
    r.faixas.map((f) => f.rotulo),
    ["0 a 250", "251 a 500", "mais de 500"],
  );
  assert.deepEqual(
    r.faixas.map((f) => f.vezes),
    [3, 1, 0],
  );
});

test("cada contagem carrega as avulsas que entraram nela", () => {
  const linhas = [
    { id: "1", cluster: "C01", motivo: "NSE", coletados: 10 },
    { id: "2", cluster: "C01", motivo: "Backlog", coletados: 900 },
  ];
  const cluster = contarPorCluster(linhas)[0];
  assert.equal(cluster.vezes, 2);

  assert.deepEqual(cluster.itens.map((i) => i.id), ["2", "1"]);

  const cat = contarPorCategoria(linhas).find((c) => c.categoria === "NSE");
  assert.deepEqual(cat.itens.map((i) => i.id), ["1"]);
  assert.deepEqual(cat.motivos[0].itens.map((i) => i.id), ["1"]);

  const faixa = resumoDePacotes(linhas).faixas.find((f) => f.rotulo === "mais de 500");
  assert.deepEqual(faixa.itens.map((i) => i.id), ["2"]);
});

test("por transportadora: agrupa, ordena e abre as avulsas", () => {
  const linhas = [
    { id: "1", transportadora: "Alfa", coletados: 10 },
    { id: "2", transportadora: "Alfa", coletados: 300 },
    { id: "3", transportadora: "KN Logistica", coletados: 5 },
    { id: "4", transportadora: "", coletados: 1 },
  ];
  const r = contarPorTransportadora(linhas);
  assert.deepEqual(r.map((c) => c.rotulo), ["Alfa", "KN Logistica", "Sem transportadora"]);
  assert.equal(r[0].vezes, 2);
  assert.equal(r[0].porcento, 50);
  assert.deepEqual(r[0].itens.map((i) => i.id), ["2", "1"]);
});

test("cada linha soma os pacotes das suas avulsas", () => {
  const linhas = [
    { id: "1", cluster: "C01", coletados: 10 },
    { id: "2", cluster: "C01", coletados: 300 },
    { id: "3", cluster: "C01" }, // sem numero nao entra na soma
    { id: "4", cluster: "C02" },
  ];
  const r = contarPorCluster(linhas);
  assert.equal(r.find((c) => c.rotulo === "C01").pacotes, 310);

  assert.equal(r.find((c) => c.rotulo === "C02").pacotes, null);
});
