import type { Metadata } from "next";

import PainelUpgrade from "../components/upgrade/PainelUpgrade";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Upgrade - FM-CPS",
  description: "Sellers que dropam nos places e sao candidatos a upgrade para coleta propria",
};

export default function PaginaUpgrade() {
  const hojeISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Upgrade</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">
            Sellers que dropam pacotes nos places de Campinas. Quem dropa acima do corte, também
            na última semana, é candidato a upgrade para coleta própria. A solicitação vai direto
            para a planilha de upgrade, com o PDF de evidência.
          </p>
        </header>
        <PainelUpgrade hojeISO={hojeISO} />
      </main>
    </div>
  );
}
