import { getRotasPlanejadas } from "./atribuicoes";
import { metricasPrevia, type DadosPrevia } from "./previa";
import { lerScheduling } from "./scheduling";
import { getRotasConfigDoDia } from "./sheets";

export async function carregarPrevia(
  dataBR: string,
  hojeBR: string
): Promise<DadosPrevia> {
  const [rotas, scheduling, rotasConfig] = await Promise.all([
    getRotasPlanejadas(dataBR, hojeBR),
    lerScheduling(),
    getRotasConfigDoDia(dataBR),
  ]);

  const doDia = scheduling.filter((p) => p.data === dataBR);
  return {
    metricas: metricasPrevia(rotas),
    rotasConfig,
    aceitos: doDia.length
      ? doDia.filter((p) => p.situacao === "aceite").length
      : null,
    recusados: doDia.length
      ? doDia.filter((p) => p.situacao === "recusa").length
      : null,
    temAtribuicao: rotas.length > 0,
  };
}
