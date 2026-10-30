import { chaveRota, texto } from "./hb.ts";

export type EtapaColeta = "nao_iniciada" | "coletando" | "finalizada";

export const ROTULO_ETAPA: Record<EtapaColeta, string> = {
  nao_iniciada: "Não iniciada",
  coletando: "Coletando",
  finalizada: "Coletas finalizadas",
};

export type EtapasColeta = Record<string, EtapaColeta>;

export function lerEtapasColeta(linhas: string[][], dataBR: string): EtapasColeta {
  const saida: EtapasColeta = {};
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    id: i("ROUTE_ID"),
    rota: i("ROTA"),
    status: i("STATUS"),
    aCaminho: i("A_CAMINHO_CD"),
    noCd: i("NO_CD"),
    descarregando: i("DESCARREGANDO"),
    chegou: i("CHEGOU_CD"),
    inicio: i("INICIO_ROTA"),
    total: i("PARADAS_TOTAL"),
    pendentes: i("PARADAS_PENDENTES"),
  };
  if (c.data < 0 || c.status < 0) return saida;
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  for (const l of linhas.slice(1)) {
    if (v(l, c.data) !== dataBR) continue;
    const status = v(l, c.status).toLowerCase();
    const total = Number(v(l, c.total));
    const pendentesBruto = v(l, c.pendentes);
    const semPendente = pendentesBruto !== "" && Number(pendentesBruto) === 0 && total > 0;
    const etapa: EtapaColeta =
      status === "close" ||
      v(l, c.aCaminho) === "SIM" ||
      v(l, c.noCd) === "SIM" ||
      v(l, c.descarregando) === "SIM" ||
      v(l, c.chegou) !== "" ||
      semPendente
        ? "finalizada"
        : status === "active" || v(l, c.inicio) !== ""
          ? "coletando"
          : "nao_iniciada";
    const id = v(l, c.id);
    if (id) saida["ID:" + id] = etapa;
    const nome = chaveRota(v(l, c.rota));
    if (nome && nome !== "NAO_PROGRAMADA") saida[nome] = etapa;
  }
  return saida;
}

export function etapaDaRota(etapas: EtapasColeta, rota: string, idRota?: string): EtapaColeta {
  return (idRota && etapas["ID:" + texto(idRota)]) || etapas[chaveRota(rota)] || "nao_iniciada";
}
