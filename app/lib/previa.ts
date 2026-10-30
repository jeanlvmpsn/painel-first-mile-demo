import { tipoDaRota, type RotaPlanejada } from "./atribuicaoUtils.ts";
import { ehTransportadoraFake } from "./gapRotas.ts";
import {
  A_PREENCHER,
  numeroReport,
  listarComE,
} from "./relatorioTipos.ts";

export type MetricasPrevia = {
  rotas: number;

  semTransportadora: number;

  gapRotas: string[];

  semAtribuicao: number;

  m1: number;

  semAtribuicaoPorTp: {
    transportadora: string;
    rotas: number;
    porHub: { hub: string; rotas: number }[];
  }[];
  porHub: { hub: string; rotas: number; semTransportadora: number }[];
};

export function proximoDiaOperacao(isoBase: string): string {
  const [ano, mes, dia] = String(isoBase).split("-").map(Number);
  const base = Date.UTC(ano, mes - 1, dia);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(base + i * 86400000);
    if (d.getUTCDay() !== 0) return d.toISOString().slice(0, 10);
  }
  return new Date(base + 86400000).toISOString().slice(0, 10);
}

export function metricasPrevia(rotas: RotaPlanejada[]): MetricasPrevia {
  let semTransportadora = 0;
  let semAtribuicao = 0;
  let m1 = 0;
  const hubs = new Map<string, { rotas: number; semTransportadora: number }>();

  const semVeiculoPorTp = new Map<
    string,
    { rotas: number; hubs: Map<string, number> }
  >();
  const gapRotas: string[] = [];

  for (const r of rotas) {
    const temTp = Boolean(String(r.transportadora ?? "").trim()) && !ehTransportadoraFake(r.transportadora);
    if (!temTp) {
      semTransportadora++;
      gapRotas.push(String(r.rota ?? "").trim() || "(sem nome)");
    }
    const hubDaRota =
      String(r.regiao ?? "").trim().toUpperCase() || "SEM HUB";
    if (!r.atribuida) {
      semAtribuicao++;
      const dono = temTp
        ? String(r.transportadora).trim()
        : "Sem transportadora";
      const atual =
        semVeiculoPorTp.get(dono) ?? { rotas: 0, hubs: new Map<string, number>() };
      atual.rotas++;
      atual.hubs.set(hubDaRota, (atual.hubs.get(hubDaRota) ?? 0) + 1);
      semVeiculoPorTp.set(dono, atual);
    }
    if (tipoDaRota(r.tipoRota) === "MeliOne") m1++;

    const h = hubs.get(hubDaRota) ?? { rotas: 0, semTransportadora: 0 };
    h.rotas++;
    if (!temTp) h.semTransportadora++;
    hubs.set(hubDaRota, h);
  }

  return {
    rotas: rotas.length,
    semTransportadora,
    gapRotas: gapRotas
      .slice()
      .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    semAtribuicao,
    m1,
    semAtribuicaoPorTp: [...semVeiculoPorTp.entries()]
      .map(([transportadora, o]) => ({
        transportadora,
        rotas: o.rotas,

        porHub: [...o.hubs.entries()]
          .map(([hub, rotas]) => ({ hub, rotas }))
          .sort((a, b) => b.rotas - a.rotas || a.hub.localeCompare(b.hub)),
      }))
      .sort(
        (x, y) =>
          y.rotas - x.rotas ||
          x.transportadora.localeCompare(y.transportadora, "pt-BR")
      ),
    porHub: [...hubs.entries()]
      .map(([hub, h]) => ({ hub, ...h }))
      .sort((a, b) => b.rotas - a.rotas || a.hub.localeCompare(b.hub)),
  };
}

export type ExtrasPrevia = {
  rotasConfig?: number | null;
  aceitos?: number | null;
  recusados?: number | null;
};

export function listarHubs(
  porHub: { hub: string; rotas: number }[]
): string {
  return listarComE(porHub.map((h) => h.hub + " - " + numeroReport(h.rotas)));
}

const MANUAL = "00";

export function textoPrevia(
  m: MetricasPrevia,
  dataBR: string,
  extras: ExtrasPrevia = {}
): string {
  const [dia, mes] = String(dataBR ?? "").split("/");
  const n = (v: number | null | undefined) =>
    v === null || v === undefined ? A_PREENCHER : numeroReport(v);

  const comHub = m.porHub.length > 1;
  const porTp = m.semAtribuicaoPorTp.map((t) => {
    const base = t.transportadora + " - " + numeroReport(t.rotas);
    return comHub ? [base, listarHubs(t.porHub)] : [base];
  });
  return [
    "Prévia Status FM - " + dia + "/" + mes,
    "",
    "*Rotas Config:* " + n(extras.rotasConfig),
    "*Rotas atribuição:* " + numeroReport(m.rotas),
    "*Schedulings aceitos:* " + n(extras.aceitos),
    "*Recusados:* " + n(extras.recusados),
    "*Rotas Não descarregadas D-1:* " + MANUAL,
    "*Rotas Avulsas:* " + MANUAL,
    "*M1:* " + numeroReport(m.m1),
    "*GAP de Rotas:* " + numeroReport(m.semTransportadora),
    "*Rotas sem atribuição:* " + numeroReport(m.semAtribuicao),

    ...(m.semTransportadora > 0
      ? [
          "",
          "*GAP de Rotas:*",
          ...m.gapRotas.map((nome) => nome + " - Sem transportadora"),
        ]
      : []),
        ...(m.semAtribuicao > 0 && porTp.length > 0
          ? [
              "",
              "*Rotas sem atribuição:*",
              ...(comHub
                ? porTp.flatMap((par) => ["", ...par])
                : porTp.flat()),
            ]
          : []),
  ].join("\n");
}

export type DadosPrevia = {
  metricas: MetricasPrevia;
  rotasConfig: number | null;
  aceitos: number | null;
  recusados: number | null;

  temAtribuicao: boolean;
};
