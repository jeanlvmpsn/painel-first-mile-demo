import assert from "node:assert/strict";
import { test } from "node:test";

import { chaveRota } from "../app/lib/hb.ts";
import {
  coletaDoHistorico,
  coletaPorRota,
  diagnosticar,
  diagnosticoDasRotas,
  ehSemEspaco,
} from "../app/lib/motivosCurva.ts";

const parada = (extra) => ({ rota: "CPS_C01_1", rotaId: "11", coletados: 10, motivo: "", planejado: "Sim", pontualidade: "", ...extra });

test("sem espaco: reconhece o motivo com e sem acento", () => {
  assert.equal(ehSemEspaco("Não tenho mais espaço"), true);
  assert.equal(ehSemEspaco("NAO TENHO MAIS ESPACO"), true);
  assert.equal(ehSemEspaco("Vendedor não tem preparados"), false);
  assert.equal(ehSemEspaco(""), false);
});

test("parada cedo / tarde: qualquer parada fora do horario marca a rota", () => {
  const coletas = coletaPorRota([
    parada({ pontualidade: "12:38hs - on_time" }),
    parada({ pontualidade: "12:50hs - early" }),
    parada({ pontualidade: "12:50hs - early" }),
    parada({ rota: "CPS_C01_2", rotaId: "12", pontualidade: "15:10hs - late" }),
  ]);
  const r1 = coletas.get("ID:11");
  assert.equal(r1.paradasCedo, 2);
  assert.deepEqual(diagnosticar(r1, "cedo").motivos, ["Parada cedo"]);

  assert.deepEqual(diagnosticar(r1, "atrasada").motivos, ["normal"]);
  assert.deepEqual(diagnosticar(coletas.get(chaveRota("CPS_C01_2")), "atrasada").motivos, ["Parada tarde"]);
  assert.deepEqual(diagnosticar(coletas.get(chaveRota("CPS_C01_2")), "cedo").motivos, ["normal"]);
});

test("NSE so conta se a rota coletou; Apoio por parada nao programada", () => {
  const coletas = coletaPorRota([
    parada({ coletados: 30 }),
    parada({ coletados: 0, motivo: "Não tenho mais espaço" }),
    parada({ coletados: 5, planejado: "Não" }),
    parada({ rota: "CPS_C01_2", rotaId: "12", coletados: 0, motivo: "Não tenho mais espaço" }),

    { rota: "999", rotaSemNome: true, coletados: 4, motivo: "", planejado: "Sim" },
  ]);
  const r1 = coletas.get(chaveRota("CPS_C01_1"));
  assert.equal(coletas.get("ID:11"), r1);
  assert.deepEqual(diagnosticar(r1).motivos, ["NSE", "Apoio"]);

  assert.deepEqual(diagnosticar(coletas.get("ID:12")).motivos, ["normal"]);
  assert.deepEqual(diagnosticar(coletas.get("ID:999")).motivos, ["normal"]);

  assert.equal(diagnosticar(undefined, "cedo"), null);
});

test("sentido: motivo que atrasa nao explica rota que chegou cedo, e vice-versa", () => {
  const coleta = { coletados: 120, semEspaco: 2, naoProgramadas: 1, paradasCedo: 0, paradasTarde: 0 };
  assert.deepEqual(diagnosticar(coleta, "cedo").motivos, ["NSE"]);
  assert.deepEqual(diagnosticar(coleta, "atrasada").motivos, ["Apoio"]);
  const tudo = { coletados: 120, semEspaco: 1, naoProgramadas: 1, paradasCedo: 1, paradasTarde: 2 };
  assert.deepEqual(diagnosticar(tudo, "cedo").motivos, ["Parada cedo", "NSE"]);
  assert.deepEqual(diagnosticar(tudo, "atrasada").motivos, ["Parada tarde", "Apoio"]);
});

test("historico: contagens por rota ou, em dia antigo, o NSE pelos MOTIVOS", () => {
  const h = coletaDoHistorico([
    { rota: "CPS_C01_1", id: "11", coletados: 40, motivo: "Coleta parcial, Não tenho mais espaço" },
    { rota: "CPS_C01_2", id: "12", coletados: 40, motivo: "", semEspaco: 0, naoPlanejadas: 2, paradasCedo: 0, paradasTarde: 3 },
  ]);
  assert.deepEqual(diagnosticar(h.get(chaveRota("CPS_C01_1")), "cedo").motivos, ["NSE"]);
  assert.deepEqual(diagnosticar(h.get("ID:12"), "atrasada").motivos, ["Parada tarde", "Apoio"]);
});

test("rotas da curva: so quem chegou cedo ou atrasada ganha motivo", () => {
  const coletas = coletaPorRota([parada({ pontualidade: "15:10hs - late" })]);
  const [atrasada, noHorario, semColeta] = diagnosticoDasRotas(
    [
      { rota: "CPS_C01_1", rotaId: "", s: "atrasada" },
      { rota: "CPS_C01_1", rotaId: "11", s: null },
      { rota: "CPS_C01_9", rotaId: "19", s: "cedo" },
    ],
    coletas,
    (r) => r.s,
  );
  assert.deepEqual(atrasada.diagnostico.motivos, ["Parada tarde"]);
  assert.equal(noHorario.diagnostico, null);
  assert.equal(semColeta.diagnostico, null);
});

test("cedo na parada da OC de NSE nao conta; cedo em outra parada da rota continua", () => {
  const soNse = coletaPorRota([
    parada({ parada: "1", coletados: 30, pontualidade: "16:01hs - on_time" }),

    parada({ parada: "2", coletados: 0, motivo: "Não tenho mais espaço", pontualidade: "12:50hs - early" }),
  ]);
  const r1 = soNse.get("ID:11");
  assert.equal(r1.paradasCedo, 0);
  assert.deepEqual(diagnosticar(r1, "cedo").motivos, ["NSE"]);

  const cedoAntes = coletaPorRota([
    parada({ parada: "1", coletados: 30, pontualidade: "11:40hs - early" }),
    parada({ parada: "2", coletados: 0, motivo: "Não tenho mais espaço", pontualidade: "12:50hs - early" }),
  ]);
  const r2 = cedoAntes.get("ID:11");
  assert.equal(r2.paradasCedo, 1);
  assert.deepEqual(r2.detalheCedo, ["1 (11:40hs - early)"]);
  assert.deepEqual(diagnosticar(r2, "cedo").motivos, ["Parada cedo", "NSE"]);
});
