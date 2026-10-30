import { chaveRota } from "./hb.ts";
import { clusterDoNome, type PlanoParada, type Visita } from "./monitorD0.ts";
import type { RiscoMelione } from "./melioneEntregas.ts";
import type { Pontualidade } from "./relatorioTipos.ts";

const texto = (v: unknown) => String(v ?? "").trim();

export const TOLERANCIA_LOGIN_MIN = 15;

export const ANTECEDENCIA_SEM_LOGIN_MIN = 30;

export type RotaSistemaHoje = {
  rotaId: string;
  rota: string;
  transportadora: string;

  status: string;

  inicioPlanejado: string;
  inicioRota: string;
};

const hhmm = (v: string) => texto(v).match(/(\d{2}):(\d{2})(?::\d{2})?$/)?.slice(1, 3).join(":") ?? "";

const minutosDaJanela = (j: string) => {
  const m = texto(j).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const minutos = (h: string) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null);

export function lerRotasSistemaHoje(linhas: string[][], dataBR: string): RotaSistemaHoje[] {
  if (linhas.length < 2) return [];
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    id: i("ROUTE_ID"),
    rota: i("ROTA"),
    transp: i("TRANSPORTADORA"),
    status: i("STATUS"),
    plan: i("INICIO_PLANEJADO"),
    inicio: i("INICIO_ROTA"),
  };
  if (c.data < 0 || c.status < 0) return [];
  const v = (l: string[], k: number) => (k < 0 ? "" : texto(l[k]));
  return linhas
    .slice(1)
    .filter((l) => v(l, c.data) === dataBR)
    .map((l) => ({
      rotaId: v(l, c.id),
      rota: v(l, c.rota),
      transportadora: v(l, c.transp),
      status: v(l, c.status).toLowerCase(),
      inicioPlanejado: hhmm(v(l, c.plan)),
      inicioRota: hhmm(v(l, c.inicio)),
    }));
}

export type SituacaoLogin = "semLogin" | "loginAtrasado" | "logou" | "aguardando";

export type PontualidadeRota = {
  chave: string;
  rota: string;
  rotaId: string;
  transportadora: string;
  cluster: string;
  inicioPlanejado: string;
  inicioRota: string;

  logou: boolean;
  login: SituacaoLogin;

  melione?: boolean;
  entregas?: RiscoMelione | null;

  atrasoLoginMin: number | null;

  primeiroBip: { hora: string; parada: string; pontualidade: Pontualidade | null } | null;

  primeiraJanela: { texto: string; parada: string; fimMin: number } | null;

  primeiroAtrasado: boolean;
  paradas: { cedo: number; tarde: number; noHorario: number; total: number };
};

export function pontualidadeDasRotas(
  visitas: Visita[],
  plano: PlanoParada[],
  sistema: RotaSistemaHoje[],
  agoraMin: number | null,
): PontualidadeRota[] {
  const porChave = new Map<string, PontualidadeRota>();

  const porNome = new Map<string, string>();
  const nova = (rota: string, rotaId: string, transportadora: string): PontualidadeRota => ({
    chave: rotaId ? "ID:" + rotaId : chaveRota(rota),
    rota: rota || (rotaId ? "Avulsa " + rotaId : ""),
    rotaId,
    transportadora,
    cluster: clusterDoNome(rota) ?? "Sem cluster",
    inicioPlanejado: "",
    inicioRota: "",
    logou: false,
    login: "aguardando",
    atrasoLoginMin: null,
    primeiroBip: null,
    primeiraJanela: null,
    primeiroAtrasado: false,
    paradas: { cedo: 0, tarde: 0, noHorario: 0, total: 0 },
  });

  const iniJanela = new Map<string, number>();
  const achar = (rota: string, rotaId: string) =>
    (rotaId && porChave.get("ID:" + rotaId)) || porChave.get(porNome.get(chaveRota(rota)) ?? "") || null;
  const guardar = (r: PontualidadeRota) => {
    porChave.set(r.chave, r);
    if (r.rota && !r.rota.startsWith("Avulsa ")) porNome.set(chaveRota(r.rota), r.chave);
  };

  for (const s of sistema) {
    if (!s.rota && !s.rotaId) continue;
    const r = achar(s.rota, s.rotaId) ?? nova(s.rota, s.rotaId, s.transportadora);
    r.inicioPlanejado = s.inicioPlanejado || r.inicioPlanejado;
    r.inicioRota = s.inicioRota || r.inicioRota;
    if (r.inicioRota || s.status === "active" || s.status === "close") r.logou = true;
    guardar(r);
  }
  for (const v of visitas) {
    const r = achar(v.rota, v.rotaId) ?? nova(v.rotaSemNome ? "" : v.rota, v.rotaId, v.transportadora);
    if (!r.transportadora) r.transportadora = v.transportadora;

    r.logou = true;
    const ini = minutosDaJanela(v.janela);
    if (ini !== null && v.janelaFimMin !== null && (!iniJanela.has(r.chave) || ini < (iniJanela.get(r.chave) as number))) {
      iniJanela.set(r.chave, ini);
      r.primeiraJanela = { texto: v.janela, parada: v.nomeParada || v.idParada, fimMin: v.janelaFimMin };
    }
    if (v.visitada) {
      if (v.pontualidade) {
        r.paradas.total++;
        if (v.pontualidade === "early") r.paradas.cedo++;
        else if (v.pontualidade === "late") r.paradas.tarde++;
        else r.paradas.noHorario++;
      }
      if (v.hora && (!r.primeiroBip || v.hora < r.primeiroBip.hora)) {
        r.primeiroBip = { hora: v.hora, parada: v.nomeParada || v.idParada, pontualidade: v.pontualidade };
      }
    }
    guardar(r);
  }

  for (const p of plano) {
    if (!p.rota) continue;
    const r = achar(p.rota, "") ?? nova(p.rota, "", "");
    if (!r.inicioPlanejado && p.inicio) r.inicioPlanejado = p.inicio;
    guardar(r);
  }

  for (const r of porChave.values()) {
    r.primeiroAtrasado =
      r.logou && !r.primeiroBip && r.primeiraJanela !== null && agoraMin !== null && agoraMin > r.primeiraJanela.fimMin;
    const plan = minutos(r.inicioPlanejado);
    const logou = minutos(r.inicioRota);
    if (r.logou) {
      const atraso = plan !== null && logou !== null ? logou - plan : null;
      r.atrasoLoginMin = atraso;
      r.login = atraso !== null && atraso > TOLERANCIA_LOGIN_MIN ? "loginAtrasado" : "logou";
    } else if (plan !== null && agoraMin !== null && agoraMin >= plan - ANTECEDENCIA_SEM_LOGIN_MIN) {
      r.login = "semLogin";
      r.atrasoLoginMin = agoraMin - plan;
    } else {
      r.login = "aguardando";
    }
  }
  return [...porChave.values()].filter((r) => r.rota);
}

export type ProblemaPontualidade =
  | "semLogin"
  | "loginAtrasado"
  | "primeiroAtrasado"
  | "bipCedo"
  | "bipTarde"
  | "coletaCedo"
  | "coletaTarde";

export const ROTULO_PROBLEMA: Record<ProblemaPontualidade, string> = {
  semLogin: "Sem login",
  loginAtrasado: "Login atrasado",
  primeiroAtrasado: "1º atrasado",
  bipCedo: "1º bip cedo",
  bipTarde: "1º bip tarde",
  coletaCedo: "Coleta cedo",
  coletaTarde: "Coleta tarde",
};

export function problemasDa(r: PontualidadeRota): ProblemaPontualidade[] {
  const p: ProblemaPontualidade[] = [];
  if (r.login === "semLogin") p.push("semLogin");
  if (r.login === "loginAtrasado") p.push("loginAtrasado");
  if (r.primeiroAtrasado) p.push("primeiroAtrasado");
  if (r.primeiroBip?.pontualidade === "early") p.push("bipCedo");
  if (r.primeiroBip?.pontualidade === "late") p.push("bipTarde");
  if (r.paradas.cedo > 0) p.push("coletaCedo");
  if (r.paradas.tarde > 0) p.push("coletaTarde");
  return p;
}
