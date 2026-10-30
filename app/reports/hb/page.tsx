import type { Metadata } from "next";
import Link from "next/link";

import BlocoHB from "../../components/reports/BlocoHB";
import NavReports from "../../components/reports/NavReports";
import { lerHBDoDia } from "../../lib/hbDados";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start H&B - FM-CPS",
  description:
    "Rotas do dia que passam em pontos de coleta de alto volume (H&B)",
};

const TZ = "America/Sao_Paulo";
const hojeBR = () =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default async function HBPage({
  searchParams,
}: {
  searchParams: Promise<{ rota?: string; seller?: string; lista?: string }>;
}) {
  const params = await searchParams;
  const rotaBuscada = String(params.rota ?? "").trim().slice(0, 80);
  const sellerBuscado = String(params.seller ?? "").trim().slice(0, 30);

  const completa = params.lista === "completa";
  const dataBR = hojeBR();
  const leitura = await lerHBDoDia(dataBR, rotaBuscada, sellerBuscado, completa ? "completa" : "curada");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            H&amp;B de <strong>{dataBR}</strong> &mdash; rotas que passam em
            pontos de coleta de alto volume.
          </p>
        </header>

        <NavReports />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Lista:</span>
          {(
            [
              ["curada", "Curada (aba H&B)", "/reports/hb"],
              ["completa", "Simular lista completa (HB_PARADAS)", "/reports/hb?lista=completa"],
            ] as const
          ).map(([valor, rotulo, href]) => {
            const ativo = (valor === "completa") === completa;
            return (
              <Link
                key={valor}
                href={href}
                aria-current={ativo ? "page" : undefined}
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                  (ativo ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")
                }
              >
                {rotulo}
              </Link>
            );
          })}
        </div>

        {completa && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            <strong>Simulação:</strong> no lugar dos sellers da lista curada, entram todas as paradas do grupo H&amp;B
            (pacote LARGE ou OVERSIZE em Campinas nos últimos 14 dias, aba HB_PARADAS), a mesma lista do Fechamento H&amp;B.
            Cada linha é rota × seller; places do mesmo seller na mesma rota viram uma linha só (o maior estimado).
          </div>
        )}

        <div className="mb-3">
          <Link
            href={completa ? "/reports/hb/print?lista=completa" : "/reports/hb/print"}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700"
          >
            Modo print
          </Link>
          <span className="ml-3 text-[11px] text-slate-500">
            abre so a tabela, pronta para o print do grupo
          </span>
        </div>

        <BlocoHB
          dataBR={dataBR}
          linhas={leitura.linhas}
          resumo={leitura.resumo}
          totalSellers={leitura.totalSellers}
          atualizadoEta={leitura.atualizadoEta}
          atualizadoMonitoring={leitura.atualizadoMonitoring}
          aviso={leitura.aviso}
          erro={leitura.erro}
        />

        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <form method="get" className="flex flex-wrap items-center gap-2">
            {completa && <input type="hidden" name="lista" value="completa" />}
            <label htmlFor="rota" className="text-sm font-semibold text-slate-700">
              Por que uma rota não aparece?
            </label>
            <input
              id="rota"
              name="rota"
              defaultValue={rotaBuscada}
              placeholder="Rota, ex.: CAMPINAS_C15_370"
              className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              name="seller"
              defaultValue={sellerBuscado}
              placeholder="ID do seller (opcional)"
              inputMode="numeric"
              aria-label="ID do seller"
              className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Verificar
            </button>
          </form>
          {leitura.diagnostico.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {leitura.diagnostico.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
