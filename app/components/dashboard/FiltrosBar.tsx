"use client";

import { useEffect, useRef, useState } from "react";
import { MultiSelect, SeletorPeriodo } from "../ui/filtros";

type Props = {
  dataSelecionadaISO: string;
  dataFimISO: string;

  onPeriodoChange: (inicioISO: string, fimISO: string) => void;
  perfisPlanejados: string[];
  planejadosSelecionados: string[];
  setPlanejadosSelecionados: (v: string[]) => void;
  perfisAtendidos: string[];
  atendidosSelecionados: string[];
  setAtendidosSelecionados: (v: string[]) => void;
  transportadoras: string[];
  transportadora: string;
  setTransportadora: (t: string) => void;
  clusters: string[];
  clustersSelecionados: string[];
  alternarCluster: (c: string) => void;
  setClustersSelecionados: (v: string[]) => void;
  busca: string;
  setBusca: (b: string) => void;
  nseFiltro: "todas" | "sim" | "ns";
  setNseFiltro: (n: "todas" | "sim" | "ns") => void;

  coleta?: {
    opcoes: string[];
    selecionados: string[];
    setSelecionados: (v: string[]) => void;
    rotulo: (o: string) => string;
  } | null;
};

export default function FiltrosBar({
  dataSelecionadaISO,
  dataFimISO,
  onPeriodoChange,
  perfisPlanejados,
  planejadosSelecionados,
  setPlanejadosSelecionados,
  perfisAtendidos,
  atendidosSelecionados,
  setAtendidosSelecionados,
  transportadoras,
  transportadora,
  setTransportadora,
  clusters,
  clustersSelecionados,
  alternarCluster,
  setClustersSelecionados,
  busca,
  setBusca,
  nseFiltro,
  setNseFiltro,
  coleta = null,
}: Props) {
  const [clusterDropdownAberto, setClusterDropdownAberto] = useState(false);
  const clusterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (
        clusterDropdownRef.current &&
        !clusterDropdownRef.current.contains(event.target as Node)
      ) {
        setClusterDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickFora);
    return () => document.removeEventListener("mousedown", handleClickFora);
  }, []);

  const clusterBotaoLabel =
    clustersSelecionados.length === 0
      ? "Todos"
      : clustersSelecionados.length === 1
      ? clustersSelecionados[0]
      : clustersSelecionados.length + " selecionados";

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>

        <div className="w-56">
          <SeletorPeriodo
            inicio={dataSelecionadaISO}
            fim={dataFimISO}
            aoMudar={onPeriodoChange}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Transportadora</label>
        <select
          value={transportadora}
          onChange={(e) => setTransportadora(e.target.value)}
          className="border border-gray-200 rounded px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="Todas">Todas</option>
          {transportadoras.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="relative" ref={clusterDropdownRef}>
        <label className="block text-xs font-medium text-gray-500 mb-1">Cluster</label>
        <button
          type="button"
          onClick={() => setClusterDropdownAberto((v) => !v)}
          className="border border-gray-200 rounded px-3 py-2 text-sm min-w-[160px] bg-white text-left flex items-center justify-between gap-2"
        >
          <span>{clusterBotaoLabel}</span>
          <span className="text-gray-400 text-xs">▾</span>
        </button>
        {clusterDropdownAberto && (
          <div className="absolute z-10 mt-1 w-48 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Clusters</span>
              <button
                type="button"
                onClick={() => setClustersSelecionados([])}
                className="text-xs text-blue-600 hover:underline"
              >
                Limpar
              </button>
            </div>
            <div className="p-1">
              {clusters.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => alternarCluster(c)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-gray-50 rounded"
                >
                  <span className="w-4 text-gray-700">
                    {clustersSelecionados.includes(c) ? "✓" : ""}
                  </span>
                  <span>{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Perfil planejado</label>
        <MultiSelect
          opcoes={perfisPlanejados}
          selecionados={planejadosSelecionados}
          setSelecionados={setPlanejadosSelecionados}
          rotuloTodas="Todos"
          largura="w-40"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Perfil atendido</label>
        <MultiSelect
          opcoes={perfisAtendidos}
          selecionados={atendidosSelecionados}
          setSelecionados={setAtendidosSelecionados}
          rotuloTodas="Todos"
          largura="w-40"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Buscar</label>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Rota ou placa"
          className="border border-gray-200 rounded px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">NSE / NS</label>
        <select
          value={nseFiltro}
          onChange={(e) => setNseFiltro(e.target.value as "todas" | "sim" | "ns")}
          className="border border-gray-200 rounded px-3 py-2 text-sm"
        >
          <option value="todas">Todas</option>
          <option value="sim">Somente NSE</option>
          <option value="ns">Somente NS</option>
        </select>
      </div>

      {coleta && (
        <div>
          <label
            className="block text-xs font-medium text-gray-500 mb-1"
            title="Pela lista de rotas do sistema (ROTAS_SISTEMA, a cada 10 min): finalizada = fechada, voltando/no CD ou sem parada pendente"
          >
            Coleta
          </label>
          <MultiSelect
            opcoes={coleta.opcoes}
            selecionados={coleta.selecionados}
            setSelecionados={coleta.setSelecionados}
            rotuloTodas="Todas"
            rotulo={coleta.rotulo}
            largura="w-52"
          />
        </div>
      )}
    </div>
  );
}
