import { chaveRota, texto } from "./hb.ts";
import type { Diagnostico } from "./motivosCurva.ts";

export type Chegada = {
  coleta: string;
  rotaId: string;
  nome: string;
  placa: string;
  perfil: string;
  transportadora: string;
  doca: string;
  pacotes: number;
  gatein: string;
  dockin: string;
  dockout: string;
  gateout: string;
  status: string;

  valida: boolean;

  fonte?: "sistema" | "bigquery";

  etapa?: "a caminho" | "no CD";
};

export function lerChegadas(linhas: string[][]): { chegadas: Chegada[]; atualizadoEm: string } {
  if (linhas.length < 2) return { chegadas: [], atualizadoEm: "" };
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    coleta: i("COLETA"),
    rota: i("ROTA"),
    nome: i("NOME_DA_ROTA"),
    placa: i("PLACA"),
    perfil: i("PERFIL_VEICULO"),
    mlp: i("MLP"),
    doca: i("DOCA"),
    pacotes: i("QTD_PACOTES"),
    gatein: i("GATEIN"),
    dockin: i("DOCKIN"),
    dockout: i("DOCKOUT"),
    gateout: i("GATEOUT"),
    status: i("STATUS_ROTA"),
    verificador: i("VERIFICADOR"),
    atualizado: i("ATUALIZADO_EM"),
  };
  if (c.coleta < 0 || c.nome < 0) return { chegadas: [], atualizadoEm: "" };
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  let atualizadoEm = "";
  const chegadas = linhas.slice(1).map((l) => {
    if (!atualizadoEm) atualizadoEm = v(l, c.atualizado);
    return {
      coleta: v(l, c.coleta).slice(0, 10),
      rotaId: v(l, c.rota),
      nome: v(l, c.nome),
      placa: v(l, c.placa),
      perfil: v(l, c.perfil),
      transportadora: v(l, c.mlp),
      doca: v(l, c.doca),
      pacotes: Number(v(l, c.pacotes)) || 0,
      gatein: v(l, c.gatein),
      dockin: v(l, c.dockin),
      dockout: v(l, c.dockout),
      gateout: v(l, c.gateout),
      status: v(l, c.status),
      valida: v(l, c.verificador) !== "0",
      fonte: "bigquery" as const,
    };
  });
  return { chegadas, atualizadoEm };
}

export function minutosDoEta(eta: string): number | null {
  const m = String(eta ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min < 5 * 60 ? min + 24 * 60 : min;
}

export function minutosDoHorario(dataHora: string, dataISO: string): number | null {
  const m = String(dataHora ?? "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const dias = Math.round((Date.parse(m[1] + "T00:00:00Z") - Date.parse(dataISO + "T00:00:00Z")) / 86400000);
  return dias * 1440 + Number(m[2]) * 60 + Number(m[3]);
}

export type RotaPlanejada = {
  rota: string;
  transportadora: string;
  cluster: string;
  eta: string;
  pacotes: number;
};

export type Situacao = "no CD" | "a caminho do CD" | "coletando" | "fechada sem chegada" | "NS" | "não iniciada";

export function emTransito(s: Situacao): boolean {
  return s === "a caminho do CD";
}

function situacaoDe(chegada: Chegada | null, gateinMin: number | null, ns: boolean): Situacao {
  if (gateinMin !== null) return "no CD";
  if (!chegada) return ns ? "NS" : "não iniciada";
  if (chegada.etapa === "no CD") return "no CD";
  if (chegada.status === "close") return "fechada sem chegada";
  if (chegada.etapa === "a caminho") return "a caminho do CD";
  return "coletando";
}

export type RotaCurva = {
  rota: string;

  rotaId: string;
  transportadora: string;
  cluster: string;
  planejada: boolean;
  etaMin: number | null;
  pacotesPlan: number;
  chegada: Chegada | null;
  gateinMin: number | null;

  atrasoMin: number | null;
  situacao: Situacao;

  foraDaCurva: boolean;

  chegadaSistemaMin?: number | null;

  diagnostico?: Diagnostico | null;
};

export type Faixa = {
  hora: number;
  rotulo: string;
  planejado: number;
  executado: number;
  transito: number;
};

export type Medida = "veiculos" | "pacotes";

export function semNome(nome: string): boolean {
  const n = chaveRota(nome);
  return !n || n === "NAO_PROGRAMADA";
}

export function chaveChegada(c: Chegada): string {
  return semNome(c.nome) ? (c.rotaId ? "ID:" + c.rotaId : "") : chaveRota(c.nome);
}

export function montarRotasCurva(
  planejadas: RotaPlanejada[],
  chegadas: Chegada[],
  dataISO: string,

  ids: Map<string, string> = new Map(),

  ns: Set<string> = new Set(),
): { rotas: RotaCurva[]; desconsideradas: number } {
  const doDia = chegadas.filter((c) => c.coleta === dataISO);
  const porNome = new Map<string, Chegada>();
  for (const c of doDia) {
    const k = chaveChegada(c);

    if (k && (!porNome.has(k) || (!porNome.get(k)!.gatein && c.gatein))) porNome.set(k, c);
  }
  const invalidas = new Map(doDia.filter((c) => !c.valida).map((c) => [chaveChegada(c), c]));

  const rotas: RotaCurva[] = [];
  const usadas = new Set<string>();
  for (const p of planejadas) {
    const k = chaveRota(p.rota);
    if (!k || usadas.has(k)) continue;
    usadas.add(k);

    const invalida = invalidas.get(k);
    if (invalida || ns.has(k)) {
      const id = invalida?.rotaId || porNome.get(k)?.rotaId || ids.get(k) || "";
      const registro = invalida ?? porNome.get(k);
      rotas.push({
        ...linha(p.rota, id, p.transportadora, p.cluster, true, minutosDoEta(p.eta), p.pacotes, null, dataISO, true),
        foraDaCurva: true,
        chegadaSistemaMin: minutosDaChegada(registro?.gatein, dataISO),
      });
      continue;
    }
    const chegada = porNome.get(k) ?? null;
    rotas.push(
      linha(p.rota, chegada?.rotaId || ids.get(k) || "", p.transportadora, p.cluster, true, minutosDoEta(p.eta), p.pacotes, chegada, dataISO, ns.has(k)),
    );
  }

  for (const c of doDia) {
    const k = chaveChegada(c);
    if (!c.valida || usadas.has(k) || (k && porNome.get(k) !== c)) continue;
    usadas.add(k);
    rotas.push(linha(semNome(c.nome) ? "Avulsa" : c.nome, c.rotaId, c.transportadora, "", false, null, 0, c, dataISO, false));
  }

  for (const c of doDia) {
    const k = chaveChegada(c);
    const min = minutosDaChegada(c.gatein, dataISO);
    if (c.valida || !k || usadas.has(k) || min === null) continue;
    usadas.add(k);
    rotas.push({
      ...linha(semNome(c.nome) ? "Avulsa" : c.nome, c.rotaId, c.transportadora, "", false, null, 0, null, dataISO, true),
      foraDaCurva: true,
      chegadaSistemaMin: min,
    });
  }
  return { rotas, desconsideradas: invalidas.size };
}

export const PRIMEIRA_CHEGADA_MIN = 7 * 60;

export function minutosDaChegada(gatein: string | undefined, dataISO: string): number | null {
  const min = gatein ? minutosDoHorario(gatein, dataISO) : null;
  return min !== null && min >= 0 && min < PRIMEIRA_CHEGADA_MIN ? null : min;
}

function linha(
  rota: string,
  rotaId: string,
  transportadora: string,
  cluster: string,
  planejada: boolean,
  etaMin: number | null,
  pacotesPlan: number,
  chegada: Chegada | null,
  dataISO: string,
  ns: boolean,
): RotaCurva {
  const gateinMin = minutosDaChegada(chegada?.gatein, dataISO);
  return {
    rota,
    rotaId,
    transportadora: transportadora || chegada?.transportadora || "",
    cluster,
    planejada,
    etaMin,
    pacotesPlan,
    chegada,
    gateinMin,
    atrasoMin: gateinMin !== null && etaMin !== null ? gateinMin - etaMin : null,
    situacao: situacaoDe(chegada, gateinMin, ns),
    foraDaCurva: false,
  };
}

const rotuloHora = (h: number) => {
  const hh = String(h % 24).padStart(2, "0");
  return hh + ":00 - " + hh + ":59";
};

export function faixasDaCurva(rotas: RotaCurva[], medida: Medida): Faixa[] {
  const mapa = new Map<number, Faixa>();
  const faixa = (min: number) => {
    const h = Math.floor(min / 60);
    const f = mapa.get(h) ?? { hora: h, rotulo: rotuloHora(h), planejado: 0, executado: 0, transito: 0 };
    mapa.set(h, f);
    return f;
  };
  for (const r of rotas) {
    const pacotesReais = r.chegada?.pacotes ?? 0;
    if (r.foraDaCurva) continue;
    if (r.planejada && r.etaMin !== null) faixa(r.etaMin).planejado += medida === "veiculos" ? 1 : r.pacotesPlan;
    if (r.situacao === "no CD" && r.gateinMin !== null) faixa(r.gateinMin).executado += medida === "veiculos" ? 1 : pacotesReais;
    if (emTransito(r.situacao) && r.etaMin !== null) faixa(r.etaMin).transito += medida === "veiculos" ? 1 : pacotesReais;
  }
  const horas = [...mapa.keys()];
  const de = Math.min(8, ...horas);
  const ate = Math.max(22, ...horas);
  const saida: Faixa[] = [];
  for (let h = de; h <= ate; h++) saida.push(mapa.get(h) ?? { hora: h, rotulo: rotuloHora(h), planejado: 0, executado: 0, transito: 0 });
  return saida;
}

export type Serie = "planejado" | "executado" | "transito";

export function rotasDaBarra(rotas: RotaCurva[], hora: number, serie: Serie, incluirNs = false): RotaCurva[] {
  const naHora = (min: number | null | undefined) => min != null && Math.floor(min / 60) === hora;
  return rotas.filter((r) =>
    serie === "planejado"
      ? r.planejada && !r.foraDaCurva && naHora(r.etaMin)
      : serie === "executado"
        ? (r.situacao === "no CD" && naHora(r.gateinMin)) || (incluirNs && r.foraDaCurva && naHora(r.chegadaSistemaMin))
        : emTransito(r.situacao) && naHora(r.etaMin),
  );
}

export type Resumo = {
  planejadas: number;
  coletando: number;
  chegaram: number;
  transito: number;
  descarregando: number;
  finalizadas: number;
};

export function resumoDaCurva(rotas: RotaCurva[], medida: Medida): Resumo {
  const soma = (lista: RotaCurva[], plano = false) =>
    medida === "veiculos" ? lista.length : lista.reduce((s, r) => s + (plano ? r.pacotesPlan : r.chegada?.pacotes ?? 0), 0);
  const chegou = rotas.filter((r) => r.situacao === "no CD");
  return {
    planejadas: soma(rotas.filter((r) => r.planejada && !r.foraDaCurva), true),
    coletando: soma(rotas.filter((r) => r.situacao === "coletando")),
    chegaram: soma(chegou),
    transito: soma(rotas.filter((r) => emTransito(r.situacao))),
    descarregando: soma(chegou.filter((r) => r.chegada?.dockin && !r.chegada.dockout)),
    finalizadas: soma(chegou.filter((r) => r.chegada?.gateout)),
  };
}

export function ultimaChegadaDaQuery(chegadas: Chegada[], dataISO: string): { quando: string; rota: string } | null {
  let melhor: Chegada | null = null;
  let maxMin = -1;
  for (const c of chegadas) {
    if (c.coleta !== dataISO || !c.valida) continue;
    const m = minutosDaChegada(c.gatein, dataISO);
    if (m !== null && m > maxMin) {
      maxMin = m;
      melhor = c;
    }
  }
  if (!melhor) return null;
  return { quando: horaDosMinutos(maxMin), rota: semNome(melhor.nome) ? "Avulsa " + melhor.rotaId : melhor.nome };
}

export function ultimoGatein(rotas: RotaCurva[]): number | null {
  const mins = rotas.map((r) => r.gateinMin).filter((m): m is number => m !== null);
  return mins.length ? Math.max(...mins) : null;
}

export function horaDosMinutos(min: number | null): string {
  if (min === null) return "";
  const h = Math.floor(min / 60);
  return String(h % 24).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0") + (h >= 24 ? " (+1)" : "");
}

export const TOLERANCIA_MIN = 30;

export type Pontualidade = "cedo" | "no horário" | "atrasada";

export function pontualidade(r: Pick<RotaCurva, "atrasoMin">): Pontualidade | null {
  if (r.atrasoMin === null) return null;
  if (r.atrasoMin < -TOLERANCIA_MIN) return "cedo";
  if (r.atrasoMin > TOLERANCIA_MIN) return "atrasada";
  return "no horário";
}

export type PontualidadeTransportadora = {
  transportadora: string;
  chegaram: number;
  cedo: number;
  noHorario: number;
  atrasada: number;

  semEta: number;
};

export function pontualidadePorTransportadora(rotas: RotaCurva[]): PontualidadeTransportadora[] {
  const mapa = new Map<string, PontualidadeTransportadora>();
  for (const r of rotas) {
    if (r.situacao !== "no CD" || r.gateinMin === null) continue;
    const nome = r.transportadora || "(sem transportadora)";
    const t = mapa.get(nome) ?? { transportadora: nome, chegaram: 0, cedo: 0, noHorario: 0, atrasada: 0, semEta: 0 };
    mapa.set(nome, t);
    t.chegaram++;
    const p = pontualidade(r);
    if (p === "cedo") t.cedo++;
    else if (p === "atrasada") t.atrasada++;
    else if (p === "no horário") t.noHorario++;
    else t.semEta++;
  }
  return [...mapa.values()].sort((a, b) => b.chegaram - a.chegaram || a.transportadora.localeCompare(b.transportadora, "pt-BR"));
}
