import assert from "node:assert/strict";
import { test } from "node:test";

import { CAB_ACOES, lerAcoes, linhaAcao, ordemData, statusValido, ultimaVersao } from "../app/lib/acoesPontos.ts";

const linha = (id, versao, em, autor, status, comentario, extra = {}) =>
  linhaAcao(
    { idParada: id, ponto: extra.ponto ?? "", cluster: extra.cluster ?? "", categoria: extra.categoria ?? "Capacidade", status, comentario, diaImpacto: "13/10/2026", autor, excluido: extra.excluido },
    versao,
    em,
  );

test("acoes: estado atual e a ultima versao, historico do mais novo ao mais antigo", () => {
  const r = lerAcoes([
    [...CAB_ACOES],
    linha("849817033_753137", 1, "14/10/2026 11:30:00", "Rafa", "A tratar", "Verificar upgrade", { ponto: "CASALAR", cluster: "C10", categoria: "Volumoso" }),
    linha("849817033_753137", 2, "14/10/2026 15:32:00", "Ana", "Resolvido", "Upgrade feito"),
    linha("780702949", 1, "14/10/2026 11:26:00", "Rafa", "Em tratativa", "Pacotes pesados"),
  ]);
  const a = r["849817033_753137"];
  assert.equal(a.status, "Resolvido");
  assert.equal(a.comentario, "Upgrade feito");
  assert.equal(a.autor, "Ana");
  assert.equal(a.criadoPor, "Rafa");
  assert.equal(a.criadoEm, "14/10/2026 11:30:00");

  assert.equal(a.ponto, "CASALAR");
  assert.equal(a.cluster, "C10");
  assert.deepEqual(a.historico.map((v) => v.versao), [2, 1]);
  assert.equal(a.historico[1].categoria, "Volumoso");
  assert.equal(r["780702949"].status, "Em tratativa");
});

test("acoes: ultima versao excluida tira o ponto; status e categoria invalidos caem no padrao", () => {
  const r = lerAcoes([
    [...CAB_ACOES],
    linha("10", 1, "14/10/2026 10:00:00", "A", "A tratar", "x"),
    linha("10", 2, "14/10/2026 10:05:00", "A", "A tratar", "x", { excluido: true }),
  ]);
  assert.equal(r["10"], undefined);
  assert.equal(statusValido("resolvido"), "Resolvido");
  assert.equal(statusValido("qualquer"), "A tratar");

  assert.equal(statusValido("reprovado"), "Reprovado");
  assert.equal(statusValido("Culpa transportadora"), "Culpa transportadora");
  assert.equal(linha("11", 1, "", "", "erro sistemico", "", { categoria: "area INACESSIVEL" })[6], "Área inacessível");
});

test("acoes: proxima versao conta as excluidas; ordem de data", () => {
  const linhas = [[...CAB_ACOES], linha("10", 1, "", "", "A tratar", ""), linha("10", 2, "", "", "A tratar", "", { excluido: true })];
  assert.equal(ultimaVersao(linhas, "10"), 2);
  assert.equal(ultimaVersao(linhas, "99"), 0);
  assert.ok(ordemData("14/10/2026 11:30:00") > ordemData("13/10/2026 23:59:59"));
});

test("acoes: causa criada pelo time fica como veio; lista sem repetir, padrao primeiro", async () => {
  const { categoriaValida, listaCausas } = await import("../app/lib/acoesPontos.ts");
  assert.equal(categoriaValida("horario"), "Horário");
  assert.equal(categoriaValida("  Portão   baixo "), "Portão baixo");
  assert.equal(categoriaValida(""), "Sem causa");
  assert.deepEqual(listaCausas(["Portão baixo", "portao baixo", "pesado", "Acesso restrito"]), [
    "Capacidade", "Volumoso", "Frágil", "Horário", "Comportamental", "NS", "Pesado", "Área inacessível",
    "Acesso restrito", "Portão baixo",
  ]);
});

test("acoes: ID direcional grava e le; o proprio ponto e aba antiga ficam vazios", () => {
  const nova = (id, dir) =>
    linhaAcao({ idParada: id, ponto: "", cluster: "", categoria: "NS", status: "A tratar", idDirecional: dir, nomeDirecional: "CASALAR", comentario: "", diaImpacto: "", autor: "J" }, 1, "14/10/2026 18:00:00");
  assert.equal(nova("2470410021", " 849817033 ")[11], "849817033");
  assert.equal(nova("2470410021", "2470410021")[11], "");
  assert.equal(nova("2470410021", "849817033")[12], "CASALAR");
  assert.equal(nova("2470410021", "")[12], "");
  const r = lerAcoes([[...CAB_ACOES], nova("2470410021", "849817033")]);
  assert.equal(r["2470410021"].idDirecional, "849817033");
  assert.equal(r["2470410021"].historico[0].idDirecional, "849817033");
  assert.equal(r["2470410021"].nomeDirecional, "CASALAR");

  const antiga = lerAcoes([CAB_ACOES.slice(0, 11), nova("10", "")]);
  assert.equal(antiga["10"].idDirecional, "");
});

test("responsavel: padrao com a grafia certa, time novo como veio, acao antiga sem", async () => {
  const { listaResponsaveis, responsavelValido } = await import("../app/lib/acoesPontos.ts");
  assert.equal(responsavelValido("cco"), "CCO");
  assert.equal(responsavelValido("  planejamento "), "Planejamento");
  assert.equal(responsavelValido("Torre de controle"), "Torre de controle");
  assert.equal(responsavelValido(""), "");
  assert.deepEqual(listaResponsaveis(["routing", "Torre", "torre", ""]), ["Exec", "CCO", "Place", "Routing", "Planejamento", "Torre"]);
  const linha = linhaAcao(
    { idParada: "111", ponto: "P", cluster: "C01", categoria: "NS", responsavel: "exec", status: "A tratar", comentario: "x", diaImpacto: "20/10/2026", autor: "Ana" },
    1,
    "20/10/2026 10:00:00",
  );
  assert.equal(linha[CAB_ACOES.indexOf("RESPONSAVEL")], "Exec");
  const acoes = lerAcoes([[...CAB_ACOES], linha]);
  assert.equal(acoes["111"].responsavel, "Exec");

  const antiga = lerAcoes([CAB_ACOES.slice(0, 13), linha.slice(0, 13)]);
  assert.equal(antiga["111"].responsavel, "");
});
