import type { Metadata } from "next";

import PainelEstouro from "../components/estouro/PainelEstouro";
import { VEICULOS } from "../lib/estouro";
import { lerCargaDoDia } from "../lib/estouroDados";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Capacidade - FM-CPS",
  description: "Risco de NSE nas rotas de hoje: carga de cada rota contra o veículo atribuído",
};

const TZ = "America/Sao_Paulo";
const isoDe = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export default async function PaginaCapacidade({
  searchParams,
}: {
  searchParams: Promise<{ comparar?: string }>;
}) {
  const params = await searchParams;

  const comparar = params.comparar === "1";

  const dataBR = isoDe(new Date()).split("-").reverse().join("/");
  const leitura = await lerCargaDoDia(dataBR, dataBR);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl space-y-10 px-4 py-8">
        <section>
          <header className="mb-4">
            <h1 className="text-2xl font-bold text-slate-900">Capacidade: risco de NSE nas rotas de hoje</h1>
            <p className="mt-1 max-w-4xl text-sm text-slate-600">
              Rotas de <strong>{dataBR}</strong> comparando a carga de cada parada (pacotes do
              monitoramento × peso e volume por pacote da previsão) com o limite do veículo que
              entrou na rota. <strong>NSE peso</strong>: o peso acaba antes do espaço.{" "}
              <strong>NSE</strong>: o espaço acaba primeiro. As duas são estouro.
            </p>
          </header>
          <PainelEstouro
            dataBR={dataBR}
            rotas={leitura.rotas}
            agora={leitura.agora}
            info={leitura.info}
            comparar={comparar}
            aviso={leitura.aviso}
            erro={leitura.erro}
            veiculos={VEICULOS}
            apoio={leitura.apoio}
          />
        </section>
      </main>
    </div>
  );
}
