"use client";

import { useMemo, useState } from "react";

import {
  faixasDaCurva,
  horaDosMinutos,
  pontualidade,
  pontualidadePorTransportadora,
  resumoDaCurva,
  rotasDaBarra,
  TOLERANCIA_MIN,
  type Faixa,
  type Medida,
  type Pontualidade,
  type RotaCurva,
  type Serie,
  type Situacao,
} from "../../lib/curvaChegada";
import { comPlanejadoDaConfig, semNsNoExecutado, type LeituraSistema } from "../../lib/curvaSistema";
import { linkRota } from "../../lib/dashboardUtils";
import { MOTIVOS, type Motivo } from "../../lib/motivosCurva";
import { Campo, MultiSelect } from "../ui/filtros";

const SERIES = [
  { chave: "planejado", rotulo: "Planejado", cor: "#2a78d6" },
  { chave: "executado", rotulo: "Executado", cor: "#1baf7a" },
  { chave: "transito", rotulo: "Em trânsito", cor: "#eda100" },
] as const;

const COR_GRADE = "#e5e7eb";
const COR_EIXO = "#6b7280";

const int = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));

function barra(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

type Selecao = { hora: number; serie: Serie } | null;

function Grafico({
  faixas,
  medida,
  selecao,
  aoClicar,
  doSistema,
  series,
}: {
  faixas: Faixa[];
  medida: Medida;
  selecao: Selecao;
  aoClicar: (hora: number, serie: Serie) => void;
  doSistema: boolean;
  series: readonly (typeof SERIES)[number][];
}) {
  const [ativa, setAtiva] = useState<number | null>(null);
  const L = 960;
  const A = 280;
  const M = { topo: 12, direita: 12, baixo: 34, esquerda: 48 };
  const lp = L - M.esquerda - M.direita;
  const ap = A - M.topo - M.baixo;
  const max = Math.max(1, ...faixas.flatMap((f) => series.map((x) => f[x.chave])));

  const bruto = max / 4;
  const base = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 5, 10].map((k) => k * base).find((p) => p >= bruto) ?? 10 * base;
  const topo = Math.ceil(max / passo) * passo;
  const ticks = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const y = (v: number) => M.topo + ap - (v / topo) * ap;
  const larguraGrupo = lp / faixas.length;
  const gap = 2;
  const n = series.length;
  const wBarra = Math.max(3, Math.min(16, (larguraGrupo * 0.7 - (n - 1) * gap) / n));
  const f = ativa === null ? null : faixas[ativa];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Curva de chegada por faixa de horário">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.esquerda} x2={L - M.direita} y1={y(t)} y2={y(t)} stroke={COR_GRADE} strokeDasharray={t ? "4 4" : undefined} />
            <text x={M.esquerda - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COR_EIXO}>
              {int(t)}
            </text>
          </g>
        ))}
        {faixas.map((fx, i) => {
          const x0 = M.esquerda + i * larguraGrupo + (larguraGrupo - (n * wBarra + (n - 1) * gap)) / 2;
          return (
            <g key={fx.hora}>
              {ativa === i && (
                <rect x={M.esquerda + i * larguraGrupo} y={M.topo} width={larguraGrupo} height={ap} fill="#f1f5f9" />
              )}
              {series.map((s, j) => {
                const v = fx[s.chave];

                const apagada = selecao !== null && !(selecao.hora === fx.hora && selecao.serie === s.chave);
                return (
                  <path
                    key={s.chave}
                    d={barra(x0 + j * (wBarra + gap), y(v), wBarra, y(0) - y(v))}
                    fill={s.cor}
                    opacity={apagada ? 0.3 : 1}
                  />
                );
              })}
              <text x={M.esquerda + (i + 0.5) * larguraGrupo} y={A - 14} textAnchor="middle" fontSize="10" fill={COR_EIXO}>
                {fx.rotulo.slice(0, 5)}
              </text>

              {series.map((s, j) => (
                <rect
                  key={s.chave}
                  x={M.esquerda + i * larguraGrupo + (j * larguraGrupo) / n}
                  y={M.topo}
                  width={larguraGrupo / n}
                  height={ap + 20}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setAtiva(i)}
                  onMouseLeave={() => setAtiva(null)}
                  onClick={() => aoClicar(fx.hora, s.chave)}
                >
                  <title>{s.rotulo + " " + fx.rotulo + ": clique para filtrar as rotas"}</title>
                </rect>
              ))}
            </g>
          );
        })}
      </svg>
      {f && ativa !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: `${((M.esquerda + (ativa + 0.5) * larguraGrupo) / L) * 100}%`,
            transform: ativa > faixas.length / 2 ? "translateX(-105%)" : "translateX(5%)",
          }}
        >
          <p className="mb-1 font-semibold text-slate-800">{f.rotulo}</p>
          {series.map((s) => (
            <p key={s.chave} className="flex items-center gap-2 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.cor }} />
              {s.rotulo}: <strong className="tabular-nums text-slate-900">{int(f[s.chave])}</strong>
            </p>
          ))}
          <p className="mt-1 text-[10px] text-slate-400">
            {medida === "veiculos" ? "veículos" : "pacotes"} ·{" "}
            {doSistema ? "clique para ver as rotas" : "clique na barra para filtrar"}
          </p>
        </div>
      )}
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-slate-600">
        {series.map((s) => (
          <span key={s.chave} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.cor }} />
            {s.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

type Campo = "rota" | "transportadora" | "eta" | "gatein" | "atraso" | "pontualidade" | "motivo" | "doca" | "pacotes" | "situacao";

const COLUNAS: { campo: Campo; titulo: string; direita?: boolean }[] = [
  { campo: "rota", titulo: "Rota" },
  { campo: "transportadora", titulo: "Transportadora" },
  { campo: "eta", titulo: "ETA" },
  { campo: "gatein", titulo: "Chegada" },
  { campo: "atraso", titulo: "Atraso", direita: true },
  { campo: "pontualidade", titulo: "Pontualidade" },
  { campo: "motivo", titulo: "Motivo" },
  { campo: "doca", titulo: "Doca" },
  { campo: "pacotes", titulo: "Pacotes", direita: true },
  { campo: "situacao", titulo: "Situação" },
];

function valor(r: RotaCurva, campo: Campo): number | string | null {
  switch (campo) {
    case "rota":
      return r.rota;
    case "transportadora":
      return r.transportadora || null;
    case "eta":
      return r.etaMin;
    case "gatein":
      return r.gateinMin;
    case "atraso":
      return r.atrasoMin;
    case "pontualidade":
      return r.situacao === "no CD" ? pontualidade(r) : null;
    case "motivo":
      return r.diagnostico ? MOTIVOS.indexOf(r.diagnostico.motivos[0]) : null;
    case "doca":
      return r.chegada?.doca || null;
    case "pacotes":
      return r.chegada ? r.chegada.pacotes : null;
    case "situacao":
      return ORDEM_SITUACAO.indexOf(r.situacao);
  }
}

const SERIE_ROTULO: Record<Serie, string> = { planejado: "Planejado", executado: "Executado", transito: "Em trânsito" };

const PONTUALIDADE: Record<Pontualidade, string> = {
  cedo: "bg-[#e8f1fc] text-[#1d5aa3]",
  "no horário": "bg-[#e6f6f0] text-[#0f6b4e]",
  atrasada: "bg-[#fdeceb] text-[#94160e]",
};

const ROTULO_PONTUALIDADE: Record<Pontualidade, string> = {
  cedo: "Chegou cedo",
  "no horário": "No horário",
  atrasada: "Atrasada",
};

const MOTIVO: Record<Motivo, string> = {
  "Parada cedo": "bg-[#e8f1fc] text-[#1d5aa3]",
  NSE: "bg-[#e8f1fc] text-[#1d5aa3]",
  "Parada tarde": "bg-[#fdeceb] text-[#94160e]",
  Apoio: "bg-[#fdeceb] text-[#94160e]",
  normal: "bg-slate-100 text-slate-600",
};

function detalheMotivo(r: RotaCurva): string {
  const d = r.diagnostico;
  if (!d) return "";
  const partes: string[] = [];

  const quais = (l: string[]) => (l.length ? ": " + l.slice(0, 4).join(", ") + (l.length > 4 ? "…" : "") : "");
  if (d.paradasCedo) partes.push(d.paradasCedo + " parada(s) CEDO" + quais(d.detalheCedo));
  if (d.paradasTarde) partes.push(d.paradasTarde + " parada(s) TARDE" + quais(d.detalheTarde));
  if (d.semEspaco) partes.push(d.semEspaco + " parada(s) com \"sem espaço\"");
  if (d.naoProgramadas) partes.push(d.naoProgramadas + " parada(s) não programada(s)");
  return partes.join(" · ") || "nenhuma ocorrência nas paradas";
}

const SITUACAO: Record<Situacao, string> = {
  "no CD": "bg-[#e6f6f0] text-[#0f6b4e]",
  "a caminho do CD": "bg-[#fdf3e4] text-[#8a5210]",
  coletando: "bg-[#eef0fb] text-[#3b3f9a]",
  "fechada sem chegada": "bg-[#fdeceb] text-[#94160e]",
  NS: "bg-slate-700 text-white",
  "não iniciada": "bg-slate-100 text-slate-600",
};

const ORDEM_SITUACAO: Situacao[] = ["não iniciada", "coletando", "a caminho do CD", "no CD", "fechada sem chegada", "NS"];

type Fonte = "sistema" | "rotas";

function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
}: {
  opcoes: [T, string][];
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5 text-xs font-medium">
      {opcoes.map(([v, texto]) => (
        <button
          key={v}
          type="button"
          onClick={() => aoMudar(v)}
          aria-pressed={valor === v}
          className={"rounded px-3 py-1 " + (valor === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}

export default function PainelCurva({
  rotas,
  sistema,
  fonteRotas,
  ehHoje,
}: {
  rotas: RotaCurva[];
  sistema: LeituraSistema;
  fonteRotas: "sistema" | "bigquery";
  ehHoje: boolean;
}) {
  const series = ehHoje ? SERIES : SERIES.filter((x) => x.chave !== "transito");
  const temSistema = Object.keys(sistema.curvas).length > 0;

  const [fonte, setFonte] = useState<Fonte>(temSistema && ehHoje ? "sistema" : "rotas");
  const [medida, setMedida] = useState<Medida>("veiculos");
  const [transps, setTransps] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [situacoes, setSituacoes] = useState<string[]>([]);
  const [ponts, setPonts] = useState<string[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [ordem, setOrdem] = useState<{ campo: Campo; desc: boolean }>({ campo: "eta", desc: false });

  const opcoesTransp = useMemo(
    () => [...new Set(rotas.map((r) => r.transportadora).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rotas],
  );
  const daTransp = useMemo(
    () => rotas.filter((r) => !transps.length || transps.includes(r.transportadora)),
    [rotas, transps],
  );

  const pontDe = (r: RotaCurva) => (r.situacao === "no CD" ? pontualidade(r) : null);
  const filtradas = useMemo(
    () =>
      daTransp
        .filter((r) => !situacoes.length || situacoes.includes(r.situacao))
        .filter((r) => {
          if (!ponts.length) return true;
          const p = r.situacao === "no CD" ? pontualidade(r) : null;
          return p !== null && ponts.includes(p);
        })
        .filter((r) => !motivos.length || (r.diagnostico?.motivos ?? []).some((m) => motivos.includes(m))),
    [daTransp, situacoes, ponts, motivos],
  );
  const contaSit = (s: string) => daTransp.filter((r) => r.situacao === s).length;
  const contaPont = (p: string) => daTransp.filter((r) => pontDe(r) === p).length;
  const opcoesSit = ORDEM_SITUACAO.filter((s) => contaSit(s) > 0 || situacoes.includes(s));
  const contaMotivo = (m: string) => daTransp.filter((r) => r.diagnostico?.motivos.includes(m as Motivo)).length;

  const porMotivo = MOTIVOS.map((m) => {
    const doMotivo = filtradas.filter((r) => r.diagnostico?.motivos.includes(m) && pontDe(r));
    const conta = (p: Pontualidade) => doMotivo.filter((r) => pontDe(r) === p).length;
    return { motivo: m, chegaram: doMotivo.length, cedo: conta("cedo"), atrasada: conta("atrasada") };
  }).filter((l) => l.chegaram > 0);

  const filtrando = transps.length > 0 || situacoes.length > 0 || ponts.length > 0 || motivos.length > 0;
  const curvaSistema = fonte === "sistema" && !filtrando ? sistema.curvas[medida] : undefined;
  const faixasRotas = useMemo(() => faixasDaCurva(filtradas, medida), [filtradas, medida]);

  const faixasPlanoTodas = useMemo(() => faixasDaCurva(rotas, medida), [rotas, medida]);

  const faixas = curvaSistema
    ? comPlanejadoDaConfig(semNsNoExecutado(curvaSistema.faixas, rotas, medida), faixasPlanoTodas)
    : faixasRotas;
  const resumo = resumoDaCurva(filtradas, medida);
  const planejadasTodas = resumoDaCurva(rotas, medida).planejadas;

  const daBarra = selecao ? new Set(rotasDaBarra(filtradas, selecao.hora, selecao.serie)) : null;
  const porTransportadora = pontualidadePorTransportadora(filtradas);
  const naTabela = filtradas
    .filter((r) => !daBarra || daBarra.has(r))
    .filter((r) => !busca.trim() || r.rota.toUpperCase().includes(busca.trim().toUpperCase()))
    .sort((a, b) => {
      const va = valor(a, ordem.campo);
      const vb = valor(b, ordem.campo);
      if (va === null || vb === null) return va === vb ? a.rota.localeCompare(b.rota) : va === null ? 1 : -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return (ordem.desc ? -cmp : cmp) || a.rota.localeCompare(b.rota);
    });
  const clicarBarra = (hora: number, serie: Serie) =>
    setSelecao((s) => (s && s.hora === hora && s.serie === serie ? null : { hora, serie }));
  const faixaEscolhida = selecao ? faixas.find((f) => f.hora === selecao.hora) : undefined;

  const cartoes: [string, number, string][] = curvaSistema
    ? [
        ["Planejadas", planejadasTodas, "na config, pelo ETA"],
        ["Em trânsito", curvaSistema.resumo.aCaminho, "a caminho do CD"],
        ["Chegaram", curvaSistema.resumo.chegaram, "no CD"],
        ["Descarregando agora", curvaSistema.resumo.descarregando, "em inbound"],
        ["Finalizadas", curvaSistema.resumo.finalizadas, "fechadas"],
      ]
    : [
        ["Planejadas", resumo.planejadas, "na config, pelo ETA"],
        ["Coletando", resumo.coletando, "iniciadas, ainda na rua"],
        ...(ehHoje ? ([["Em trânsito", resumo.transito, "voltando para o CD"]] as [string, number, string][]) : []),
        ["Chegaram", resumo.chegaram, "no CD"],
        ["Descarregando agora", resumo.descarregando, "dock-in sem dock-out"],
        ["Finalizadas", resumo.finalizadas, "com gate-out"],
      ];
  const nota =
    fonte === "sistema" && filtrando && sistema.curvas[medida]
      ? "Com filtro, o gráfico mostra só as rotas filtradas (curva por rota: ETA da config × chegada de cada rota). " +
        "A curva do sistema é o total do CD e não separa por transportadora; limpe os filtros para voltar a ela."
      : fonte === "sistema" && !curvaSistema
      ? "A curva de " + (medida === "veiculos" ? "veículos" : "pacotes") + " do sistema não veio na última cópia: mostrando a por rota."
      : curvaSistema
        ? (ehHoje
            ? ""
            : "Dia passado: a curva do sistema é um retrato (rota que fecha sai do executado); até 06/10 só a última cópia do dia era guardada e as chegadas da tarde somem. A visão Por rota é o registro completo. ") +
          "Planejado: ETA da config. Executado, em trânsito e cartões: tela do sistema" +
          (sistema.atualizadoEm ? ", cópia das " + sistema.atualizadoEm.slice(11, 16) : "") +
          ". Filtrar troca o gráfico para as rotas filtradas; o clique na barra mostra as rotas daquela faixa. Rota NS que o sistema conta como chegada (aberta e fechada sem coletar) fica fora do executado." +
          (curvaSistema.madrugada > 0
            ? " O sistema também conta " + int(curvaSistema.madrugada) + " " + (medida === "veiculos" ? "veículo(s)" : "pacote(s)") +
              " chegando antes das 7h: rota do dia anterior que chegou de madrugada, fora deste gráfico."
            : "")
        :
          fonteRotas === "sistema"
          ? "Por rota: ETA da config × chegada de cada rota pelo histórico da rota no sistema (tempo real); doca e gate-out vêm do BigQuery."
          : "Por rota: ETA da config × gate-in da query do BigQuery.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-4">
          <Campo titulo="Transportadora">
            <MultiSelect opcoes={opcoesTransp} selecionados={transps} setSelecionados={setTransps} rotuloTodas="Todas" />
          </Campo>
          <Campo titulo="Situação">
            <MultiSelect
              opcoes={opcoesSit}
              selecionados={situacoes}
              setSelecionados={setSituacoes}
              rotuloTodas="Todas"
              rotulo={(o) => o + " (" + int(contaSit(o)) + ")"}
            />
          </Campo>
          <Campo titulo="Pontualidade">
            <MultiSelect
              opcoes={["cedo", "no horário", "atrasada"]}
              selecionados={ponts}
              setSelecionados={setPonts}
              rotuloTodas="Todas"
              rotulo={(o) => ROTULO_PONTUALIDADE[o as Pontualidade] + " (" + int(contaPont(o)) + ")"}
            />
          </Campo>
          <Campo titulo="Motivo">
            <MultiSelect
              opcoes={MOTIVOS}
              selecionados={motivos}
              setSelecionados={setMotivos}
              rotuloTodas="Todos"
              rotulo={(o) => o + " (" + int(contaMotivo(o)) + ")"}
            />
          </Campo>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {temSistema && (
            <Segmentado
              rotulo="Fonte do gráfico"
              opcoes={[
                ["sistema", "Sistema (tempo real)"],
                ["rotas", "Por rota"],
              ]}
              valor={fonte}
              aoMudar={setFonte}
            />
          )}
          <Segmentado
            rotulo="Medida"
            opcoes={[
              ["veiculos", "Veículos"],
              ["pacotes", "Pacotes"],
            ]}
            valor={medida}
            aoMudar={setMedida}
          />
        </div>
      </div>
      {nota && <p className="text-xs text-slate-500">{nota}</p>}

      <div
        className={
          "grid grid-cols-2 gap-2 sm:grid-cols-3 " +
          (cartoes.length === 4 ? "lg:grid-cols-4" : cartoes.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-6")
        }
      >
        {cartoes.map(([rotulo, valor, nota]) => (
          <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{int(valor)}</p>
            <p className="text-[10px] text-slate-500">{nota}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <Grafico faixas={faixas} medida={medida} selecao={selecao} aoClicar={clicarBarra} doSistema={!!curvaSistema} series={series} />
      </section>

      <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-700">Números por faixa de horário</summary>
        <table className="mt-3 w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3">Faixa</th>
              {series.map((s) => (
                <th key={s.chave} className="py-1 pr-3 text-right">{s.rotulo}</th>
              ))}
              <th className="py-1 pr-3 text-right">Planejado acum.</th>
              <th className="py-1 text-right">Executado acum.</th>
            </tr>
          </thead>
          <tbody>
            {faixas.map((f, i) => {
              const acum = faixas.slice(0, i + 1);
              return (
                <tr key={f.hora} className="border-t border-slate-100">
                  <td className="py-1 pr-3">{f.rotulo}</td>
                  <td className="py-1 pr-3 text-right">{int(f.planejado)}</td>
                  <td className="py-1 pr-3 text-right">{int(f.executado)}</td>
                  {ehHoje && <td className="py-1 pr-3 text-right">{int(f.transito)}</td>}
                  <td className="py-1 pr-3 text-right">{int(acum.reduce((s, x) => s + x.planejado, 0))}</td>
                  <td className="py-1 text-right">{int(acum.reduce((s, x) => s + x.executado, 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      {porTransportadora.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm" open>
          <summary className="cursor-pointer font-semibold text-slate-700">
            Pontualidade por transportadora{" "}
            <span className="font-normal text-slate-500">
              (chegada contra o ETA da config, tolerância de {TOLERANCIA_MIN} min; clique na linha para filtrar)
            </span>
          </summary>
          <table className="mt-3 w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3">Transportadora</th>
                <th className="py-1 pr-3 text-right">Chegaram</th>
                <th className="py-1 pr-3 text-right">Chegou cedo</th>
                <th className="py-1 pr-3 text-right">No horário</th>
                <th className="py-1 pr-3 text-right">Atrasada</th>
                <th className="py-1 pr-3 text-right">Sem ETA</th>
                <th className="py-1 text-right">% no horário</th>
              </tr>
            </thead>
            <tbody>
              {porTransportadora.map((t) => {
                const comEta = t.chegaram - t.semEta;
                const escolhida = transps.length === 1 && transps[0] === t.transportadora;
                return (
                  <tr
                    key={t.transportadora}
                    onClick={() => setTransps(escolhida ? [] : [t.transportadora])}
                    className={"cursor-pointer border-t border-slate-100 hover:bg-slate-50 " + (escolhida ? "bg-slate-100" : "")}
                  >
                    <td className="py-1 pr-3 font-medium">{t.transportadora}</td>
                    <td className="py-1 pr-3 text-right">{int(t.chegaram)}</td>
                    <td className="py-1 pr-3 text-right">{int(t.cedo)}</td>
                    <td className="py-1 pr-3 text-right">{int(t.noHorario)}</td>
                    <td className={"py-1 pr-3 text-right " + (t.atrasada ? "font-semibold text-[#94160e]" : "")}>{int(t.atrasada)}</td>
                    <td className="py-1 pr-3 text-right text-slate-500">{int(t.semEta)}</td>
                    <td className="py-1 text-right">{comEta ? Math.round((t.noHorario / comEta) * 100) + "%" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      {porMotivo.length > 0 && (
        <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm" open>
          <summary className="cursor-pointer font-semibold text-slate-700">
            Motivos × pontualidade{" "}
            <span className="font-normal text-slate-500">
              (só rotas que chegaram cedo ou atrasadas, e só os motivos daquele sentido. Antecipam: Parada cedo (alguma
              parada CEDO) e NSE (lançou &quot;sem espaço&quot; depois de coletar). Atrasam: Parada tarde (alguma parada TARDE) e
              Apoio (parada não programada, adicionada no dia). Clique na linha para filtrar)
            </span>
          </summary>
          <table className="mt-3 w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-3">Motivo</th>
                <th className="py-1 pr-3 text-right">Rotas</th>
                <th className="py-1 pr-3 text-right">Chegou cedo</th>
                <th className="py-1 text-right">Atrasada</th>
              </tr>
            </thead>
            <tbody>
              {porMotivo.map((l) => {
                const escolhido = motivos.length === 1 && motivos[0] === l.motivo;
                return (
                  <tr
                    key={l.motivo}
                    onClick={() => setMotivos(escolhido ? [] : [l.motivo])}
                    className={"cursor-pointer border-t border-slate-100 hover:bg-slate-50 " + (escolhido ? "bg-slate-100" : "")}
                  >
                    <td className="py-1 pr-3">
                      <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + MOTIVO[l.motivo]}>{l.motivo}</span>
                    </td>
                    <td className="py-1 pr-3 text-right">{int(l.chegaram)}</td>
                    <td className="py-1 pr-3 text-right">{int(l.cedo)}</td>
                    <td className={"py-1 text-right " + (l.atrasada ? "font-semibold text-[#94160e]" : "")}>{int(l.atrasada)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Rotas ({int(naTabela.length)})</h2>
            {selecao && (
              <button
                type="button"
                onClick={() => setSelecao(null)}
                className="rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                title="Limpar o filtro do gráfico"
              >
                {SERIE_ROTULO[selecao.serie]} · {faixaEscolhida?.rotulo ?? selecao.hora + "h"} ✕
              </button>
            )}

          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="buscar rota"
            className="w-56 rounded-md border border-slate-300 px-2 py-1 text-xs"
          />
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                {COLUNAS.map((c) => {
                  const ativa = ordem.campo === c.campo;
                  return (
                    <th key={c.campo} className={"py-1 pr-3 " + (c.direita ? "text-right" : "")}>
                      <button
                        type="button"
                        onClick={() => setOrdem({ campo: c.campo, desc: ativa ? !ordem.desc : false })}
                        className={"uppercase tracking-wide hover:text-slate-900 " + (ativa ? "text-slate-900" : "")}
                      >
                        {c.titulo} {ativa ? (ordem.desc ? "▼" : "▲") : <span className="text-slate-300">⇅</span>}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {naTabela.length === 0 && selecao && (
                <tr>
                  <td colSpan={COLUNAS.length} className="py-3 text-center text-slate-500">
                    Nenhuma rota do dia tem {SERIE_ROTULO[selecao.serie].toLowerCase()} em {faixaEscolhida?.rotulo ?? selecao.hora + "h"}.
                    {curvaSistema &&
                      " O número da barra vem da curva do sistema, que conta também veículos fora da lista de rotas deste dia " +
                        "(por exemplo, rota de outro dia que chegou de madrugada)."}
                  </td>
                </tr>
              )}
              {naTabela.map((r) => (
                <tr key={r.rotaId || r.rota} className="border-t border-slate-100">
                  <td className="whitespace-nowrap py-1 pr-3 font-medium">
                    {r.planejada && r.rotaId ? (
                      <a
                        href={linkRota(r.rotaId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1d5aa3] hover:underline"
                        title="Abrir a rota no monitoring"
                      >
                        {r.rota}
                      </a>
                    ) : (
                      r.rota
                    )}
                    {!r.planejada &&
                      (r.rotaId ? (
                        <a
                          href={linkRota(r.rotaId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 text-[10px] text-[#1d5aa3] hover:underline"
                          title="Avulsa (fora da config): abrir a rota no monitoring"
                        >
                          {r.rotaId}
                        </a>
                      ) : (
                        <span className="ml-1.5 text-[10px] text-slate-400">avulsa</span>
                      ))}
                  </td>
                  <td className="py-1 pr-3">{r.transportadora || "—"}</td>
                  <td className="py-1 pr-3 tabular-nums">{horaDosMinutos(r.etaMin) || "—"}</td>
                  <td
                    className="py-1 pr-3 tabular-nums"
                    title={
                      r.chegada?.gatein
                        ? r.chegada.fonte === "bigquery"
                          ? "Gate-in do BigQuery (YMS)"
                          : "Chegou ao facility (histórico da rota no sistema)"
                        : undefined
                    }
                  >
                    {horaDosMinutos(r.gateinMin) ||
                      (r.chegadaSistemaMin != null ? (
                        <span
                          className="text-slate-400"
                          title="Chegada registrada no sistema, mas a rota é NS (fechada sem coletar ou NS do painel): fora da curva"
                        >
                          {horaDosMinutos(r.chegadaSistemaMin)}
                        </span>
                      ) : (
                        "—"
                      ))}
                  </td>
                  <td
                    className={
                      "py-1 pr-3 text-right tabular-nums " +
                      (r.atrasoMin !== null && r.atrasoMin > 30 ? "font-semibold text-[#94160e]" : "")
                    }
                  >
                    {r.atrasoMin === null ? "—" : (r.atrasoMin > 0 ? "+" : "") + int(r.atrasoMin) + " min"}
                  </td>
                  <td className="py-1 pr-3">
                    {r.situacao === "no CD" && pontualidade(r) ? (
                      <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + PONTUALIDADE[pontualidade(r)!]}>
                        {ROTULO_PONTUALIDADE[pontualidade(r)!]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 pr-3" title={detalheMotivo(r) || undefined}>
                    {r.diagnostico ? (
                      <span className="flex flex-wrap gap-1">
                        {r.diagnostico.motivos.map((m) => (
                          <span key={m} className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + MOTIVO[m]}>
                            {m}
                          </span>
                        ))}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 pr-3">{r.chegada?.doca || "—"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{r.chegada ? int(r.chegada.pacotes) : "—"}</td>
                  <td className="py-1">
                    <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + SITUACAO[r.situacao]}>{r.situacao}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
