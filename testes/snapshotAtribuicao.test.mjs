import assert from "node:assert/strict";
import { test } from "node:test";

import { completarSnapshot } from "../app/lib/snapshotAtribuicao.ts";

const viva = (rota, placa, extra = {}) => ({ rota, start: "08:00", transportadora: "Alfa Logistics", placa, ...extra });
const hist = (data, rota, placa, extra = []) => [data, rota, "08:00", "Alfa Logistics", placa, "", "", "", "", ...extra];

test("snapshot: placa que chegou depois do snapshot entra no historico", () => {
  const historico = [
    hist("29/09/2026", "CPS_C11_DED_047", "NÃO ATRIBUIDO"),
    hist("29/09/2026", "CPS_C05_DED_022", "OMM6I86"),
    hist("28/09/2026", "CPS_C11_DED_047", "NÃO ATRIBUIDO"),
  ];
  const vivas = [
    viva("CPS_C11_DED_047", "ABC1D23", { motorista: "FULANO", perfil: "Carreta", veiculo: "Carreta" }),
    viva("CPS_C05_DED_022", "OMM6I86"),
  ];
  const { atualizacoes, novas } = completarSnapshot(historico, vivas, "29/09/2026");
  assert.equal(novas.length, 0);

  assert.deepEqual(atualizacoes.map((a) => a.indice), [0]);
  const v = atualizacoes[0].valores;
  assert.equal(v[0], "29/09/2026");
  assert.equal(v[4], "ABC1D23");
  assert.equal(v[6], "FULANO");
  assert.equal(v[9], "Carreta");
  assert.equal(v[10], "Carreta");
});

test("snapshot: 'nao atribuido' posterior nao apaga placa gravada; vazio da viva mantem o gravado", () => {
  const historico = [hist("29/09/2026", "CPS_C11_DED_049", "TJD3H78", ["Toco", "Toco"])];
  const { atualizacoes } = completarSnapshot(historico, [viva("cps_c11_ded_049 ", "NAO ATRIBUIDO")], "29/09/2026");
  assert.equal(atualizacoes.length, 0);
});

test("snapshot: rota que entrou depois vira linha nova do mesmo dia", () => {
  const historico = [hist("29/09/2026", "CPS_C12_DED_050", "NÃO ATRIBUIDO")];
  const { novas } = completarSnapshot(
    historico,
    [viva("CPS_C12_DED_050", "NÃO ATRIBUIDO"), viva("CPS_C12_DED_099", "XYZ9K88")],
    "29/09/2026",
  );
  assert.deepEqual(novas.map((l) => [l[0], l[1], l[4]]), [["29/09/2026", "CPS_C12_DED_099", "XYZ9K88"]]);
});
