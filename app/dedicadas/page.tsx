import type { Metadata } from "next";

import PainelDedicadas from "../components/dedicadas/PainelDedicadas";
import { lerDedicadas } from "../lib/dedicadasDados";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dedicada - FM-CPS",
  description: "Rotas dedicadas: coleta do dia, PU e histórico por dedicada, identificadas pelos IDs dos pontos",
};

const TZ = "America/Sao_Paulo";

export default async function PaginaDedicadas() {
  const agora = new Date();
  const dataBR = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(agora);
  const [h, m] = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(agora)
    .split(":")
    .map(Number);
  const leitura = await lerDedicadas(dataBR, (h % 24) * 60 + m);
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Dedicada</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">
            Rotas dedicadas (CPS_Cxx_DED_…): um ponto exclusivo ou um multicust, com 1 ou 2 paradas. Cada dedicada é
            reconhecida pelos IDs dos pontos, então segue a mesma mesmo se o nome da rota mudar. Hoje pelo relatório de coleta e
            o plano do dia; histórico pela base oficial do PU (por ponto e dia) e pelo dia gravado às 23h.
          </p>
        </header>
        <PainelDedicadas
          dataBR={dataBR}
          dias={leitura.dias}
          historico={leitura.historico}
          base={leitura.base}
          rotasDed={leitura.rotasDed}
          erro={leitura.erro}
          lidoEm={leitura.lidoEm}
        />
      </main>
    </div>
  );
}
