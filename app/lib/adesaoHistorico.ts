import type { PontoAdesao } from "./adesao";
import {
  getAtribuicaoHistoricaPorDia,
  getRespostasForm,
  getRotasDoDia,
  indiceDoDia,
  lerFontesIndice,
} from "./sheets";

export async function getSerieAdesao(): Promise<PontoAdesao[]> {
  const [porDia, respostas, fontes] = await Promise.all([
    getAtribuicaoHistoricaPorDia(),
    getRespostasForm(),
    lerFontesIndice(),
  ]);

  const saida: PontoAdesao[] = [];

  for (const [data, atribuicoes] of porDia) {
    if (atribuicoes.length === 0) continue;
    const { rotas } = await getRotasDoDia(data, false, {
      atribuicoes,
      respostas,
      indice: indiceDoDia(data, fontes),
    });

    const porTp = new Map<string, PontoAdesao>();
    for (const r of rotas) {
      const nome = r.transportadora || "Sem transportadora";
      const p =
        porTp.get(nome) ??
        { data, transportadora: nome, total: 0, concluidas: 0, ns: 0 };
      p.total++;

      if (r.status === "concluida") p.concluidas++;
      else if (r.ns) p.ns++;
      porTp.set(nome, p);
    }
    saida.push(...porTp.values());
  }

  return saida;
}
