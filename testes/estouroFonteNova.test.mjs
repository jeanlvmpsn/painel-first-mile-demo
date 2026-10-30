import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compararFontes,
  excessoDaRota,
  lerPrevisao,
  rotasAgora,
  rotasComCarga,
  rotasQuePodemAjudar,
} from "../app/lib/estouro.ts";
import { chaveId, chaveRota } from "../app/lib/hb.ts";

const CHAVES = { id: chaveId, rota: chaveRota };

const CONFIG = [
  ["VIGENCIA", "NOME_ROTA", "VEICULO", "ID_SELLER", "PACOTES", "PESO", "VOLUME", "CLUSTER", "TRANSPORTADORA"],
  ["29/09/2026", "CAMPINAS_C15_370", "VUC Fixo", "1131387475", "30", "300", "6", "C15", "TP A"],
  ["29/09/2026", "CAMPINAS_C15_370", "VUC Fixo", "555", "100", "200", "2", "C15", "TP A"],
  ["29/09/2026", "CAMPINAS_C15_371", "Toco Fixo", "1131387475", "10", "100", "2", "C15", "TP B"],
  ["29/09/2026", "CAMPINAS_C15_372", "VUC Fixo", "777", "20", "100", "3", "C15", "TP C"],
  ["29/09/2026", "CAMPINAS_C20_001", "VUC Fixo", "888", "10", "50", "1", "C20", "TP D"],
];

const REPLAN = [
  ["DATA", "ID_SELLER", "ADDRESS_ID", "PACOTES", "VOLUME_M3", "PESO_KG", "ATUALIZADO_EM"],
  ["2026-09-29", "1131387475", "1", "30", "12.9", "440.1", "29/09/2026 07:00:10"],
  ["2026-09-29", "1131387475", "2", "10", "4.3", "146.7", "29/09/2026 07:00:10"],
  ["2026-09-29", "555", "3", "80", "1.6", "", "29/09/2026 07:00:10"],
  ["2026-09-30", "1131387475", "1", "99", "99", "99", "29/09/2026 07:00:10"],
];

test("previsao soma os enderecos do seller e le o ponto decimal cru", () => {
  const { previsao, atualizadoEm } = lerPrevisao(REPLAN, "2026-09-29", chaveId);
  const u = previsao.get("1131387475");
  assert.equal(u.pacotes, 40);
  assert.ok(Math.abs(u.volumeM3 - 17.2) < 1e-9);
  assert.ok(Math.abs(u.pesoKg - 586.8) < 1e-9);
  assert.equal(previsao.get("555").pesoKg, 0);
  assert.equal(atualizadoEm, "29/09/2026 07:00:10");
});

test("pacotes do monitoramento x peso e volume por pacote da previsao", () => {
  const { rotas } = rotasComCarga(CONFIG, "29/09/2026");
  const { previsao } = lerPrevisao(REPLAN, "2026-09-29", chaveId);

  const monit = { "1131387475": 60, "555": 50 };
  const agora = rotasAgora(
    rotas,
    { previsao, pacotesAgora: (id) => monit[id] ?? null },
    CHAVES,
  );
  const r370 = agora.find((r) => r.rota === "CAMPINAS_C15_370");
  const umaflex = r370.detalhe.find((p) => p.id === "1131387475");

  assert.equal(umaflex.pacotes, 45);
  assert.ok(Math.abs(umaflex.volumeM3 - 45 * (17.2 / 40)) < 1e-9);
  assert.equal(umaflex.origemPacotes, "monitoramento");
  assert.equal(umaflex.origemPorPacote, "previsão");

  const p555 = r370.detalhe.find((p) => p.id === "555");
  assert.ok(Math.abs(p555.volumeM3 - 50 * (1.6 / 80)) < 1e-9);
  assert.ok(Math.abs(p555.pesoKg - 50 * (200 / 100)) < 1e-9);

  assert.equal(r370.risco, "estouro");
  assert.equal(r370.gargalo, "volume");
  assert.equal(r370.tipo.tipo, "VUC");

  const r372 = agora.find((r) => r.rota === "CAMPINAS_C15_372");
  assert.equal(r372.detalhe[0].origemPacotes, "config");
  assert.equal(r372.volumeM3, 3);
});

test("amanha, sem monitoramento, os pacotes sao os da previsao", () => {
  const { rotas } = rotasComCarga(CONFIG, "29/09/2026");
  const { previsao } = lerPrevisao(REPLAN, "2026-09-29", chaveId);
  const agora = rotasAgora(rotas, { previsao }, CHAVES);
  const umaflex = agora
    .find((r) => r.rota === "CAMPINAS_C15_371")
    .detalhe.find((p) => p.id === "1131387475");

  assert.equal(umaflex.pacotes, 10);
  assert.equal(umaflex.origemPacotes, "previsão");
});

test("rotas que podem ajudar: mesmo cluster, com folga, antes as que nao comecaram", () => {
  const { rotas } = rotasComCarga(CONFIG, "29/09/2026");
  const { previsao } = lerPrevisao(REPLAN, "2026-09-29", chaveId);
  const agora = rotasAgora(
    rotas,
    { previsao, pacotesAgora: (id) => ({ "1131387475": 60, "555": 50 })[id] ?? null },
    CHAVES,
  );
  const alvo = agora.find((r) => r.rota === "CAMPINAS_C15_370");
  const ajuda = rotasQuePodemAjudar(alvo, agora);

  assert.deepEqual(ajuda.map((a) => a.rota.rota), ["CAMPINAS_C15_371", "CAMPINAS_C15_372"]);

  assert.ok(Math.abs(ajuda[1].folgaVolumeM3 - 11.4) < 1e-9);

  assert.ok(Math.abs(excessoDaRota(alvo).volumeM3 - (alvo.volumeM3 - 14.4)) < 1e-9);
});

test("comparacao das fontes aponta as rotas que trocam de faixa", () => {
  const { rotas } = rotasComCarga(CONFIG, "29/09/2026");
  const { previsao } = lerPrevisao(REPLAN, "2026-09-29", chaveId);
  const agora = rotasAgora(rotas, { previsao, pacotesAgora: (id) => ({ "1131387475": 60 })[id] ?? null }, CHAVES);
  const c = compararFontes(rotas, agora);
  assert.equal(c.rotas, 4);
  assert.deepEqual(c.mudancas.map((m) => [m.rota, m.riscoConfig, m.riscoPrevisao]), [
    ["CAMPINAS_C15_370", "ok", "estouro"],
  ]);
});

test("capacidade pelo veiculo que entrou; perfil menor/maior contra o pedido", async () => {
  const { aplicarAtribuicao } = await import("../app/lib/estouro.ts");
  const cfg = [
    ["VIGENCIA", "NOME_ROTA", "VEICULO", "ID_SELLER", "PACOTES", "PESO", "VOLUME", "CLUSTER"],
    ["29/09/2026", "CAMPINAS_C05_62", "Toco Fixo", "1", "10", "100", "20", "C05"],
    ["29/09/2026", "CAMPINAS_C05_63", "VUC Fixo", "2", "10", "100", "10", "C05"],
    ["29/09/2026", "CAMPINAS_C05_64", "VUC Fixo", "3", "10", "100", "10", "C05"],
    ["29/09/2026", "CAMPINAS_C05_65", "Van Fixa", "4", "10", "100", "5", "C05"],
  ];
  const { rotas } = rotasComCarga(cfg, "29/09/2026");
  const porRota = new Map([
    [chaveRota("CPS_C05_62"), { pedido: "Toco Fixo", atribuido: "VUC Fixo" }],

    [chaveRota("CAMPINAS_C05_63"), { pedido: "VUC Fixo", atribuido: "Toco Fixo" }],

    [chaveRota("CAMPINAS_C05_64"), { pedido: "VUC Fixo", atribuido: "" }],

    [chaveRota("CAMPINAS_C05_65"), { pedido: "Van Fixa", atribuido: "Express Yellow Pool" }],
  ]);
  aplicarAtribuicao(rotas, porRota, chaveRota);
  const r = (n) => rotas.find((x) => x.rota === n);
  assert.equal(r("CAMPINAS_C05_62").tipo.tipo, "VUC");
  assert.equal(r("CAMPINAS_C05_62").porte, "menor");
  assert.equal(r("CAMPINAS_C05_62").risco, "estouro");
  assert.equal(r("CAMPINAS_C05_63").porte, "maior");
  assert.equal(r("CAMPINAS_C05_63").tipo.cubagemM3, 40);
  assert.equal(r("CAMPINAS_C05_64").atribuido, false);
  assert.equal(r("CAMPINAS_C05_64").tipo.tipo, "VUC");
  assert.equal(r("CAMPINAS_C05_64").porte, null);
  assert.equal(r("CAMPINAS_C05_65").tipo.tipo, "Van");
  assert.equal(r("CAMPINAS_C05_65").porte, null);

  assert.equal(rotas[0].rota, "CAMPINAS_C05_62");
});

test("Express sem porte e Van; HR fica entre Van e VUC, 30% acima da Van", async () => {
  const { tipoDoVeiculo, aplicarAtribuicao } = await import("../app/lib/estouro.ts");
  assert.equal(tipoDoVeiculo("Express")?.tipo, "Van");
  assert.equal(tipoDoVeiculo("Express Fixo")?.tipo, "Van");

  assert.equal(tipoDoVeiculo("Express Vuc Rer")?.tipo, "VUC");
  const hr = tipoDoVeiculo("HR Fixo");
  assert.equal(hr?.tipo, "HR");
  assert.equal(hr.pesoMaxKg, 1950);
  assert.ok(Math.abs(hr.cubagemM3 - 11.7) < 1e-9);

  const cfg = [
    ["VIGENCIA", "NOME_ROTA", "VEICULO", "ID_SELLER", "PACOTES", "PESO", "VOLUME", "CLUSTER"],
    ["29/09/2026", "R1", "VUC Fixo", "1", "1", "1", "1", "C01"],
    ["29/09/2026", "R2", "Van Fixa", "2", "1", "1", "1", "C01"],
  ];
  const { rotas } = rotasComCarga(cfg, "29/09/2026");
  aplicarAtribuicao(
    rotas,
    new Map([
      ["R1", { pedido: "VUC Fixo", atribuido: "HR" }],
      ["R2", { pedido: "Van Fixa", atribuido: "HR" }],
    ]),
    (v) => String(v),
  );
  assert.equal(rotas.find((r) => r.rota === "R1").porte, "menor");
  assert.equal(rotas.find((r) => r.rota === "R2").porte, "maior");
});

test("capacidade pelo nome exato do veiculo na base do sistema; fora dela, a tabela", async () => {
  const { aplicarAtribuicao, lerCapacidades } = await import("../app/lib/estouro.ts");

  const base = lerCapacidades([
    ["SHP_LG_VEHICLE_TYPE", "SIT_SITE_ID", "SHP_LG_VEHICLE_TYPE_STATUS", "SHP_LG_VEHICLE_WEIGHT", "SHP_LG_VEHICLE_HEIGHT", "SHP_LG_VEHICLE_CAPACITY"],
    ["Bulk - VUC equipe única Pool", "MLB", "active", 2200, 400, 16],
    ["BULK - VUC PP", "MLB", "active", 2200, 400, 7.5],
    ["3/4/Médio", "MLB", "inactive", 31.7, 0, 25],
    ["Arrow Express", "MLB", "active", 5200, 280, 16.5],
  ]);
  assert.equal(base.size, 3, "o 3/4 com 31,7 kg fica de fora");
  assert.deepEqual(base.get("BULK - VUC PP"), { pesoMaxKg: 2200, cubagemM3: 7.5, ativo: true });

  const cfg = [
    ["VIGENCIA", "NOME_ROTA", "VEICULO", "ID_SELLER", "PACOTES", "PESO", "VOLUME", "CLUSTER"],
    ["29/09/2026", "R1", "VUC Fixo", "1", "1", "100", "10", "C01"],
    ["29/09/2026", "R2", "VUC Fixo", "2", "1", "100", "10", "C01"],
    ["29/09/2026", "R3", "VUC Fixo", "3", "1", "100", "10", "C01"],
  ];
  const { rotas } = rotasComCarga(cfg, "29/09/2026");
  aplicarAtribuicao(
    rotas,
    new Map([
      ["R1", { pedido: "VUC Fixo", atribuido: "Bulk - VUC PP" }],

      ["R2", { pedido: "VUC Fixo", atribuido: "bulk - vuc equipe unica pool" }],

      ["R3", { pedido: "VUC Fixo", atribuido: "VUC Fixo" }],
    ]),
    (v) => String(v),
    base,
  );
  const r = (n) => rotas.find((x) => x.rota === n);
  assert.equal(r("R1").tipo.cubagemM3, 7.5);
  assert.equal(r("R1").tipo.tipo, "VUC");
  assert.equal(r("R1").capacidadeDaBase, true);
  assert.equal(r("R1").risco, "estouro", "10 m3 num VUC PP de 7,5");
  assert.equal(r("R2").capacidadeDaBase, true);
  assert.equal(r("R3").capacidadeDaBase, false);
  assert.equal(r("R3").tipo.cubagemM3, 16);
});

test("busca por rota ou ID: casa o nome da rota ou o ID de qualquer parada", async () => {
  const { casaProcura, paradasQueCasam } = await import("../app/lib/estouro.ts");
  const rota = (nome, ids) => ({ rota: nome, detalhe: ids.map((id) => ({ id, nome: "", pacotes: 1, pesoKg: 1, volumeM3: 1 })) });
  const a = rota("CAMPINAS_C25_118", ["849817033_133815731", "BRP26047672161"]);
  const b = rota("CAMPINAS_C25_117", ["brp26047672161"]);
  const c = rota("CAMPINAS_C05_020", ["123"]);
  const todas = [a, b, c];

  assert.deepEqual(todas.filter((r) => casaProcura(r, "")).length, 3);
  assert.deepEqual(todas.filter((r) => casaProcura(r, "c25_118")).map((r) => r.rota), ["CAMPINAS_C25_118"]);

  assert.deepEqual(todas.filter((r) => casaProcura(r, " BRP26047672161 ")).map((r) => r.rota), [
    "CAMPINAS_C25_118",
    "CAMPINAS_C25_117",
  ]);

  assert.deepEqual(todas.filter((r) => casaProcura(r, "849817033")).map((r) => r.rota), ["CAMPINAS_C25_118"]);
  assert.deepEqual(paradasQueCasam(a, "849817033").map((p) => p.id), ["849817033_133815731"]);
  assert.equal(todas.filter((r) => casaProcura(r, "999999")).length, 0);
});
