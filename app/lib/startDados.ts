import { ehSabado } from "./relatorioTipos";
import { ehDeCampinas, somenteCampinas } from "./hubs";
import { getRotasPlanejadas } from "./atribuicoes";
import { lerScheduling } from "./scheduling";
import {
  getMonitoramentoDoDia,
  getNocDoDia,
  getRotasConfigDoDia,
  getRotasDoDia,
} from "./sheets";
import { chaveRota } from "./hb";
import { lerCarimbos } from "./statusSessao";
import { metricasStart, type DadosStart } from "./start";

export async function carregarStart(
  dataBR: string,
  hojeBR: string
): Promise<DadosStart> {
  const ehHoje = dataBR === hojeBR;
  const [rotas, doDia, scheduling, rotasConfig, monitoramento, noc, carimbos] =
    await Promise.all([
      getRotasPlanejadas(dataBR, hojeBR),
      getRotasDoDia(dataBR, ehHoje),
      lerScheduling(),
      getRotasConfigDoDia(dataBR),
      getMonitoramentoDoDia(dataBR),
      getNocDoDia(dataBR),
      lerCarimbos(),
    ]);

  const deCampinas = somenteCampinas(rotas);

  const ns = doDia.comparavel ? doDia.rotas.filter((r) => r.ns).length : 0;
  const rotasNs = new Set(doDia.comparavel ? doDia.rotas.filter((r) => r.ns).map((r) => chaveRota(r.rota)) : []);

  const doDiaSched = scheduling.filter((p) => p.data === dataBR && ehDeCampinas(p.hub));
  return {
    metricas: metricasStart(deCampinas, ns, rotasNs),

    rotasConfig: ehSabado(dataBR) || deCampinas.length < rotas.length ? deCampinas.length : rotasConfig,
    aceitos: doDiaSched.length
      ? doDiaSched.filter((p) => p.situacao === "aceite").length
      : null,
    recusados: doDiaSched.length
      ? doDiaSched.filter((p) => p.situacao === "recusa").length
      : null,

    estimadosInicio: monitoramento ? monitoramento.estimados : null,

    forecast: noc?.forecast ?? null,
    backlog: noc?.backlog ?? null,
    nocAtualizadoEm: noc?.atualizadoEm ?? "",
    temAtribuicao: deCampinas.length > 0,
    atribuicaoEm: carimbos.find((c) => c.rotulo === "ultima atualizacao atribuicao")?.quando ?? "",
    lidoEm: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date()),
  };
}
