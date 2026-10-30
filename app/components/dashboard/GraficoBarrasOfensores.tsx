"use client";

import type { ItemOfensor } from "../../lib/dashboardUtils";

type Props = {
  titulo: string;
  dados: ItemOfensor[];
  nomeCategoria: string;

  larguraEixoY: number;
  corBase: string;
  corSelecionada: string;
  estaSelecionado: (chave: string) => boolean;
  onClickBarra: (chave: string) => void;

  formatarRotuloEixo?: (chave: string) => string;
  formatarRotuloTooltip?: (chave: string) => string;
};

export default function GraficoBarrasOfensores({
  titulo,
  dados,
  nomeCategoria,
  larguraEixoY,
  corBase,
  corSelecionada,
  estaSelecionado,
  onClickBarra,
  formatarRotuloEixo,
  formatarRotuloTooltip,
}: Props) {
  const maior = Math.max(1, ...dados.map((d) => d.pendentes));
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-gray-500 text-sm font-medium mb-3">{titulo}</h3>
      {dados.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Sem pendências no filtro atual.</p>
      ) : (
        <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {dados.map((d) => {
            const selecionado = estaSelecionado(d.chave);
            const nome = formatarRotuloTooltip ? formatarRotuloTooltip(d.chave) : d.chave;
            return (
              <li key={d.chave}>
                <button
                  type="button"
                  onClick={() => onClickBarra(d.chave)}
                  aria-pressed={selecionado}
                  title={nomeCategoria + " " + nome + ": " + d.pendentes + " pendente" + (d.pendentes === 1 ? "" : "s")}
                  className="group flex w-full items-center gap-2 rounded text-left text-xs hover:bg-[#f4f4f2]"
                >
                  <span className="shrink-0 truncate text-right text-[#52514e]" style={{ width: larguraEixoY }}>
                    {formatarRotuloEixo ? formatarRotuloEixo(d.chave) : d.chave}
                  </span>
                  <span className="relative h-4 flex-1">
                    <span
                      className="absolute inset-y-0 left-0 rounded-r"
                      style={{
                        width: Math.max(2, (d.pendentes / maior) * 100) + "%",
                        backgroundColor: selecionado ? corSelecionada : corBase,
                      }}
                    />
                  </span>
                  <span className="w-8 shrink-0 tabular-nums text-[#52514e]">{d.pendentes}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
