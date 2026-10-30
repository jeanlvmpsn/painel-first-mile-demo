import test from "node:test";
import assert from "node:assert/strict";
import {
  classificarPontualidade,
  metricasDeColeta,
} from "../app/lib/relatorioTipos.ts";

const parada = (o) => ({
  rota: "R1", motorista: "M1", parada: "P1",
  pontualidade: "10:00hs - on_time", estimados: 0, coletados: 0,
  planejado: "Sim", ...o,
});

test("pontualidade: le a classificacao no fim do texto", () => {
  assert.equal(classificarPontualidade("13:41hs - late"), "late");
  assert.equal(classificarPontualidade("08:02hs - early"), "early");
  assert.equal(classificarPontualidade("09:15hs - on_time"), "onTime");
  assert.equal(classificarPontualidade(""), null);
  assert.equal(classificarPontualidade("sei la"), null);
});

test("parada repetida conta DUAS vezes no total", () => {
  const m = metricasDeColeta([
    parada({ parada: "P1" }),
    parada({ parada: "P1" }),
    parada({ parada: "P2" }),
  ]);
  assert.equal(m.totalParadas, 3);
  assert.equal(m.rotasDistintas, 1);
});

test("linha sem rota nao entra na conta", () => {
  const m = metricasDeColeta([parada({}), parada({ rota: "" }), parada({ rota: "  " })]);
  assert.equal(m.totalParadas, 1);
});

test("uma coleta atrasada carimba a rota inteira (exemplo das 10 rotas)", () => {
  const paradas = [];

  for (let r = 1; r <= 9; r++) {
    for (let p = 0; p < 3; p++) {
      paradas.push(parada({ rota: "R" + r, motorista: "M" + r }));
    }
  }

  paradas.push(parada({ rota: "R10", motorista: "M10" }));
  paradas.push(parada({ rota: "R10", motorista: "M10" }));
  paradas.push(parada({ rota: "R10", motorista: "M10", pontualidade: "19:40hs - late" }));

  const m = metricasDeColeta(paradas);
  assert.equal(m.rotasDistintas, 10);
  assert.equal(m.rotasComAtraso, 1, "so a R10 esta atrasada");
  assert.equal(m.totalParadas, 30);
  assert.equal(m.late.toFixed(2), (100 / 30).toFixed(2));
});

test("percentuais somam 100 quando toda parada tem classificacao", () => {
  const m = metricasDeColeta([
    parada({ pontualidade: "1hs - on_time" }),
    parada({ pontualidade: "1hs - early" }),
    parada({ pontualidade: "1hs - late" }),
    parada({ pontualidade: "1hs - late" }),
  ]);
  assert.equal(m.onTime, 25);
  assert.equal(m.early, 25);
  assert.equal(m.late, 50);
});

test("planejado = nao marca a PARADA avulsa, nao a rota", () => {
  const m = metricasDeColeta([
    parada({ rota: "A", planejado: "Sim" }),
    parada({ rota: "B", planejado: "Não" }),
    parada({ rota: "B", planejado: "Não" }),
    parada({ rota: "C", planejado: "nao" }),
    parada({ rota: "D", planejado: "" }),
  ]);
  assert.equal(m.paradasAvulsas, 3, "B tem 2 e C tem 1; a D de coluna vazia fica de fora");
});

test("segunda saida: motorista com N rotas rende N-1", () => {
  const m = metricasDeColeta([
    parada({ rota: "R1", motorista: "M1" }),
    parada({ rota: "R2", motorista: "M1" }),
    parada({ rota: "R3", motorista: "M1" }),

    parada({ rota: "R4", motorista: "M2" }),
    parada({ rota: "R5", motorista: "M2" }),

    parada({ rota: "R6", motorista: "M3" }),
    parada({ rota: "R6", motorista: "M3" }),
    parada({ rota: "R6", motorista: "M3" }),
  ]);
  assert.equal(m.rotasSegundaSaida, 3);
});

test("motorista vazio nao vira segunda saida", () => {
  const m = metricasDeColeta([
    parada({ rota: "R1", motorista: "" }),
    parada({ rota: "R2", motorista: "" }),
  ]);
  assert.equal(m.rotasSegundaSaida, 0);
});

import {
  metricasDePacotes,
  montarFechamento,
  PU_ALVO,
} from "../app/lib/relatorioTipos.ts";

const visita = (rota, idParada, estimados, coletados, extra = {}) => ({
  rota,
  parada: idParada,
  estimados,
  coletados,
  rotaSemNome: extra.rotaSemNome ?? false,
  transportadora: extra.transportadora ?? "TP1",
  preparados: extra.preparados ?? coletados,
  motorista: extra.motorista ?? "M1",
  pontualidade: extra.pontualidade ?? "12:00hs - on_time",
  planejado: extra.planejado ?? "Sim",
});

test("estimado soma por LINHA; a dedup por parada fica separada", () => {
  const p = metricasDePacotes([
    visita("R1", "SELLER_A", 487, 400),
    visita("R2", "SELLER_A", 854, 800),
    visita("R3", "SELLER_B", 100, 90),
  ]);
  assert.equal(p.estimados, 1441);
  assert.equal(p.coletados, 1290);
  assert.equal(p.estimadosPorParada, 954, "854 (maior de A) + 100 (B)");
  assert.equal(p.paradasDistintas, 2);
});

test("PU do exemplo real do Ana fica ABAIXO do corte de 93,3%", () => {
  const p = metricasDePacotes([visita("R1", "P1", 248763, 231559)]);
  assert.equal(p.pu.toFixed(2), "93.08");
  assert.equal(PU_ALVO, 93.3);
  assert.equal(p.puNoAlvo, false, "93,08% nao alcanca o corte");
});

test("rotas TT = atribuidas - NS + avulsas", () => {
  const f = montarFechamento({
    paradas: [
      visita("R1", "P1", 10, 10),
      visita("438059364", "P2", 5, 5, { planejado: "Nao", rotaSemNome: true }),
    ],
    rotasAtribuidas: 447,
    ns: 12,
    capacidadeTotal: null,
    rotasPerfilMenor: null,
  });
  assert.equal(f.avulsas, 1, "a AVULSA_1 chegou sem nome");
  assert.equal(f.rotasTT, 447 - 12 + 1);
  assert.equal(f.aderenciaPerfil, null, "sem dado de perfil nao inventa 0%");
  assert.equal(f.sprPlan, null, "sem capacidade nao inventa 0");
  assert.equal(f.sprExec, 15 / 436);
});

test("aderencia so cai com perfil MENOR (numero da planilha do Ana)", () => {
  const f = montarFechamento({
    paradas: [visita("R1", "P1", 1, 1)],
    rotasAtribuidas: 447,
    ns: 0,
    capacidadeTotal: null,
    rotasPerfilMenor: 14,
  });
  assert.equal(f.aderenciaPerfil.toFixed(2), "96.87");
  assert.equal(f.sprPlan, null, "capacidade ainda nao tem fonte");
});

import {
  metricasDeAtribuicao,
  textoFechamento,
  A_PREENCHER,
} from "../app/lib/relatorioTipos.ts";

test("sem a coluna PERFIL_MENOR, aderencia e null e nao 100%", () => {
  const a = metricasDeAtribuicao([{}, {}, {}]);
  assert.equal(a.rotas, 3);
  assert.equal(a.perfilMenor, null, "sem dado nao existe aderencia");
});

test("perfil MAIOR nao machuca; so o menor conta", () => {
  const a = metricasDeAtribuicao([
    { perfilMenor: false },
    { perfilMenor: false },
    { perfilMenor: true },
  ]);
  assert.equal(a.perfilMenor, 1, "so uma rota rodou com veiculo menor");
  assert.equal(a.rotas, 3);
});

test("rota sem o dado nao entra na conta, mas continua no total", () => {
  const a = metricasDeAtribuicao([
    { perfilMenor: true },
    { perfilMenor: false },
    {},
  ]);
  assert.equal(a.perfilMenor, 1);
  assert.equal(a.rotas, 3, "o denominador segue sendo o total de rotas");
});

test("texto do fechamento sai no formato do template", () => {
  const f = montarFechamento({
    paradas: [
      visita("R1", "P1", 100, 93, { pontualidade: "12:00hs - late" }),
      visita("R2", "P2", 100, 93, { pontualidade: "12:00hs - on_time", motorista: "M1" }),
    ],
    rotasAtribuidas: 447,
    ns: 12,
    capacidadeTotal: null,
    rotasPerfilMenor: null,
  });
  const txt = textoFechamento(f, "25/07/2026", { schedulingsAceitos: 400 });
  const linhas = txt.split("\n");

  assert.equal(linhas[0], "*Prévia Fechamento CAMPINAS FM - 25/07*");
  assert.ok(txt.includes("*Rotas atribuição:* 447"));
  assert.ok(txt.includes("*Schedulings aceitos:* 400"));

  assert.ok(txt.includes("*Declínios totais:* 12"));
  assert.ok(txt.includes("*Rotas executadasTT:* 435"), "447 - 12 + 0 avulsas");
  assert.ok(txt.includes("*Rotas com atraso na coleta:* 01 rotas com atraso"));
  assert.ok(txt.includes("*Total de Paradas planejadas:* 02 Paradas"));

  assert.ok(txt.includes("*Capacidade:* " + A_PREENCHER));
  assert.ok(txt.includes("*Aderência ao perfil:* " + A_PREENCHER));
  assert.ok(txt.includes("*SPR plan:* " + A_PREENCHER));
  assert.ok(txt.includes("*Rotas Config:* " + A_PREENCHER));
  assert.ok(txt.includes("*Culp Meli:* " + A_PREENCHER));

  const comCulp = textoFechamento(f, "25/07/2026", {
    manuais: { culpMeli: "  3 rotas sem veiculo\nALFA - 2  " },
  });
  assert.ok(comCulp.includes("*Culp Meli:*\n3 rotas sem veiculo\nALFA - 2\n"));
});

test("PU abaixo do corte sai com a bolinha vermelha no texto", () => {
  const abaixo = montarFechamento({
    paradas: [visita("R1", "P1", 248763, 231559)],
    rotasAtribuidas: 1, ns: 0, capacidadeTotal: null, rotasPerfilMenor: null,
  });
  assert.ok(textoFechamento(abaixo, "25/07/2026").includes("93,1% \u{1F534}"));

  const acima = montarFechamento({
    paradas: [visita("R1", "P1", 1000, 950)],
    rotasAtribuidas: 1, ns: 0, capacidadeTotal: null, rotasPerfilMenor: null,
  });
  assert.ok(textoFechamento(acima, "25/07/2026").includes("95,0% \u{1F7E2}"));
});

test("rota avulsa e a que vem SEM nome no relatorio, so com id", () => {
  const m = metricasDeColeta([
    visita("CAMPINAS_C01_314", "P1", 10, 10, { planejado: "Sim" }),
    visita("CAMPINAS_C01_314", "P2", 5, 5, { planejado: "Nao" }),
    visita("438059364", "P3", 34, 34, { planejado: "Nao", rotaSemNome: true }),
    visita("438059364", "P4", 32, 32, { planejado: "Nao", rotaSemNome: true }),
    visita("437929031", "P5", 1360, 215, { planejado: "Nao", rotaSemNome: true }),
  ]);
  assert.equal(m.rotasAvulsas, 2, "dois ids sem nome, e nao a rota planejada");
  assert.equal(m.paradasAvulsas, 4, "as paradas com planejado=nao, incluindo a extra");
  assert.equal(m.rotasDistintas, 3);
});

test("monitoramento GANHA da soma da COLETAS_D0 em pacote e avulsa", () => {
  const paradas = [
    visita("R1", "P1", 300000, 200000),
    visita("438059364", "P2", 5, 5, { rotaSemNome: true }),
  ];
  const entrada = {
    paradas,
    rotasAtribuidas: 503,
    ns: 23,
    capacidadeTotal: null,
    rotasPerfilMenor: 15,
  };

  const semMon = montarFechamento(entrada);
  assert.equal(semMon.origem, "coletas");
  assert.equal(semMon.pacotes.estimados, 300005);
  assert.equal(semMon.avulsas, 1, "cai no id sem nome");

  const comMon = montarFechamento({
    ...entrada,
    monitoramento: {
      estimados: 248520,
      coletados: 225178,
      rotasAvulsas: 15,
      paradasTotal: 3166,
    },
  });
  assert.equal(comMon.origem, "monitoramento");
  assert.equal(comMon.pacotes.estimados, 248520);
  assert.equal(comMon.pacotes.coletados, 225178);
  assert.equal(comMon.pacotes.pu.toFixed(2), "90.61", "PU sai dos numeros da tela");
  assert.equal(comMon.avulsas, 15, "ambulanceRoutes, nao o id sem nome");
  assert.equal(comMon.rotasTT, 503 - 23 + 15, "avulsa da tela entra no TT");
  assert.equal(comMon.totalParadas, 3166, "total de paradas vem da tela");
  assert.equal(semMon.totalParadas, 2, "sem a aba, conta as linhas da COLETAS_D0");

  assert.equal(comMon.onTime, semMon.onTime, "pontualidade nao troca de base");
});

import {
  ofensoresSemReversao,
  textoOfensores,
  TOP_OFENSORES,
} from "../app/lib/relatorioTipos.ts";

test("NS sem reversao ignora o ponto que outra rota recoletou", () => {
  const paradas = [
    visita("R_OK", "P0", 100, 100, { transportadora: "BRAVO", preparados: 100 }),

    visita("R_NS1", "P1", 60, 0, { transportadora: "BRAVO", preparados: 50 }),
    visita("R_OK", "P1", 60, 50, { transportadora: "BRAVO", preparados: 50 }),

    visita("R_NS1", "P2", 40, 0, { transportadora: "BRAVO", preparados: 30 }),
    visita("R_NS2", "P3", 90, 0, { transportadora: "Alfa", preparados: 80 }),
  ];
  const lista = ofensoresSemReversao(paradas, ["R_NS1", "R_NS2"]);

  assert.equal(lista.length, 2);
  assert.equal(lista[0].transportadora, "Alfa");
  assert.equal(lista[0].pacotes, 80);
  assert.equal(lista[1].transportadora, "BRAVO");
  assert.equal(
    lista[1].pacotes,
    30,
    "so o P2: o P1 saiu porque a R_OK coletou os 50 depois"
  );
});

test("ponto repetido na mesma rota NS conta uma vez, pelo maior lote", () => {
  const paradas = [
    visita("R_NS", "P1", 40, 0, { transportadora: "BRAVO", preparados: 40 }),
    visita("R_NS", "P1", 40, 0, { transportadora: "BRAVO", preparados: 40 }),
  ];
  const lista = ofensoresSemReversao(paradas, ["R_NS"]);
  assert.equal(lista[0].pacotes, 40, "40, nao 80");
  assert.equal(lista[0].paradas, 1);
});

test("transportadora sem nenhum ponto orfao some da lista", () => {
  const paradas = [
    visita("R_NS", "P1", 10, 0, { transportadora: "ORION", preparados: 10 }),
    visita("R_OUTRA", "P1", 10, 10, { transportadora: "ORION", preparados: 10 }),
  ];
  assert.deepEqual(ofensoresSemReversao(paradas, ["R_NS"]), []);
});

test("sem NS no dia, a lista some e o campo volta a ser preenchido na mao", () => {
  const paradas = [visita("R1", "P1", 10, 10, { transportadora: "BRAVO" })];
  assert.deepEqual(ofensoresSemReversao(paradas, []), []);
  assert.equal(textoOfensores([]), A_PREENCHER);
});

test("o texto sai no formato do report e corta no top 3", () => {
  const lista = [
    { transportadora: "BRAVO LOGÍSTICA", pacotes: 1375, rotas: 8, paradas: 29 },
    { transportadora: "Alfa Logistics", pacotes: 1310, rotas: 4, paradas: 21 },
    { transportadora: "KAPPA TRANSPORTES", pacotes: 796, rotas: 5, paradas: 28 },
    { transportadora: "SIGMATRANSP", pacotes: 660, rotas: 2, paradas: 7 },
  ];
  assert.equal(TOP_OFENSORES, 3);
  assert.equal(
    textoOfensores(lista),
    "BRAVO LOGÍSTICA - 1.375 pcts\nAlfa Logistics - 1.310 pcts\nKAPPA TRANSPORTES - 796 pcts"
  );
});
