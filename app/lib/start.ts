import { tipoDaRota, type RotaPlanejada } from "./atribuicaoUtils.ts";
import { chaveRota } from "./hb.ts";
import { A_PREENCHER, numeroReport } from "./relatorioTipos.ts";

export type RotaPerfil = {
  rota: string;
  desejado: string;
  atribuido: string;
};

export type PerfilMenorPorTp = {
  transportadora: string;
  rotas: RotaPerfil[];
};

export type MetricasStart = {
  rotas: number;
  ns: number;
  ttRotas: number;
  semTransportadora: number;
  m1: number;

  perfilMenor: number | null;
  perfilMenorPorTp: PerfilMenorPorTp[];

  segundaSaida: number | null;
  segundaSaidaGrupos: GrupoSaida[];
};

export type GrupoSaida = {
  transportadora: string;

  mistas: boolean;
  motoristas: string[];
  placas: string[];
  rotas: { rota: string; start: string; transportadora: string }[];

  anomalia: boolean;
};

const nomeChave = (v: string | undefined) =>
  semAcento(String(v ?? "")).replace(/[^a-z0-9]+/g, " ").trim();

const placaChave = (v: string | undefined) => {
  const p = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length >= 7 ? p : "";
};

export function segundasSaidasPorTp(grupos: GrupoSaida[]): { transportadora: string; grupos: GrupoSaida[] }[] {
  const porTp = new Map<string, GrupoSaida[]>();
  for (const g of grupos) porTp.set(g.transportadora, [...(porTp.get(g.transportadora) ?? []), g]);
  return [...porTp.entries()]
    .map(([transportadora, gs]) => ({
      transportadora,
      grupos: gs
        .slice()
        .sort(
          (a, b) =>
            a.rotas[0].start.localeCompare(b.rotas[0].start) ||
            a.rotas[0].rota.localeCompare(b.rotas[0].rota, "pt-BR", { numeric: true })
        ),
    }))
    .sort((a, b) => b.grupos.length - a.grupos.length || a.transportadora.localeCompare(b.transportadora, "pt-BR"));
}

export function segundasSaidas(rotas: RotaPlanejada[]): { total: number | null; grupos: GrupoSaida[] } {
  const comDado = rotas.filter((r) => nomeChave(r.motorista) || placaChave(r.placa));
  if (!comDado.length) return { total: null, grupos: [] };
  const porMotorista = new Map<string, RotaPlanejada[]>();
  const semMotorista: RotaPlanejada[] = [];
  for (const r of comDado) {
    const m = nomeChave(r.motorista);
    if (m) porMotorista.set(m, [...(porMotorista.get(m) ?? []), r]);
    else semMotorista.push(r);
  }

  const donoDaPlaca = new Map<string, string | null>();
  for (const [m, rs] of porMotorista) {
    for (const r of rs) {
      const pl = placaChave(r.placa);
      if (!pl) continue;
      const d = donoDaPlaca.get(pl);
      if (d === undefined) donoDaPlaca.set(pl, m);
      else if (d !== m) donoDaPlaca.set(pl, null);
    }
  }
  const porPlaca = new Map<string, RotaPlanejada[]>();
  for (const r of semMotorista) {
    const pl = placaChave(r.placa);
    const d = donoDaPlaca.get(pl);
    if (d) porMotorista.get(d)!.push(r);
    else porPlaca.set(pl, [...(porPlaca.get(pl) ?? []), r]);
  }
  const unicos = (vs: string[]) => [...new Set(vs.map((v) => v.trim()).filter(Boolean))];
  const grupos = [...porMotorista.values(), ...porPlaca.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const rotasDoGrupo = g
        .map((r) => ({
          rota: String(r.rota ?? "").trim() || "(sem nome)",
          start: String(r.start ?? "").trim(),
          transportadora: String(r.transportadora ?? "").trim(),
        }))
        .sort((a, b) => a.start.localeCompare(b.start) || a.rota.localeCompare(b.rota, "pt-BR", { numeric: true }));
      const tps = unicos(rotasDoGrupo.map((r) => r.transportadora));
      return {
        transportadora: rotasDoGrupo[1].transportadora || tps[0] || "Sem transportadora",
        mistas: tps.length > 1,
        motoristas: unicos(g.map((r) => r.motorista ?? "")),
        placas: unicos(g.map((r) => r.placa)),
        rotas: rotasDoGrupo,
        anomalia: g.length > 2,
      };
    })
    .sort((a, b) => b.rotas.length - a.rotas.length || a.rotas[0].start.localeCompare(b.rotas[0].start));
  return { total: grupos.length, grupos };
}

const RUIDO_PERFIL = /\b(fixo|fixa|fixos|fixas|frota|tks|rental)\b/gi;

function limparPerfil(nome: string): string {
  return nome.replace(RUIDO_PERFIL, " ").replace(/\s+/g, " ").trim();
}

function semAcento(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function parPerfil(r: RotaPerfil): string {
  const d = String(r.desejado ?? "").trim();
  const a = String(r.atribuido ?? "").trim();
  if (!d && !a) return "";
  const ld = limparPerfil(d);
  const la = limparPerfil(a);
  const podeLimpar = Boolean(ld) && Boolean(la) && semAcento(ld) !== semAcento(la);
  if (podeLimpar) return ld + "/" + la;
  return (d || "?") + "/" + (a || "?");
}

export function metricasStart(
  rotas: RotaPlanejada[],
  ns: number,

  rotasNs: Set<string> = new Set()
): MetricasStart {
  let semTransportadora = 0;
  let m1 = 0;
  let menores = 0;
  let comDado = 0;
  const porTp = new Map<string, RotaPerfil[]>();

  for (const r of rotas) {
    const tp = String(r.transportadora ?? "").trim();
    if (!tp) semTransportadora++;
    if (tipoDaRota(r.tipoRota) === "Express") m1++;
    if (r.perfilMenor === undefined) continue;
    comDado++;
    if (!r.perfilMenor) continue;
    menores++;
    const dono = tp || "Sem transportadora";
    const lista = porTp.get(dono) ?? [];
    lista.push({
      rota: String(r.rota ?? "").trim() || "(sem nome)",
      desejado: String(r.perfil ?? "").trim(),
      atribuido: String(r.veiculoTipo ?? "").trim(),
    });
    porTp.set(dono, lista);
  }

  const vivas = rotas.some((r) => !r.doHistorico) ? rotas.filter((r) => !r.doHistorico) : rotas;
  const saidas = segundasSaidas(vivas.filter((r) => !rotasNs.has(chaveRota(r.rota))));

  return {
    rotas: rotas.length,
    ns,

    ttRotas: Math.max(rotas.length - ns, 0),
    semTransportadora,
    m1,
    perfilMenor: comDado > 0 ? menores : null,
    perfilMenorPorTp: [...porTp.entries()]
      .map(([transportadora, lista]) => ({
        transportadora,
        rotas: lista
          .slice()
          .sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR", { numeric: true })),
      }))
      .sort(
        (a, b) =>
          b.rotas.length - a.rotas.length ||
          a.transportadora.localeCompare(b.transportadora, "pt-BR")
      ),
    segundaSaida: saidas.total,
    segundaSaidaGrupos: saidas.grupos,
  };
}

export type ExtrasStart = {
  rotasConfig?: number | null;
  aceitos?: number | null;
  recusados?: number | null;
  backlog?: number | null;
  forecast?: number | null;
  capacidade?: number | null;
  estimadosInicio?: number | null;
};

const MANUAL = "00";

const TITULO_PERFIL = "*Rotas Perfil Divergente atribuição:*";
const TITULO_SEGUNDA = "*Rotas Segunda Saída:*";

export function textoStart(
  m: MetricasStart,
  dataBR: string,
  extras: ExtrasStart = {}
): string {
  const [dia, mes] = String(dataBR ?? "").split("/");
  const n = (v: number | null | undefined) =>
    v === null || v === undefined ? A_PREENCHER : numeroReport(v);
  return [
    "*Status FM CAMPINAS* - " + dia + "/" + mes,
    "",
    "*Backlog:* " + n(extras.backlog) +
      " | *Forecast:* " + n(extras.forecast) +
      " | *Capacidade:* " + n(extras.capacidade) +
      " | *Estimados início:* " + n(extras.estimadosInicio),
    "",
    "*TT Rotas:* " + numeroReport(m.ttRotas),
    "*Rotas Config:* " + n(extras.rotasConfig),
    "*Rotas atribuição:* " + numeroReport(m.rotas),
    "*Schedulings aceitos:* " + n(extras.aceitos),
    "*Recusados:* " + n(extras.recusados),
    "*GAP de Rotas:* " + numeroReport(m.semTransportadora),
    "*Rotas Não descarregadas D-1:* " + MANUAL,
    TITULO_PERFIL + " " +
      (m.perfilMenor === null ? A_PREENCHER : numeroReport(m.perfilMenor)),
    TITULO_SEGUNDA + " " + n(m.segundaSaida),
    "*Rotas Avulsas:* " + MANUAL,
    "*M1:* " + numeroReport(m.m1),

    ...(m.perfilMenorPorTp.length > 0
      ? [
          "",
          TITULO_PERFIL,
          ...m.perfilMenorPorTp.flatMap((t, i) => [
            ...(i > 0 ? [""] : []),
            t.transportadora + " - " + numeroReport(t.rotas.length),
            ...t.rotas.map((r) => {
              const par = parPerfil(r);
              return par ? r.rota + " - " + par : r.rota;
            }),
          ]),
        ]
      : []),

    ...(m.segundaSaidaGrupos.length > 0
      ? [
          "",
          TITULO_SEGUNDA,
          ...segundasSaidasPorTp(m.segundaSaidaGrupos).flatMap((t, i) => [
            ...(i > 0 ? [""] : []),
            t.transportadora + " - " + numeroReport(t.grupos.length),
            ...t.grupos.map(
              (g) =>
                g.rotas
                  .map((r) => (g.mistas ? r.rota + " (" + (r.transportadora || "sem transportadora") + ")" : r.rota))
                  .join(" / ") +
                (g.anomalia ? " ⚠️ " + g.rotas.length + " rotas no mesmo motorista, conferir" : "")
            ),
          ]),
        ]
      : []),
  ].join("\n");
}

export type DadosStart = {
  metricas: MetricasStart;
  rotasConfig: number | null;
  aceitos: number | null;
  recusados: number | null;
  estimadosInicio: number | null;

  forecast: number | null;
  backlog: number | null;
  nocAtualizadoEm: string;
  temAtribuicao: boolean;

  atribuicaoEm: string;

  lidoEm: string;
};
