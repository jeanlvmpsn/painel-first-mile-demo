"use client";

import { ROTULO_ETAPA, type EtapaColeta } from "../../lib/etapaColeta";
import { useMemo, useState } from "react";
import type { RotaStatus } from "../../lib/sheets";
import { extrairIdRota, linkRota } from "../../lib/dashboardUtils";
import { perfilAtendido, perfilPlanejado } from "../../lib/atribuicaoUtils";

function normalizarRota(v: string) {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const POR_PAGINA = 10;

const BOTAO_PAGINA =
  "rounded border border-gray-200 px-3 py-1.5 font-medium text-gray-700 " +
  "hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:hover:bg-transparent";

type Props = {
  rotas: RotaStatus[];
  dataSelecionadaISO: string;

  etapaDe?: (r: RotaStatus) => EtapaColeta | null;
};

type Campo =
  | "data"
  | "rota"
  | "placa"
  | "planejado"
  | "atendido"
  | "transportadora"
  | "status";

const dataOrdenavel = (br?: string) => (br ?? "").split("/").reverse().join("-");

function valorDe(r: RotaStatus, campo: Campo): string {
  if (campo === "data") return dataOrdenavel(r.data);
  if (campo === "planejado") return perfilPlanejado(r);
  if (campo === "atendido") return perfilAtendido(r);
  return String(r[campo] ?? "");
}

export default function TabelaRotas({ rotas, dataSelecionadaISO, etapaDe }: Props) {
  const [linhaExpandida, setLinhaExpandida] = useState<string | null>(null);
  const [ordenacao, setOrdenacao] = useState<{ campo: Campo; direcao: "asc" | "desc" } | null>(
    null
  );

  const comData = useMemo(() => rotas.some((r) => r.data), [rotas]);
  const colunas = comData ? 7 : 6;

  const rotasOrdenadas = useMemo(() => {
    if (!ordenacao) return rotas;
    const { campo, direcao } = ordenacao;
    const copia = [...rotas];
    copia.sort((a, b) => {
      const comparacao = valorDe(a, campo).localeCompare(valorDe(b, campo), "pt-BR", {
        numeric: true,
      });
      return direcao === "asc" ? comparacao : -comparacao;
    });
    return copia;
  }, [rotas, ordenacao]);

  const [pagina, setPagina] = useState(1);

  const [origem, setOrigem] = useState({ rotas, ordenacao });
  if (origem.rotas !== rotas || origem.ordenacao !== ordenacao) {
    setOrigem({ rotas, ordenacao });
    setPagina(1);
  }

  const totalPaginas = Math.max(
    1,
    Math.ceil(rotasOrdenadas.length / POR_PAGINA),
  );

  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const fim = Math.min(inicio + POR_PAGINA, rotasOrdenadas.length);
  const daPagina = rotasOrdenadas.slice(inicio, fim);

  function alternarOrdenacao(campo: Campo) {
    setOrdenacao((atual) => {
      if (!atual || atual.campo !== campo) return { campo, direcao: "asc" };
      if (atual.direcao === "asc") return { campo, direcao: "desc" };
      return null;
    });
  }

  function indicadorOrdenacao(campo: Campo) {
    if (!ordenacao || ordenacao.campo !== campo) return "";
    return ordenacao.direcao === "asc" ? " ▲" : " ▼";
  }

  function exportarCSV() {
    const cabecalho = [
      ...(comData ? ["Data"] : []),
      "Rota",
      "Placa",
      "Perfil planejado",
      "Perfil atendido",
      "Transportadora",
      "Status",
    ];
    const linhas = rotasOrdenadas.map((r) => [
      ...(comData ? [r.data ?? ""] : []),
      r.rota,
      r.placa,
      perfilPlanejado(r),
      perfilAtendido(r),
      r.transportadora,
      r.status === "avulsa"
        ? "Avulsa"
        : r.status === "concluida"
          ? "Concluída"
          : "Pendente",
    ]);
    const escapar = (valor: string) => `"${valor.replace(/"/g, '""')}"`;
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map(escapar).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rotas_${dataSelecionadaISO}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-4">
        <h3 className="text-sm font-medium text-gray-500">
          Rotas filtradas ({rotas.length})
          {totalPaginas > 1 && (
            <span className="ml-2 font-normal text-gray-400">
              mostrando {inicio + 1}&ndash;{fim}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={exportarCSV}
          className="text-sm font-medium text-blue-600 border border-blue-200 rounded px-3 py-1.5 hover:bg-blue-50"
        >
          Exportar CSV
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-100">
            {comData && (
              <th
                className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
                onClick={() => alternarOrdenacao("data")}
              >
                Data{indicadorOrdenacao("data")}
              </th>
            )}
            <th
              className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
              onClick={() => alternarOrdenacao("rota")}
            >
              Rota{indicadorOrdenacao("rota")}
            </th>
            <th
              className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
              onClick={() => alternarOrdenacao("placa")}
            >
              Placa{indicadorOrdenacao("placa")}
            </th>
            <th
              className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
              onClick={() => alternarOrdenacao("planejado")}
            >
              Planejado{indicadorOrdenacao("planejado")}
            </th>
            <th
              className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
              onClick={() => alternarOrdenacao("atendido")}
            >
              Atendido{indicadorOrdenacao("atendido")}
            </th>
            <th
              className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
              onClick={() => alternarOrdenacao("transportadora")}
            >
              Transportadora{indicadorOrdenacao("transportadora")}
            </th>
            <th
              className="py-3 px-4 font-medium cursor-pointer select-none hover:text-gray-700"
              onClick={() => alternarOrdenacao("status")}
            >
              Status{indicadorOrdenacao("status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rotas.length === 0 && (
            <tr>
              <td colSpan={colunas} className="py-6 px-4 text-center text-gray-400">
                Nenhuma rota para esse filtro.
              </td>
            </tr>
          )}
          {daPagina.map((r, i) => {
            const chave = `${r.rota}-${r.placa}-${inicio + i}`;
            const idRota = extrairIdRota(r.idRota ?? r.resposta?.idRota);
            return [
              <tr
                key={chave}
                onClick={() => setLinhaExpandida(linhaExpandida === chave ? null : chave)}
                className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50"
              >
                {comData && <td className="py-3 px-4 whitespace-nowrap">{r.data}</td>}
                <td className="py-3 px-4">{r.rota}</td>
                <td className="py-3 px-4 font-mono">{r.placa}</td>
                <td className="py-3 px-4 text-gray-600">{perfilPlanejado(r)}</td>
                <td className="py-3 px-4 text-gray-600">{perfilAtendido(r)}</td>
                <td className="py-3 px-4">{r.transportadora}</td>
                <td className="py-3 px-4">
                  <span
                    title={
                      r.ns
                        ? `Não saiu — ${
                            r.ns.origem === "motivo"
                              ? `motivo declarado: ${r.ns.motivo}`
                              : "não registrou nenhuma parada no relatório de coletas"
                          } (paradas: ${r.ns.paradas}, estimados: ${r.ns.estimados})`
                        : undefined
                    }
                    className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                      r.status === "avulsa"
                      ? "bg-red-100 text-red-700"
                      : r.status === "concluida"
                        ? "bg-green-100 text-green-700"
                        : r.ns
                          ? "bg-gray-200 text-gray-600"
                          : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {r.status === "avulsa"
                      ? "Avulsa"
                      : r.status === "concluida"
                        ? "Concluída"
                      : r.ns
                        ? "NS"
                        : "Pendente"}
                  </span>
                  {r.status === "pendente" && !r.ns && etapaDe?.(r) && (
                    <span
                      className={
                        "ml-2 inline-block px-2 py-1 rounded-full text-xs font-medium " +
                        (etapaDe(r) === "finalizada"
                          ? "bg-blue-100 text-blue-700"
                          : etapaDe(r) === "coletando"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-gray-50 text-gray-500")
                      }
                      title="Etapa da coleta pela lista de rotas do sistema (a cada 10 min)"
                    >
                      {ROTULO_ETAPA[etapaDe(r)!]}
                    </span>
                  )}
                  {!r.ns && r.coletouZero && r.status !== "concluida" && (
                    <span
                      className="ml-2 inline-block px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"
                      title="A rota aparece no relatório de coletas, mas está com zero pacotes coletados e sem motivo impeditivo — ainda deve preencher o Forms."
                    >
                      Coletou 0
                    </span>
                  )}
                  {r.resposta?.estourou.trim().toLowerCase().startsWith("sim") && (
                    <span className="ml-2 inline-block px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      NSE - {r.resposta.estourou.toLowerCase().includes("peso") ? "peso" : "capacidade"}
                    </span>
                  )}
                  {r.matchPorId &&
                    r.resposta &&
                    normalizarRota(r.resposta?.rota) !== normalizarRota(r.rota) && (
                      <span
                        className="ml-2 inline-block px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                        title={`Pareado pelo ID da rota. No Forms foi digitado "${r.resposta?.rota}", mas esse ID aponta para esta rota no relatório de coletas.`}
                      >
                        Match por ID
                      </span>
                    )}
                  {r.matchAproximado && (
                    <span
                      className="ml-2 inline-block px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700"
                      title={
                        r.resposta
                          ? `Resposta recebida como "${r.resposta?.rota}" - não bateu exato com a rota esperada`
                          : "Não bateu exato com a rota esperada"
                      }
                    >
                      Match aproximado
                    </span>
                  )}
                </td>
              </tr>,
              linhaExpandida === chave && (
                <tr key={`${chave}-detalhe`} className="border-b border-gray-50 last:border-0 bg-gray-50">
                  <td colSpan={colunas} className="py-2 px-4 text-sm">
                    {r.ns && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">Não saiu (NS)</div>
                        <div className="text-gray-700">
                          {r.ns.origem === "motivo"
                            ? `Motivo declarado no relatório: ${r.ns.motivo}.`
                            : "A rota não registrou nenhuma parada no relatório de coletas até o corte das 21h."}{" "}
                          Paradas: {r.ns.paradas} · Pacotes estimados: {r.ns.estimados}. Rota NS não
                          precisa preencher o Forms.
                        </div>
                      </div>
                    )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                        {r.matchAproximado && (
                          <div className="col-span-2 sm:col-span-4">
                            <div className="text-xs text-purple-500 mb-1">Correspondência aproximada</div>
                            <div className="text-gray-700">
                              Rota esperada (ATRIBUIÇÃO): “{r.rota}” — resposta recebida no Forms como “{r.resposta?.rota}”.
                              Vale conferir se é mesmo a mesma rota.
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-gray-400 mb-1">ID da rota</div>
                          {idRota ? (
                            <a
                              href={linkRota(idRota)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-mono"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {idRota}
                            </a>
                          ) : (
                            <div className="text-gray-400 italic">
                              ID não encontrado
                            </div>
                          )}
                        </div>
                        {r.resposta ? (
                          <>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Foto do baú</div>
                          {r.resposta.fotoBau ? (
                            <a
                              href={r.resposta.fotoBau}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Ver foto
                            </a>
                          ) : (
                            <div className="text-gray-700">-</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Perfil do veículo</div>
                          <div className="text-gray-700">{r.resposta.perfilVeiculo || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400 mb-1">Estourou?</div>
                          <div className="text-gray-700">{r.resposta.estourou || "-"}</div>
                        </div>
                          </>
                        ) : (
                      <div className="text-gray-400 col-span-2 sm:col-span-4">
                        {r.ns
                          ? "Sem resposta do formulário — esperado, a rota não saiu (NS)."
                          : "Ainda sem resposta do formulário para esta rota."}
                      </div>
                        )}
                      </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>

      {totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-sm">
          <span className="text-gray-500">
            Página <strong className="text-gray-800">{paginaAtual}</strong> de{" "}
            {totalPaginas}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina(1)}
              disabled={paginaAtual === 1}
              className={BOTAO_PAGINA}
            >
              Primeira
            </button>
            <button
              type="button"
              onClick={() => setPagina(paginaAtual - 1)}
              disabled={paginaAtual === 1}
              className={BOTAO_PAGINA}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPagina(paginaAtual + 1)}
              disabled={paginaAtual === totalPaginas}
              className={BOTAO_PAGINA}
            >
              Próxima
            </button>
            <button
              type="button"
              onClick={() => setPagina(totalPaginas)}
              disabled={paginaAtual === totalPaginas}
              className={BOTAO_PAGINA}
            >
              Última
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
