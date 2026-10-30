"use client";

import { useState } from "react";
import type { RespostaForm } from "../../lib/sheets";
import { extrairIdRota, linkRota } from "../../lib/dashboardUtils";

function CelulaIdRota({ valor }: { valor: string }) {
  const id = extrairIdRota(valor);
  if (!id) {
    return (
      <span className="text-gray-400 italic" title={valor || undefined}>
        ID não encontrado
      </span>
    );
  }
  return (
    <a
      href={linkRota(id)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      {id}
    </a>
  );
}

type Props = {
  respostas: RespostaForm[];
  repetidas?: RespostaForm[];
  dataSelecionadaISO: string;

  aberta?: boolean;
  setAberta?: (v: boolean | ((anterior: boolean) => boolean)) => void;
  titulo?: string;
};

export default function RespostasOrfas({
  respostas,
  repetidas = [],
  dataSelecionadaISO,
  aberta: abertaProp,
  setAberta: setAbertaProp,
  titulo = "Respostas sem rota correspondente",
}: Props) {
  const [abertaLocal, setAbertaLocal] = useState(false);
  const aberta = abertaProp ?? abertaLocal;
  const setAberta = setAbertaProp ?? setAbertaLocal;
  const [buscaPlaca, setBuscaPlaca] = useState("");

  const visiveis =
    buscaPlaca.trim() === ""
      ? respostas
      : respostas.filter((r) =>
          r.placa.toLowerCase().includes(buscaPlaca.trim().toLowerCase())
        );

  function exportarCSV() {
    const cabecalho = [
      "Rota",
      "Placa",
      "Transportadora",
      "ID da rota",
      "Rota no relatório",
    ];
    const dados = visiveis.map((r) => [
      r.rota,
      r.placa,
      r.transportadora,
      extrairIdRota(r.idRota) ?? r.idRota,
      r.rotaNoRelatorio ?? "",
    ]);
    const escapar = (valor: string) => `"${valor.replace(/"/g, '""')}"`;
    const csv = [cabecalho, ...dados]
      .map((linha) => linha.map(escapar).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `respostas-sem-match_${dataSelecionadaISO}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          className="flex-1 flex items-center justify-between text-sm font-medium text-gray-600 hover:text-gray-800"
        >
          <span>
              {titulo} ({respostas.length})
            </span>
          <span className="text-gray-400">{aberta ? "▲" : "▼"}</span>
        </button>
        {respostas.length > 0 && (
          <button
            type="button"
            onClick={exportarCSV}
            className="text-sm font-medium text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50 whitespace-nowrap"
          >
            Exportar CSV
          </button>
        )}
      </div>
      {aberta && respostas.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3">
          <input
            type="text"
            value={buscaPlaca}
            onChange={(e) => setBuscaPlaca(e.target.value)}
            placeholder="Buscar por placa"
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
          />
        </div>
      )}
      {aberta && respostas.length > 0 && visiveis.length > 0 && (
        <div className="border-t border-rose-200 overflow-x-auto">
          <div className="bg-rose-50 border-b border-rose-200 text-rose-800 text-sm font-medium px-4 py-3">
            Sobraram sem par. Quando o ID aponta uma rota, ela não está na
            atribuição do dia (rota de outro hub, XD ou fora da lista); sem ID,
            é erro de preenchimento mesmo.
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-rose-500 border-b border-rose-100">
                <th className="py-3 px-4 font-medium">Rota</th>
                <th className="py-3 px-4 font-medium">Placa</th>
                <th className="py-3 px-4 font-medium">Transportadora</th>
                <th className="py-3 px-4 font-medium">ID da rota</th>
                <th className="py-3 px-4 font-medium">Rota no relatório</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r, i) => (
                <tr key={i} className="border-b border-rose-50 last:border-0">
                  <td className="py-2 px-4 font-mono text-xs">{r.rota || "(rota em branco)"}</td>
                  <td className="py-2 px-4 font-mono text-xs">{r.placa || "(placa em branco)"}</td>
                  <td className="py-2 px-4">{r.transportadora}</td>
                  <td className="py-2 px-4 font-mono text-xs">
                    {r.rotaNoRelatorio ? (
                      <CelulaIdRota valor={r.idRota} />
                    ) : (
                      <span
                        className="text-gray-500"
                        title="Esse número não corresponde a nenhuma rota do relatório de coletas, em nenhuma data. Provavelmente foi digitado errado no Forms."
                      >
                        {extrairIdRota(r.idRota) ?? (
                          <span className="italic">não informado</span>
                        )}{" "}
                        <span className="text-rose-600 font-medium">
                          (ID incorreto)
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 font-mono text-xs">
                    {r.rotaNoRelatorio || (
                      <span className="text-gray-400 italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberta && respostas.length > 0 && visiveis.length === 0 && (
        <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-400">
          Nenhuma placa encontrada para essa busca.
        </div>
      )}
      {aberta && repetidas.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
          <span className="font-medium text-gray-600">
            +{repetidas.length}{" "}
            {repetidas.length === 1
              ? "resposta repetida"
              : "respostas repetidas"}
          </span>{" "}
          fora desta lista — são reenvios de rotas que já têm resposta mais
          recente (a última é a que vale):{" "}
          {[...new Set(repetidas.map((r) => r.duplicataDe).filter(Boolean))]
            .slice(0, 12)
            .join(", ")}
        </div>
      )}
      {aberta && respostas.length === 0 && (
        <div className="border-t border-gray-100 px-4 py-3 text-sm text-gray-400">
          Nenhuma resposta sem rota correspondente no filtro atual.
        </div>
      )}
    </div>
  );
}
