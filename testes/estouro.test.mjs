import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classificar,
  nomeDoEstouro,
  numeroBR,
  porPacoteNoDia,
  rotasComCarga,
  simular,
  tipoDoVeiculo,
} from "../app/lib/estouro.ts";

test("veiculo da config vira o tipo da tabela", () => {
  assert.equal(tipoDoVeiculo("Toco Fixo")?.tipo, "Toco");
  assert.equal(tipoDoVeiculo("Melione Vuc Rer")?.tipo, "VUC");
  assert.equal(tipoDoVeiculo("VUC Fixo")?.pesoMaxKg, 2200);
  assert.equal(tipoDoVeiculo("Utilitário")?.cubagemM3, 2);
  assert.equal(tipoDoVeiculo("Moto"), null);
});

test("numero com virgula do extrato", () => {
  assert.equal(numeroBR("26,74"), 26.74);
  assert.equal(numeroBR("1.234,5"), 1234.5);
  assert.equal(numeroBR("0.33"), 0.33);
  assert.equal(numeroBR("2.100"), 2100);
  assert.equal(numeroBR(""), 0);
});

test("NSE peso quando o peso acaba antes do espaco", () => {
  assert.deepEqual(classificar(1.05, 0.6), { risco: "estouro", gargalo: "peso" });
  assert.deepEqual(classificar(0.5, 0.92), { risco: "limite", gargalo: "volume" });
  assert.deepEqual(classificar(0.3, 0.4), { risco: "ok", gargalo: "volume" });
  assert.deepEqual(classificar(null, null), { risco: "sem-veiculo", gargalo: null });
  assert.equal(nomeDoEstouro("peso"), "NSE peso");
  assert.equal(nomeDoEstouro("volume"), "NSE");
});

test("soma as paradas por rota e ordena o estouro primeiro", () => {
  const linhas = [
    ["VIGENCIA", "NOME_ROTA", "VEICULO", "TRANSPORTADOR", "CLUSTER", "VOLUME", "PESO", "PACOTES"],
    ["25/09/2026", "R_FOLGA", "Toco Fixo", "ZETA", "C01", "1,14", "26,74", "29"],
    ["25/09/2026", "R_PESO", "VUC Fixo", "Alfa", "C01", "4,00", "1.500,00", "100"],
    ["25/09/2026", "R_PESO", "VUC Fixo", "Alfa", "C01", "3,00", "900,00", "80"],
    ["24/09/2026", "R_PESO", "VUC Fixo", "Alfa", "C01", "99,00", "9.999,00", "1"],
  ];
  const { rotas, aviso } = rotasComCarga(linhas, "25/09/2026");
  assert.equal(aviso, "");
  assert.deepEqual(rotas.map((r) => r.rota), ["R_PESO", "R_FOLGA"]);
  const p = rotas[0];
  assert.equal(p.paradas, 2);
  assert.equal(p.pacotes, 180);
  assert.equal(p.pesoKg, 2400);
  assert.equal(p.risco, "estouro");
  assert.equal(p.gargalo, "peso");
  assert.equal(Math.round(p.usoVolume * 100), 44);
});

test("extrato sem o dia vira aviso", () => {
  const { rotas, aviso } = rotasComCarga(
    [["VIGENCIA", "NOME_ROTA", "VEICULO", "VOLUME", "PESO"], ["22/09/2026", "R1", "Van", "1", "1"]],
    "25/09/2026",
  );
  assert.equal(rotas.length, 0);
  assert.match(aviso, /22\/09\/2026/);
});

test("detalhe das paradas e simulacao de pacotes extras", () => {
  const linhas = [
    ["VIGENCIA", "NOME_ROTA", "ID_SELLER", "NAME_CLIENTE", "VEICULO", "VOLUME", "PESO", "PACOTES"],
    ["25/09/2026", "R1", "111", "LOJA A", "VUC Fixo", "8,00", "1.000,00", "100"],
    ["25/09/2026", "R1", "222", "LOJA B", "VUC Fixo", "4,00", "600,00", "50"],
    ["25/09/2026", "R2", "333", "PESADO", "Toco Fixo", "2,00", "1.000,00", "20"],
  ];
  const { rotas } = rotasComCarga(linhas, "25/09/2026");
  const r1 = rotas.find((r) => r.rota === "R1");
  assert.deepEqual(r1.detalhe.map((p) => [p.id, p.nome, p.pacotes]), [["111", "LOJA A", 100], ["222", "LOJA B", 50]]);

  const por = porPacoteNoDia(rotas, "333");
  assert.equal(por.nome, "PESADO");
  assert.equal(por.pesoKg, 50);
  assert.equal(porPacoteNoDia(rotas, "999"), null);

  const sim = simular(r1, 20, por);
  assert.equal(sim.pesoKg, 2600);
  assert.equal(sim.risco, "estouro");
  assert.equal(sim.gargalo, "peso");
  assert.equal(simular(r1, 5, por).risco, "ok");
});
