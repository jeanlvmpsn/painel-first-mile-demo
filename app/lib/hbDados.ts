import {
  getAtribuicaoDoDia,
  getParadasDoDia,
  getSheetsClient,
  SPREADSHEET_ID,
} from "./sheets";
import {
  diagnosticarRota,
  montarHB,
  montarListaHB,
  mapaDePontos,
  paradasPlanejadas,
  rotasDoDia,
  resumoHB,
  texto,
  type LinhaHB,
  type ParadaHB,
  type SellerHB,
} from "./hb";
import { temPlaca } from "./melione";
import { estimadoDoId, indexarMonitoring } from "./monitoringSeller";
import { getMonitoringSeller } from "./monitoringSellerDados";
import { consultarParada, type ResultadoParada } from "./consultaParada";
import { lerParadasHB } from "./hbFechamento";
import { PROCESSO_ID } from "./upgradeDados";

export const HB_SPREADSHEET_ID = "demo-hb";
const ABA_LISTA = "H&B";

const ABA_ETA = "CONFIG_ETA";

async function lerFaixa(
  planilha: string,
  faixa: string,
  cru = false,
): Promise<string[][]> {
  const sheets = getSheetsClient();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: planilha,
    range: faixa,
    ...(cru ? { valueRenderOption: "UNFORMATTED_VALUE" } : {}),
  });
  const linhas = (r.data.values ?? []) as unknown[][];
  return linhas.map((l) => (l ?? []).map((v) => String(v ?? "")));
}

const ABA_EXTRACAO = "Extração Config";

const ABA_FORMULAS = "Formulas";

export type LeituraHB = {
  dataBR: string;
  linhas: LinhaHB[];
  resumo: { rotas: number; sellers: number; estimados: number };
  totalSellers: number;
  atualizadoEta: string;

  aviso: string;
  erro: string | null;

  diagnostico: string[];

  atualizadoMonitoring: string;
};

export type ListaHB = "curada" | "completa";

async function listaCompletaHB(): Promise<Map<string, SellerHB>> {
  const { paradas } = lerParadasHB(await lerFaixa(PROCESSO_ID, "HB_PARADAS!A:Z", true));
  const mapa = new Map<string, SellerHB>();
  for (const p of paradas.values()) {
    const nome = p.seller || p.sellerId || p.id;
    mapa.set(p.id, { id: p.id, nome, rotulo: nome });
  }
  return mapa;
}

export async function lerHBDoDia(
  dataBR: string,
  rotaDiagnostico = "",
  sellerDiagnostico = "",
  lista: ListaHB = "curada",
): Promise<LeituraHB> {
  const vazio: LeituraHB = {
    dataBR,
    linhas: [],
    resumo: { rotas: 0, sellers: 0, estimados: 0 },
    totalSellers: 0,
    atualizadoEta: "",
    aviso: "",
    erro: null,
    diagnostico: [],
    atualizadoMonitoring: "",
  };

  try {
    const [paradas, atribuidas, listaCurada, eta, extracao, formulas, monitoring, completa] = await Promise.all([
      getParadasDoDia(dataBR),
      getAtribuicaoDoDia(),

      lerFaixa(HB_SPREADSHEET_ID, "'" + ABA_LISTA + "'!A:C", true),
      lerFaixa(SPREADSHEET_ID, ABA_ETA + "!A:D"),
      lerFaixa(HB_SPREADSHEET_ID, "'" + ABA_EXTRACAO + "'!A:Z"),
      lerFaixa(HB_SPREADSHEET_ID, ABA_FORMULAS + "!A:AK", true),
      getMonitoringSeller(),
      lista === "completa" ? listaCompletaHB() : Promise.resolve(null),
    ]);

    const sellers = completa ?? montarListaHB(listaCurada);
    if (sellers.size === 0) {
      return {
        ...vazio,
        erro: completa
          ? "A aba HB_PARADAS não existe ou está vazia na planilha de processos."
          : "A lista de sellers do H&B voltou vazia. Confira se a planilha " +
            "continua compartilhada com a conta de servico.",
      };
    }

    const etaPorRota: Record<string, string> = {};
    let atualizadoEta = "";
    if (eta.length > 1) {
      const cab = (eta[0] ?? []).map((c) => texto(c).toUpperCase());
      const iData = cab.indexOf("DATA");
      const iRota = cab.indexOf("NOME_ROTA");
      const iEta = cab.indexOf("ETA");
      const iAtu = cab.indexOf("ATUALIZADO_EM");
      if (iData >= 0 && iRota >= 0 && iEta >= 0) {
        for (let i = 1; i < eta.length; i++) {
          const l = eta[i] ?? [];
          if (texto(l[iData]) !== dataBR) continue;
          const rota = texto(l[iRota]);
          if (!rota) continue;
          etaPorRota[rota] = texto(l[iEta]);
          if (!atualizadoEta && iAtu >= 0) atualizadoEta = texto(l[iAtu]);
        }
      }
    }

    const placaPorRota: Record<string, string> = {};
    for (const r of atribuidas) {
      const rota = texto(r.rota);
      const placa = texto(r.placa);
      if (!rota || !temPlaca(placa)) continue;
      placaPorRota[rota] = placa;
    }

    const doDia = rotasDoDia(extracao, dataBR);
    for (const [rota, e] of doDia.etaPorRota) if (e) etaPorRota[rota] = e;

    const mapa = mapaDePontos(formulas);
    const avisos = [doDia.aviso];
    if (!doDia.paradas && !mapa.size) avisos.push("A aba Formulas nao tem NOME_ROTA e ID_SELLER: sem o mapa de pontos, so aparece rota que ja teve coleta.");
    const planejadas = paradasPlanejadas(
      doDia,
      mapa,
      sellers,
      atribuidas.map((r) => texto(r.rota)),
    );

    const indiceMonitoring = indexarMonitoring(monitoring);

    const atualizadoMonitoring = monitoring[0]?.atualizadoEm ?? "";

    const linhas = montarHB({
      paradas: [...planejadas, ...(paradas as ParadaHB[])],
      sellers,
      etaPorRota,
      placaPorRota,
      estimadoMonitoramento: (id) => estimadoDoId(indiceMonitoring, id),
    });

    return {
      dataBR,
      linhas,
      resumo: resumoHB(linhas),

      totalSellers: completa ? new Set([...sellers.values()].map((x) => x.rotulo)).size : sellers.size,
      atualizadoEta,
      aviso: avisos.filter(Boolean).join(" "),
      erro: null,
      atualizadoMonitoring,
      diagnostico: rotaDiagnostico
        ? diagnosticarRota({
            rota: rotaDiagnostico,
            seller: sellerDiagnostico,
            dataBR,
            sellers,
            extracao,
            mapa,
            atribuidas,
            coleta: paradas as ParadaHB[],
            linhas,
          })
        : [],
    };
  } catch (e) {
    return { ...vazio, erro: (e as Error).message };
  }
}

export type LeituraConsulta = {
  resultados: ResultadoParada[];
  atualizadoMonitoring: string;

  semMonitoring: boolean;
  erro: string | null;
};

export async function lerConsultaParadas(
  dataBR: string,
  ids: string[],
): Promise<LeituraConsulta> {
  if (!ids.length) {
    return { resultados: [], atualizadoMonitoring: "", semMonitoring: false, erro: null };
  }
  try {
    const [coleta, atribuidas, extracao, formulas, monitoring] = await Promise.all([
      getParadasDoDia(dataBR),
      getAtribuicaoDoDia(),
      lerFaixa(HB_SPREADSHEET_ID, "'" + ABA_EXTRACAO + "'!A:Z"),
      lerFaixa(HB_SPREADSHEET_ID, ABA_FORMULAS + "!A:AK", true),
      getMonitoringSeller(),
    ]);
    const doDia = rotasDoDia(extracao, dataBR);
    const planejadas = paradasPlanejadas(
      doDia,
      mapaDePontos(formulas),
      { has: () => true },
      atribuidas.map((r) => texto(r.rota)),
    );
    const placaPorRota: Record<string, string> = {};
    for (const r of atribuidas) {
      if (texto(r.rota) && temPlaca(r.placa)) placaPorRota[texto(r.rota)] = texto(r.placa);
    }
    const indice = indexarMonitoring(monitoring);
    const fontes = {
      indice,
      coleta,
      planejadas,
      etaPorRota: Object.fromEntries(doDia.etaPorRota),
      placaPorRota,
    };
    return {
      resultados: ids.map((id) => consultarParada(id, fontes)),
      atualizadoMonitoring: monitoring[0]?.atualizadoEm ?? "",
      semMonitoring: monitoring.length === 0,
      erro: null,
    };
  } catch (e) {
    return {
      resultados: [],
      atualizadoMonitoring: "",
      semMonitoring: false,
      erro: (e as Error).message,
    };
  }
}
