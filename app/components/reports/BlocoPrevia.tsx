"use client";

import { textoPrevia, type DadosPrevia } from "../../lib/previa";
import CabecalhoReport from "./CabecalhoReport";

export default function BlocoPrevia({
  dados,
  dataBR,
}: {
  dados: DadosPrevia;
  dataBR: string;
}) {
  const texto = textoPrevia(dados.metricas, dataBR, {
    rotasConfig: dados.rotasConfig,
    aceitos: dados.aceitos,
    recusados: dados.recusados,
  });

  return (
    <section>
      <CabecalhoReport
        titulo="Prévia Status FM"
        texto={texto}
      />
      <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
        {texto}
      </pre>
    </section>
  );
}
