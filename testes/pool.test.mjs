import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clusterCanonico,
  confrontarPool,
  motivoDeFora,
  repartirRecusas,
  semanaDe,
} from "../app/lib/pool.ts";
import { perfilCanonico } from "../app/lib/atribuicaoUtils.ts";

const OPC = { normalizarPerfil: perfilCanonico };

const linha = (tp, cluster, perfil, segSex, sabado = 0) => ({
  transportadora: tp, hub: "CPS", cluster, perfil,
  segSex, sabado, semana: 39, ano: 2026,
});

const pedido = (tp, cluster, perfil, situacao) => ({
  data: "15/09/2026", travelId: "t" + Math.random(), transportadora: tp,
  situacao, statusBruto: "", motivo: "", perfil, zona: "", cluster,
  hub: "CPS", eta: "", destino: "", foraDoDia: false,
});

test("o exemplo do Ana sai como ele descreveu", () => {
  const pool = [
    linha("Alfa Logistics", "1", "VUC", 2),
    linha("Alfa Logistics", "4", "VAN", 2),
  ];
  const pedidos = [
    pedido("Alfa Logistics", "C01", "VUC", "aceite"),
    pedido("Alfa Logistics", "C01", "VUC", "aceite"),
    pedido("Alfa Logistics", "C01", "VUC", "recusa"),
    pedido("Alfa Logistics", "C04", "VAN", "recusa"),
  ];
  const r = confrontarPool(pedidos, pool, { sabado: false, ...OPC });

  const vuc = r.find((b) => b.cluster === "C01");
  assert.equal(vuc.pool, 2);
  assert.equal(vuc.pedidos, 3);
  assert.equal(vuc.recusas, 1);

  assert.equal(vuc.culpaPlanejamento, 1, "o VUC que sobrou e do planejamento");
  assert.equal(vuc.culpaTransportadora, 0);

  const van = r.find((b) => b.cluster === "C04");
  assert.equal(van.pool, 2);
  assert.equal(van.pedidos, 1);

  assert.equal(van.culpaPlanejamento, 0);
  assert.equal(van.culpaTransportadora, 1, "a van e da transportadora");
});

test("recusa dentro do teto e sempre da transportadora", () => {
  assert.deepEqual(repartirRecusas(5, 3, 3), {
    planejamento: 0,
    transportadora: 3,
  });
});

test("pedido acima do teto explica a recusa, mas so ate onde sobra", () => {
  assert.deepEqual(repartirRecusas(2, 5, 4), {
    planejamento: 3,
    transportadora: 1,
  });

  assert.deepEqual(repartirRecusas(2, 5, 2), {
    planejamento: 2,
    transportadora: 0,
  });
});

test("pool zero joga toda recusa pro planejamento", () => {
  assert.deepEqual(repartirRecusas(0, 2, 2), {
    planejamento: 2,
    transportadora: 0,
  });
});

test("sem resposta nao vira recusa nem culpa", () => {
  const pool = [linha("ORION", "7", "Toco", 3)];
  const pedidos = [
    pedido("ORION", "C07", "Toco", "aceite"),
    pedido("ORION", "C07", "Toco", null),
    pedido("ORION", "C07", "Toco", null),
  ];
  const [b] = confrontarPool(pedidos, pool, { sabado: false, ...OPC });
  assert.equal(b.semResposta, 2);
  assert.equal(b.recusas, 0);
  assert.equal(b.culpaPlanejamento, 0);
  assert.equal(b.culpaTransportadora, 0);
});

test("sabado usa a coluna do sabado, nao a de seg-sex", () => {
  const pool = [linha("ZETA", "9", "Medio", 10, 1)];
  const pedidos = [
    pedido("ZETA", "C09", "Medio", "recusa"),
    pedido("ZETA", "C09", "Medio", "recusa"),
  ];
  const semana = confrontarPool(pedidos, pool, { sabado: false, ...OPC });
  assert.equal(semana[0].pool, 10);
  assert.equal(semana[0].culpaTransportadora, 2, "no meio da semana tem 10");

  const sabado = confrontarPool(pedidos, pool, { sabado: true, ...OPC });
  assert.equal(sabado[0].pool, 1);
  assert.equal(sabado[0].culpaPlanejamento, 1, "no sabado so tem 1 carro");
  assert.equal(sabado[0].culpaTransportadora, 1);
});

test("cluster do pool e do scheduling se encontram", () => {
  assert.equal(clusterCanonico("1"), "C01");
  assert.equal(clusterCanonico("C01"), "C01");
  assert.equal(clusterCanonico("c1"), "C01");
  assert.equal(clusterCanonico("31"), "C31");
  assert.equal(clusterCanonico("C31"), "C31");
  assert.equal(clusterCanonico(""), "");
  assert.equal(clusterCanonico(null), "");
});

test("carro no pool que ninguem chamou aparece na lista", () => {
  const pool = [linha("PRIMA LOG", "12", "Vuc", 4)];
  const r = confrontarPool([], pool, { sabado: false, ...OPC });
  assert.equal(r.length, 1);
  assert.equal(r[0].pool, 4);
  assert.equal(r[0].pedidos, 0);
});

test("aceitar mais do que o pool acusa pool velho", () => {
  const pool = [linha("JM Transportes", "2", "HR", 1)];
  const pedidos = [
    pedido("JM Transportes", "C02", "HR", "aceite"),
    pedido("JM Transportes", "C02", "HR", "aceite"),
    pedido("JM Transportes", "C02", "HR", "aceite"),
  ];
  const [b] = confrontarPool(pedidos, pool, { sabado: false, ...OPC });
  assert.equal(b.aceitesAcimaDoPool, 2, "aceitou 3 declarando 1");
  assert.equal(b.culpaTransportadora, 0, "aceitar nao e culpa de ninguem");
});

test("pedido de Melione fica fora: o pool dele nao esta nesta planilha", () => {
  assert.equal(
    motivoDeFora({ transportadora: "Alfa Logistics", perfil: "Melione VUC" }),
    "Melione — o pool dessas rotas fica em outra base"
  );
  assert.equal(
    motivoDeFora({ transportadora: "Alfa Logistics", perfil: "Melione Yellow Pool" }),
    "Melione — o pool dessas rotas fica em outra base"
  );

  assert.equal(
    motivoDeFora({ transportadora: "Alfa Logistics", perfil: "Vuc" }),
    null
  );
});

test("as quatro sem pool em CPS ficam fora, com ou sem caixa alta", () => {
  for (const tp of ["KAPPA TRANSPORTES", "PRIMA LOG", "ESCUDO CARGO", "SIGMATRANSP"]) {
    assert.equal(
      motivoDeFora({ transportadora: tp, perfil: "Vuc" }),
      "sem pool declarado em CPS",
      tp
    );
  }
  assert.equal(
    motivoDeFora({ transportadora: "prima log", perfil: "Vuc" }),
    "sem pool declarado em CPS"
  );
  assert.equal(motivoDeFora({ transportadora: "ZETA", perfil: "Vuc" }), null);
});

test("ROTOCOOP do pool encontra a RotaCoop do scheduling", () => {
  const pool = [linha("ROTOCOOP", "5", "Vuc", 1)];
  const pedidos = [
    pedido("RotaCoop", "C05", "Vuc", "recusa"),
    pedido("RotaCoop", "C05", "Vuc", "recusa"),
  ];
  const r = confrontarPool(pedidos, pool, { sabado: false, ...OPC });
  assert.equal(r.length, 1, "os dois nomes viram um pool so");
  assert.equal(r[0].pool, 1, "o pool dela foi encontrado");
  assert.equal(r[0].culpaPlanejamento, 1, "a segunda passou do teto");
  assert.equal(r[0].culpaTransportadora, 1);
  assert.equal(r[0].transportadora, "RotaCoop", "mostra o nome do pedido");
});

test("semanaDe usa a mesma regua da planilha do pool", () => {
  assert.deepEqual(semanaDe("15/09/2026"), { ano: 2026, semana: 38 });
  assert.deepEqual(semanaDe("18/09/2026"), { ano: 2026, semana: 38 });
  assert.deepEqual(semanaDe("21/09/2026"), { ano: 2026, semana: 39 });

  assert.deepEqual(semanaDe("31/12/2024"), { ano: 2025, semana: 1 });
  assert.equal(semanaDe("2026-09-15"), null);
  assert.equal(semanaDe(""), null);
});

test("cancelado sai da conta: e acao do planejamento, nao resposta da tp", () => {
  const pool = [linha("ALFA", "C01", "VUC", 2)];
  const pedidos = [
    pedido("ALFA", "C01", "VUC", "aceite"),
    pedido("ALFA", "C01", "VUC", "cancelado"),
  ];
  const r = confrontarPool(pedidos, pool, { sabado: false, ...OPC });
  const l = r.find((x) => x.cluster === "C01");
  assert.equal(l.pedidos, 1, "o cancelado nao conta como pedido");
  assert.equal(l.aceites, 1);
  assert.equal(l.semResposta, 0, "cancelado nao e sem resposta");
  assert.equal(l.sobra, 1, "o carro do cancelado volta a ser sobra");
});

test("cluster zero nao existe: sai como nao reconhecido", () => {
  assert.equal(clusterCanonico("0"), "");
  assert.equal(clusterCanonico("00"), "");
  assert.equal(clusterCanonico("1"), "C01");
  assert.equal(clusterCanonico("001"), "C01");
  assert.equal(clusterCanonico("31"), "C31");
});

test("um nome so por transportadora em todas as fontes da tela", async () => {
  const { nomesUnificados, transportadoraCanonica } = await import("../app/lib/pool.ts");

  assert.equal(transportadoraCanonica("Rota Coop"), transportadoraCanonica("ROTACOOP"));
  assert.equal(transportadoraCanonica("BRAVO LOGÍSTICA"), transportadoraCanonica("BRAVO Logistica"));
  assert.equal(transportadoraCanonica("ROTOCOOP"), transportadoraCanonica("RotaCoop"));

  const exibir = nomesUnificados(["ROTOCOOP", "ORION"], ["ROTACOOP", "Alfa Logistics"], ["RotaCoop"]);
  assert.equal(exibir("ROTACOOP"), "RotaCoop");
  assert.equal(exibir("ROTOCOOP"), "RotaCoop");
  assert.equal(exibir("ALFA LOGISTICS"), "Alfa Logistics");
  assert.equal(exibir("ORION"), "ORION");
  assert.equal(exibir("Outra"), "Outra");
});
