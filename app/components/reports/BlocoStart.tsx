"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";

import CabecalhoReport from "./CabecalhoReport";
import { useCampoDoDia } from "./useCampoDoDia";
import { textoStart, type DadosStart } from "../../lib/start";

const CAMPOS = [
  { chave: "backlog", rotulo: "Backlog" },
  { chave: "forecast", rotulo: "Forecast" },
  { chave: "capacidade", rotulo: "Capacidade" },
] as const;

type Chave = (typeof CAMPOS)[number]["chave"];

const RELER_MIN = 5;

function numeroOuNulo(bruto: string): number | null {
  const limpo = bruto.replace(/\./g, "").replace(",", ".").trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function BlocoStart({
  dados,
  dataBR,
}: {
  dados: DadosStart;
  dataBR: string;
}) {
  const router = useRouter();
  const [relendo, reler] = useTransition();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), RELER_MIN * 60 * 1000);
    return () => clearInterval(t);
  }, [router]);
  const [backlog, setBacklog] = useCampoDoDia("backlog", dataBR);
  const [forecast, setForecast] = useCampoDoDia("forecast", dataBR);
  const [capacidade, setCapacidade] = useCampoDoDia("capacidade", dataBR);
  const valores: Record<Chave, string> = { backlog, forecast, capacidade };
  const mudar: Record<Chave, (v: string) => void> = {
    backlog: setBacklog,
    forecast: setForecast,
    capacidade: setCapacidade,
  };

  const automatico: Record<Chave, number | null> = {
    backlog: dados.backlog,
    forecast: dados.forecast,
    capacidade: null,
  };

  const texto = useMemo(
    () =>
      textoStart(dados.metricas, dataBR, {
        rotasConfig: dados.rotasConfig,
        aceitos: dados.aceitos,
        recusados: dados.recusados,
        estimadosInicio: dados.estimadosInicio,
        backlog: numeroOuNulo(backlog) ?? dados.backlog,
        forecast: numeroOuNulo(forecast) ?? dados.forecast,
        capacidade: numeroOuNulo(capacidade),
      }),
    [dados, dataBR, backlog, forecast, capacidade]
  );

  return (
    <section>

      <CabecalhoReport titulo="Status FM CAMPINAS" texto={texto}>
        {CAMPOS.map((c) => (
          <span key={c.chave} className="flex items-center gap-1">
            <span className="text-sm text-slate-600">{c.rotulo}</span>
            <input
              inputMode="numeric"
              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums placeholder:text-slate-500 focus:border-slate-500 focus:outline-none"
              value={valores[c.chave]}
              placeholder={automatico[c.chave] === null ? undefined : automatico[c.chave]!.toLocaleString("pt-BR")}
              title={
                automatico[c.chave] === null
                  ? undefined
                  : "Da aba NOC" + (dados.nocAtualizadoEm ? " (" + dados.nocAtualizadoEm + ")" : "") +
                    ". Digite para trocar; apague para voltar ao da NOC."
              }
              onChange={(e) => mudar[c.chave](e.target.value)}
            />
          </span>
        ))}
      </CabecalhoReport>

      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          Atribuição da planilha: {dados.atribuicaoEm ? dados.atribuicaoEm.slice(11, 16) : "sem carimbo"} · lida pelo painel às{" "}
          {dados.lidoEm} · relê sozinho a cada {RELER_MIN} min
        </span>
        <button
          type="button"
          onClick={() => reler(() => router.refresh())}
          disabled={relendo}
          className="rounded border border-slate-300 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {relendo ? "Relendo…" : "Recarregar"}
        </button>
      </p>

      <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
        {texto}
      </pre>
    </section>
  );
}
