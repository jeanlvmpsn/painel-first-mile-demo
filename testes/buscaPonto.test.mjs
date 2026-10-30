import assert from "node:assert/strict";
import { test } from "node:test";

import { acharPontos, buscarPonto } from "../app/lib/buscaPonto.ts";
import { lerVisitas } from "../app/lib/monitorD0.ts";

const CAB = [
  "ID do Rota", "Nome da Rota", "ID de Parada", "Parada", "Pacotes estimados", "Pacotes preparados",
  "Pacotes coletados", "Motivo", "Pacotes não preparados/Não estão na agência", "Pacotes não cabem no veículo",
  "Fora de área", "Planejado", "Data da rota", "Pontualidade", "Transportadora", "Hora de coleta concluída",
  "Conformidade Handshake", "Horários",
];
const linha = (o) => [
  o.rotaId ?? "1", o.rota ?? "CAMPINAS_C04_102", o.id ?? "849817033_26126", o.nome ?? "PEREIRA GAS", String(o.est ?? 100),
  String(o.est ?? 100), String(o.col ?? 0), o.motivo ?? "", "0", String(o.naoCabem ?? 0),
  "Não", "Sim", "21-10-2026", o.pont ?? "", "Alfa", o.hora ?? "", "", o.janela ?? "",
];
const visitas = lerVisitas(
  [
    CAB,
    linha({ rotaId: "2", rota: "CAMPINAS_C04_346", est: 804, col: 293, motivo: "Não tenho mais espaço", naoCabem: 511, pont: "13:10hs - on_time", hora: "13:10", janela: "12:45 a 14:45 hs" }),
    linha({ rotaId: "1", rota: "CAMPINAS_C04_354", est: 565, col: 0, motivo: "Tive um problema mecânico", pont: "11:40hs - late", hora: "11:40", janela: "11:00 a 13:00 hs" }),
    linha({ rotaId: "3", rota: "CAMPINAS_C04_134", est: 669, col: 669, pont: "14:20hs - on_time", hora: "14:20", janela: "13:00 a 15:00 hs" }),
    linha({ rotaId: "9", rota: "CAMPINAS_C09_1", id: "849817033_23024", nome: "MORAES AUTO CENTER" }),
  ],
  "21/10/2026",
);
const rotasPontos = [
  { idParada: "849817033_26126", rotaId: "4", rota: "Avulsa 4", status: "pending", preparados: 928, coletados: 0, restantes: 928, transportadora: "Alfa", veiculo: "", janela: "16:20 a 18:20", atualizadoEm: "" },

  { idParada: "849817033_26126", rotaId: "2", rota: "CAMPINAS_C04_346", status: "finished", preparados: 804, coletados: 293, restantes: 511, transportadora: "Alfa", veiculo: "", janela: "12:45 a 14:45", atualizadoEm: "" },
];
const plano = [
  { rota: "CAMPINAS_C04_348", idParada: "849817033_26126", inicio: "17:00" },
  { rota: "CAMPINAS_C04_134", idParada: "849817033_26126", inicio: "13:00" },
];
const f = { visitas, rotasPontos, plano };

test("busca por ponto: rotas do dia com OC e hora, da mais cedo para a mais tarde", () => {
  const r = buscarPonto("849817033_26126", f);
  assert.equal(r.nome, "PEREIRA GAS");
  assert.deepEqual(
    r.passagens.map((p) => [p.hora, p.rota, p.oc, p.situacao, p.fonte]),
    [
      ["11:40", "CAMPINAS_C04_354", "Tive um problema mecânico", "passou", "relatorio"],
      ["13:10", "CAMPINAS_C04_346", "Não tenho mais espaço", "passou", "relatorio"],
      ["14:20", "CAMPINAS_C04_134", "", "passou", "relatorio"],
      ["", "Avulsa 4", "", "semInicio", "monitoramento"],
      ["", "CAMPINAS_C04_348", "", "semInicio", "plano"],
    ],
  );
  assert.equal(r.passagens[0].culpa?.culpa, "ME");
});

test("busca por ponto: ID exato, parte do ID ou nome", () => {
  assert.deepEqual(acharPontos("849817033_26126", f), [{ id: "849817033_26126", nome: "PEREIRA GAS" }]);
  assert.deepEqual(acharPontos("moraes", f).map((a) => a.id), ["849817033_23024"]);
  assert.deepEqual(acharPontos("849817033", f).map((a) => a.nome), ["MORAES AUTO CENTER", "PEREIRA GAS"]);
  assert.deepEqual(acharPontos("", f), []);
});
