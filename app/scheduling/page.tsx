import type { Metadata } from "next";
import PainelScheduling from "../components/scheduling/PainelScheduling";
import AvisoSessao from "../components/AvisoSessao";
import { lerBasesPos11h, lerScheduling } from "../lib/scheduling";
import { dataParaISO } from "../lib/schedulingTipos";

export const metadata: Metadata = {
  title: "Scheduling — FM-CPS",
  description:
    "Aceites, recusas, pedidos sem resposta e cancelamentos por transportadora.",
};

export const dynamic = "force-dynamic";

export default async function PaginaScheduling({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const params = await searchParams;
  const [pedidos, basesPos11h] = await Promise.all([
    lerScheduling(),

    lerBasesPos11h().catch(() => ({}) as Record<string, string>),
  ]);

  const datas = [...new Set(pedidos.map((p) => dataParaISO(p.data)).filter(Boolean))].sort();

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const pedido = params.data ?? "";
  const dataInicial = /^\d{4}-\d{2}-\d{2}$/.test(pedido)
    ? pedido
    : datas.includes(hoje)
      ? hoje
      : (datas[datas.length - 1] ?? hoje);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Scheduling</h1>
          <p className="mt-1 text-sm text-slate-600">
            Pedidos de veículo de Campinas: quem aceitou, quem recusou, quem não
            respondeu e o que foi cancelado, por transportadora.
          </p>
        </header>

        {datas.includes(hoje) && <AvisoSessao />}

        <PainelScheduling
          pedidos={pedidos}
          dataISO={dataInicial}
          datasDisponiveis={datas}
          basesPos11h={basesPos11h}
        />

        {datas.length === 0 && (
          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            A aba SCHEDULING está vazia. Rode{" "}
            <em>Atualizar scheduling (hoje + 4 dias)</em> na planilha.
          </p>
        )}
      </main>
    </div>
  );
}
