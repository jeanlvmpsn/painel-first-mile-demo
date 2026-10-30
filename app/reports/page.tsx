import type { Metadata } from "next";
import {
  formatarNumero,
  formatarPct,
  metricasDeAtribuicao,
  montarFechamento,
} from "../lib/relatorioTipos";
import {
  getMonitoramentoDoDia,
  getParadasDoDia,
  getRotasConfigDoDia,
  getRotasDoDia,
} from "../lib/sheets";
import BlocoFechamento from "../components/reports/BlocoFechamento";
import NavReports from "../components/reports/NavReports";
import { carregarFechamento } from "../lib/fechamento";
import { culpOpDoDia } from "../lib/monitorD0Dados";
import { getFechamentoHistorico } from "../lib/sheets";
import CabecalhoReport from "../components/reports/CabecalhoReport";
import { CHIP, COR } from "../components/ui/cores";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fechamento total - FM-CPS",
  description: "Fechamento do dia com os números que hoje são montados na mão",
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
  cor,
  chip,
}: {
  rotulo: string;
  valor: string;
  nota?: string;

  cor?: string;
  chip?: { texto: string; classe: string };
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {rotulo}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-lg font-bold tabular-nums text-slate-900">
        {cor && (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: cor }}
          />
        )}
        {valor}
      </p>
      {chip && (
        <p className={"mt-0.5 inline-block rounded px-1 py-px text-[10px] " + chip.classe}>
          {chip.texto}
        </p>
      )}
      {nota && (
        <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{nota}</p>
      )}
    </div>
  );
}

const GRADE = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6";

function minutoSP(): number {
  const [h, m] = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return (h % 24) * 60 + m;
}

export default async function PaginaReports({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const params = await searchParams;
  const hojeISO = paraISO(new Date());
  const pedido = params.data ?? "";
  const dataISO = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : hojeISO;
  const dataBR = isoParaBR(dataISO);
  const hojeBR = isoParaBR(hojeISO);
  const ehHoje = dataISO === hojeISO;

  const dados = await carregarFechamento(dataBR, hojeBR);

  const retrato = ehHoje ? null : await getFechamentoHistorico(dataBR);

  const culpOpAuto = ehHoje
    ? await culpOpDoDia(dataBR, minutoSP()).catch(() => [])
    : (retrato?.CULP_OP ?? "").split("\n").filter(Boolean);
  const {
    fechamento: f,
    aceitos,
    recusas,
    rotasConfig,
    temColeta,
    temMonitoramento,
    temAderencia,
    recorteHub,
  } = dados;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Fechamento de <strong>{dataBR}</strong>, montado da COLETAS_D0, da
            mesma atribuição que o painel de final de rota usa e da aba de
            scheduling.
          </p>
        </header>

        <NavReports />

        {recorteHub && (
          <div className="mb-5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
            Dia com outros hubs: o fechamento conta só Campinas.
            Ficaram de fora {recorteHub.rotasFora} rota(s) de outro hub e {recorteHub.avulsasFora} avulsa(s) sem ponto
            em comum com as rotas CPS na config; entraram {recorteHub.avulsasCps} avulsa(s) CPS.
            {recorteHub.semConfig && " Sem a config do dia, todas as avulsas ficaram como CPS."}{" "}
            {recorteHub.pacotes === "monitoramento por sellers"
              ? "Estimados e coletados: o número da tela de monitoramento menos os pontos só de outro hub" +
                (recorteHub.descontados
                  ? " (" + recorteHub.descontados.estimados.toLocaleString("pt-BR") + " estimados e " +
                    recorteHub.descontados.coletados.toLocaleString("pt-BR") + " coletados descontados)."
                  : ".")
              : "Estimados e coletados só dos pontos CPS, pela soma das paradas CPS do relatório de coleta (sem o Monitoramento por Sellers deste dia)."}
          </div>
        )}

        {!temColeta && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Sem linhas de coleta para {dataBR}.</p>
            <p className="mt-1">
              O detalhe por PARADA (pontualidade, motorista, planejado) só
              existe na COLETAS_D0, que guarda o dia corrente. O
              HISTORICO_COLETAS já vem consolidado por rota e não serve para
              este report.
            </p>
          </div>
        )}

        {!temAderencia && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              Capacidade, aderência ao perfil e SPR plan aparecem como {"___"}.
            </p>
            <p className="mt-1">
              A <strong>aderência</strong> só precisa de CAPACIDADE_PLAN e
              CAPACIDADE_VEIC, duas colunas que ainda não existem no fim da aba
              ATRIBUIÇÃO - o painel já lê as duas por cabeçalho e elas aparecem
              sozinhas quando o Apps Script gravar.
            </p>
            <p className="mt-1">
              <strong>Capacidade</strong> e <strong>SPR plan</strong> são outra
              conversa: a capacidade do fechamento (247.861 em 10/09, ~493 por
              rota) vem de uma fonte que ainda não identificamos. Quando as
              colunas existirem, as duas somas aparecem aqui pra comparar - se
              alguma bater com o número do fechamento, achamos a fonte.
            </p>
          </div>
        )}

        <section className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Rotas
          </h2>
          <div className={GRADE}>
            <Tile
              rotulo="Rotas TT"
              valor={formatarNumero(f.rotasTT)}
              nota="atribuídas - NS + avulsas"
            />
            <Tile
              rotulo="Atribuição"
              valor={formatarNumero(f.rotasAtribuidas)}
              nota={
                rotasConfig === null
                  ? undefined
                  : rotasConfig === f.rotasAtribuidas
                    ? "config bate: " + formatarNumero(rotasConfig)
                    : "config diverge: " + formatarNumero(rotasConfig)
              }
            />
            <Tile
              rotulo="NS / Declínios"
              valor={formatarNumero(f.ns)}
              nota="critério do final de rota"
            />
            <Tile
              rotulo="Avulsas"
              valor={formatarNumero(f.avulsas)}
              nota={
                f.origem === "monitoramento"
                  ? "ambulanceRoutes, da tela"
                  : "sem nome no relatório, só id"
              }
            />
            <Tile
              rotulo="Com atraso"
              valor={temColeta ? formatarNumero(f.rotasComAtraso) : "—"}
              nota="1 coleta late carimba a rota"
            />
            <Tile
              rotulo="2ª saída"
              valor={temColeta ? formatarNumero(f.segundaSaida) : "—"}
              nota="motorista com N rotas rende N-1"
            />
          </div>
        </section>

        {!temMonitoramento && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              Sem linha da aba MONITORAMENTO para {dataBR}.
            </p>
            <p className="mt-1">
              Estimados, coletados e avulsas caíram na soma da COLETAS_D0, que
              reproduz o packages-summary do sistema (a soma crua por linha) e
              não o card da tela. Os números ficam mais altos que o painel do
              ML - confira antes de colar.
            </p>
          </div>
        )}

        <section className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pacotes{" "}
            <span className="font-normal normal-case tracking-normal text-slate-400">
              {f.origem === "monitoramento"
                ? "· tela de monitoramento" + (dados.atualizadoEm ? " · " + dados.atualizadoEm : "")
                : "· somados da COLETAS_D0"}
            </span>
          </h2>
          <div className={GRADE}>
            <Tile rotulo="Estimados fim" valor={formatarNumero(f.pacotes.estimados)} />
            <Tile rotulo="Coletados" valor={formatarNumero(f.pacotes.coletados)} />
            <Tile
              rotulo="Capacidade"
              valor={f.capacidadeTotal === null ? "-" : formatarNumero(f.capacidadeTotal)}
            />
            <Tile
              rotulo="Prévia PU"
              valor={formatarPct(f.pacotes.pu, 1)}
              cor={f.pacotes.puNoAlvo ? COR.verde : COR.vermelho}
              chip={{
                texto:
                  (f.pacotes.puNoAlvo ? "no alvo" : "abaixo") +
                  " de " +
                  formatarPct(f.pacotes.alvoPu, 1),
                classe: f.pacotes.puNoAlvo ? CHIP.verde : CHIP.vermelho,
              }}
            />
            <Tile
              rotulo="SPR plan"
              valor={f.sprPlan === null ? "-" : formatarNumero(f.sprPlan)}
              nota="capacidade / rotas atribuição"
            />
            <Tile
              rotulo="SPR exe"
              valor={f.sprExec === null ? "-" : formatarNumero(f.sprExec)}
              nota="coletado / rotas TT"
            />
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Pontualidade das coletas
          </h2>
          {temColeta ? (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded">
                <div style={{ width: f.onTime + "%", backgroundColor: COR.verde }} />
                <div style={{ width: f.early + "%", backgroundColor: COR.azul }} />
                <div style={{ width: f.late + "%", backgroundColor: COR.vermelho }} />
              </div>
              <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <li className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COR.verde }} />
                  <span className="text-slate-600">On Time</span>
                  <strong className="tabular-nums">{formatarPct(f.onTime)}</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COR.azul }} />
                  <span className="text-slate-600">Early</span>
                  <strong className="tabular-nums">{formatarPct(f.early)}</strong>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COR.vermelho }} />
                  <span className="text-slate-600">Late</span>
                  <strong className="tabular-nums">{formatarPct(f.late)}</strong>
                </li>
                <li className="text-[11px] text-slate-500">
                  base: {formatarNumero(f.totalParadas)} paradas &middot;{" "}
                  {formatarNumero(f.paradasAvulsas)} avulsas (planejado = não)
                </li>
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              Sem linha de coleta para esta data &mdash; a COLETAS_D0 guarda só
              o dia corrente. O histórico das 23h passa a cobrir isso.
            </div>
          )}
        </section>

        <section className="mb-4">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Scheduling
          </h2>
          <div className={GRADE}>
            <Tile
              rotulo="Aceitos"
              valor={aceitos === null ? "—" : formatarNumero(aceitos)}
            />
            <Tile
              rotulo="Recusas"
              valor={recusas === null ? "—" : formatarNumero(recusas)}
            />
          </div>
        </section>

        <BlocoFechamento
          fechamento={f}
          dataBR={dataBR}
          schedulingsAceitos={aceitos}
          rotasConfig={rotasConfig}
          dataISO={dataISO}
          culpOpAuto={culpOpAuto}
        />

        {retrato?.TEXTO_REPORT && (
          <section className="mt-8">
            <CabecalhoReport titulo="Report salvo às 23h" texto={retrato.TEXTO_REPORT}>
              <span className="text-sm text-slate-500">
                Histórico · gravado em {retrato.GRAVADO_EM || "—"}
              </span>
            </CabecalhoReport>
            <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
              {retrato.TEXTO_REPORT}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}
