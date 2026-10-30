import { chaveId, chaveRota } from "./hb.ts";
import { culpaPrevia, falhou, finalizada, type CulpaPrevia, type PlanoParada, type RotaMonitoring, type Visita } from "./monitorD0.ts";
import type { Pontualidade } from "./relatorioTipos.ts";

export type SituacaoBusca = "passou" | "emRota" | "semInicio" | "cancelada";

export type PassagemBusca = {
  rota: string;
  rotaId: string;
  transportadora: string;
  janela: string;

  hora: string;
  oc: string;
  culpa: CulpaPrevia | null;
  pontualidade: Pontualidade | null;
  estimados: number | null;
  coletados: number | null;
  situacao: SituacaoBusca;
  fonte: "relatorio" | "monitoramento" | "plano";
};

export type PontoAchado = { id: string; nome: string };

export type ResultadoBusca = {
  id: string;
  nome: string;
  passagens: PassagemBusca[];
};

const texto = (v: unknown) => String(v ?? "").trim();
const semAcento = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const inicioDe = (j: string) => j.match(/(\d{1,2}):(\d{2})/)?.slice(1, 3).map((x) => x.padStart(2, "0")).join(":") ?? "";

export type FontesBusca = {
  visitas: Visita[];
  rotasPontos: RotaMonitoring[];
  plano: PlanoParada[];

  nomes?: Record<string, string>;
};

function pontosConhecidos(f: FontesBusca): Map<string, string> {
  const m = new Map<string, string>();
  const por = (id: string, nome: string) => {
    const k = chaveId(id);
    if (!k) return;
    if (!m.get(k)) m.set(k, texto(nome));
  };
  for (const v of f.visitas) por(v.idParada, v.nomeParada);
  for (const [id, nome] of Object.entries(f.nomes ?? {})) por(id, nome);
  for (const r of f.rotasPontos) por(r.idParada, "");
  for (const p of f.plano) por(p.idParada, "");
  return m;
}

export function acharPontos(q: string, f: FontesBusca): PontoAchado[] {
  const bruto = texto(q);
  if (!bruto) return [];
  const id = chaveId(bruto);
  const todos = pontosConhecidos(f);
  if (todos.has(id)) return [{ id, nome: todos.get(id) || id }];
  const alvo = semAcento(bruto);
  const saida: PontoAchado[] = [];
  for (const [k, nome] of todos) {
    const porId = id.length >= 4 && k.toLowerCase().includes(id.toLowerCase());
    const porNome = alvo.length >= 3 && !!nome && semAcento(nome).includes(alvo);
    if (porId || porNome) saida.push({ id: k, nome: nome || k });
    if (saida.length >= 20) break;
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function buscarPonto(idBruto: string, f: FontesBusca): ResultadoBusca {
  const id = chaveId(idBruto);
  const nomes = pontosConhecidos(f);
  const doPonto = (x: string) => chaveId(x) === id;
  const passagens: PassagemBusca[] = [];

  const vistas = new Set<string>();
  const marcar = (rota: string, rotaId: string) => {
    if (rotaId) vistas.add("ID:" + rotaId);
    if (rota) vistas.add("N:" + chaveRota(rota));
  };
  const jaTem = (rota: string, rotaId: string) =>
    (!!rotaId && vistas.has("ID:" + rotaId)) || (!!rota && vistas.has("N:" + chaveRota(rota)));

  for (const v of f.visitas.filter((v) => doPonto(v.idParada))) {
    const rota = v.rotaSemNome ? "Avulsa " + v.rotaId : v.rota;
    passagens.push({
      rota,
      rotaId: v.rotaId,
      transportadora: v.transportadora,
      janela: v.janela,
      hora: v.hora,
      oc: v.motivo,
      culpa: culpaPrevia(v),
      pontualidade: v.pontualidade,
      estimados: v.estimados,
      coletados: v.coletados,
      situacao: v.visitada ? "passou" : "emRota",
      fonte: "relatorio",
    });
    marcar(v.rotaSemNome ? "" : v.rota, v.rotaId);
  }

  for (const r of f.rotasPontos.filter((r) => doPonto(r.idParada))) {
    if (jaTem(r.rota, r.rotaId)) continue;
    const cancelada = falhou(r.status);
    passagens.push({
      rota: r.rota,
      rotaId: r.rotaId,
      transportadora: r.transportadora,
      janela: r.janela,
      hora: "",
      oc: cancelada ? "Cancelada na tela" : "",
      culpa: null,
      pontualidade: null,
      estimados: r.preparados,
      coletados: r.coletados,
      situacao: cancelada ? "cancelada" : finalizada(r.status) || r.coletados > 0 ? "passou" : "semInicio",
      fonte: "monitoramento",
    });
    marcar(r.rota, r.rotaId);
  }

  for (const p of f.plano.filter((p) => doPonto(p.idParada))) {
    if (jaTem(p.rota, "")) continue;
    passagens.push({
      rota: p.rota,
      rotaId: "",
      transportadora: "",
      janela: p.inicio ? "início " + p.inicio : "",
      hora: "",
      oc: "",
      culpa: null,
      pontualidade: null,
      estimados: null,
      coletados: null,
      situacao: "semInicio",
      fonte: "plano",
    });
    marcar(p.rota, "");
  }

  passagens.sort((a, b) => {
    if (!!a.hora !== !!b.hora) return a.hora ? -1 : 1;
    return (a.hora || inicioDe(a.janela)).localeCompare(b.hora || inicioDe(b.janela)) || a.rota.localeCompare(b.rota, "pt-BR");
  });
  return { id, nome: nomes.get(id) || id, passagens };
}
