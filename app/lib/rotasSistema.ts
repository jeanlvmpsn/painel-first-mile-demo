import { chaveRota, texto } from "./hb.ts";
import { chaveChegada, semNome, type Chegada } from "./curvaChegada.ts";

export type LeituraRotasSistema = {
  chegadas: Chegada[];

  ids: Map<string, string>;
  atualizadoEm: string;
};

export function lerRotasSistema(linhas: string[][], dataBR: string): LeituraRotasSistema {
  const ids = new Map<string, string>();
  if (linhas.length < 2) return { chegadas: [], ids, atualizadoEm: "" };
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    id: i("ROUTE_ID"),
    rota: i("ROTA"),
    transportadora: i("TRANSPORTADORA"),
    placa: i("PLACA"),
    veiculo: i("VEICULO"),
    status: i("STATUS"),
    coletados: i("COLETADOS"),
    chegou: i("CHEGOU_CD"),
    aCaminho: i("A_CAMINHO_CD"),
    noCd: i("NO_CD"),
    descarregando: i("DESCARREGANDO"),
    descarga: i("INICIO_DESCARGA"),
    atualizado: i("ATUALIZADO_EM"),
  };
  if (c.data < 0 || c.rota < 0 || c.status < 0) return { chegadas: [], ids, atualizadoEm: "" };
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  const dataISO = dataBR.split("/").reverse().join("-");

  let atualizadoEm = "";
  const chegadas: Chegada[] = [];
  for (const l of linhas.slice(1)) {
    if (v(l, c.data) !== dataBR) continue;
    const at = v(l, c.atualizado);
    if (at > atualizadoEm) atualizadoEm = at;
    if (v(l, c.id) && !semNome(v(l, c.rota))) ids.set(chaveRota(v(l, c.rota)), v(l, c.id));
    const status = v(l, c.status).toLowerCase();
    const gatein = v(l, c.chegou);

    if (!gatein && status !== "active" && status !== "close") continue;
    const pacotes = Number(v(l, c.coletados)) || 0;
    chegadas.push({
      coleta: dataISO,
      rotaId: v(l, c.id),
      nome: v(l, c.rota),
      placa: v(l, c.placa),
      perfil: v(l, c.veiculo),
      transportadora: v(l, c.transportadora),
      doca: "",
      pacotes,
      gatein,
      dockin: v(l, c.descarga),
      dockout: "",
      gateout: "",
      status,

      valida: !(status === "close" && pacotes < 2),
      fonte: "sistema",
      etapa:
        v(l, c.noCd) === "SIM" || v(l, c.descarregando) === "SIM"
          ? "no CD"
          : v(l, c.aCaminho) === "SIM"
            ? "a caminho"
            : undefined,
    });
  }
  return { chegadas, ids, atualizadoEm };
}

export function completarComBigQuery(sistema: Chegada[], bigquery: Chegada[]): Chegada[] {
  const porId = new Map(bigquery.filter((c) => c.rotaId).map((c) => [c.coleta + "|" + c.rotaId, c]));
  const porNome = new Map(bigquery.map((c) => [c.coleta + "|" + chaveChegada(c), c]));
  return sistema.map((s) => {
    const b = (s.rotaId && porId.get(s.coleta + "|" + s.rotaId)) || porNome.get(s.coleta + "|" + chaveChegada(s));
    if (!b) return s;
    return {
      ...s,
      transportadora: s.transportadora || b.transportadora,
      doca: b.doca,
      dockin: s.dockin || b.dockin,
      dockout: b.dockout,
      gateout: b.gateout,
    };
  });
}
