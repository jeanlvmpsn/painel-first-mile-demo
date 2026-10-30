"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  chaveOcorrencia,
  clusterDaVisita,
  fotoDaRota,
  culpOpPorCluster,
  desvioDeForecast,
  linhaCulpOp,
  MINIMO_CULP_OP,
  ocorrenciasDoDia,
  opsDoCluster,
  clusterDoNome,
  preocupa,
  riscoDoHistorico,
  TRATATIVAS_HXH,
  ocDependeDeHandshake,
  type Cobertura,
  type DesvioForecast,
  type ConsultaPonto,
  type HistoricoPonto,
  type Nivel,
  type Ocorrencia,
  type PlanoParada,
  type RiscoHistorico,
  type RotaMonitoring,
  type EstimadoRota,
  type RotaDoPonto,
  type SaldoPonto,
  type Tratativa,
  type Visita,
} from "../../lib/monitorD0";
import { chaveId, chaveRota } from "../../lib/hb";
import { filtroCps } from "../../lib/hubMonitor";
import { ehExpress10, janelaDaRota, minutosDe, riscoExpress, type EntregasExpress, type RiscoExpress } from "../../lib/expressEntregas";
import ChipRiscoExpress from "./ChipRiscoExpress";
import { pontualidadeDasRotas, type RotaSistemaHoje } from "../../lib/pontualidadeRotas";
import PainelPontualidade from "./PainelPontualidade";
import BuscaPonto from "./BuscaPonto";
import { chaveNs, STATUS_NS, type MarcaNs, type StatusNs } from "../../lib/nsDriverStatus";
import QuadroExpress, { type LinhaExpress } from "./QuadroExpress";
import { VisaoMapeamento } from "./VisaoMapeamento";
import {
  comentarioDeHoje,
  EditorComentario,
  ResumoComentario,
  useComentariosPd,
  type Comentarios,
  VisaoComentarios,
  type Comentarios as ComentariosDosPontos,
} from "./ComentariosPd";
import type { PontoMapa } from "../../lib/mapeamento";
import { useAcoesPontos, VisaoAcoes, type NomeDoPonto } from "./AcoesPontos";
import { CHIP, FAIXA } from "../ui/cores";
import { Campo, MultiSelect } from "../ui/filtros";

const RELER_MIN = 5;

const PAUSA_EDICAO_MIN = 5;
const CHAVE_AUTOR = "monitorD0.autor";
const CHAVE_GRAFICOS = "monitorD0.graficosFechados";
const CHAVE_QUADRO_EXPRESS = "monitorD0.quadroExpressFechado";
const SEM_TRATATIVA = "Sem tratativa";

const int = (n: number) => n.toLocaleString("pt-BR");

const coletadoDe = (o: Ocorrencia) => Math.max(0, o.visita.estimados - o.deixados + o.revertidos);

type Item = Ocorrencia & {
  cluster: string;
  ops: string;
  chave: string;
  trat: Tratativa | undefined;
  hist: HistoricoPonto | undefined;
  risco: RiscoHistorico;

  excluidoDe: number;

  consulta: ConsultaPonto | undefined;

  forecast: DesvioForecast | null;
};

function ChipForecast({ f }: { f: DesvioForecast | null }) {
  if (!f) return null;
  const backlog = f.tipo === "backlog";
  return (
    <span
      title={
        "Projeção da config: " + int(f.projetado) + " pcts · estimado no ponto: " + int(f.real) + " pcts" +
        (f.deixadosAntes !== null ? " · backlog de dias anteriores: " + int(f.deixadosAntes) : "")
      }
      className={
        "rounded border px-1.5 py-0.5 text-[11px] font-semibold " +
        (backlog ? "border-slate-400 bg-slate-100 text-slate-700" : "border-[#7c3aed] bg-[#f3edff] text-[#5b21b6]")
      }
    >
      {(backlog ? "Backlog +" : "Desvio de forecast +") + int(f.desvio)}
    </span>
  );
}

const ehVetor = (t: string) => /grupo\s+vetor/i.test(t);

const ocDe = (o: Ocorrencia) => (o.visita.visitada ? o.visita.motivo || "Sem OC" : "Sem passagem");

const semDetalheDoPonto = (o: Item) => !o.rotasDoPonto.some((r) => r.restantes !== undefined);

const horaDaConsulta = (em: string) => em.match(/(\d{2}:\d{2})(?::\d{2})?$/)?.[1] ?? "";

function porQueSemDetalhe(c: ConsultaPonto | undefined): string {
  if (!c) return "o script ainda não consultou este ponto hoje";
  const as = horaDaConsulta(c.em) ? " das " + horaDaConsulta(c.em) : "";
  if (c.resultado === "erro") return "a consulta" + as + " falhou" + (c.detalhe ? ": " + c.detalhe : "");
  return "a consulta" + as + " voltou sem rotas";
}

const linkRota = (id: string) => "/demo/rota/" + encodeURIComponent(id);

function LinkRota({ id, children }: { id: string; children: React.ReactNode }) {
  if (!id) return <>{children}</>;
  return (
    <a
      href={linkRota(id)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
    >
      {children}
    </a>
  );
}

type Acoes = {
  autor: string;
  salvar: (o: Item, patch: Partial<Tratativa>) => Promise<string | null>;

  motivos: string[];
  novoMotivo: (m: string) => Promise<string | null>;

  comentarios: Comentarios;
  hojeBR: string;
};

const FotosCtx = createContext<Record<string, string>>({});

type ExpressInfo = { rotas: Set<string>; risco: (rota: string, rotaId: string) => RiscoExpress | null };
const ExpressCtx = createContext<ExpressInfo>({ rotas: new Set(), risco: () => null });

const linkEntregas = (id: string) =>
  "/demo/rota/" + encodeURIComponent(id) + "?site=MLB";

function ChipExpress({ rota, rotaId }: { rota: string; rotaId: string }) {
  const { rotas: express, risco } = useContext(ExpressCtx);
  if (!express.has(chaveRota(rota)) && !(rotaId && express.has("ID:" + rotaId))) return null;
  return (
    <>
      <ChipExpressLink rotaId={rotaId} />
      <ChipRiscoExpress r={risco(rota, rotaId)} />
    </>
  );
}

function ChipExpressLink({ rotaId }: { rotaId: string }) {
  return rotaId ? (
    <a
      href={linkEntregas(rotaId)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Rota Express: faz as entregas antes das coletas. Abre o monitoramento das entregas (Last Mile)."
      className="rounded border border-[#0e7490] bg-[#ecfeff] px-1.5 text-[11px] font-semibold text-[#0e7490] hover:bg-[#cffafe]"
    >
      Express · entregas ↗
    </a>
  ) : (
    <span title="Rota Express: faz as entregas antes das coletas." className="rounded border border-[#0e7490] bg-[#ecfeff] px-1.5 text-[11px] font-semibold text-[#0e7490]">
      Express
    </span>
  );
}

function FotoForms({ rota, rotaId }: { rota: string; rotaId: string }) {
  const fotos = useContext(FotosCtx);
  const url = fotoDaRota(fotos, rota, rotaId);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Foto do baú enviada no Forms Final de Rota"
      className="rounded border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-blue-700 hover:bg-slate-50"
    >
      📷 foto Forms
    </a>
  );
}

const AcoesCtx = createContext<Acoes>({
  autor: "",
  salvar: async () => null,
  motivos: [],
  novoMotivo: async () => null,
  comentarios: { comentarios: {}, erro: null, salvar: async () => null },
  hojeBR: "",
});

function BotaoComentario({ o }: { o: Item }) {
  const { autor, comentarios, hojeBR } = useContext(AcoesCtx);
  const [aberto, setAberto] = useState(false);
  const atual = comentarioDeHoje(comentarios, hojeBR, o.visita.idParada);
  const antigo = o.trat?.comentario ?? "";
  const resumo = atual ? [atual.obs, atual.comentario].filter(Boolean).join(" · ") : antigo;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
        title={resumo ? "Comentário do ponto: " + resumo : "Escrever comentário do ponto"}
        className={
          "rounded border px-1.5 text-[11px] font-medium " +
          (resumo ? "border-[#2563eb] bg-[#eef4ff] text-[#1e40af] hover:bg-[#dfe9ff]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
        }
      >
        💬 comentário{resumo ? " ✓" : ""}
      </button>

      {aberto && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setAberto(false);
          }}
        >
          <div
            role="dialog"
            aria-label="Comentário do ponto"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg"
          >
            <p className="text-sm font-semibold text-slate-900">
              {o.visita.nomeParada || o.visita.idParada}
              <span className="ml-1.5 font-mono text-[11px] font-normal text-slate-400">{o.visita.idParada}</span>
            </p>
            <p className="text-xs text-slate-500">
              Comentário do ponto hoje: o mesmo nas abas Impactos, HxH, PD e NS driver.
              {atual ? " Último: " + (atual.autor || "—") + " · " + atual.registradoEm : ""}
            </p>
            {!atual && antigo && <p className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">Comentário anterior desta passagem: {antigo}</p>}
            <EditorComentario
              ponto={{ idParada: o.visita.idParada, ponto: o.visita.nomeParada, cluster: o.cluster }}
              atual={atual}
              inicial={antigo}
              autor={autor}
              hojeBR={hojeBR}
              salvar={comentarios.salvar}
              fechar={() => setAberto(false)}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const ROTULO_RISCO: Record<RiscoHistorico, string> = {
  recorrente: "Perda recorrente",
  eventual: "Perda eventual",
  semPerda: "Sem perda em 30 dias",
  semHistorico: "Sem histórico",
};
const CHIP_RISCO: Record<RiscoHistorico, string> = {
  recorrente: "bg-[#fdeceb] text-[#94160e]",
  eventual: "bg-[#fdf3e4] text-[#8a5210]",
  semPerda: "bg-[#e6f6f0] text-[#0f6b4e]",
  semHistorico: "bg-slate-100 text-slate-500",
};

const pct = (n: number) => (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const isoParaBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);

const SITUACAO_ROTA = {
  passou: { rotulo: "Passou", classe: "bg-[#e6f6f0] text-[#0f6b4e]" },
  aguardando: { rotulo: "Em rota", classe: "bg-[#fdf3e4] text-[#8a5210]" },
  semInicio: { rotulo: "Sem início", classe: "bg-slate-100 text-slate-600" },
  falhou: { rotulo: "Falhou", classe: "bg-[#fdeceb] text-[#94160e]" },
} as const;

function RotasDoPonto({ o }: { o: Item }) {
  const [aberto, setAberto] = useState(false);
  if (o.rotasDoPonto.length <= 1) return null;
  const faltam = o.rotasDoPonto.filter((r) => r.situacao === "aguardando" || r.situacao === "semInicio").length;
  const doMonitoramento = o.rotasDoPonto.some((r) => r.restantes !== undefined);

  const consultado = o.rotasDoPonto
    .map((r) => r.consultadoEm?.match(/(\d{2}:\d{2})(?::\d{2})?$/)?.[1] ?? "")
    .filter(Boolean)
    .sort()
    .pop();
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-1 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-100"
      >
        <span className="w-3 text-slate-400">{aberto ? "▾" : "▸"}</span>
        <span>
          <b>{o.rotasDoPonto.length} rotas</b> no ponto hoje ·{" "}
          {faltam ? <b className="text-[#8a5210]">{faltam} ainda {faltam === 1 ? "vai passar" : "vão passar"}</b> : "nenhuma outra prevista"}
          <span className="ml-2 text-slate-400">
            {doMonitoramento
              ? "fonte: Monitoramento por Sellers" + (consultado ? " · consultado às " + consultado : "")
              : "fonte: relatório de coleta + plano do dia · Monitoramento por Sellers: " + porQueSemDetalhe(o.consulta)}
          </span>
          {doMonitoramento && consultado && o.visita.hora && consultado < o.visita.hora && (
            <b className="ml-2 text-[#8a5210]">consultado antes desta OC ({o.visita.hora}): pode estar desatualizado</b>
          )}
        </span>
      </button>
      {aberto && (
      <table className="w-full text-xs">
        <tbody>
          {o.rotasDoPonto.map((r) => (
            <tr key={(r.rotaId || r.rota) + r.janela} className={"border-t border-slate-100 " + (r.estaOcorrencia ? "bg-[#fff8f7]" : "")}>
              <td className="px-3 py-1.5 font-medium text-slate-800">
                <LinkRota id={r.rotaId}>{r.rota}</LinkRota>
                {r.estaOcorrencia && <span className="ml-1 text-[10px] text-[#94160e]">(esta OC)</span>}
              </td>
              <td className="px-2 py-1.5 text-slate-600">
                {r.transportadora || "—"}
                {r.veiculo && <span className="block text-[10px] text-slate-400">{r.veiculo}</span>}
              </td>
              <td className="px-2 py-1.5 tabular-nums text-slate-600">{r.janela || "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                {r.restantes !== undefined
                  ? `prep ${int(r.preparados ?? 0)} · col ${int(r.coletados)} · rest ${int(r.restantes)}`
                  : r.situacao === "semInicio"
                    ? "—"
                    : int(r.coletados) + " / " + int(r.estimados)}
              </td>
              <td className="px-3 py-1.5 text-right">
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + SITUACAO_ROTA[r.situacao].classe}>
                  {SITUACAO_ROTA[r.situacao].rotulo}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

function LinhaHistorico({ o }: { o: Item }) {
  const h = o.hist;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span className={"rounded px-2 py-0.5 font-medium " + CHIP_RISCO[o.risco]}>{ROTULO_RISCO[o.risco]}</span>
      {h && h.dias > 0 && (
        <span>
          30 dias: perdeu em {h.diasComPerda} de {h.dias} dias · {pct(h.estimados ? h.naoColetados / h.estimados : 0)} não coletado
          {h.ultimaPerda ? " · última " + isoParaBR(h.ultimaPerda) : ""}
          {h.incidentePrincipal ? " · mais comum: " + (h.culpaPrincipal ? h.culpaPrincipal + " " : "") + h.incidentePrincipal : ""}
        </span>
      )}
    </p>
  );
}

function SeletorMotivo({ o }: { o: Item }) {
  const { salvar, motivos, novoMotivo } = useContext(AcoesCtx);
  const [criando, setCriando] = useState(false);
  const [motivoNovo, setMotivoNovo] = useState("");
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const enviar = async (patch: Partial<Tratativa>) => {
    setGravando(true);
    setFalha(await salvar(o, patch));
    setGravando(false);
  };
  return (
    <>
        <select
          aria-label="Motivo do impacto"
          title="Motivo do impacto (vai para o Culp Op do Report de Fechamento)"
          disabled={gravando}
          value={o.trat?.motivoImpacto ?? ""}
          onChange={(e) => enviar({ motivoImpacto: e.target.value })}
          className={
            "rounded-md border bg-white px-2 py-1 disabled:opacity-50 " +
            (o.trat?.motivoImpacto ? "border-[#2563eb] text-[#1e40af]" : "border-slate-300 text-slate-500")
          }
        >
          <option value="">Motivo do impacto…</option>
          {[...new Set([...motivos, o.trat?.motivoImpacto ?? ""])].filter(Boolean).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {criando ? (
          <form
            className="flex items-center gap-1"
            onSubmit={async (e) => {
              e.preventDefault();
              const m = motivoNovo.replace(/\s+/g, " ").trim();
              if (!m) return;
              setGravando(true);
              const erro = await novoMotivo(m);
              setGravando(false);
              if (erro) return setFalha(erro);
              setCriando(false);
              setMotivoNovo("");
              await enviar({ motivoImpacto: motivos.find((x) => x.toLowerCase() === m.toLowerCase()) ?? m });
            }}
          >
            <input
              autoFocus
              value={motivoNovo}
              onChange={(e) => setMotivoNovo(e.target.value)}
              maxLength={80}
              placeholder="Novo motivo"
              className="w-36 rounded-md border border-slate-300 px-2 py-1"
            />
            <button
              type="submit"
              disabled={gravando || !motivoNovo.trim()}
              className="rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white disabled:opacity-50"
            >
              Adicionar
            </button>
            <button type="button" onClick={() => setCriando(false)} className="px-1 text-slate-500 hover:text-slate-800">
              ✕
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCriando(true)}
            title="Adicionar um motivo novo à lista (vale para todo o time)"
            className="rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-100"
          >
            + motivo
          </button>
        )}
        {falha && <span className="text-[#94160e]">Não gravou: {falha}</span>}
    </>
  );
}

function Tratar({ o }: { o: Item }) {
  const { salvar, comentarios, hojeBR } = useContext(AcoesCtx);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const tratado = !!o.trat?.tratado;
  const enviar = async (patch: Partial<Tratativa>) => {
    setGravando(true);
    setFalha(await salvar(o, patch));
    setGravando(false);
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={gravando}
          onClick={() => enviar({ tratado: !tratado })}
          className={
            "rounded-md border px-2.5 py-1 font-medium disabled:opacity-50 " +
            (tratado ? "border-[#1da578] bg-[#e6f6f0] text-[#0f6b4e]" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100")
          }
        >
          {tratado ? "✓ Tratado · desfazer" : "Marcar tratado"}
        </button>
        <BotaoComentario o={o} />
        <SeletorMotivo o={o} />
        {o.excluidoDe > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
            Impacto excluído manualmente ({int(o.excluidoDe)} pcts)
            <BotaoExcluir o={o} desfazer />
          </span>
        )}
        {o.trat && (o.trat.tratado || o.trat.comentario || o.trat.motivoImpacto || o.trat.excluido) && (
          <span className="text-slate-500">
            {o.trat.autor ? o.trat.autor + " · " : ""}
            {o.trat.atualizadoEm}
          </span>
        )}
        {falha && <span className="text-[#94160e]">Não gravou: {falha}</span>}
      </div>
      {(() => {
        const c = comentarioDeHoje(comentarios, hojeBR, o.visita.idParada);
        const texto = c ? [c.obs, c.comentario].filter(Boolean).join(" · ") : o.trat?.comentario;
        return texto ? (
          <p className="mt-1.5 rounded bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
            💬 {texto}
            {c && <span className="ml-1.5 text-[10px] text-slate-400">{c.autor} · {c.registradoEm.slice(11, 16)}</span>}
          </p>
        ) : null;
      })()}
    </div>
  );
}

function BotaoExcluir({ o, desfazer = false }: { o: Item; desfazer?: boolean }) {
  const { salvar } = useContext(AcoesCtx);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const clicar = async () => {
    setGravando(true);
    setFalha(await salvar(o, { excluido: !desfazer }));
    setGravando(false);
  };
  return (
    <>
      {desfazer ? (
        <button
          type="button"
          disabled={gravando}
          onClick={clicar}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          desfazer
        </button>
      ) : (
        <button
          type="button"
          disabled={gravando}
          onClick={clicar}
          aria-label="Excluir impacto"
          title="Excluir impacto: foi revertido e o painel não pegou (sai do Culp Op; dá para desfazer)"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-base leading-none text-slate-500 hover:border-[#cf1f14] hover:bg-[#fdeceb] hover:text-[#94160e] disabled:opacity-50"
        >
          ×
        </button>
      )}
      {falha && <span className="text-xs text-[#94160e]">Não gravou: {falha}</span>}
    </>
  );
}

function VisaoFechamento({ itens, rotasForaDeCps }: { itens: Item[]; rotasForaDeCps: number }) {
  const grupos = useMemo(() => culpOpPorCluster(itens), [itens]);

  const excluidos = useMemo(
    () => itens.filter((o) => o.culpa.culpa === "ME" && o.excluidoDe >= MINIMO_CULP_OP).sort((a, b) => b.excluidoDe - a.excluidoDe),
    [itens],
  );
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternar = (c: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const previa = grupos.slice(0, 3).map(linhaCulpOp);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-900">Impactos do fechamento</h2>
        <p className="text-xs text-slate-500">
          Culpa Operação · pontos com {MINIMO_CULP_OP}+ pacotes pendentes · os 3 maiores clusters entram no Culp Op do Report de
          Fechamento · clique no cluster para marcar o motivo de cada ponto
        </p>
        {rotasForaDeCps > 0 && (
          <p className="mt-1 inline-block rounded-full border border-[#2563eb] bg-[#eef4ff] px-2 py-0.5 text-xs font-semibold text-[#1e40af]">
            Só Campinas, como o report: {rotasForaDeCps} {rotasForaDeCps === 1 ? "rota" : "rotas"} de outros hubs fora
          </p>
        )}
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Assim vai no report</p>
        <pre className="whitespace-pre-wrap font-[inherit] text-sm text-slate-800">
          {"*Culp Op:*\n" + (previa.length ? previa.join("\n") : "___")}
        </pre>
      </div>
      <div className="space-y-2">
        {grupos.map((g, i) => {
          const aberto = abertos.has(g.cluster);
          const comMotivo = g.itens.filter((o) => o.trat?.motivoImpacto).length;
          return (
            <div key={g.cluster} className="overflow-hidden rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => alternar(g.cluster)}
                aria-expanded={aberto}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50"
              >
                <span className="text-slate-400">{aberto ? "▾" : "▸"}</span>
                <span className="text-base font-extrabold text-slate-900">{g.cluster}</span>
                <span className="text-xs text-slate-500">{opsDoCluster(g.cluster)}</span>
                <span className="text-sm text-slate-700">{g.transportadoras.join(" e ")}</span>
                {i < 3 && <span className="rounded-full bg-[#e8effd] px-2 py-0.5 text-xs font-semibold text-[#1e40af]">No report</span>}
                <span className="ml-auto flex items-baseline gap-3">
                  <span className={"text-xs " + (comMotivo === g.itens.length ? "text-[#0f6b4e]" : "text-slate-500")}>
                    {comMotivo} de {g.itens.length} {g.itens.length === 1 ? "ponto" : "pontos"} com motivo
                  </span>
                  <span className="text-lg font-extrabold tabular-nums text-slate-900">{int(g.pacotes)}</span>
                  <span className="text-xs text-slate-500">pcts</span>
                </span>
              </button>
              {aberto && (
                <ul className="divide-y divide-slate-100 border-t border-slate-200 bg-white">
                  {g.itens.map((o) => (
                    <li key={o.chave} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{o.visita.nomeParada || "Ponto sem nome"}</p>
                        <p className="text-xs text-slate-500">
                          #{o.visita.idParada} · {o.visita.rota} · {o.culpa.incidente}
                        </p>
                      </div>
                      <span className="w-20 text-right text-base font-bold tabular-nums text-slate-900">
                        {int(o.pendentes)} <span className="text-xs font-normal text-slate-500">pcts</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <SeletorMotivo o={o} />
                        <BotaoExcluir o={o} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {!grupos.length && (
          <p className="py-6 text-center text-sm text-slate-500">
            Nenhum ponto de culpa Operação com {MINIMO_CULP_OP}+ pacotes pendentes no filtro.
          </p>
        )}
      </div>
      {excluidos.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Excluídos manualmente ({excluidos.length}) · não entram no report
          </p>
          <ul className="divide-y divide-slate-100">
            {excluidos.map((o) => (
              <li key={o.chave} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-500 line-through">{o.visita.nomeParada || "Ponto sem nome"}</p>
                  <p className="text-xs text-slate-500">
                    {o.cluster} · #{o.visita.idParada} · {o.visita.rota}
                    {o.trat?.autor ? " · excluído por " + o.trat.autor : ""}
                    {o.trat?.atualizadoEm ? " · " + o.trat.atualizadoEm : ""}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-slate-500 line-through">{int(o.excluidoDe)} pcts</span>
                <BotaoExcluir o={o} desfazer />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const ROTULO_NIVEL: Record<Nivel, string> = { critico: "Crítico", atencao: "Atenção", ok: "Resolvido" };
const CHIP_NIVEL: Record<Nivel, string> = {
  critico: "bg-[#cf1f14] text-white",
  atencao: "bg-[#fdf3e4] text-[#8a5210]",
  ok: CHIP.verde,
};

const MINIMOS = [0, 75, 100, 200];
const impactoDoPonto = (o: Ocorrencia) => (o.nivel === "ok" ? o.deixados : o.pendentes);

type FiltroCulpa = "todas" | "ME" | "SELLER" | "PLACE";
const FILTROS_CULPA: { chave: FiltroCulpa; rotulo: string; cor: string }[] = [
  { chave: "todas", rotulo: "Todas", cor: "#94a3b8" },
  { chave: "ME", rotulo: "Culpa Operação", cor: "#2563eb" },
  { chave: "SELLER", rotulo: "Culpa Seller", cor: "#ca7916" },
  { chave: "PLACE", rotulo: "Culpa Place", cor: "#7c3aed" },
];

const CHIP_CULPA: Record<string, string> = {
  ME: "bg-[#e8eefc] text-[#1e40af]",
  SELLER: "bg-[#fdf3e4] text-[#8a5210]",
  PLACE: "bg-[#f1e8fb] text-[#6b21a8]",
};

function RotuloCobertura({ c }: { c: Cobertura }) {
  return (
    <>
      {c.transportadora ? c.transportadora + " · " : ""}Rota <LinkRota id={c.rotaId}>{c.rota}</LinkRota>
      {c.janela ? " · " + c.janela : ""}
    </>
  );
}

function LinhaPonto({ o, porPonto = false }: { o: Item; porPonto?: boolean }) {
  const v = o.visita;
  return (
    <div className="border-t border-slate-100 px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {porPonto ? (
            <>
              <p className="font-medium text-slate-900">
                <LinkRota id={v.rotaId}>{v.rotaSemNome ? "Avulsa " + v.rotaId : v.rota}</LinkRota>
                <span className="ml-1.5 inline-flex items-center gap-1.5 align-middle">
                  <FotoForms rota={v.rota} rotaId={v.rotaId} />
                  <ChipExpress rota={v.rota} rotaId={v.rotaId} />
                  <BotaoComentario o={o} />
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {v.transportadora || "Sem transportadora"}
                {v.janela ? " · janela " + v.janela : ""}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-900">
                {v.nomeParada || v.idParada}
                <span className="ml-1.5 align-middle">
                  <BotaoComentario o={o} />
                </span>
              </p>
              <p className="text-xs text-slate-500">
                #{v.idParada}
                {v.ehPlace ? " · place" : ""}
                {v.janela ? " · janela " + v.janela : ""}
              </p>
            </>
          )}
        </div>
        <div className="flex items-start gap-4 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums text-slate-600">{int(o.visita.estimados)}</p>
            <p className="text-[11px] text-slate-500">estimados</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums text-slate-600">{int(coletadoDe(o))}</p>
            <p className="text-[11px] text-slate-500">coletados</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-slate-900">{int(o.pendentes)}</p>
            <p className="text-[11px] text-slate-500">
              pendentes{o.revertidos > 0 ? " · " + int(o.revertidos) + " revertidos" : ""}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
          {v.visitada ? "OC: " + (v.motivo || "sem OC") : "Sem passagem"}
        </span>
        {v.pontualidade && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
            {v.hora} · {v.pontualidade === "onTime" ? "on time" : v.pontualidade}
          </span>
        )}
        {v.handshake && <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">handshake {v.handshake}</span>}
        <ChipForecast f={o.forecast} />
        {o.culpa.culpa && (
          <span className={"rounded px-2 py-0.5 font-medium " + CHIP_CULPA[o.culpa.culpa]}>
            Culpa {o.culpa.culpa === "ME" ? "Operação" : o.culpa.culpa === "SELLER" ? "Seller" : "Place"}
          </span>
        )}
        <span className="text-slate-500">{o.culpa.incidente}</span>
      </div>
      {!!o.abatidoPeloPonto && o.saldoPonto && (
        <p className="mt-2 rounded-md border border-[#bfe5d6] bg-[#e6f6f0] px-3 py-1.5 text-xs text-[#0f6b4e]">
          ✓ No Monitoramento por Sellers o ponto tem {int(o.saldoPonto.coletados)} de {int(o.saldoPonto.estimados)} coletados: {int(o.abatidoPeloPonto)} pacotes
          desta OC já não estão pendentes
          {o.saldoPonto.atualizadoEm ? " (atualizado " + o.saldoPonto.atualizadoEm.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, "às ").slice(0, 8) + ")" : ""}
        </p>
      )}
      {o.coberturaPrevista.map((c) => (
        <p key={"p" + (c.rotaId || c.rota)} className="mt-2 rounded-md border border-[#f3dcb8] bg-[#fdf3e4] px-3 py-1.5 text-xs text-[#8a5210]">
          → <b>Cobertura prevista:</b> <RotuloCobertura c={c} />
        </p>
      ))}
      {o.revertidaPor.map((c) => (
        <p key={"r" + (c.rotaId || c.rota)} className={"mt-2 rounded-md px-3 py-1.5 text-xs " + CHIP.verde}>
          ✓ <b>Revertido por</b> <RotuloCobertura c={c} />
          {c.hora ? " às " + c.hora : ""} · coletou {int(c.coletados)}
        </p>
      ))}
      {o.status === "repassado" && (
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
          ↻ <b>Outra rota passou depois</b> neste ponto: o saldo segue na passagem mais recente (não soma aqui para não contar o mesmo
          pacote duas vezes).
        </p>
      )}
      {preocupa(o) && (
        <p className={"mt-2 rounded-md border px-3 py-1.5 text-xs " + FAIXA.vermelho}>
          ✕ <b>Sem nova coleta prevista</b> para este ponto hoje
          {semDetalheDoPonto(o) && (
            <span className="mt-0.5 block">
              Só pelo relatório de coleta e o plano do dia: sem as rotas do ponto no Monitoramento por Sellers ({porQueSemDetalhe(o.consulta)}).
              Rota que ainda não iniciou só aparece lá: confira no sistema antes de tratar.
            </span>
          )}
        </p>
      )}
      <RotasDoPonto o={o} />
      <LinhaHistorico o={o} />
      <Tratar o={o} />
    </div>
  );
}

type GrupoRota = {
  tipo: "rota" | "ponto";
  chave: string;
  rota: string;
  rotaId: string;
  transportadora: string;
  cluster: string;
  nivel: Nivel;
  itens: Item[];
  pendentes: number;
  estimados: number;
  coletados: number;
};

const PESO_NIVEL: Record<Nivel, number> = { critico: 0, atencao: 1, ok: 2 };

function agrupar(itens: Item[], tipo: "rota" | "ponto"): GrupoRota[] {
  const m = new Map<string, GrupoRota>();
  for (const o of itens) {
    const v = o.visita;
    const k = tipo === "ponto" ? "P:" + v.idParada : v.rotaId || v.rota;
    const g =
      m.get(k) ??
      ({
        tipo,
        chave: k,
        rota: tipo === "ponto" ? v.nomeParada || v.idParada : v.rotaSemNome ? "Avulsa" : v.rota,
        rotaId: tipo === "ponto" ? "" : v.rotaId,
        transportadora: v.transportadora,
        cluster: o.cluster,
        nivel: "ok",
        itens: [],
        pendentes: 0,
        estimados: 0,
        coletados: 0,
      } as GrupoRota);
    g.itens.push(o);
    g.pendentes += o.pendentes;
    if (tipo === "ponto") {
      g.estimados = o.saldoPonto?.estimados ?? Math.max(g.estimados, o.visita.estimados);
      g.coletados = o.saldoPonto?.coletados ?? Math.max(g.coletados, coletadoDe(o));
    } else {
      g.estimados += o.visita.estimados;
      g.coletados += coletadoDe(o);
    }
    if (PESO_NIVEL[o.nivel] < PESO_NIVEL[g.nivel]) g.nivel = o.nivel;
    m.set(k, g);
  }
  return [...m.values()]
    .map((g) => ({ ...g, itens: g.itens.sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel] || b.pendentes - a.pendentes) }))
    .sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel] || b.pendentes - a.pendentes);
}

function CartaoRota({ g, aberto, alternar }: { g: GrupoRota; aberto: boolean; alternar: () => void }) {
  const corBorda = g.nivel === "critico" ? "border-l-[#cf1f14]" : g.nivel === "atencao" ? "border-l-[#ca7916]" : "border-l-[#1da578]";
  return (
    <div className={"overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white " + corBorda}>
      <div
        role="button"
        tabIndex={0}
        onClick={alternar}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && alternar()}
        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 md:flex-nowrap"
      >

        <div className="min-w-0 md:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded px-2 py-0.5 text-xs font-semibold " + CHIP_NIVEL[g.nivel]}>{ROTULO_NIVEL[g.nivel]}</span>
            <span className="font-semibold text-slate-900">{g.rota}</span>
            {g.rotaId && (
              <span className="text-xs">
                <LinkRota id={g.rotaId}>#{g.rotaId} ↗</LinkRota>
              </span>
            )}
            {g.tipo === "rota" && <FotoForms rota={g.rota} rotaId={g.rotaId} />}
            {g.tipo === "rota" && <ChipExpress rota={g.rota} rotaId={g.rotaId} />}
            <span className="rounded border border-slate-200 px-1.5 text-[11px] text-slate-600">{g.cluster}</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {g.tipo === "ponto"
              ? "#" + g.itens[0].visita.idParada + (g.itens[0].visita.ehPlace ? " · place" : "") + " · " + g.itens.length +
                (g.itens.length === 1 ? " passagem com OC" : " passagens com OC") + " (" + [...new Set(g.itens.map((o) => o.visita.rotaSemNome ? "Avulsa" : o.visita.rota))].join(", ") + ")"
              : (g.transportadora || "Sem transportadora") + " · " + g.itens.length + (g.itens.length === 1 ? " ponto afetado" : " pontos afetados")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <p className="text-base font-semibold tabular-nums text-slate-600">{int(g.estimados)}</p>
            <p className="text-[11px] text-slate-500">estimados</p>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold tabular-nums text-slate-600">{int(g.coletados)}</p>
            <p className="text-[11px] text-slate-500">coletados</p>
          </div>
          <div className="text-right">
            <p className={"text-2xl font-bold tabular-nums " + (g.nivel === "critico" ? "text-[#cf1f14]" : "text-slate-900")}>{int(g.pendentes)}</p>
            <p className="text-[11px] text-slate-500">pacotes pendentes</p>
          </div>
          <span className="text-slate-400">{aberto ? "▴" : "▾"}</span>
        </div>
      </div>
      {aberto && (
        <div className="border-t border-slate-200">
          {g.itens.map((o) => (
            <LinhaPonto key={o.chave} o={o} porPonto={g.tipo === "ponto"} />
          ))}
        </div>
      )}
    </div>
  );
}

const COR_STATUS = { semCobertura: "#cf1f14", aguardando: "#ca7916", revertido: "#1da578" } as const;

const categoriaHxh = (o: Item) =>
  (o.culpa.incidente || o.visita.motivo || o.tipo).replace(/\s*·\s*contestado no handshake$/, "");

const CARGA_CHEIA = 500;
function riscoHxh(o: Item, carga: Record<string, number>): { texto: string; chip: string; detalhe: string; semCobertura: boolean } | null {
  if (o.pendentes <= 0) return null;
  const cob = o.status === "aguardando" ? o.coberturaPrevista : [];
  const cargaDe = (rota: string) => carga[chaveRota(rota)];
  const descreve = (c: Cobertura) => c.rota + (cargaDe(c.rota) !== undefined ? " (" + int(cargaDe(c.rota)) + " pcts)" : "");
  if (!cob.length) {
    const detalhe = semDetalheDoPonto(o) ? "não confirmado no Monitoramento por Sellers" : "";
    return o.status === "parcial"
      ? { texto: "Sem cobertura · outra rota levou " + int(o.revertidos), chip: CHIP.vermelho, detalhe, semCobertura: true }
      : { texto: "Sem cobertura · nenhuma rota prevista", chip: CHIP.vermelho, detalhe, semCobertura: true };
  }
  if (cob.length === 1) return { texto: "1 rota de cobertura", chip: CHIP.ambar, detalhe: descreve(cob[0]), semCobertura: false };
  const cheias = cob.every((c) => (cargaDe(c.rota) ?? 0) > CARGA_CHEIA);
  if (cheias) {
    return {
      texto: cob.length + " rotas de cobertura · todas com +" + CARGA_CHEIA + " pcts",
      chip: CHIP.ambar,
      detalhe: cob.map(descreve).join(", "),
      semCobertura: false,
    };
  }
  return null;
}

function corDaTratativa(t: string): string {
  if (!t) return "border-dashed border-[#2563eb] bg-[#eef4ff] text-[#1e40af]";
  if (t === "Sem risco" || t === "Revertido") return "border-[#1da578] bg-[#e6f6f0] text-[#0f6b4e]";
  if (t === "Risco" || t === "Sem reversão") return "border-[#cf1f14] bg-[#fdeceb] text-[#94160e]";
  return "border-[#ca7916] bg-[#fdf3e4] text-[#8a5210]";
}

function SeletorHxh({ o }: { o: Item }) {
  const { salvar } = useContext(AcoesCtx);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const atual = o.trat?.tratativaHxh ?? "";
  return (
    <span className="flex w-full flex-col gap-0.5">
      <select
        aria-label="Tratativa"
        disabled={gravando}
        value={atual}
        onChange={async (e) => {
          setGravando(true);
          setFalha(await salvar(o, { tratativaHxh: e.target.value }));
          setGravando(false);
        }}
        className={"w-full max-w-[15rem] rounded-md border-2 px-2 py-1 text-xs font-semibold disabled:opacity-50 " + corDaTratativa(atual)}
      >
        <option value="">Tratativa…</option>
        {[...new Set([...TRATATIVAS_HXH, atual])].filter(Boolean).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {falha && <span className="text-[11px] text-[#94160e]">Não gravou</span>}
    </span>
  );
}

const HXH_INICIAL = 12;

const MINIMO_PD = 90;

const SEM_CLUSTER_PONTOS: Record<string, string> = {};

type RotaPD = {
  chave: string;
  rota: string;
  rotaId: string;
  transportadora: string;

  situacao: RotaDoPonto["situacao"] | "ns" | "nse" | "naoColetado";
  janela: string;
  hora: string;
  oc: string;
  coletado: number | null;
  impacto: number;
};
type PontoPD = {
  chave: string;
  id: string;
  nome: string;

  preparado: number | null;
  impacto: number;
  coletado: number;
  ocs: string[];
  rotas: RotaPD[];
};
type ClusterPD = { cluster: string; ops: string; impacto: number; pontos: PontoPD[] };

function agruparPD(itens: Item[], ehNs: (rota: string, rotaId: string) => boolean): ClusterPD[] {
  const porPonto = new Map<string, Item[]>();
  for (const o of itens) {
    if (o.culpa.culpa !== "ME" || impactoDoPonto(o) <= 0) continue;
    const k = o.cluster + "|" + (chaveId(o.visita.idParada) || o.visita.nomeParada);
    porPonto.set(k, [...(porPonto.get(k) ?? []), o]);
  }
  const clusters = new Map<string, ClusterPD>();
  for (const [k, passagens] of porPonto) {
    const o0 = passagens[0];
    const saldo = passagens.find((o) => o.saldoPonto)?.saldoPonto;

    const impacto = saldo ? Math.max(0, saldo.preparados - saldo.coletados) : Math.max(...passagens.map(impactoDoPonto));
    if (impacto < MINIMO_PD) continue;

    const rotas = new Map<string, RotaPD>();
    const chaveDa = (rota: string, rotaId: string) => rotaId || chaveRota(rota);
    for (const r of o0.rotasDoPonto) {
      const kr = chaveDa(r.rota, r.rotaId);
      if (rotas.has(kr)) continue;
      rotas.set(kr, {
        chave: kr,
        rota: r.rota,
        rotaId: r.rotaId,
        transportadora: r.transportadora,
        situacao: ehNs(r.rota, r.rotaId) ? "ns" : r.situacao,
        janela: r.janela,
        hora: "",
        oc: "",
        coletado: r.situacao === "semInicio" ? null : r.coletados,
        impacto: 0,
      });
    }
    const ordem = [...passagens].sort((a, b) => (a.visita.hora || "").localeCompare(b.visita.hora || ""));
    for (const o of ordem) {
      const v = o.visita;
      const kr = chaveDa(v.rotaSemNome ? "" : v.rota, v.rotaId);
      const r =
        rotas.get(kr) ??
        ({
          chave: kr,
          rota: v.rotaSemNome ? "Avulsa " + v.rotaId : v.rota,
          rotaId: v.rotaId,
          transportadora: v.transportadora,
          situacao: "passou",
          janela: v.janela,
          hora: "",
          oc: "",
          coletado: null,
          impacto: 0,
        } as RotaPD);

      if (r.situacao !== "ns") {
        r.situacao =
          o.tipo === "NSE"
            ? "nse"
            : o.tipo === "NS"
              ? ehNs(v.rotaSemNome ? "" : v.rota, v.rotaId)
                ? "ns"
                : "falhou"
              : v.coletados === 0
                ? "naoColetado"
                : "passou";
      }
      r.hora = v.hora || r.hora;
      r.oc = ocDe(o);
      r.coletado = v.coletados;
      r.impacto += impactoDoPonto(o);
      rotas.set(kr, r);
    }
    const lista = [...rotas.values()].sort(
      (a, b) => b.impacto - a.impacto || (a.hora || a.janela).localeCompare(b.hora || b.janela),
    );
    const ponto: PontoPD = {
      chave: k,
      id: o0.visita.idParada,
      nome: o0.visita.nomeParada,
      preparado: saldo ? saldo.preparados : null,
      impacto,
      coletado: saldo ? saldo.coletados : lista.reduce((s, r) => s + (r.coletado ?? 0), 0),
      ocs: [...new Set(ordem.map(ocDe))],
      rotas: lista,
    };
    const c = clusters.get(o0.cluster) ?? { cluster: o0.cluster, ops: o0.ops, impacto: 0, pontos: [] };
    c.impacto += impacto;
    c.pontos.push(ponto);
    clusters.set(o0.cluster, c);
  }
  const saida = [...clusters.values()];
  for (const c of saida) c.pontos.sort((a, b) => b.impacto - a.impacto);
  return saida.sort((a, b) => b.impacto - a.impacto);
}

const COLETA_PD: Record<RotaPD["situacao"], { rotulo: string; classe: string }> = {
  passou: { rotulo: "Coletado", classe: "bg-[#e6f6f0] text-[#0f6b4e]" },
  ns: { rotulo: "NS", classe: "bg-[#cf1f14] text-white" },
  nse: { rotulo: "NSE", classe: "bg-[#fdf3e4] text-[#8a5210] ring-1 ring-[#f3d19c]" },
  naoColetado: { rotulo: "Não coletado", classe: "bg-[#fdeceb] text-[#94160e] ring-1 ring-[#f5b5ae]" },
  aguardando: SITUACAO_ROTA.aguardando,
  semInicio: SITUACAO_ROTA.semInicio,
  falhou: SITUACAO_ROTA.falhou,
};

export type RotaNsPd = {
  rota: string;
  rotaId: string;
  transportadora: string;
  placa: string;
  motorista: string;

  motivo: string;
  origem: "motivo" | "ausencia";
  paradas: number;
  estimados: number;
};

const COR_STATUS_NS: Record<StatusNs, string> = {
  Revertido: "border-[#a7dcc6] bg-[#e6f6f0] text-[#0f6b4e]",
  "Revertido parcial": "border-[#f3d19c] bg-[#fdf3e4] text-[#8a5210]",
  "Sem reversão": "border-[#f2b8b3] bg-[#fdeceb] text-[#94160e]",
};

function useStatusNs(hojeBR: string) {
  const [marcas, setMarcas] = useState<Record<string, MarcaNs>>({});
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/ns-driver-status?data=" + encodeURIComponent(hojeBR), { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro ?? "Falhou.");
      setMarcas(j.status);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [hojeBR]);
  useEffect(() => {
    const t0 = setTimeout(carregar, 0);
    const t = setInterval(carregar, 60 * 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [carregar]);
  const salvar = async (r: RotaNsPd, status: string, autor: string) => {
    try {
      const resp = await fetch("/api/ns-driver-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: hojeBR, rota: r.rota, rotaId: r.rotaId, status, autor }),
      });
      const j = await resp.json();
      if (!j.ok) throw new Error(j.erro ?? "Falhou.");
      setMarcas(j.status);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  return { marcas, erro, salvar };
}

export type PontoDaRotaNs = { id: string; nome: string; cluster: string };

function TabelaNsDriver({
  rotas,
  hojeBR,
  autor,
  pontosDaRota,
  comentarios,
}: {
  rotas: RotaNsPd[];
  hojeBR: string;
  autor: string;
  pontosDaRota: (rota: string, rotaId: string) => PontoDaRotaNs[];
  comentarios: Comentarios;
}) {
  const { marcas, erro, salvar } = useStatusNs(hojeBR);

  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [comentando, setComentando] = useState<string | null>(null);
  const alternarRota = (k: string) =>
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const porCluster = new Map<string, RotaNsPd[]>();
  for (const r of rotas) {
    const c = clusterDoNome(r.rota) ?? "Sem cluster";
    porCluster.set(c, [...(porCluster.get(c) ?? []), r]);
  }
  const grupos = [...porCluster.entries()]
    .map(([cluster, lista]) => ({
      cluster,
      lista: lista.slice().sort((a, b) => b.estimados - a.estimados),
      estimados: lista.reduce((s, r) => s + r.estimados, 0),
    }))
    .sort((a, b) => b.lista.length - a.lista.length || b.estimados - a.estimados);
  const th = "whitespace-nowrap py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "whitespace-nowrap py-1 pr-3";
  if (!rotas.length) return <p className="py-6 text-center text-sm text-slate-400">Nenhuma rota NS hoje nos filtros.</p>;
  return (
    <div className="overflow-x-auto">
      {erro && <p className="mb-2 text-xs text-[#94160e]">Reversão: {erro}</p>}
      <table className="w-full text-xs">
        <thead className="border-b border-slate-200">
          <tr>
            <th className={th}>Cluster / rota</th>
            <th className={th}>Transportadora</th>
            <th className={th}>Motorista · placa</th>
            <th className={th}>Motivo</th>
            <th className={th}>Reversão</th>
            <th className={th + " text-right"}>Paradas</th>
            <th className={th + " text-right"}>Estimados</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <Fragment key={g.cluster}>
              <tr className="border-b border-slate-200 bg-slate-50">
                <td className={td + " pl-1 font-bold text-slate-900"}>
                  {g.cluster} <span className="ml-1 text-[10px] font-normal text-slate-400">{opsDoCluster(g.cluster)}</span>
                </td>
                <td className={td + " text-slate-500"} colSpan={5}>
                  {g.lista.length} {g.lista.length === 1 ? "rota NS" : "rotas NS"}
                </td>
                <td className={td + " text-right font-semibold tabular-nums text-slate-900"}>{int(g.estimados)}</td>
              </tr>
              {g.lista.map((r) => {
                const kr = g.cluster + "|" + (r.rotaId || r.rota);
                const aberta = abertas.has(kr);
                const pontos = aberta ? pontosDaRota(r.rota, r.rotaId) : [];
                const comComentario = pontosDaRota(r.rota, r.rotaId).filter((p) => comentarioDeHoje(comentarios, hojeBR, p.id)).length;
                return (
                <Fragment key={kr}>
                <tr className="border-b border-slate-100">
                  <td className={td + " pl-1"}>
                    <button
                      type="button"
                      onClick={() => alternarRota(kr)}
                      aria-expanded={aberta}
                      title="Ver os pontos da rota e o comentário de cada um"
                      className="mr-1 inline-block w-4 text-slate-400 hover:text-slate-800"
                    >
                      {aberta ? "▾" : "▸"}
                    </button>
                    <LinkRota id={r.rotaId}>{r.rota}</LinkRota>
                    {comComentario > 0 && (
                      <span className="ml-1.5 rounded border border-[#bcd0f7] bg-[#eef4ff] px-1 text-[10px] font-semibold text-[#1e40af]" title="Pontos da rota com comentário hoje">
                        💬 {comComentario}
                      </span>
                    )}
                  </td>
                  <td className={td + " max-w-[200px] truncate text-slate-600"} title={r.transportadora}>
                    {r.transportadora || "—"}
                  </td>
                  <td className={td + " max-w-[240px] truncate text-slate-600"} title={[r.motorista, r.placa].filter(Boolean).join(" · ")}>
                    {[r.motorista, r.placa].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className={td + " max-w-[280px] truncate text-slate-700"} title={r.motivo}>
                    {r.motivo || (r.origem === "ausencia" ? "Sem passagem no relatório até 21h" : "—")}
                  </td>
                  <td className={td}>
                    {(() => {
                      const marca = marcas[chaveNs(r.rota, r.rotaId)];
                      return (
                        <select
                          value={marca?.status ?? ""}
                          disabled={!autor.trim()}
                          onChange={(e) => salvar(r, e.target.value, autor.trim())}
                          aria-label={"Reversão da rota " + r.rota}
                          title={
                            !autor.trim()
                              ? 'Preencha "Seu nome" nos filtros para marcar'
                              : marca
                                ? "Marcado por " + (marca.autor || "—") + " em " + marca.registradoEm
                                : "Marque a reversão da rota"
                          }
                          className={
                            "rounded-full border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-60 " +
                            (marca ? COR_STATUS_NS[marca.status] : "border-slate-200 bg-white text-slate-400")
                          }
                        >
                          <option value="">— marcar —</option>
                          {STATUS_NS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </td>
                  <td className={td + " text-right tabular-nums text-slate-700"}>{int(r.paradas)}</td>
                  <td className={td + " text-right font-semibold tabular-nums text-[#94160e]"}>{int(r.estimados)}</td>
                </tr>
                {aberta && !pontos.length && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td className={td + " pl-10 text-slate-400"} colSpan={7}>
                      Nenhum ponto da rota no plano do dia nem no relatório de coleta.
                    </td>
                  </tr>
                )}
                {pontos.map((p) => {
                  const c = comentarioDeHoje(comentarios, hojeBR, p.id);
                  const kp = kr + "|" + p.id;
                  return (
                    <tr key={kp} className="border-b border-slate-100 bg-slate-50/60">
                      <td className={td + " pl-10"} colSpan={2}>
                        <span className="font-medium text-slate-800">{p.nome || "—"}</span>
                        <span className="ml-1.5 cursor-text select-all font-mono text-[10px] text-slate-400" title="Clique para selecionar e copiar">
                          {p.id}
                        </span>
                      </td>
                      <td className={td + " whitespace-normal"} colSpan={5}>
                        {comentando === kp ? (
                          <EditorComentario
                            ponto={{ idParada: p.id, ponto: p.nome, cluster: p.cluster }}
                            atual={c}
                            autor={autor}
                            hojeBR={hojeBR}
                            salvar={comentarios.salvar}
                            fechar={() => setComentando(null)}
                          />
                        ) : c ? (
                          <ResumoComentario c={c} onEditar={() => setComentando(kp)} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setComentando(kp)}
                            className="rounded border border-slate-200 px-1.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800"
                          >
                            + comentário
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisaoPD({
  itens,
  agoraTexto,
  ehNs,
  autor,
  hojeBR,
  comentarios,
  ns,
  pontosDaRota,
}: {
  itens: Item[];
  agoraTexto: string;
  ehNs: (rota: string, rotaId: string) => boolean;
  autor: string;
  hojeBR: string;
  comentarios: ComentariosDosPontos;

  ns: RotaNsPd[];

  pontosDaRota: (rota: string, rotaId: string) => PontoDaRotaNs[];
}) {
  const grupos = useMemo(() => agruparPD(itens, ehNs), [itens, ehNs]);

  const [modoNs, setModoNs] = useState(false);

  const [comentando, setComentando] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternar = (k: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const total = grupos.reduce((s, g) => s + g.impacto, 0);
  const nPontos = grupos.reduce((s, g) => s + g.pontos.length, 0);
  const td = "whitespace-nowrap py-1 pr-3";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        {modoNs ? (
          <div>
            <h2 className="text-base font-bold text-slate-900">PD · NS driver por cluster</h2>
            <p className="text-xs text-slate-500">
              Rotas NS do dia (mesmo critério do Forms e do Fechamento: declinada, cancelada ou motivo impeditivo; sem passagem até
              21h) · {ns.length} {ns.length === 1 ? "rota" : "rotas"} · {int(ns.reduce((s, r) => s + r.estimados, 0))} pacotes
              estimados · {agoraTexto}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-base font-bold text-slate-900">PD · culpa Operação por cluster e ponto</h2>
            <p className="text-xs text-slate-500">
              Pontos com OC culpa Operação e {MINIMO_PD}+ não coletados (preparados − coletados da tela) · {grupos.length} clusters · {nPontos}{" "}
              pontos · {int(total)} pacotes ·{" "}
              {agoraTexto}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setModoNs(!modoNs)}
          aria-pressed={modoNs}
          className={
            "rounded-full border px-3 py-1 text-xs font-semibold " +
            (modoNs ? "border-slate-900 bg-slate-900 text-white" : "border-[#cf1f14] text-[#cf1f14] hover:bg-[#fdeceb]")
          }
        >
          {modoNs ? "← Culpa Operação" : "NS DRIVER"}
        </button>
      </div>
      {modoNs ? (
        <TabelaNsDriver rotas={ns} hojeBR={hojeBR} autor={autor} pontosDaRota={pontosDaRota} comentarios={comentarios} />
      ) : grupos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nenhum ponto com OC culpa Operação e {MINIMO_PD}+ não coletados nos filtros.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className={td + " font-semibold"}>Cluster / ponto / rota</th>
                <th className={td + " font-semibold"}>ID do ponto</th>
                <th className={td + " font-semibold"}>Coleta</th>
                <th className={td + " font-semibold"}>Última OC</th>
                <th className={td + " text-right font-semibold"}>Coletado</th>
                <th className={td + " text-right font-semibold"}>Não coletado</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => {
                const kc = "C:" + g.cluster;
                const cAberto = abertos.has(kc);
                return (
                  <Fragment key={kc}>
                    <tr className="cursor-pointer border-b border-slate-200 bg-slate-100 hover:bg-slate-200" onClick={() => alternar(kc)}>
                      <td className={td + " font-bold text-slate-900"}>
                        <span className="mr-1 inline-block w-3 text-slate-500">{cAberto ? "▾" : "▸"}</span>
                        {g.cluster}
                        {g.ops && <span className="ml-2 text-[10px] font-normal text-slate-500">{g.ops}</span>}
                      </td>
                      <td className={td + " text-slate-500"} colSpan={4}>
                        {g.pontos.length} {g.pontos.length === 1 ? "ponto" : "pontos"}
                      </td>
                      <td className={td + " text-right font-bold tabular-nums text-slate-900"}>{int(g.impacto)}</td>
                    </tr>
                    {cAberto &&
                      g.pontos.map((p) => {
                        const kp = "P:" + p.chave;
                        const pAberto = abertos.has(kp);

                        const passaram = p.rotas.filter((r) => r.situacao === "passou" || r.situacao === "nse" || r.situacao === "naoColetado").length;
                        const faltam = p.rotas.filter((r) => r.situacao === "aguardando" || r.situacao === "semInicio").length;
                        return (
                          <Fragment key={kp}>
                            <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => alternar(kp)}>
                              <td className={td + " pl-5"} title={p.nome}>
                                <span className="flex max-w-[320px] items-center">
                                <span className="mr-1 inline-block w-3 shrink-0 text-slate-400">{pAberto ? "▾" : "▸"}</span>
                                <span className="min-w-0 truncate font-semibold text-slate-800">{p.nome || "—"}</span>
                                {!comentarioDeHoje(comentarios, hojeBR, p.id) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setComentando(comentando === p.chave ? null : p.chave);
                                    }}
                                    className="ml-2 shrink-0 rounded border border-slate-200 px-1.5 text-[10px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800"
                                  >
                                    + comentário
                                  </button>
                                )}
                                </span>
                              </td>

                              <td className={td} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                <span
                                  title="Clique para selecionar e copiar"
                                  className="cursor-text select-all font-mono text-[10px] text-slate-500 hover:text-slate-800"
                                >
                                  {p.id}
                                </span>
                              </td>
                              <td className={td + " text-slate-500"}>
                                {p.rotas.length} {p.rotas.length === 1 ? "rota" : "rotas"} · {passaram} passaram · {faltam}{" "}
                                {faltam === 1 ? "vai passar" : "vão passar"}
                              </td>
                              <td className={td + " max-w-[220px] truncate text-slate-700"} title={p.ocs.join(" · ")}>
                                {p.ocs.join(" · ")}
                              </td>
                              <td className={td + " text-right tabular-nums text-slate-700"}>{int(p.coletado)}</td>
                              <td
                                className={td + " text-right font-semibold tabular-nums text-[#94160e]"}
                                title={p.preparado !== null ? "Preparados " + int(p.preparado) + " − coletados " + int(p.coletado) + " (tela de monitoramento)" : "Sem o ponto no Monitoramento por Sellers: maior impacto das passagens"}
                              >
                                {int(p.impacto)}
                              </td>
                            </tr>
                            {comentarioDeHoje(comentarios, hojeBR, p.id) && comentando !== p.chave && (
                              <tr className="border-b border-slate-100">
                                <td colSpan={6} className="max-w-0 py-1 pl-12 pr-3 text-xs">
                                  <ResumoComentario c={comentarioDeHoje(comentarios, hojeBR, p.id)!} onEditar={() => setComentando(p.chave)} />
                                </td>
                              </tr>
                            )}
                            {comentando === p.chave && (
                              <tr className="border-b border-slate-100">
                                <td colSpan={6} className="py-1.5 pl-12 pr-3">
                                  <EditorComentario
                                    ponto={{ idParada: p.id, ponto: p.nome, cluster: g.cluster }}
                                    atual={comentarioDeHoje(comentarios, hojeBR, p.id)}
                                    autor={autor}
                                    hojeBR={hojeBR}
                                    salvar={comentarios.salvar}
                                    fechar={() => setComentando(null)}
                                  />
                                </td>
                              </tr>
                            )}
                            {pAberto &&
                              p.rotas.map((r) => (
                                <tr key={kp + "|" + r.chave} className={"border-b border-slate-100 " + (r.impacto > 0 ? "bg-[#fff8f7]" : "")}>
                                  <td className={td + " max-w-[360px] pl-12 text-slate-700"} title={r.rota + " · " + r.transportadora}>

                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <span className="min-w-0 truncate">
                                        <LinkRota id={r.rotaId}>{r.rota}</LinkRota>
                                        <span className="ml-1.5 text-[10px] text-slate-400">{r.transportadora}</span>
                                      </span>
                                      <span className="shrink-0">
                                        <FotoForms rota={r.rota} rotaId={r.rotaId} />
                                      </span>
                                    </span>
                                  </td>
                                  <td className={td} />
                                  <td className={td} title={(r.situacao === "passou" || r.situacao === "nse" || r.situacao === "naoColetado") && r.hora ? "Passou às " + r.hora : r.janela}>
                                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + COLETA_PD[r.situacao].classe}>
                                      {COLETA_PD[r.situacao].rotulo}
                                    </span>
                                  </td>
                                  <td className={td + " max-w-[220px] truncate text-slate-700"} title={r.oc}>
                                    {r.oc || <span className="text-slate-400">—</span>}
                                  </td>
                                  <td className={td + " text-right tabular-nums text-slate-700"}>{r.coletado === null ? "—" : int(r.coletado)}</td>
                                  <td className={td} />
                                </tr>
                              ))}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportHxH({ itens, agoraTexto, carga }: { itens: Item[]; agoraTexto: string; carga: Record<string, number> }) {
  const [todos, setTodos] = useState(false);

  const [soSem, setSoSem] = useState(false);
  const { lista: emRisco, folgados } = useMemo(() => {
    const pendentes = itens.filter((o) => o.pendentes > 0);
    const emRisco = pendentes
      .map((o) => ({ o, r: riscoHxh(o, carga) }))
      .filter((x): x is { o: Item; r: NonNullable<ReturnType<typeof riscoHxh>> } => x.r !== null)
      .sort((a, b) => b.o.pendentes - a.o.pendentes);
    return { lista: emRisco, folgados: pendentes.length - emRisco.length };
  }, [itens, carga]);
  const lista = soSem ? emRisco.filter((x) => x.r.semCobertura) : emRisco;
  const visiveis = todos ? lista : lista.slice(0, HXH_INICIAL);
  const total = lista.reduce((s, x) => s + x.o.pendentes, 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">Report HxH · maiores ofensores</h2>
          <p className="text-xs text-slate-500">
            {lista.length} {lista.length === 1 ? "impacto" : "impactos"} {soSem ? "sem cobertura" : "em risco"} · {int(total)} pacotes · {agoraTexto}
            {folgados > 0 && <span className="text-slate-400"> · fora: {folgados} com cobertura folgada</span>}
          </p>
        </div>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setSoSem(v)}
              aria-pressed={soSem === v}
              className={"rounded-full px-3 py-1 font-semibold " + (soSem === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
            >
              {v ? "Só sem cobertura" : "Todos em risco"}
            </button>
          ))}
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {visiveis.map(({ o, r }) => {
          return (
            <li key={o.chave} className="py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">

                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-semibold text-slate-900">
                    <LinkRota id={o.visita.rotaId}>{o.visita.rotaSemNome ? "Avulsa " + o.visita.rotaId : o.visita.rota}</LinkRota>
                    <span className="text-xs font-normal text-slate-500">{o.visita.transportadora}</span>
                    <span className="inline-flex items-center gap-1.5 font-normal">
                      <FotoForms rota={o.visita.rota} rotaId={o.visita.rotaId} />
                      <ChipExpress rota={o.visita.rota} rotaId={o.visita.rotaId} />
                      <BotaoComentario o={o} />
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {o.visita.nomeParada || o.visita.idParada}
                    {o.visita.nomeParada && o.visita.idParada && <span className="font-mono text-[11px] text-slate-400"> #{o.visita.idParada}</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    <span title={o.visita.motivo ? "OC lançada: " + o.visita.motivo : undefined}>{categoriaHxh(o)}</span>
                    {ocDependeDeHandshake(o.visita) && (
                      <span className={"ml-1 font-semibold " + (o.visita.handshake === "disagree" ? "text-[#94160e]" : "text-slate-600")}>
                        · {o.visita.handshake ? "handshake " + o.visita.handshake : "sem handshake"}
                      </span>
                    )}
                    {o.forecast && (
                      <span className="ml-1.5">
                        <ChipForecast f={o.forecast} />
                      </span>
                    )}
                  </p>
                </div>
                <p className="shrink-0 text-right text-base font-bold tabular-nums text-slate-900">
                  {int(o.pendentes)} <span className="text-[11px] font-normal text-slate-500">pcts</span>
                </p>
              </div>

              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_15rem] items-start gap-2">
                <div className="min-w-0">
                  <span title={r.detalhe || undefined} className={"inline-block rounded px-2 py-0.5 text-[11px] font-semibold " + r.chip}>
                    {r.texto}
                  </span>
                  {r.detalhe && <p className="mt-0.5 truncate text-[11px] text-slate-500" title={r.detalhe}>{r.detalhe}</p>}
                </div>
                <SeletorHxh o={o} />
              </div>
            </li>
          );
        })}
      </ul>
      {!lista.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum impacto em risco no filtro.</p>}
      {lista.length > HXH_INICIAL && (
        <button type="button" onClick={() => setTodos(!todos)} className="mt-2 text-xs font-semibold text-blue-700 hover:underline">
          {todos ? "mostrar só os " + HXH_INICIAL + " maiores" : "ver todos (" + lista.length + ")"}
        </button>
      )}
    </section>
  );
}
const ROTULO_STATUS = { semCobertura: "Sem cobertura", aguardando: "Aguardando outra rota", revertido: "Revertido" } as const;
type ChaveStatus = keyof typeof COR_STATUS;

function partesDoStatus(o: Item): Record<ChaveStatus, number> {
  return {
    semCobertura: preocupa(o) ? o.pendentes : 0,
    aguardando: o.status === "aguardando" ? o.pendentes : 0,
    revertido: o.revertidos,
  };
}

function Cartao({
  titulo,
  valor,
  detalhe,
  cor,
  ativo,
  onClick,
}: {
  titulo: string;
  valor: string | number;
  detalhe?: string;
  cor: string;
  ativo?: boolean;
  onClick?: () => void;
}) {
  const conteudo = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</span>
      <span className="mt-1 text-3xl font-extrabold tabular-nums text-slate-900">{valor}</span>
      {detalhe && <span className="mt-0.5 text-xs text-slate-500">{detalhe}</span>}
    </>
  );
  const classe =
    "flex flex-col rounded-2xl border bg-white px-3 py-3 text-left shadow-sm transition " +
    (ativo ? "border-slate-400 ring-2 ring-slate-200" : "border-slate-200") +
    (onClick ? " cursor-pointer hover:shadow-md" : "");
  const faixa = <span className="mb-2 h-1 w-10 rounded-full" style={{ background: cor }} />;
  return onClick ? (
    <button type="button" onClick={onClick} className={classe} aria-pressed={!!ativo}>
      {faixa}
      {conteudo}
    </button>
  ) : (
    <div className={classe}>
      {faixa}
      {conteudo}
    </div>
  );
}

function motivoDe(o: Item): string {
  const t = (o.culpa.incidente || o.visita.motivo || o.tipo).replace(/\s*·\s*contestado no handshake$/, "").trim();
  if (/^não visitado/i.test(t)) return "Não visitado (janela passou)";
  return t.replace(/^\d+(\.\d+)?\s+/, "").trim() || o.tipo;
}

function GraficoMacro({
  itens,
  selecionados,
  alternar,
}: {
  itens: Item[];
  selecionados: string[];
  alternar: (motivo: string) => void;
}) {
  const [foco, setFoco] = useState<string | null>(null);

  const [so, setSo] = useState<ChaveStatus | null>(null);
  const partes = (Object.keys(COR_STATUS) as ChaveStatus[]).filter((k) => !so || k === so);
  const porMotivo = new Map<string, Item[]>();
  for (const o of itens) {
    const k = motivoDe(o);
    porMotivo.set(k, [...(porMotivo.get(k) ?? []), o]);
  }
  const linhas = [...porMotivo.entries()].map(([t, doTipo]) => {
    const soma: Record<ChaveStatus, number> = { semCobertura: 0, aguardando: 0, revertido: 0 };

    let pontos = 0;
    for (const o of doTipo) {
      const p = partesDoStatus(o);
      soma.semCobertura += p.semCobertura;
      soma.aguardando += p.aguardando;
      soma.revertido += p.revertido;
      if (!so || p[so] > 0) pontos++;
    }

    const origem = [...new Set(doTipo.map((o) => (o.culpa.incidente || o.visita.motivo || o.tipo).replace(/\s*·\s*contestado no handshake$/, "")))];
    const ocs = [...new Set(doTipo.map((o) => o.visita.motivo || o.tipo))];
    return {
      tipo: t,
      dica: origem.join(" / ") + " · OC: " + ocs.join(", "),
      pontos,
      soma,
      total: partes.reduce((t, k) => t + soma[k], 0),
    };
  })
    .filter((l) => l.pontos > 0 && l.total > 0)
    // Do maior para o menor, como o grafico por cluster.
    .sort((a, b) => b.total - a.total || b.pontos - a.pontos);
  const max = Math.max(1, ...linhas.map((l) => l.total));
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Ocorrências</h2>
        <span className="text-xs text-slate-500">por motivo · pacotes deixados · clique para filtrar</span>
      </div>

      <div className="mt-2 flex flex-nowrap gap-1 text-xs">
        {(Object.keys(COR_STATUS) as ChaveStatus[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSo(so === k ? null : k)}
            aria-pressed={so === k}
            title={so === k ? "Clique de novo para ver todas" : "Ver só " + ROTULO_STATUS[k].toLowerCase()}
            className={
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 " +
              (so === k
                ? "bg-slate-900 font-semibold text-white"
                : (so ? "text-slate-400 " : "text-slate-600 ") + "hover:bg-slate-100")
            }
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_STATUS[k] }} />
            {ROTULO_STATUS[k]}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
        {linhas.map((l) => {
          const ativo = selecionados.includes(l.tipo);
          return (
            <button
              key={l.tipo}
              type="button"
              onClick={() => alternar(l.tipo)}
              title={l.dica}
              className={"block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50 " + (ativo ? "bg-slate-100" : "")}
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-800">{l.tipo}</span>
                <span className="text-xs text-slate-500">
                  <b className="tabular-nums text-slate-800">{int(l.total)}</b> pac · {l.pontos} {l.pontos === 1 ? "ponto" : "pontos"}
                </span>
              </div>
              <div className="relative mt-1 flex h-3.5 w-full gap-[2px]">
                {partes.map((k) =>
                  l.soma[k] > 0 ? (
                    <span
                      key={k}
                      onMouseEnter={() => setFoco(l.tipo + "|" + k)}
                      onMouseLeave={() => setFoco(null)}
                      className="h-full first:rounded-l-md last:rounded-r-md"
                      style={{ width: (l.soma[k] / max) * 100 + "%", background: COR_STATUS[k], minWidth: 3 }}
                    >
                      {foco === l.tipo + "|" + k && (
                        <span className="pointer-events-none absolute -top-8 left-0 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow">
                          {ROTULO_STATUS[k]}: {int(l.soma[k])} pacotes
                        </span>
                      )}
                    </span>
                  ) : null,
                )}
              </div>
            </button>
          );
        })}
        {!linhas.length && <p className="py-6 text-center text-sm text-slate-500">Nenhuma ocorrência no filtro.</p>}
      </div>
    </div>
  );
}

function GraficoTransportadora({
  itens,
  selecionadas,
  alternar,
}: {
  itens: Item[];
  selecionadas: string[];
  alternar: (t: string) => void;
}) {
  const porTp = new Map<string, { sem: number; aguardando: number }>();
  for (const o of itens) {
    if (o.pendentes <= 0) continue;
    const t = o.visita.transportadora || "Sem transportadora";
    const c = porTp.get(t) ?? { sem: 0, aguardando: 0 };
    if (preocupa(o)) c.sem += o.pendentes;
    else if (o.status === "aguardando") c.aguardando += o.pendentes;
    porTp.set(t, c);
  }
  const linhas = [...porTp.entries()]
    .map(([t, c]) => ({ t, ...c, total: c.sem + c.aguardando }))
    .filter((l) => l.total > 0)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...linhas.map((l) => l.total));
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Maiores ofensores por transportadora</h2>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Pacotes pendentes · clique para filtrar</span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: COR_STATUS.semCobertura }} /> Sem cobertura
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: COR_STATUS.aguardando }} /> Aguardando outra rota
        </span>
      </div>
      <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {linhas.map((l) => {
          const ativo = selecionadas.includes(l.t);
          return (
            <button
              key={l.t}
              type="button"
              onClick={() => alternar(l.t)}
              title={`${l.t}: ${int(l.sem)} sem cobertura · ${int(l.aguardando)} aguardando outra rota`}
              className={"grid w-full grid-cols-[8.5rem_1fr_4rem] items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition hover:bg-slate-50 " + (ativo ? "bg-slate-100" : "")}
            >
              <span className="truncate font-semibold text-slate-800">{l.t}</span>
              <span className="flex h-3 w-full gap-[2px] overflow-hidden rounded-md bg-slate-100">
                {l.sem > 0 && <span className="block h-full" style={{ width: (l.sem / max) * 100 + "%", background: COR_STATUS.semCobertura, minWidth: 3 }} />}
                {l.aguardando > 0 && (
                  <span className="block h-full" style={{ width: (l.aguardando / max) * 100 + "%", background: COR_STATUS.aguardando, minWidth: 3 }} />
                )}
              </span>
              <span className="text-right font-bold tabular-nums text-slate-800">{int(l.total)}</span>
            </button>
          );
        })}
        {!linhas.length && <p className="py-6 text-center text-sm text-slate-500">Nada pendente no filtro.</p>}
      </div>
    </div>
  );
}

function GraficoCluster({
  itens,
  selecionados,
  alternar,
}: {
  itens: Item[];
  selecionados: string[];
  alternar: (c: string) => void;
}) {
  const [medida, setMedida] = useState<"pacotes" | "rotas">("pacotes");
  const porCluster = new Map<string, { pacotes: number; rotas: Set<string> }>();
  for (const o of itens) {
    if (!preocupa(o)) continue;
    const c = porCluster.get(o.cluster) ?? { pacotes: 0, rotas: new Set<string>() };
    c.pacotes += o.pendentes;
    c.rotas.add(o.visita.rotaId || o.visita.rota);
    porCluster.set(o.cluster, c);
  }
  const linhas = [...porCluster.entries()]
    .map(([cluster, c]) => ({ cluster, valor: medida === "pacotes" ? c.pacotes : c.rotas.size, pacotes: c.pacotes, rotas: c.rotas.size }))
    .sort((a, b) => b.valor - a.valor);
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Impacto sem reversão por cluster</h2>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs">
          {(["pacotes", "rotas"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMedida(m)}
              className={"rounded-full px-3 py-1 font-semibold " + (medida === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
            >
              {m === "pacotes" ? "Pacotes" : "Rotas"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Pendentes sem outra rota prevista · clique para filtrar</p>
      <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {linhas.map((l) => {
          const ativo = selecionados.includes(l.cluster);
          return (
            <button
              key={l.cluster}
              type="button"
              onClick={() => alternar(l.cluster)}
              title={`${l.cluster}: ${int(l.pacotes)} pacotes em ${l.rotas} ${l.rotas === 1 ? "rota" : "rotas"}`}
              className={"grid w-full grid-cols-[4.5rem_1fr_4rem] items-center gap-2 rounded-lg px-2 py-1 text-left text-sm transition hover:bg-slate-50 " + (ativo ? "bg-slate-100" : "")}
            >
              <span className="font-semibold text-slate-800">
                {l.cluster}
                <span className="ml-1 text-[10px] font-normal text-slate-400">{opsDoCluster(l.cluster)}</span>
              </span>
              <span className="h-3 w-full rounded-md bg-slate-100">
                <span className="block h-full rounded-md" style={{ width: (l.valor / max) * 100 + "%", background: COR_STATUS.semCobertura, minWidth: 3 }} />
              </span>
              <span className="text-right font-bold tabular-nums text-slate-800">{int(l.valor)}</span>
            </button>
          );
        })}
        {!linhas.length && <p className="py-6 text-center text-sm text-slate-500">Nada sem cobertura no filtro. 🎉</p>}
      </div>
    </div>
  );
}

export default function PainelMonitorD0({
  dataBR,
  agoraMin,
  visitas: visitasBrutas,
  tratativas,
  historico,
  plano,
  rotasPontos: rotasBrutas,
  rotasSistema,
  rotasNs,
  listaNs,
  rotasExpress,
  listaExpress,
  entregasExpress,
  outrosHubs,
  consultasPontos,
  saldosPontos,
  cargaRotas,
  projecaoPontos,
  estimadoRotas,
  fotos,
  motivos,
  mapeamento,
  clusterPontos = SEM_CLUSTER_PONTOS,
  erro,
  desatualizadoDesde,
  lidoEm,
}: {
  dataBR: string;
  agoraMin: number;
  visitas: Visita[];
  tratativas: Record<string, Tratativa>;
  historico: Record<string, HistoricoPonto>;
  plano: PlanoParada[];
  rotasPontos: RotaMonitoring[];
  consultasPontos: Record<string, ConsultaPonto>;
  rotasSistema: RotaSistemaHoje[];

  rotasNs: string[];

  listaNs: RotaNsPd[];

  rotasExpress: string[];

  listaExpress: { rota: string; rotaId: string; transportadora?: string }[];

  entregasExpress: Record<string, EntregasExpress>;

  outrosHubs: Record<string, string>;
  saldosPontos: Record<string, SaldoPonto>;
  cargaRotas: Record<string, number>;
  projecaoPontos: Record<string, number>;
  estimadoRotas: Record<string, EstimadoRota>;
  fotos: Record<string, string>;
  motivos: string[];

  mapeamento: PontoMapa[];

  clusterPontos?: Record<string, string>;
  erro: string | null;
  desatualizadoDesde: string | null;
  lidoEm: string;
}) {
  const visitas = useMemo(
    () => visitasBrutas.map((v) => (ehVetor(v.transportadora) ? { ...v, transportadora: "Vetor" } : v)),
    [visitasBrutas],
  );
  const rotasPontos = useMemo(
    () => rotasBrutas.map((r) => (ehVetor(r.transportadora) ? { ...r, transportadora: "Vetor" } : r)),
    [rotasBrutas],
  );

  const fontesBusca = useMemo(
    () => ({ visitas, rotasPontos, plano, nomes: Object.fromEntries(mapeamento.map((p) => [p.id, p.nome])) }),
    [visitas, rotasPontos, plano, mapeamento],
  );

  const saldosBusca = useMemo(() => {
    const t: Record<string, { estimados: number; preparados: number; coletados: number }> = {};
    for (const p of mapeamento) t[chaveId(p.id)] = { estimados: p.estimados, preparados: p.preparados, coletados: p.coletados };
    return { ...t, ...saldosPontos };
  }, [mapeamento, saldosPontos]);
  const horaAgora = String(Math.floor(agoraMin / 60)).padStart(2, "0") + ":" + String(agoraMin % 60).padStart(2, "0");

  const express = useMemo(() => new Set(rotasExpress), [rotasExpress]);

  const riscoDaExpress = useMemo(() => {
    const janelas = new Map<string, string[]>();
    for (const v of visitas) {
      for (const k of [v.rotaId ? "ID:" + v.rotaId : "", v.rotaSemNome ? "" : chaveRota(v.rota)]) {
        if (k && v.janela) janelas.set(k, [...(janelas.get(k) ?? []), v.janela]);
      }
    }

    const noRelatorio = new Set<string>();

    const coletou = new Set<string>();
    for (const v of visitas) {
      const ks = [v.rotaId ? "ID:" + v.rotaId : "", v.rotaSemNome ? "" : chaveRota(v.rota)].filter(Boolean);
      for (const k of ks) {
        noRelatorio.add(k);
        if (v.visitada) coletou.add(k);
      }
    }
    const inicio = new Map<string, string>();

    const planejado = new Map<string, string>();
    for (const p of plano) if (p.rota && p.inicio && !planejado.has(chaveRota(p.rota))) planejado.set(chaveRota(p.rota), p.inicio);
    for (const r of rotasSistema) {
      if (r.inicioPlanejado) {
        if (r.rotaId) planejado.set("ID:" + r.rotaId, r.inicioPlanejado);
        if (r.rota) planejado.set(chaveRota(r.rota), r.inicioPlanejado);
      }
      if (!r.inicioRota) continue;
      if (r.rotaId) inicio.set("ID:" + r.rotaId, r.inicioRota);
      if (r.rota) inicio.set(chaveRota(r.rota), r.inicioRota);
    }
    const ns = new Set(rotasNs);
    return (rota: string, rotaId: string): RiscoExpress | null => {
      const chaves = [rotaId ? "ID:" + rotaId : "", chaveRota(rota)].filter(Boolean);
      const e = chaves.map((k) => entregasExpress[k]).find(Boolean);
      if (!e) return null;
      const j = janelaDaRota(chaves.flatMap((k) => janelas.get(k) ?? []));
      const ini = chaves.map((k) => inicio.get(k)).find(Boolean) ?? "";
      const logouColeta = Boolean(ini) || chaves.some((k) => noRelatorio.has(k));
      const coletando = chaves.some((k) => coletou.has(k));
      const plan = chaves.map((k) => planejado.get(k)).find(Boolean);
      return riscoExpress(e, {
        inicioColetaMin: plan ? minutosDe(plan) : null,
        janelaIniMin: j.ini,
        agoraMin,
        nsRota: chaves.some((k) => ns.has(k)),
        logouColeta,
        coletando,
      });
    };
  }, [visitas, rotasSistema, plano, rotasNs, entregasExpress, agoraMin]);
  const infoExpress = useMemo(() => ({ rotas: express, risco: riscoDaExpress }), [express, riscoDaExpress]);

  const todasPontualidade = useMemo(() => {
    const ns = new Set(rotasNs);
    return pontualidadeDasRotas(
      visitas,
      plano,
      rotasSistema.map((r) => (ehVetor(r.transportadora) ? { ...r, transportadora: "Vetor" } : r)),
      agoraMin,
    )
      .filter((r) => !ns.has(chaveRota(r.rota)) && !(r.rotaId && ns.has("ID:" + r.rotaId)))
      .map((r) =>
        express.has(chaveRota(r.rota)) || (r.rotaId && express.has("ID:" + r.rotaId))
          ? { ...r, express: true, entregas: riscoDaExpress(r.rota, r.rotaId) }
          : r,
      );
  }, [visitas, plano, rotasSistema, agoraMin, rotasNs, express, riscoDaExpress]);
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();

  const [soCps, setSoCps] = useState(false);

  const [soExpress, setSoExpress] = useState<"todas" | "express" | "v1">("todas");
  const ehRotaV1 = (rota: string, rotaId: string) => {
    const e = (rotaId && entregasExpress["ID:" + rotaId]) || entregasExpress[chaveRota(rota)];
    return Boolean(e && ehExpress10(e));
  };
  const doTipoRota = (rota: string, rotaId: string) =>
    soExpress === "todas" || (ehRotaExpress(rota, rotaId) && (soExpress === "express" || ehRotaV1(rota, rotaId)));
  const ehRotaExpress = (rota: string, rotaId: string) => express.has(chaveRota(rota)) || (rotaId !== "" && express.has("ID:" + rotaId));
  const cps = useMemo(() => filtroCps(outrosHubs, visitas, plano), [outrosHubs, visitas, plano]);
  const [ops, setOps] = useState<string[]>([]);
  const [clusters, setClusters] = useState<string[]>([]);
  const [transps, setTransps] = useState<string[]>([]);

  const [ocs, setOcs] = useState<string[]>([]);

  const [trats, setTrats] = useState<string[]>([]);
  const tratDe = (o: Item) => o.trat?.tratativaHxh || SEM_TRATATIVA;
  const daTratativa = (o: Item) => !trats.length || trats.includes(tratDe(o));

  const [forecast, setForecast] = useState<"todos" | "desvio" | "backlog">("todos");
  const doForecast = (o: Item) => forecast === "todos" || o.forecast?.tipo === forecast;
  const [tipos, setTipos] = useState<string[]>([]);

  const [culpa, setCulpa] = useState<FiltroCulpa>("todas");

  const [minimo, setMinimo] = useState(0);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [pont, setPont] = useState<"early" | "late" | null>(null);
  const [resolvidos, setResolvidos] = useState(false);
  const [busca, setBusca] = useState("");

  const [ordem, setOrdem] = useState<"rota" | "ponto">("rota");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [verTratados, setVerTratados] = useState(false);

  const [visao, setVisao] = useState<"monitoramento" | "fechamento" | "mapeamento">("monitoramento");

  const [areaGraficos, setAreaGraficos] = useState<"graficos" | "hxh" | "pontualidade" | "pd" | "acoes" | "comentarios">("graficos");

  const acoesPontos = useAcoesPontos();
  const comentariosPd = useComentariosPd();

  const [graficosFechados, setGraficosFechados] = useState(false);

  const [quadroExpressFechado, setQuadroExpressFechado] = useState(false);
  useEffect(() => {
    try {
      setGraficosFechados(window.localStorage.getItem(CHAVE_GRAFICOS) === "1");
      setQuadroExpressFechado(window.localStorage.getItem(CHAVE_QUADRO_EXPRESS) === "1");
    } catch {
      // sem armazenamento: comeca aberto
    }
  }, []);
  const alternarQuadroExpress = () => {
    const novo = !quadroExpressFechado;
    setQuadroExpressFechado(novo);
    try {
      window.localStorage.setItem(CHAVE_QUADRO_EXPRESS, novo ? "1" : "0");
    } catch {
      // sem armazenamento: so nao lembra
    }
  };
  const alternarGraficos = () => {
    const novo = !graficosFechados;
    setGraficosFechados(novo);
    try {
      window.localStorage.setItem(CHAVE_GRAFICOS, novo ? "1" : "0");
    } catch {
      // sem armazenamento: so nao lembra
    }
  };

  const [locais, setLocais] = useState<Record<string, Tratativa>>({});

  const [motivosLocais, setMotivosLocais] = useState<string[]>([]);
  const todosMotivos = useMemo(() => {
    const vistos = new Set<string>();
    return [...motivos, ...motivosLocais].filter((m) => {
      const k = m.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, [motivos, motivosLocais]);
  const [autor, setAutor] = useState("");

  useEffect(() => {
    try {
      setAutor(window.localStorage.getItem(CHAVE_AUTOR) ?? "");
    } catch {
      // sem armazenamento: so pede de novo
    }
  }, []);
  const mudarAutor = (v: string) => {
    setAutor(v);
    try {
      window.localStorage.setItem(CHAVE_AUTOR, v);
    } catch {
      // sem armazenamento: so nao lembra
    }
  };

  const ultimaInteracao = useRef(0);
  const ultimaLeitura = useRef(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    ultimaLeitura.current = Date.now();
  }, [lidoEm]);
  useEffect(() => {
    const marcar = () => {
      ultimaInteracao.current = Date.now();
    };
    document.addEventListener("pointerdown", marcar, true);
    document.addEventListener("keydown", marcar, true);
    const t = setInterval(() => {
      const agora = Date.now();
      const editando =
        document.querySelector('[role="dialog"]') !== null || agora - ultimaInteracao.current < PAUSA_EDICAO_MIN * 60 * 1000;
      const venceu = agora - ultimaLeitura.current >= RELER_MIN * 60 * 1000;
      setPausado(venceu && editando);
      if (venceu && !editando) {
        ultimaLeitura.current = agora;
        router.refresh();
      }
    }, 15 * 1000);
    return () => {
      clearInterval(t);
      document.removeEventListener("pointerdown", marcar, true);
      document.removeEventListener("keydown", marcar, true);
    };
  }, [router]);

  const atualizar = () =>
    iniciar(async () => {
      await fetch("/api/monitoramento", { method: "PUT" }).catch(() => null);
      router.refresh();
    });

  const estimadoDoPonto = useMemo(() => {
    const maior = new Map<string, number>();
    for (const v of visitas) {
      const k = chaveId(v.idParada);
      maior.set(k, Math.max(maior.get(k) ?? 0, v.estimados));
    }
    return (id: string) => saldosPontos[chaveId(id)]?.estimados ?? maior.get(chaveId(id)) ?? 0;
  }, [visitas, saldosPontos]);

  const deixadosAntes = (hist: number | null, sistema: number | undefined) =>
    hist === null && sistema === undefined ? null : Math.max(hist ?? 0, sistema ?? 0);
  const todos: Item[] = useMemo(
    () =>
      ocorrenciasDoDia(visitas, agoraMin, plano, rotasPontos, saldosPontos).map((o) => {
        const cluster = clusterDaVisita(o.visita, visitas, clusterPontos);
        const chave = chaveOcorrencia(o.visita);
        const hist = historico[o.visita.idParada];
        const trat = locais[chave] ?? tratativas[chave];

        const excluidoDe = trat?.excluido && o.pendentes > 0 ? o.pendentes : 0;
        return {
          ...o,
          ...(excluidoDe ? { pendentes: 0, status: "revertido" as const, nivel: "ok" as const } : {}),
          cluster,
          ops: opsDoCluster(cluster),
          chave,
          trat,
          hist,
          risco: riscoDoHistorico(hist),
          excluidoDe,
          consulta: consultasPontos[chaveId(o.visita.idParada)],
          forecast: desvioDeForecast(
            projecaoPontos,
            o.visita.idParada,
            estimadoDoPonto(o.visita.idParada),
            deixadosAntes(hist?.naoColetadosDiaAnterior ?? null, saldosPontos[chaveId(o.visita.idParada)]?.backlog),
          ),
        };
      }),
    [visitas, agoraMin, plano, rotasPontos, consultasPontos, saldosPontos, historico, tratativas, locais, projecaoPontos, estimadoDoPonto, clusterPontos],
  );

  const salvar = async (o: Item, patch: Partial<Tratativa>): Promise<string | null> => {
    const antes = o.trat;
    const novo: Tratativa = {
      tratado: patch.tratado ?? antes?.tratado ?? false,
      comentario: patch.comentario ?? antes?.comentario ?? "",
      autor: autor.trim(),
      atualizadoEm: "agora",
      motivoImpacto: patch.motivoImpacto ?? antes?.motivoImpacto ?? "",
      excluido: patch.excluido ?? antes?.excluido ?? false,
      tratativaHxh: patch.tratativaHxh ?? antes?.tratativaHxh ?? "",
    };
    setLocais((m) => ({ ...m, [o.chave]: novo }));
    try {
      const r = await fetch("/api/monitoramento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: dataBR,
          chave: o.chave,
          rota: o.visita.rota,
          idParada: o.visita.idParada,
          parada: o.visita.nomeParada,
          tratado: novo.tratado,
          comentario: novo.comentario,
          autor: novo.autor,
          motivoImpacto: novo.motivoImpacto,
          excluido: novo.excluido,
          tratativaHxh: novo.tratativaHxh,
        }),
      });
      const j = (await r.json()) as { ok: boolean; erro?: string; atualizadoEm?: string };
      if (!j.ok) throw new Error(j.erro || "erro ao gravar");
      setLocais((m) => ({ ...m, [o.chave]: { ...novo, atualizadoEm: j.atualizadoEm ?? "" } }));
      return null;
    } catch (e) {
      setLocais((m) => {
        const n = { ...m };
        if (antes) n[o.chave] = antes;
        else delete n[o.chave];
        return n;
      });
      return (e as Error).message;
    }
  };

  const novoMotivo = async (m: string): Promise<string | null> => {
    if (todosMotivos.some((x) => x.toLowerCase() === m.toLowerCase())) return null;
    try {
      const r = await fetch("/api/monitoramento/motivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: m, autor: autor.trim() }),
      });
      const j = (await r.json()) as { ok: boolean; erro?: string };
      if (!j.ok) throw new Error(j.erro || "erro ao gravar");
      setMotivosLocais((l) => [...l, m]);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const todosHub = useMemo(
    () =>
      todos.filter(
        (o) =>
          (!soCps || !cps.aplicavel || cps.ehCps(o.visita.rota, o.visita.rotaId, o.visita.rotaSemNome)) &&
          doTipoRota(o.visita.rota, o.visita.rotaId),
      ),
    [todos, soCps, cps, soExpress, express, entregasExpress], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pontualidadeHub = useMemo(
    () =>
      todasPontualidade.filter(
        (r) => (!soCps || !cps.aplicavel || cps.ehCps(r.rota, r.rotaId)) && doTipoRota(r.rota, r.rotaId),
      ),
    [todasPontualidade, soCps, cps, soExpress, express, entregasExpress], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const quadroExpress = useMemo((): LinhaExpress[] => {
    if (soExpress === "todas") return [];
    const ns = new Set(rotasNs);
    const pont = new Map<string, (typeof todasPontualidade)[number]>();
    for (const r of todasPontualidade) {
      if (r.rotaId) pont.set("ID:" + r.rotaId, r);
      pont.set(chaveRota(r.rota), r);
    }
    const idDoRelatorio = new Map<string, string>();
    for (const v of visitas) {
      if (!v.rotaSemNome && v.rotaId) idDoRelatorio.set(chaveRota(v.rota), v.rotaId);
    }

    const pontosDaRota = new Map<string, Set<string>>();
    const marcar = (k: string, id: string) => {
      if (!k || !id) return;
      const pontos = pontosDaRota.get(k) ?? new Set<string>();
      pontos.add(chaveId(id));
      pontosDaRota.set(k, pontos);
    };
    for (const v of visitas) {
      marcar(v.rotaId ? "ID:" + v.rotaId : "", v.idParada);
      if (!v.rotaSemNome) marcar(chaveRota(v.rota), v.idParada);
    }
    const coletaDe = (rotaId: string, k: string) => {
      if (estimadoRotas[k]) return estimadoRotas[k];
      const pontos = new Set([...(pontosDaRota.get(k) ?? []), ...((rotaId && pontosDaRota.get("ID:" + rotaId)) || [])]);
      if (!pontos.size) return null;
      let estimados = 0;
      for (const id of pontos) estimados += estimadoDoPonto(id) || projecaoPontos[id] || 0;
      return { estimados, pontos: pontos.size };
    };
    return listaExpress
      .map((m) => {
        const k = chaveRota(m.rota);

        const rotaId =
          m.rotaId || idDoRelatorio.get(k) || pont.get(k)?.rotaId || entregasExpress[k]?.rotaId || "";
        const pontDela = (rotaId && pont.get("ID:" + rotaId)) || pont.get(k) || null;
        return {
          rota: m.rota,
          rotaId,

          transportadora:
            m.transportadora ||
            pontDela?.transportadora ||
            visitas.find((v) => (rotaId && v.rotaId === rotaId) || (!v.rotaSemNome && chaveRota(v.rota) === k))?.transportadora ||
            "",
          ns: ns.has(k) || (rotaId !== "" && ns.has("ID:" + rotaId)),
          pont: pontDela,
          risco: riscoDaExpress(m.rota, rotaId),
          sacas: (() => {
            const e = (rotaId && entregasExpress["ID:" + rotaId]) || entregasExpress[k];
            if (!e || !e.sacas) return null;

            const feitas = e.pendentes === 0 ? e.sacas : e.sacasEntregues;
            return feitas === null ? null : { feitas: Math.min(feitas, e.sacas), total: e.sacas };
          })(),
          paradas: (() => {
            const e = (rotaId && entregasExpress["ID:" + rotaId]) || entregasExpress[k];
            if (!e || !e.paradas) return null;

            const pendentes = e.pendentes === 0 ? 0 : e.paradasPendentes;
            return pendentes === null ? null : { feitas: Math.max(0, e.paradas - pendentes), total: e.paradas };
          })(),
          coleta: coletaDe(rotaId, k),
        };
      })
      .filter((l) => soExpress === "express" || ehRotaV1(l.rota, l.rotaId))
      .sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR", { numeric: true }));
  }, [soExpress, listaExpress, rotasNs, todasPontualidade, visitas, riscoDaExpress, entregasExpress, estimadoRotas, estimadoDoPonto, projecaoPontos]); // eslint-disable-line react-hooks/exhaustive-deps

  const qtdExpress = useMemo(
    () => new Set(visitas.filter((v) => ehRotaExpress(v.rota, v.rotaId)).map((v) => v.rotaId || chaveRota(v.rota))).size,
    [visitas, express], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const opsDaRota = (rota: string) => opsDoCluster(clusterDoNome(rota) ?? "");

  const quadroExpressVisto = useMemo(
    () => (ops.length ? quadroExpress.filter((l) => ops.includes(opsDaRota(l.rota))) : quadroExpress),
    [quadroExpress, ops],
  );

  const opcoes = useMemo(() => {
    const u = (f: (o: Item) => string, extra: string[] = []) =>
      [...new Set([...todosHub.map(f), ...extra].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    return {
      ops: u((o) => o.ops, [...pontualidadeHub.map((r) => opsDoCluster(r.cluster)), ...quadroExpress.map((l) => opsDaRota(l.rota))]),
      clusters: u((o) => o.cluster, pontualidadeHub.map((r) => r.cluster)),
      transps: u((o) => o.visita.transportadora, pontualidadeHub.map((r) => r.transportadora)),
      ocs: u(ocDe),
    };
  }, [todosHub, pontualidadeHub, quadroExpress]);

  const pontualidade = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pontualidadeHub.filter(
      (r) =>
        (!ops.length || ops.includes(opsDoCluster(r.cluster))) &&
        (!clusters.length || clusters.includes(r.cluster)) &&
        (!transps.length || transps.includes(r.transportadora)) &&
        (!q || [r.rota, r.rotaId].some((x) => x.toLowerCase().includes(q))),
    );
  }, [pontualidadeHub, ops, clusters, transps, busca]);

  const nomeDoPonto = useMemo<NomeDoPonto>(() => {
    const m = new Map<string, string>();
    for (const o of todosHub) {
      const k = chaveId(o.visita.idParada);
      if (k && o.visita.nomeParada && !m.has(k)) m.set(k, o.visita.nomeParada);
    }

    for (const p of mapeamento) if (p.nome && !m.has(p.id)) m.set(p.id, p.nome);
    return (id) => m.get(chaveId(id)) ?? null;
  }, [todosHub, mapeamento]);

  const clusterDoPonto = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of todosHub) {
      const k = chaveId(o.visita.idParada);
      if (k && o.cluster && o.cluster !== "Sem cluster" && !m.has(k)) m.set(k, o.cluster);
    }
    for (const p of mapeamento) if (p.cluster !== "Sem cluster" && !m.has(p.id)) m.set(p.id, p.cluster);
    return (id: string) => m.get(chaveId(id)) ?? null;
  }, [todosHub, mapeamento]);

  const pontosDaRotaNs = useCallback(
    (rota: string, rotaId: string): PontoDaRotaNs[] => {
      const k = chaveRota(rota);
      const pontos = new Map<string, PontoDaRotaNs>();
      const somar = (id: string, nome: string) => {
        const c = chaveId(id);
        if (!c || !/\d/.test(c) || pontos.has(c)) return;
        pontos.set(c, { id, nome: nome || nomeDoPonto(id) || "", cluster: clusterDoPonto(id) ?? clusterDoNome(rota) ?? "" });
      };
      for (const v of visitas) {
        if ((rotaId && v.rotaId === rotaId) || (!v.rotaSemNome && chaveRota(v.rota) === k)) somar(v.idParada, v.nomeParada);
      }
      for (const p of plano) if (chaveRota(p.rota) === k) somar(p.idParada, "");
      return [...pontos.values()];
    },
    [visitas, plano, nomeDoPonto, clusterDoPonto],
  );

  const nsVisto = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return listaNs.filter((r) => {
      const c = clusterDoNome(r.rota) ?? "";
      return (
        (!ops.length || ops.includes(opsDoCluster(c))) &&
        (!clusters.length || clusters.includes(c)) &&
        (!transps.length || transps.includes(r.transportadora)) &&
        (!q || [r.rota, r.rotaId, r.placa, r.motorista].some((x) => x.toLowerCase().includes(q)))
      );
    });
  }, [listaNs, ops, clusters, transps, busca]);

  const mapeamentoVisto = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return mapeamento.filter(
      (p) =>
        (!ops.length || ops.includes(opsDoCluster(p.cluster))) &&
        (!clusters.length || clusters.includes(p.cluster)) &&
        (!transps.length || p.rotas.some((r) => transps.includes(r.transportadora))) &&
        (!q || [p.nome, p.id, ...p.rotas.map((r) => r.rota)].some((x) => x.toLowerCase().includes(q))),
    );
  }, [mapeamento, ops, clusters, transps, busca]);

  const semCulpa = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todosHub.filter(
      (o) =>
        (!ops.length || ops.includes(o.ops)) &&
        (!transps.length || transps.includes(o.visita.transportadora)) &&
        (!ocs.length || ocs.includes(ocDe(o))) &&
        doForecast(o) &&
        daTratativa(o) &&
        (verTratados || !o.trat?.tratado) &&
        impactoDoPonto(o) >= minimo &&
        (!q || [o.visita.rota, o.visita.rotaId, o.visita.nomeParada, o.visita.idParada].some((x) => x.toLowerCase().includes(q))),
    );
  }, [todosHub, ops, transps, ocs, busca, verTratados, minimo, forecast, trats]); // eslint-disable-line react-hooks/exhaustive-deps

  const doFechamento = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todosHub.filter(
      (o) =>
        (!cps.aplicavel || cps.ehCps(o.visita.rota, o.visita.rotaId, o.visita.rotaSemNome)) &&
        (!ops.length || ops.includes(o.ops)) &&
        (!clusters.length || clusters.includes(o.cluster)) &&
        (!transps.length || transps.includes(o.visita.transportadora)) &&
        (!ocs.length || ocs.includes(ocDe(o))) &&
        doForecast(o) &&
        daTratativa(o) &&
        (!q || [o.visita.rota, o.visita.rotaId, o.visita.nomeParada, o.visita.idParada].some((x) => x.toLowerCase().includes(q))),
    );
  }, [todosHub, cps, ops, clusters, transps, ocs, busca, forecast, trats]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => (culpa === "todas" ? semCulpa : semCulpa.filter((o) => o.culpa.culpa === culpa)), [semCulpa, culpa]);

  const ehRotaNs = useMemo(() => {
    const ns = new Set(rotasNs);
    return (rota: string, rotaId: string) => ns.has(chaveRota(rota)) || (rotaId !== "" && ns.has("ID:" + rotaId));
  }, [rotasNs]);

  const porCulpa = useMemo(() => {
    const m: Record<FiltroCulpa, { pacotes: number; pontos: number }> = {
      todas: { pacotes: 0, pontos: 0 },
      ME: { pacotes: 0, pontos: 0 },
      SELLER: { pacotes: 0, pontos: 0 },
      PLACE: { pacotes: 0, pontos: 0 },
    };
    for (const o of semCulpa) {
      if (!preocupa(o)) continue;
      for (const k of ["todas", o.culpa.culpa] as (FiltroCulpa | null)[]) {
        if (!k) continue;
        m[k].pacotes += o.pendentes;
        m[k].pontos += 1;
      }
    }
    return m;
  }, [semCulpa]);
  const doTipo = (o: Item) => !tipos.length || tipos.includes(motivoDe(o));
  const doCluster = (o: Item) => !clusters.length || clusters.includes(o.cluster);
  const recorte = useMemo(() => base.filter((o) => doTipo(o) && doCluster(o)), [base, tipos, clusters]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartoes = useMemo(() => {
    const c = { critico: 0, early: 0, late: 0, semCobertura: 0, aguardando: 0, pontosAguardando: 0, revertidos: 0, pacRevertidos: 0, alertas: 0, tratados: 0 };
    for (const o of todosHub) {
      if (o.nivel !== "ok") {
        c.alertas++;
        if (o.trat?.tratado) c.tratados++;
      }
    }
    for (const o of recorte) {
      if (o.nivel === "critico") c.critico++;
      if (o.visita.pontualidade === "early") c.early++;
      if (o.visita.pontualidade === "late") c.late++;
      if (preocupa(o)) c.semCobertura += o.pendentes;
      if (o.status === "aguardando") {
        c.aguardando += o.pendentes;
        c.pontosAguardando++;
      }
      if (o.revertidos > 0) {
        c.revertidos++;
        c.pacRevertidos += o.revertidos;
      }
    }
    return c;
  }, [todosHub, recorte]);

  const visiveis = useMemo(
    () => recorte.filter((o) => (resolvidos || o.nivel !== "ok") && (!nivel || o.nivel === nivel) && (!pont || o.visita.pontualidade === pont)),
    [recorte, resolvidos, nivel, pont],
  );

  const rotas = useMemo(() => {
    return [...agrupar(visiveis, ordem)].sort((a, b) => b.pendentes - a.pendentes);
  }, [visiveis, ordem]);

  const alternar = (k: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const alternarEm = (lista: string[], set: (v: string[]) => void, v: string) =>
    set(lista.length === 1 && lista[0] === v ? [] : [v]);

  const ultimaColeta = useMemo(() => visitas.reduce((max, v) => (v.hora > max ? v.hora : max), ""), [visitas]);

  if (erro) return <div className={"rounded-2xl border px-4 py-3 text-sm " + FAIXA.vermelho}>Não consegui ler a COLETAS_D0: {erro}</div>;
  if (!visitas.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        A COLETAS_D0 ainda não tem paradas de {dataBR}. O relatório entra quando o script do time roda.
      </div>
    );
  }

  const pctTratados = cartoes.alertas ? Math.round((cartoes.tratados / cartoes.alertas) * 100) : 0;
  const filtrosGrafico = tipos.length + clusters.length > 0;

  return (
    <ExpressCtx.Provider value={infoExpress}>
    <FotosCtx.Provider value={fotos}>
    <AcoesCtx.Provider value={{ autor, salvar, motivos: todosMotivos, novoMotivo, comentarios: comentariosPd, hojeBR: dataBR }}>
      <div className="space-y-5">
        <BuscaPonto fontes={fontesBusca} saldos={saldosBusca} />
        {desatualizadoDesde && (
          <div className={"rounded-2xl border px-4 py-2 text-sm " + FAIXA.vermelho}>
            O Google limitou as leituras da planilha agora. Mostrando a leitura das {desatualizadoDesde}; a tela tenta de novo sozinha.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-500">
          <span>
            {dataBR} · última coleta no relatório às <b className="tabular-nums text-slate-700">{ultimaColeta || "—"}</b> · planilha lida às{" "}
            <b className="tabular-nums text-slate-700">{lidoEm || "—"}</b> ·{" "}
            {pausado ? (
              <span
                title={"A releitura automática espera " + PAUSA_EDICAO_MIN + " min sem clique nem tecla (e a caixa de comentário fechada). O botão Atualizar relê na hora."}
                className="rounded-full border border-[#ca7916] bg-[#fdf3e4] px-2 py-0.5 font-semibold text-[#8a5210]"
              >
                atualização pausada enquanto você edita · volta {PAUSA_EDICAO_MIN} min depois da última ação
              </span>
            ) : (
              "relê a cada " + RELER_MIN + " min (pausa enquanto você edita)"
            )}
          </span>
          <button
            type="button"
            onClick={atualizar}
            disabled={atualizando}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-60"
          >
            <span className={atualizando ? "inline-block animate-spin" : "inline-block"}>⟳</span>
            {atualizando ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">Culpa prévia</h2>
            <span className="text-xs text-slate-500">pacotes sem reversão · vale para os cartões, os gráficos e a lista</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {FILTROS_CULPA.map((f) => {
              const ativo = culpa === f.chave;
              const n = porCulpa[f.chave];
              return (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setCulpa(f.chave)}
                  aria-pressed={ativo}
                  className={
                    "flex flex-col rounded-xl border px-4 py-2.5 text-left transition " +
                    (ativo ? "border-slate-900 bg-slate-900 text-white shadow" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50")
                  }
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.cor }} />
                    {f.rotulo}
                  </span>
                  <span className={"mt-0.5 text-2xl font-extrabold tabular-nums " + (ativo ? "text-white" : "text-slate-900")}>
                    {int(n.pacotes)}
                  </span>
                  <span className={"text-xs " + (ativo ? "text-slate-300" : "text-slate-500")}>
                    {n.pontos} {n.pontos === 1 ? "ponto" : "pontos"} sem reversão
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="grid auto-rows-min grid-cols-2 gap-3 self-start sm:grid-cols-3 lg:sticky lg:top-4 lg:grid-cols-1">
            <Cartao titulo="Sem reversão" valor={int(cartoes.semCobertura)} detalhe="pacotes sem outra rota prevista" cor={COR_STATUS.semCobertura} />
            <Cartao
              titulo="Pontos críticos"
              valor={cartoes.critico}
              detalhe="sem cobertura, 50+ pacotes"
              cor={COR_STATUS.semCobertura}
              ativo={nivel === "critico"}
              onClick={() => setNivel(nivel === "critico" ? null : "critico")}
            />
            <Cartao
              titulo="Aguardando"
              valor={int(cartoes.aguardando)}
              detalhe={cartoes.pontosAguardando + (cartoes.pontosAguardando === 1 ? " ponto" : " pontos") + " com outra rota prevista"}
              cor={COR_STATUS.aguardando}
              ativo={nivel === "atencao"}
              onClick={() => setNivel(nivel === "atencao" ? null : "atencao")}
            />
            <Cartao
              titulo="Revertidos"
              valor={int(cartoes.pacRevertidos)}
              detalhe={cartoes.revertidos + (cartoes.revertidos === 1 ? " ponto recuperado" : " pontos recuperados") + " por outra rota"}
              cor={COR_STATUS.revertido}
              ativo={resolvidos}
              onClick={() => setResolvidos(!resolvidos)}
            />
            <Cartao
              titulo="Tratados"
              valor={pctTratados + "%"}
              detalhe={cartoes.tratados + " de " + cartoes.alertas + " alertas" + (verTratados ? " · mostrando" : " · ocultos")}
              cor="#2563eb"
              ativo={verTratados}
              onClick={() => setVerTratados(!verTratados)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Cartao titulo="Early" valor={cartoes.early} cor={COR_STATUS.aguardando} ativo={pont === "early"} onClick={() => setPont(pont === "early" ? null : "early")} />
              <Cartao titulo="Late" valor={cartoes.late} cor={COR_STATUS.semCobertura} ativo={pont === "late"} onClick={() => setPont(pont === "late" ? null : "late")} />
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Visualização</span>
                <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-sm">
                  {(["monitoramento", "fechamento", "mapeamento"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVisao(v)}
                      aria-pressed={visao === v}
                      className={
                        "rounded px-3 py-1 font-semibold " + (visao === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      {v === "monitoramento" ? "Monitoramento" : v === "fechamento" ? "Fechamento" : "Mapeamento"}
                    </button>
                  ))}
                </div>
              </div>
              <Campo titulo="Hub">
                <div className="inline-flex w-full rounded-md border border-slate-300 bg-white p-0.5 text-sm">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setSoCps(v)}
                      aria-pressed={soCps === v}
                      title={
                        v
                          ? cps.aplicavel
                            ? "Tira as rotas dos outros hubs (pela coluna HUB da atribuição): " + cps.rotasFora + " no relatório de hoje"
                            : "Hoje não tem rota de outro hub na atribuição"
                          : "Todas as rotas que descarregam em Campinas"
                      }
                      className={
                        "flex-1 rounded px-2 py-1 font-semibold " + (soCps === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      {v ? "Só CPS" + (cps.aplicavel ? " (−" + cps.rotasFora + ")" : "") : "Todos"}
                    </button>
                  ))}
                </div>
              </Campo>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Tipo de rota</span>
                <div className="inline-flex w-full rounded-md border border-slate-300 bg-white p-0.5 text-sm">
                  {(["todas", "express", "v1"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSoExpress(v)}
                      aria-pressed={soExpress === v}
                      title={
                        v === "express"
                          ? "Só as rotas Express do dia (tipo express na atribuição): " + listaExpress.length + " hoje, " + qtdExpress + " já no relatório de coleta"
                          : v === "v1"
                            ? "Express 1.0: a tela de entregas da rota está zerada (entrega e coleta não atreladas) - risco alto"
                            : "Todas as rotas"
                      }
                      className={
                        "whitespace-nowrap rounded px-2 py-1 font-semibold " +
                        (soExpress === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      {v === "express" ? "Só Express" : v === "v1" ? "Express 1.0" : "Todas"}
                    </button>
                  ))}
                </div>
              </div>
              <Campo titulo="OPS">
                <MultiSelect opcoes={opcoes.ops} selecionados={ops} setSelecionados={setOps} rotuloTodas="Todos" />
              </Campo>

              <Campo titulo="Cluster">
                <MultiSelect opcoes={opcoes.clusters} selecionados={clusters} setSelecionados={setClusters} rotuloTodas="Todos" />
              </Campo>
              <Campo titulo="Transportadora">
                <MultiSelect opcoes={opcoes.transps} selecionados={transps} setSelecionados={setTransps} rotuloTodas="Todas" />
              </Campo>
              <Campo titulo="Ocorrência">
                <MultiSelect opcoes={opcoes.ocs} selecionados={ocs} setSelecionados={setOcs} rotuloTodas="Todas" />
              </Campo>
              <Campo titulo="Tratativa">
                <MultiSelect opcoes={[SEM_TRATATIVA, ...TRATATIVAS_HXH]} selecionados={trats} setSelecionados={setTrats} rotuloTodas="Todas" />
              </Campo>
              <Campo titulo="Forecast">
                <div className="inline-flex w-full rounded-md border border-slate-300 bg-white p-0.5 text-sm">
                  {(["todos", "desvio", "backlog"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setForecast(f)}
                      aria-pressed={forecast === f}
                      title={f === "desvio" ? "Só pontos com flag de desvio de forecast" : f === "backlog" ? "Só pontos com flag de backlog" : undefined}
                      className={
                        "flex-1 rounded px-2 py-1 font-semibold " + (forecast === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      {f === "todos" ? "Todos" : f === "desvio" ? "Desvio" : "Backlog"}
                    </button>
                  ))}
                </div>
              </Campo>
              {visao === "monitoramento" && (
              <Campo titulo="Impacto por ponto">
                <div className="inline-flex w-full rounded-md border border-slate-300 bg-white p-0.5 text-sm">
                  {MINIMOS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMinimo(n)}
                      aria-pressed={minimo === n}
                      className={
                        "flex-1 rounded px-2 py-1 font-semibold " + (minimo === n ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      {n ? n + "+" : "Todos"}
                    </button>
                  ))}
                </div>
              </Campo>
              )}
              <Campo titulo="Buscar">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Rota ou ponto"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                />
              </Campo>
              <Campo titulo="Seu nome (assina o tratado)">
                <input
                  value={autor}
                  onChange={(e) => mudarAutor(e.target.value)}
                  placeholder="Ex.: Ana"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
                />
              </Campo>
            </div>

            {visao === "fechamento" ? (
              <VisaoFechamento itens={doFechamento} rotasForaDeCps={cps.aplicavel ? cps.rotasFora : 0} />
            ) : visao === "mapeamento" ? (
              <VisaoMapeamento pontos={mapeamentoVisto} agoraTexto={dataBR.slice(0, 5) + " " + horaAgora} hojeBR={dataBR} autor={autor} />
            ) : (
            <>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {areaGraficos === "graficos" && (
                <button
                  type="button"
                  onClick={alternarGraficos}
                  aria-expanded={!graficosFechados}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm hover:text-slate-800"
                >
                  {graficosFechados ? "▸ Mostrar gráficos" : "▾ Minimizar gráficos"}
                </button>
              )}
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
                {(["graficos", "hxh", "pontualidade", "pd", "acoes", "comentarios"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAreaGraficos(v)}
                    aria-pressed={areaGraficos === v}
                    className={"rounded-full px-3 py-1 font-semibold " + (areaGraficos === v ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800")}
                  >
                    {v === "graficos" ? "Impactos" : v === "hxh" ? "HxH Report" : v === "pd" ? "PD" : v === "acoes" ? "Ações" : v === "comentarios" ? "Comentários" : "Pontualidade"}
                  </button>
                ))}
              </div>
            </div>
            {soExpress !== "todas" && (
              <QuadroExpress
                linhas={quadroExpressVisto}
                titulo={soExpress === "v1" ? "Express 1.0 de hoje" : "Express de hoje"}
                fechado={quadroExpressFechado}
                alternar={alternarQuadroExpress}
              />
            )}
            {areaGraficos === "pontualidade" ? (
              <PainelPontualidade rotas={pontualidade} agoraTexto={horaAgora} />
            ) : areaGraficos === "pd" ? (
              <VisaoPD
                itens={semCulpa.filter(doCluster)}
                agoraTexto={dataBR.slice(0, 5) + " " + horaAgora}
                ehNs={ehRotaNs}
                autor={autor}
                hojeBR={dataBR}
                comentarios={comentariosPd}
                ns={nsVisto}
                pontosDaRota={pontosDaRotaNs}
              />
            ) : areaGraficos === "comentarios" ? (
              <VisaoComentarios
                comentarios={comentariosPd.comentarios}
                erro={comentariosPd.erro}
                autor={autor}
                hojeBR={dataBR}
                salvar={comentariosPd.salvar}
              />
            ) : areaGraficos === "acoes" ? (
              <VisaoAcoes
                acoes={acoesPontos.acoes}
                causas={acoesPontos.causas}
                novaCausa={acoesPontos.novaCausa}
                responsaveis={acoesPontos.responsaveis}
                novoResponsavel={acoesPontos.novoResponsavel}
                erro={acoesPontos.erro}
                autor={autor}
                hojeBR={dataBR}
                salvar={acoesPontos.salvar}
                naoColetadoHoje={(id) => {
                  const s = saldosPontos[chaveId(id)];
                  return s ? Math.max(0, s.preparados - s.coletados) : null;
                }}
                nomeDoPonto={nomeDoPonto}
                clusterDoPonto={clusterDoPonto}
              />
            ) : areaGraficos === "hxh" ? (
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <ReportHxH itens={base.filter(doCluster)} carga={cargaRotas} agoraTexto={dataBR.slice(0, 5) + " " + horaAgora} />
                <div className="space-y-5">
                  <GraficoMacro itens={base.filter(doCluster)} selecionados={tipos} alternar={(t) => alternarEm(tipos, setTipos, t)} />
                  <GraficoCluster itens={base.filter(doTipo)} selecionados={clusters} alternar={(c) => alternarEm(clusters, setClusters, c)} />
                  <GraficoTransportadora itens={base.filter(doCluster)} selecionadas={transps} alternar={(t) => alternarEm(transps, setTransps, t)} />
                </div>
              </div>
            ) : graficosFechados ? null : (
              <div className="grid gap-5 xl:grid-cols-2">
                <GraficoMacro itens={base.filter(doCluster)} selecionados={tipos} alternar={(t) => alternarEm(tipos, setTipos, t)} />
                <GraficoCluster itens={base.filter(doTipo)} selecionados={clusters} alternar={(c) => alternarEm(clusters, setClusters, c)} />
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{ordem === "ponto" ? "Impactos por ponto" : "Impactos por rota"}</h2>
                  <p className="text-xs text-slate-500">
                    {ordem === "ponto"
                      ? rotas.length + (rotas.length === 1 ? " ponto" : " pontos") + " · clique para ver as passagens, a OC, a cobertura e as observações"
                      : rotas.length + (rotas.length === 1 ? " rota" : " rotas") + " · clique para ver os pontos, a OC, a cobertura e as observações"}
                    {filtrosGrafico && (
                      <>
                        {" · "}
                        <button type="button" onClick={() => { setTipos([]); setClusters([]); }} className="font-semibold text-blue-700 hover:underline">
                          limpar filtro dos gráficos ({[...tipos, ...clusters].join(", ")})
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs">
                  {(["rota", "ponto"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrdem(o)}
                      className={"rounded-full px-3 py-1 font-semibold " + (ordem === o ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                    >
                      {o === "rota" ? "Por rota" : "Por ponto"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {rotas.map((g) => (
                  <CartaoRota key={g.chave} g={g} aberto={abertos.has(g.chave)} alternar={() => alternar(g.chave)} />
                ))}
                {!rotas.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum ponto no filtro.</p>}
              </div>
            </section>
            </>
            )}
          </div>
        </div>
      </div>
    </AcoesCtx.Provider>
    </FotosCtx.Provider>
    </ExpressCtx.Provider>
  );
}
