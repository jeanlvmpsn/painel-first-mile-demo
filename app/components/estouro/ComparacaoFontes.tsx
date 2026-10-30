"use client";

import { useState } from "react";

import type { Comparacao, Risco } from "../../lib/estouro";

const int = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const pct = (f: number | null) => (f === null ? "—" : int(f * 100) + "%");
const variacao = (de: number, para: number) =>
  de > 0 ? (para >= de ? "+" : "") + int(((para - de) / de) * 100) + "%" : "—";

const ROTULO: Record<Risco, string> = {
  estouro: "Estouro",
  limite: "No limite",
  ok: "Com folga",
  "sem-veiculo": "Sem veículo",
};

export default function ComparacaoFontes({ c }: { c: Comparacao }) {
  const [aberta, setAberta] = useState(false);
  const pioram = c.mudancas.filter(
    (m) => m.riscoPrevisao === "estouro" || (m.riscoPrevisao === "limite" && m.riscoConfig !== "estouro"),
  ).length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h3 className="font-semibold text-slate-900">Config × previsão: o que muda</h3>
      <p className="mt-1 text-xs text-slate-500">
        As mesmas {int(c.rotas)} rotas, com o mesmo veículo e a mesma conta. Só muda de onde vêm peso,
        volume e pacotes de cada parada.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <table className="text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3" />
              <th className="py-1 pr-3 text-right">Config</th>
              <th className="py-1 pr-3 text-right">Previsão</th>
              <th className="py-1 text-right">Diferença</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[
              ["Pacotes", c.pacotesConfig, c.pacotesPrevisao, ""],
              ["Peso", c.pesoConfigKg, c.pesoPrevisaoKg, " kg"],
              ["Volume", c.volumeConfigM3, c.volumePrevisaoM3, " m³"],
            ].map(([nome, a, b, u]) => (
              <tr key={nome as string} className="border-t border-slate-100">
                <td className="py-1 pr-3 font-medium">{nome}</td>
                <td className="py-1 pr-3 text-right">{int(a as number) + u}</td>
                <td className="py-1 pr-3 text-right">{int(b as number) + u}</td>
                <td className="py-1 text-right font-semibold">{variacao(a as number, b as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3">Rotas</th>
              <th className="py-1 pr-3 text-right">Config</th>
              <th className="py-1 text-right">Previsão</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {(["estouro", "limite", "ok", "sem-veiculo"] as Risco[]).map((r) => (
              <tr key={r} className="border-t border-slate-100">
                <td className="py-1 pr-3 font-medium">{ROTULO[r]}</td>
                <td className="py-1 pr-3 text-right">{int(c.porRisco[r].config)}</td>
                <td className="py-1 text-right">{int(c.porRisco[r].previsao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-xs text-slate-600">
        {c.mudancas.length === 0 ? (
          "Nenhuma rota troca de faixa entre as duas fontes."
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAberta((v) => !v)}
              className="font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              {int(c.mudancas.length)} rota(s) trocam de faixa ({int(pioram)} piora(m) na previsão)
              {aberta ? " ▾" : " ▸"}
            </button>
            {aberta && (
              <div className="mt-2 max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 pr-3">Rota</th>
                      <th className="py-1 pr-3">Cluster</th>
                      <th className="py-1 pr-3">Config</th>
                      <th className="py-1 pr-3">Previsão</th>
                      <th className="py-1 pr-3 text-right">Volume config → previsão</th>
                      <th className="py-1 text-right">Peso config → previsão</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {c.mudancas.map((m) => (
                      <tr key={m.rota} className="border-t border-slate-100">
                        <td className="py-1 pr-3 font-medium">{m.rota}</td>
                        <td className="py-1 pr-3">{m.cluster || "—"}</td>
                        <td className="py-1 pr-3">
                          {ROTULO[m.riscoConfig]} ({pct(m.usoConfig)})
                        </td>
                        <td className="py-1 pr-3">
                          {ROTULO[m.riscoPrevisao]} ({pct(m.usoPrevisao)})
                        </td>
                        <td className="py-1 pr-3 text-right">
                          {int(m.volumeConfigM3)} → {int(m.volumePrevisaoM3)} m³
                        </td>
                        <td className="py-1 text-right">
                          {int(m.pesoConfigKg)} → {int(m.pesoPrevisaoKg)} kg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
