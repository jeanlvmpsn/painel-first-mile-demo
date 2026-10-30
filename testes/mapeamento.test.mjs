import assert from "node:assert/strict";
import { test } from "node:test";

import { inicioDaJanela, mapearPontos } from "../app/lib/mapeamento.ts";

const num = (edpu) => ({ edpu, backlog: 0, early: 0 });
const ponto = (id, nome, est, prep, col) => ({
  customerId: "", entidade: id, tipo: "place", nome, estimado: num(est), preparado: num(prep), coletado: num(col), atualizadoEm: "15/10/2026 13:10:00",
});
const rotaApi = (idParada, rota, rotaId, janela, status = "pending", veiculo = "Médio") => ({
  idParada, rotaId, rota, status, preparados: 0, coletados: 0, restantes: 0, transportadora: "Alfa", veiculo, janela, atualizadoEm: "",
});
const base = (extra = {}) => ({ plano: [], rotasConfig: [], rotasPontos: [], visitas: [], agoraMin: 13 * 60 + 16, ...extra });

test("mapeamento: janela", () => {
  assert.equal(inicioDaJanela("13:00 a 15:00"), 780);
  assert.equal(inicioDaJanela("9:30"), 570);
  assert.equal(inicioDaJanela(""), null);
});

test("mapeamento: caso Costa - as proximas levam o preparado, sobra para a ultima", () => {
  const r = mapearPontos(
    base({
      monitoring: [ponto("849817033_22435", "PET CENTRO CENTER", 1791, 804, 0)],
      rotasPontos: [
        rotaApi("849817033_22435", "CAMPINAS_C31_100", "1", "13:00 a 15:00"),
        rotaApi("849817033_22435", "CAMPINAS_C31_200", "2", "14:00 a 16:00"),
        rotaApi("849817033_22435", "CAMPINAS_C31_300", "3", "16:00 a 18:00", "pending", "Toco"),
      ],
      rotasConfig: [{ rota: "CAMPINAS_C31_300", veiculo: "Toco", transportadora: "Alfa", uso: 0.5 }],
    }),
  );
  assert.equal(r.length, 1);
  const p = r[0];
  assert.equal(p.sobra, 987);
  assert.equal(p.risco, "medio");
  assert.equal(p.cluster, "C31");
  assert.deepEqual(p.rotas.map((x) => [x.rota, x.proxima, x.recebe]), [
    ["CAMPINAS_C31_100", true, false],
    ["CAMPINAS_C31_200", true, false],
    ["CAMPINAS_C31_300", false, true],
  ]);
  assert.match(p.motivo, /sobram 987 pcts para a CAMPINAS_C31_300 \(16:00\)/);
});

test("mapeamento: rota que recebe cheia ou com outro ponto em risco vira alto", () => {
  const rotas = (id) => [rotaApi(id, "CAMPINAS_C31_100", "1", "13:00 a 15:00"), rotaApi(id, "CAMPINAS_C31_300", "3", "16:00 a 18:00")];
  const cheia = mapearPontos(
    base({
      monitoring: [ponto("A", "A", 1000, 300, 0)],
      rotasPontos: rotas("A"),
      rotasConfig: [{ rota: "CAMPINAS_C31_300", veiculo: "Toco", transportadora: "", uso: 0.93 }],
    }),
  );
  assert.equal(cheia[0].risco, "alto");
  assert.match(cheia[0].motivo, /93% da capacidade/);
  const cascata = mapearPontos(base({ monitoring: [ponto("A", "A", 1000, 300, 0), ponto("B", "B", 900, 100, 0)], rotasPontos: [...rotas("A"), ...rotas("B")] }));
  assert.deepEqual(cascata.map((p) => [p.id, p.risco]), [["B", "alto"], ["A", "alto"]]);
  assert.deepEqual(cascata[0].rotas[1].outros, [{ id: "A", nome: "A", sobra: 700 }]);
});

test("mapeamento: sem rota depois, sem rota a passar, e quem nao entra", () => {
  const semDepois = mapearPontos(base({ monitoring: [ponto("A", "A", 800, 200, 0)], rotasPontos: [rotaApi("A", "CAMPINAS_C08_1", "1", "14:00 a 16:00")] }));
  assert.equal(semDepois[0].risco, "alto");
  assert.equal(semDepois[0].sobra, 600);

  const passou = mapearPontos(
    base({ monitoring: [ponto("A", "A", 800, 800, 500)], plano: [{ rota: "CAMPINAS_C08_1", idParada: "A", inicio: "08:00" }], visitas: [{ rota: "CAMPINAS_C08_1", rotaId: "", idParada: "A", visitada: true, coletados: 500 }] }),
  );
  assert.equal(passou[0].risco, "alto");
  assert.equal(passou[0].sobra, 300);

  assert.equal(passou[0].rotas[0].coletados, 500);

  const tarde = mapearPontos(base({ monitoring: [ponto("A", "A", 800, 0, 0)], rotasPontos: [rotaApi("A", "CAMPINAS_C08_1", "1", "16:30 a 18:00")] }));
  assert.equal(tarde[0].risco, "sem");
  assert.equal(tarde[0].sobra, 0);
  assert.match(tarde[0].motivo, /16:30, depois das próximas 2h/);

  const preparado = mapearPontos(base({ monitoring: [ponto("A", "A", 800, 700, 0)], rotasPontos: [rotaApi("A", "CAMPINAS_C08_1", "1", "13:00 a 15:00"), rotaApi("A", "CAMPINAS_C08_2", "2", "17:00 a 19:00")] }));
  assert.equal(preparado[0].risco, "sem");
  assert.ok(preparado[0].rotas.every((r) => !r.recebe));

  assert.equal(mapearPontos(base({ monitoring: [ponto("A", "A", 800, 700, 700)], rotasPontos: [rotaApi("A", "CAMPINAS_C08_1", "1", "13:00 a 15:00")] })).length, 0);

  const plano = mapearPontos(base({ monitoring: [ponto("A", "A", 800, 100, 0)], plano: [{ rota: "CAMPINAS_C08_1", idParada: "A", inicio: "14:00" }, { rota: "CAMPINAS_C08_2", idParada: "A", inicio: "17:00" }] }));
  assert.equal(plano[0].rotas[0].janela, "início 14:00");
  assert.equal(plano[0].rotas[1].recebe, true);
});

test("mapeamento: tipo da rota (prog, apoio, avulsa), restante e apoio que so esta no relatorio", () => {
  const api = (rota, rotaId, janela, restantes) => ({ ...rotaApi("A", rota, rotaId, janela), restantes });
  const r = mapearPontos(
    base({
      monitoring: [ponto("A", "A", 1900, 892, 518)],
      plano: [
        { rota: "CAMPINAS_C31_460", idParada: "A", inicio: "13:00" },
        { rota: "CAMPINAS_C31_230", idParada: "A", inicio: "16:00" },
      ],
      rotasPontos: [
        api("CAMPINAS_C31_460", "1", "13:00 a 15:00", 403),
        api("CAMPINAS_C31_237", "2", "14:00 a 16:00", 550),
        api("Avulsa 9", "9", "14:30 a 15:30", 892),
        api("CAMPINAS_C31_230", "3", "16:00 a 18:00", 892),
      ],
      visitas: [
        { rota: "CAMPINAS_C31_999", rotaId: "4", rotaSemNome: false, idParada: "A", visitada: false, coletados: 0, janela: "15:20 a 17:20 hs", transportadora: "Alfa", planejado: "Não" },
        { rota: "CAMPINAS_C31_237", rotaId: "2", rotaSemNome: false, idParada: "A", visitada: true, coletados: 250, janela: "", transportadora: "", planejado: "Não" },
      ],
    }),
  );
  const rotas = Object.fromEntries(r[0].rotas.map((x) => [x.rota, x]));
  assert.equal(rotas["CAMPINAS_C31_460"].tipo, "prog");
  assert.equal(rotas["CAMPINAS_C31_237"].tipo, "apoio");
  assert.equal(rotas["Avulsa 9"].tipo, "avulsa");
  assert.equal(rotas["CAMPINAS_C31_999"].tipo, "apoio");
  assert.equal(rotas["CAMPINAS_C31_999"].janela, "15:20 a 17:20");
  assert.equal(rotas["CAMPINAS_C31_460"].restantes, 403);
  assert.equal(rotas["CAMPINAS_C31_999"].restantes, null);
  assert.equal(r[0].rotas.length, 5);
});

test("mapeamento: carga atual da rota soma o coletado em todas as paradas dela", () => {
  const r = mapearPontos(
    base({
      monitoring: [ponto("A", "A", 1274, 579, 285)],
      rotasPontos: [rotaApi("A", "CAMPINAS_C04_438", "8", "15:20 a 17:20"), rotaApi("A", "CAMPINAS_C04_432", "9", "16:00 a 18:00")],
      plano: [{ rota: "CAMPINAS_C04_432", idParada: "A", inicio: "16:00" }],
      agoraMin: 15 * 60,
      visitas: [
        { rota: "CAMPINAS_C04_438", rotaId: "8", rotaSemNome: false, idParada: "X", visitada: true, coletados: 120, janela: "", transportadora: "", planejado: "Sim" },
        { rota: "CAMPINAS_C04_438", rotaId: "8", rotaSemNome: false, idParada: "Y", visitada: true, coletados: 80, janela: "", transportadora: "", planejado: "Sim" },
        { rota: "CAMPINAS_C04_432", rotaId: "", rotaSemNome: false, idParada: "Z", visitada: true, coletados: 40, janela: "", transportadora: "", planejado: "Sim" },
      ],
    }),
  );
  const rotas = Object.fromEntries(r[0].rotas.map((x) => [x.rota, x]));
  assert.equal(rotas["CAMPINAS_C04_438"].coletadoNaRota, 200);
  assert.equal(rotas["CAMPINAS_C04_432"].coletadoNaRota, 40);
});

test("mapeamento: caso MotoLoja - canceladas, passagens da mesma rota e status da tela", () => {
  const api = (rota, rotaId, janela, status, coletados, veiculo) => ({ ...rotaApi("A", rota, rotaId, janela, status, veiculo), coletados });
  const r = mapearPontos(
    base({
      agoraMin: 16 * 60 + 54,
      monitoring: [ponto("A", "MotoLoja", 1209, 954, 320)],
      rotasPontos: [
        api("CAMPINAS_C27_69", "1", "09:00 a 11:00", "cancelled", 0, "ETU8J08 | Toco"),
        api("CAMPINAS_C27_88", "2", "11:15 a 11:45", "cancelled", 0, "BWO2A65 | Médio"),
        api("CAMPINAS_C27_122", "3", "12:00 a 12:30", "cancelled", 0, "JBJ5D73 | Médio"),
        api("CAMPINAS_C27_121", "4", "12:20 a 14:00", "finished", 344, "DUD5D32 | Médio"),
        api("CAMPINAS_C27_93", "5", "13:10 a 15:10", "pending", 0, "BWO2A65 | Médio"),
        api("CAMPINAS_C27_120", "6", "14:35 a 15:05", "cancelled", 0, "FYM7E36 | Toco"),
        api("CAMPINAS_C27_93", "5", "14:50 a 17:00", "pending", 0, "BWO2A65 | Médio"),
        api("CAMPINAS_C27_121", "4", "16:49 a 18:49", "pending", 0, "DUD5D32 | Médio"),
      ],
      plano: [
        { rota: "CAMPINAS_C27_69", idParada: "A", inicio: "09:00" },
        { rota: "CAMPINAS_C27_122", idParada: "A", inicio: "12:00" },
        { rota: "CAMPINAS_C27_120", idParada: "A", inicio: "14:35" },
      ],

      visitas: [{ rota: "CAMPINAS_C27_93", rotaId: "5", rotaSemNome: false, idParada: "A", visitada: true, coletados: 0, janela: "", transportadora: "", planejado: "Sim" }],
    }),
  );
  assert.equal(r.length, 1);
  const p = r[0];
  assert.equal(p.rotas.length, 8);
  assert.equal(p.rotas.filter((x) => x.cancelada).length, 4);
  assert.deepEqual(
    p.rotas.filter((x) => !x.passou && !x.cancelada).map((x) => x.janela),
    ["13:10 a 15:10", "14:50 a 17:00", "16:49 a 18:49"],
  );
  assert.ok(p.rotas.every((x) => x.veiculo.includes("|")));
  assert.doesNotMatch(p.motivo, /Sem rota a passar/);
});

test("mapeamento: ponto sem risco nao conta como outro ponto em risco da rota", () => {
  const rotas = (id) => [rotaApi(id, "CAMPINAS_C31_100", "1", "13:00 a 15:00"), rotaApi(id, "CAMPINAS_C31_300", "3", "16:00 a 18:00")];
  const r = mapearPontos(base({ monitoring: [ponto("A", "A", 1000, 300, 0), ponto("B", "B", 600, 600, 0)], rotasPontos: [...rotas("A"), ...rotas("B")] }));
  const a = r.find((p) => p.id === "A");
  const b = r.find((p) => p.id === "B");
  assert.equal(a.risco, "medio");
  assert.equal(b.risco, "sem");
  assert.deepEqual(a.rotas.find((x) => x.recebe).outros, []);
  assert.deepEqual(r.map((p) => p.id), ["A", "B"]);
});

test("mapeamento: hora da ultima consulta das rotas do ponto", () => {
  const [p] = mapearPontos(
    base({
      monitoring: [ponto("849817033_340850", "BETANI", 1151, 1208, 1)],
      rotasPontos: [
        { ...rotaApi("849817033_340850", "CPS_C24_DED_16", "1", "12:00 a 14:00", "canceled"), atualizadoEm: "20/10/2026 11:02:10" },
        { ...rotaApi("849817033_340850", "CPS_C24_DED_15", "2", "15:00 a 17:00"), atualizadoEm: "20/10/2026 11:02:10" },
      ],
    }),
  );
  assert.equal(p.rotasConsultadasEm, "20/10/2026 11:02:10");
  const [semConsulta] = mapearPontos(base({ monitoring: [ponto("849817033_340850", "BETANI", 1151, 1208, 1)] }));
  assert.equal(semConsulta.rotasConsultadasEm, "");
});
