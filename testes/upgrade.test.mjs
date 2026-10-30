import assert from "node:assert/strict";
import { test } from "node:test";

import {
  avaliar,
  medias,
  nomeDoPdf,
  normalizarLinhas,
  sellersDoPlace,
  somarDias,
} from "../app/lib/upgrade.ts";

const l = (data, estimados, extra = {}) => ({
  data,
  sellerId: "244397015",
  sellerNome: "MULTILOJA",
  placeId: "P1",
  placeNome: "Place 1",
  estimados,
  coletados: estimados,
  ...extra,
});

test("linhas do BigQuery viram LinhaDrop", () => {
  const r = normalizarLinhas([
    {
      route_date: "2026-08-13",
      shp_sender_id: "244397015",
      shp_sender_nickname: "MULTILOJA",
      SHP_RELATED_ENTITY_ID: "123",
      SHP_LG_CUST_DISPLAY_NAME: "Loja X",
      total_estimados: "36",
      total_coletados: "35",
    },
    { route_date: "", total_estimados: "1" },
  ]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], {
    data: "2026-08-13",
    sellerId: "244397015",
    sellerNome: "MULTILOJA",
    placeId: "123",
    placeNome: "Loja X",
    estimados: 36,
    coletados: 35,
    estado: "",
    cluster: "",
  });
});

test("media divide pelos dias com drop, nao pelos corridos", () => {
  const m = medias([l("2026-08-10", 60), l("2026-08-12", 30), l("2026-08-12", 10)]);
  assert.equal(m.dias, 2);
  assert.equal(m.somaEstimados, 100);
  assert.equal(m.estimados, 50);
});

test("ultima semana abaixo do corte derruba o seller", () => {
  const fim = "2026-08-31";
  const antigos = Array.from({ length: 20 }, (_, i) => l(somarDias("2026-08-01", i), 40));
  const semana = Array.from({ length: 5 }, (_, i) => l(somarDias("2026-08-25", i), 4));
  const r = avaliar([...antigos, ...semana], fim);
  assert.ok(r.geral.estimados >= 20);
  assert.equal(r.recente.estimados, 4);
  assert.equal(r.status, "em-baixa");

  assert.equal(avaliar([...antigos, ...semana.map((x) => ({ ...x, estimados: 30 }))], fim).status, "passivel");
  assert.equal(avaliar([l("2026-08-30", 10)], fim).status, "abaixo");

  assert.equal(avaliar(antigos, fim).status, "em-baixa");
});

test("place lista cada seller, passiveis primeiro", () => {
  const fim = "2026-08-31";
  const r = sellersDoPlace(
    [
      l("2026-08-30", 5, { sellerId: "1", sellerNome: "Pequeno" }),
      l("2026-08-30", 50, { sellerId: "2", sellerNome: "Grande" }),
      l("2026-08-29", 25, { sellerId: "3", sellerNome: "Medio" }),
    ],
    fim,
  );
  assert.deepEqual(r.map((s) => s.sellerId), ["2", "3", "1"]);
  assert.equal(r[0].status, "passivel");
  assert.equal(r[2].status, "abaixo");
});

test("nome do PDF segue o padrao da pasta", () => {
  assert.equal(nomeDoPdf("244397015", 43.6), "SELLER_244397015_44PCTS_DIA");
  assert.equal(nomeDoPdf("1891896354", 9.6, "plantas"), "SELLER_1891896354_10PCTS_DIA(PLANTAS)");
  assert.equal(nomeDoPdf("1891896354", 9.6, " Cerâmica / vidro! "), "SELLER_1891896354_10PCTS_DIA(CERAMICA VIDRO)");
  assert.equal(nomeDoPdf("1891896354", 9.6, "  "), "SELLER_1891896354_10PCTS_DIA");
  assert.equal(somarDias("2026-03-01", -1), "2026-02-28");
});

test("candidatos somam os places do seller e apontam o principal", async () => {
  const { candidatos } = await import("../app/lib/upgrade.ts");
  const fim = "2026-08-31";
  const r = candidatos(
    [
      l("2026-08-30", 15, { placeId: "A", placeNome: "Place A" }),
      l("2026-08-30", 10, { placeId: "B", placeNome: "Place B" }),
      l("2026-08-29", 30, { placeId: "B", placeNome: "Place B" }),
      l("2026-08-30", 3, { sellerId: "9", sellerNome: "Outro" }),
    ],
    fim,
  );
  assert.equal(r[0].sellerId, "244397015");
  assert.equal(r[0].geral.estimados, 27.5);
  assert.equal(r[0].placeId, "B");
  assert.equal(r[0].places, 2);
  assert.equal(r[1].status, "abaixo");
});

test("solicitacao preenche A-K pelo cabecalho e deixa o resto para o analista", async () => {
  const { colunasSolicitacao, linhaSolicitacao, lerSolicitacoes, linhaDaFaixa } = await import(
    "../app/lib/upgrade.ts"
  );
  const cab = [
    "ID SELLER SENDER", "NOME SELLER SENDER", "K74", "NOME PLACE", "ESTADO DO SELLER",
    "UP ou DOWN ?", "MOTIVO", "SE FOR VOLUMOSO, TEM EVIDENCIAS?", "SOLICITANTE",
    "LINK DA EVIDENCIA", "STATUS", "STATUS FINAL", "RESULTADO",
  ];
  const c = colunasSolicitacao(cab);
  assert.equal(c.status, 10);
  assert.equal(c.statusFinal, 11);
  const linha = linhaSolicitacao(c, cab.length, {
    sellerId: "98616976",
    sellerNome: "INDUSTRIAX",
    placeId: "849817033_1180202",
    placeNome: "PLACE CENTRO",
    estado: "SP",
    solicitante: "Ana Costa",
  });
  assert.deepEqual(linha, [
    "98616976", "INDUSTRIAX", "849817033_1180202", "PLACE CENTRO", "SP", "UP",
    "alta volumetria (>20pcts/dia)", "", "Ana Costa", "", "Pendente", "", "",
  ]);

  const { solicitacoes, solicitantes } = lerSolicitacoes([
    cab,
    ["98616976", "X", "P1", "Place", "SP", "UP", "", "", "Ana Costa", "https://d/1", "Solicitado", "Processado"],
    ["150622037", "Y", "P2", "Place 2", "SP", "UP", "", "", "Ana", "", "Solicitado", ""],
    ["", "", "", "", "", "", "", "", "Ana Costa"],
  ]);
  assert.equal(solicitacoes.length, 2);
  assert.equal(solicitacoes[0].statusFinal, "Processado");
  assert.deepEqual(solicitantes, ["Ana Costa", "Ana"]);
  assert.equal(linhaDaFaixa("'Solicitações'!A120:K120"), 120);
});

test("linha zerada (place CAMPINAS) nao conta como drop", () => {
  const base = { shp_sender_id: "538617665", shp_sender_nickname: "MUNDO EDUCATIVO", SHP_RELATED_ENTITY_ID: "849817033_226543021" };
  const r = normalizarLinhas([
    { ...base, route_date: "2026-09-23", SHP_LG_CUST_DISPLAY_NAME: "MUNDO EDUCATIVO", total_estimados: "99", total_coletados: "99" },
    { ...base, route_date: "2026-09-23", SHP_LG_CUST_DISPLAY_NAME: "CAMPINAS", total_estimados: "0", total_coletados: "0" },
    { ...base, route_date: "2026-09-20", SHP_LG_CUST_DISPLAY_NAME: "CAMPINAS", total_estimados: "0", total_coletados: "0" },

    { ...base, route_date: "2026-09-19", SHP_LG_CUST_DISPLAY_NAME: "CAMPINAS", total_estimados: "0", total_coletados: "3" },
  ]);
  assert.equal(r.length, 1);

  assert.equal(medias(r).dias, 1);
  assert.equal(medias(r).estimados, 99);
});

test("selo segue STATUS (K) e STATUS FINAL", async () => {
  const { seloSolicitacao } = await import("../app/lib/upgrade.ts");
  const tom = (k, f) => seloSolicitacao(k, f).tom;
  assert.equal(tom("Pendente", ""), "pendente");
  assert.equal(tom("Solicitado", ""), "solicitado");
  assert.equal(tom("", ""), "solicitado");
  assert.equal(tom("Recusado", ""), "recusado");
  assert.equal(tom("Recusado, duplicidade.", ""), "recusado");
  assert.equal(tom("Solicitado", "Resusado"), "recusado");
  assert.equal(tom("Solicitado", "Erro migração"), "recusado");
  assert.equal(tom("Solicitado", "Processado"), "aceito");

  assert.equal(tom("Pendente", "Processado"), "aceito");
  assert.equal(seloSolicitacao("Solicitado", "Processado").texto, "Upgrade aceito");
});

test("base original de respostas manda no STATUS FINAL; copia so sem ela", async () => {
  const { lerBaseOriginal, comBaseOriginal } = await import("../app/lib/upgrade.ts");
  const base = lerBaseOriginal([
    ["Column 30", "Carimbo de data/hora", "Endereço de e-mail", "Coluna 3", "Seller_id", "ESTADO DO SELLER",
      "SOLICITAÇÃO", "STATUS FINAL", "RESULTADO", "FEEDBACK"],
    ["35", "29/08/2026 19:31:50", "x@ml.com", "Execução First Mile", "1907038133", "SP", "UPGRADE", "Resusado",
      "Em processo de migração pela Big Wave", "-"],
    ["35", "29/08/2026 19:39:20", "x@ml.com", "Execução First Mile", "1091592784", "SP", "UPGRADE", "Processado",
      "TRUE", "Processo realizado com sucesso"],

    ["36", "30/08/2026 10:00:00", "x@ml.com", "Execução First Mile", "1907038133", "SP", "UPGRADE", "Processado",
      "TRUE", "ok"],

    ["36", "30/08/2026 11:00:00", "x@ml.com", "Execução First Mile", "555", "SP", "DOWNGRADE", "Processado", "", ""],
  ]);
  assert.equal(base.get("1907038133").statusFinal, "Processado");
  assert.equal(base.has("555"), false);

  const sol = (sellerId, statusFinal) => ({
    sellerId, placeId: "P", placeNome: "", solicitante: "Ana", link: "", status: "Solicitado", statusFinal,
  });
  const m = comBaseOriginal([sol("1091592784", ""), sol("42", "Resusado")], base);

  assert.equal(m[0].statusFinal, "Processado");
  assert.equal(m[0].origemFinal, "base");
  assert.equal(m[0].feedback, "Processo realizado com sucesso");

  assert.equal(m[1].statusFinal, "Resusado");
  assert.equal(m[1].origemFinal, "copia");

  const so = m.find((x) => x.sellerId === "1907038133");
  assert.equal(so.status, "Solicitado");
  assert.equal(so.statusFinal, "Processado");
  assert.equal(m.length, 3);
});

test("cabecalho real (ID SELLER SENDER) e motivo volumoso", async () => {
  const { colunasSolicitacao, linhaSolicitacao } = await import("../app/lib/upgrade.ts");
  const cab = [
    "ID SELLER SENDER", "NOME SELLER SENDER", "K74", "NOME PLACE", "ESTADO DO SELLER",
    "UP ou DOWN ?", "MOTIVO", "SE FOR VOLUMOSO, TEM EVIDENCIAS?", "SOLICITANTE",
    "LINK DA EVIDENCIA", "STATUS",
  ];
  const c = colunasSolicitacao(cab);
  assert.equal(c.sellerId, 0);
  assert.equal(c.sellerNome, 1);
  const linha = linhaSolicitacao(c, cab.length, {
    sellerId: "1", sellerNome: "", placeId: "P", placeNome: "", estado: "SP",
    solicitante: "Ana", motivo: "volumoso", evidenciaVolume: "https://fotos",
  });
  assert.equal(linha[6], "volumoso");
  assert.equal(linha[7], "https://fotos");

  assert.equal(linha[9], "https://fotos");

  const peso = linhaSolicitacao(c, cab.length, {
    sellerId: "1", sellerNome: "", placeId: "P", placeNome: "", estado: "SP",
    solicitante: "Ana", motivo: "peso", evidenciaVolume: "30kg por pacote",
  });
  assert.equal(peso[6], "peso");
  assert.equal(peso[7], "30kg por pacote");
  assert.equal(peso[9], "30kg por pacote");
  assert.equal(linha[10], "Pendente");

  const q = linhaSolicitacao(c, cab.length, {
    sellerId: "1", sellerNome: "", placeId: "P", placeNome: "", estado: "SP",
    solicitante: "Ana", evidenciaVolume: "x",
  });
  assert.equal(q[7], "");

  assert.equal(q[9], "");
});

test("estado do seller vem do SHP_SENDER_STATE_ID", async () => {
  const { siglaEstado, estadoDoSeller, normalizarLinhas } = await import("../app/lib/upgrade.ts");
  assert.equal(siglaEstado("BR-MG"), "MG");
  assert.equal(siglaEstado("sp"), "SP");
  assert.equal(siglaEstado(""), "");
  const linhas = normalizarLinhas([
    { route_date: "2026-09-20", shp_sender_id: "1", total_estimados: "30", shp_sender_state_id: "BR-MG" },
    { route_date: "2026-09-21", shp_sender_id: "1", total_estimados: "30", shp_sender_state_id: "BR-MG" },
    { route_date: "2026-09-22", shp_sender_id: "1", total_estimados: "30", shp_sender_state_id: "BR-SP" },
  ]);
  assert.equal(estadoDoSeller(linhas), "MG");
  assert.equal(estadoDoSeller(normalizarLinhas([{ route_date: "2026-09-20", total_estimados: "3" }])), "");
});

test("em alta: periodo abaixo do corte, ultima semana acima", () => {
  const fim = "2026-08-31";
  const antigos = Array.from({ length: 20 }, (_, i) => l(somarDias("2026-08-01", i), 5));
  const semana = Array.from({ length: 5 }, (_, i) => l(somarDias("2026-08-25", i), 40));
  const r = avaliar([...antigos, ...semana], fim);
  assert.ok(r.geral.estimados < 20);
  assert.equal(r.status, "em-alta");
});

test("cluster do place e clusters do seller", async () => {
  const { clusterPadrao, candidatos } = await import("../app/lib/upgrade.ts");
  assert.equal(clusterPadrao("7"), "C07");
  assert.equal(clusterPadrao("C12"), "C12");
  assert.equal(clusterPadrao(""), "");
  assert.equal(clusterPadrao("x"), "");
  const r = candidatos(
    [
      l("2026-08-30", 10, { placeId: "A", cluster: "C03" }),
      l("2026-08-30", 40, { placeId: "B", cluster: "C07" }),
      l("2026-08-29", 5, { placeId: "C", cluster: "" }),
    ],
    "2026-08-31",
  );
  assert.equal(r[0].cluster, "C07");
  assert.deepEqual(r[0].clusters, ["C07", "C03"]);
});

test("ativacao do upgrade aceito pelo PRAZO ATIVACAO", async () => {
  const { ativacaoDoUpgrade, lerSolicitacoes } = await import("../app/lib/upgrade.ts");
  assert.deepEqual(ativacaoDoUpgrade("13/10/2026", "2026-10-06"), { estado: "agendada", dataBR: "13/10/2026" });
  assert.deepEqual(ativacaoDoUpgrade("10/09/2026", "2026-10-06"), { estado: "concluida", dataBR: "10/09/2026" });

  assert.equal(ativacaoDoUpgrade("6/10/2026", "2026-10-06").estado, "concluida");
  assert.equal(ativacaoDoUpgrade("", "2026-10-06"), null);
  assert.equal(ativacaoDoUpgrade("-", "2026-10-06"), null);

  const { solicitacoes } = lerSolicitacoes([
    ["ID SELLER SENDER", "LINK DA EVIDENCIA", "STATUS", "STATUS FINAL", "PRAZO CONFIGURAÇÃO", "PRAZO ATIVAÇÃO"],
    ["123", "", "Solicitado", "Processado", "08/10/2026", "13/10/2026"],
  ]);
  assert.equal(solicitacoes[0].prazoAtivacao, "13/10/2026");
});

test("motivo da recusa: RESULTADO da coluna M, so quando recusado", async () => {
  const { lerSolicitacoes, motivoDaRecusa } = await import("../app/lib/upgrade.ts");
  const { solicitacoes } = lerSolicitacoes([
    ["ID SELLER SENDER", "STATUS", "STATUS FINAL", "RESULTADO", "FEEDBACK"],
    ["111", "Solicitado", "Erro migração", "ERROR - User is in CROSS_DOCKING", "Solicitação inválida"],
    ["222", "Solicitado", "Processado", "Em processo de migração pela Big Wave", ""],
    ["333", "Solicitado", "Recusado", "", "Já em Coletas"],
  ]);
  assert.equal(solicitacoes[0].resultado, "ERROR - User is in CROSS_DOCKING");
  assert.equal(motivoDaRecusa(solicitacoes[0]), "ERROR - User is in CROSS_DOCKING");
  assert.equal(motivoDaRecusa(solicitacoes[1]), "");
  assert.equal(motivoDaRecusa(solicitacoes[2]), "Já em Coletas");
});
