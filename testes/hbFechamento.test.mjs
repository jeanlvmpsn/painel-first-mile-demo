import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compararComListaCurada,
  ehParadaHB,
  lerParadasHB,
  monitoramentoHB,
  puOficialDoDia,
} from "../app/lib/hbFechamento.ts";
import { montarFechamento } from "../app/lib/relatorioTipos.ts";

const ABA = [
  ["ID_PARADA", "SELLER_ID", "SELLER", "PACOTES_HB", "OVERSIZE", "DIAS_COM_HB", "ULTIMO_DIA", "ATUALIZADO_EM"],
  ["1131387475", "1131387475", "SONOFLEX", "320", "12", "10", "2026-09-30", "30/09/2026 19:00:05"],
  ["849817033_340850", "849817033", "LOJA BETANI", "40", "0", "3", "2026-09-29", "30/09/2026 19:00:05"],
  ["381742751", "381742751", "NODE X", "5", "0", "1", "2026-09-28", "30/09/2026 19:00:05"],
];

test("lista H&B: le pelo cabecalho e casa seller, place e BRP", () => {
  const { paradas, atualizadoEm } = lerParadasHB(ABA);
  assert.equal(paradas.size, 3);
  assert.equal(atualizadoEm, "30/09/2026 19:00:05");
  assert.equal(paradas.get("1131387475").pacotesHb, 320);
  assert.equal(ehParadaHB(paradas, "1131387475"), true);
  assert.equal(ehParadaHB(paradas, "849817033_340850"), true);

  assert.equal(ehParadaHB(paradas, "BRP3817427511"), true);

  assert.equal(ehParadaHB(paradas, "849817033_999"), false);
  assert.equal(ehParadaHB(paradas, "301081049"), false);
});

test("PU oficial: o dia pedido ou o ultimo antes dele; pula dia sem operacao", () => {
  const aba = [
    ["DATA", "NUMERADOR", "DENOMINADOR"],
    ["2026-09-29", "12047", "12750"],
    ["2026-09-28", "17124", "18750"],
    ["2026-09-13", "1", "1"],
    ["2026-09-12", "4707", "5713"],
  ];

  const hoje = puOficialDoDia(aba, "2026-09-30");
  assert.equal(hoje.data, "2026-09-29");
  assert.equal(hoje.pu.toFixed(1), "94.5");
  assert.equal(puOficialDoDia(aba, "2026-09-28").data, "2026-09-28");

  assert.equal(puOficialDoDia(aba, "2026-09-13").data, "2026-09-12");
  assert.equal(puOficialDoDia(aba, "2026-09-01"), null);
});

test("fechamento so com as paradas H&B: monitoramento e coleta recortados", () => {
  const { paradas } = lerParadasHB(ABA);
  const parada = (rota, id, est, col, pont, extra = {}) => ({
    rota, transportadora: "Alfa", motorista: "M-" + rota, parada: id, pontualidade: pont,
    estimados: est, coletados: col, preparados: est, planejado: "sim", ...extra,
  });
  const coletas = [
    parada("CPS_C15_370", "1131387475", 300, 290, "10:00hs - on_time"),
    parada("CPS_C15_370", "301081049", 50, 50, "10:30hs - late"),
    parada("CPS_C24_DED_15", "849817033_340850", 40, 30, "11:00hs - late"),
  ];
  const coletasHB = coletas.filter((p) => ehParadaHB(paradas, p.parada));
  assert.equal(coletasHB.length, 2);

  const linha = (entidade, customerId, tipo, est, col) => ({
    customerId, entidade, tipo, nome: "",
    estimado: { edpu: est, backlog: 0, early: 0 },
    preparado: { edpu: est, backlog: 0, early: 0 },
    coletado: { edpu: col, backlog: 0, early: 0 },
    atualizadoEm: "",
  });
  const mon = monitoramentoHB(
    [
      linha("849817033_340850", "12354", "place", 45, 30),
      linha("1131387475", "1131387475", "seller", 310, 290),
      linha("301081049", "301081049", "seller", 60, 50),
    ],
    paradas,
    coletasHB,
  );
  assert.deepEqual(mon, { estimados: 355, coletados: 320, rotasAvulsas: 0, paradasTotal: 2 });

  const f = montarFechamento({
    paradas: coletasHB, rotasAtribuidas: 2, ns: 0, monitoramento: mon, capacidadeTotal: null, rotasPerfilMenor: null,
  });
  assert.equal(f.pacotes.estimados, 355);
  assert.equal(f.rotasComAtraso, 1);
  assert.equal(f.totalParadas, 2);
  assert.equal(Math.round(f.late), 50);
});

test("comparacao com a lista curada: fora dela e so nela", () => {
  const { paradas } = lerParadasHB(ABA);
  const curada = new Map([["1131387475", { rotulo: "SONOFLEX" }], ["555", { rotulo: "SUMIU" }]]);
  const c = compararComListaCurada([...paradas.values()], paradas, curada);
  assert.deepEqual(c.paradas.map((p) => [p.id, p.naListaCurada]), [
    ["1131387475", true],
    ["849817033_340850", false],
    ["381742751", false],
  ]);
  assert.deepEqual(c.soNaListaCurada, ["SUMIU (555)"]);
});

test("texto do fechamento aceita outro titulo", async () => {
  const { textoFechamento } = await import("../app/lib/relatorioTipos.ts");
  const f = montarFechamento({ paradas: [], rotasAtribuidas: 0, ns: 0, capacidadeTotal: null, rotasPerfilMenor: null });
  assert.match(textoFechamento(f, "30/09/2026", { titulo: "Fechamento H&B CAMPINAS FM" }), /^\*Fechamento H&B CAMPINAS FM - 30\/09\*/);
  assert.match(textoFechamento(f, "30/09/2026"), /^\*Prévia Fechamento CAMPINAS FM - 30\/09\*/);
});

test("historico H&B: grava o report pronto e le de volta pela data", async () => {
  const { CAB_HISTORICO_FECHAMENTO_HB, linhaHistoricoFechamentoHB, lerHistoricoFechamentoHB } = await import(
    "../app/lib/hbFechamento.ts"
  );
  const fechamento = montarFechamento({ paradas: [], rotasAtribuidas: 40, ns: 2, capacidadeTotal: null, rotasPerfilMenor: null });
  const salvo = {
    fechamento,
    rotasConfig: 41,
    paradasHB: 120,
    rotasHB: 40,
    temColeta: true,
    temMonitoramento: true,
    atualizadoEm: "02/10/2026 06:00:01",
  };
  const linha = linhaHistoricoFechamentoHB(salvo, "02/10/2026", "02/10/2026 21:10:03");
  assert.equal(linha.length, CAB_HISTORICO_FECHAMENTO_HB.length);

  const aba = [CAB_HISTORICO_FECHAMENTO_HB, ["1/10/2026", "0", "0", "0", "", "", "", "", "", "", "{}", "x"], linha.map(String)];
  const lido = lerHistoricoFechamentoHB(aba, "02/10/2026");
  assert.deepEqual(lido.salvo, salvo);
  assert.equal(lido.gravadoEm, "02/10/2026 21:10:03");

  assert.equal(lerHistoricoFechamentoHB(aba, "03/10/2026"), null);
  assert.equal(lerHistoricoFechamentoHB(aba, "01/10/2026"), null);
});

test("pacotes do Fechamento H&B: so os H&B, do KPI oficial do dia; sem o dia, ___", async () => {
  const { comPacotesHB } = await import("../app/lib/hbFechamento.ts");
  const { textoFechamento } = await import("../app/lib/relatorioTipos.ts");
  const base = montarFechamento({
    paradas: [],
    rotasAtribuidas: 10,
    ns: 0,
    monitoramento: { estimados: 224867, coletados: 208819, rotasAvulsas: 0, paradasTotal: 0 },
    capacidadeTotal: null,
    rotasPerfilMenor: null,
    alvoPu: 92.5,
  });
  const oficial = { data: "2026-10-07", numerador: 9300, denominador: 10000, pu: 93 };

  const dia = comPacotesHB(base, oficial, "2026-10-07");
  assert.equal(dia.pacotes.estimados, 10000);
  assert.equal(dia.pacotes.coletados, 9300);
  assert.equal(dia.pacotes.pu, 93);
  assert.equal(dia.pacotes.puNoAlvo, true);
  assert.equal(dia.sprExec, 930);
  assert.match(textoFechamento(dia, "07/10/2026"), /\*Estimados fim:\* 10\.000 \| \*Coletados:\* 9\.300/);

  const hoje = comPacotesHB(base, oficial, "2026-10-08");
  assert.equal(hoje.pacotesPendentes, true);
  assert.equal(hoje.sprExec, null);
  const t = textoFechamento(hoje, "08/10/2026");
  assert.match(t, /\*Estimados fim:\* ___ \| \*Coletados:\* ___/);
  assert.match(t, /\*Prévia PU:\* ___\n/);
  assert.equal(comPacotesHB(base, null, "2026-10-08").pacotesPendentes, true);
});
