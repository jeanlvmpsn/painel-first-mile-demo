"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { acharPontos, buscarPonto, type FontesBusca, type PassagemBusca, type SituacaoBusca } from "../../lib/buscaPonto";

const nada = () => () => {};
const useNoNavegador = () => useSyncExternalStore(nada, () => true, () => false);

const linkRota = (id: string) => "/demo/rota/" + encodeURIComponent(id);
const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

const SITUACAO: Record<SituacaoBusca, { rotulo: string; classe: string }> = {
  passou: { rotulo: "Passou", classe: "bg-[#e6f6f0] text-[#0f6b4e]" },
  emRota: { rotulo: "Em rota", classe: "bg-[#fdf3e4] text-[#8a5210]" },
  semInicio: { rotulo: "Sem início", classe: "bg-slate-100 text-slate-600" },
  cancelada: { rotulo: "Cancelada", classe: "bg-[#fdeceb] text-[#94160e]" },
};
const CULPA: Record<string, string> = { ME: "Culpa Meli", SELLER: "Culpa seller", PLACE: "Culpa place" };
const PONTUALIDADE: Record<string, string> = { onTime: "no horário", early: "cedo", late: "atrasada" };

export default function BuscaPonto({
  fontes,
  saldos,
}: {
  fontes: FontesBusca;
  saldos: Record<string, { estimados: number; preparados: number; coletados: number }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [escolhido, setEscolhido] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const montado = useNoNavegador();

  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  const achados = useMemo(() => acharPontos(q, fontes), [q, fontes]);

  const alvo = achados.length === 1 ? achados[0].id : achados.some((a) => a.id === escolhido) ? escolhido : "";
  const resultado = useMemo(() => (alvo ? buscarPonto(alvo, fontes) : null), [alvo, fontes]);
  const saldo = alvo ? saldos[alvo] : undefined;

  if (!montado) return null;
  return createPortal(
    <>
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          title="Buscar um ponto pelo ID e ver as rotas e OCs de hoje"
          className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-lg bg-slate-900 px-2 py-3 text-xs font-semibold text-white shadow-lg [writing-mode:vertical-rl] hover:bg-slate-700"
        >
          Buscar ponto
        </button>
      )}
      {aberto && (
        <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center gap-2 border-b border-slate-200 p-3">
            <input
              ref={campo}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setEscolhido("");
              }}
              placeholder="ID do seller / place (ou parte do nome)"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 font-mono text-sm focus:border-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="rounded px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-sm">
            {!q.trim() && <p className="text-xs text-slate-500">Digite o ID do ponto. As rotas de hoje aparecem com a OC e o horário, da mais cedo para a mais tarde.</p>}
            {q.trim() && achados.length === 0 && <p className="text-xs text-slate-500">Nenhum ponto de hoje com esse ID ou nome.</p>}
            {achados.length > 1 && !alvo && (
              <ul className="space-y-1">
                {achados.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setEscolhido(a.id)} className="w-full rounded px-2 py-1 text-left hover:bg-slate-100">
                      <span className="font-medium text-slate-800">{a.nome}</span>
                      <span className="ml-2 font-mono text-[11px] text-slate-500">{a.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {resultado && (
              <div>
                {achados.length > 1 && (
                  <button type="button" onClick={() => setEscolhido("")} className="mb-2 text-xs text-blue-700 hover:underline">
                    ← outros {achados.length} pontos
                  </button>
                )}
                <p className="font-semibold text-slate-900">{resultado.nome}</p>
                <p className="font-mono text-[11px] text-slate-500">{resultado.id}</p>
                {saldo && (
                  <p className="mt-1 text-xs text-slate-600">
                    Na tela: estimado {int(saldo.estimados)} · preparado {int(saldo.preparados)} · coletado {int(saldo.coletados)} ·{" "}
                    <b>restam {int(Math.max(0, saldo.estimados - saldo.coletados))}</b>
                  </p>
                )}
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {resultado.passagens.length} {resultado.passagens.length === 1 ? "rota" : "rotas"} hoje
                </p>
                {resultado.passagens.length === 0 && <p className="text-xs text-slate-500">Nenhuma rota de hoje encontrada neste ponto.</p>}
                <ol className="mt-1 space-y-2">
                  {resultado.passagens.map((p, i) => (
                    <Passagem key={i} p={p} />
                  ))}
                </ol>
              </div>
            )}
          </div>
        </aside>
      )}
    </>,
    document.body,
  );
}

function Passagem({ p }: { p: PassagemBusca }) {
  return (
    <li className="rounded border border-slate-200 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-11 shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-900">{p.hora || "—"}</span>
        {p.rotaId ? (
          <a href={linkRota(p.rotaId)} target="_blank" rel="noreferrer" className="font-medium text-blue-700 underline decoration-blue-300 underline-offset-2">
            {p.rota}
          </a>
        ) : (
          <span className="font-medium text-slate-800">{p.rota}</span>
        )}
        <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold " + SITUACAO[p.situacao].classe}>{SITUACAO[p.situacao].rotulo}</span>
      </div>
      <div className="mt-1 pl-[3.25rem] text-xs text-slate-600">
        {p.oc ? (
          <p className="font-medium text-slate-800">
            {p.oc}
            {p.culpa?.culpa && <span className="ml-1.5 font-normal text-[#94160e]">· {CULPA[p.culpa.culpa]}</span>}
          </p>
        ) : (
          p.situacao === "passou" && <p className="text-slate-500">Sem OC</p>
        )}
        <p>
          {[p.transportadora, p.janela && "janela " + p.janela.replace(/\s*hs?$/i, ""), p.pontualidade && PONTUALIDADE[p.pontualidade]]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {p.estimados !== null && (
          <p className="tabular-nums">
            {p.fonte === "monitoramento" ? "preparados" : "estimados"} {int(p.estimados)} · coletados {int(p.coletados ?? 0)}
          </p>
        )}
      </div>
    </li>
  );
}
