// Abas do H&B (pontos de pacote grande): lista curada, paradas H&B dos
// ultimos dias e o PU oficial (fecha D-1).
import type { Celula } from "./planilhaFalsa";
import type { Registro } from "./gerador";
import { br, diasAnteriores, hhmm, hojeISO, pontos, rng } from "./mundo";
import { etaDaRota, rotasCps } from "./abasOperacao";
import { carimbo, carimboAgora, HB, PRINCIPAL, PROCESSO } from "./util";

const pontosHB = () => pontos().filter((p) => p.hb);

// Lista curada: o time mantem a mao (alguns H&B ainda nao entraram).
function listaCurada(): Celula[][] {
  const linhas: Celula[][] = [["ID", "NOME", "ROTULO"]];
  for (const p of pontosHB()) {
    if (rng("curada" + p.id).chance(0.15)) continue;
    linhas.push([p.id, p.nome, p.nome.replace(/^Agência /, "")]);
  }
  return linhas;
}

function hbParadas(): Celula[][] {
  const linhas: Celula[][] = [["ID_PARADA", "SELLER_ID", "SELLER", "PACOTES_HB", "OVERSIZE", "DIAS_COM_HB", "ULTIMO_DIA", "ATUALIZADO_EM"]];
  const dias = diasAnteriores(hojeISO(), 14);
  const em = carimbo(hojeISO(), 6 * 60 + 5);
  for (const p of pontosHB()) {
    let pacotes = 0;
    let comHb = 0;
    let ultimo = "";
    for (const iso of dias) {
      for (const r of rotasCps(iso)) {
        for (const pa of r.paradas) {
          if (pa.ponto.id !== p.id || r.avulsa) continue;
          const hb = Math.max(1, Math.round(pa.estimados * 0.35));
          pacotes += hb;
          comHb++;
          ultimo = iso;
        }
      }
    }
    if (!comHb) continue;
    linhas.push([p.id, p.sellerId, p.nome, pacotes, Math.round(pacotes * 0.18), comHb, ultimo, em]);
  }
  return linhas;
}

function puOficial(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "KPI_ID", "NUMERADOR", "DENOMINADOR"]];
  for (const iso of diasAnteriores(hojeISO(), 30)) {
    let est = 0;
    let col = 0;
    for (const r of rotasCps(iso)) {
      if (r.avulsa) continue;
      for (const pa of r.paradas) {
        if (!pa.ponto.hb) continue;
        const hb = Math.max(1, Math.round(pa.estimados * 0.35));
        est += hb;
        col += r.ns ? 0 : Math.round(hb * (pa.coletados / Math.max(1, pa.estimados)));
      }
    }
    if (est) linhas.push([iso, "PU-HB", Math.min(est, Math.round(col * 1.01)), est]);
  }
  return linhas;
}

function configEta(): Celula[][] {
  const linhas: Celula[][] = [["DATA", "NOME_ROTA", "ETA", "ATUALIZADO_EM"]];
  const iso = hojeISO();
  for (const r of rotasCps(iso)) {
    if (r.avulsa || !r.paradas.some((p) => p.ponto.hb)) continue;
    linhas.push([br(iso), r.nome, hhmm(etaDaRota(r)), carimboAgora(25)]);
  }
  return linhas;
}

export const ABAS_HB: Registro = {
  [HB]: { "H&B": listaCurada },
  [PROCESSO]: { HB_PARADAS: hbParadas, HB_PU_OFICIAL: puOficial },
  [PRINCIPAL]: { CONFIG_ETA: configEta },
};
