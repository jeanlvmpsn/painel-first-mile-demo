import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agrupadorDe,
  agruparAdesao,
  transportadorasDaSerie,
  periodosDisponiveis,
} from "../app/lib/adesao.ts";

const ponto = (data, transportadora, total, concluidas, ns = 0) => ({
  data,
  transportadora,
  total,
  concluidas,
  ns,
});

test("a semana comeca na segunda, e o sabado pertence a ela", () => {
  assert.equal(agrupadorDe("07/09/2026", "semana").chave, "2026-09-07");
  assert.equal(agrupadorDe("12/09/2026", "semana").chave, "2026-09-07");

  assert.equal(agrupadorDe("13/09/2026", "semana").chave, "2026-09-07");
  assert.equal(agrupadorDe("14/09/2026", "semana").chave, "2026-09-14");
});

test("dia e mes agrupam pelo que se espera", () => {
  assert.deepEqual(agrupadorDe("09/09/2026", "dia"), {
    chave: "2026-09-09",
    rotulo: "09/09",
  });
  assert.deepEqual(agrupadorDe("09/09/2026", "mes"), {
    chave: "2026-09",
    rotulo: "set/26",
  });
  assert.equal(agrupadorDe("data ruim", "dia"), null);
});

test("o eixo sai em ordem cronologica, nao alfabetica", () => {
  const r = agruparAdesao(
    [
      ponto("02/09/2026", "ALFA", 10, 8),
      ponto("11/09/2026", "ALFA", 10, 9),
      ponto("31/08/2026", "ALFA", 10, 5),
    ],
    { periodo: "dia", escala: "bruto", transportadoras: [] }
  );
  assert.deepEqual(r.eixo.map((e) => e.rotulo), ["31/08", "02/09", "11/09"]);
});

test("rota NS sai da base do percentual, nunca do numerador", () => {
  const r = agruparAdesao([ponto("11/09/2026", "ALFA", 10, 6, 2)], {
    periodo: "dia",
    escala: "percentual",
    transportadoras: ["ALFA"],
  });
  assert.equal(r.series[0].valores[0], 75);
});

test("bruto conta rota respondida, nao percentual", () => {
  const r = agruparAdesao([ponto("11/09/2026", "ALFA", 10, 6, 2)], {
    periodo: "dia",
    escala: "bruto",
    transportadoras: ["ALFA"],
  });
  assert.equal(r.series[0].valores[0], 6);
});

test("transportadora que nao rodou no periodo vira null, nao zero", () => {
  const r = agruparAdesao(
    [
      ponto("10/09/2026", "ALFA", 10, 9),
      ponto("11/09/2026", "ALFA", 10, 8),
      ponto("11/09/2026", "ORION", 4, 2),
    ],
    { periodo: "dia", escala: "percentual", transportadoras: ["ORION"] }
  );
  assert.equal(r.series[0].valores[0], null, "10/09 a ORION nao rodou");
  assert.equal(r.series[0].valores[1], 50);
});

test("rotasNoPeriodo conta a operacao inteira, nao so quem esta na serie", () => {
  const r = agruparAdesao(
    [
      ponto("11/09/2026", "ALFA", 10, 5),
      ponto("11/09/2026", "ORION", 10, 9),
    ],
    { periodo: "dia", escala: "percentual", transportadoras: ["ALFA"] }
  );
  assert.equal(r.series[0].valores[0], 50, "so a ALFA na serie");
  assert.deepEqual(r.rotasNoPeriodo, [20], "o contexto soma as duas");
});

test("periodo sem base nenhuma nao vira 0%", () => {
  const r = agruparAdesao([ponto("11/09/2026", "ALFA", 3, 0, 3)], {
    periodo: "dia",
    escala: "percentual",
    transportadoras: ["ALFA"],
  });
  assert.equal(r.series[0].valores[0], null);
});

test("a semana soma os dias antes de dividir", () => {
  const r = agruparAdesao(
    [
      ponto("07/09/2026", "ALFA", 10, 8),
      ponto("08/09/2026", "ALFA", 10, 2),
    ],
    { periodo: "semana", escala: "percentual", transportadoras: ["ALFA"] }
  );
  assert.equal(r.eixo.length, 1);
  assert.equal(r.series[0].valores[0], 50);
});

test("o seletor lista da maior operacao pra menor", () => {
  const lista = transportadorasDaSerie([
    ponto("11/09/2026", "PEQUENA", 4, 4),
    ponto("11/09/2026", "GRANDE", 300, 200),
    ponto("10/09/2026", "GRANDE", 300, 200),
    ponto("11/09/2026", "MEDIA", 50, 40),
  ]);
  assert.deepEqual(lista, ["GRANDE", "MEDIA", "PEQUENA"]);
});

test("o rotulo da semana e o numero ISO, nao a contagem de domingos", () => {
  assert.equal(agrupadorDe("07/09/2026", "semana").rotulo, "W37");
  assert.equal(agrupadorDe("12/09/2026", "semana").rotulo, "W37");
  assert.equal(agrupadorDe("14/09/2026", "semana").rotulo, "W38");

  assert.equal(agrupadorDe("31/12/2024", "semana").rotulo, "W1");
});

test("o recorte de periodos tira do eixo o que nao foi escolhido", () => {
  const pontos = [
    ponto("10/09/2026", "ALFA", 10, 4),
    ponto("11/09/2026", "ALFA", 10, 8),
    ponto("12/09/2026", "ALFA", 10, 1),
  ];
  const r = agruparAdesao(pontos, {
    periodo: "dia",
    escala: "bruto",
    transportadoras: ["ALFA"],
    periodos: ["2026-09-10", "2026-09-12"],
  });
  assert.deepEqual(r.eixo.map((e) => e.rotulo), ["10/09", "12/09"]);
  assert.deepEqual(r.series[0].valores, [4, 1]);
  assert.deepEqual(r.rotasNoPeriodo, [10, 10]);
});

test("recorte vazio quer dizer tudo, nao nada", () => {
  const pontos = [ponto("10/09/2026", "ALFA", 10, 4)];
  const r = agruparAdesao(pontos, {
    periodo: "dia",
    escala: "bruto",
    transportadoras: ["ALFA"],
    periodos: [],
  });
  assert.equal(r.eixo.length, 1);
});

test("os chips saem em ordem cronologica e sem repetir", () => {
  const pontos = [
    ponto("12/09/2026", "ALFA", 10, 1),
    ponto("10/09/2026", "ALFA", 10, 4),
    ponto("10/09/2026", "ORION", 5, 2),
  ];
  assert.deepEqual(periodosDisponiveis(pontos, "dia"), [
    { chave: "2026-09-10", rotulo: "10/09" },
    { chave: "2026-09-12", rotulo: "12/09" },
  ]);
  assert.deepEqual(periodosDisponiveis(pontos, "semana"), [
    { chave: "2026-09-07", rotulo: "W37" },
  ]);
});
test("a base do percentual e a rota da transportadora, nao o total do dia", () => {
  const r = agruparAdesao(
    [
      ponto("11/09/2026", "ALFA", 20, 10),
      ponto("11/09/2026", "OUTRA", 80, 0),
    ],
    { periodo: "dia", escala: "percentual", transportadoras: ["ALFA"] }
  );
  assert.equal(r.series[0].valores[0], 50);
  assert.deepEqual(r.series[0].base, [20], "a base e so a dela");
  assert.deepEqual(r.series[0].concluidas, [10]);
  assert.deepEqual(r.rotasNoPeriodo, [100], "o total do dia e so contexto");
});

test("a linha do total tira o NS, igual o percentual faz", () => {
  const r = agruparAdesao([ponto("11/09/2026", "ALFA", 20, 9, 2)], {
    periodo: "dia",
    escala: "bruto",
    transportadoras: ["ALFA"],
  });
  assert.deepEqual(r.series[0].base, [18], "20 rotas menos 2 NS");
  assert.deepEqual(r.series[0].valores, [9]);
});

test("periodo sem rota da transportadora deixa buraco nas tres linhas", () => {
  const r = agruparAdesao(
    [ponto("10/09/2026", "OUTRA", 5, 5), ponto("11/09/2026", "ALFA", 10, 4)],
    { periodo: "dia", escala: "bruto", transportadoras: ["ALFA"] }
  );
  assert.deepEqual(r.series[0].valores, [null, 4]);
  assert.deepEqual(r.series[0].base, [null, 10]);
  assert.deepEqual(r.series[0].concluidas, [null, 4]);
});

test("por dia o grafico fica nos ultimos 15 dias, mas o recorte na mao manda", () => {
  const pontos = [];
  for (let d = 1; d <= 20; d++) {
    pontos.push(ponto(String(d).padStart(2, "0") + "/09/2026", "ALFA", 10, 8));
  }
  const opc = { escala: "percentual", transportadoras: ["ALFA"] };

  const dia = agruparAdesao(pontos, { ...opc, periodo: "dia" });
  assert.equal(dia.eixo.length, 15);
  assert.equal(dia.eixo[0].chave, "2026-09-06");
  assert.equal(dia.eixo[14].chave, "2026-09-20");

  const mes = agruparAdesao(pontos, { ...opc, periodo: "mes" });
  assert.equal(mes.eixo.length, 1);

  const escolhido = agruparAdesao(pontos, {
    ...opc,
    periodo: "dia",
    periodos: ["2026-09-01", "2026-09-02"],
  });
  assert.equal(escolhido.eixo.length, 2);
});

test("os chips de dia acompanham o corte de 15 dias", () => {
  const pontos = [];
  for (let d = 1; d <= 20; d++) {
    pontos.push(ponto(String(d).padStart(2, "0") + "/09/2026", "ALFA", 10, 8));
  }
  const chips = periodosDisponiveis(pontos, "dia");
  assert.equal(chips.length, 15);
  assert.equal(chips[0].rotulo, "06/09");
  assert.equal(chips[14].rotulo, "20/09");
  assert.equal(periodosDisponiveis(pontos, "mes").length, 1);
});
