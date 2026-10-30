import assert from "node:assert/strict";
import test from "node:test";

import {
  atualizarCadastro,
  clusterDoNome,
  dedicadasDoDia,
  ehNomeDedicada,
  lerCadastroDedicadas,
  lerHistDedicadas,
  linhasCadastroDedicadas,
  linhasHistDedicadas,
  CAB_DEDICADAS_HIST,
} from "../app/lib/dedicadas.ts";
import { lerVisitas } from "../app/lib/monitorD0.ts";

const CAB = [
  "ID do Rota", "Nome da Rota", "ID de Parada", "Parada", "Pacotes estimados", "Pacotes preparados",
  "Pacotes coletados", "Motivo", "Pacotes não preparados/Não estão na agência", "Pacotes não cabem no veículo",
  "Fora de área", "Planejado", "Data da rota", "Pontualidade", "Transportadora", "Hora de coleta concluída",
  "Conformidade Handshake", "Horários",
];
const linha = (o) => [
  o.rotaId ?? "1", o.rota, o.id, o.nome ?? "Ponto " + o.id, String(o.est ?? 100), String(o.est ?? 100), String(o.col ?? 0),
  o.motivo ?? "", "0", "0", "Não", "Sim", "07-10-2026", o.pont ?? "", o.transp ?? "Alfa Logistics", o.hora ?? "", "",
  o.janela ?? "10:00 a 12:00 hs",
];
const ler = (...ls) => lerVisitas([CAB, ...ls.map(linha)], "07/10/2026");

const IDS_C05 = ["BRP6151950941", "BRP645572971", "BRP1361015961", "BRP2232741431", "BRP32427099711"];

test("nome e cluster da dedicada", () => {
  assert.equal(ehNomeDedicada("CPS_C05_DED_20"), true);
  assert.equal(ehNomeDedicada("CPS_C26_DED_013"), true);
  assert.equal(ehNomeDedicada("CAMPINAS_C05_120"), false);
  assert.equal(ehNomeDedicada("CAMPINAS_DEDO_1"), false);
  assert.equal(clusterDoNome("CPS_C05_DED_20"), "C05");
  assert.equal(clusterDoNome("CPS_C5_DED_20"), "C05");
});

test("cadastro aprende pelos ids e reconhece a dedicada com outro nome", () => {
  const dia1 = ler(...IDS_C05.map((id) => ({ rotaId: "452060736", rota: "CPS_C05_DED_20", id, col: 100, hora: "10:30", pont: "10:30hs - on_time" })));
  const cad1 = atualizarCadastro([], dia1, [], "06/10/2026");
  assert.equal(cad1.length, 1);
  assert.equal(cad1[0].cluster, "C05");
  assert.deepEqual(cad1[0].ids, [...IDS_C05].sort());

  const relido = lerCadastroDedicadas(linhasCadastroDedicadas(cad1));
  assert.deepEqual(relido, cad1);

  const dia2 = ler(...IDS_C05.slice(0, 4).map((id) => ({ rotaId: "452999999", rota: "CPS_C05_DED_31", id })));
  const cad2 = atualizarCadastro(relido, dia2, [], "07/10/2026");
  assert.equal(cad2.length, 1);
  assert.equal(cad2[0].chave, cad1[0].chave);
  assert.deepEqual(cad2[0].nomes, ["CPS_C05_DED_31", "CPS_C05_DED_20"]);
  assert.equal(cad2[0].primeiraVez, "06/10/2026");
  assert.equal(cad2[0].ultimaVez, "07/10/2026");

  assert.equal(atualizarCadastro([], ler({ rota: "CAMPINAS_C05_120", id: "999" }), [], "07/10/2026").length, 0);
});

test("dia da dedicada: soma dos pontos, status, rota de cobertura e 30 dias", () => {
  const visitas = ler(
    { rotaId: "10", rota: "CPS_C05_DED_20", id: "BRP1", est: 200, col: 200, hora: "10:30", pont: "10:30hs - on_time" },
    { rotaId: "10", rota: "CPS_C05_DED_20", id: "BRP2", est: 100, col: 40, motivo: "Não tenho mais espaço", hora: "10:40", pont: "10:40hs - on_time" },

    { rotaId: "11", rota: "CAMPINAS_C05_120", id: "BRP2", est: 60, col: 30, hora: "15:00", pont: "15:00hs - on_time", transp: "ORION" },

    { rotaId: "20", rota: "CPS_C08_DED_02", id: "BRP9", est: 80, janela: "08:00 a 09:00 hs" },
  );
  const cad = atualizarCadastro([], visitas, [{ rota: "CPS_C12_DED_07", idParada: "BRP7", inicio: "13:00" }], "07/10/2026");
  const hist = { BRP1: { dias: 26, estimados: 5000, coletados: 5000, naoColetados: 0, diasComPerda: 0, ultimaPerda: "", culpaPrincipal: "", incidentePrincipal: "" },
    BRP2: { dias: 26, estimados: 2600, coletados: 2340, naoColetados: 260, diasComPerda: 9, ultimaPerda: "2026-10-06", culpaPrincipal: "ME", incidentePrincipal: "1.1 Vehículo sin espacio" } };
  const dias = dedicadasDoDia(cad, visitas, [{ rota: "CPS_C12_DED_07", idParada: "BRP7", inicio: "13:00" }], hist, 11 * 60);
  const c05 = dias.find((d) => d.cluster === "C05");
  assert.equal(c05.nome, "CPS_C05_DED_20");
  assert.equal(c05.rotaId, "10");
  assert.equal(c05.estimados, 300);
  assert.equal(c05.coletados, 270);
  assert.equal(c05.status, "parcial");
  assert.deepEqual(c05.rotas.map((r) => [r.rota, r.ehDedicada]), [["CPS_C05_DED_20", true], ["CAMPINAS_C05_120", false]]);
  assert.equal(c05.hist30.estimados, 7600);
  assert.equal(c05.hist30.diasComPerda, 9);
  assert.equal(c05.hist30.incidentePrincipal, "ME 1.1 Vehículo sin espacio");
  assert.equal(dias.find((d) => d.cluster === "C08").status, "ns");
  const c12 = dias.find((d) => d.cluster === "C12");
  assert.equal(c12.status, "aguardando");
  assert.equal(c12.rotas[0].soNoPlano, true);

  const linhas = linhasHistDedicadas(dias, "07/10/2026", "07/10/2026 23:00");
  assert.equal(linhas.length, 3);
  const mapa = lerHistDedicadas([CAB_DEDICADAS_HIST, ...linhas.map((l) => l.map(String))]);
  assert.equal(mapa.get(c05.chave)[0].pu, 0.9);
  assert.equal(mapa.get(c05.chave)[0].status, "parcial");
});

test("serie pelos IDs: troca de nome cai na mesma linha", async () => {
  const { serieDosPontos, lerBaseDedicadas } = await import("../app/lib/dedicadas.ts");
  const base = lerBaseDedicadas([
    ["DIA", "PONTO", "ESTIMADOS", "COLETADOS", "NAO_COLETADOS"],
    ["2026-10-05", "BRP1", "300", "300", "0"],
    ["2026-10-05", "BRP2", "100", "80", "20"],
    ["2026-10-06", "BRP1", "280", "280", "0"],

    ["2026-10-06", "BRP9", "999", "0", "999"],
  ]);
  const gravados = [
    { data: "06/10/2026", estimados: 1, coletados: 1, pu: 1, status: "completa", rota: "CPS_C05_DED_20", ids: ["BRP1", "BRP2"] },

    { data: "07/10/2026", estimados: 400, coletados: 350, pu: 0.875, status: "parcial", rota: "CPS_C05_DED_22", ids: ["BRP1", "BRP2"] },

    { data: "07/10/2026", estimados: 50, coletados: 0, pu: 0, status: "ns", rota: "CPS_C09_DED_01", ids: ["BRP9"] },
  ];
  const hoje = { dataBR: "08/10/2026", porPonto: { BRP1: { estimados: 290, coletados: 100 }, BRP2: { estimados: 100, coletados: 0 } }, rotas: ["CPS_C05_DED_22"] };
  const serie = serieDosPontos(["BRP1", "BRP2"], base, gravados, hoje);
  assert.deepEqual(
    serie.map((d) => [d.dia, d.estimados, d.coletados, d.naoColetados, d.rota, d.fonte]),
    [
      ["2026-10-05", 400, 380, 20, "", "base"],
      ["2026-10-06", 280, 280, 0, "CPS_C05_DED_20", "base"],
      ["2026-10-07", 400, 350, 50, "CPS_C05_DED_22", "painel"],
      ["2026-10-08", 390, 100, 290, "CPS_C05_DED_22", "hoje"],
    ],
  );

  const so1 = serieDosPontos(["BRP2"], base, gravados, hoje);
  assert.deepEqual(so1.map((d) => [d.dia, d.estimados]), [["2026-10-05", 100], ["2026-10-08", 100]]);
});

test("duas DED no mesmo multicust nao viram uma so no cadastro", () => {
  const vs = ler(
    ...["BRP1", "BRP2", "BRP3", "BRP4"].map((id) => ({ rotaId: "10", rota: "CPS_C05_DED_20", id })),

    { rotaId: "20", rota: "CPS_C01_DED_025", id: "BRP4" },
    { rotaId: "20", rota: "CPS_C01_DED_025", id: "BRP50" },
  );
  const cad = atualizarCadastro([], vs, [], "08/10/2026");
  assert.deepEqual(cad.map((d) => [d.cluster, d.nomes[0], d.ids.length]), [["C05", "CPS_C05_DED_20", 4], ["C01", "CPS_C01_DED_025", 2]]);

  const cad2 = atualizarCadastro(cad, vs, [], "09/10/2026");
  assert.equal(cad2.length, 2);
  const dias = dedicadasDoDia(cad2, vs, [], {}, 12 * 60);
  assert.deepEqual(dias.map((d) => d.cluster + " " + d.nome), ["C05 CPS_C05_DED_20", "C01 CPS_C01_DED_025"]);
});

test("cadastro e historico sem copias da mesma dedicada", () => {
  const cad = lerCadastroDedicadas([
    ["CHAVE", "CLUSTER", "IDS", "NOMES", "PRIMEIRA_VEZ", "ULTIMA_VEZ"],
    ["P1", "C26", "P1", "CPS_C26_DED_013", "07/10/2026", "07/10/2026"],
    ["P1", "C26", "P1", "CPS_C26_DED_014", "06/10/2026", "07/10/2026"],
    ["X9", "C26", "P1", "CPS_C26_DED_013", "07/10/2026", "07/10/2026"],
    ["P2+P3", "C05", "P2 P3", "CPS_C05_DED_20", "07/10/2026", "07/10/2026"],
  ]);
  assert.deepEqual(cad.map((d) => [d.chave, d.ids.join(" "), d.nomes.join("|"), d.primeiraVez]), [
    ["P1", "P1", "CPS_C26_DED_013|CPS_C26_DED_014", "06/10/2026"],
    ["P2+P3", "P2 P3", "CPS_C05_DED_20", "07/10/2026"],
  ]);

  const vs = ler(
    { rotaId: "1", rota: "CPS_C26_DED_013", id: "P1", est: 432, col: 233, hora: "10:46", pont: "10:46hs - on_time" },
    { rotaId: "2", rota: "CPS_C26_DED_015", id: "P1", est: 199, col: 0 },
  );
  const hoje = atualizarCadastro(cad, vs, [], "08/10/2026");
  assert.equal(hoje.filter((d) => d.ids.includes("P1")).length, 1);

  const h = lerHistDedicadas([
    CAB_DEDICADAS_HIST,
    ...[1, 2, 3].map(() => ["07/10/2026", "P1", "C26", "CPS_C26_DED_013", "", "", "P1", "432", "432", "1", "completa", "", "", "", ""]),
  ]);
  assert.equal(h.get("P1").length, 1);
});

test("nome da dedicada: pela chave ou pelos mesmos pontos; sem nome vira DED + cluster + ponto", async () => {
  const { lerNomesDedicadas, apelidoDa, tituloDaDedicada } = await import("../app/lib/dedicadas.ts");
  const nomes = lerNomesDedicadas([
    ["CHAVE", "IDS", "APELIDO", "AUTOR", "ATUALIZADO_EM"],
    ["P1", "P1", "Galpão Sumaré", "Ana", ""],
    ["velha", "P2 P3", "Colchões Demo", "Ana", ""],
  ]);
  assert.equal(apelidoDa({ chave: "P1", pontos: [{ id: "P1" }] }, nomes), "Galpão Sumaré");
  assert.equal(apelidoDa({ chave: "P3+P2", pontos: [{ id: "P3" }, { id: "P2" }] }, nomes), "Colchões Demo");
  assert.equal(apelidoDa({ chave: "X", pontos: [{ id: "X" }] }, nomes), "");
  const d = { apelido: "", cluster: "C26", nome: "CPS_C26_DED_013", pontos: [{ id: "A", nome: "Loja A", estimados: 10 }, { id: "B", nome: "Loja B", estimados: 400 }] };
  assert.equal(tituloDaDedicada(d), "DED C26 · Loja B");
  assert.equal(tituloDaDedicada({ ...d, apelido: "Gomes" }), "Gomes");
});

test("CD (CAMPINAS) no plano nao vira ponto da dedicada", () => {
  const vs = ler(
    { rotaId: "1", rota: "CPS_C05_DED_021", id: "BRP7807029492", est: 629, col: 445, hora: "14:15", pont: "14:15hs - on_time" },
    { rotaId: "2", rota: "CAMPINAS_C05_196", id: "BRP9", est: 10, col: 10, hora: "10:00", pont: "10:00hs - on_time" },
  );
  const plano = [
    { rota: "CPS_C05_DED_021", idParada: "CAMPINAS", inicio: "10:30" },
    { rota: "CPS_C03_DED_020", idParada: "CAMPINAS", inicio: "13:00" },
    { rota: "CPS_C03_DED_020", idParada: "849817033_85368496", inicio: "13:00" },
  ];
  const cad = atualizarCadastro([], vs, plano, "08/10/2026");
  assert.deepEqual(cad.map((d) => d.ids.join(" ")).sort(), ["849817033_85368496", "BRP7807029492"]);
  const dias = dedicadasDoDia(cad, vs, plano, {}, 15 * 60);
  const c05 = dias.find((d) => d.cluster === "C05");
  const c03 = dias.find((d) => d.cluster === "C03");
  assert.deepEqual(c05.rotas.map((r) => r.rota), ["CPS_C05_DED_021"]);
  assert.equal(c03.nome, "CPS_C03_DED_020");

  assert.deepEqual(lerCadastroDedicadas([["CHAVE", "CLUSTER", "IDS"], ["X", "C05", "BRP7807029492 CAMPINAS"]])[0].ids, ["BRP7807029492"]);
});

test("cadastro antigo com parte dos pontos junta na dedicada do dia e o nome continua", async () => {
  const { apelidoDa, lerNomesDedicadas } = await import("../app/lib/dedicadas.ts");
  const cad = lerCadastroDedicadas([
    ["CHAVE", "CLUSTER", "IDS", "NOMES", "PRIMEIRA_VEZ", "ULTIMA_VEZ"],
    ["P1", "C08", "P1", "CPS_C08_DED_001", "07/10/2026", "07/10/2026"],
    ["BRP1488151355+P1", "C08", "BRP1488151355 P1", "CPS_C08_DED_001", "08/10/2026", "08/10/2026"],
  ]);
  const plano = [
    { rota: "CPS_C08_DED_001", idParada: "P1", inicio: "15:00" },
    { rota: "CPS_C08_DED_001", idParada: "BRP1488151355", inicio: "15:00" },
  ];
  const hoje = atualizarCadastro(cad, [], plano, "08/10/2026");
  assert.equal(hoje.length, 1);
  assert.deepEqual(hoje[0].ids, ["BRP1488151355", "P1"]);
  assert.deepEqual(hoje[0].aliases, ["P1"]);
  assert.equal(hoje[0].primeiraVez, "07/10/2026");
  const nomes = lerNomesDedicadas([["CHAVE", "IDS", "APELIDO"], ["P1", "P1", "BOMDIASTORE E RODASTORE"]]);
  const [dia] = dedicadasDoDia(hoje, [], plano, {}, 12 * 60);
  assert.equal(apelidoDa(dia, nomes), "BOMDIASTORE E RODASTORE");

  assert.deepEqual(lerCadastroDedicadas(linhasCadastroDedicadas(hoje))[0].aliases, ["P1"]);
});

test("duas DED no plano, uma com parte dos pontos da outra: uma dedicada so", async () => {
  const { apelidoDa, lerNomesDedicadas } = await import("../app/lib/dedicadas.ts");
  const cad = lerCadastroDedicadas([
    ["CHAVE", "CLUSTER", "IDS", "NOMES", "PRIMEIRA_VEZ", "ULTIMA_VEZ"],
    ["A", "C08", "BRP1488151355 BRP739035940P3IX", "CPS_C08_DED_001", "07/10/2026", "07/10/2026"],
    ["B", "C08", "BRP1488151355", "CPS_C08_DED_002", "07/10/2026", "07/10/2026"],
  ]);
  const plano = [
    { rota: "CPS_C08_DED_001", idParada: "BRP1488151355", inicio: "15:00" },
    { rota: "CPS_C08_DED_001", idParada: "BRP739035940P3IX", inicio: "15:00" },
    { rota: "CPS_C08_DED_002", idParada: "BRP1488151355", inicio: "15:00" },
  ];
  const hoje = atualizarCadastro(cad, [], plano, "08/10/2026");
  assert.equal(hoje.length, 1);
  assert.equal(hoje[0].chave, "A");
  assert.deepEqual(hoje[0].aliases, ["B"]);
  const nomes = lerNomesDedicadas([["CHAVE", "IDS", "APELIDO"], ["B", "BRP1488151355", "BOMDIASTORE E RODASTORE"]]);
  const [dia] = dedicadasDoDia(hoje, [], plano, {}, 12 * 60);
  assert.equal(apelidoDa(dia, nomes), "BOMDIASTORE E RODASTORE");
  assert.equal(dia.rotas.length, 2);
});

test("cadastro antigo com pontos a mais junta na dedicada do dia; sem rota DED hoje nao pega outras rotas", () => {
  const cad = lerCadastroDedicadas([
    ["CHAVE", "CLUSTER", "IDS", "NOMES", "PRIMEIRA_VEZ", "ULTIMA_VEZ"],
    ["CINCO", "C29", "1008379392 1130218341 BRP1111239311GCQ2 849817033_30773 849817033_553164", "CPS_C29_DED_044", "07/10/2026", "07/10/2026"],
    ["TRES", "C29", "1008379392 1130218341 BRP1111239311GCQ2", "CPS_C29_DED_045", "07/10/2026", "07/10/2026"],
    ["VELHA", "C07", "849817033_999", "CPS_C07_DED_009", "06/10/2026", "06/10/2026"],
  ]);
  const plano = ["CPS_C29_DED_044", "CPS_C29_DED_045"].flatMap((rota) =>
    ["1008379392", "1130218341", "BRP1111239311GCQ2"].map((idParada) => ({ rota, idParada, inicio: "16:30" })),
  );
  const vs = ler(
    { rotaId: "7", rota: "CAMPINAS_C29_48", id: "849817033_30773", est: 1458, col: 1033, hora: "16:25", pont: "16:25hs - on_time" },
    { rotaId: "8", rota: "CAMPINAS_C07_10", id: "849817033_999", est: 100, col: 50, hora: "11:00", pont: "11:00hs - on_time" },
  );
  const hoje = atualizarCadastro(cad, vs, plano, "08/10/2026");
  const c29 = hoje.filter((d) => d.cluster === "C29");
  assert.equal(c29.length, 1);
  assert.equal(c29[0].ids.length, 3);
  assert.ok(c29[0].aliases.includes("CINCO") || c29[0].chave === "CINCO");
  const dias = dedicadasDoDia(hoje, vs, plano, {}, 17 * 60, "08/10/2026");
  const velha = dias.find((d) => d.cluster === "C07");
  assert.equal(velha.status, "semRota");
  assert.equal(velha.rotas.length, 0);
});

test("ponto de apoio da DED (fora do plano) nao entra na dedicada", () => {
  const plano = ["BRP20661336741", "BRP5762152191"].map((idParada) => ({ rota: "CPS_C07_DED_021", idParada, inicio: "14:30" }));
  const vs = ler(
    { rotaId: "9", rota: "CPS_C07_DED_021", id: "849817033_29014", est: 601, col: 317, motivo: "Coleta Parcial", hora: "15:16", pont: "14:51hs - on_time" },
    { rotaId: "9", rota: "CPS_C07_DED_021", id: "BRP5762152191", est: 123, col: 122, hora: "16:00", pont: "16:00hs - on_time" },
    { rotaId: "9", rota: "CPS_C07_DED_021", id: "BRP20661336741", est: 33, col: 30, hora: "16:20", pont: "16:20hs - on_time" },
  );
  const [d] = atualizarCadastro([], vs, plano, "08/10/2026");
  assert.deepEqual(d.ids, ["BRP20661336741", "BRP5762152191"]);

  const [sem] = atualizarCadastro([], vs, [], "08/10/2026");
  assert.equal(sem.ids.length, 3);
});

test("rotas DED do dia: uma por nome, relatorio + plano, so com DED no nome", async () => {
  const { rotasDedUnicas } = await import("../app/lib/dedicadas.ts");
  const v = (rota, idParada, transportadora = "") => ({ rota, idParada, transportadora });
  const rotas = rotasDedUnicas(
    [
      v("CPS_C26_DED_013", "A", "TRANSP X"),
      v("CPS_C26_DED_013", "B", "TRANSP X"),
      v("CPS_C26_DED_014", "A", "TRANSP X"),
      v("CAMPINAS_C26_100", "A", "TRANSP Y"),
      v("CPS_C31_DED_06", "CAMPINAS"),
    ],
    [
      { rota: "CPS_C26_DED_013", idParada: "A", inicio: "" },
      { rota: "CPS_C24_DED_15", idParada: "C", inicio: "13:00" },
    ],
  );
  assert.deepEqual(
    rotas.map((r) => r.rota + "|" + r.cluster + "|" + r.transportadora),
    ["CPS_C24_DED_15|C24|", "CPS_C26_DED_013|C26|TRANSP X", "CPS_C26_DED_014|C26|TRANSP X", "CPS_C31_DED_06|C31|"],
  );
});

test("carros da DED: gravados as 23h, no popup do dia e na media por carro", async () => {
  const { carrosDaDedicada, lerCarros, mediaPorCarro, serieDosPontos } = await import("../app/lib/dedicadas.ts");
  const visitas = ler(
    { rotaId: "1", rota: "CPS_C10_DED_001", id: "BRP5", est: 200, col: 120, hora: "13:40", janela: "13:00 a 15:00 hs" },
    { rotaId: "2", rota: "CPS_C10_DED_001", id: "BRP5", est: 200, col: 40, hora: "15:10", janela: "14:30 a 16:30 hs" },
    { rotaId: "3", rota: "CPS_C10_DED_001", id: "BRP5", est: 200, janela: "15:30 a 17:30 hs" },
  );
  const cad = atualizarCadastro([], visitas, [], "21/10/2026");
  const [d] = dedicadasDoDia(cad, visitas, [], {}, 16 * 60, "21/10/2026");
  const carros = carrosDaDedicada(d);
  assert.deepEqual(carros.map((c) => [c.rotaId, c.coletados, c.passou]), [["1", 120, true], ["2", 40, true], ["3", 0, false]]);

  const linha = linhasHistDedicadas([d], "21/10/2026", "21/10/2026 23:00")[0];
  const coluna = linha[CAB_DEDICADAS_HIST.indexOf("CARROS")];
  assert.deepEqual(lerCarros(coluna).map((c) => [c.rotaId, c.coletados, c.ded]), [["1", 120, true], ["2", 40, true]]);
  const [h] = lerHistDedicadas([CAB_DEDICADAS_HIST, linha.map(String)]).get(d.chave);
  assert.equal(h.carros.length, 2);

  const serie = serieDosPontos(["BRP5"], [{ dia: "2026-10-21", ponto: "BRP5", estimados: 200, coletados: 160 }], [h], {
    dataBR: "22/10/2026",
    porPonto: { BRP5: { estimados: 150, coletados: 50 } },
    rotas: ["CPS_C10_DED_001"],
    carros: [{ rota: "CPS_C10_DED_001", rotaId: "9", janela: "", hora: "13:20", coletados: 50, ded: true, passou: true }],
  });
  assert.deepEqual(serie.map((s) => [s.dia, s.carros?.length]), [["2026-10-21", 2], ["2026-10-22", 1]]);

  assert.deepEqual(mediaPorCarro(serie), { media: 80, carros: 2, dias: 1 });

  assert.equal(mediaPorCarro([{ fonte: "base", carros: null }]), null);
});
