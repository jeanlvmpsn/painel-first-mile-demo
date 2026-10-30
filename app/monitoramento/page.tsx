import type { Metadata } from "next";
import localFont from "next/font/local";

import PainelMonitorD0 from "../components/monitoramento/PainelMonitorD0";
import { chaveRota } from "../lib/hb";
import { lerMonitorD0 } from "../lib/monitorD0Dados";
import { ehMelione } from "../lib/melione";
import { outrosHubsDaAtribuicao } from "../lib/hubMonitor";
import { getRotasPlanejadas } from "../lib/atribuicoes";
import { getRotasDoDia } from "../lib/sheets";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monitoramento D0 - FM-CPS",
  description: "Impactos das coletas de hoje: o que preocupa, o que tem cobertura e o que ja foi revertido",
};

const TZ = "America/Sao_Paulo";

const nunito = localFont({ src: "../fonts/Nunito-latin.woff2", weight: "200 1000" });

export default async function PaginaMonitoramento() {
  const agora = new Date();
  const dataBR = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(agora);
  const [h, m] = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(agora)
    .split(":")
    .map(Number);
  const chaves = (r: { rota: string; idRota?: string }) => [chaveRota(r.rota), r.idRota ? "ID:" + r.idRota : ""];
  const [leitura, doForms, planejadas] = await Promise.all([
    lerMonitorD0(dataBR),

    getRotasDoDia(dataBR, true).catch(() => null),

    getRotasPlanejadas(dataBR, dataBR).catch(() => []),
  ]);
  const rotasNs = (doForms?.rotas ?? []).filter((r) => r.ns).flatMap(chaves).filter(Boolean);

  const listaNs = (doForms?.rotas ?? [])
    .filter((r) => r.ns)
    .map((r) => ({
      rota: r.rota,
      rotaId: r.idRota ?? "",
      transportadora: r.transportadora,
      placa: r.placa,
      motorista: r.motorista ?? "",
      motivo: r.ns?.motivo ?? "",
      origem: r.ns?.origem ?? "motivo",
      paradas: r.ns?.paradas ?? 0,
      estimados: r.ns?.estimados ?? 0,
    }));
  const rotasMelione = [
    ...new Set(
      [...planejadas, ...(doForms?.rotas ?? [])]
        .filter((r) => ehMelione(r.tipoRota))
        .flatMap(chaves)
        .filter(Boolean),
    ),
  ];

  const idPorRota = new Map((doForms?.rotas ?? []).filter((r) => r.idRota).map((r) => [chaveRota(r.rota), r.idRota ?? ""]));

  const porRotaMelione = new Map<string, { rota: string; rotaId: string; transportadora: string }>();
  for (const r of [...planejadas, ...(doForms?.rotas ?? [])]) {
    if (!ehMelione(r.tipoRota) || !r.rota) continue;
    const k = chaveRota(r.rota);
    const antes = porRotaMelione.get(k);
    porRotaMelione.set(k, {
      rota: r.rota,
      rotaId: idPorRota.get(k) ?? "",
      transportadora: antes?.transportadora || String(r.transportadora ?? "").trim(),
    });
  }
  const listaMelione = [...porRotaMelione.values()];

  const outrosHubs = outrosHubsDaAtribuicao(planejadas);
  return (
    <div className={"min-h-screen bg-slate-50 text-slate-900 " + nunito.className}>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900">Monitoramento D0</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">
            Coletas de hoje pelo relatório de coleta: os pontos que ficaram com pacote, se outra rota ainda vai passar
            (cobertura prevista), se já foi revertido e o que preocupa. Culpa prévia na regra da base oficial do PU.
          </p>
        </header>
        <PainelMonitorD0
          dataBR={dataBR}
          agoraMin={(h % 24) * 60 + m}
          visitas={leitura.visitas}
          tratativas={leitura.tratativas}
          historico={leitura.historico}
          plano={leitura.plano}
          rotasPontos={leitura.rotasPontos}
          consultasPontos={leitura.consultasPontos}
          rotasSistema={leitura.rotasSistema}
          rotasNs={rotasNs}
          listaNs={listaNs}
          rotasMelione={rotasMelione}
          listaMelione={listaMelione}
          outrosHubs={outrosHubs}
          entregasMelione={leitura.entregasMelione}
          saldosPontos={leitura.saldosPontos}
          cargaRotas={leitura.cargaRotas}
          projecaoPontos={leitura.projecaoPontos}
          estimadoRotas={leitura.estimadoRotas}
          fotos={leitura.fotos}
          motivos={leitura.motivos}
          mapeamento={leitura.mapeamento}
          clusterPontos={leitura.clusterPontos}
          erro={leitura.erro}
          desatualizadoDesde={leitura.desatualizadoDesde}
          lidoEm={leitura.lidoEm}
        />
      </main>
    </div>
  );
}
