"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CATEGORIAS_ACAO,
  ordemData,
  RESPONSAVEIS_ACAO,
  STATUS_ACAO,
  STATUS_ACAO_ANTIGOS,
  type AcaoPonto,
  type NovaAcao,
  type StatusAcao,
  type VersaoAcao,
} from "../../lib/acoesPontos";

export const COR_STATUS: Record<StatusAcao, string> = {
  "A tratar": "border-[#f3d19c] bg-[#fdf3e4] text-[#8a5210]",
  "Em tratativa": "border-[#bcd0f7] bg-[#eef4ff] text-[#1e40af]",
  Resolvido: "border-[#a7dcc6] bg-[#e6f6f0] text-[#0f6b4e]",
  Reprovado: "border-[#94160e] bg-[#94160e] text-white",
  "Culpa transportadora": "border-[#f2b8b3] bg-[#fdeceb] text-[#94160e]",
  "Erro sistêmico": "border-slate-300 bg-slate-100 text-slate-600",
};

const POLL_MS = 60 * 1000;

export type Acoes = {
  acoes: Record<string, AcaoPonto>;

  causas: string[];

  responsaveis: string[];
  erro: string | null;
  carregando: boolean;
  salvar: (n: NovaAcao) => Promise<string | null>;
  novaCausa: (causa: string, autor: string) => Promise<string | null>;
  novoResponsavel: (time: string, autor: string) => Promise<string | null>;
};

export function useAcoesPontos(): Acoes {
  const [acoes, setAcoes] = useState<Record<string, AcaoPonto>>({});
  const [causas, setCausas] = useState<string[]>([...CATEGORIAS_ACAO]);
  const [responsaveis, setResponsaveis] = useState<string[]>([...RESPONSAVEIS_ACAO]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/acoes-pontos", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro ?? "Falhou.");
      setAcoes(j.acoes);
      if (Array.isArray(j.causas)) setCausas(j.causas);
      if (Array.isArray(j.responsaveis)) setResponsaveis(j.responsaveis);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    const t0 = setTimeout(carregar, 0);
    const t = setInterval(carregar, POLL_MS);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [carregar]);
  const salvar = useCallback(async (n: NovaAcao) => {
    try {
      const r = await fetch("/api/acoes-pontos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n),
      });
      const j = await r.json();
      if (!j.ok) return j.erro ?? "Falhou.";
      setAcoes(j.acoes);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);

  const criarOpcao = useCallback(
    async (corpo: Record<string, string>, lista: "causas" | "responsaveis", aplicar: (l: string[]) => void) => {
      try {
        const r = await fetch("/api/acoes-pontos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        const j = await r.json();
        if (!j.ok) return j.erro ?? "Falhou.";
        aplicar(j[lista]);
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
    [],
  );
  const novaCausa = useCallback(
    (causa: string, autor: string) => criarOpcao({ novaCausa: causa, autor }, "causas", setCausas),
    [criarOpcao],
  );
  const novoResponsavel = useCallback(
    (time: string, autor: string) => criarOpcao({ novoResponsavel: time, autor }, "responsaveis", setResponsaveis),
    [criarOpcao],
  );
  return { acoes, causas, responsaveis, erro, carregando, salvar, novaCausa, novoResponsavel };
}

const curta = (d: string) => {
  const m = d.match(/^(\d{2}\/\d{2})\/\d{4}\s+(\d{2}:\d{2})/);
  return m ? m[1] + " " + m[2] : d;
};

export function ChipStatus({ s }: { s: StatusAcao }) {
  return <span className={"whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold " + COR_STATUS[s]}>{s}</span>;
}

function ChipCategoria({ c }: { c: string }) {
  return <span className="whitespace-nowrap rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{c}</span>;
}

function ChipResponsavel({ r }: { r: string }) {
  if (!r) return null;
  return (
    <span className="whitespace-nowrap rounded border border-[#d9c7f2] bg-[#f6f0fd] px-1.5 py-0.5 text-[10px] font-semibold text-[#6b21a8]" title="Responsável pela ação">
      {r}
    </span>
  );
}

export type NomeDoPonto = (idParada: string) => string | null;

function ChipDirecional({ id, salvo, nomeDoPonto }: { id: string; salvo?: string; nomeDoPonto?: NomeDoPonto }) {
  if (!id) return null;
  const nome = nomeDoPonto?.(id) || salvo;
  return (
    <span
      className="inline-flex max-w-[260px] items-center gap-1 whitespace-nowrap rounded border border-[#bcd0f7] bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold text-[#1e40af]"
      title={"Causa/ação no ponto " + (nome ? nome + " · " : "") + "ID " + id}
    >
      <span className="shrink-0">→</span>
      {nome && <span className="truncate">{nome}</span>}
      <span className="shrink-0 font-mono font-normal">{id}</span>
    </span>
  );
}

export function ResumoAcao({ a, onEditar, nomeDoPonto }: { a: AcaoPonto; onEditar?: () => void; nomeDoPonto?: NomeDoPonto }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap">
      <ChipStatus s={a.status} />
      <ChipResponsavel r={a.responsavel} />
      <ChipDirecional id={a.idDirecional} salvo={a.nomeDirecional} nomeDoPonto={nomeDoPonto} />
      <ChipCategoria c={a.categoria} />
      <span className="truncate text-slate-700" title={a.comentario}>
        {a.comentario || <span className="text-slate-400">sem ação</span>}
      </span>
      <span className="shrink-0 text-[10px] text-slate-400">
        {a.autor} · {curta(a.registradoEm)}
        {a.historico.length > 1 && " · " + a.historico.length + " versões"}
      </span>
      {onEditar && (
        <button type="button" onClick={onEditar} className="shrink-0 text-[10px] font-semibold text-blue-700 hover:underline">
          editar
        </button>
      )}
    </span>
  );
}

function SeletorComNovo({
  rotulo,
  valor,
  setValor,
  opcoes,
  criar,
  botao,
  dica,
  max,
  vazio,
  autor,
  setErro,
}: {
  rotulo: string;
  valor: string;
  setValor: (v: string) => void;
  opcoes: string[];
  criar: (nome: string, autor: string) => Promise<string | null>;
  botao: string;
  dica: string;
  max: number;

  vazio?: string;
  autor: string;
  setErro: (e: string | null) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [novo, setNovo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs";
  const adicionar = async () => {
    const nome = novo.trim();
    if (!nome) return;
    setEnviando(true);
    const e = await criar(nome, autor.trim());
    setEnviando(false);
    if (e) {
      setErro(e);
      return;
    }
    setValor(nome.replace(/\s+/g, " "));
    setNovo("");
    setCriando(false);
    setErro(null);
  };
  const lista = !valor || opcoes.includes(valor) ? opcoes : [...opcoes, valor];
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
      {rotulo}
      {criando ? (
        <span className="flex gap-1">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
            placeholder={botao.replace(/^\+\s*/, "")}
            maxLength={max}
            className={campo + " w-36 normal-case"}
            autoFocus
          />
          <button
            type="button"
            disabled={enviando}
            onClick={adicionar}
            className="rounded-md border border-slate-300 bg-white px-2 font-semibold normal-case text-slate-700 disabled:opacity-50"
          >
            Adicionar
          </button>
          <button type="button" onClick={() => setCriando(false)} className="px-1 font-semibold normal-case text-slate-400">
            ×
          </button>
        </span>
      ) : (
        <span className="flex gap-1">
          <select value={valor} onChange={(e) => setValor(e.target.value)} className={campo + " normal-case"}>
            {vazio !== undefined && <option value="">{vazio}</option>}
            {lista.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setCriando(true)}
            title={dica}
            className="whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 font-semibold normal-case text-slate-600 hover:text-slate-900"
          >
            {botao}
          </button>
        </span>
      )}
    </label>
  );
}

export function EditorAcao({
  ponto,
  atual,
  autor,
  hojeBR,
  salvar,
  fechar,
  causas,
  novaCausa,
  responsaveis,
  novoResponsavel,
}: {
  ponto: { idParada: string; ponto: string; cluster: string };
  atual?: AcaoPonto;
  autor: string;
  hojeBR: string;
  salvar: (n: NovaAcao) => Promise<string | null>;
  fechar: () => void;
  causas: string[];
  novaCausa: (causa: string, autor: string) => Promise<string | null>;
  responsaveis: string[];
  novoResponsavel: (time: string, autor: string) => Promise<string | null>;
}) {
  const [responsavel, setResponsavel] = useState<string>(atual?.responsavel ?? "");
  const [status, setStatus] = useState<string>(atual?.status ?? "A tratar");
  const [categoria, setCategoria] = useState<string>(atual?.categoria ?? CATEGORIAS_ACAO[0]);
  const [comentario, setComentario] = useState(atual?.comentario ?? "");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (excluido = false) => {
    if (excluido && !window.confirm("Excluir a ação deste ponto? O histórico fica guardado na planilha.")) return;

    if (!excluido && !responsavel) {
      setErro("Escolha o responsável pela ação.");
      return;
    }
    setEnviando(true);
    const e = await salvar({
      ...ponto,
      status,

      idDirecional: atual?.idDirecional ?? "",
      nomeDirecional: atual?.nomeDirecional ?? "",
      categoria, responsavel, comentario, diaImpacto: hojeBR, autor: autor.trim(), excluido });
    setEnviando(false);
    if (e) setErro(e);
    else fechar();
  };
  const campo = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs";
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
      <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={campo}>

          {(STATUS_ACAO.includes(status as (typeof STATUS_ACAO)[number]) ? [...STATUS_ACAO] : [...STATUS_ACAO, status]).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <SeletorComNovo
        rotulo="Responsável"
        valor={responsavel}
        setValor={setResponsavel}
        opcoes={responsaveis}
        criar={novoResponsavel}
        botao="+ novo time"
        dica="Criar um time responsável novo (vale para todo o time)"
        max={30}
        vazio="Escolha..."
        autor={autor}
        setErro={setErro}
      />
      <SeletorComNovo
        rotulo="Causa"
        valor={categoria}
        setValor={setCategoria}
        opcoes={causas}
        criar={novaCausa}
        botao="+ nova causa"
        dica="Criar uma causa nova (vale para todo o time)"
        max={40}
        autor={autor}
        setErro={setErro}
      />
      <label className="flex min-w-[260px] flex-1 flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
        Ação
        <input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          className={campo + " normal-case"}
          autoFocus
        />
      </label>
      <button
        type="button"
        disabled={enviando}
        onClick={() => enviar()}
        className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {enviando ? "Salvando..." : "Salvar"}
      </button>
      <button type="button" onClick={fechar} className="rounded-md px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-800">
        Cancelar
      </button>
      {atual && (
        <button type="button" disabled={enviando} onClick={() => enviar(true)} className="rounded-md px-2 py-1.5 font-semibold text-[#94160e] hover:underline">
          Excluir
        </button>
      )}
      {!autor.trim() && <span className="w-full text-[11px] text-[#8a5210]">Preencha &quot;Seu nome&quot; nos filtros para assinar.</span>}
      {erro && <span className="w-full text-[11px] text-[#94160e]">{erro}</span>}
    </div>
  );
}

function Historico({ versoes, nomeDoPonto }: { versoes: VersaoAcao[]; nomeDoPonto?: NomeDoPonto }) {
  return (
    <table className="mt-2 w-full text-[11px]">
      <tbody>
        {versoes.map((v) => (
          <tr key={v.versao} className="border-t border-slate-100">
            <td className="whitespace-nowrap py-1 pr-3 tabular-nums text-slate-500">{curta(v.registradoEm)}</td>
            <td className="whitespace-nowrap py-1 pr-3 text-slate-600">{v.autor || "—"}</td>
            <td className="whitespace-nowrap py-1 pr-3">
              {v.excluido ? <span className="text-[#94160e]">excluída</span> : <ChipStatus s={v.status} />}
            </td>
            <td className="whitespace-nowrap py-1 pr-3">
              <ChipResponsavel r={v.responsavel} />
            </td>
            <td className="whitespace-nowrap py-1 pr-3">
              <ChipDirecional id={v.idDirecional} salvo={v.nomeDirecional} nomeDoPonto={nomeDoPonto} />
            </td>
            <td className="whitespace-nowrap py-1 pr-3">
              <ChipCategoria c={v.categoria} />
            </td>
            <td className="py-1 text-slate-700">{v.comentario}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NovaAcaoForm({
  acoes,
  autor,
  hojeBR,
  salvar,
  fechar,
  causas,
  novaCausa,
  responsaveis,
  novoResponsavel,
  nomeDoPonto,
  clusterDoPonto,
  editarExistente,
}: {
  acoes: Record<string, AcaoPonto>;
  autor: string;
  hojeBR: string;
  salvar: (n: NovaAcao) => Promise<string | null>;
  fechar: () => void;
  causas: string[];
  novaCausa: (causa: string, autor: string) => Promise<string | null>;
  responsaveis: string[];
  novoResponsavel: (time: string, autor: string) => Promise<string | null>;
  nomeDoPonto?: NomeDoPonto;
  clusterDoPonto?: (idParada: string) => string | null;
  editarExistente: (chave: string) => void;
}) {
  const [id, setId] = useState("");
  const [nome, setNome] = useState("");
  const [cluster, setCluster] = useState("");
  const idLimpo = id.trim();

  const mudarId = (v: string) => {
    setId(v);
    setNome(nomeDoPonto?.(v.trim()) ?? "");
    setCluster(clusterDoPonto?.(v.trim()) ?? "");
  };
  const existente = Object.entries(acoes).find(([, a]) => idLimpo && a.idParada.trim() === idLimpo);
  const campo = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs";
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
          ID do ponto
          <input
            value={id}
            onChange={(e) => mudarId(e.target.value)}
            placeholder="ex.: 849817033_22435"
            className={campo + " w-48 font-mono normal-case"}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
          Nome do ponto
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={idLimpo ? "fora do painel hoje: digite" : ""}
            className={campo + " w-64 normal-case"}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
          Cluster
          <input
            value={cluster}
            onChange={(e) => setCluster(e.target.value.toUpperCase())}
            placeholder={idLimpo ? "C01" : ""}
            maxLength={5}
            className={campo + " w-20 normal-case"}
          />
        </label>
        <button type="button" onClick={fechar} className="rounded-md px-2 py-1.5 font-semibold text-slate-500 hover:text-slate-800">
          Fechar
        </button>
      </div>
      {existente ? (
        <p className="text-[11px] text-[#8a5210]">
          Esse ponto já tem ação.{" "}
          <button type="button" onClick={() => editarExistente(existente[0])} className="font-semibold text-blue-700 hover:underline">
            Editar a ação dele
          </button>
        </p>
      ) : idLimpo ? (
        <EditorAcao
          ponto={{ idParada: idLimpo, ponto: nome.trim(), cluster: cluster.trim() }}
          autor={autor}
          hojeBR={hojeBR}
          salvar={salvar}
          fechar={fechar}
          causas={causas}
          novaCausa={novaCausa}
          responsaveis={responsaveis}
          novoResponsavel={novoResponsavel}
        />
      ) : (
        <p className="text-[11px] text-slate-400">Digite o ID do seller/place para abrir a ação.</p>
      )}
    </div>
  );
}

export function VisaoAcoes({
  acoes,
  causas,
  novaCausa,
  responsaveis,
  novoResponsavel,
  autor,
  hojeBR,
  salvar,
  naoColetadoHoje,
  nomeDoPonto,
  clusterDoPonto,
  erro,
}: {
  acoes: Record<string, AcaoPonto>;
  causas: string[];
  novaCausa: (causa: string, autor: string) => Promise<string | null>;
  responsaveis: string[];
  novoResponsavel: (time: string, autor: string) => Promise<string | null>;
  autor: string;
  hojeBR: string;
  salvar: (n: NovaAcao) => Promise<string | null>;

  naoColetadoHoje: (idParada: string) => number | null;
  nomeDoPonto?: NomeDoPonto;
  clusterDoPonto?: (idParada: string) => string | null;
  erro: string | null;
}) {
  const [status, setStatus] = useState<StatusAcao | null>(null);

  const [criando, setCriando] = useState(false);
  const [cluster, setCluster] = useState("");

  const [responsavel, setResponsavel] = useState("");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [comHistorico, setComHistorico] = useState<string | null>(null);
  const todas = useMemo(
    () => Object.entries(acoes).sort((a, b) => ordemData(b[1].registradoEm) - ordemData(a[1].registradoEm)),
    [acoes],
  );
  const clusters = useMemo(
    () => [...new Set(todas.map(([, a]) => a.cluster).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    [todas],
  );

  const q = busca.replace(/\s+/g, "").toLowerCase();
  const doRecorte = todas.filter(
    ([, a]) =>
      (!cluster || a.cluster === cluster) &&
      (!responsavel || (responsavel === "-" ? !a.responsavel : a.responsavel === responsavel)) &&
      (!q || [a.idParada, a.idDirecional].some((x) => x.toLowerCase().includes(q))),
  );

  const opcoesResponsavel = [...new Set([...responsaveis, ...todas.map(([, a]) => a.responsavel).filter(Boolean)])];
  const temSemResponsavel = todas.some(([, a]) => !a.responsavel);

  const contagem = Object.fromEntries([...STATUS_ACAO, ...STATUS_ACAO_ANTIGOS].map((s) => [s, 0])) as Record<StatusAcao, number>;
  for (const [, a] of doRecorte) contagem[a.status]++;
  const vistas = doRecorte.filter(([, a]) => !status || a.status === status);
  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Ações por ponto</h2>
            <p className="text-xs text-slate-500">
              O que o time combinou na agenda do PD para cada ponto, com a causa (capacidade, volumoso, horário...). A ação é
              criada e editada aqui; cada alteração fica no histórico.
            </p>
          </div>
          <span className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              <b className="text-slate-900">{todas.length}</b> {todas.length === 1 ? "ação" : "ações"}
            </span>
            <button
              type="button"
              onClick={() => setCriando(!criando)}
              aria-pressed={criando}
              className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white hover:bg-slate-700"
            >
              + nova ação
            </button>
          </span>
        </div>
        {criando && (
          <div className="mt-3">
            <NovaAcaoForm
              acoes={acoes}
              autor={autor}
              hojeBR={hojeBR}
              salvar={salvar}
              fechar={() => setCriando(false)}
              causas={causas}
              novaCausa={novaCausa}
              responsaveis={responsaveis}
              novoResponsavel={novoResponsavel}
              nomeDoPonto={nomeDoPonto}
              clusterDoPonto={clusterDoPonto}
              editarExistente={(k) => {
                setCriando(false);
                setStatus(null);
                setCluster("");
                setResponsavel("");
                setBusca("");
                setEditando(k);
              }}
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setStatus(null)}
            className={"rounded-full border px-3 py-1 text-xs font-semibold " + (!status ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500")}
          >
            Todas {doRecorte.length}
          </button>

          {[...STATUS_ACAO, ...STATUS_ACAO_ANTIGOS.filter((s) => contagem[s] > 0 || status === s)].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(status === s ? null : s)}
              className={"rounded-full border px-3 py-1 text-xs font-semibold " + COR_STATUS[s] + (status === s ? " ring-2 ring-slate-900/30" : "")}
            >
              {s} {contagem[s]}
            </button>
          ))}
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            title="Time responsável pela ação"
          >
            <option value="">Todos os responsáveis</option>
            {opcoesResponsavel.map((r) => (
              <option key={r}>{r}</option>
            ))}
            {temSemResponsavel && <option value="-">Sem responsável</option>}
          </select>
          <select
            value={cluster}
            onChange={(e) => setCluster(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            title="Cluster do ponto"
          >
            <option value="">Todos os clusters</option>
            {clusters.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="ID do seller / place"
            className="w-44 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
          />
        </div>
        {erro && <p className="mt-2 text-xs text-[#94160e]">Não consegui ler as ações: {erro}</p>}
      </div>
      {vistas.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          Nenhuma ação{status ? " " + status.toLowerCase() : ""}
          {cluster ? " no " + cluster : ""}
          {responsavel ? (responsavel === "-" ? " sem responsável" : " de " + responsavel) : ""}
          {q ? " com o ID " + busca.trim() : ""}. Crie uma em &quot;+ nova ação&quot;.
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <ul className="divide-y divide-slate-100">
            {vistas.map(([k, a]) => {
              const id = a.idDirecional || a.idParada;
              const nome = a.idDirecional ? nomeDoPonto?.(a.idDirecional) || a.nomeDirecional : a.ponto;
              const hoje = naoColetadoHoje(id);
              return (
                <li key={k} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <ChipStatus s={a.status} />
                    <ChipResponsavel r={a.responsavel} />
                    <ChipCategoria c={a.categoria} />
                    <span className="font-semibold text-slate-900">{nome || "—"}</span>
                    <span
                      className="font-mono text-[10px] text-slate-400"
                      title={a.idDirecional ? "Ação registrada no ponto " + (a.ponto || "") + " (ID " + a.idParada + ")" : undefined}
                    >
                      ID {id}
                    </span>
                    {a.cluster && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{a.cluster}</span>}
                    {a.diaImpacto && <span className="text-[11px] text-slate-500">impacto em {a.diaImpacto}</span>}
                    {hoje !== null && (
                      <span className="rounded border border-[#f2b8b3] bg-[#fdeceb] px-1.5 text-[10px] font-semibold text-[#94160e]">
                        hoje: {hoje.toLocaleString("pt-BR")} não coletados
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-[11px] text-slate-500" title={"Última alteração: " + (a.registradoEm || "—")}>
                        atualizado {a.registradoEm.slice(0, 5) || "—"}
                      </span>
                      <button type="button" onClick={() => setEditando(editando === k ? null : k)} className="font-semibold text-blue-700 hover:underline">
                        editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setComHistorico(comHistorico === k ? null : k)}
                        className="font-semibold text-slate-500 hover:underline"
                      >
                        histórico ({a.historico.length})
                      </button>
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{a.comentario || <span className="text-slate-400">sem ação</span>}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    por {a.criadoPor || "—"} · registrado {a.criadoEm}
                    {a.historico.length > 1 && " · editado " + a.registradoEm + " por " + (a.autor || "—")}
                  </p>
                  {editando === k && (
                    <div className="mt-2">
                      <EditorAcao
                        ponto={{ idParada: a.idParada, ponto: a.ponto, cluster: a.cluster }}
                        atual={a}
                        autor={autor}
                        hojeBR={hojeBR}
                        salvar={salvar}
                        fechar={() => setEditando(null)}
                        causas={causas}
                        novaCausa={novaCausa}
                        responsaveis={responsaveis}
                        novoResponsavel={novoResponsavel}
                      />
                    </div>
                  )}
                  {comHistorico === k && <Historico versoes={a.historico} nomeDoPonto={nomeDoPonto} />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
