"use client";

import { useEffect, useState } from "react";

import type { LinhaHB } from "../../lib/hb";
import { linkDaAvulsa } from "../../lib/avulsas";

const chaveStorage = (dataBR: string) => "hb-placas-" + dataBR;

const chaveEtas = (dataBR: string) => "hb-etas-" + dataBR;

const chaveEstimados = (dataBR: string) => "hb-estimados-" + dataBR;
const chaveLinha = (l: LinhaHB) => l.rota + "|" + l.seller;

export default function BlocoHB({
  dataBR,
  linhas,
  resumo,
  totalSellers,
  atualizadoEta,
  atualizadoMonitoring = "",
  aviso = "",
  erro,
  compacto = false,
}: {
  dataBR: string;
  linhas: LinhaHB[];
  resumo: { rotas: number; sellers: number; estimados: number };
  totalSellers: number;
  atualizadoEta: string;
  atualizadoMonitoring?: string;
  aviso?: string;
  erro: string | null;
  compacto?: boolean;
}) {
  const [digitadas, setDigitadas] = useState<Record<string, string>>({});
  const [estimadosDigitados, setEstimadosDigitados] = useState<Record<string, string>>({});
  const [etasDigitadas, setEtasDigitadas] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const cru = window.localStorage.getItem(chaveStorage(dataBR));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (cru) setDigitadas(JSON.parse(cru) as Record<string, string>);
      const est = window.localStorage.getItem(chaveEstimados(dataBR));
      if (est) setEstimadosDigitados(JSON.parse(est) as Record<string, string>);
      const etas = window.localStorage.getItem(chaveEtas(dataBR));
      if (etas) setEtasDigitadas(JSON.parse(etas) as Record<string, string>);
    } catch {
      // storage bloqueado ou sujo: segue sem, nao e dado critico
    }
  }, [dataBR]);

  const anotarEstimado = (l: LinhaHB, valor: string) => {
    setEstimadosDigitados((atual) => {
      const novo = { ...atual, [chaveLinha(l)]: valor.replace(/\D/g, "").slice(0, 6) };
      try {
        window.localStorage.setItem(chaveEstimados(dataBR), JSON.stringify(novo));
      } catch {
        // idem
      }
      return novo;
    });
  };

  const anotarEta = (rota: string, valor: string) => {
    const limpo = valor.replace(/[^\d:]/g, "").slice(0, 5);
    const eta = /^\d{4}$/.test(limpo) ? limpo.slice(0, 2) + ":" + limpo.slice(2) : limpo;
    setEtasDigitadas((atual) => {
      const novo = { ...atual, [rota]: eta };
      try {
        window.localStorage.setItem(chaveEtas(dataBR), JSON.stringify(novo));
      } catch {
        // idem
      }
      return novo;
    });
  };

  const anotar = (rota: string, valor: string) => {
    setDigitadas((atual) => {
      const novo = { ...atual, [rota]: valor.toUpperCase() };
      try {
        window.localStorage.setItem(chaveStorage(dataBR), JSON.stringify(novo));
      } catch {
        // idem
      }
      return novo;
    });
  };

  if (erro) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {erro}
      </div>
    );
  }

  const faixaAviso =
    aviso && !compacto ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        {aviso}
      </div>
    ) : null;

  if (linhas.length === 0) {
    return (
      <div className="space-y-3">
        {faixaAviso}
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Nenhuma rota do dia passa em ponto da lista H&amp;B.
          <br />
          <span className="text-[11px]">
            A lista tem {totalSellers} seller(s). Se o dia ja comecou e isso
            parece errado, confira se o relatorio de coleta foi atualizado.
          </span>
        </div>
      </div>
    );
  }

  const num = (n: number) => n.toLocaleString("pt-BR");
  const placaDe = (l: LinhaHB) => digitadas[l.rota] ?? l.placa;
  const etaDe = (l: LinhaHB) => etasDigitadas[l.rota] ?? l.eta;

  const estimadoDe = (l: LinhaHB) => {
    if (l.repetida) return 0;
    if (l.naColeta || l.doMonitoramento) return l.estimados;
    const d = estimadosDigitados[chaveLinha(l)];
    return d ? Number(d) : 0;
  };
  const totalEstimados = linhas.reduce((s, l) => s + estimadoDe(l), 0);

  return (
    <div className="space-y-3">
      {faixaAviso}
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
        <span className="rounded border border-slate-300 bg-white px-2 py-1">
          <strong className="text-slate-900">{resumo.rotas}</strong> rota(s)
        </span>
        <span className="rounded border border-slate-300 bg-white px-2 py-1">
          <strong className="text-slate-900">{resumo.sellers}</strong> seller(s)
        </span>
        <span className="rounded border border-slate-300 bg-white px-2 py-1">
          <strong className="text-slate-900">{num(totalEstimados)}</strong>{" "}
          pacote(s) estimado(s)
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="w-[26%] px-3 py-2 font-semibold">Rota</th>
              <th className="w-[12%] px-3 py-2 font-semibold">E.T.A</th>
              <th className="w-[30%] px-3 py-2 font-semibold">Seller</th>
              <th className="w-[16%] px-3 py-2 text-right font-semibold">
                Estimados
              </th>
              <th className="w-[16%] px-3 py-2 font-semibold">Placa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.rota + "|" + l.seller}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-1.5 font-medium text-slate-900">

                  {l.avulsa && !compacto ? (
                    <a
                      href={linkDaAvulsa(l.rota)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                      title="Abre a rota no monitoramento"
                    >
                      {l.rota}
                    </a>
                  ) : (
                    l.rota
                  )}
                  {l.avulsa && (
                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                      avulsa
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-slate-700">
                  {compacto || !l.avulsa ? (
                    etaDe(l) || <span className="text-slate-300">&mdash;</span>
                  ) : (
                    <input
                      value={etaDe(l)}
                      onChange={(e) => anotarEta(l.rota, e.target.value)}
                      placeholder="hh:mm"
                      inputMode="numeric"
                      spellCheck={false}
                      title="Avulsa não está na config: digite o horário de chegada (fica salvo neste navegador, para o dia)."
                      className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs tabular-nums text-slate-900 placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
                    />
                  )}
                </td>
                <td className="truncate px-3 py-1.5 text-slate-700">
                  {l.seller}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-900">
                  {compacto || l.repetida || l.naColeta || l.doMonitoramento ? (
                    <span
                      title={
                        l.repetida
                          ? "O mesmo seller ja esta numa rota acima: a carga conta so na primeira"
                          : l.doMonitoramento
                            ? "Rota ainda fora do relatorio de coleta: estimado da parada no Monitoramento por Sellers"
                            : undefined
                      }
                    >
                      {num(estimadoDe(l))}
                      {l.doMonitoramento && !l.repetida && !compacto && (
                        <span className="ml-1 text-[9px] font-semibold uppercase text-slate-400">
                          monit.
                        </span>
                      )}
                    </span>
                  ) : (
                    <input
                      value={estimadosDigitados[chaveLinha(l)] ?? ""}
                      onChange={(e) => anotarEstimado(l, e.target.value)}
                      inputMode="numeric"
                      title="Parada ainda sem registro no relatorio de coleta: preencha com o estimado do monitoramento."
                      className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-slate-900 focus:border-slate-400 focus:outline-none"
                    />
                  )}
                </td>
                <td className="px-3 py-1.5 text-slate-700">
                  {compacto || !l.avulsa ? (
                    placaDe(l) || <span className="text-slate-300">&mdash;</span>
                  ) : (
                    <input
                      value={placaDe(l)}
                      onChange={(e) => anotar(l.rota, e.target.value)}
                      placeholder="placa"
                      spellCheck={false}
                      className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs uppercase text-slate-900 placeholder:normal-case placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!compacto && (
        <p className="text-[11px] text-slate-500">
          As rotas do dia e o E.T.A saem da aba Extracao Config; quais delas
          passam em ponto H&amp;B sai da propria extracao (se tiver ID_SELLER)
          ou do mapa da aba Formulas. O estimado vem do relatorio de coleta;
          rota que ainda nao esta nele usa o estimado da parada no
          Monitoramento por Sellers (marcado &ldquo;monit.&rdquo;
          {atualizadoMonitoring ? ", atualizado em " + atualizadoMonitoring : ""}),
          e so fica com a caixa para preencher a parada que nenhum dos dois
          tem.
          Rota avulsa entra pela coleta, com placa e E.T.A digitados. A placa vem da aba ATRIBUICAO. O que
          for digitado fica salvo neste navegador, para o dia
          {atualizadoEta ? "; E.T.A de reserva atualizado em " + atualizadoEta : ""}. Entram so
          as paradas que estao na lista de {totalSellers} seller(s) do H&amp;B.
        </p>
      )}
    </div>
  );
}
