import type { Metadata } from "next";

import PainelAvulsas from "../components/avulsas/PainelAvulsas";
import { getRotasPlanejadasPeriodo } from "../lib/atribuicoes";
import { lerAvulsasDoDia, lerAvulsasPeriodo } from "../lib/avulsasDados";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Avulsas - FM-CPS",
  description: "Rotas avulsas do dia e a planilha de controle",
};

const TZ = "America/Sao_Paulo";
const hojeISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const isoParaBR = (iso: string) => iso.split("-").reverse().join("/");

export default async function AvulsasPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; dataFim?: string }>;
}) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const pedida = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : hoje;

  const iso = pedida > hoje ? hoje : pedida;
  const dataBR = isoParaBR(iso);

  const pedidaFim = sp.dataFim ?? "";
  const dataFimISO =
    /^\d{4}-\d{2}-\d{2}$/.test(pedidaFim) && pedidaFim >= iso && pedidaFim <= hoje
      ? pedidaFim
      : iso;
  const dataFimBR = isoParaBR(dataFimISO);
  const ehPeriodo = dataFimISO !== iso;

  const [leitura, rotasProgramadas] = await Promise.all([
    ehPeriodo ? lerAvulsasPeriodo(dataBR, dataFimBR) : lerAvulsasDoDia(dataBR),
    getRotasPlanejadasPeriodo(dataBR, dataFimBR, isoParaBR(hoje))
      .then((r) => r.length)
      .catch(() => 0),
  ]);

  return (
    <PainelAvulsas
      key={iso + dataFimISO}
      iso={iso}
      dataFimISO={dataFimISO}
      dataBR={dataBR}
      dataFimBR={dataFimBR}
      avulsas={leitura.avulsas}
      rotasDoDia={leitura.rotasDoDia}
      jaRegistrados={leitura.jaRegistrados}
      opcoes={leitura.opcoes}
      erro={leitura.erro}
      rotasProgramadas={rotasProgramadas}
    />
  );
}
