import { chaveId, chaveRota } from "./hb.ts";
import { clusterDoNome, falhou, finalizada, type PlanoParada, type RotaMonitoring, type Visita } from "./monitorD0.ts";
import { totalColetado, totalEstimado, totalPreparado, type LinhaMonitoring } from "./monitoringSeller.ts";

export const JANELA_PROXIMAS_MIN = 120;
export const MINIMO_SOBRA = 150;
export const OCUPACAO_ALTA = 0.9;

export type RotaConfigMapa = {
  rota: string;
  veiculo: string;
  transportadora: string;

  uso: number | null;
};

export type TipoRotaMapa = "prog" | "apoio" | "avulsa";

export type RotaMapa = {
  chave: string;
  tipo: TipoRotaMapa | null;
  rota: string;
  rotaId: string;
  transportadora: string;
  veiculo: string;

  janela: string;
  inicioMin: number | null;
  passou: boolean;

  cancelada: boolean;

  coletados: number | null;

  restantes: number | null;

  coletadoNaRota: number;

  proxima: boolean;
  uso: number | null;

  recebe: boolean;

  outros: { id: string; nome: string; sobra: number }[];
};

export type RiscoMapa = "alto" | "medio" | "sem";

export type PontoMapa = {
  id: string;
  nome: string;
  cluster: string;
  estimados: number;
  preparados: number;
  coletados: number;
  sobra: number;
  risco: RiscoMapa;
  motivo: string;
  rotas: RotaMapa[];
  atualizadoEm: string;

  rotasConsultadasEm: string;
};

export type EntradaMapa = {
  monitoring: LinhaMonitoring[];
  plano: PlanoParada[];
  rotasConfig: RotaConfigMapa[];
  rotasPontos: RotaMonitoring[];
  visitas: Pick<
    Visita,
    "rota" | "rotaId" | "rotaSemNome" | "idParada" | "visitada" | "coletados" | "janela" | "transportadora" | "planejado"
  >[];
  agoraMin: number;
};

export function inicioDaJanela(janela: string): number | null {
  const m = String(janela ?? "").match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (min: number) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

export function mapearPontos(e: EntradaMapa): PontoMapa[] {
  const config = new Map(e.rotasConfig.map((r) => [chaveRota(r.rota), r]));
  const planoPorPonto = new Map<string, PlanoParada[]>();
  for (const p of e.plano) {
    const k = chaveId(p.idParada);
    if (k) planoPorPonto.set(k, [...(planoPorPonto.get(k) ?? []), p]);
  }
  const apiPorPonto = new Map<string, RotaMonitoring[]>();
  for (const r of e.rotasPontos) {
    const k = chaveId(r.idParada);
    if (k) apiPorPonto.set(k, [...(apiPorPonto.get(k) ?? []), r]);
  }

  const passou = new Set<string>();
  const coletadoRel = new Map<string, number>();

  const planejadoRel = new Map<string, boolean>();
  const visitasPorPonto = new Map<string, EntradaMapa["visitas"]>();

  const cargaRota = new Map<string, number>();
  for (const v of e.visitas) {
    if (v.coletados > 0) {
      for (const c of [v.rotaId ? "ID:" + v.rotaId : "", v.rota && !v.rotaSemNome ? "N:" + chaveRota(v.rota) : ""]) {
        if (c) cargaRota.set(c, (cargaRota.get(c) ?? 0) + v.coletados);
      }
    }
    const k = chaveId(v.idParada);
    if (k) visitasPorPonto.set(k, [...(visitasPorPonto.get(k) ?? []), v]);
    const plan = String(v.planejado ?? "").trim().toLowerCase();
    if (plan) {
      if (v.rotaId) planejadoRel.set(k + "|ID:" + v.rotaId, plan.startsWith("s"));
      if (v.rota) planejadoRel.set(k + "|N:" + chaveRota(v.rota), plan.startsWith("s"));
    }
    if (!v.visitada) continue;
    const chaves = [v.rotaId ? k + "|ID:" + v.rotaId : "", v.rota ? k + "|N:" + chaveRota(v.rota) : ""].filter(Boolean);
    for (const c of chaves) {
      passou.add(c);
      coletadoRel.set(c, (coletadoRel.get(c) ?? 0) + (v.coletados || 0));
    }
  }

  const pontos: PontoMapa[] = [];
  const vistos = new Set<string>();
  for (const l of e.monitoring) {
    const id = chaveId(l.entidade || l.customerId);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const E = totalEstimado(l);
    const P = totalPreparado(l);
    const C = totalColetado(l);
    const resta = E - C;
    if (resta < MINIMO_SOBRA) continue;

    const rotas = new Map<string, RotaMapa>();
    const doPlano = new Set((planoPorPonto.get(id) ?? []).map((p) => chaveRota(p.rota)));
    const nova = (r: {
      rota: string;
      rotaId: string;
      janela: string;
      inicioMin: number | null;
      transportadora?: string;
      veiculo?: string;
      passou?: boolean;
      cancelada?: boolean;

      daTela?: boolean;
      coletados?: number | null;
      restantes?: number | null;
      semNome?: boolean;
    }): RotaMapa => {
      const n = chaveRota(r.rota);
      const cfg = config.get(n);
      const porId = r.rotaId ? id + "|ID:" + r.rotaId : "";
      const rel = (porId ? coletadoRel.get(porId) : undefined) ?? coletadoRel.get(id + "|N:" + n);
      const plan = (porId ? planejadoRel.get(porId) : undefined) ?? planejadoRel.get(id + "|N:" + n);
      const tipo: TipoRotaMapa | null =
        r.semNome || /^avulsa\b/i.test(r.rota)
          ? "avulsa"
          : plan !== undefined
            ? plan
              ? "prog"
              : "apoio"
            : doPlano.has(n)
              ? "prog"
              : doPlano.size
                ? "apoio"
                : null;
      return {
        chave: r.rotaId || n,
        tipo,
        rota: r.rota,
        rotaId: r.rotaId,
        transportadora: r.transportadora || cfg?.transportadora || "",
        veiculo: r.veiculo || cfg?.veiculo || "",
        janela: r.janela,
        inicioMin: r.inicioMin,
        passou: r.daTela ? !!r.passou : !!r.passou || (!!porId && passou.has(porId)) || passou.has(id + "|N:" + n),
        cancelada: !!r.cancelada,
        coletados: r.coletados ?? rel ?? null,
        restantes: r.restantes ?? null,
        coletadoNaRota: (r.rotaId ? cargaRota.get("ID:" + r.rotaId) : undefined) ?? cargaRota.get("N:" + n) ?? 0,
        proxima: false,
        uso: cfg?.uso ?? null,
        recebe: false,
        outros: [],
      };
    };

    const jaTem = (rota: string, rotaId: string) =>
      [...rotas.values()].some((x) => (!!rotaId && x.rotaId === rotaId) || (!!rota && chaveRota(x.rota) === chaveRota(rota)));

    for (const r of apiPorPonto.get(id) ?? []) {
      const k = (r.rotaId || chaveRota(r.rota)) + "|" + r.janela;
      if (rotas.has(k)) continue;
      rotas.set(
        k,
        nova({
          rota: r.rota,
          rotaId: r.rotaId,
          janela: r.janela,
          inicioMin: inicioDaJanela(r.janela),
          transportadora: r.transportadora,
          veiculo: r.veiculo,
          passou: !falhou(r.status) && (finalizada(r.status) || r.coletados > 0),
          cancelada: falhou(r.status),
          daTela: true,
          coletados: r.coletados,
          restantes: r.restantes,
        }),
      );
    }
    for (const v of visitasPorPonto.get(id) ?? []) {
      const rota = v.rotaSemNome ? "Avulsa " + v.rotaId : v.rota;
      if (!rota || jaTem(v.rotaSemNome ? "" : v.rota, v.rotaId)) continue;
      const janela = String(v.janela ?? "").replace(/\s*hs?$/i, "");
      rotas.set(
        v.rotaId || chaveRota(rota),
        nova({ rota, rotaId: v.rotaId, janela, inicioMin: inicioDaJanela(janela), transportadora: v.transportadora, semNome: v.rotaSemNome }),
      );
    }
    for (const p of planoPorPonto.get(id) ?? []) {
      if (!chaveRota(p.rota) || jaTem(p.rota, "")) continue;
      rotas.set(chaveRota(p.rota), nova({ rota: p.rota, rotaId: "", janela: p.inicio ? "início " + p.inicio : "", inicioMin: inicioDaJanela(p.inicio) }));
    }
    const lista = [...rotas.values()].sort((a, b) => (a.inicioMin ?? 9999) - (b.inicioMin ?? 9999));
    for (const r of lista) r.proxima = !r.passou && !r.cancelada && r.inicioMin !== null && r.inicioMin <= e.agoraMin + JANELA_PROXIMAS_MIN;
    const pendentes = lista.filter((r) => !r.passou && !r.cancelada);
    const proximas = pendentes.filter((r) => r.proxima);
    const depois = pendentes.filter((r) => !r.proxima);

    const disponivel = Math.max(0, P - C);
    const faltaPreparar = Math.max(0, resta - disponivel);
    let sobra = 0;
    let risco: RiscoMapa = "medio";
    let motivo = "";
    let recebe: RotaMapa | null = null;
    if (!pendentes.length) {
      sobra = resta;
      risco = "alto";
      motivo = "Sem rota a passar e " + int(resta) + " pcts por coletar.";
    } else if (proximas.length && faltaPreparar >= MINIMO_SOBRA) {
      sobra = faltaPreparar;
      const quando = (r: RotaMapa) => (r.inicioMin !== null ? " (" + hhmm(r.inicioMin) + ")" : "");
      const levam =
        proximas.length === 1 ? "A rota das próximas 2h leva" : "As " + proximas.length + " rotas das próximas 2h levam";
      if (depois.length) {
        recebe = depois[depois.length - 1];
        motivo =
          levam + " no máximo os " + int(disponivel) + " preparados; sobram " + int(sobra) + " pcts para a " +
          recebe.rota + quando(recebe) + ".";
        if (recebe.uso !== null && recebe.uso >= OCUPACAO_ALTA) {
          risco = "alto";
          motivo += " Ela já sai com " + Math.round(recebe.uso * 100) + "% da capacidade.";
        }
      } else {
        recebe = proximas[proximas.length - 1];
        risco = "alto";
        motivo = levam + " no máximo os " + int(disponivel) + " preparados e não tem rota depois: sobram " + int(sobra) + " pcts.";
      }
    } else {
      risco = "sem";
      motivo = proximas.length
        ? "As rotas das próximas 2h levam os " + int(disponivel) + " preparados; faltam preparar " + int(faltaPreparar) +
          " pcts (menos de " + MINIMO_SOBRA + ")."
        : "Próxima rota " + (pendentes[0].inicioMin !== null ? "às " + hhmm(pendentes[0].inicioMin) : "sem horário") +
          ", depois das próximas 2h: ainda dá tempo de preparar.";
    }
    if (recebe) recebe.recebe = true;
    const cluster =
      lista.map((r) => clusterDoNome(r.rota)).find(Boolean) ?? "Sem cluster";
    pontos.push({
      id,
      nome: l.nome,
      cluster,
      estimados: E,
      preparados: P,
      coletados: C,
      sobra,
      risco,
      motivo,
      rotas: lista,
      atualizadoEm: l.atualizadoEm,
      rotasConsultadasEm: (apiPorPonto.get(id) ?? [])
        .map((r) => r.atualizadoEm)
        .reduce((a, b) => (b.slice(11) > a.slice(11) ? b : a), ""),
    });
  }

  const porRota = new Map<string, Set<PontoMapa>>();
  for (const p of pontos) {
    if (p.risco === "sem") continue;
    for (const r of p.rotas) if (!r.passou && !r.cancelada) porRota.set(r.chave, (porRota.get(r.chave) ?? new Set()).add(p));
  }
  for (const p of pontos) {
    for (const r of p.rotas) {
      if (r.passou || r.cancelada) continue;
      r.outros = [...(porRota.get(r.chave) ?? [])]
        .filter((o) => o !== p)
        .map((o) => ({ id: o.id, nome: o.nome, sobra: o.sobra }));
      if (r.recebe && r.outros.length && p.risco === "medio") {
        p.risco = "alto";
        p.motivo += " A rota também passa em " + r.outros.length + (r.outros.length === 1 ? " outro ponto" : " outros pontos") + " em risco.";
      }
    }
  }

  const ordem: Record<RiscoMapa, number> = { alto: 0, medio: 1, sem: 2 };
  return pontos.sort(
    (a, b) =>
      ordem[a.risco] - ordem[b.risco] || b.sobra - a.sobra || b.estimados - b.coletados - (a.estimados - a.coletados),
  );
}
