import type { Metadata } from "next";
import Link from "next/link";

import PainelCurva from "../components/curva/PainelCurva";
import SeletorDataCurva from "../components/curva/SeletorDataCurva";
import { lerCurvaDoDia } from "../lib/curvaChegadaDados";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Curva de chegada - FM-CPS",
  description: "Veículos e pacotes previstos para chegar por faixa de horário contra os que chegaram, pela curva do sistema e por rota",
};

const TZ = "America/Sao_Paulo";
const isoDe = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const diasAtras = (n: number) => isoDe(new Date(Date.now() - n * 86400000));

export default async function PaginaCurva({ searchParams }: { searchParams: Promise<{ dia?: string; data?: string }> }) {
  const params = await searchParams;
  const hojeISO = diasAtras(0);
  const ontemISO = diasAtras(1);
  const pedida = /^\d{4}-\d{2}-\d{2}$/.test(params.data ?? "") && (params.data ?? "") < hojeISO ? (params.data as string) : "";
  const dataISO = pedida || (params.dia === "ontem" ? ontemISO : hojeISO);
  const ehHoje = dataISO === hojeISO;
  const dataBR = dataISO.split("-").reverse().join("/");
  const leitura = await lerCurvaDoDia(dataBR, ehHoje);

  const copiaVelha = ehHoje && !!leitura.copiaQuery && leitura.copiaQuery.slice(0, 10) !== dataBR;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-8">
        <header>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">Curva de chegada</h1>
            <div className="flex gap-1 text-sm">
              {[
                { href: "/curva", rotulo: "Hoje", ativo: ehHoje },
                { href: "/curva?data=" + ontemISO, rotulo: "Ontem", ativo: dataISO === ontemISO },
              ].map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  className={
                    "rounded-md px-3 py-1 font-medium " +
                    (d.ativo ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")
                  }
                >
                  {d.rotulo}
                </Link>
              ))}
            </div>
            <SeletorDataCurva dataISO={dataISO} hojeISO={hojeISO} />
          </div>
          <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-md bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
            <span>
              Query (BigQuery) · última chegada de {dataBR.slice(0, 5)}:{" "}
              {leitura.ultimaChegadaQuery ? (
                <>
                  <strong className="tabular-nums text-slate-900">{leitura.ultimaChegadaQuery.quando}</strong>{" "}
                  <span className="text-slate-500">({leitura.ultimaChegadaQuery.rota})</span>
                </>
              ) : (
                <strong className="text-slate-900">nenhuma ainda</strong>
              )}
            </span>
            {leitura.copiaQuery &&
              (copiaVelha ? (
                <span className="font-medium text-[#94160e]">
                  · cópia de {leitura.copiaQuery.slice(0, 5)} às {leitura.copiaQuery.slice(11, 16)}: a query não rodou hoje (gatilho
                  a rotina automática da planilha de processos)
                </span>
              ) : (
                <span className="text-slate-400">
                  · cópia de {leitura.copiaQuery.slice(0, 5)} às {leitura.copiaQuery.slice(11, 16)}
                </span>
              ))}
          </p>
        </header>

        {leitura.avisos.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {leitura.avisos.join(" ")}
          </div>
        )}

        {leitura.erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{leitura.erro}</div>
        ) : (
          <PainelCurva key={dataISO} rotas={leitura.rotas} sistema={leitura.sistema} fonteRotas={leitura.fonteRotas} ehHoje={ehHoje} />
        )}
      </main>
    </div>
  );
}
