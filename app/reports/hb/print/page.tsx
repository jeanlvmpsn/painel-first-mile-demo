import type { Metadata } from "next";
import Link from "next/link";

import BlocoHB from "../../../components/reports/BlocoHB";
import { lerHBDoDia } from "../../../lib/hbDados";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "H&B - print",
  description: "Tabela do H&B sem a navegacao, para o print do grupo",
};

const TZ = "America/Sao_Paulo";
const hojeBR = () =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default async function HBPrintPage({ searchParams }: { searchParams: Promise<{ lista?: string }> }) {
  const completa = (await searchParams).lista === "completa";
  const dataBR = hojeBR();
  const leitura = await lerHBDoDia(dataBR, "", "", completa ? "completa" : "curada");

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-base font-bold">H&amp;B &mdash; {dataBR}</h1>
          <Link
            href={completa ? "/reports/hb?lista=completa" : "/reports/hb"}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            Sair do modo print
          </Link>
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
          compacto
        />
      </main>
    </div>
  );
}
