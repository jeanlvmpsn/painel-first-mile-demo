import { lerConfigHistorica } from "./configHistorico";
import { lerHistoricoConfig, planejadasDaConfig, registrarConfigDoDia } from "./configHistoricoDados";
import { chaveRota } from "./hb";
import {
  horaDosMinutos,
  lerChegadas,
  montarRotasCurva,
  pontualidade,
  ultimoGatein,
  ultimaChegadaDaQuery,
  type RotaCurva,
} from "./curvaChegada";
import { lerCurvaSistema, minutosDaCopia, type LeituraSistema } from "./curvaSistema";
import { HB_SPREADSHEET_ID } from "./hbDados";
import { completarComBigQuery, lerRotasSistema } from "./rotasSistema";
import { coletaDoHistorico, coletaPorRota, diagnosticoDasRotas } from "./motivosCurva";
import { getHistoricoColetasDoDia, getParadasDoDia, getRotasDoDia, getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { PROCESSO_ID } from "./upgradeDados";

const ABA_CURVA = "CURVA_CHEGADA";
const ABA_EXTRACAO = "Extração Config";
const ABA_SISTEMA = "CURVA_SISTEMA";
const ABA_ROTAS_SISTEMA = "ROTAS_SISTEMA";
const ABA_CURVA_HIST = "CURVA_CHEGADA_HIST";

const SISTEMA_VELHO_MIN = 30;

const agoraEmMinutos = () => {
  const [h, m] = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return h * 60 + m;
};

export type LeituraCurva = {
  rotas: RotaCurva[];
  atualizadoEm: string;

  fonteRotas: "sistema" | "bigquery";

  ultimaChegadaQuery: { quando: string; rota: string } | null;
  copiaQuery: string;

  fontePlano: "config" | "historico" | "nenhuma";

  desconsideradas: number;

  sistema: LeituraSistema;
  avisos: string[];
  erro: string | null;
};

async function lerAba(planilha: string, faixa: string): Promise<string[][]> {
  const r = await getSheetsClient().spreadsheets.values.get({ spreadsheetId: planilha, range: faixa });
  return ((r.data.values ?? []) as unknown[][]).map((l) => (l ?? []).map((v) => String(v ?? "")));
}

function avisoCopiaVelha(avisos: string[], atualizadoEm: string, oque: string, carimbo: string) {
  const copia = minutosDaCopia(atualizadoEm);
  if (copia !== null && agoraEmMinutos() - copia > SISTEMA_VELHO_MIN) {
    avisos.push(
      oque + " foi copiada às " + atualizadoEm.slice(11, 16) + ": veja a linha \"" + carimbo +
        "\" na aba SEMI AUTO ATRIBUIÇÃO (sessão vencida?).",
    );
  }
}

export async function lerCurvaDoDia(dataBR: string, ehHoje = false): Promise<LeituraCurva> {
  const dataISO = dataBR.split("/").reverse().join("-");
  const vazioSistema: LeituraSistema = { curvas: {}, atualizadoEm: "" };
  try {
    const avisos: string[] = [];
    const [config, curva, curvaHist, sistemaBruto, rotasSistemaBruto, ns, coletas] = await Promise.all([
      lerAba(HB_SPREADSHEET_ID, "'" + ABA_EXTRACAO + "'!A:AZ"),
      lerAba(PROCESSO_ID, ABA_CURVA + "!A:Z").catch(() => {
        avisos.push("Não consegui ler a aba CURVA_CHEGADA da planilha de processos.");
        return [] as string[][];
      }),

      ehHoje ? Promise.resolve([] as string[][]) : lerAba(PROCESSO_ID, ABA_CURVA_HIST + "!A:Z").catch(() => [] as string[][]),

      lerAba(SPREADSHEET_ID, ABA_SISTEMA + "!A:K").catch(() => [] as string[][]),
      lerAba(SPREADSHEET_ID, ABA_ROTAS_SISTEMA + "!A:Z").catch(() => [] as string[][]),

      getRotasDoDia(dataBR, ehHoje)
        .then((d) => new Set(d.rotas.filter((r) => r.ns).map((r) => chaveRota(r.rota))))
        .catch(() => new Set<string>()),

      (ehHoje
        ? getParadasDoDia(dataBR).then(coletaPorRota)
        : getHistoricoColetasDoDia(dataBR).then(coletaDoHistorico)
      ).catch(() => new Map()),
    ]);

    let planejadas = planejadasDaConfig(config, dataBR);
    let fontePlano: LeituraCurva["fontePlano"] = planejadas.length ? "config" : "nenhuma";
    if (planejadas.length && ehHoje) {
      await registrarConfigDoDia(planejadas, dataBR).catch((e) => {
        avisos.push("Não consegui guardar a config de hoje no HISTORICO_CONFIG: " + (e as Error).message);
      });
    }
    if (!planejadas.length) {
      planejadas = lerConfigHistorica(await lerHistoricoConfig().catch(() => [] as string[][]), dataBR);
      if (planejadas.length) fontePlano = "historico";
      else
        avisos.push(
          "Sem o planejado de " + dataBR + ": a Extração Config só tem o dia corrente e o HISTORICO_CONFIG não tem este dia " +
            "(ele começa a ser guardado quando a Curva de chegada de hoje é aberta).",
        );
    }

    const rotasSistema = lerRotasSistema(rotasSistemaBruto, dataBR);
    const recente = lerChegadas(curva);
    const historica = lerChegadas(curvaHist);

    const doBigQuery = {
      chegadas: [...recente.chegadas, ...historica.chegadas],
      atualizadoEm: recente.chegadas.some((c) => c.coleta === dataISO) ? recente.atualizadoEm : historica.atualizadoEm || recente.atualizadoEm,
    };

    const sistema = ehHoje ? lerCurvaSistema(sistemaBruto, dataBR) : vazioSistema;
    if (ehHoje && Object.keys(sistema.curvas).length) {
      avisoCopiaVelha(avisos, sistema.atualizadoEm, "A curva do sistema", "Ultima atualizacao curva do sistema");
    }
    const usaRotasSistema = ehHoje && rotasSistema.chegadas.length > 0;
    if (ehHoje && usaRotasSistema) {
      avisoCopiaVelha(avisos, rotasSistema.atualizadoEm, "A lista de rotas do sistema", "Ultima atualizacao rotas do sistema");
    }

    const chegadas = usaRotasSistema ? completarComBigQuery(rotasSistema.chegadas, doBigQuery.chegadas) : doBigQuery.chegadas;
    const atualizadoEm = usaRotasSistema ? rotasSistema.atualizadoEm : doBigQuery.atualizadoEm;
    const montadas = montarRotasCurva(planejadas, chegadas, dataISO, rotasSistema.ids, ns);
    const desconsideradas = montadas.desconsideradas;

    const rotas = diagnosticoDasRotas(montadas.rotas, coletas, (r) => {
      const p = r.situacao === "no CD" ? pontualidade(r) : null;
      return p === "cedo" || p === "atrasada" ? p : null;
    });
    if (!usaRotasSistema && !doBigQuery.chegadas.some((c) => c.coleta === dataISO)) {
      avisos.push(
        ehHoje
          ? "A aba CURVA_CHEGADA não tem rotas de " + dataBR + "."
          : "A query não tem rotas de " + dataBR + ": dias passados vêm da aba CURVA_CHEGADA_HIST (até 31 dias; rode " +
              "a rotina de histórico da curva na planilha de processos).",
      );
    }

    const ultimo = ultimoGatein(rotas);
    const copia = atualizadoEm.match(/(\d{2}):(\d{2})/);
    if (ehHoje && copia && !usaRotasSistema) {
      const minCopia = Number(copia[1]) * 60 + Number(copia[2]);
      if (ultimo === null || minCopia - ultimo > 60) {
        avisos.push(
          "Os gate-ins no BigQuery estão atrasados: " +
            (ultimo === null ? "nenhum gate-in de hoje registrado" : "o último gate-in de hoje é das " + horaDosMinutos(ultimo)) +
            " (cópia das " + copia[0] + "). Rotas que já chegaram podem aparecer como coletando ou fechadas sem chegada.",
        );
      }
    }
    return {
      rotas,
      atualizadoEm,
      ultimaChegadaQuery: ultimaChegadaDaQuery(doBigQuery.chegadas, dataISO),
      copiaQuery: doBigQuery.atualizadoEm,
      fonteRotas: usaRotasSistema ? "sistema" : "bigquery",
      fontePlano,
      desconsideradas,
      sistema,
      avisos,
      erro: null,
    };
  } catch (e) {
    return {
      rotas: [],
      atualizadoEm: "",
      ultimaChegadaQuery: null,
      copiaQuery: "",
      fonteRotas: "bigquery",
      fontePlano: "nenhuma",
      desconsideradas: 0,
      sistema: vazioSistema,
      avisos: [],
      erro: (e as Error).message,
    };
  }
}
