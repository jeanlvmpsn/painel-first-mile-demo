"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { tituloDaDedicada, type DiaDedicada, type DiaHistorico, type LinhaBaseDedicada, type RotaDedHoje, type StatusDedicada } from "../../lib/dedicadas";
import { metaDoMes } from "../../lib/metas";
import { opsDoCluster } from "../../lib/monitorD0";
import { FAIXA } from "../ui/cores";
import { Campo, MultiSelect } from "../ui/filtros";
import GraficoDedicada from "./GraficoDedicada";

const RELER_MIN = 5;
const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null) => (n === null ? "—" : (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");

const STATUS: Record<StatusDedicada, { rotulo: string; chip: string; cor: string }> = {
  ns: { rotulo: "NS", chip: "bg-[#cf1f14] text-white", cor: "#cf1f14" },
  parcial: { rotulo: "Coleta parcial", chip: "bg-[#fdf3e4] text-[#8a5210]", cor: "#ca7916" },
  completa: { rotulo: "Coletou 100%", chip: "bg-[#e6f6f0] text-[#0f6b4e]", cor: "#1da578" },
  aguardando: { rotulo: "Aguardando", chip: "bg-slate-100 text-slate-700", cor: "#94a3b8" },
  semRota: { rotulo: "Sem rota hoje", chip: "bg-slate-100 text-slate-500", cor: "#cbd5e1" },
};
const ORDEM_STATUS: StatusDedicada[] = ["ns", "parcial", "aguardando", "completa", "semRota"];

const FAIXA_ATENCAO_PP = 5;
const VERDE = { cor: "#1da578", chip: "bg-[#e6f6f0] text-[#0f6b4e]" };
const AMBAR = { cor: "#ca7916", chip: "bg-[#fdf3e4] text-[#8a5210]" };
const VERMELHO = { cor: "#cf1f14", chip: "bg-[#fdeceb] text-[#94160e]" };
function corDoPu(pu: number | null, dataBR: string) {
  if (pu === null) return null;
  const meta = metaDoMes(dataBR).puSuccess;
  const p = pu * 100;
  return p >= meta ? VERDE : p >= meta - FAIXA_ATENCAO_PP ? AMBAR : VERMELHO;
}

function corDaDedicada(status: StatusDedicada, pu: number | null, dataBR: string) {
  const c = status === "parcial" || status === "completa" ? corDoPu(pu, dataBR) : null;
  return c ?? { cor: STATUS[status]?.cor ?? "#cbd5e1", chip: STATUS[status]?.chip ?? "" };
}

const linkRota = (id: string) => "/demo/rota/" + encodeURIComponent(id);

function Cartao({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {cor && <span className="mb-2 block h-1 w-8 rounded-full" style={{ background: cor }} />}
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

function BarraPu({ pu, dataBR }: { pu: number | null; dataBR: string }) {
  if (pu === null) return <span className="text-xs text-slate-400">—</span>;
  const cor = corDoPu(pu, dataBR)?.cor ?? "#cbd5e1";
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-16 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full" style={{ width: Math.min(100, pu * 100) + "%", background: cor }} />
      </span>
      <span className="w-12 text-right text-sm font-semibold tabular-nums text-slate-800">{pct(pu)}</span>
    </span>
  );
}

function Faixa({ dias }: { dias: DiaHistorico[] }) {
  const ultimos = dias.slice(-10);
  if (!ultimos.length) return <span className="text-xs text-slate-400">sem histórico ainda</span>;
  return (
    <span className="flex items-center gap-0.5">
      {ultimos.map((d) => (
        <span
          key={d.data}
          title={
            d.data + " · " + d.rota + " · " + STATUS[d.status]?.rotulo + " · " + int(d.coletados) + "/" + int(d.estimados) + " (" + pct(d.pu) +
            " · meta " + metaDoMes(d.data).puSuccess.toLocaleString("pt-BR") + "%)"
          }
          className="h-4 w-2.5 rounded-sm"
          style={{ background: corDaDedicada(d.status, d.pu, d.data).cor }}
        />
      ))}
    </span>
  );
}

function NomeEditavel({ d, salvar }: { d: DiaDedicada; salvar: (d: DiaDedicada, apelido: string) => Promise<string | null> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(d.apelido);
  const [gravando, setGravando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-semibold text-slate-900">{tituloDaDedicada(d)}</span>
        <button
          type="button"
          title="Dar um nome a esta dedicada (vale para todo o time)"
          aria-label="Editar nome"
          onClick={(e) => {
            e.stopPropagation();
            setValor(d.apelido || tituloDaDedicada(d));
            setEditando(true);
          }}
          className="rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ✎
        </button>
        {falha && <span className="text-xs text-[#94160e]">Não gravou: {falha}</span>}
      </span>
    );
  }
  const enviar = async (apelido: string) => {
    setGravando(true);
    const erro = await salvar(d, apelido);
    setGravando(false);
    setFalha(erro);
    if (!erro) setEditando(false);
  };
  return (
    <form
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        void enviar(valor.trim());
      }}
    >
      <input
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        maxLength={80}
        className="w-56 rounded-md border border-slate-300 px-2 py-0.5 text-sm font-semibold"
      />
      <button type="submit" disabled={gravando} className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50">
        Salvar
      </button>
      {d.apelido && (
        <button type="button" disabled={gravando} onClick={() => void enviar("")} className="px-1 text-xs text-slate-500 hover:text-slate-800">
          tirar nome
        </button>
      )}
      <button type="button" onClick={() => setEditando(false)} className="px-1 text-xs text-slate-500 hover:text-slate-800">
        ✕
      </button>
    </form>
  );
}

function LinhaDedicada({
  d,
  dataBR,
  hist,
  aberto,
  alternar,
  salvarNome,
}: {
  d: DiaDedicada;
  dataBR: string;
  hist: DiaHistorico[];
  aberto: boolean;
  alternar: () => void;
  salvarNome: (d: DiaDedicada, apelido: string) => Promise<string | null>;
}) {
  const s = { ...STATUS[d.status], ...corDaDedicada(d.status, d.pu, dataBR) };
  const pu30 = d.hist30 && d.hist30.estimados > 0 ? d.hist30.coletados / d.hist30.estimados : null;
  return (
    <div className="overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white" style={{ borderLeftColor: s.cor }}>
      <div
        role="button"
        tabIndex={0}
        onClick={alternar}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && alternar()}
        aria-expanded={aberto}
        className="grid cursor-pointer grid-cols-1 gap-3 px-4 py-3 hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={"rounded px-2 py-0.5 text-xs font-semibold " + s.chip}>{s.rotulo}</span>
            <NomeEditavel d={d} salvar={salvarNome} />
            {d.nome && <span className="text-xs text-slate-500">rota hoje {d.nome}</span>}
            {d.rotaId && (
              <a
                href={linkRota(d.rotaId)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
              >
                #{d.rotaId} ↗
              </a>
            )}
            {d.cluster && <span className="rounded border border-slate-200 px-1.5 text-[11px] text-slate-600">{d.cluster}</span>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {d.transportadora || "Transportadora —"} · {d.pontos.length} {d.pontos.length === 1 ? "ponto" : "pontos"}
            {d.janela ? " · janela " + d.janela : ""}
            {d.hora ? " · coletou " + d.hora + (d.pontualidade ? " (" + (d.pontualidade === "onTime" ? "on time" : d.pontualidade) + ")" : "") : ""}
            {d.motivos.length ? " · OC: " + d.motivos.join(", ") : ""}
            {d.status !== "semRota" && (
              <span className={d.formsFeito ? " text-[#0f6b4e]" : " text-slate-400"}>{d.formsFeito ? " · Forms ✓" : " · sem Forms"}</span>
            )}
          </p>
        </div>
        <div className="text-sm tabular-nums text-slate-700 md:text-right">
          <b className="text-slate-900">{int(d.coletados)}</b> / {int(d.estimados)}
          {d.naoColetados > 0 && <span className="ml-1 text-xs text-[#94160e]">−{int(d.naoColetados)}</span>}
          <p className="text-[11px] text-slate-500">coletados / estimados hoje</p>
        </div>
        <div>
          <BarraPu pu={d.pu} dataBR={dataBR} />
          <p className="text-[11px] text-slate-500">
            30 dias: {pct(pu30)}
            {d.hist30 ? " · perdeu em " + d.hist30.diasComPerda + " de " + d.hist30.dias : ""}
          </p>
        </div>
        <div>
          <Faixa dias={hist} />
          <p className="text-[11px] text-slate-500">últimos dias</p>
        </div>
      </div>
      {aberto && (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Ponto</th>
                  <th className="py-1 pr-3 font-semibold">ID</th>
                  <th className="py-1 pr-3 text-right font-semibold">Coletados / est.</th>
                  <th className="py-1 pr-3 font-semibold">OC hoje</th>
                  <th className="py-1 font-semibold">30 dias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {d.pontos.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5 pr-3 text-slate-900">{p.nome || <span className="text-slate-400">sem passagem hoje</span>}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-600">{p.id}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {p.estimados || p.visitado ? int(p.coletados) + " / " + int(p.estimados) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-slate-700">{p.motivos.join(", ") || "—"}</td>
                    <td className="py-1.5 text-xs text-slate-600">
                      {p.hist
                        ? pct(p.hist.estimados ? p.hist.coletados / p.hist.estimados : null) +
                          " · perdeu em " + p.hist.diasComPerda + " de " + p.hist.dias + " dias" +
                          (p.hist.incidentePrincipal ? " · " + p.hist.incidentePrincipal : "")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Rotas nos pontos hoje</p>
            <ul className="space-y-0.5 text-xs text-slate-700">
              {d.rotas.map((r) => (
                <li key={r.rotaId || r.rota}>
                  <b>{r.rota}</b>
                  {r.rotaId && (
                    <>
                      {" "}
                      <a href={linkRota(r.rotaId)} target="_blank" rel="noreferrer" className="text-blue-700 underline decoration-blue-300 underline-offset-2">
                        #{r.rotaId} ↗
                      </a>
                    </>
                  )}
                  {" · "}
                  {r.soNoPlano ? "no plano, ainda não iniciou" : (r.transportadora || "—") + " · coletou " + int(r.coletados)}
                  {!r.ehDedicada && <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] text-slate-600">não é DED</span>}
                </li>
              ))}
              {!d.rotas.length && <li className="text-slate-500">Nenhuma rota passa nesses pontos hoje.</li>}
            </ul>
          </div>
          <p className="text-xs text-slate-500">
            {d.nomesAnteriores.length ? "Já rodou como " + d.nomesAnteriores.join(", ") + " · " : ""}
            Cadastrada pelos ids desde {d.primeiraVez || "hoje"}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PainelDedicadas({
  dataBR,
  dias: diasDoServidor,
  historico,
  base,
  rotasDed,
  erro,
  lidoEm,
}: {
  dataBR: string;
  dias: DiaDedicada[];
  historico: Record<string, DiaHistorico[]>;
  base: LinhaBaseDedicada[];
  rotasDed: RotaDedHoje[];
  erro: string | null;
  lidoEm: string;
}) {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();

  const [nomesLocais, setNomesLocais] = useState<Record<string, string>>({});
  const dias = useMemo(
    () => diasDoServidor.map((d) => (d.chave in nomesLocais ? { ...d, apelido: nomesLocais[d.chave] } : d)),
    [diasDoServidor, nomesLocais],
  );
  const salvarNome = async (d: DiaDedicada, apelido: string): Promise<string | null> => {
    let autor = "";
    try {
      autor = window.localStorage.getItem("monitorD0.autor") ?? "";
    } catch {
      // sem armazenamento: grava sem autor
    }
    try {
      const r = await fetch("/api/dedicadas/nome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave: d.chave, ids: d.pontos.map((p) => p.id), apelido, autor }),
      });
      const j = (await r.json()) as { ok: boolean; erro?: string };
      if (!j.ok) throw new Error(j.erro || "erro ao gravar");
      setNomesLocais((m) => ({ ...m, [d.chave]: apelido }));
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const [clusters, setClusters] = useState<string[]>([]);
  const [transps, setTransps] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusDedicada | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"perda" | "cluster">("perda");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const [listaAberta, setListaAberta] = useState(false);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), RELER_MIN * 60 * 1000);
    return () => clearInterval(t);
  }, [router]);
  const atualizar = () =>
    iniciar(async () => {
      await fetch("/api/monitoramento", { method: "PUT" }).catch(() => null);
      router.refresh();
    });

  const opcoes = useMemo(() => {
    const u = (f: (d: DiaDedicada) => string) => [...new Set(dias.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    return { clusters: u((d) => d.cluster), transps: u((d) => d.transportadora) };
  }, [dias]);

  const recorte = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return dias.filter(
      (d) =>
        (!clusters.length || clusters.includes(d.cluster)) &&
        (!transps.length || transps.includes(d.transportadora)) &&
        (!q ||
          [d.apelido, tituloDaDedicada(d), d.nome, d.rotaId, ...d.nomesAnteriores, ...d.pontos.flatMap((p) => [p.id, p.nome])].some((x) =>
            x.toLowerCase().includes(q),
          )),
    );
  }, [dias, clusters, transps, busca]);

  const cartoes = useMemo(() => {
    const hoje = recorte.filter((d) => d.status !== "semRota");
    const est = hoje.reduce((s, d) => s + d.estimados, 0);
    const col = hoje.reduce((s, d) => s + d.coletados, 0);
    const e30 = hoje.reduce((s, d) => s + (d.hist30?.estimados ?? 0), 0);
    const c30 = hoje.reduce((s, d) => s + (d.hist30?.coletados ?? 0), 0);
    const porStatus = Object.fromEntries(ORDEM_STATUS.map((st) => [st, recorte.filter((d) => d.status === st).length])) as Record<StatusDedicada, number>;
    const forms = hoje.filter((d) => d.formsFeito).length;

    const q = busca.trim().toLowerCase();
    const rotas = rotasDed.filter(
      (r) =>
        (!clusters.length || clusters.includes(r.cluster)) &&
        (!transps.length || transps.includes(r.transportadora)) &&
        (!q || r.rota.toLowerCase().includes(q)),
    ).length;
    return { rotas, rodando: hoje.length, est, col, pu: est ? col / est : null, pu30: e30 ? c30 / e30 : null, perda: est - col, porStatus, forms };
  }, [recorte, rotasDed, clusters, transps, busca]);

  const lista = useMemo(() => {
    const l = recorte.filter((d) => (status ? d.status === status : d.status !== "semRota"));
    return l.sort((a, b) =>
      ordem === "cluster"
        ? a.cluster.localeCompare(b.cluster, "pt-BR", { numeric: true }) || a.nome.localeCompare(b.nome)
        : ORDEM_STATUS.indexOf(a.status) - ORDEM_STATUS.indexOf(b.status) || b.naoColetados - a.naoColetados,
    );
  }, [recorte, status, ordem]);

  const alternar = (k: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  if (erro) return <div className={"rounded-2xl border px-4 py-3 text-sm " + FAIXA.vermelho}>Não consegui ler a COLETAS_D0: {erro}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-slate-500">
        <span>
          {dataBR} · planilha lida às <b className="tabular-nums text-slate-700">{lidoEm || "—"}</b> · relê a cada {RELER_MIN} min
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Cartao titulo="Rotas DED hoje" valor={int(cartoes.rotas)} detalhe="rotas com DED no nome, sem repetir" />
        <Cartao titulo="Estimados" valor={int(cartoes.est)} detalhe="nos pontos das dedicadas" />
        <Cartao titulo="Coletados" valor={int(cartoes.col)} detalhe={int(cartoes.perda) + " não coletados"} />
        <Cartao titulo="PU hoje" valor={pct(cartoes.pu)} detalhe="coletados / estimados" cor="#2563eb" />
        <Cartao titulo="PU 30 dias" valor={pct(cartoes.pu30)} detalhe="base oficial do PU, mesmos pontos" cor="#94a3b8" />
        <Cartao
          titulo="Forms"
          valor={cartoes.forms + "/" + cartoes.rodando}
          detalhe={"Forms Final de Rota feitos · " + (cartoes.rodando - cartoes.forms) + " pendentes"}
          cor="#2563eb"
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <Campo titulo="Cluster">
          <MultiSelect opcoes={opcoes.clusters} selecionados={clusters} setSelecionados={setClusters} rotuloTodas="Todos" />
        </Campo>
        <Campo titulo="Transportadora">
          <MultiSelect opcoes={opcoes.transps} selecionados={transps} setSelecionados={setTransps} rotuloTodas="Todas" />
        </Campo>
        <Campo titulo="Buscar">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Rota, ponto ou ID (BRP…)"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </Campo>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</span>
          <div className="flex flex-wrap gap-1">
            {ORDEM_STATUS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatus(status === st ? null : st)}
                aria-pressed={status === st}
                className={
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm " +
                  (status === st ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100")
                }
              >
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS[st].cor }} />
                {STATUS[st].rotulo} <span className="tabular-nums opacity-70">{cartoes.porStatus[st]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setListaAberta(!listaAberta)} aria-expanded={listaAberta} className="flex items-start gap-2 text-left">
            <span className="mt-0.5 w-3 text-slate-400">{listaAberta ? "▾" : "▸"}</span>
            <span>
              <span className="block text-base font-bold text-slate-900">Dedicadas</span>
              <span className="block text-xs text-slate-500">
                {lista.length} {lista.length === 1 ? "dedicada" : "dedicadas"} · identificadas pelos IDs dos pontos (o nome da rota pode
                mudar) · {listaAberta ? "clique numa dedicada para ver os pontos e as rotas" : "clique para abrir a lista"}
              </span>
            </span>
          </button>
          {listaAberta && (
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(["perda", "cluster"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrdem(o)}
                className={"rounded-full px-3 py-1 font-semibold " + (ordem === o ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                {o === "perda" ? "Maior perda" : "Cluster"}
              </button>
            ))}
          </div>
          )}
        </div>
        {listaAberta && (
        <div className="mt-3 space-y-2">
          {lista.map((d, i) => (
            <div key={d.chave}>
              {ordem === "cluster" && (i === 0 || lista[i - 1].cluster !== d.cluster) && (
                <p className="mb-1 mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {d.cluster || "Sem cluster"} · {opsDoCluster(d.cluster)}
                </p>
              )}
              <LinhaDedicada
                d={d}
                dataBR={dataBR}
                hist={historico[d.chave] ?? []}
                aberto={abertos.has(d.chave)}
                alternar={() => alternar(d.chave)}
                salvarNome={salvarNome}
              />
            </div>
          ))}
          {!lista.length && (
            <p className="py-6 text-center text-sm text-slate-500">
              {dias.length ? "Nenhuma dedicada no filtro." : "Nenhuma rota com DED no nome hoje (relatório de coleta e plano do dia)."}
            </p>
          )}
        </div>
        )}
      </section>

      <GraficoDedicada dataBR={dataBR} dias={dias} base={base} historico={historico} />
    </div>
  );
}
