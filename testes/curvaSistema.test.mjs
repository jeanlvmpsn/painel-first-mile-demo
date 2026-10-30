import assert from "node:assert/strict";
import { test } from "node:test";

import { comPlanejadoDaConfig, lerCurvaSistema, minutosDaCopia } from "../app/lib/curvaSistema.ts";

const CAB = [
  "DATA", "TIPO", "FAIXA", "PLANEJADO", "EXECUTADO", "EM_TRANSITO",
  "A_CAMINHO", "CHEGARAM", "DESCARREGANDO", "FINALIZADAS", "ATUALIZADO_EM",
];

const VEICULOS = {
  summary: { onWay: 9, arrived: 379, inbound: 6, closed: 0 },
  frames: [
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 3, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 1, 0],
    [0, 0, 0], [0, 0, 0], [0, 5, 0], [1, 2, 0], [4, 8, 0], [39, 43, 0], [67, 49, 0], [67, 65, 0],
    [67, 64, 0], [67, 70, 0], [67, 66, 1], [63, 48, 4], [30, 24, 5], [3, 6, 1], [0, 0, 0], [0, 0, 0],
  ].map(([planned, inbound, inTransit], h) => {
    const hh = String(h).padStart(2, "0");
    return { frame: hh + ":00 - " + hh + ":59", planned, inbound, inTransit };
  }),
};

function linhas(json, tipo, data, agora) {
  const s = json.summary;
  return json.frames.map((f) => [
    data, tipo, f.frame, String(f.planned), String(f.inbound), String(f.inTransit),
    String(s.onWay), String(s.arrived), String(s.inbound), String(s.closed), agora,
  ]);
}

test("curva do sistema: resumo, faixas e corte das horas vazias", () => {
  const aba = [CAB, ...linhas(VEICULOS, "veiculos", "01/10/2026", "01/10/2026 21:40:00")];
  const { curvas, atualizadoEm } = lerCurvaSistema(aba, "01/10/2026");
  assert.equal(atualizadoEm, "01/10/2026 21:40:00");
  assert.equal(curvas.pacotes, undefined);
  const v = curvas.veiculos;
  assert.deepEqual(v.resumo, { aCaminho: 9, chegaram: 379, descarregando: 6, finalizadas: 0 });

  assert.equal(v.faixas[0].hora, 7);
  assert.equal(v.madrugada, 3);
  assert.equal(v.faixas.at(-1).hora, 22);
  const f19 = v.faixas.find((f) => f.hora === 19);
  assert.deepEqual(f19, { hora: 19, rotulo: "19:00 - 19:59", planejado: 63, executado: 48, transito: 4 });
});

test("curva do sistema: so o dia pedido, ultima copia e aba ausente", () => {
  const aba = [
    CAB,
    ...linhas(VEICULOS, "veiculos", "30/09/2026", "30/09/2026 23:50:00"),
    ...linhas({ ...VEICULOS, summary: { ...VEICULOS.summary, arrived: 1 } }, "pacotes", "01/10/2026", "01/10/2026 21:40:00"),
  ];
  const ontem = lerCurvaSistema(aba, "30/09/2026");
  assert.ok(ontem.curvas.veiculos);
  assert.equal(ontem.curvas.pacotes, undefined);
  assert.equal(ontem.atualizadoEm, "30/09/2026 23:50:00");
  assert.equal(lerCurvaSistema(aba, "01/10/2026").curvas.pacotes.resumo.chegaram, 1);
  assert.deepEqual(lerCurvaSistema([], "01/10/2026").curvas, {});
  assert.deepEqual(lerCurvaSistema([["X"], ["1"]], "01/10/2026").curvas, {});
});

test("minutosDaCopia", () => {
  assert.equal(minutosDaCopia("01/10/2026 21:40:12"), 21 * 60 + 40);
  assert.equal(minutosDaCopia(""), null);
});

test("curva do sistema com o planejado da config (ETA), executado e transito do sistema", () => {
  const f = (hora, planejado, executado, transito) => {
    const hh = String(hora % 24).padStart(2, "0");
    return { hora, rotulo: hh + ":00 - " + hh + ":59", planejado, executado, transito };
  };
  const sistema = [f(13, 39, 31, 30), f(14, 67, 0, 59), f(15, 67, 0, 27)];
  const plano = [f(13, 10, 9, 0), f(14, 0, 0, 0), f(16, 25, 0, 0), f(24, 2, 0, 0)];
  const m = comPlanejadoDaConfig(sistema, plano);
  assert.deepEqual(m.map((x) => x.hora), [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  assert.deepEqual(m[0], f(13, 10, 31, 30));
  assert.deepEqual(m[1], f(14, 0, 0, 59));
  assert.deepEqual(m[2], f(15, 0, 0, 27));
  assert.deepEqual(m[3], f(16, 25, 0, 0));
  assert.equal(m.at(-1).rotulo, "00:00 - 00:59");
  assert.equal(m.at(-1).planejado, 2);
});

test("rota NS que o sistema conta como chegada sai do executado (so em veiculos)", async () => {
  const { semNsNoExecutado } = await import("../app/lib/curvaSistema.ts");
  const faixas = [
    { hora: 8, rotulo: "08:00 - 08:59", planejado: 0, executado: 1, transito: 0 },
    { hora: 13, rotulo: "13:00 - 13:59", planejado: 48, executado: 51, transito: 1 },
  ];
  const rotas = [
    { rota: "CAMPINAS_C08_102", foraDaCurva: true, chegadaSistemaMin: 8 * 60 + 2 },
    { rota: "CAMPINAS_C01_001", foraDaCurva: false, chegadaSistemaMin: null },
  ];
  const v = semNsNoExecutado(faixas, rotas, "veiculos");
  assert.equal(v[0].executado, 0);
  assert.equal(v[1].executado, 51);
  assert.equal(semNsNoExecutado(faixas, rotas, "pacotes"), faixas);
});
