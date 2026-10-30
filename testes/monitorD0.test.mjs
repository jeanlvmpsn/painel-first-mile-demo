import assert from "node:assert/strict";
import { test } from "node:test";

import { clusterDaVisita, clusterDosPontos, culpaPrevia, fimDaJanela, lerVisitas, ocorrenciasDoDia, opsDoCluster, preocupa } from "../app/lib/monitorD0.ts";

const CAB = [
  "ID do Rota", "Nome da Rota", "ID de Parada", "Parada", "Pacotes estimados", "Pacotes preparados",
  "Pacotes coletados", "Motivo", "Pacotes não preparados/Não estão na agência", "Pacotes não cabem no veículo",
  "Fora de área", "Planejado", "Data da rota", "Pontualidade", "Transportadora", "Hora de coleta concluída",
  "Conformidade Handshake", "Horários",
];

const linha = (o) => [
  o.rotaId ?? "1", o.rota ?? "CAMPINAS_C08_102", o.id ?? "111", o.nome ?? "Seller A", String(o.est ?? 100),
  String(o.prep ?? o.est ?? 100), String(o.col ?? 0), o.motivo ?? "", String(o.naoPrep ?? 0), String(o.naoCabem ?? 0),
  o.fora ?? "Não", "Sim", "07-10-2026", o.pont ?? "", "Transp X", o.hora ?? "", o.hs ?? "", o.janela ?? "",
];

const ler = (...ls) => lerVisitas([CAB, ...ls.map(linha)], "07/10/2026");

test("le o relatorio: ignora a linha do CD e outro dia", () => {
  const vs = lerVisitas(
    [CAB, linha({}), [...linha({ id: "" }).slice(0, 3), "CAMPINAS", ...linha({}).slice(4)], [...linha({}).slice(0, 12), "06-10-2026", ...linha({}).slice(13)]],
    "07/10/2026",
  );
  assert.equal(vs.length, 1);
  assert.equal(vs[0].visitada, false);
});

test("culpa previa: horario e area decidem entre seller/place e ME", () => {
  const [noHorario, cedo, place] = ler(
    { motivo: "O local estava fechado", pont: "10:00hs - on_time", hora: "10:05" },
    { motivo: "O local estava fechado", pont: "08:10hs - early", hora: "08:12" },
    { id: "111_9", motivo: "O local estava fechado", pont: "10:00hs - on_time", hora: "10:05" },
  );
  assert.deepEqual(culpaPrevia(noHorario), { culpa: "SELLER", categoria: "5. Local Cerrado", incidente: "5.3 Local Cerrado on time, dentro geo Seller" });
  assert.equal(culpaPrevia(cedo).culpa, "ME");
  assert.equal(culpaPrevia(cedo).incidente, "5.1 Pickup not on time");
  assert.equal(culpaPrevia(place).culpa, "PLACE");
  const [fora] = ler({ motivo: "O local estava fechado", pont: "10:00hs - on_time", fora: "Sim", hora: "10:05" });
  assert.equal(culpaPrevia(fora).culpa, "ME");
  assert.equal(culpaPrevia(fora).incidente, "5.2 Pickup fuera de geo");
});

test("culpa previa: NSE e nao cabe sao ME; nao preparado e do seller, cedo e ME", () => {
  const [nse, naoCabe, naoPrep, naoPrepCedo, naoPrepHs] = ler(
    { motivo: "Não tenho mais espaço", col: 60, pont: "11:00hs - on_time", hora: "11:00" },
    { motivo: "Coleta Parcial", col: 60, naoCabem: 40, pont: "11:00hs - on_time", hora: "11:00" },
    { motivo: "O vendedor não os tem preparados", col: 60, pont: "11:00hs - on_time", hora: "11:00" },
    { motivo: "O vendedor não os tem preparados", col: 60, pont: "07:50hs - early", hora: "07:50" },
    { motivo: "Coleta Parcial", col: 60, naoPrep: 40, pont: "11:00hs - on_time", hora: "11:00", hs: "agree" },
  );
  assert.equal(culpaPrevia(nse).incidente, "1.1 Vehículo sin espacio");
  assert.equal(culpaPrevia(naoCabe).incidente, "7.2 No entran en el vehículo");
  assert.deepEqual(culpaPrevia(naoPrep), { culpa: "SELLER", categoria: "9. Colecta Parcial sin Hand Shake", incidente: "9.8 Not prepared by seller" });
  assert.equal(culpaPrevia(naoPrepCedo).incidente, "9.4 Pickup Early");
  assert.equal(culpaPrevia(naoPrepHs).incidente, "7.3 No están preparados");
});

test("reversao: outra rota coletou depois; aguardando quem ainda vai passar", () => {
  const vs = ler(
    { rotaId: "1", rota: "R1", id: "111", est: 100, col: 60, motivo: "Não tenho mais espaço", pont: "10:00hs - on_time", hora: "10:00" },
    { rotaId: "2", rota: "R2", id: "111", est: 40, col: 40, pont: "14:00hs - on_time", hora: "14:00" },

    { rotaId: "1", rota: "R1", id: "222", est: 80, col: 20, motivo: "Não tenho mais espaço", pont: "10:30hs - on_time", hora: "10:30" },
    { rotaId: "3", rota: "R3", id: "222", est: 60 },

    { rotaId: "1", rota: "R1", id: "333", est: 120, col: 0, motivo: "O local estava fechado", pont: "11:00hs - on_time", hora: "11:00" },
  );
  const [a, b, c] = ocorrenciasDoDia(vs);
  assert.equal(a.status, "revertido");
  assert.deepEqual(a.revertidaPor.map((r) => r.rota), ["R2"]);
  assert.equal(a.pendentes, 0);
  assert.equal(b.status, "aguardando");
  assert.deepEqual(b.coberturaPrevista.map((r) => r.rota), ["R3"]);
  assert.equal(b.nivel, "atencao");
  assert.equal(c.status, "semNovaColeta");
  assert.equal(c.nivel, "critico");
  assert.equal(c.tipo, "Ponto com problema");
  assert.equal(a.tipo, "NSE");
  assert.deepEqual(ocorrenciasDoDia(vs).map(preocupa), [false, false, true]);
});

test("coletou 100%: nao e ocorrencia, mesmo com OC lancada; sem OC e com pacote deixado e Meli", () => {
  assert.equal(ocorrenciasDoDia(ler({ est: 50, col: 50, motivo: "Coleta Parcial", pont: "10:00hs - on_time", hora: "10:00" })).length, 0);
  const [semOc] = ocorrenciasDoDia(ler({ est: 80, col: 30, pont: "10:00hs - on_time", hora: "10:00" }));
  assert.equal(semOc.culpa.culpa, "ME");
  assert.equal(semOc.culpa.incidente, "Deixou pacote sem OC");
  assert.equal(preocupa(semOc), true);
  const [novo] = ocorrenciasDoDia(ler({ est: 80, col: 30, motivo: "Motivo que ninguem conhece", pont: "10:00hs - on_time", hora: "10:00" }));
  assert.equal(novo.culpa.culpa, null);
  assert.equal(novo.culpa.incidente, "Motivo que ninguem conhece");
});

test("acima do peso e carga fragil contam como NS de capacidade", () => {
  const [peso, fragil] = ler(
    { motivo: "O veículo está acima do peso", col: 10, pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "Carrego carga frágil e não pode ser empilhada", col: 10, pont: "10:00hs - on_time", hora: "10:00" },
  );
  assert.equal(culpaPrevia(peso).incidente, "1.2 Vehículo sobrepeso");
  assert.equal(culpaPrevia(fragil).incidente, "1.3 Vehículo bultos frágil");
  assert.equal(culpaPrevia(fragil).culpa, "ME");
});

test("nao visitado: janela passou sem coleta; com outra rota prevista vira atencao", () => {
  const vs = ler(
    { rotaId: "1", rota: "CAMPINAS_C04_350", id: "111", est: 200, janela: "08:00 a 10:00 hs" },
    { rotaId: "2", rota: "CAMPINAS_C04_186", id: "111", est: 200, janela: "13:00 a 15:00 hs" },
    { rotaId: "1", rota: "CAMPINAS_C04_350", id: "222", est: 90, janela: "08:00 a 10:00 hs" },
  );
  assert.equal(fimDaJanela("13:00 a 15:00 hs"), 900);

  const os = ocorrenciasDoDia(vs, 11 * 60);
  assert.equal(os.length, 2);
  const [com, sem] = os;
  assert.equal(com.tipo, "Não visitado");

  assert.equal(com.culpa.culpa, "ME");
  assert.equal(com.status, "aguardando");
  assert.equal(com.coberturaPrevista[0].janela, "13:00 a 15:00 hs");
  assert.equal(sem.status, "semNovaColeta");
  assert.equal(sem.nivel, "critico");

  assert.equal(ocorrenciasDoDia(vs).length, 0);
});

test("cluster e OPS: avulsa herda o cluster de outra rota do ponto", () => {
  const vs = ler(
    { rotaId: "9", rota: "", id: "111" },
    { rotaId: "1", rota: "CAMPINAS_C04_350", id: "111" },
  );
  assert.equal(clusterDaVisita(vs[0], vs), "C04");
  assert.equal(opsDoCluster("C04"), "Bruno");
  assert.equal(opsDoCluster("C99"), "Sem OPS");
});

test("tipo de parada do relatorio decide place antes do formato do ID", () => {
  const cab = [...CAB.slice(0, 16), "Tipo de parada"];
  const vs = lerVisitas(
    [cab, [...linha({ id: "849817033_1" }).slice(0, 16), "Vendedor"], [...linha({ id: "222" }).slice(0, 16), "Agência"]],
    "07/10/2026",
  );
  assert.deepEqual(vs.map((v) => v.ehPlace), [false, true]);
});

test("tratativas do dia por ponto + rota", async () => {
  const { chaveOcorrencia, lerTratativas } = await import("../app/lib/monitorD0.ts");
  const [v] = ler({ rotaId: "452", id: "111" });
  assert.equal(chaveOcorrencia(v), "111|452");
  const m = lerTratativas(
    [
      ["DATA", "CHAVE", "ROTA", "ID_PARADA", "PARADA", "TRATADO", "COMENTARIO", "AUTOR", "ATUALIZADO_EM"],
      ["07/10/2026", "111|452", "R", "111", "P", "SIM", "liguei pro seller", "Ana", "07/10/2026 10:00"],
      ["06/10/2026", "222|452", "R", "222", "P", "SIM", "", "", ""],
    ],
    "07/10/2026",
  );
  assert.deepEqual([...m.keys()], ["111|452"]);
  assert.equal(m.get("111|452").tratado, true);
  assert.equal(m.get("111|452").comentario, "liguei pro seller");
});

test("historico do ponto: perda recorrente, eventual ou sem perda", async () => {
  const { lerHistoricoPontos, riscoDoHistorico } = await import("../app/lib/monitorD0.ts");
  const h = lerHistoricoPontos([
    ["PONTO", "DIAS", "ESTIMADOS", "COLETADOS", "NAO_COLETADOS", "DIAS_COM_PERDA", "ULTIMA_PERDA", "CULPA_PRINCIPAL", "INCIDENTE_PRINCIPAL"],
    ["111", "20", "4000", "3300", "700", "9", "2026-10-03", "SELLER", "5.3 Local Cerrado on time, dentro geo Seller"],
    ["222", "20", "4000", "3990", "10", "1", "2026-09-20", "ME", "1.1 Vehículo sin espacio"],
    ["333", "20", "4000", "4000", "0", "0", "", "", ""],
  ]);
  assert.equal(riscoDoHistorico(h.get("111")), "recorrente");
  assert.equal(riscoDoHistorico(h.get("222")), "eventual");
  assert.equal(riscoDoHistorico(h.get("333")), "semPerda");
  assert.equal(riscoDoHistorico(h.get("999")), "semHistorico");
});

test("plano do dia: rota que ainda nao iniciou cobre o ponto", async () => {
  const { lerPlanoDoDia } = await import("../app/lib/monitorD0.ts");
  const extracao = [
    ["VIGENCIA", "NOME_ROTA", "ETA", "START_TIME", "ID_SELLER"],
    ["07/10/2026", "CAMPINAS_C04_350", "14:00", "10:00:00", "849817033_520513"],
    ["07/10/2026", "CAMPINAS_C04_186", "16:00", "13:00:00", "849817033_520513"],
    ["07/10/2026", "CAMPINAS_C04_400", "18:00", "0.625", "849817033_520513"],
    ["06/10/2026", "CAMPINAS_C04_999", "18:00", "15:00:00", "849817033_520513"],
  ];
  const plano = lerPlanoDoDia(extracao, [], "07/10/2026");
  assert.deepEqual(plano.map((p) => p.rota + "@" + p.inicio), ["CAMPINAS_C04_350@10:00", "CAMPINAS_C04_186@13:00", "CAMPINAS_C04_400@15:00"]);

  const vs = ler({ rotaId: "452016566", rota: "CAMPINAS_C04_350", id: "849817033_520513", est: 900, col: 190, motivo: "Coleta Parcial", pont: "10:51hs - on_time", hora: "10:51" });
  const [o] = ocorrenciasDoDia(vs, 11 * 60, plano);
  assert.equal(o.status, "aguardando");
  assert.equal(o.nivel, "atencao");
  assert.deepEqual(o.coberturaPrevista.map((c) => c.rota + "|" + c.fonte), ["CAMPINAS_C04_186|plano", "CAMPINAS_C04_400|plano"]);
});

test("handshake disagree: o ponto contestou a OC, a culpa segue com seller/place", () => {
  const [o] = ler({ id: "849817033_22435", est: 402, col: 109, motivo: "Coleta Parcial", naoPrep: 293, pont: "14:17hs - on_time", hora: "14:17", hs: "disagree" });

  const c = culpaPrevia(o);
  assert.equal(c.culpa, "PLACE");
  assert.match(c.incidente, /contestado no handshake/);
  const [agree] = ler({ id: "849817033_22435", est: 402, col: 109, motivo: "Coleta Parcial", naoPrep: 293, pont: "14:17hs - on_time", hora: "14:17", hs: "agree" });
  assert.equal(culpaPrevia(agree).culpa, "PLACE");
});

test("plano: rota que sai do CD antes da OC mas ainda nao iniciou cobre o ponto; rotas do ponto listadas", async () => {
  const { lerPlanoDoDia } = await import("../app/lib/monitorD0.ts");
  const plano = lerPlanoDoDia(
    [
      ["VIGENCIA", "NOME_ROTA", "ETA", "START_TIME", "ID_SELLER"],
      ["07/10/2026", "CAMPINAS_C31_88", "", "13:00:00", "849817033_22435"],
      ["07/10/2026", "CAMPINAS_C31_90", "", "13:30:00", "849817033_22435"],
    ],
    [],
    "07/10/2026",
  );
  const vs = ler(
    { rotaId: "1", rota: "CAMPINAS_C31_70", id: "849817033_22435", est: 540, col: 134, pont: "12:30hs - on_time", hora: "12:30", janela: "12:05 a 14:05 hs" },
    { rotaId: "2", rota: "CAMPINAS_C31_88", id: "849817033_22435", est: 402, col: 109, motivo: "Não tenho mais espaço", pont: "14:17hs - on_time", hora: "14:17", janela: "14:00 a 16:00 hs" },
  );
  const o = ocorrenciasDoDia(vs, 15 * 60, plano).find((x) => x.visita.rota === "CAMPINAS_C31_88");
  assert.equal(o.status, "aguardando");
  assert.deepEqual(o.coberturaPrevista.map((c) => c.rota), ["CAMPINAS_C31_90"]);
  assert.deepEqual(
    o.rotasDoPonto.map((r) => r.rota + ":" + r.situacao + (r.estaOcorrencia ? "*" : "")),
    ["CAMPINAS_C31_70:passou", "CAMPINAS_C31_88:passou*", "CAMPINAS_C31_90:semInicio"],
  );
});

test("saldo do ponto fica so na ultima passagem: as anteriores viram repassado", () => {
  const vs = ler(
    { rotaId: "1", rota: "R70", id: "P1", est: 540, col: 134, motivo: "Coleta Parcial", naoPrep: 406, pont: "12:30hs - on_time", hora: "12:30" },
    { rotaId: "2", rota: "R75", id: "P1", est: 640, col: 172, motivo: "Coleta Parcial", naoPrep: 468, pont: "13:20hs - on_time", hora: "13:20" },
    { rotaId: "3", rota: "R88", id: "P1", est: 402, col: 109, motivo: "Coleta Parcial", naoPrep: 293, pont: "14:17hs - on_time", hora: "14:17" },
  );
  const os = ocorrenciasDoDia(vs, 15 * 60);
  assert.deepEqual(os.map((o) => o.status), ["repassado", "repassado", "semNovaColeta"]);
  assert.deepEqual(os.map((o) => o.pendentes), [0, 0, 293]);
  assert.deepEqual(os.map((o) => o.nivel), ["ok", "ok", "critico"]);
});

test("Monitoramento por Sellers: rota pending cobre o ponto", async () => {
  const { lerRotasDosPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["DATA", "ATUALIZADO_EM", "ID_PARADA", "CUSTOMER_ID", "ROUTE_ID", "ROUTE_NAME", "STATUS", "PREPARADOS", "COLETADOS", "RESTANTES", "TRANSPORTADORA", "VEICULO", "JANELA", "ENDERECO"];
  const r = (id, nome, status, p, c, rest, veic, jan) => ["2026-10-07", "07/10/2026 15:00:00", "849817033_22435", "9924", id, nome, status, p, c, rest, "Alfa", veic, jan, "Rua das Flores de Oliveira 515"];
  const rotas = lerRotasDosPontos(
    [
      cab,
      r("452016496", "CAMPINAS_C31_89", "finished", "540", "134", "406", "NOO2G10 | Toco", "12:05 a 14:05"),
      r("452022033", "CAMPINAS_C31_169", "finished", "640", "172", "468", "GAG7J17 | Médio", "13:00 a 15:00"),
      r("452022285", "CAMPINAS_C31_88", "finished", "402", "109", "293", "BKB8F08 | Toco", "14:00 a 16:00"),
      r("452037370", "CAMPINAS_C31_168", "pending", "0", "0", "0", "EOF5C52 | Médio", "16:00 a 18:00"),
      ["2026-10-06", "", "849817033_22435", "9924", "1", "ONTEM", "pending", "0", "0", "0", "", "", "", ""],
    ],
    "07/10/2026",
  );
  assert.equal(rotas.length, 4);
  const vs = ler({ rotaId: "452022285", rota: "CAMPINAS_C31_88", id: "849817033_22435", est: 402, col: 109, motivo: "Coleta Parcial", naoPrep: 293, pont: "14:17hs - on_time", hora: "14:17", janela: "14:00 a 16:00 hs" });

  const [o] = ocorrenciasDoDia(vs, 15 * 60, [{ rota: "CAMPINAS_C31_999", idParada: "849817033_22435", inicio: "17:00" }], rotas);
  assert.equal(o.status, "aguardando");
  assert.deepEqual(o.coberturaPrevista.map((c) => c.rota + "|" + c.fonte + "|" + c.janela), ["CAMPINAS_C31_168|monitoramento|16:00 a 18:00"]);
  assert.deepEqual(
    o.rotasDoPonto.map((x) => x.rota + ":" + x.situacao + (x.estaOcorrencia ? "*" : "")),
    ["CAMPINAS_C31_89:passou", "CAMPINAS_C31_169:passou", "CAMPINAS_C31_88:passou*", "CAMPINAS_C31_168:semInicio"],
  );
  assert.equal(o.rotasDoPonto[0].restantes, 406);
});

test("avulsa sem nome na API cobre o ponto", async () => {
  const { lerRotasDosPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["DATA", "ATUALIZADO_EM", "ID_PARADA", "CUSTOMER_ID", "ROUTE_ID", "ROUTE_NAME", "STATUS", "PREPARADOS", "COLETADOS", "RESTANTES", "TRANSPORTADORA", "VEICULO", "JANELA", "ENDERECO"];
  const rotas = lerRotasDosPontos(
    [
      cab,
      ["2026-10-07", "", "849817033_259194400", "1", "452041619", "CAMPINAS_C08_322", "canceled", "62", "0", "62", "Alfa", "PKF3J62 | Vuc", "16:00 a 18:00", ""],
      ["2026-10-07", "", "849817033_259194400", "1", "452464972", "", "pending", "312", "0", "312", "Alfa", "FHV8J19 | Vuc", "16:00 a 18:00", ""],
    ],
    "07/10/2026",
  );
  assert.deepEqual(rotas.map((r) => r.rota), ["CAMPINAS_C08_322", "Avulsa 452464972"]);
  const vs = ler({ rotaId: "452041619", rota: "CAMPINAS_C08_322", id: "849817033_259194400", est: 279, col: 26, motivo: "Tive um problema mecânico", pont: "12:44hs - early", hora: "12:44", janela: "16:00 a 18:00 hs" });
  const [o] = ocorrenciasDoDia(vs, 15 * 60, [], rotas);
  assert.equal(o.status, "aguardando");
  assert.deepEqual(o.coberturaPrevista.map((c) => c.rota + "|" + c.rotaId), ["Avulsa 452464972|452464972"]);
  assert.deepEqual(o.rotasDoPonto.map((r) => r.rota + ":" + r.situacao), ["CAMPINAS_C08_322:falhou", "Avulsa 452464972:semInicio"]);
});

test("avulsa que iniciou depois da consulta da tela entra como 'vai passar'", async () => {
  const { lerRotasDosPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["DATA", "ATUALIZADO_EM", "ID_PARADA", "CUSTOMER_ID", "ROUTE_ID", "ROUTE_NAME", "STATUS", "PREPARADOS", "COLETADOS", "RESTANTES", "TRANSPORTADORA", "VEICULO", "JANELA", "ENDERECO"];

  const rotas = lerRotasDosPontos(
    [cab, ["2026-10-07", "07/10/2026 14:00:00", "849817033_25374", "1", "452000001", "CAMPINAS_C11_130", "finished", "300", "29", "271", "Alfa", "", "13:00 a 15:00", ""]],
    "07/10/2026",
  );
  const vs = ler(
    { rotaId: "452000001", rota: "CAMPINAS_C11_130", id: "849817033_25374", est: 300, col: 29, motivo: "Não tenho mais espaço", naoCabem: 271, pont: "13:40hs - on_time", hora: "13:40", janela: "13:00 a 15:00 hs" },

    { rotaId: "452999999", rota: "", id: "849817033_25374", est: 271, janela: "17:00 a 19:00 hs" },
  );
  const [o] = ocorrenciasDoDia(vs, 15 * 60, [], rotas);
  assert.equal(o.status, "aguardando");
  assert.deepEqual(o.coberturaPrevista.map((c) => c.rotaId + "|" + c.fonte), ["452999999|relatorio"]);
  assert.deepEqual(
    o.rotasDoPonto.map((r) => r.rota + ":" + r.situacao + (r.estaOcorrencia ? "*" : "")),
    ["CAMPINAS_C11_130:passou*", "Avulsa 452999999:aguardando"],
  );

  const comAvulsa = lerRotasDosPontos(
    [cab, ["2026-10-07", "07/10/2026 14:00:00", "849817033_25374", "1", "452000001", "CAMPINAS_C11_130", "finished", "300", "29", "271", "Alfa", "", "13:00 a 15:00", ""],
      ["2026-10-07", "07/10/2026 14:00:00", "849817033_25374", "1", "452999999", "", "pending", "0", "0", "0", "Alfa", "", "17:00 a 19:00", ""]],
    "07/10/2026",
  );
  const [o2] = ocorrenciasDoDia(vs, 15 * 60, [], comAvulsa);
  assert.deepEqual(o2.rotasDoPonto.map((r) => r.rota + ":" + r.situacao), ["CAMPINAS_C11_130:passou", "Avulsa 452999999:aguardando"]);
  assert.equal(o2.coberturaPrevista.length, 1);
});

test("Culp Meli do fechamento: top 3 clusters, transportadoras e motivos do impacto", async () => {
  const { linhasCulpMeli, nomeCurtoTransportadora, lerMotivosImpacto } = await import("../app/lib/monitorD0.ts");
  assert.equal(nomeCurtoTransportadora("Alfa Logistics"), "ALFA");
  assert.equal(nomeCurtoTransportadora("Transportadora Grupo Vetor"), "VETOR");
  assert.equal(nomeCurtoTransportadora("BRAVO LOGÍSTICA"), "BRAVO");
  assert.deepEqual(lerMotivosImpacto([["MOTIVO"], ["Chuva"], ["gap de capacidade"]]), ["Gap de capacidade", "Comportamental", "Sin drop off", "Impacto melione", "Chuva"]);
  const o = (cluster, transportadora, pendentes, motivo, culpa = "ME") => ({
    cluster,
    pendentes,
    culpa: { culpa },
    visita: { transportadora },
    trat: motivo ? { motivoImpacto: motivo } : undefined,
  });
  const linhas = linhasCulpMeli([
    o("C29", "ORION", 600, "Gap de capacidade"),
    o("C29", "Alfa Logistics", 450, "Comportamental"),
    o("C01", "BRAVO LOGÍSTICA", 500, "Gap de capacidade"),
    o("C01", "Alfa Logistics", 275, "Sin drop off"),
    o("C31", "Alfa Logistics", 510, ""),

    o("C31", "Alfa Logistics", 99, "Comportamental"),
    o("C40", "ORION", 90, "Comportamental"),
    o("C40", "ORION", 90, "Comportamental"),
    o("C40", "ORION", 90, "Comportamental"),
    o("C40", "ORION", 90, "Comportamental"),
    o("C40", "ORION", 90, "Comportamental"),
    o("C40", "ORION", 90, "Comportamental"),
    o("C05", "ZETA", 100, "Comportamental"),
    o("C07", "ZETA", 9000, "Comportamental", "SELLER"),
  ]);
  assert.deepEqual(linhas, [
    "C29: ORION e ALFA - 1.050 pcts - Gap de capacidade / Comportamental",
    "C01: BRAVO e ALFA - 775 pcts - Gap de capacidade / Sin drop off",
    "C31: ALFA - 510 pcts - ___",
  ]);
});

test("mesma rota passando duas vezes no ponto: o saldo fica so na ultima passagem", () => {
  const vs = ler(
    { rotaId: "9", rota: "CAMPINAS_C31_162", id: "849817033", est: 210, col: 0, motivo: "Não tenho mais espaço", pont: "17:29hs - on_time", hora: "17:29" },
    { rotaId: "9", rota: "CAMPINAS_C31_162", id: "849817033", est: 208, col: 20, motivo: "Coleta Parcial", naoCabem: 188, pont: "17:51hs - on_time", hora: "17:51" },
  );
  const [primeira, ultima] = ocorrenciasDoDia(vs);
  assert.equal(primeira.status, "repassado");
  assert.equal(primeira.pendentes, 0);
  assert.equal(primeira.nivel, "ok");
  assert.equal(ultima.pendentes, 188);

  const dup = ocorrenciasDoDia(ler(
    { rotaId: "9", rota: "R9", id: "1", est: 50, col: 0, motivo: "Não tenho mais espaço", pont: "10:00hs - on_time", hora: "10:00" },
    { rotaId: "9", rota: "R9", id: "1", est: 50, col: 0, motivo: "Não tenho mais espaço", pont: "10:00hs - on_time", hora: "10:00" },
  ));
  assert.deepEqual(dup.map((o) => o.pendentes), [0, 50]);
});

test("impacto excluido na mao sai do Culp Meli e e lido da tratativa", async () => {
  const { linhasCulpMeli, lerTratativas, CAB_TRATATIVAS } = await import("../app/lib/monitorD0.ts");
  const trat = lerTratativas(
    [CAB_TRATATIVAS, ["07/10/2026", "111|1", "R1", "111", "Seller", "", "", "Ana", "07/10/2026 18:00", "", "SIM"]],
    "07/10/2026",
  );
  assert.equal(trat.get("111|1").excluido, true);
  const o = (cluster, pendentes, excluido) => ({
    cluster, pendentes, culpa: { culpa: "ME" }, visita: { transportadora: "ORION" }, trat: { motivoImpacto: "", excluido },
  });
  assert.deepEqual(linhasCulpMeli([o("C29", 500, true), o("C29", 300, false), o("C01", 200, false)]), [
    "C29: ORION - 300 pcts - ___",
    "C01: ORION - 200 pcts - ___",
  ]);
});

test("rota casada pelo id no Monitoramento por Sellers e saldo de la", async () => {
  const { lerRotasDosPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["DATA", "ATUALIZADO_EM", "ID_PARADA", "CUSTOMER_ID", "ROUTE_ID", "ROUTE_NAME", "STATUS", "PREPARADOS", "COLETADOS", "RESTANTES", "TRANSPORTADORA", "VEICULO", "JANELA", "ENDERECO"];
  const r = (id, nome, status, p, c, rest, jan) => ["2026-10-07", "07/10/2026 19:20:00", "849817033_22414", "1", id, nome, status, p, c, rest, "Alfa", "", jan, ""];
  const rotas = lerRotasDosPontos(
    [
      cab,
      r("452022089", "CAMPINAS_C31_170", "finished", "454", "182", "272", "12:30 a 13:00"),

      r("452040000", "CAMPINAS_C31_167", "finished", "180", "176", "4", "16:00 a 18:00"),

      r("452053393", "CAMPINAS_C31_172", "finished", "480", "465", "15", "17:10 a 19:10"),
    ],
    "07/10/2026",
  );
  assert.equal(rotas[0].atualizadoEm, "07/10/2026 19:20:00");
  const vs = ler({ rotaId: "452053393", rota: "CAMPINAS_C31_167", id: "849817033_22414", est: 500, col: 25, motivo: "Coleta Parcial", naoPrep: 475, pont: "18:17hs - on_time", hora: "18:17", janela: "16:00 a 18:00 hs" });
  const [o] = ocorrenciasDoDia(vs, 20 * 60, [], rotas);
  assert.equal(o.pendentes, 15);
  assert.deepEqual(o.rotasDoPonto.filter((x) => x.estaOcorrencia).map((x) => x.rotaId), ["452053393"]);
});

test("rota que o Monitoramento por Sellers mostra coletando depois reverte o saldo", async () => {
  const { lerRotasDosPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["DATA", "ATUALIZADO_EM", "ID_PARADA", "CUSTOMER_ID", "ROUTE_ID", "ROUTE_NAME", "STATUS", "PREPARADOS", "COLETADOS", "RESTANTES", "TRANSPORTADORA", "VEICULO", "JANELA", "ENDERECO"];
  const rotas = lerRotasDosPontos(
    [cab, ["2026-10-07", "", "555", "1", "900", "CAMPINAS_C02_200", "finished", "300", "280", "20", "Alfa", "", "15:00 a 17:00", ""]],
    "07/10/2026",
  );
  const vs = ler({ rotaId: "800", rota: "CAMPINAS_C02_100", id: "555", est: 400, col: 100, motivo: "Não tenho mais espaço", pont: "11:00hs - on_time", hora: "11:00", janela: "10:00 a 12:00 hs" });
  const [o] = ocorrenciasDoDia(vs, 18 * 60, [], rotas);
  assert.equal(o.revertidos, 280);
  assert.equal(o.pendentes, 20);
  assert.deepEqual(o.revertidaPor.map((c) => c.rota + "|" + c.fonte), ["CAMPINAS_C02_200|monitoramento"]);
});

test("saldo do ponto no Monitoramento por Sellers limita os pendentes", async () => {
  const { lerSaldoDosPontos } = await import("../app/lib/monitorD0.ts");
  const saldos = lerSaldoDosPontos([
    ["ATUALIZADO_EM", "CUSTOMER_ID", "RELATED_ENTITY_ID", "TIPO", "NOME", "ESTIMADO_EDPU", "ESTIMADO_BACKLOG", "ESTIMADO_EARLY",
      "PREPARADO_EDPU", "PREPARADO_BACKLOG", "PREPARADO_EARLY", "COLETADO_EDPU", "COLETADO_BACKLOG", "COLETADO_EARLY"],
    ["07/10/2026 19:45:00", "22414", "849817033_22414", "place", "PONTO DE COLETA LIMEIRA", "1237", "15", "55", "3", "1", "0", "1229", "13", "55"],
  ]);
  assert.deepEqual(saldos["849817033_22414"], {
    estimados: 1307,
    coletados: 1297,
    preparados: 4,
    atualizadoEm: "07/10/2026 19:45:00",

    backlog: 15,
  });

  const vs = ler(
    { rotaId: "1", rota: "CAMPINAS_C31_166", id: "849817033_22414", est: 951, col: 651, motivo: "Coleta Parcial", naoPrep: 300, pont: "14:20hs - on_time", hora: "14:20", janela: "14:00 a 16:00 hs" },
    { rotaId: "2", rota: "CAMPINAS_C31_167", id: "849817033_22414", est: 651, col: 176, motivo: "Coleta Parcial", naoPrep: 475, pont: "18:17hs - on_time", hora: "18:17", janela: "16:00 a 18:00 hs" },
  );
  const os = ocorrenciasDoDia(vs, 20 * 60, [], [], saldos);
  const total = os.reduce((s, o) => s + o.pendentes, 0);
  assert.equal(total, 10);
  const ultima = os.find((o) => o.visita.rotaId === "2");
  assert.equal(ultima.pendentes, 10);
  assert.equal(ultima.abatidoPeloPonto, 465);

  assert.equal(ocorrenciasDoDia(vs, 20 * 60).find((o) => o.visita.rotaId === "2").pendentes, 475);
});

test("tratativa duplicada: vale a atualizada por ultimo", async () => {
  const { lerTratativas, CAB_TRATATIVAS } = await import("../app/lib/monitorD0.ts");
  const l = (motivo, em) => ["07/10/2026", "111|1", "R1", "111", "Seller", "", "", "Ana", em, motivo, ""];
  const m = lerTratativas([CAB_TRATATIVAS, l("Gap de capacidade", "07/10/2026, 19:05:10"), l("", "07/10/2026, 19:04:59")], "07/10/2026");
  assert.equal(m.get("111|1").motivoImpacto, "Gap de capacidade");
  const m2 = lerTratativas([CAB_TRATATIVAS, l("", "07/10/2026 19:04"), l("Comportamental", "07/10/2026 19:06")], "07/10/2026");
  assert.equal(m2.get("111|1").motivoImpacto, "Comportamental");
});

test("NS sem reversao pelo saldo do ponto (Monitoramento D0)", async () => {
  const { nsSemReversao } = await import("../app/lib/monitorD0.ts");
  const vs = ler(
    { rotaId: "9", rota: "CAMPINAS_C04_350", id: "A", est: 300, col: 0, motivo: "Tive um problema mecânico", pont: "10:00hs - on_time", hora: "10:00", transp: "Alfa Logistics" },
    { rotaId: "9", rota: "CAMPINAS_C04_350", id: "B", est: 200, col: 0, motivo: "Tive um problema mecânico", pont: "10:10hs - on_time", hora: "10:10", transp: "Alfa Logistics" },
    { rotaId: "9", rota: "CAMPINAS_C04_350", id: "C", est: 100, col: 0, motivo: "Tive um problema mecânico", pont: "10:20hs - on_time", hora: "10:20", transp: "Alfa Logistics" },

    { rotaId: "8", rota: "CAMPINAS_C04_351", id: "B", est: 200, col: 150, pont: "15:00hs - on_time", hora: "15:00" },
  );
  const saldos = {
    A: { estimados: 320, coletados: 280, preparados: 0, atualizadoEm: "" },

    C: { estimados: 100, coletados: 100, preparados: 0, atualizadoEm: "" },

    D: { estimados: 90, coletados: 20, preparados: 0, atualizadoEm: "" },
  };
  const plano = [{ rota: "CAMPINAS_C07_200", idParada: "D", inicio: "13:00" }];
  const r = nsSemReversao(
    [
      { rota: "CAMPINAS_C04_350", rotaId: "9", transportadora: "Alfa Logistics" },
      { rota: "CAMPINAS_C07_200", transportadora: "BRAVO LOGÍSTICA" },
    ],
    vs,
    plano,
    saldos,
  );
  assert.deepEqual(r.pontos.map((p) => [p.idParada, p.semReversao, p.fonte]), [["A", 40, "monitoramento"], ["B", 50, "relatorio"], ["D", 70, "monitoramento"]]);
  assert.deepEqual(r.ofensores, [
    { transportadora: "Alfa Logistics", pacotes: 90, rotas: 1, paradas: 2 },
    { transportadora: "BRAVO LOGÍSTICA", pacotes: 70, rotas: 1, paradas: 1 },
  ]);
});

test("OC que depende de handshake", async () => {
  const { ocDependeDeHandshake } = await import("../app/lib/monitorD0.ts");
  const [agencia, parcial, espaco, mecanico, naoPrep] = ler(
    { motivo: "Não estão na agência", pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "Coleta Parcial", pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "Não tenho mais espaço", pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "Tive um problema mecânico", pont: "10:00hs - on_time", hora: "10:00" },
    { naoPrep: 30, col: 70, pont: "10:00hs - on_time", hora: "10:00" },
  );
  assert.deepEqual([agencia, parcial, espaco, mecanico, naoPrep].map(ocDependeDeHandshake), [true, true, false, false, true]);
});

test("foto do Forms da rota de hoje, pelo ID ou pelo nome", async () => {
  const { fotosDasRotas, fotoDaRota } = await import("../app/lib/monitorD0.ts");
  const fotos = fotosDasRotas(
    [
      { carimbo: "08/10/2026 18:00:00", dataExecucao: "08/10/2026", rota: "CAMPINAS_C04_330", idRota: "452667048", fotoBau: "https://drive/foto1" },
      { carimbo: "08/10/2026 18:10:00", dataExecucao: "08/10/2026", rota: "CAMPINAS_C31_89", idRota: "", fotoBau: "https://drive/foto2" },
      { carimbo: "07/10/2026 18:00:00", dataExecucao: "07/10/2026", rota: "CAMPINAS_C08_34", idRota: "452600000", fotoBau: "https://drive/ontem" },
      { carimbo: "08/10/2026 18:00:00", dataExecucao: "08/10/2026", rota: "CAMPINAS_C10_13", idRota: "452611111", fotoBau: "" },
    ],
    "08/10/2026",
  );
  assert.equal(fotoDaRota(fotos, "CAMPINAS_C04_330", "452667048"), "https://drive/foto1");
  assert.equal(fotoDaRota(fotos, "campinas_c31_89", "999"), "https://drive/foto2");
  assert.equal(fotoDaRota(fotos, "CAMPINAS_C08_34", "452600000"), "");
  assert.equal(fotoDaRota(fotos, "CAMPINAS_C10_13", "452611111"), "");
});

test("rotas com Forms respondido hoje (com ou sem foto)", async () => {
  const { rotasComForms, temForms } = await import("../app/lib/monitorD0.ts");
  const respondidas = new Set(
    rotasComForms(
      [
        { carimbo: "08/10/2026 18:00:00", dataExecucao: "08/10/2026", rota: "CPS_C05_DED_021", idRota: "452659208", fotoBau: "" },
        { carimbo: "07/10/2026 18:00:00", dataExecucao: "07/10/2026", rota: "CPS_C26_DED_013", idRota: "452647357", fotoBau: "x" },
      ],
      "08/10/2026",
    ),
  );
  assert.equal(temForms(respondidas, "CPS_C05_DED_021", ""), true);
  assert.equal(temForms(respondidas, "", "452659208"), true);
  assert.equal(temForms(respondidas, "CPS_C26_DED_013", "452647357"), false);
});

test("consulta do ponto: rotas, sem rotas ou falha; linha sem rota nao vira rota", async () => {
  const { lerConsultasDosPontos, lerRotasDosPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["DATA", "ATUALIZADO_EM", "ID_PARADA", "CUSTOMER_ID", "ROUTE_ID", "ROUTE_NAME", "STATUS"];
  const linhas = [
    cab,
    ["2026-10-08", "08/10/2026 16:00:00", "A", "1", "9", "CAMPINAS_C29_51", "finished"],
    ["2026-10-08", "08/10/2026 17:30:00", "A", "1", "", "", "ERRO_HTTP_500"],
    ["2026-10-08", "08/10/2026 17:30:00", "B", "2", "", "", "SEM_ROTAS"],
    ["2026-10-08", "08/10/2026 17:30:00", "C", "3", "7", "CAMPINAS_C29_91", "pending"],
    ["2026-10-08", "08/10/2026 17:31:00", "D", "", "", "", "ERRO_SEM_CUSTOMER_ID"],
    ["2026-10-07", "07/10/2026 17:30:00", "E", "4", "8", "X", "pending"],
  ];
  const c = lerConsultasDosPontos(linhas, "08/10/2026");
  assert.deepEqual(c.A, { em: "08/10/2026 17:30:00", resultado: "erro", detalhe: "HTTP 500" });
  assert.equal(c.B.resultado, "semRotas");
  assert.equal(c.C.resultado, "rotas");
  assert.match(c.D.detalhe, /customerId/);
  assert.equal(c.E, undefined);
  assert.deepEqual(
    lerRotasDosPontos(linhas, "08/10/2026").map((r) => r.idParada + ":" + r.rota),
    ["A:CAMPINAS_C29_51", "C:CAMPINAS_C29_91"],
  );
});

test("desvio de forecast: 100+ pacotes alem da projecao da config (soma das paradas do ponto)", async () => {
  const { projecaoPorPonto, desvioDeForecast } = await import("../app/lib/monitorD0.ts");
  const projecao = projecaoPorPonto([
    { detalhe: [{ id: "849817033_47436", pacotes: 600 }, { id: "BRP5848297402", pacotes: 40 }] },
    { detalhe: [{ id: "849817033_47436", pacotes: 400 }] },
  ]);
  assert.deepEqual(projecao, { "849817033_47436": 1000, BRP5848297402: 40 });
  assert.deepEqual(desvioDeForecast(projecao, "849817033_47436", 1145), { tipo: "desvio", projetado: 1000, real: 1145, desvio: 145, deixadosAntes: null });
  assert.equal(desvioDeForecast(projecao, "849817033_47436", 1099), null);
  assert.deepEqual(desvioDeForecast(projecao, "BRP5848297402", 140), { tipo: "desvio", projetado: 40, real: 140, desvio: 100, deixadosAntes: null });

  assert.equal(desvioDeForecast(projecao, "849817033_47436", 1200, 100).tipo, "backlog");
  assert.equal(desvioDeForecast(projecao, "849817033_47436", 1200, 99).tipo, "desvio");
  assert.equal(desvioDeForecast(projecao, "849817033_47436", 1200, 0).tipo, "desvio");

  assert.equal(desvioDeForecast(projecao, "999", 5000), null);
});

test("historico do ponto: nao coletados do dia anterior (coluna nova, opcional)", async () => {
  const { lerHistoricoPontos } = await import("../app/lib/monitorD0.ts");
  const cab = ["PONTO", "DIAS", "ESTIMADOS", "COLETADOS", "NAO_COLETADOS", "DIAS_COM_PERDA", "ULTIMA_PERDA", "CULPA_PRINCIPAL", "INCIDENTE_PRINCIPAL"];
  const novo = lerHistoricoPontos([[...cab, "DIA_ANTERIOR", "NAO_COLETADOS_DIA_ANTERIOR"], ["A", "26", "1000", "900", "100", "5", "2026-10-08", "ME", "x", "2026-10-08", "130"]]);
  assert.equal(novo.get("A").naoColetadosDiaAnterior, 130);
  assert.equal(novo.get("A").diaAnterior, "2026-10-08");
  const antigo = lerHistoricoPontos([cab, ["A", "26", "1000", "900", "100", "5", "2026-10-08", "ME", "x"]]);
  assert.equal(antigo.get("A").naoColetadosDiaAnterior, null);
});

test("tipo: OC nao estao na agencia / nao estao preparados tem grupo proprio", () => {
  const vs = ler(
    { id: "A", est: 100, col: 40, motivo: "Não estão na agência", hora: "10:00", pont: "10:00hs - on_time", hs: "agree" },
    { id: "B", est: 100, col: 40, motivo: "Não os tem preparados", hora: "10:00", pont: "10:00hs - on_time", hs: "agree" },
    { id: "C", est: 100, col: 40, motivo: "Coleta parcial", hora: "10:00", pont: "10:00hs - on_time", hs: "agree" },
  );
  const tipos = Object.fromEntries(ocorrenciasDoDia(vs).map((o) => [o.visita.idParada, o.tipo]));
  assert.equal(tipos.A, "Não preparados / agência");
  assert.equal(tipos.B, "Não preparados / agência");
  assert.equal(tipos.C, "Coleta parcial");
});

test("biblioteca de ocorrencias: 2.4 Otros, 11.2 Direccion nueva e nada coletado vira Sin Paquetes", () => {
  const [acidente, endereco, naoPrepZero, placeZero, naoPrepZeroCedo] = ler(
    { motivo: "Sofri um acidente", col: 0, pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "Endereço incorreto", col: 0, pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "O vendedor não os tem preparados", col: 0, pont: "10:00hs - on_time", hora: "10:00", hs: "agree" },
    { id: "111_9", motivo: "Coleta Parcial", col: 0, naoPrep: 100, pont: "10:00hs - on_time", hora: "10:00" },
    { motivo: "O vendedor não os tem preparados", col: 0, pont: "07:50hs - early", hora: "07:50" },
  );
  assert.equal(culpaPrevia(acidente).incidente, "2.4 Otros");
  assert.equal(culpaPrevia(endereco).incidente, "11.2 Dirección nueva");
  assert.deepEqual(culpaPrevia(naoPrepZero), { culpa: "SELLER", categoria: "4. Sin Paquetes", incidente: "4.8 Not prepared by seller" });
  assert.deepEqual(culpaPrevia(placeZero), { culpa: "PLACE", categoria: "4. Sin Paquetes", incidente: "4.11 Not delivered by place" });
  assert.equal(culpaPrevia(naoPrepZeroCedo).incidente, "4.4 Pickup Early");
  assert.equal(culpaPrevia(naoPrepZeroCedo).culpa, "ME");
});

test("biblioteca: mal estado - recusou tudo no horario com handshake e 12.6, parcial e 7.1", () => {
  const [tudo, parcial] = ler(
    { motivo: "Pacote em mau estado", col: 0, pont: "10:00hs - on_time", hora: "10:00", hs: "agree" },
    { motivo: "Pacote em mau estado", col: 40, pont: "10:00hs - on_time", hora: "10:00", hs: "agree" },
  );
  assert.equal(culpaPrevia(tudo).incidente, "12.6 Paquetes o etiquetas están en mal estado On time con HS");
  assert.equal(culpaPrevia(tudo).culpa, "SELLER");
  assert.equal(culpaPrevia(parcial).incidente, "7.1 Paquete o etiqueta en mal estado");
});

test("ponto so de avulsa pega o cluster do plano ou da base da Formulas", () => {
  const vs = lerVisitas(
    [CAB, linha({ rotaId: "457364461", rota: "", id: "849817033_33018" }), linha({ rotaId: "9", rota: "", id: "777" })],
    "07/10/2026",
  );
  assert.equal(clusterDaVisita(vs[0], vs), "Sem cluster");
  const base = new Map([
    ["C12_040", new Set(["849817033_33018"])],
    ["C07_010", new Set(["777"])],
  ]);

  const porPonto = clusterDosPontos([{ rota: "CAMPINAS_C09_6", idParada: "849817033_33018" }], base);
  assert.equal(clusterDaVisita(vs[0], vs, porPonto), "C09");
  assert.equal(clusterDaVisita(vs[1], vs, porPonto), "C07");
});
