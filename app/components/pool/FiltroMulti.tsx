"use client";

import { useEffect, useRef, useState } from "react";

import { alternar } from "../../lib/poolFiltros";

export default function FiltroMulti({
  rotulo,
  opcoes,
  escolhidos,
  aoMudar,
  rotulos,
  rotuloTodos,
}: {
  rotulo: string;
  opcoes: string[];
  escolhidos: string[];
  aoMudar: (novos: string[]) => void;
  rotulos?: Record<string, string>;
  rotuloTodos?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const ativo = escolhidos.length > 0;
  const nome = (o: string) => rotulos?.[o] ?? o;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={
          "flex w-full items-center gap-1 rounded-md border px-3 py-1.5 text-sm transition " +
          (ativo
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400")
        }
      >
        <span className="max-w-40 truncate">
          {escolhidos.length === 0
            ? (rotuloTodos ?? "Todos")
            : escolhidos.length === 1
              ? nome(escolhidos[0])
              : escolhidos.length + " selecionados"}
        </span>
        <span className="text-[10px] opacity-60">▾</span>
      </button>

      {aberto && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">
              {rotulo}
            </span>
            {ativo && (
              <button
                type="button"
                onClick={() => aoMudar([])}
                className="text-[11px] text-blue-600 hover:underline"
              >
                limpar
              </button>
            )}
          </div>
          {opcoes.length === 0 && (
            <p className="px-1 py-2 text-xs text-gray-400">nada por aqui</p>
          )}
          {opcoes.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={escolhidos.includes(o)}
                onChange={() => aoMudar(alternar(escolhidos, o))}
              />
              <span className="truncate">{nome(o)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
