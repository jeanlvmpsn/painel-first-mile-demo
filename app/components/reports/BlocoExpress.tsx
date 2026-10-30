"use client";

import { textoExpress } from "../../lib/express";
import CabecalhoReport from "./CabecalhoReport";

export default function BlocoExpress({
  placas,
  totalRotas,
  semPlaca,
  repetidas,
}: {
  placas: string[];
  totalRotas: number;
  semPlaca: number;
  repetidas: { placa: string; rotas: number }[];
}) {
  const texto = textoExpress(placas);
  return (
    <section>
      <CabecalhoReport titulo="M1 D0 - placas Express" texto={texto} />
      <p className="mb-3 text-sm text-slate-600">
        {totalRotas} {totalRotas === 1 ? "rota" : "rotas"} Express no dia (a
        mesma conta do painel de Atribuição) · {placas.length} na lista
      </p>
      {semPlaca > 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {semPlaca === 1
            ? "1 rota Express ainda esta sem placa e ficou fora da lista e da contagem."
            : semPlaca +
              " rotas Express ainda estao sem placa e ficaram fora da lista e da contagem."}{" "}
          Aviso so da tela: nao vai no texto copiado.
        </p>
      )}
      {repetidas.length > 0 && (
        <p className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          Placa em mais de uma rota Express, listada uma vez por rota:{" "}
          {repetidas.map((r) => r.placa + " (" + r.rotas + " rotas)").join(", ")}
          .
        </p>
      )}
      <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
        {texto}
      </pre>
    </section>
  );
}
