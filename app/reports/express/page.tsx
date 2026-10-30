import type { Metadata } from "next";

import BlocoExpress from "../../components/reports/BlocoExpress";
import NavReports from "../../components/reports/NavReports";
import {
  contarExpress,
  contarExpressSemPlaca,
  placasExpress,
  placasRepetidas,
} from "../../lib/express";
import { getRotasPlanejadas } from "../../lib/atribuicoes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "M1 D0 - FM-CPS",
  description: "Placas Express do dia, prontas para mandar no grupo",
};

const TZ = "America/Sao_Paulo";
const hojeBR = () =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default async function M1D0Page() {
  const dataBR = hojeBR();

  const doDia = await getRotasPlanejadas(dataBR, dataBR);
  const placas = placasExpress(doDia);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Placas Express de <strong>{dataBR}</strong>, lidas da aba de
            atribuicao.
          </p>
        </header>

        <NavReports />

        <BlocoExpress
          placas={placas}
          totalRotas={contarExpress(doDia)}
          semPlaca={contarExpressSemPlaca(doDia)}
          repetidas={placasRepetidas(placas)}
        />
      </main>
    </div>
  );
}
