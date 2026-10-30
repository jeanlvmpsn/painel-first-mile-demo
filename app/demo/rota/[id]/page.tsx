import Link from "next/link";

// Na versao real, os links de rota abrem o detalhe da rota no sistema de
// logistica. Na demo, so explica isso.
export default async function RotaDemo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-slate-700">
      <h1 className="text-xl font-semibold text-slate-900">Rota {decodeURIComponent(id)}</h1>
      <p className="mt-3">
        Na versão real do painel, este link abre o detalhe da rota no sistema de logística (paradas, motorista e
        horários). Na demonstração os dados são fictícios e não há sistema externo.
      </p>
      <Link href="/monitoramento" className="mt-6 inline-block text-blue-700 underline">
        Voltar ao Monitoramento
      </Link>
    </main>
  );
}
