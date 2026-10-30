"use client";

import { useMemo } from "react";

import CabecalhoReport from "./CabecalhoReport";
import { useCampoDoDia } from "./useCampoDoDia";
import {
  textoFechamento,
  type Fechamento,
} from "../../lib/relatorioTipos";

export default function BlocoFechamento({
  fechamento,
  dataBR,
  schedulingsAceitos,
  rotasConfig,
  dataISO,
  titulo = "Report Fechamento total",
  tituloTexto,
  prefixoCampos = "",
  culpMeliAuto = [],
}: {
  fechamento: Fechamento;
  dataBR: string;
  schedulingsAceitos: number | null;
  rotasConfig: number | null;
  dataISO: string;
  titulo?: string;

  tituloTexto?: string;

  prefixoCampos?: string;

  culpMeliAuto?: string[];
}) {
  const [capacidade, setCapacidade] = useCampoDoDia(prefixoCampos + "capacidade", dataBR);
  const [culpMeli, setCulpMeli] = useCampoDoDia(prefixoCampos + "culp-meli", dataBR);
  const autoTexto = culpMeliAuto.join("\n");
  const usandoAuto = !culpMeli.trim() && !!autoTexto;

  const comCapacidade = useMemo<Fechamento>(() => {
    const limpo = capacidade.replace(/\./g, "").replace(",", ".").trim();
    const n = limpo ? Number(limpo) : NaN;
    if (!Number.isFinite(n) || n <= 0) return fechamento;
    return {
      ...fechamento,
      capacidadeTotal: n,
      sprPlan:
        fechamento.rotasAtribuidas > 0 ? n / fechamento.rotasAtribuidas : null,
    };
  }, [capacidade, fechamento]);

  const texto = useMemo(
    () =>
      textoFechamento(comCapacidade, dataBR, {
        schedulingsAceitos,
        rotasConfig,
        manuais: { culpMeli: usandoAuto ? autoTexto : culpMeli },
        titulo: tituloTexto,
      }),
    [comCapacidade, dataBR, schedulingsAceitos, rotasConfig, culpMeli, usandoAuto, autoTexto, tituloTexto]
  );

  const spr = comCapacidade.sprPlan;

  return (
    <section>
      <CabecalhoReport
        titulo={titulo}
        dataISO={dataISO}
        texto={texto}
      >
        <span className="text-sm text-slate-600">Capacidade</span>
        <input
          inputMode="numeric"
          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums focus:border-slate-500 focus:outline-none"
          value={capacidade}
          onChange={(e) => setCapacidade(e.target.value)}
        />

        <span className="text-sm text-slate-600">Culp Meli</span>
        <textarea
          rows={Math.max(1, culpMeli.split("\n").length)}
          placeholder={autoTexto ? "automático pelo Monitoramento D0" : "uma linha por cluster"}
          className="w-56 resize-y rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
          value={culpMeli}
          onChange={(e) => setCulpMeli(e.target.value)}
        />
        {usandoAuto && (
          <span className="text-xs text-slate-500" title="Soma por cluster os pontos de culpa Meli com 100+ pacotes pendentes no Monitoramento D0 (top 3). Digitar na caixa substitui; apagar volta ao automático.">
            Automático (Monitoramento D0) ·{" "}
            <button type="button" onClick={() => setCulpMeli(autoTexto)} className="underline hover:text-slate-800">
              editar
            </button>
          </span>
        )}
        <span className="text-sm text-slate-500">
          SPR plan:{" "}
          <strong className="tabular-nums text-slate-900">
            {spr === null ? "—" : Math.round(spr).toLocaleString("pt-BR")}
          </strong>
        </span>
      </CabecalhoReport>

      <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
        {texto}
      </pre>
    </section>
  );
}
