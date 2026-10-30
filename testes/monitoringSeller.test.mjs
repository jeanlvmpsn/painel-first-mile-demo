import assert from "node:assert/strict";
import { test } from "node:test";

import { montarHB, montarListaHB } from "../app/lib/hb.ts";
import {
  estimadoDoId,
  idsDaLinha,
  indexarMonitoring,
  lerMonitoring,
  totalEstimado,
} from "../app/lib/monitoringSeller.ts";
import { consultarParada, idsDaBusca } from "../app/lib/consultaParada.ts";

const ABA = [
  [
    "ATUALIZADO_EM", "CUSTOMER_ID", "RELATED_ENTITY_ID", "TIPO", "NOME",
    "ESTIMADO_EDPU", "PREPARADO_EDPU", "COLETADO_EDPU",
    "ESTIMADO_BACKLOG", "PREPARADO_BACKLOG", "COLETADO_BACKLOG",
    "ESTIMADO_EARLY", "PREPARADO_EARLY", "COLETADO_EARLY",
  ],
  ["29/09/2026 08:15:00", "12354", "849817033_25374", "place", "BARCA UTILIDADES", "2059", "201", "81", "122", "38", "0", "0", "1", "0"],
  ["29/09/2026 08:15:00", "277825515", "BRP7807029492", "node", "CINZACOM LTDA", "1695", "828", "867", "1", "1", "0", "1", "11", "1"],
  ["29/09/2026 08:15:00", "999", "1131387475_111", "place", "SONOFLEX COLCHOES", "300", "10", "0", "20", "0", "0", "0", "0", "0"],
  ["29/09/2026 08:15:00", "998", "1131387475_222", "place", "SONOFLEX COLCHOES", "50", "0", "0", "0", "0", "0", "0", "0", "0"],
];

test("le a aba pelo cabecalho e soma EDPU + backlog + early como a tela", () => {
  const ls = lerMonitoring(ABA);
  assert.equal(ls.length, 4);

  assert.equal(totalEstimado(ls[0]), 2181);
  assert.equal(ls[0].atualizadoEm, "29/09/2026 08:15:00");
});

test("place responde pelo id e pelo seller da frente; node pelo customer_id", () => {
  const [barca, greycom] = lerMonitoring(ABA);
  assert.deepEqual(idsDaLinha(barca), ["849817033_25374", "849817033"]);

  assert.equal(idsDaLinha(barca).includes("12354"), false);
  assert.deepEqual(idsDaLinha(greycom), ["BRP7807029492", "277825515"]);
});

test("estimado do seller soma os places dele; id ausente e null, nao 0", () => {
  const indice = indexarMonitoring(lerMonitoring(ABA));
  assert.equal(estimadoDoId(indice, "1131387475"), 370);
  assert.equal(estimadoDoId(indice, "1131387475_222"), 50);
  assert.equal(estimadoDoId(indice, "123"), null);
});

test("aba vazia ou sem cabecalho nao quebra", () => {
  assert.deepEqual(lerMonitoring([]), []);
  assert.deepEqual(lerMonitoring([["X"], ["1"]]), []);
});

test("H&B: rota que ainda nao comecou pega o estimado do monitoramento", () => {
  const sellers = montarListaHB([["ID", "NOME", "PRODUTO"], ["1131387475", "SONOFLEX", "SONOFLEX COLCHOES"], ["20", "RJ", "RJ"]]);
  const indice = indexarMonitoring(lerMonitoring(ABA));
  const linhas = montarHB({
    paradas: [
      { rota: "CAMPINAS_C15_370", parada: "1131387475", planejada: true },

      { rota: "CAMPINAS_C15_370", parada: "20", planejada: true },

      { rota: "CPS_C01_001", parada: "1131387475", estimados: 40 },
    ],
    sellers,
    etaPorRota: {},
    placaPorRota: {},
    estimadoMonitoramento: (id) => estimadoDoId(indice, id),
  });
  assert.deepEqual(
    linhas.map((l) => [l.rota, l.seller, l.estimados, l.naColeta, l.doMonitoramento]),
    [
      ["CAMPINAS_C15_370", "RJ", 0, false, false],
      ["CAMPINAS_C15_370", "SONOFLEX COLCHOES", 370, false, true],

      ["CPS_C01_001", "SONOFLEX COLCHOES", 0, true, false],
    ],
  );
});

test("a busca aceita varios ids e descarta lixo", () => {
  assert.deepEqual(idsDaBusca("1131387475, 849817033_25374;  abc!, 12"), ["1131387475", "849817033_25374"]);
  assert.equal(idsDaBusca(Array.from({ length: 30 }, (_, i) => String(1000 + i)).join(" ")).length, 20);
});

test("consulta junta monitoramento, rotas iniciadas e rotas so no plano", () => {
  const indice = indexarMonitoring(lerMonitoring(ABA));
  const r = consultarParada("1131387475", {
    indice,
    coleta: [
      { rota: "CPS_C01_001", parada: "1131387475", estimados: 40, preparados: 30, coletados: 12, pontualidade: "09:10hs - onTime", transportadora: "TP X" },
      { rota: "CPS_C01_001", parada: "555", estimados: 99 },
    ],
    planejadas: [
      { rota: "CAMPINAS_C15_370", parada: "1131387475", planejada: true },

      { rota: "CAMPINAS_C01_001", parada: "1131387475", planejada: true },
      { rota: "CPS_C09_009", parada: "555", planejada: true },
    ],
    etaPorRota: { CAMPINAS_C15_370: "15:00:00", CPS_C01_001: "09:00:00" },
    placaPorRota: { CAMPINAS_C15_370: "ABC1D23" },
  });
  assert.equal(r.nome, "SONOFLEX COLCHOES");
  assert.deepEqual(r.totais, { estimado: 370, preparado: 10, coletado: 0 });
  assert.deepEqual(
    r.rotas.map((x) => [x.rota, x.eta, x.naColeta, x.estimados, x.coletados, x.placa]),
    [
      ["CPS_C01_001", "09:00:00", true, 40, 12, ""],
      ["CAMPINAS_C15_370", "15:00:00", false, 0, 0, "ABC1D23"],
    ],
  );
});

test("consulta por place acha as rotas pelo seller da frente", () => {
  const indice = indexarMonitoring(lerMonitoring(ABA));
  const r = consultarParada("849817033_25374", {
    indice,
    coleta: [{ rota: "R1", parada: "849817033", estimados: 5 }],
    planejadas: [],
    etaPorRota: {},
    placaPorRota: {},
  });
  assert.equal(r.nome, "BARCA UTILIDADES");
  assert.equal(r.rotas.length, 1);
  assert.equal(r.totais.estimado, 2181);
});
