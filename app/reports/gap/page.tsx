import type { Metadata } from "next";

import BlocoGap from "../../components/reports/BlocoGap";
import NavReports from "../../components/reports/NavReports";
import { carregarGap } from "../../lib/gapRotasDados";
import { proximoDiaOperacao } from "../../lib/previa";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GAP de rotas - FM-CPS",
  description: "Rotas em aberto de D+1 com as paradas de volume planejado na config",
};

const TZ = "America/Sao_Paulo";

function paraISO(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
}

function isoParaBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return dia + "/" + mes + "/" + ano;
}

export default async function PaginaGap({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const params = await searchParams;
  const hojeISO = paraISO(new Date());

  const pedido = params.data ?? "";
  const dataISO = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : proximoDiaOperacao(hojeISO);
  const dados = await carregarGap(isoParaBR(dataISO), isoParaBR(hojeISO));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            GAP de rotas de <strong>{dados.dataBR}</strong>: rotas em aberto na atribuição, cada uma com as paradas de volume
            planejado na config do dia.
          </p>
        </header>

        <NavReports />

        {dados.rotasDoDia === 0 && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Nenhuma rota de Campinas gravada na atribuição para {dados.dataBR}.
          </div>
        )}

        <BlocoGap dados={dados} dataISO={dataISO} />
      </main>
    </div>
  );
}
