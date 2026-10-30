"use client";

import { useMemo, useState } from "react";

import {
  agruparAdesao,
  periodosDisponiveis,
  transportadorasDaSerie,
  type Escala,
  type Periodo,
  type PontoAdesao,
  type Serie,
} from "../../lib/adesao";
import { apelidarTransportadora } from "../../lib/dashboardUtils";

const CORES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

const MAX_SERIES = 4;

const COR_GRADE = "#e1e0d9";
const COR_EIXO = "#898781";

const L = 920;
const A = 300;
const M = { topo: 14, direita: 128, baixo: 32, esquerda: 46 };

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
];

const ESCALAS: { valor: Escala; rotulo: string }[] = [
  { valor: "percentual", rotulo: "%" },
  { valor: "bruto", rotulo: "Rotas" },
];

const num = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));

function botao(ativo: boolean): string {
  return (
    "rounded px-2.5 py-1 text-xs font-medium transition " +
    (ativo
      ? "bg-gray-900 text-white"
      : "bg-white text-gray-600 ring-1 ring-gray-200 hover:text-gray-900")
  );
}

function chip(ativo: boolean, desabilitado = false): string {
  return (
    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition " +
    (ativo
      ? "border-gray-300 bg-gray-50 font-medium text-gray-800"
      : "border-gray-200 text-gray-500 hover:text-gray-800") +
    (desabilitado ? " cursor-not-allowed opacity-40" : "")
  );
}

function chipRecorte(ativo: boolean): string {
  return (
    "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
    (ativo
      ? "border-gray-900 bg-gray-900 text-white"
      : "border-gray-200 bg-white text-gray-600 hover:text-gray-900")
  );
}

export default function GraficoAdesao({ pontos }: { pontos: PontoAdesao[] }) {
  const disponiveis = useMemo(() => transportadorasDaSerie(pontos), [pontos]);
  const [periodo, setPeriodo] = useState<Periodo>("dia");
  const [escala, setEscala] = useState<Escala>("percentual");

  const [escolhidas, setEscolhidas] = useState<string[]>(() =>
    disponiveis.slice(0, 1),
  );

  const [recortes, setRecortes] = useState<Record<Periodo, string[]>>({
    dia: [],
    semana: [],
    mes: [],
  });
  const [ativo, setAtivo] = useState<number | null>(null);

  const disponiveisPeriodo = useMemo(
    () => periodosDisponiveis(pontos, periodo),
    [pontos, periodo],
  );

  const dados = useMemo(
    () =>
      agruparAdesao(pontos, {
        periodo,
        escala,
        transportadoras: escolhidas,
        periodos: recortes[periodo],
      }),
    [pontos, periodo, escala, escolhidas, recortes],
  );

  if (pontos.length === 0) return null;

  const n = dados.eixo.length;
  const larguraPlot = L - M.esquerda - M.direita;
  const alturaPlot = A - M.topo - M.baixo;

  const mostrarTotal = escala === "bruto";

  const teto =
    escala === "percentual"
      ? 100
      : Math.max(
          10,
          ...dados.series.flatMap((s) =>
            [...s.valores, ...s.base].map((v) => v ?? 0),
          ),
        );

  const x = (i: number) =>
    M.esquerda + (n <= 1 ? larguraPlot / 2 : (i * larguraPlot) / (n - 1));
  const y = (v: number) => M.topo + alturaPlot - (v / teto) * alturaPlot;

  const caminho = (valores: (number | null)[]) => {
    let d = "";
    let abrindo = true;
    valores.forEach((v, i) => {
      if (v === null) {
        abrindo = true;
        return;
      }
      d += (abrindo ? "M" : "L") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " ";
      abrindo = false;
    });
    return d.trim();
  };

  const fmt = (v: number | null) =>
    v === null ? "—" : escala === "percentual" ? Math.round(v) + "%" : num(v);

  const fracao = (s: Serie, i: number) => {
    const b = s.base[i];
    const c = s.concluidas[i];
    if (b === null || c === null) return "não rodou";
    return num(c) + " de " + num(b);
  };

  const marcas =
    escala === "percentual" ? [0, 25, 50, 75, 100] : [0, teto / 2, teto];

  const ultimoPonto = (valores: (number | null)[]) => {
    for (let i = valores.length - 1; i >= 0; i--) {
      if (valores[i] !== null) return i;
    }
    return -1;
  };

  const alternarTp = (nome: string) =>
    setEscolhidas((atual) =>
      atual.includes(nome)
        ? atual.filter((t) => t !== nome)
        : atual.length >= MAX_SERIES
          ? atual
          : [...atual, nome],
    );

  const alternarPeriodo = (chave: string) =>
    setRecortes((atual) => {
      const lista = atual[periodo];
      return {
        ...atual,
        [periodo]: lista.includes(chave)
          ? lista.filter((c) => c !== chave)
          : [...lista, chave],
      };
    });

  const passo = n > 1 ? larguraPlot / (n - 1) : larguraPlot;
  const rotuloCada = Math.ceil(n / 14) || 1;
  const selecionados = recortes[periodo];

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700">
            Adesão ao Forms ao longo do tempo
          </h3>
          <p className="text-xs text-gray-500">
            Rotas que preencheram, sobre as rotas da própria transportadora.
            Rota NS fica de fora da base.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => {
                setPeriodo(p.valor);
                setAtivo(null);
              }}
              className={botao(periodo === p.valor)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {ESCALAS.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => setEscala(e.valor)}
              className={botao(escala === e.valor)}
            >
              {e.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-gray-500">
          {periodo === "dia"
            ? "Dias:"
            : periodo === "semana"
              ? "Semanas:"
              : "Meses:"}
        </span>
        {disponiveisPeriodo.map((p) => (
          <button
            key={p.chave}
            type="button"
            onClick={() => alternarPeriodo(p.chave)}
            className={chipRecorte(selecionados.includes(p.chave))}
          >
            {p.rotulo}
          </button>
        ))}
        {selecionados.length > 0 && (
          <button
            type="button"
            onClick={() => setRecortes((atual) => ({ ...atual, [periodo]: [] }))}
            className="ml-1 text-xs text-gray-500 underline hover:text-gray-800"
          >
            todos
          </button>
        )}
      </div>

      {n === 0 || escolhidas.length === 0 ? (
        <p className="py-16 text-center text-sm text-gray-400">
          {escolhidas.length === 0
            ? "Escolha ao menos uma transportadora abaixo."
            : "Nenhum período selecionado."}
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${L} ${A}`}
          className="w-full"
          role="img"
          aria-label="Evolução da adesão ao Forms"
        >
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={M.esquerda}
                x2={L - M.direita}
                y1={y(m)}
                y2={y(m)}
                stroke={COR_GRADE}
                strokeWidth={1}
              />
              <text
                x={M.esquerda - 8}
                y={y(m) + 4}
                textAnchor="end"
                fontSize={11}
                fill={COR_EIXO}
              >
                {escala === "percentual" ? m + "%" : num(m)}
              </text>
            </g>
          ))}

          {dados.eixo.map((e, i) =>
            i % rotuloCada === 0 ? (
              <text
                key={e.chave}
                x={x(i)}
                y={A - M.baixo + 16}
                textAnchor="middle"
                fontSize={11}
                fill={COR_EIXO}
              >
                {e.rotulo}
              </text>
            ) : null,
          )}

          {mostrarTotal &&
            dados.series.map((s, idx) => {
              const cor = CORES[idx % CORES.length];
              const fim = ultimoPonto(s.base);
              return (
                <g key={s.nome + "-total"}>
                  <path
                    d={caminho(s.base)}
                    fill="none"
                    stroke={cor}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    opacity={0.55}
                  />
                  {fim >= 0 && (
                    <text
                      x={x(fim) + 8}
                      y={y(s.base[fim]!) + 4}
                      fontSize={10}
                      fill={COR_EIXO}
                    >
                      total
                    </text>
                  )}
                </g>
              );
            })}

          {dados.series.map((s, idx) => {
            const cor = CORES[idx % CORES.length];
            const fim = ultimoPonto(s.valores);
            return (
              <g key={s.nome}>
                <path
                  d={caminho(s.valores)}
                  fill="none"
                  stroke={cor}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {s.valores.map((v, i) =>
                  v === null ||
                  (i > 0 && s.valores[i - 1] !== null) ||
                  (i < n - 1 && s.valores[i + 1] !== null) ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={cor} />
                  ),
                )}
                {fim >= 0 && (
                  <text
                    x={x(fim) + 8}
                    y={y(s.valores[fim]!) + 4}
                    fontSize={11}
                    fill="#52514e"
                  >
                    {apelidarTransportadora(s.nome)}
                  </text>
                )}
              </g>
            );
          })}

          {ativo !== null && (
            <g>
              <line
                x1={x(ativo)}
                x2={x(ativo)}
                y1={M.topo}
                y2={A - M.baixo}
                stroke={COR_EIXO}
                strokeWidth={1}
              />
              {dados.series.map((s, idx) =>
                s.valores[ativo] === null ? null : (
                  <circle
                    key={s.nome}
                    cx={x(ativo)}
                    cy={y(s.valores[ativo]!)}
                    r={4}
                    fill={CORES[idx % CORES.length]}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          )}

          {dados.eixo.map((e, i) => (
            <rect
              key={e.chave}
              x={x(i) - passo / 2}
              y={M.topo}
              width={passo}
              height={alturaPlot}
              fill="transparent"
              onMouseEnter={() => setAtivo(i)}
              onMouseLeave={() => setAtivo(null)}
            />
          ))}
        </svg>
      )}

      <div className="mt-1 min-h-[2.5rem] text-xs">
        {ativo === null ? (
          <p className="text-gray-400">
            Passe o mouse no gráfico para ver os valores do período.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="font-medium text-gray-700">
              {dados.eixo[ativo].rotulo}
            </span>
            {dados.series.map((s, idx) => (
              <span
                key={s.nome}
                className="flex items-center gap-1.5 text-gray-600"
              >
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: CORES[idx % CORES.length] }}
                />
                {apelidarTransportadora(s.nome)}{" "}
                {escala === "percentual" ? (
                  <>
                    <strong>{fmt(s.valores[ativo])}</strong>
                    <span className="text-gray-400">
                      ({fracao(s, ativo)})
                    </span>
                  </>
                ) : (
                  <strong>{fracao(s, ativo)}</strong>
                )}
              </span>
            ))}
            <span className="text-gray-400">
              toda a base: {num(dados.rotasNoPeriodo[ativo])} rotas
            </span>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
        <span className="mr-1 text-xs text-gray-500">Transportadoras:</span>
        {disponiveis.map((nome) => {
          const i = escolhidas.indexOf(nome);
          const cheio = i < 0 && escolhidas.length >= MAX_SERIES;
          return (
            <button
              key={nome}
              type="button"
              onClick={() => alternarTp(nome)}
              disabled={cheio}
              title={cheio ? "Máximo de " + MAX_SERIES + " por vez" : nome}
              className={chip(i >= 0, cheio)}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{
                  backgroundColor: i >= 0 ? CORES[i % CORES.length] : "#d4d4d4",
                }}
              />
              {apelidarTransportadora(nome)}
            </button>
          );
        })}
        {escolhidas.length > 0 && (
          <button
            type="button"
            onClick={() => setEscolhidas([])}
            className="ml-1 text-xs text-gray-500 underline hover:text-gray-800"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  );
}
