"use client";

import { useCallback, useEffect, useState } from "react";

import { chaveComentario, type ComentarioPd, type NovoComentario } from "../../lib/comentariosPd";
import { ordemData } from "../../lib/acoesPontos";
import { STATUS_MAPA, type StatusMapa } from "../../lib/mapeamentoStatus";
import { COR_STATUS_MAPA } from "./VisaoMapeamento";

export type Comentarios = {
  comentarios: Record<string, ComentarioPd>;
  erro: string | null;
  salvar: (n: NovoComentario) => Promise<string | null>;
};

export function useComentariosPd(): Comentarios {
  const [comentarios, setComentarios] = useState<Record<string, ComentarioPd>>({});
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/comentarios-pd", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro ?? "Falhou.");
      setComentarios(j.comentarios);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const t0 = setTimeout(carregar, 0);
    const t = setInterval(carregar, 60 * 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [carregar]);
  const salvar = useCallback(async (n: NovoComentario) => {
    try {
      const r = await fetch("/api/comentarios-pd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(n),
      });
      const j = await r.json();
      if (!j.ok) return j.erro ?? "Falhou.";
      setComentarios(j.comentarios);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);
  return { comentarios, erro, salvar };
}

const hora = (d: string) => d.match(/\s(\d{2}:\d{2})/)?.[1] ?? d;

function ChipObs({ obs }: { obs: StatusMapa | null }) {
  if (!obs) return null;
  return <span className={"whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold " + COR_STATUS_MAPA[obs]}>{obs}</span>;
}

export function ResumoComentario({ c, onEditar }: { c: ComentarioPd; onEditar?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap">
      <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">comentário</span>
      <ChipObs obs={c.obs} />
      <span className="truncate text-slate-700" title={c.comentario}>
        {c.comentario}
      </span>
      <span className="shrink-0 text-[10px] text-slate-400">
        {c.autor} · {hora(c.registradoEm)}
        {c.historico.length > 1 && " · " + c.historico.length + " versões"}
      </span>
      {onEditar && (
        <button type="button" onClick={onEditar} className="shrink-0 text-[10px] font-semibold text-blue-700 hover:underline">
          editar
        </button>
      )}
    </span>
  );
}

export function EditorComentario({
  ponto,
  atual,
  inicial = "",
  autor,
  hojeBR,
  salvar,
  fechar,
}: {
  ponto: { idParada: string; ponto: string; cluster: string };
  atual?: ComentarioPd;

  inicial?: string;
  autor: string;
  hojeBR: string;
  salvar: (n: NovoComentario) => Promise<string | null>;
  fechar: () => void;
}) {
  const [obs, setObs] = useState<string>(atual?.obs ?? "");
  const [comentario, setComentario] = useState(atual?.comentario ?? inicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (apagar = false) => {
    if (!apagar && !obs && !comentario.trim()) {
      setErro("Escolha a Obs ou escreva o comentário.");
      return;
    }
    if (apagar && !window.confirm("Apagar o comentário deste ponto hoje? O histórico fica na planilha.")) return;
    setEnviando(true);
    const e = await salvar({
      ...ponto,
      data: atual?.data ?? hojeBR,
      obs: apagar ? "" : obs,
      comentario: apagar ? "" : comentario.trim(),
      autor: autor.trim(),
    });
    setEnviando(false);
    if (e) setErro(e);
    else fechar();
  };
  const campo = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs";
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
      <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
        Obs
        <select value={obs} onChange={(e) => setObs(e.target.value)} className={campo}>
          <option value="">—</option>
          {STATUS_MAPA.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[260px] flex-1 flex-col gap-0.5 text-[10px] font-semibold uppercase text-slate-500">
        Comentário
        <input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="o que está acontecendo no ponto..."
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
          Apagar
        </button>
      )}
      {!autor.trim() && <span className="w-full text-[11px] text-[#8a5210]">Preencha &quot;Seu nome&quot; nos filtros para assinar.</span>}
      {erro && <span className="w-full text-[11px] text-[#94160e]">{erro}</span>}
    </div>
  );
}

export function VisaoComentarios({
  comentarios,
  erro,
  autor,
  hojeBR,
  salvar,
}: {
  comentarios: Record<string, ComentarioPd>;
  erro: string | null;
  autor: string;
  hojeBR: string;
  salvar: (n: NovoComentario) => Promise<string | null>;
}) {
  const [obs, setObs] = useState<StatusMapa | null>(null);
  const [buscaId, setBuscaId] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [comHistorico, setComHistorico] = useState<string | null>(null);
  const q = buscaId.replace(/\s+/g, "").toLowerCase();
  const todos = Object.entries(comentarios)
    .filter(([, c]) => !q || c.idParada.toLowerCase().includes(q))
    .sort((a, b) => ordemData(b[1].registradoEm) - ordemData(a[1].registradoEm));
  const conta = (s: StatusMapa) => todos.filter(([, c]) => c.obs === s).length;
  const vistos = todos.filter(([, c]) => !obs || c.obs === obs);
  const porDia = new Map<string, [string, ComentarioPd][]>();
  for (const x of vistos) porDia.set(x[1].data, [...(porDia.get(x[1].data) ?? []), x]);
  const dias = [...porDia.entries()].sort((a, b) => ordemData(b[0]) - ordemData(a[0]));
  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Comentários por ponto</h2>
            <p className="text-xs text-slate-500">
              O que o time escreveu nos pontos da visão PD, por dia: a Obs (mesmas opções do Status do Mapeamento) e o comentário.
              Editar aqui ou no ponto na visão PD é a mesma coisa; cada alteração fica no histórico.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            <b className="text-slate-900">{todos.length}</b> {todos.length === 1 ? "comentário" : "comentários"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setObs(null)}
            className={"rounded-full border px-3 py-1 font-semibold " + (!obs ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500")}
          >
            Todos {todos.length}
          </button>
          {STATUS_MAPA.filter((s) => conta(s) > 0 || obs === s).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setObs(obs === s ? null : s)}
              className={"rounded-full border px-3 py-1 font-semibold " + COR_STATUS_MAPA[s] + (obs === s ? " ring-2 ring-slate-900/30" : "")}
            >
              {s} {conta(s)}
            </button>
          ))}
          <input
            value={buscaId}
            onChange={(e) => setBuscaId(e.target.value)}
            placeholder="ID do seller / place"
            className="ml-auto w-48 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
          />
        </div>
        {erro && <p className="mt-2 text-xs text-[#94160e]">Não consegui ler os comentários: {erro}</p>}
      </div>
      {dias.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          Nenhum comentário{obs ? " com Obs " + obs : ""}. Escreva um no ponto, na visão PD.
        </p>
      ) : (
        dias.map(([dia, lista]) => (
          <div key={dia} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
              <span>
                <b className="text-slate-900">{dia}</b>
                {dia === hojeBR && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">hoje</span>}
              </span>
              <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold text-slate-600">{lista.length}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {lista.map(([k, c]) => (
                <li key={k} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <ChipObs obs={c.obs} />
                    <span className="font-semibold text-slate-900">{c.ponto || "—"}</span>
                    <span className="cursor-text select-all font-mono text-[10px] text-slate-400" title="Clique para selecionar e copiar">
                      {c.idParada}
                    </span>
                    {c.cluster && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{c.cluster}</span>}
                    <span className="ml-auto flex gap-3">
                      <button type="button" onClick={() => setEditando(editando === k ? null : k)} className="font-semibold text-blue-700 hover:underline">
                        editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setComHistorico(comHistorico === k ? null : k)}
                        className="font-semibold text-slate-500 hover:underline"
                      >
                        histórico ({c.historico.length})
                      </button>
                    </span>
                  </div>
                  {c.comentario && <p className="mt-1 text-sm text-slate-800">{c.comentario}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    por {c.autor || "—"} às {hora(c.registradoEm)}
                  </p>
                  {editando === k && (
                    <div className="mt-2">
                      <EditorComentario
                        ponto={{ idParada: c.idParada, ponto: c.ponto, cluster: c.cluster }}
                        atual={c}
                        autor={autor}
                        hojeBR={hojeBR}
                        salvar={salvar}
                        fechar={() => setEditando(null)}
                      />
                    </div>
                  )}
                  {comHistorico === k && (
                    <table className="mt-2 w-full text-[11px]">
                      <tbody>
                        {c.historico.map((v, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="whitespace-nowrap py-1 pr-3 tabular-nums text-slate-500">{hora(v.registradoEm)}</td>
                            <td className="whitespace-nowrap py-1 pr-3 text-slate-600">{v.autor || "—"}</td>
                            <td className="whitespace-nowrap py-1 pr-3">
                              {v.obs || v.comentario ? <ChipObs obs={v.obs} /> : <span className="text-[#94160e]">apagado</span>}
                            </td>
                            <td className="py-1 text-slate-700">{v.comentario}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

export const comentarioDeHoje = (c: Comentarios, hojeBR: string, idParada: string) => c.comentarios[chaveComentario(hojeBR, idParada)];
