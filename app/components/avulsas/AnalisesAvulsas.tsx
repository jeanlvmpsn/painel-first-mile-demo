"use client";

import { Fragment, useMemo, useState } from "react";

import {
  contarPorCategoria,
  contarPorCluster,
  contarPorTransportadora,
  resumoDePacotes,
  type LinhaAnalise,
} from "../../lib/avulsasAnalise";

const inteiro = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(n));
const umaCasa = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);

type LinhaLista = {
  chave: string;
  rotulo: string;
  vezes: number;
  porcento: number;
  itens: LinhaAnalise[];
  pacotes: number | null;
  forte?: boolean;
  recuo?: boolean;
};

function Barra({ porcento }: { porcento: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100">
      <div
        className="h-1.5 rounded-full bg-slate-400"
        style={{ width: Math.max(2, Math.min(100, porcento)) + "%" }}
      />
    </div>
  );
}

function FotoBau({ forms }: { forms?: { fotoBau: string } }) {
  if (!forms) {
    return <span className="ml-2 text-slate-400">sem forms desta avulsa</span>;
  }
  if (!forms.fotoBau) {
    return <span className="ml-2 text-slate-400">forms sem foto</span>;
  }
  return (
    <a
      href={forms.fotoBau}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-2 text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900"
    >
      ver baú
    </a>
  );
}

function Detalhe({ itens }: { itens: LinhaAnalise[] }) {
  if (itens.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-slate-400">
        Nenhuma avulsa nesta linha.
      </p>
    );
  }
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className="w-[34%] px-3 py-1 text-left font-medium">ID</th>
          <th className="w-[12%] px-3 py-1 text-right font-medium">Coletado</th>
          <th className="w-[24%] px-3 py-1 text-left font-medium">Transportadora</th>
          <th className="w-[30%] px-3 py-1 text-left font-medium">Motivo</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i, n) => (
          <tr key={(i.id ?? "") + "-" + n} className="border-t border-slate-100">
            <td className="px-3 py-1 text-[11px]">
              {i.link ? (
                <a
                  href={i.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                >
                  {i.id}
                </a>
              ) : (
                i.id || "-"
              )}
              <FotoBau forms={i.forms} />
            </td>
            <td className="px-3 py-1 text-right text-[11px] text-slate-700">
              {Number.isFinite(Number(i.coletados))
                ? inteiro(Number(i.coletados))
                : "\u2014"}
            </td>
            <td className="truncate px-3 py-1 text-[11px] text-slate-600" title={i.transportadora}>
              {i.transportadora || "-"}
            </td>
            <td className="truncate px-3 py-1 text-[11px] text-slate-600" title={i.motivo}>
              {i.motivo || "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Lista({ linhas }: { linhas: LinhaLista[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  if (linhas.length === 0) {
    return <p className="px-3 py-2 text-xs text-slate-400">Nada no filtro.</p>;
  }
  return (
    <table className="w-full table-fixed">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
          <th className="w-[36%] px-3 pt-1.5 text-left font-medium" />
          <th className="w-[12%] px-3 pt-1.5 text-right font-medium">Avulsas</th>
          <th className="w-[14%] px-3 pt-1.5 text-right font-medium">Pacotes</th>
          <th className="w-[13%] px-3 pt-1.5 text-right font-medium">%</th>
          <th className="w-[25%] px-3 pt-1.5" />
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const ativa = aberto === l.chave;
          return (
            <Fragment key={l.chave}>
              <tr
                onClick={() => setAberto(ativa ? null : l.chave)}
                className={
                  "cursor-pointer border-b border-slate-100 " +
                  (ativa
                    ? "bg-amber-50"
                    : l.forte
                      ? "bg-slate-50"
                      : "hover:bg-slate-50")
                }
              >
                <td
                  className={
                    "truncate px-3 py-1.5 " +
                    (l.recuo
                      ? "pl-6 text-[11px] text-slate-500"
                      : l.forte
                        ? "text-xs font-semibold text-slate-800"
                        : "text-xs text-slate-700")
                  }
                  title={l.rotulo}
                >
                  <span className="mr-1 text-slate-400">
                    {ativa ? "−" : "+"}
                  </span>
                  {l.rotulo}
                </td>
                <td className="px-3 py-1.5 text-right text-xs font-semibold text-slate-900">
                  {inteiro(l.vezes)}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-slate-700">
                  {l.pacotes === null ? "\u2014" : inteiro(l.pacotes)}
                </td>
                <td className="px-3 py-1.5 text-right text-xs text-slate-500">
                  {umaCasa(l.porcento)}%
                </td>
                <td className="px-3 py-1.5">
                  <Barra porcento={l.porcento} />
                </td>
              </tr>
              {ativa && (
                <tr className="border-b border-slate-100 bg-slate-50">
                  <td colSpan={5} className="py-1">
                    <Detalhe itens={l.itens} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function Caixa({
  titulo,
  abaixo,
  children,
}: {
  titulo: string;
  abaixo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {titulo}
        </h3>
        {abaixo ? <p className="text-[11px] text-slate-400">{abaixo}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function AnalisesAvulsas({ linhas }: { linhas: LinhaAnalise[] }) {
  const clusters = useMemo(() => contarPorCluster(linhas), [linhas]);
  const categorias = useMemo(() => contarPorCategoria(linhas), [linhas]);
  const transportadoras = useMemo(() => contarPorTransportadora(linhas), [linhas]);
  const pacotes = useMemo(() => resumoDePacotes(linhas), [linhas]);

  const listaCluster: LinhaLista[] = clusters.map((c) => ({
    chave: "cl-" + c.rotulo,
    ...c,
  }));

  const listaCategoria: LinhaLista[] = categorias.map((c) => ({
    chave: "cat-" + c.categoria,
    rotulo: c.categoria,
    vezes: c.vezes,
    porcento: c.porcento,
    itens: c.itens,
    pacotes: c.pacotes,
  }));

  const listaTransportadora: LinhaLista[] = transportadoras.map((t) => ({
    chave: "tp-" + t.rotulo,
    ...t,
  }));

  const listaFaixa: LinhaLista[] = pacotes.faixas.map((f) => ({
    chave: "fx-" + f.rotulo,
    ...f,
  }));

  return (
    <section className="mt-6 space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{"Análises"}</h2>
        <span className="text-[11px] text-slate-400">
          {inteiro(linhas.length)} avulsa(s) no filtro. Clique na linha para ver
          quais.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Caixa titulo="Por cluster">
          <Lista linhas={listaCluster} />
        </Caixa>
        <Caixa titulo="Por categoria de motivo">
          <Lista linhas={listaCategoria} />
        </Caixa>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Caixa
          titulo="Pacotes coletados por avulsa"
          abaixo={
            pacotes.comNumero < pacotes.avulsas
              ? inteiro(pacotes.avulsas - pacotes.comNumero) +
                " avulsa(s) sem numero: o dia nao foi salvo no historico de coleta"
              : undefined
          }
        >
          <Lista linhas={listaFaixa} />
        </Caixa>
        <Caixa titulo="Por transportadora">
          <Lista linhas={listaTransportadora} />
        </Caixa>
      </div>
    </section>
  );
}
