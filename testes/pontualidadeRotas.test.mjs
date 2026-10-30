import assert from "node:assert/strict";
import { test } from "node:test";

import { lerRotasSistemaHoje, pontualidadeDasRotas, problemasDa } from "../app/lib/pontualidadeRotas.ts";

const CAB = ["DATA", "ROUTE_ID", "ROTA", "TRANSPORTADORA", "STATUS", "INICIO_PLANEJADO", "INICIO_ROTA"];
const sis = (id, rota, status, plan, inicio = "") => ["08/10/2026", id, rota, "Alfa", status, plan ? "2026-10-08 " + plan + ":00" : "", inicio ? "2026-10-08 " + inicio + ":00" : ""];
const visita = (o) => ({
  rota: o.rota,
  rotaId: o.rotaId ?? "",
  rotaSemNome: false,
  transportadora: "Alfa",
  idParada: o.id ?? "P1",
  nomeParada: o.nome ?? "Loja",
  pontualidade: o.pont ?? null,
  hora: o.hora ?? "",
  visitada: o.visitada ?? true,
});

test("pontualidade: sem login, login atrasado, 1o bip e paradas cedo/tarde", () => {
  const sistema = lerRotasSistemaHoje(
    [
      CAB,
      sis("1", "CAMPINAS_C04_10", "pending", "13:00"),
      sis("2", "CAMPINAS_C04_11", "active", "13:00", "13:40"),
      sis("3", "CAMPINAS_C08_12", "active", "13:00", "13:05"),
      sis("4", "CAMPINAS_C08_13", "pending", "15:00"),
      ["07/10/2026", "9", "CAMPINAS_C01_1", "X", "pending", "", ""],
    ],
    "08/10/2026",
  );
  assert.equal(sistema.length, 4);
  const rotas = pontualidadeDasRotas(
    [
      visita({ rota: "CAMPINAS_C04_11", rotaId: "2", id: "A", hora: "14:30", pont: "late" }),
      visita({ rota: "CAMPINAS_C04_11", rotaId: "2", id: "B", hora: "14:00", pont: "early" }),
      visita({ rota: "CAMPINAS_C08_12", rotaId: "3", id: "C", hora: "14:10", pont: "onTime" }),
      visita({ rota: "CAMPINAS_C08_12", rotaId: "3", id: "D", hora: "", pont: null, visitada: false }),
    ],
    [{ rota: "CAMPINAS_C10_99", idParada: "Z", inicio: "12:00" }],
    sistema,
    14 * 60 + 45,
  );
  const por = Object.fromEntries(rotas.map((r) => [r.rota, r]));
  assert.equal(por["CAMPINAS_C04_10"].login, "semLogin");
  assert.equal(por["CAMPINAS_C04_10"].atrasoLoginMin, 105);
  assert.equal(por["CAMPINAS_C04_11"].login, "loginAtrasado");
  assert.equal(por["CAMPINAS_C04_11"].atrasoLoginMin, 40);
  assert.deepEqual(por["CAMPINAS_C04_11"].primeiroBip, { hora: "14:00", parada: "Loja", pontualidade: "early" });
  assert.deepEqual(por["CAMPINAS_C04_11"].paradas, { cedo: 1, tarde: 1, noHorario: 0, total: 2 });
  assert.deepEqual(problemasDa(por["CAMPINAS_C04_11"]), ["loginAtrasado", "bipCedo", "coletaCedo", "coletaTarde"]);
  assert.equal(por["CAMPINAS_C08_12"].login, "logou");
  assert.deepEqual(problemasDa(por["CAMPINAS_C08_12"]), []);

  assert.equal(por["CAMPINAS_C08_13"].login, "semLogin");
  assert.equal(por["CAMPINAS_C08_13"].atrasoLoginMin, -15);

  assert.equal(por["CAMPINAS_C10_99"].login, "semLogin");
  assert.equal(por["CAMPINAS_C10_99"].cluster, "C10");
});

test("sem login: so a partir de 30 min antes do inicio planejado", () => {
  const sistema = lerRotasSistemaHoje([CAB, sis("1", "CAMPINAS_C04_10", "pending", "16:00")], "08/10/2026");
  const em = (agora) => pontualidadeDasRotas([], [], sistema, agora)[0].login;
  assert.equal(em(15 * 60 + 29), "aguardando");
  assert.equal(em(15 * 60 + 30), "semLogin");
  assert.equal(em(18 * 60), "semLogin");
});

test("rota no relatorio de coleta ja logou, mesmo sem parada visitada e com o sistema atrasado", () => {
  const sistema = lerRotasSistemaHoje([CAB, sis("1", "CAMPINAS_C04_351", "pending", "14:45")], "08/10/2026");
  const [r] = pontualidadeDasRotas(
    [visita({ rota: "CAMPINAS_C04_351", rotaId: "1", visitada: false, hora: "", pont: null })],
    [],
    sistema,
    14 * 60 + 42,
  );
  assert.equal(r.logou, true);
  assert.equal(r.login, "logou");
  assert.equal(r.paradas.total, 0);
});

test("pontualidade: 1o atrasado = logou, sem coleta e a janela da 1a parada ja fechou", () => {
  const jan = (o) => ({ ...visita(o), janela: o.janela, janelaFimMin: o.fim });
  const rotas = pontualidadeDasRotas(
    [
      jan({ rota: "CAMPINAS_C04_20", rotaId: "20", id: "A", visitada: false, janela: "14:00 a 16:00 hs", fim: 960 }),
      jan({ rota: "CAMPINAS_C04_20", rotaId: "20", id: "B", visitada: false, janela: "13:00 a 14:00 hs", fim: 840 }),

      jan({ rota: "CAMPINAS_C04_21", rotaId: "21", id: "C", visitada: false, janela: "14:00 a 15:00 hs", fim: 900 }),

      jan({ rota: "CAMPINAS_C04_22", rotaId: "22", id: "D", hora: "14:40", pont: "late", janela: "13:00 a 14:00 hs", fim: 840 }),
    ],
    [],
    [],
    14 * 60 + 30,
  );
  const por = (id) => rotas.find((r) => r.rotaId === id);
  assert.equal(por("20").primeiroAtrasado, true);
  assert.equal(por("20").primeiraJanela.texto, "13:00 a 14:00 hs");
  assert.ok(problemasDa(por("20")).includes("primeiroAtrasado"));
  assert.equal(por("21").primeiroAtrasado, false);
  assert.equal(por("22").primeiroAtrasado, false);
  assert.deepEqual(problemasDa(por("22")), ["bipTarde", "coletaTarde"]);
});
