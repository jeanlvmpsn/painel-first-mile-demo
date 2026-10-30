"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  FORA_DO_DIA,
  ROTULO_POS_11H,
  ROTULO_SITUACAO,
  SITUACOES,
  contarHubs,
  contarPor,
  dataParaISO,
  ehSabado,
  type PedidoScheduling,
  type Situacao,
} from "../../lib/schedulingTipos";
import { ehMelione } from "../../lib/melione";
import { listarComE } from "../../lib/relatorioTipos";
import {
  Campo,
  ColunaOrdenavel,
  MultiSelect,
  Select,
  SeletorPeriodo,
  TODAS,
  Tile,
} from "../ui/filtros";

const CLASSE_BORDA: Record<Situacao, string> = {
  aceite: "border-l-[#1da578]",
  semResposta: "border-l-[#ca7916]",
  recusa: "border-l-[#cf1f14]",
  cancelado: "border-l-[#495f6e]",
};

const CLASSE_TEXTO: Record<Situacao, string> = {
  aceite: "text-[#1da578]",
  semResposta: "text-[#ca7916]",
  recusa: "text-[#cf1f14]",
  cancelado: "text-[#495f6e]",
};

const CLASSE_FUNDO: Record<Situacao, string> = {
  aceite: "bg-[#1da578]",
  semResposta: "bg-[#ca7916]",
  recusa: "bg-[#cf1f14]",
  cancelado: "bg-[#495f6e]",
};

const BORDA_POS_11H = "border-l-[#8a1c3c]";
const TEXTO_POS_11H = "text-[#8a1c3c]";

type Filtro = Situacao | "todas" | "pos11h";

const hora = (momento: string) => (momento.match(/\d{2}:\d{2}/) ?? [""])[0];
const vespera = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  const v = new Date(Date.UTC(a, m - 1, d) - 86400000);
  return (
    String(v.getUTCDate()).padStart(2, "0") + "/" + String(v.getUTCMonth() + 1).padStart(2, "0")
  );
};

const ATIVAS: Situacao[] = ["aceite", "recusa", "semResposta"];

function escaparCsv(valor: string): string {
  const texto = String(valor ?? "");
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function baixarCsv(nome: string, linhas: string[]) {
  const blob = new Blob(["﻿" + linhas.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

type Ordem = { campo: string; desc: boolean };
type Aberto = Filtro;

type Props = {
  pedidos: PedidoScheduling[];
  dataISO: string;
  datasDisponiveis: string[];

  basesPos11h?: Record<string, string>;
};

export default function PainelScheduling({
  pedidos,
  dataISO,
  datasDisponiveis,
  basesPos11h = {},
}: Props) {
  const [dia, setDia] = useState(dataISO);
  const [diaFim, setDiaFim] = useState(dataISO);
  const [transportadoras, setTransportadoras] = useState<string[]>([]);
  const [clusters, setClusters] = useState<string[]>([]);
  const [hub, setHub] = useState<string>(TODAS);

  const [tipo, setTipo] = useState<string>(TODAS);
  const [situacao, setSituacao] = useState<Filtro>("todas");
  const [ordem, setOrdem] = useState<Ordem>({ campo: "total", desc: true });
  const [abertos, setAbertos] = useState<Record<string, Aberto>>({});

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get("data");
    if (d) setDia(d);
    const df = p.get("dataFim");
    if (df) setDiaFim(df);
    const lista = (bruto: string | null) =>
      bruto ? bruto.split(",").map((x) => x.trim()).filter(Boolean) : [];
    const t = lista(p.get("tp"));
    if (t.length) setTransportadoras(t);
    const c = lista(p.get("cluster"));
    if (c.length) setClusters(c);
    const h = p.get("hub");
    if (h) setHub(h);
    const s = p.get("situacao") as Filtro | null;
    if (s && (s === "pos11h" || (SITUACOES as readonly string[]).includes(s))) setSituacao(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doDia = useMemo(
    () =>
      pedidos.filter((p) => {
        const d = dataParaISO(p.data);
        return d >= dia && d <= diaFim;
      }),
    [pedidos, dia, diaFim],
  );

  const opcoes = useMemo(() => {
    const tps = new Set<string>();
    const cls = new Set<string>();
    const hubs = new Set<string>();
    for (const p of doDia) {
      tps.add(p.transportadora);
      if (p.cluster) cls.add(p.cluster);

      if (!p.foraDoDia) hubs.add(p.hub);
    }
    const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      transportadoras: ordenar(tps),
      clusters: ordenar(cls),
      hubs: ordenar(hubs).sort((a, b) => (a === "CPS" ? -1 : b === "CPS" ? 1 : 0)),
    };
  }, [doDia]);

  useEffect(() => {
    setTransportadoras((atual) => {
      const validos = atual.filter((t) => opcoes.transportadoras.includes(t));
      return validos.length === atual.length ? atual : validos;
    });
    setClusters((atual) => {
      const validos = atual.filter((c) => opcoes.clusters.includes(c));
      return validos.length === atual.length ? atual : validos;
    });
    setHub((atual) => (atual !== TODAS && !opcoes.hubs.includes(atual) ? TODAS : atual));
  }, [opcoes]);

  const passaDimensoes = useCallback(
    (p: PedidoScheduling) => {
      if (transportadoras.length && !transportadoras.includes(p.transportadora)) return false;
      if (clusters.length && !clusters.includes(p.cluster)) return false;
      if (hub !== TODAS && (p.foraDoDia || p.hub !== hub)) return false;
      if (tipo !== TODAS && ehMelione(p.perfil) !== (tipo === "MeliOne"))
        return false;
      return true;
    },
    [transportadoras, clusters, hub, tipo],
  );

  const bateFiltro = useCallback(
    (p: PedidoScheduling, alvo: Filtro) =>
      alvo === "todas" || (alvo === "pos11h" ? Boolean(p.recusaPos11h) : p.situacao === alvo),
    [],
  );

  const filtrados = useMemo(
    () => doDia.filter((p) => passaDimensoes(p) && bateFiltro(p, situacao)),
    [doDia, passaDimensoes, bateFiltro, situacao],
  );

  const semSituacao = useMemo(() => doDia.filter(passaDimensoes), [doDia, passaDimensoes]);

  const totais = useMemo(() => {
    const conta: Record<Situacao, number> = {
      aceite: 0,
      recusa: 0,
      semResposta: 0,
      cancelado: 0,
    };
    for (const p of semSituacao) if (p.situacao) conta[p.situacao]++;
    return conta;
  }, [semSituacao]);

  const totalPos11h = useMemo(
    () => semSituacao.filter((p) => p.recusaPos11h).length,
    [semSituacao],
  );

  const totalAtivo = totais.aceite + totais.recusa + totais.semResposta;

  const linhas = useMemo(() => {
    const soPos11h = situacao === "pos11h";
    const visiveis: Situacao[] =
      situacao === "todas" || soPos11h ? ATIVAS : [situacao];
    const base = contarPor(filtrados, (p) => p.transportadora).map((l) => ({
      ...l,
      total: soPos11h ? l.pos11h : visiveis.reduce((soma, k) => soma + l[k], 0),

      porHub: contarHubs(
        filtrados.filter(
          (p) =>
            p.transportadora === l.chave &&
            (soPos11h
              ? Boolean(p.recusaPos11h)
              : p.situacao !== null && visiveis.includes(p.situacao)),
        ),
      ),
    }));
    const dir = ordem.desc ? -1 : 1;
    return [...base].sort((a, b) => {
      if (ordem.campo === "chave") {
        return dir * a.chave.localeCompare(b.chave, "pt-BR");
      }
      const va = a[ordem.campo as keyof typeof a] as number;
      const vb = b[ordem.campo as keyof typeof b] as number;
      return dir * (va - vb) || a.chave.localeCompare(b.chave, "pt-BR");
    });
  }, [filtrados, ordem, situacao]);

  const consulta = useMemo(() => {
    const p = new URLSearchParams();
    if (dia) p.set("data", dia);
    if (transportadoras.length) p.set("tp", transportadoras.join(","));
    if (clusters.length) p.set("cluster", clusters.join(","));
    if (hub !== TODAS) p.set("hub", hub);
    if (situacao !== "todas") p.set("situacao", situacao);
    return p.toString();
  }, [dia, transportadoras, clusters, hub, situacao]);

  useEffect(() => {
    const alvo = window.location.pathname + (consulta ? "?" + consulta : "");
    if (alvo !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", alvo);
    }
  }, [consulta]);

  const alternar = useCallback(
    (tp: string, alvo: Aberto) =>
      setAbertos((atual) => {
        if (atual[tp] === alvo) {
          const copia = { ...atual };
          delete copia[tp];
          return copia;
        }
        return { ...atual, [tp]: alvo };
      }),
    [],
  );

  const filtrarPorNome = useCallback(
    (tp: string) =>
      setTransportadoras((atual) =>
        atual.length === 1 && atual[0] === tp ? [] : [tp],
      ),
    [],
  );

  const detalhe = (tp: string, alvo: Aberto) =>
    filtrados
      .filter((p) => p.transportadora === tp && bateFiltro(p, alvo))
      .sort(
        (a, b) =>
          a.zona.localeCompare(b.zona, "pt-BR") ||
          String(a.situacao).localeCompare(String(b.situacao)),
      );

  const exportar = () => {
    const linhasCsv = [
      "DATA;TRANSPORTADORA;SITUACAO;MOTIVO;PERFIL;CLUSTER;HUB;ETA;TRAVEL_ID;RECUSA_POS_11H",
      ...filtrados.map((p) =>
        [
          p.data,
          p.transportadora,
          p.situacao ? ROTULO_SITUACAO[p.situacao] : p.statusBruto,
          p.motivo,
          p.perfil,
          p.cluster,
          p.foraDoDia ? FORA_DO_DIA : p.hub,
          p.eta,
          p.travelId,
          p.recusaPos11h,
        ]
          .map(escaparCsv)
          .join(";"),
      ),
    ];
    baixarCsv(`scheduling-${dia}.csv`, linhasCsv);
  };

  const detalhePos11h =
    dia !== diaFim
      ? "depois das 11h da véspera"
      : basesPos11h[dia]
        ? "base " + vespera(dia) + " " + hora(basesPos11h[dia])
        : "prazo: " + vespera(dia) + " às 11h";

  const sabado = ehSabado(dia);
  const mostrarHub = sabado || opcoes.hubs.length > 1;
  const temFiltro =
    transportadoras.length > 0 || clusters.length > 0 || hub !== TODAS || tipo !== TODAS || situacao !== "todas";
  const foraDoDia = useMemo(() => doDia.filter((p) => p.foraDoDia).length, [doDia]);

  const primeiraData = datasDisponiveis[0];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <Campo titulo="Dia">
            <SeletorPeriodo
              inicio={dia}
              fim={diaFim}
              aoMudar={(i, f) => {
                setDia(i);
                setDiaFim(f);
              }}
            />
          </Campo>

          <Campo titulo="Transportadora">
            <MultiSelect
              opcoes={opcoes.transportadoras}
              selecionados={transportadoras}
              setSelecionados={setTransportadoras}
              rotuloTodas="Todas"
              largura="w-52"
            />
          </Campo>

          <Campo titulo="Cluster">
            <MultiSelect
              opcoes={opcoes.clusters}
              selecionados={clusters}
              setSelecionados={setClusters}
              rotuloTodas="Todos"
            />
          </Campo>

          {mostrarHub && (
            <Campo titulo="HUB">
              <Select valor={hub} setValor={setHub} opcoes={opcoes.hubs} rotuloTodas="Todos" />
            </Campo>
          )}

          <Campo titulo="Tipo">
            <Select
              valor={tipo}
              setValor={setTipo}
              opcoes={["FM", "MeliOne"]}
              rotuloTodas="Todos"
            />
          </Campo>

          <button
            onClick={exportar}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Baixar CSV
          </button>

          {temFiltro && (
            <button
              onClick={() => {
                setTransportadoras([]);
                setClusters([]);
                setHub(TODAS);
              setTipo(TODAS);
                setSituacao("todas");
              }}
              className="pb-1.5 text-sm text-slate-500 underline hover:text-slate-800"
            >
              limpar filtros
            </button>
          )}
        </div>

        {!datasDisponiveis.includes(dia) && (
          <p className="mt-3 text-sm text-amber-700">
            Não há dado gravado para {dia.split("-").reverse().join("/")}.{" "}
            {primeiraData
              ? "O histórico vai de " +
                primeiraData.split("-").reverse().join("/") +
                " até " +
                datasDisponiveis[datasDisponiveis.length - 1]
                  .split("-")
                  .reverse()
                  .join("/") +
                "."
              : "A aba SCHEDULING ainda não foi gravada nenhuma vez."}
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Tile
          titulo="Total"
          valor={totalAtivo}
          cor="border-l-[#2563eb]"
          corTexto="text-[#2563eb]"
          ativo={situacao === "todas"}
          onClick={() => setSituacao("todas")}
          detalhe="sem os cancelados"
        />
        {SITUACOES.map((s) => (
          <Fragment key={s}>
            <Tile
              titulo={ROTULO_SITUACAO[s]}
              valor={totais[s]}
              cor={CLASSE_BORDA[s]}
              corTexto={CLASSE_TEXTO[s]}
              ativo={situacao === s}
              onClick={() => setSituacao(situacao === s ? "todas" : s)}
            />
            {s === "recusa" && (
              <Tile
                titulo={ROTULO_POS_11H}
                valor={totalPos11h}
                cor={BORDA_POS_11H}
                corTexto={TEXTO_POS_11H}
                ativo={situacao === "pos11h"}
                onClick={() => setSituacao(situacao === "pos11h" ? "todas" : "pos11h")}
                detalhe={detalhePos11h}
              />
            )}
          </Fragment>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          Nenhum pedido com esses filtros. Se a data é futura, pode ser que o
          planejamento ainda não tenha lançado os pedidos.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <ColunaOrdenavel
                  titulo="Transportadora"
                  campo="chave"
                  ordem={ordem}
                  setOrdem={setOrdem}
                />
                <ColunaOrdenavel
                  titulo="Total"
                  campo="total"
                  ordem={ordem}
                  setOrdem={setOrdem}
                  alinhar="right"
                />
                {SITUACOES.map((s) => (
                  <ColunaOrdenavel
                    key={s}
                    titulo={ROTULO_SITUACAO[s]}
                    campo={s}
                    ordem={ordem}
                    setOrdem={setOrdem}
                    alinhar="right"
                  />
                ))}
                <ColunaOrdenavel
                  titulo={ROTULO_POS_11H}
                  campo="pos11h"
                  ordem={ordem}
                  setOrdem={setOrdem}
                  alinhar="right"
                />
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => {
                const aberta = abertos[linha.chave];
                const itens = aberta ? detalhe(linha.chave, aberta) : [];
                const filtradaAqui =
                  transportadoras.length === 1 && transportadoras[0] === linha.chave;
                return (
                  <Fragment key={linha.chave}>

                    <tr
                      onClick={() => alternar(linha.chave, "todas")}
                      className={
                        "cursor-pointer border-b border-slate-100 hover:bg-slate-50 " +
                        (aberta ? "bg-slate-50" : "")
                      }
                    >
                      <td className="py-2 pl-3 pr-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            filtrarPorNome(linha.chave);
                          }}
                          title={
                            filtradaAqui
                              ? "Tirar o filtro de " + linha.chave
                              : "Filtrar só " + linha.chave
                          }
                          className={
                            "text-left font-medium underline-offset-2 hover:underline " +
                            (filtradaAqui ? "text-[#2563eb]" : "text-slate-800")
                          }
                        >
                          {linha.chave}
                        </button>
                        {mostrarHub && linha.porHub.length > 0 && (
                          <p className="mt-0.5 text-xs font-normal text-slate-500">
                            {listarComE(
                              linha.porHub.map((h) => h.hub + " - " + h.qtd),
                            )}
                          </p>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-slate-800">
                        {linha.total}
                      </td>
                      {SITUACOES.map((s) => (
                        <td key={s} className="py-2 pr-3 text-right">
                          {linha[s] > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                alternar(linha.chave, s);
                              }}
                              title={"Ver só " + ROTULO_SITUACAO[s].toLowerCase()}
                              className={`font-semibold underline-offset-2 hover:underline ${CLASSE_TEXTO[s]}`}
                            >
                              {linha[s]}
                            </button>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-right">
                        {linha.pos11h > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              alternar(linha.chave, "pos11h");
                            }}
                            title="Ver só as recusas pós 11h"
                            className={`font-semibold underline-offset-2 hover:underline ${TEXTO_POS_11H}`}
                          >
                            {linha.pos11h}
                          </button>
                        ) : (
                          <span className="text-slate-300">0</span>
                        )}
                      </td>
                    </tr>

                    {aberta && (
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <td colSpan={3 + SITUACOES.length} className="px-3 py-3">
                          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                            {linha.chave} ·{" "}
                            {aberta === "todas"
                              ? "todos os pedidos"
                              : aberta === "pos11h"
                                ? ROTULO_POS_11H
                                : ROTULO_SITUACAO[aberta]}{" "}
                            (
                            {itens.length})
                          </div>
                          <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                            {itens.map((p, i) => (
                              <li
                                key={p.travelId + p.zona + i}
                                className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                              >

                                <span
                                  className={
                                    "inline-block h-2 w-2 shrink-0 rounded-full " +
                                    (p.situacao ? CLASSE_FUNDO[p.situacao] : "bg-slate-300")
                                  }
                                  title={p.situacao ? ROTULO_SITUACAO[p.situacao] : p.statusBruto}
                                  aria-label={
                                    p.situacao ? ROTULO_SITUACAO[p.situacao] : p.statusBruto
                                  }
                                />
                                <span className="font-medium text-slate-800">
                                  {p.zona || "—"}
                                </span>
                                <span className="text-slate-500">{p.perfil}</span>
                                {p.eta && <span className="text-slate-400">{p.eta}</span>}
                                {p.recusaPos11h && (
                                  <span
                                    className={"text-[10px] font-semibold uppercase " + TEXTO_POS_11H}
                                    title={"Recusa apareceu na atualização de " + p.recusaPos11h}
                                  >
                                    pós 11h {hora(p.recusaPos11h)}
                                  </span>
                                )}

                                {p.motivo &&
                                  (p.situacao === "cancelado" || p.situacao === "recusa") && (
                                    <span className="ml-auto text-slate-500">{p.motivo}</span>
                                  )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {foraDoDia > 0 && (
        <p className="text-xs text-slate-500">
          {foraDoDia} pedido(s) deste dia têm zona de sábado — nasceram na data errada e o
          replan cancela. Continuam contados, mas não aparecem no filtro de HUB porque não
          são operação de {dia.split("-").reverse().join("/")}. Para vê-los, use o cartão
          <strong> Cancelado</strong>.
        </p>
      )}
    </div>
  );
}
