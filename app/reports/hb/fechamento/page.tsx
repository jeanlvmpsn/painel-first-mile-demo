import type { Metadata } from "next";

import BlocoFechamento from "../../../components/reports/BlocoFechamento";
import CabecalhoReport from "../../../components/reports/CabecalhoReport";
import NavReports from "../../../components/reports/NavReports";
import { CHIP, COR } from "../../../components/ui/cores";
import { comPacotesHB } from "../../../lib/hbFechamento";
import { carregarFechamentoHB, carregarFechamentoHBSalvo } from "../../../lib/hbFechamentoDados";
import { formatarNumero, formatarPct, type Fechamento } from "../../../lib/relatorioTipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fechamento H&B - FM-CPS",
  description: "Fechamento do dia só com as paradas H&B (LARGE e OVERSIZE)",
};

const TZ = "America/Sao_Paulo";
const hojeBR = () =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );

function Tile({ rotulo, valor, nota, cor }: { rotulo: string; valor: string; nota?: string; cor?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-lg font-bold tabular-nums text-slate-900">
        {cor && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cor }} />}
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{nota}</p>}
    </div>
  );
}

export default async function FechamentoHBPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const hoje = hojeBR();
  const pedido = (await searchParams).data ?? "";
  const dataBR = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido.split("-").reverse().join("/") : hoje;
  const dataISO = dataBR.split("/").reverse().join("-");
  if (dataBR !== hoje) return <PaginaHistorico dataBR={dataBR} dataISO={dataISO} />;
  const d = await carregarFechamentoHB(dataBR, dataBR);

  const f = comPacotesHB(d.fechamento, d.puOficial, dataISO);
  const foraDaCurada = d.comparacao.paradas.filter((p) => !p.naListaCurada);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Fechamento H&amp;B de <strong>{dataBR}</strong>: o mesmo fechamento, com o relatório de coleta, a
            config e a atribuição recortados só para as paradas do grupo H&amp;B: pacote LARGE ou OVERSIZE pela
            tipologia oficial nos últimos 14 dias (lista atualizada todo dia pela query). Estimados, coletados e PU
            contam só os pacotes H&amp;B, pelo KPI oficial, que sai no dia seguinte. Fica salvo no histórico às 23h.
          </p>
        </header>

        <NavReports />

        {d.erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{d.erro}</div>
        ) : (
          <>
            {d.aviso && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                {d.aviso}
              </div>
            )}

            <TilesHB
              f={f}
              dataISO={dataISO}
              paradasHB={d.paradasHB}
              rotasHB={d.rotasHB.length}
              puOficial={d.puOficial}
              fonte={(d.atualizadoEm ? "· lista de paradas de " + d.atualizadoEm : "") + FONTE_PACOTES}
            />

            <BlocoFechamento
              fechamento={f}
              dataBR={dataBR}

              schedulingsAceitos={null}
              rotasConfig={d.rotasConfig}
              dataISO={dataISO}
              titulo="Report Fechamento H&B"
              tituloTexto="Fechamento H&B CAMPINAS FM"
              prefixoCampos="hb-"
            />

            <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Paradas H&amp;B de hoje × lista curada do report H&amp;B{" "}
                <span className={"ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium " + CHIP.vermelho}>
                  {foraDaCurada.length} fora da lista
                </span>
              </summary>
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="py-1 pr-3">Parada</th>
                    <th className="py-1 pr-3">Seller</th>
                    <th className="py-1 pr-3 text-right">Pacotes H&amp;B (14 dias)</th>
                    <th className="py-1 pr-3 text-right">Dias com H&amp;B</th>
                    <th className="py-1">Lista curada</th>
                  </tr>
                </thead>
                <tbody>
                  {d.comparacao.paradas.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-1 pr-3 font-mono">{p.id}</td>
                      <td className="py-1 pr-3">{p.seller || p.sellerId || "—"}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{formatarNumero(p.pacotesHb)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{p.dias}</td>
                      <td className="py-1">{p.naListaCurada ? "sim" : <span className="text-red-700">não</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.comparacao.soNaListaCurada.length > 0 && (
                <p className="mt-3 text-xs text-slate-600">
                  <strong>Na lista curada e fora do grupo H&amp;B (sem pacote H&amp;B nos últimos 14 dias):</strong>{" "}
                  {d.comparacao.soNaListaCurada.join(", ")}
                </p>
              )}
            </details>
          </>
        )}
      </main>
    </div>
  );
}

type PuOficial = { data: string; numerador: number; denominador: number; pu: number } | null;

const FONTE_PACOTES = " · pacotes H&B (LARGE e OVERSIZE) do KPI oficial EXP-OTR-FM-39, que fecha D-1";

function TilesHB({
  f,
  dataISO,
  paradasHB,
  rotasHB,
  puOficial,
  fonte,
  doDia = "de hoje",
}: {
  f: Fechamento;
  dataISO: string;
  paradasHB: number;
  rotasHB: number;
  puOficial: PuOficial;
  fonte: string;
  doDia?: string;
}) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        H&amp;B do dia <span className="font-normal normal-case tracking-normal text-slate-400">{fonte}</span>
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Tile rotulo="Paradas H&B" valor={formatarNumero(paradasHB)} nota={"na config ou na coleta " + doDia} />
        <Tile rotulo="Rotas H&B" valor={formatarNumero(rotasHB)} nota="passam em parada H&B" />
        <Tile
          rotulo="Estimados H&B"
          valor={f.pacotesPendentes ? "—" : formatarNumero(f.pacotes.estimados)}
          nota={f.pacotesPendentes ? "pacotes H&B saem da base oficial no dia seguinte" : "pacotes LARGE e OVERSIZE"}
        />
        <Tile rotulo="Coletados H&B" valor={f.pacotesPendentes ? "—" : formatarNumero(f.pacotes.coletados)} />
        <Tile
          rotulo="Prévia PU"
          valor={f.pacotesPendentes ? "—" : formatarPct(f.pacotes.pu, 1)}
          cor={f.pacotesPendentes ? undefined : f.pacotes.puNoAlvo ? COR.verde : COR.vermelho}
          nota={"alvo " + formatarPct(f.pacotes.alvoPu, 1)}
        />
        <Tile
          rotulo={
            "PU H&B oficial" +
            (puOficial && puOficial.data !== dataISO ? " " + puOficial.data.split("-").reverse().slice(0, 2).join("/") : "")
          }
          valor={puOficial ? formatarPct(puOficial.pu, 1) : "—"}
          nota={
            puOficial
              ? formatarNumero(puOficial.numerador) +
                " / " +
                formatarNumero(puOficial.denominador) +
                (puOficial.data !== dataISO ? " · o KPI fecha D-1" : "")
              : "sem dia no KPI"
          }
        />
      </div>
    </section>
  );
}

async function PaginaHistorico({ dataBR, dataISO }: { dataBR: string; dataISO: string }) {
  const h = await carregarFechamentoHBSalvo(dataBR);
  const s = h.salvo;

  const fh = s ? comPacotesHB(s.fechamento, h.puOficial, dataISO) : null;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Fechamento H&amp;B de <strong>{dataBR}</strong>, como foi salvo no histórico
            {h.gravadoEm ? " em " + h.gravadoEm : ""}. O PU H&amp;B oficial é lido na hora: o KPI fecha D-1.
          </p>
        </header>

        <NavReports />

        {h.erro ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{h.erro}</div>
        ) : !s || !fh ? (
          <>
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              O fechamento H&amp;B de {dataBR} não foi salvo. O H&amp;B só existe no próprio dia (a COLETAS_D0 e o
              Monitoramento por Sellers são sobrescritos), então o histórico depende do snapshot das 23h, que
              grava a aba HISTORICO_FECHAMENTO_HB desde 02/10/2026.
            </div>

            <CabecalhoReport titulo="Report Fechamento H&B" dataISO={dataISO} texto="" />
          </>
        ) : (
          <>
            <TilesHB
              f={fh}
              dataISO={dataISO}
              paradasHB={s.paradasHB}
              rotasHB={s.rotasHB}
              puOficial={h.puOficial}
              doDia="do dia"
              fonte={(s.atualizadoEm ? "· lista de paradas de " + s.atualizadoEm : "") + FONTE_PACOTES}
            />
            <BlocoFechamento
              fechamento={fh}
              dataBR={dataBR}
              schedulingsAceitos={null}
              rotasConfig={s.rotasConfig}
              dataISO={dataISO}
              titulo="Report Fechamento H&B"
              tituloTexto="Fechamento H&B CAMPINAS FM"
              prefixoCampos="hb-"
            />
          </>
        )}
      </main>
    </div>
  );
}
