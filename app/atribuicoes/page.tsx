import type { Metadata } from "next";
import AvisoSessao from "../components/AvisoSessao";
import PainelAtribuicao from "../components/atribuicao/PainelAtribuicao";
import { getRotasPlanejadasPeriodo } from "../lib/atribuicoes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atribuição — FM-CPS",
  description:
    "Quantas rotas do dia ainda estão sem veículo alocado, por transportadora, HUB e cluster",
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

function rotuloDoDia(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const semana = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
  }).format(data);
  return semana.charAt(0).toUpperCase() + semana.slice(1);
}

export default async function PaginaAtribuicoes({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; dataFim?: string }>;
}) {
  const params = await searchParams;

  const agora = new Date();
  const hojeISO = paraISO(agora);

  const pedido = params.data ?? "";
  const dataISO = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : hojeISO;
  const dataBR = isoParaBR(dataISO);

  const pedidoFim = params.dataFim ?? "";
  const dataFimISO =
    /^\d{4}-\d{2}-\d{2}$/.test(pedidoFim) && pedidoFim >= dataISO
      ? pedidoFim
      : dataISO;
  const dataFimBR = isoParaBR(dataFimISO);
  const ehPeriodo = dataFimISO !== dataISO;

  const rotas = await getRotasPlanejadasPeriodo(
    dataBR,
    dataFimBR,
    isoParaBR(hojeISO),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Atribuição
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Quantas rotas do dia ainda estão sem veículo alocado, por
            transportadora, HUB e cluster.
          </p>
        </header>

        {dataFimISO >= hojeISO && <AvisoSessao />}

        <p className="mb-4 text-sm text-slate-600">
          {ehPeriodo ? (
            <>
              Mostrando <strong>{dataBR}</strong> a <strong>{dataFimBR}</strong>
            </>
          ) : (
            <>
              Mostrando <strong>{dataBR}</strong> &middot; {rotuloDoDia(dataISO)}
            </>
          )}
        </p>

        <PainelAtribuicao
          rotas={rotas}
          dataISO={dataISO}
          dataFimISO={dataFimISO}
        />

        {rotas.length === 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-semibold">
              {ehPeriodo
                ? `Nenhuma rota gravada entre ${dataBR} e ${dataFimBR}.`
                : `Nenhuma rota gravada para ${dataBR}.`}
            </p>
            <p className="mt-1">
              O painel lê o que o Apps Script da planilha já gravou. Ele grava o
              dia corrente e os dois seguintes na aba ATRIBUIÇÃO, e os dias já
              fechados ficam no HISTORICO_ATRIBUICAO. Data fora dessa janela -
              mais de dois dias à frente, ou anterior ao início do histórico -
              não tem o que mostrar.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
