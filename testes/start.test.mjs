import assert from "node:assert/strict";
import { test } from "node:test";

import { metricasStart, parPerfil, segundasSaidas, textoStart } from "../app/lib/start.ts";

const rota = (extra = {}) => ({
  data: "11/09/2026",
  rota: extra.rota ?? "CAMPINAS_C01_1",
  transportadora: extra.transportadora ?? "ZETA",
  placa: extra.placa ?? "ABC1D23",
  regiao: "CPS",
  cluster: "C01",
  atribuida: extra.atribuida ?? true,
  motorista: extra.motorista ?? "",
  start: extra.start ?? "09:00",
  statusVeiculo: "",
  statusMotorista: "",
  tipoRota: extra.tipoRota ?? "first_mile",
  perfil: extra.perfil ?? "",
  veiculoTipo: extra.veiculoTipo ?? "",
  ...("perfilMenor" in extra ? { perfilMenor: extra.perfilMenor } : {}),
});

const menor = (nome, tp, pedido, entrou) =>
  rota({
    rota: nome,
    transportadora: tp,
    perfil: pedido,
    veiculoTipo: entrou,
    perfilMenor: true,
  });

test("TT Rotas = atribuicao menos os NS ja identificados", () => {
  const m = metricasStart([rota(), rota(), rota(), rota()], 3);
  assert.equal(m.rotas, 4);
  assert.equal(m.ns, 3);
  assert.equal(m.ttRotas, 1);
});

test("TT Rotas nunca fica negativo", () => {
  const m = metricasStart([rota()], 3);
  assert.equal(m.ttRotas, 0);
});

test("perfil menor sem a coluna na aba e null, nao zero", () => {
  const m = metricasStart([rota(), rota()], 0);
  assert.equal(m.perfilMenor, null, "coluna ausente nao pode virar 0 divergente");
  assert.deepEqual(m.perfilMenorPorTp, []);
  const txt = textoStart(m, "11/09/2026");
  assert.ok(txt.includes("*Rotas Perfil Divergente atribuição:* ___"));
});

test("parPerfil marca com ? o perfil que a aba nao trouxe", () => {
  assert.equal(parPerfil({ rota: "x", desejado: "Medio", atribuido: "Vuc" }), "Medio/Vuc");
  assert.equal(parPerfil({ rota: "x", desejado: "Medio", atribuido: "" }), "Medio/?");
  assert.equal(parPerfil({ rota: "x", desejado: "", atribuido: "" }), "");
});

test("parPerfil tira FIXO, FROTA, TKS e RENTAL do nome do perfil", () => {
  const par = (d, a) => parPerfil({ rota: "x", desejado: d, atribuido: a });
  assert.equal(par("VUC", "VAN FROTA FIXA"), "VUC/VAN");
  assert.equal(par("MEDIO FIXO", "VUC"), "MEDIO/VUC");
  assert.equal(par("Medio Fixo", "Vuc"), "Medio/Vuc", "a caixa original e preservada");
  assert.equal(par("Rental VUC FM", "Vuc"), "VUC FM/Vuc");
  assert.equal(par("Melione Van TKS 2025", "MeliOne Van Frota Fixa"), "Melione Van 2025/MeliOne Van");
});

test("parPerfil NAO limpa quando o ruido e a unica diferenca", () => {
  const par = (d, a) => parPerfil({ rota: "x", desejado: d, atribuido: a });

  assert.equal(par("VUC FIXO", "VUC"), "VUC FIXO/VUC");
  assert.equal(par("Toco Fixo", "Toco"), "Toco Fixo/Toco");

  assert.equal(par("Fixo", "Vuc"), "Fixo/Vuc");
});

test("perfil menor detalha transportadora, rota e pedido/entrou", () => {
  const m = metricasStart(
    [
      menor("CPS_C04_10", "Alfa", "Medio", "Vuc"),
      menor("CPS_C04_2", "Alfa", "Toco", "Vuc"),
      menor("CPS_C01_5", "BRAVO", "Medio", "Vuc"),
      rota({ transportadora: "BRAVO", rota: "CPS_C01_6", perfilMenor: false }),
    ],
    0
  );
  assert.equal(m.perfilMenor, 3);
  assert.deepEqual(m.perfilMenorPorTp.map((t) => t.transportadora), ["Alfa", "BRAVO"]);
  assert.deepEqual(m.perfilMenorPorTp[0].rotas.map((r) => r.rota), [
    "CPS_C04_2",
    "CPS_C04_10",
  ]);

  const linhas = textoStart(m, "11/09/2026").split("\n");
  const i = linhas.indexOf("*Rotas Perfil Divergente atribuição:*");
  assert.ok(i > 0, "o titulo tem que se repetir sozinho numa linha");
  assert.equal(linhas[i - 1], "");
  assert.equal(linhas[i + 1], "Alfa - 02");
  assert.equal(linhas[i + 2], "CPS_C04_2 - Toco/Vuc");
  assert.equal(linhas[i + 3], "CPS_C04_10 - Medio/Vuc");

  assert.equal(linhas[i + 4], "");
  assert.equal(linhas[i + 5], "BRAVO - 01");
  assert.equal(linhas[i + 6], "CPS_C01_5 - Medio/Vuc");

  const soma = m.perfilMenorPorTp.reduce((a, t) => a + t.rotas.length, 0);
  assert.equal(soma, m.perfilMenor, "a lista tem que fechar com o total");
});

test("os tres campos digitados saem ___ enquanto ninguem preenche", () => {
  const m = metricasStart([rota()], 0);
  const txt = textoStart(m, "11/09/2026", { estimadosInicio: 248520 });
  assert.ok(
    txt.includes(
      "*Backlog:* ___ | *Forecast:* ___ | *Capacidade:* ___ | *Estimados início:* 248.520"
    ),
    "campo sem valor sai underline, nunca zero"
  );
});

test("texto sai no formato do template do start", () => {
  const m = metricasStart(
    [rota({ transportadora: "" }), rota({ tipoRota: "melione" })],
    1
  );
  const txt = textoStart(m, "11/09/2026", {
    rotasConfig: 515,
    aceitos: 144,
    recusados: 0,
    backlog: 17687,
    forecast: 238976,
    capacidade: 247861,
    estimadosInicio: 248520,
  });
  const linhas = txt.split("\n");
  assert.equal(linhas[0], "*Status FM CAMPINAS* - 11/09");
  assert.ok(
    txt.includes(
      "*Backlog:* 17.687 | *Forecast:* 238.976 | *Capacidade:* 247.861 | *Estimados início:* 248.520"
    )
  );
  assert.ok(txt.includes("*TT Rotas:* 01"));
  assert.ok(txt.includes("*Rotas Config:* 515"));
  assert.ok(txt.includes("*Rotas atribuição:* 02"));
  assert.ok(txt.includes("*Schedulings aceitos:* 144"));
  assert.ok(txt.includes("*GAP de Rotas:* 01"));
  assert.ok(txt.includes("*M1:* 01"));

  assert.ok(txt.includes("*Rotas Segunda Saída:* 01"));

  assert.ok(txt.includes("*Rotas Não descarregadas D-1:* 00"));
  assert.ok(txt.includes("*Rotas Avulsas:* 00"));
});

test("2a saida pela atribuicao: mesmo motorista OU mesma placa e o mesmo veiculo", () => {
  const { total, grupos } = segundasSaidas([
    rota({ rota: "CAMPINAS_C01_10", motorista: "João da Silva", placa: "ABC-1D23", start: "08:00" }),
    rota({ rota: "CAMPINAS_C01_11", motorista: "JOAO DA SILVA", placa: "abc1d23", start: "13:00" }),
    rota({ rota: "CAMPINAS_C02_20", motorista: "joão  da silva", placa: "XYZ9K88", start: "16:00" }),

    rota({ rota: "CAMPINAS_C03_30", motorista: "", placa: "QWE4R56", start: "09:00" }),
    rota({ rota: "CAMPINAS_C03_31", motorista: "Maria", placa: "QWE4R56", start: "14:00" }),

    rota({ rota: "CAMPINAS_C04_40", motorista: "Pedro", placa: "RTY7U89" }),

    rota({ rota: "CAMPINAS_C05_50", motorista: "", placa: "-" }),
    rota({ rota: "CAMPINAS_C05_51", motorista: "", placa: "-" }),
  ]);

  assert.equal(total, 2);
  assert.deepEqual(grupos.map((g) => g.anomalia), [true, false]);
  assert.deepEqual(grupos.map((g) => g.rotas.map((r) => r.rota)), [
    ["CAMPINAS_C01_10", "CAMPINAS_C01_11", "CAMPINAS_C02_20"],
    ["CAMPINAS_C03_30", "CAMPINAS_C03_31"],
  ]);
  assert.deepEqual(grupos[1].motoristas, ["Maria"]);
});

test("2a saida: sem motorista nem placa e ___, e rota NS nao conta", () => {
  const vazio = metricasStart([rota({ placa: "" }), rota({ placa: "" })], 0);
  assert.equal(vazio.segundaSaida, null);
  assert.ok(textoStart(vazio, "11/09/2026").includes("*Rotas Segunda Saída:* ___"));
  const comNs = metricasStart(
    [rota({ rota: "CAMPINAS_C01_1", placa: "ABC1D23" }), rota({ rota: "CAMPINAS_C01_2", placa: "ABC1D23" })],
    1,
    new Set(["C01_2"]),
  );
  assert.equal(comNs.segundaSaida, 0);
});

test("2a saida no texto: por transportadora com o total, rotas do mesmo motorista separadas por /", () => {
  const m = metricasStart(
    [
      rota({ rota: "CAMPINAS_C01_11", motorista: "Joao", placa: "ABC1D23", start: "13:00", transportadora: "Alfa" }),
      rota({ rota: "CAMPINAS_C01_10", motorista: "Joao", placa: "ABC1D23", start: "08:00", transportadora: "Alfa" }),
      rota({ rota: "CAMPINAS_C02_20", motorista: "Ana", placa: "XYZ9K88", start: "08:00" }),
      rota({ rota: "CAMPINAS_C02_21", motorista: "Ana", placa: "XYZ9K88", start: "12:00" }),
      rota({ rota: "CAMPINAS_C02_22", motorista: "Ana", placa: "XYZ9K88", start: "16:00" }),
      rota({ rota: "CAMPINAS_C03_30", motorista: "Bia", placa: "QWE4R56", start: "07:00" }),
      rota({ rota: "CAMPINAS_C03_31", motorista: "Bia", placa: "QWE4R56", start: "11:00" }),
    ],
    0,
  );
  const linhas = textoStart(m, "11/09/2026").split("\n");
  assert.ok(linhas.includes("*Rotas Segunda Saída:* 03"));
  const i = linhas.lastIndexOf("*Rotas Segunda Saída:*");
  assert.equal(linhas[i - 1], "");
  assert.deepEqual(linhas.slice(i + 1), [
    "ZETA - 02",
    "CAMPINAS_C03_30 / CAMPINAS_C03_31",
    "CAMPINAS_C02_20 / CAMPINAS_C02_21 / CAMPINAS_C02_22 ⚠️ 3 rotas no mesmo motorista, conferir",
    "",
    "Alfa - 01",
    "CAMPINAS_C01_10 / CAMPINAS_C01_11",
  ]);
});

test("2a saida por outra transportadora: entra na da 2a rota e mostra a de cada rota", () => {
  const m = metricasStart(
    [
      rota({ rota: "CAMPINAS_C01_10", motorista: "Joao", placa: "ABC1D23", start: "08:00", transportadora: "Alfa" }),
      rota({ rota: "CAMPINAS_C01_11", motorista: "Joao", placa: "ABC1D23", start: "13:00", transportadora: "BRAVO" }),
      rota({ rota: "CAMPINAS_C02_20", motorista: "Ana", placa: "XYZ9K88", start: "08:00", transportadora: "BRAVO" }),
      rota({ rota: "CAMPINAS_C02_21", motorista: "Ana", placa: "XYZ9K88", start: "12:00", transportadora: "BRAVO" }),
    ],
    0,
  );
  const linhas = textoStart(m, "11/09/2026").split("\n");
  const i = linhas.lastIndexOf("*Rotas Segunda Saída:*");
  assert.deepEqual(linhas.slice(i + 1), [
    "BRAVO - 02",
    "CAMPINAS_C01_10 (Alfa) / CAMPINAS_C01_11 (BRAVO)",
    "CAMPINAS_C02_20 / CAMPINAS_C02_21",
  ]);
});

test("2a saida: placa nao junta motoristas diferentes em cadeia", () => {
  const { total, grupos } = segundasSaidas([
    rota({ rota: "CAMPINAS_C05_438", motorista: "Marcos Lima", placa: "FCB3C09", start: "08:00" }),
    rota({ rota: "CAMPINAS_C05_428", motorista: "Marcos Lima", placa: "AOX2G26", start: "16:00" }),

    rota({ rota: "CAMPINAS_C05_215", motorista: "Rui Prado", placa: "AOX2G26", start: "11:45" }),

    rota({ rota: "CAMPINAS_C05_212", motorista: "", placa: "AOX2G26", start: "13:00" }),

    rota({ rota: "CAMPINAS_C05_422", motorista: "", placa: "FCB3C09", start: "18:00" }),
  ]);
  assert.equal(total, 1);
  assert.deepEqual(grupos.map((g) => g.rotas.map((r) => r.rota)), [
    ["CAMPINAS_C05_438", "CAMPINAS_C05_428", "CAMPINAS_C05_422"],
  ]);
  assert.equal(grupos[0].anomalia, true);
});

test("2a saida: rota que so ficou no historico (saiu da atribuicao) nao conta", () => {
  const m = metricasStart(
    [
      rota({ rota: "CAMPINAS_C05_438", motorista: "Marcos", placa: "FCB3C09", start: "08:00" }),
      rota({ rota: "CAMPINAS_C05_428", motorista: "Marcos", placa: "FCB3C09", start: "16:00" }),
      { ...rota({ rota: "CAMPINAS_C05_437", motorista: "Marcos", placa: "FCB3C09", start: "12:00" }), doHistorico: true },
    ],
    0,
  );
  assert.equal(m.segundaSaida, 1);
  assert.deepEqual(m.segundaSaidaGrupos[0].rotas.map((r) => r.rota), ["CAMPINAS_C05_438", "CAMPINAS_C05_428"]);
  assert.equal(m.segundaSaidaGrupos[0].anomalia, false);
});
