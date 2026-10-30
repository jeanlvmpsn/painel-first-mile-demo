"use client";

import { useMemo, useState } from "react";

import {
  problemasDa,
  ROTULO_PROBLEMA,
  ANTECEDENCIA_SEM_LOGIN_MIN,
  TOLERANCIA_LOGIN_MIN,
  type PontualidadeRota,
  type ProblemaPontualidade,
} from "../../lib/pontualidadeRotas";
import ChipRiscoExpress from "./ChipRiscoExpress";

const ORDEM: ProblemaPontualidade[] = ["semLogin", "primeiroAtrasado", "bipTarde", "coletaTarde", "loginAtrasado", "bipCedo", "coletaCedo"];

const COR: Record<ProblemaPontualidade, { barra: string; chip: string }> = {
  semLogin: { barra: "#cf1f14", chip: "bg-[#fdeceb] text-[#94160e]" },
  primeiroAtrasado: { barra: "#cf1f14", chip: "bg-[#fdeceb] text-[#94160e]" },
  bipTarde: { barra: "#cf1f14", chip: "bg-[#fdeceb] text-[#94160e]" },
  coletaTarde: { barra: "#cf1f14", chip: "bg-[#fdeceb] text-[#94160e]" },
  loginAtrasado: { barra: "#ca7916", chip: "bg-[#fdf3e4] text-[#8a5210]" },
  bipCedo: { barra: "#ca7916", chip: "bg-[#fdf3e4] text-[#8a5210]" },
  coletaCedo: { barra: "#ca7916", chip: "bg-[#fdf3e4] text-[#8a5210]" },
};

const DETALHE: Record<ProblemaPontualidade, string> = {
  semLogin: "não logou · desde " + ANTECEDENCIA_SEM_LOGIN_MIN + " min antes do início",
  loginAtrasado: "logou +" + TOLERANCIA_LOGIN_MIN + " min depois do planejado",
  primeiroAtrasado: "logou, sem coleta e a janela da 1ª parada já fechou",
  bipCedo: "primeira coleta antes da janela",
  bipTarde: "primeira coleta depois da janela",
  coletaCedo: "rotas com parada coletada cedo",
  coletaTarde: "rotas com parada coletada tarde",
};

const linkRota = (id: string) => "/demo/rota/" + encodeURIComponent(id);

const CHIP_PONT = {
  early: { rotulo: "Cedo", classe: "bg-[#fdf3e4] text-[#8a5210]" },
  late: { rotulo: "Tarde", classe: "bg-[#fdeceb] text-[#94160e]" },
  onTime: { rotulo: "No horário", classe: "bg-[#e6f6f0] text-[#0f6b4e]" },
} as const;

type Coluna = "rota" | "transportadora" | "inicio" | "login" | "bip" | "cedo" | "tarde" | "paradas" | "problemas";
type Linha = { r: PontualidadeRota; p: ProblemaPontualidade[] };

const VALOR: Record<Coluna, (l: Linha) => string | number | null> = {
  rota: ({ r }) => r.rota,
  transportadora: ({ r }) => r.transportadora || null,
  inicio: ({ r }) => r.inicioPlanejado || null,
  login: ({ r }) => r.atrasoLoginMin,
  bip: ({ r }) => r.primeiroBip?.hora || null,
  cedo: ({ r }) => r.paradas.cedo,
  tarde: ({ r }) => r.paradas.tarde,
  paradas: ({ r }) => r.paradas.total,
  problemas: ({ p }) => p.length,
};
const COMECA_DO_MAIOR: Coluna[] = ["login", "cedo", "tarde", "paradas", "problemas"];

const COLUNAS: { k: Coluna; rotulo: string; direita?: boolean; dica?: string }[] = [
  { k: "rota", rotulo: "Rota" },
  { k: "transportadora", rotulo: "Transportadora" },
  { k: "inicio", rotulo: "Início plan." },
  { k: "login", rotulo: "Login", dica: "Ordena pelo atraso do login (sem login há mais tempo primeiro)" },
  { k: "bip", rotulo: "1º bip" },
  { k: "cedo", rotulo: "Cedo", direita: true },
  { k: "tarde", rotulo: "Tarde", direita: true },
  { k: "paradas", rotulo: "Paradas", direita: true },
  { k: "problemas", rotulo: "Problemas" },
];

const horaDe = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const minTexto = (m: number) => (m >= 60 ? Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0") : m + " min");

export default function PainelPontualidade({ rotas, agoraTexto }: { rotas: PontualidadeRota[]; agoraTexto: string }) {
  const [filtro, setFiltro] = useState<ProblemaPontualidade | null>(null);
  const [todas, setTodas] = useState(false);

  const [ordem, setOrdem] = useState<{ coluna: Coluna; maiorPrimeiro: boolean } | null>(null);

  const clicar = (k: Coluna) => {
    const natural = COMECA_DO_MAIOR.includes(k);
    if (!ordem || ordem.coluna !== k) setOrdem({ coluna: k, maiorPrimeiro: natural });
    else if (ordem.maiorPrimeiro === natural) setOrdem({ coluna: k, maiorPrimeiro: !natural });
    else setOrdem(null);
  };

  const comProblemas = useMemo(() => rotas.map((r) => ({ r, p: problemasDa(r) })), [rotas]);
  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM.map((k) => [k, 0])) as Record<ProblemaPontualidade, number>;
    for (const { p } of comProblemas) for (const k of p) c[k]++;
    return c;
  }, [comProblemas]);
  const logadas = rotas.filter((r) => r.logou).length;

  const lista = useMemo(() => {
    const peso = (p: ProblemaPontualidade[]) => Math.min(...p.map((k) => ORDEM.indexOf(k)), ORDEM.length);
    const padrao = (a: Linha, b: Linha) =>
      peso(a.p) - peso(b.p) ||
      (b.r.atrasoLoginMin ?? 0) - (a.r.atrasoLoginMin ?? 0) ||
      b.r.paradas.tarde - a.r.paradas.tarde ||
      a.r.rota.localeCompare(b.r.rota, "pt-BR", { numeric: true });
    const porColuna = (a: Linha, b: Linha) => {
      if (!ordem) return 0;
      const va = VALOR[ordem.coluna](a);
      const vb = VALOR[ordem.coluna](b);
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      return ordem.maiorPrimeiro ? -c : c;
    };
    return comProblemas
      .filter(({ p }) => (filtro ? p.includes(filtro) : todas || p.length > 0))
      .sort((a, b) => porColuna(a, b) || padrao(a, b));
  }, [comProblemas, filtro, todas, ordem]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Pontualidade das rotas</h2>
          <p className="text-xs text-slate-500">
            {rotas.length} rotas hoje · {logadas} logadas · até {agoraTexto} · login pela lista de rotas do sistema, coletas pelo
            relatório de coleta · rotas NS ficam de fora
          </p>
        </div>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-xs">
          {([false, true] as const).map((t) => (
            <button
              key={String(t)}
              type="button"
              onClick={() => {
                setTodas(t);
                setFiltro(null);
              }}
              aria-pressed={todas === t && !filtro}
              className={"rounded-full px-3 py-1 font-semibold " + (todas === t && !filtro ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
            >
              {t ? "Todas as rotas" : "Só com problema"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {ORDEM.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFiltro(filtro === k ? null : k)}
            aria-pressed={filtro === k}
            className={
              "rounded-xl border bg-white px-3 py-2 text-left transition hover:border-slate-400 " +
              (filtro === k ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200")
            }
          >
            <span className="mb-1 block h-1 w-8 rounded-full" style={{ backgroundColor: COR[k].barra }} />
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{ROTULO_PROBLEMA[k]}</span>
            <span className="block text-2xl font-bold tabular-nums text-slate-900">{contagem[k]}</span>
            <span className="block text-[11px] leading-tight text-slate-500">{DETALHE[k]}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              {COLUNAS.map((c) => {
                const ativa = ordem?.coluna === c.k;
                return (
                  <th
                    key={c.k}
                    aria-sort={ativa ? (ordem.maiorPrimeiro === COMECA_DO_MAIOR.includes(c.k) ? "descending" : "ascending") : "none"}
                    className={"py-1.5 pr-3 font-semibold " + (c.direita ? "text-right" : "")}
                  >
                    <button
                      type="button"
                      onClick={() => clicar(c.k)}
                      title={c.dica ?? "Clique para ordenar (3º clique volta à ordem padrão)"}
                      className={"inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-slate-900 " + (ativa ? "text-slate-900" : "")}
                    >
                      {c.rotulo}
                      <span className={ativa ? "text-slate-900" : "text-slate-300"}>
                        {ativa ? (ordem.maiorPrimeiro ? "▼" : "▲") : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lista.map(({ r, p }) => (
              <tr key={r.chave} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-3 font-medium text-slate-900">
                  {r.rotaId ? (
                    <a href={linkRota(r.rotaId)} target="_blank" rel="noreferrer" className="text-blue-700 underline decoration-blue-300 underline-offset-2">
                      {r.rota}
                    </a>
                  ) : (
                    r.rota
                  )}
                  <span className="ml-1.5 rounded border border-slate-200 px-1 text-[10px] text-slate-500">{r.cluster}</span>
                  {r.express &&
                    (r.rotaId ? (
                      <a
                        href={"/demo/rota/" + encodeURIComponent(r.rotaId) + "?site=MLB"}
                        target="_blank"
                        rel="noreferrer"
                        title="Rota Express: faz as entregas antes das coletas. Abre o monitoramento das entregas."
                        className="ml-1.5 rounded border border-[#0e7490] bg-[#ecfeff] px-1 text-[10px] font-semibold text-[#0e7490]"
                      >
                        Express · entregas ↗
                      </a>
                    ) : (
                      <span className="ml-1.5 rounded border border-[#0e7490] bg-[#ecfeff] px-1 text-[10px] font-semibold text-[#0e7490]">Express</span>
                    ))}
                  {r.express && r.entregas && (
                    <span className="ml-1.5 inline-block">
                      <ChipRiscoExpress r={r.entregas} />
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-slate-600">{r.transportadora || "—"}</td>
                <td className="py-1.5 pr-3 tabular-nums text-slate-700">{r.inicioPlanejado || "—"}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {r.login === "semLogin" ? (
                    (r.atrasoLoginMin ?? 0) < 0 ? (
                      <span className="font-semibold text-[#8a5210]">sem login · começa em {minTexto(-(r.atrasoLoginMin ?? 0))}</span>
                    ) : (
                      <span className="font-semibold text-[#94160e]">sem login há {minTexto(r.atrasoLoginMin ?? 0)}</span>
                    )
                  ) : r.logou ? (
                    <span className={r.login === "loginAtrasado" ? "font-semibold text-[#8a5210]" : "text-slate-700"}>
                      {r.inicioRota || "logou"}
                      {r.login === "loginAtrasado" && r.atrasoLoginMin !== null ? " (+" + minTexto(r.atrasoLoginMin) + ")" : ""}
                    </span>
                  ) : (
                    <span className="text-slate-400">aguardando</span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  {r.primeiroBip ? (
                    <span title={r.primeiroBip.parada} className="inline-flex items-center gap-1.5 tabular-nums text-slate-700">
                      {r.primeiroBip.hora}
                      {r.primeiroBip.pontualidade && (
                        <span className={"rounded px-1.5 text-[10px] font-semibold " + CHIP_PONT[r.primeiroBip.pontualidade].classe}>
                          {CHIP_PONT[r.primeiroBip.pontualidade].rotulo}
                        </span>
                      )}
                    </span>
                  ) : r.primeiroAtrasado && r.primeiraJanela ? (
                    <span
                      title={"1ª parada: " + r.primeiraJanela.parada + " · janela " + r.primeiraJanela.texto}
                      className="font-semibold text-[#94160e]"
                    >
                      atrasado · janela até {horaDe(r.primeiraJanela.fimMin)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className={"py-1.5 pr-3 text-right tabular-nums " + (r.paradas.cedo ? "font-semibold text-[#8a5210]" : "text-slate-400")}>
                  {r.paradas.cedo}
                </td>
                <td className={"py-1.5 pr-3 text-right tabular-nums " + (r.paradas.tarde ? "font-semibold text-[#94160e]" : "text-slate-400")}>
                  {r.paradas.tarde}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{r.paradas.total}</td>
                <td className="py-1.5">
                  <span className="flex flex-wrap gap-1">
                    {p.map((k) => (
                      <span key={k} className={"rounded px-1.5 text-[10px] font-semibold " + COR[k].chip}>
                        {ROTULO_PROBLEMA[k]}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
            {!lista.length && (
              <tr>
                <td colSpan={9} className="py-4 text-center text-slate-500">
                  {filtro ? "Nenhuma rota com " + ROTULO_PROBLEMA[filtro].toLowerCase() + " no filtro." : "Nenhuma rota com problema de pontualidade no filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
