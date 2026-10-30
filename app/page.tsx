import RotasDashboard from "./components/RotasDashboard";
import { lerAvulsasDoDia } from "./lib/avulsasDados";
import AvisoSessao from "./components/AvisoSessao";
import {
  getRotasDoDia,
  getRotasDoPeriodo,
  MAX_DIAS_PERIODO,
  type RotasDoPeriodo,
} from "./lib/sheets";
import { getSerieAdesao } from "./lib/adesaoHistorico";
import { getEtapasColeta } from "./lib/etapaColetaDados";

function paraChaveISO(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

function isoParaBR(dataISO: string): string {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; dataFim?: string }>;
}) {
  const params = await searchParams;
  const hoje = new Date();
  const hojeISO = paraChaveISO(hoje);
  const valida = (v?: string) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");
  const dataISO = valida(params.data) ? params.data! : hojeISO;
  const dataBR = isoParaBR(dataISO);

  const maxFimISO = new Date(
    Date.parse(dataISO + "T00:00:00Z") + (MAX_DIAS_PERIODO - 1) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const fimPedido =
    valida(params.dataFim) && params.dataFim! > dataISO ? params.dataFim! : dataISO;
  const dataFimISO = fimPedido > maxFimISO ? maxFimISO : fimPedido;
  const ehPeriodo = dataFimISO !== dataISO;
  const ehHoje = !ehPeriodo && dataISO === hojeISO;
  const incluiHoje = dataISO <= hojeISO && hojeISO <= dataFimISO;

  const [doDia, serieAdesao, leituraAvulsas, etapasColeta] = await Promise.all([
    ehPeriodo
      ? getRotasDoPeriodo(dataBR, isoParaBR(dataFimISO), isoParaBR(hojeISO))
      : getRotasDoDia(dataBR, ehHoje),
    getSerieAdesao().catch(() => []),
    ehPeriodo
      ? incluiHoje
        ? lerAvulsasDoDia(isoParaBR(hojeISO))
        : Promise.resolve({ avulsas: [] as { id: string | number; transportadora?: string }[] })
      : lerAvulsasDoDia(dataBR),

    ehHoje ? getEtapasColeta(dataBR) : Promise.resolve(null),
  ]);
  const { rotas, comparavel, respostasOrfas, respostasRepetidas } = doDia;
  const diasSemAtribuicao = ehPeriodo
    ? (doDia as RotasDoPeriodo).diasSemAtribuicao
    : [];

  const idsAvulsas = leituraAvulsas.avulsas.map((a) => String(a.id).trim());

  const transpAvulsas = Object.fromEntries(
    leituraAvulsas.avulsas.map((a) => [String(a.id).trim(), String(a.transportadora ?? "")]),
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <main className="max-w-6xl mx-auto space-y-8">
        <header className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold">Forms Final de Rota — FM-CPS</h1>
          <p className="text-gray-500 text-sm">Origem: respostas do Google Forms</p>
        </header>

        {incluiHoje && <AvisoSessao />}

        <RotasDashboard
          rotas={rotas}
          dataSelecionadaISO={dataISO}
          dataFimISO={dataFimISO}
          maxDiasPeriodo={MAX_DIAS_PERIODO}
          diasSemAtribuicao={diasSemAtribuicao}
          comparavel={comparavel}
          respostasOrfas={respostasOrfas}
          respostasRepetidas={respostasRepetidas}
          serieAdesao={serieAdesao}
          idsAvulsas={idsAvulsas}
          transpAvulsas={transpAvulsas}
          etapasColeta={etapasColeta}
        />
      </main>
    </div>
  );
}
