"use client";

import { useState } from "react";

import type { MapaApoio } from "../../lib/apoioCidades";

export default function ApoioCidades({ apoio }: { apoio: MapaApoio }) {
  const [copiado, setCopiado] = useState(false);
  const cidades = Object.keys(apoio).sort((a, b) => apoio[a].nome.localeCompare(apoio[b].nome, "pt-BR"));
  if (!cidades.length) return null;
  const automaticas = cidades.filter((c) => apoio[c].fonte === "automático");

  const copiar = async () => {
    const linhas = [
      ["CIDADE_DA_ROTA", "PODE_APOIAR"],
      ...automaticas.map((c) => [apoio[c].nome.replace(/\/[A-Z]{2}$/, ""), apoio[c].para.map((p) => p.replace(/\/[A-Z]{2}$/, "")).join(", ")]),
    ];
    await navigator.clipboard.writeText(linhas.map((l) => l.join("\t")).join("\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  return (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer text-slate-500">
        Apoio entre cidades: quem pode ajudar quem ({cidades.length} cidades,{" "}
        {cidades.length - automaticas.length} pela planilha)
      </summary>
      <div className="mt-2 max-w-3xl space-y-2">
        <p>
          A rota de uma cidade apoia a própria cidade e as cidades <strong>no caminho de volta para a base</strong>{" "}
          (Serra Negra → Amparo, nunca o inverso). Cidade que está na aba <strong>CIDADES_APOIO</strong> segue a
          planilha; as outras seguem uma sugestão automática pela posição das cidades, vizinhas e no sentido da base.
        </p>
        {automaticas.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copiar}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50"
            >
              {copiado ? "Copiado ✓" : "Copiar sugestão automática para a planilha"}
            </button>
            <span className="text-slate-400">
              Cole na A1 da aba CIDADES_APOIO, revise e apague o que não vale (cidade com PODE_APOIAR vazio = só
              a própria cidade).
            </span>
          </div>
        )}
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3">Cidade da rota</th>
              <th className="py-1 pr-3">Pode apoiar</th>
              <th className="py-1">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {cidades.map((c) => (
              <tr key={c} className="border-t border-slate-100">
                <td className="py-1 pr-3 font-medium">{apoio[c].nome}</td>
                <td className="py-1 pr-3">
                  {apoio[c].para.length ? apoio[c].para.join(", ") : <span className="text-slate-400">só a própria</span>}
                </td>
                <td className="py-1">{apoio[c].fonte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
