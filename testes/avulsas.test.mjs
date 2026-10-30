import assert from "node:assert/strict";
import { test } from "node:test";

import {
  acharLinhaPorId,
  agruparAvulsas,
  dataParaBR,
  ehAvulsa,
  linkDaAvulsa,
  opcoesDaColuna,
} from "../app/lib/avulsas.ts";

const p = (extra) => ({
  idRota: "441958126",
  dataRota: "17-09-2026",
  transportadora: "Alfa Logistics",
  nomeRota: "",
  planejado: "Nao",
  ...extra,
});

test("planejado vazio nao vira avulsa", () => {
  assert.equal(ehAvulsa("Nao"), true);
  assert.equal(ehAvulsa("não"), true);
  assert.equal(ehAvulsa("Sim"), false);
  assert.equal(ehAvulsa(""), false);
  assert.equal(ehAvulsa(undefined), false);
});

test("data da coleta vira o formato da planilha", () => {
  assert.equal(dataParaBR("17-09-2026"), "17/09/2026");
  assert.equal(dataParaBR("2026-09-17"), "17/09/2026");
  assert.equal(dataParaBR("17/09/2026"), "17/09/2026");
  assert.equal(dataParaBR(""), "");
});

test("varias paradas da mesma rota viram uma linha so", () => {
  const r = agruparAvulsas([p({}), p({}), p({ idRota: "441958127" })], "17/09/2026");
  assert.equal(r.length, 2);
  assert.equal(r[0].id, "441958126");
  assert.equal(r[0].paradas, 2);
  assert.equal(r[1].paradas, 1);
});

test("so entra a data pedida", () => {
  const r = agruparAvulsas([p({}), p({ idRota: "9", dataRota: "16-09-2026" })], "17/09/2026");
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "441958126");
});

test("rota COM nome fica de fora, mesmo com parada avulsa", () => {
  const comNome = p({ nomeRota: "CAMPINAS_C01_370", planejado: "Nao" });
  assert.equal(agruparAvulsas([comNome], "17/09/2026").length, 0);
});

test("basta uma linha sem nome para a rota inteira ser avulsa", () => {
  const r = agruparAvulsas(
    [p({ nomeRota: "" }), p({ nomeRota: "", planejado: "Sim" })],
    "17/09/2026",
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].paradas, 2);
});

test("transportadora vazia numa parada e preenchida noutra", () => {
  const r = agruparAvulsas(
    [p({ transportadora: "" }), p({ transportadora: "Alfa Logistics" })],
    "17/09/2026",
  );
  assert.equal(r[0].transportadora, "Alfa Logistics");
});

test("o link e o mesmo da planilha", () => {
  assert.equal(
    linkDaAvulsa("441958126"),
    "/demo/rota/441958126",
  );
  assert.equal(linkDaAvulsa(""), "");
});

test("opcoes juntam grafias diferentes e poem a mais usada na frente", () => {
  const r = opcoesDaColuna([
    "Área inacessível",
    "ÁREA INACESSÍVEL",
    "Área inacessível",
    "Backlog",
    "",
    undefined,
  ]);
  assert.deepEqual(r, ["Área inacessível", "Backlog"]);
});

test("acha a linha pelo id, nunca pela posicao", () => {
  const linhas = [
    ["DATA", "TRANSPORTADORA", "ID"],
    ["16/09/2026", "ALFA", "441"],
    ["17/09/2026", "SIGMA", "442"],
  ];
  assert.equal(acharLinhaPorId(linhas, 2, "442"), 2);
  assert.equal(acharLinhaPorId(linhas, 2, "999"), -1);
  assert.equal(acharLinhaPorId(linhas, 2, ""), -1);
});

import {
  MOTIVOS,
  alternarValor,
  chaveAvulsa,
  filtrarAvulsas,
  filtrosVaziosAvulsas,
  formulaLink,
  motivoPadrao,
} from "../app/lib/avulsas.ts";

test("os quatro motivos aposentados sairam da lista", () => {
  const fora = ["Atrasos Express", "Coleta cedo demais no place", "Apoio", "Revertido pela mesma TSP"];
  for (const m of fora) assert.equal(MOTIVOS.includes(m), false, m);
  assert.equal(MOTIVOS.length, 19);
});

test("grafia antiga da planilha vira a padrao", () => {
  assert.equal(motivoPadrao("ÁREA INACESSÍVEL"), "Área inacessível");
  assert.equal(motivoPadrao("area inacessivel"), "Área inacessível");
  assert.equal(motivoPadrao("NSE Peso"), "NSE peso");

  assert.equal(motivoPadrao("Apoio"), "Apoio");
  assert.equal(motivoPadrao(""), "");
});

test("o hiperlink do Sheets sai como formula", () => {
  assert.equal(
    formulaLink("https://x/1", "441"),
    '=HYPERLINK("https://x/1";"441")',
  );

  assert.equal(formulaLink("https://x/1", 'a"b'), '=HYPERLINK("https://x/1";"a\'b")');
  assert.equal(formulaLink("", "441"), "441");
});

test("filtro: grupo vazio nao restringe, grupo cheio exige", () => {
  const av = (id, tp) => ({ id, data: "17/09/2026", transportadora: tp, paradas: 1, link: "" });
  const lista = [av("1", "ALFA"), av("2", "SIGMA")];
  const regs = {
    [chaveAvulsa("17/09/2026", "1")]: { id: "1", cluster: "8", motivo: "Backlog" },
    [chaveAvulsa("17/09/2026", "2")]: { id: "2", cluster: "13", motivo: "NSE" },
  };
  const f = filtrosVaziosAvulsas();
  assert.equal(filtrarAvulsas(lista, regs, f).length, 2);
  assert.equal(filtrarAvulsas(lista, regs, { ...f, transportadoras: ["ALFA"] }).length, 1);
  assert.equal(filtrarAvulsas(lista, regs, { ...f, clusters: ["13"] })[0].id, "2");
  assert.equal(filtrarAvulsas(lista, regs, { ...f, motivos: ["Backlog"] })[0].id, "1");
  assert.equal(filtrarAvulsas(lista, regs, { ...f, busca: "2" })[0].id, "2");
});

test("filtro: mesmo id em dias diferentes nao mistura o registro", () => {
  const av = (id, data) => ({ id, data, transportadora: "ALFA", paradas: 1, coletados: 0, link: "" });

  const lista = [av("1", "10/09/2026"), av("1", "11/09/2026")];
  const regs = {
    [chaveAvulsa("10/09/2026", "1")]: { id: "1", cluster: "8", motivo: "Backlog" },
    [chaveAvulsa("11/09/2026", "1")]: { id: "1", cluster: "13", motivo: "NSE" },
  };
  const f = filtrosVaziosAvulsas();
  assert.equal(filtrarAvulsas(lista, regs, { ...f, clusters: ["8"] }).length, 1);
  assert.equal(filtrarAvulsas(lista, regs, { ...f, clusters: ["8"] })[0].data, "10/09/2026");
  assert.equal(filtrarAvulsas(lista, regs, { ...f, motivos: ["NSE"] })[0].data, "11/09/2026");
});

test("alternar poe e tira", () => {
  assert.deepEqual(alternarValor([], "a"), ["a"]);
  assert.deepEqual(alternarValor(["a"], "a"), []);
});

test("foto do bau vem do Forms pelo ID, so do mesmo dia", async () => {
  const { formsDasAvulsas, chaveAvulsa } = await import("../app/lib/avulsas.ts");
  const dia = "17/09/2026";
  const avulsas = ["441958126", "441958127", "441958128", "441958129", "441958130"].map(
    (id) => ({ id, data: dia }),
  );
  const r = (extra) => ({
    carimbo: "17/09/2026 18:00:00",
    dataExecucao: dia,
    rota: "",
    idRota: "",
    fotoBau: "https://foto/a",
    ...extra,
  });
  const forms = formsDasAvulsas(avulsas, [
    r({ idRota: "441958126", fotoBau: "https://foto/velha", carimbo: "17/09/2026 17:00:00" }),
    r({ idRota: "441958126", fotoBau: "https://foto/nova", carimbo: "17/09/2026 19:00:00" }),

    r({ rota: "AVULSA 441958127", fotoBau: "https://foto/b" }),

    r({ idRota: "441958128", fotoBau: "" }),

    r({ idRota: "441958129", dataExecucao: "18/09/2026", carimbo: "18/09/2026 08:00:00" }),

    r({ idRota: "441958130", fotoBau: "https://foto/c", carimbo: "17/09/2026 10:00:00" }),
    r({ idRota: "441958130", fotoBau: "", carimbo: "17/09/2026 20:00:00" }),
  ]);
  assert.equal(forms[chaveAvulsa(dia, "441958126")].fotoBau, "https://foto/nova");
  assert.equal(forms[chaveAvulsa(dia, "441958127")].fotoBau, "https://foto/b");
  assert.deepEqual(forms[chaveAvulsa(dia, "441958128")], { fotoBau: "" });
  assert.equal(forms[chaveAvulsa(dia, "441958129")], undefined);
  assert.equal(forms[chaveAvulsa(dia, "441958130")].fotoBau, "https://foto/c");
});

test("no periodo cada dia acha so a propria resposta", async () => {
  const { formsDasAvulsas, chaveAvulsa } = await import("../app/lib/avulsas.ts");
  const forms = formsDasAvulsas(
    [
      { id: "441958126", data: "17/09/2026" },
      { id: "441958126", data: "18/09/2026" },
    ],
    [{ idRota: "441958126", dataExecucao: "18/09/2026", carimbo: "18/09/2026 20:00:00", fotoBau: "https://foto/18" }],
  );
  assert.equal(forms[chaveAvulsa("17/09/2026", "441958126")], undefined);
  assert.equal(forms[chaveAvulsa("18/09/2026", "441958126")].fotoBau, "https://foto/18");
});

test("dia antigo aberto no painel nao sobrescreve o historico", async () => {
  const { paraHistorico } = await import("../app/lib/avulsas.ts");
  const doRelatorio = { id: "1", data: "17/09/2026", transportadora: "", paradas: 3, coletados: 40, origemColeta: "relatorio", link: "" };
  const daPlanilha = { id: "2", data: "17/09/2026", transportadora: "", paradas: 0, coletados: 0, link: "" };
  const doHistorico = { ...daPlanilha, id: "3", coletados: 12, origemColeta: "historico" };
  assert.deepEqual(paraHistorico([doRelatorio, daPlanilha, doHistorico]).map((a) => a.id), ["1"]);
});

test("dia passado tira o coletado do historico salvo", async () => {
  const { agruparAvulsas, chaveAvulsa, completarComHistorico, dataBRPadrao } =
    await import("../app/lib/avulsas.ts");
  const salvas = new Map();
  const salva = (data, id, coletados) =>
    salvas.set(chaveAvulsa(data, id), { data, id, transportadora: "Alfa", coletados });
  salva("17/09/2026", "445620603", 101);
  salva("17/09/2026", "445668147", 0);
  salva("17/09/2026", "445000001", 55);
  salva("16/09/2026", "445000002", 9);
  salva("18/09/2026", "445999999", 7);

  const avulsas = [
    { id: "445620603", data: "17/09/2026", transportadora: "", paradas: 0, coletados: 0, link: "" },
    { id: "445668147", data: "17/09/2026", transportadora: "X", paradas: 0, coletados: 0, link: "" },
    ...agruparAvulsas(
      [{ idRota: "445999999", dataRota: "18-09-2026", nomeRota: "", coletados: "30" }],
      "18/09/2026",
    ),
  ];
  completarComHistorico(avulsas, salvas, ["17/09/2026", "18/09/2026"]);
  const por = Object.fromEntries(avulsas.map((a) => [a.id, a]));
  assert.equal(por["445620603"].coletados, 101);
  assert.equal(por["445620603"].origemColeta, "historico");
  assert.equal(por["445620603"].transportadora, "Alfa");
  assert.equal(por["445668147"].coletados, 0);
  assert.equal(por["445668147"].transportadora, "X");
  assert.equal(por["445000001"].coletados, 55);
  assert.equal(por["445000002"], undefined);
  assert.equal(por["445999999"].coletados, 30);
  assert.equal(por["445999999"].origemColeta, "relatorio");

  assert.equal(dataBRPadrao("5/9/2026"), "05/09/2026");
  assert.equal(dataBRPadrao("05/09/2026"), "05/09/2026");
});

test("historico de coleta preenchido a mao e lido como vier", async () => {
  const { lerColetasSalvas, chaveAvulsa } = await import("../app/lib/avulsas.ts");
  const salvas = lerColetasSalvas([
    ["Data", "ID da rota", "Transportadora", "Pacotes coletados"],

    [46286, 445620603, "Alfa", 101],

    ["21/09/2026", "445.668.147", "KN", "250"],
    ["2026-09-22", "445000001", "", 7],
    ["", "445000002", "", 9], // sem data: fora
  ]);
  assert.equal(salvas.get(chaveAvulsa("21/09/2026", "445620603")).coletados, 101);
  assert.equal(salvas.get(chaveAvulsa("21/09/2026", "445620603")).linha, 2);
  assert.equal(salvas.get(chaveAvulsa("21/09/2026", "445668147")).coletados, 250);
  assert.equal(salvas.get(chaveAvulsa("22/09/2026", "445000001")).coletados, 7);
  assert.equal(salvas.size, 3);

  assert.equal(lerColetasSalvas([["DATA", "ID"], ["21/09/2026", "1"]]).size, 0);
});
