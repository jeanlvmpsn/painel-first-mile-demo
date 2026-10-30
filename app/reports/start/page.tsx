import type { Metadata } from "next";

import BlocoStart from "../../components/reports/BlocoStart";
import NavReports from "../../components/reports/NavReports";
import { carregarStart } from "../../lib/startDados";
import { parPerfil } from "../../lib/start";
import { formatarNumero } from "../../lib/relatorioTipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start D0 - FM-CPS",
  description: "Retrato do início do dia, com forecast e estimados",
};

const TZ = "America/Sao_Paulo";

function paraISO(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

function isoParaBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return dia + "/" + mes + "/" + ano;
}

function Tile({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {rotulo}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
        {valor}
      </p>
      {nota && (
        <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{nota}</p>
      )}
    </div>
  );
}

const GRADE = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6";

export default async function PaginaStart() {
  const hojeISO = paraISO(new Date());
  const dataBR = isoParaBR(hojeISO);

  const dados = await carregarStart(dataBR, dataBR);
  const m = dados.metricas;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Start de <strong>{dataBR}</strong>, montado da atribuição de hoje e
            do monitoramento. Backlog, forecast e capacidade entram nas caixas
            do report.
          </p>
        </header>

        <NavReports />

        <section className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Start de {dataBR}
          </h2>
          <div className={GRADE}>
            <Tile
              rotulo="Forecast"
              valor={dados.forecast === null ? "—" : formatarNumero(dados.forecast)}
              nota={"NOC · forecast do dia" + (dados.nocAtualizadoEm ? " · " + dados.nocAtualizadoEm.slice(-8, -3) : "")}
            />
            <Tile
              rotulo="Backlog"
              valor={dados.backlog === null ? "—" : formatarNumero(dados.backlog)}
              nota="NOC · etiqueta impressa"
            />
            <Tile
              rotulo="Estimados início"
              valor={
                dados.estimadosInicio === null
                  ? "—"
                  : formatarNumero(dados.estimadosInicio)
              }
              nota="card do monitoramento"
            />
            <Tile
              rotulo="TT Rotas"
              valor={formatarNumero(m.ttRotas)}
              nota={"atribuição - " + formatarNumero(m.ns) + " NS"}
            />
            <Tile
              rotulo="Config"
              valor={
                dados.rotasConfig === null
                  ? "—"
                  : formatarNumero(dados.rotasConfig)
              }
              nota="query do BigQuery"
            />
            <Tile rotulo="Atribuição" valor={formatarNumero(m.rotas)} />
            <Tile
              rotulo="Aceitos"
              valor={dados.aceitos === null ? "—" : formatarNumero(dados.aceitos)}
              nota={
                dados.recusados === null
                  ? undefined
                  : formatarNumero(dados.recusados) + " recusados"
              }
            />
            <Tile
              rotulo="GAP de rotas"
              valor={formatarNumero(m.semTransportadora)}
              nota="sem transportadora"
            />
            <Tile
              rotulo="Perfil divergente"
              valor={
                m.perfilMenor === null ? "—" : formatarNumero(m.perfilMenor)
              }
              nota="veículo menor que o planejado"
            />
          </div>
        </section>

        {m.perfilMenorPorTp.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Perfil divergente por transportadora — clique para abrir
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {m.perfilMenorPorTp.map((t) => (
                <details
                  key={t.transportadora}
                  className="group rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
                    <span className="truncate">
                      {t.transportadora} - {formatarNumero(t.rotas.length)}
                    </span>
                    <span
                      aria-hidden
                      className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                    >
                      &rsaquo;
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-700">
                    {t.rotas.map((r) => (
                      <li key={r.rota} className="flex justify-between gap-2">
                        <span className="truncate">{r.rota}</span>
                        <span className="shrink-0 text-slate-500">
                          {parPerfil(r) || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        )}

        <BlocoStart dados={dados} dataBR={dataBR} />
      </main>
    </div>
  );
}
