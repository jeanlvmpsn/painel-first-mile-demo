import { test } from "node:test";
import assert from "node:assert/strict";
import { conciliar, resumir } from "../app/lib/ponte.ts";

const DIA = "08/09/2026";
const OUTRO_DIA = "09/09/2026";

const partes = (zona) => {
  const p = String(zona).trim().split("_");
  return { cluster: p[0] ?? "", hub: p[1] ?? "" };
};
const rota = (rota, zona, perfil, transportadora = "", data = DIA) => ({
  data, rota, perfil, transportadora, ...partes(zona),
});
const pedido = (transportadora, zona, perfil, situacao, data = DIA) => ({
  data, transportadora, perfil, situacao, ...partes(zona),
});

test("1 orfa + 1 recusa no mesmo balde: aponta a transportadora", () => {
  const r = conciliar(
    [rota("CPS_R01", "C09_CPS", "VUC Fixo")],
    [pedido("BRAVO LOGÍSTICA", "C09_CPS", "VUC Fixo", "recusa")],
    DIA,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].veredito, "certa");
  assert.equal(r[0].responsavel, "BRAVO LOGÍSTICA");
  assert.deepEqual(r[0].rotasOrfas, ["CPS_R01"]);
});

test("perfil parecido NAO casa: 'Vuc' nao e 'VUC Fixo'", () => {
  const r = conciliar(
    [rota("CPS_R02", "C09_CPS", "VUC Fixo")],
    [pedido("Alfa Logistics", "C09_CPS", "Vuc", "recusa")],
    DIA,
  );
  assert.equal(r[0].veredito, "semPedido");
  assert.equal(r[0].responsavel, null);
});

test("zona diferente NAO casa, mesmo com perfil igual", () => {
  const r = conciliar(
    [rota("CPS_R03", "C09_CPS", "Médio")],
    [pedido("ZETA", "C10_CPS", "Médio", "recusa")],
    DIA,
  );
  assert.equal(r[0].veredito, "semPedido");
});

test("sabado: o sufixo _SABADO nao impede o casamento", () => {
  const r = conciliar(
    [rota("SAB_R01", "C01_BRXSP5", "Médio")],
    [pedido("Alfa Logistics", "C01_BRXSP5_SABADO", "Médio", "recusa")],
    DIA,
  );
  assert.equal(r[0].veredito, "certa");
  assert.equal(r[0].responsavel, "Alfa Logistics");
  assert.equal(r[0].hub, "BRXSP5");
});

test("HUB diferente NAO casa, mesmo com cluster e perfil iguais", () => {
  const r = conciliar(
    [rota("SAB_R02", "C01_CPS", "Médio")],
    [pedido("ZETA", "C01_BRXSP5_SABADO", "Médio", "recusa")],
    DIA,
  );
  assert.equal(r[0].veredito, "semPedido");
});

test("outra data NAO casa", () => {
  const r = conciliar(
    [rota("CPS_R04", "C11_CPS", "Toco")],
    [pedido("ORION", "C11_CPS", "Toco", "recusa", OUTRO_DIA)],
    DIA,
  );
  assert.equal(r[0].veredito, "semPedido");
});

test("2 orfas e 2 recusas da MESMA transportadora: ainda aponta", () => {
  const r = conciliar(
    [rota("CPS_R06", "C12_CPS", "Van"), rota("CPS_R05", "C12_CPS", "Van")],
    [
      pedido("JM Transportes", "C12_CPS", "Van", "recusa"),
      pedido("JM Transportes", "C12_CPS", "Van", "recusa"),
    ],
    DIA,
  );
  assert.equal(r[0].veredito, "certa");
  assert.equal(r[0].responsavel, "JM Transportes");
  assert.deepEqual(r[0].rotasOrfas, ["CPS_R05", "CPS_R06"], "ordenadas");
});

test("2 transportadoras no mesmo balde: fica AMBIGUA, nao sorteia", () => {
  const r = conciliar(
    [rota("CPS_R07", "C13_CPS", "Truck"), rota("CPS_R08", "C13_CPS", "Truck")],
    [
      pedido("ZETA", "C13_CPS", "Truck", "recusa"),
      pedido("ORION", "C13_CPS", "Truck", "semResposta"),
    ],
    DIA,
  );
  assert.equal(r[0].veredito, "ambigua");
  assert.equal(r[0].responsavel, null, "nao pode escolher um dos dois");
  assert.equal(r[0].culpados.length, 2);
});

test("cancelamento NAO culpa a transportadora", () => {
  const r = conciliar(
    [rota("CPS_R09", "C14_CPS", "Carreta")],
    [pedido("Alfa Logistics", "C14_CPS", "Carreta", "cancelado")],
    DIA,
  );
  assert.equal(r[0].veredito, "semPedido");
  assert.equal(r[0].responsavel, null);
});

test("aceite tambem nao culpa ninguem", () => {
  const r = conciliar(
    [rota("CPS_R10", "C15_CPS", "HR")],
    [pedido("KAPPA", "C15_CPS", "HR", "aceite")],
    DIA,
  );
  assert.equal(r[0].veredito, "semPedido");
});

test("sem resposta tambem responsabiliza", () => {
  const r = conciliar(
    [rota("CPS_R11", "C16_CPS", "Médio")],
    [pedido("SIGMATRANSP", "C16_CPS", "Médio", "semResposta")],
    DIA,
  );
  assert.equal(r[0].veredito, "certa");
  assert.equal(r[0].responsavel, "SIGMATRANSP");
  assert.equal(r[0].culpados[0].semResposta, 1);
});

test("rota COM transportadora nao aparece, mesmo com recusa no balde", () => {
  const r = conciliar(
    [rota("CPS_R12", "C17_CPS", "Van", "Alfa Logistics")],
    [pedido("ZETA", "C17_CPS", "Van", "recusa")],
    DIA,
  );
  assert.deepEqual(r, [], "replan funcionou; nao e problema");
});

test("caixa e espaco nao atrapalham o casamento", () => {
  const r = conciliar(
    [rota("CPS_R13", " c18_cps ", " vuc fixo ")],
    [pedido("RotaCoop", "C18_CPS", "VUC Fixo", "recusa")],
    DIA,
  );
  assert.equal(r[0].veredito, "certa");
  assert.equal(r[0].responsavel, "RotaCoop");
});

test("cena inteira: conta certo e ordena pelo tamanho do estrago", () => {
  const rotas = [
    rota("A1", "C20_CPS", "Médio"), rota("A2", "C20_CPS", "Médio"), rota("A3", "C20_CPS", "Médio"),
    rota("B1", "C21_CPS", "Van"),
    rota("C1", "C22_CPS", "Toco"),
    rota("D1", "C23_CPS", "Truck"),
    rota("OK1", "C24_CPS", "Van", "ORION"),
  ];
  const pedidos = [
    pedido("Alfa Logistics", "C20_CPS", "Médio", "recusa"),
    pedido("Alfa Logistics", "C20_CPS", "Médio", "recusa"),
    pedido("ZETA", "C21_CPS", "Van", "recusa"),
    pedido("ORION", "C21_CPS", "Van", "recusa"),
    pedido("BRAVO LOGÍSTICA", "C22_CPS", "Toco", "semResposta"),

    pedido("ORION", "C24_CPS", "Van", "aceite"),
  ];
  const r = conciliar(rotas, pedidos, DIA);
  assert.equal(r.length, 4, "4 baldes com orfa; a rota com TP fica de fora");
  assert.equal(r[0].cluster, "C20", "o balde de 3 orfas vem primeiro");

  const resumo = resumir(r);
  assert.deepEqual(resumo, {
    baldes: 4, rotasOrfas: 6, comResponsavel: 2, ambiguos: 1, semPedido: 1,
  });
});
