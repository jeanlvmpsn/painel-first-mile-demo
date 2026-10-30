import type { Metadata } from "next";

import BlocoPrevia from "../../components/reports/BlocoPrevia";
import NavReports from "../../components/reports/NavReports";
import { carregarPrevia } from "../../lib/previaDados";
import { listarHubs, proximoDiaOperacao } from "../../lib/previa";
import { formatarNumero } from "../../lib/relatorioTipos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prévia D+1 - FM-CPS",
  description: "Retrato da atribuição do dia seguinte, enviado na véspera",
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

export default async function PaginaPrevia({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const params = await searchParams;
  const agora = new Date();
  const hojeISO = paraISO(agora);

  const amanhaISO = proximoDiaOperacao(hojeISO);

  const pedido = params.data ?? "";
  const dataISO = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : amanhaISO;
  const dataBR = isoParaBR(dataISO);
  const hojeBR = isoParaBR(hojeISO);

  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const ehSabado = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() === 6;

  const dados = await carregarPrevia(dataBR, hojeBR);
  const m = dados.metricas;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Prévia de <strong>{dataBR}</strong>, montada da atribuição do dia
            seguinte e da aba de scheduling.
          </p>
        </header>

        <NavReports />

        {!dados.temAtribuicao && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              Nenhuma rota gravada para {dataBR}.
            </p>
            <p className="mt-1">
              Se esse dia JÁ teve rota e sumiu, a API voltou vazia num
                momento ruim - a linha &ldquo;Ultima atualizacao atribuicao&rdquo; no
                painel da planilha avisa quando isso acontece. O Apps Script
                grava o dia corrente e os dois seguintes. D+2
              costuma vir incompleto porque a roteirização ainda está criando
              rota - por isso aqui aparece vazio, e não zero.
            </p>
          </div>
        )}

        <section className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Rotas de {dataBR}
          </h2>
          <div className={GRADE}>
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
              rotulo="GAP de rotas"
              valor={formatarNumero(m.semTransportadora)}
              nota="sem transportadora"
            />
            <Tile
              rotulo="Sem atribuição"
              valor={formatarNumero(m.semAtribuicao)}
              nota="sem veículo alocado"
            />
            <Tile
              rotulo="M1"
              valor={formatarNumero(m.m1)}
              nota={ehSabado ? "Express não roda sábado" : "Express"}
            />
            <Tile
              rotulo="Aceitos"
              valor={dados.aceitos === null ? "—" : formatarNumero(dados.aceitos)}
              nota={
                dados.recusados === null
                  ? undefined
                  : formatarNumero(dados.recusados) + " recusados"
              }
            />
          </div>
        </section>

        {m.gapRotas.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              GAP de rotas
            </h2>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-3">
              {m.gapRotas.map((nome, i) => (
                <span
                  key={nome + i}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  {nome}
                </span>
              ))}
            </div>
          </section>
        )}

        {m.semAtribuicaoPorTp.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Sem atribuição por transportadora
            </h2>
            <div className={GRADE}>
              {m.semAtribuicaoPorTp.map((t) => (
                <Tile
                  key={t.transportadora}
                  rotulo={t.transportadora}
                  valor={formatarNumero(t.rotas)}
                  nota={
                    m.porHub.length > 1
                      ? listarHubs(t.porHub)
                      : "rotas sem veículo"
                  }
                />
              ))}
            </div>
          </section>
        )}

        {m.porHub.length > 1 && (
          <section className="mb-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Por HUB
            </h2>
            <div className={GRADE}>
              {m.porHub.map((h) => (
                <Tile
                  key={h.hub}
                  rotulo={h.hub}
                  valor={formatarNumero(h.rotas)}
                  nota={
                    h.semTransportadora > 0
                      ? formatarNumero(h.semTransportadora) + " sem transportadora"
                      : "todas com transportadora"
                  }
                />
              ))}
            </div>
          </section>
        )}

        <BlocoPrevia dados={dados} dataBR={dataBR} />
      </main>
    </div>
  );
}
