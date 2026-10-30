"use client";

import { useMemo, useState } from "react";

import { RISCO_ANTES_COLETA_MIN, RISCO_PENDENTES_MIN, type RiscoMelione } from "../../lib/melioneEntregas";
import type { PontualidadeRota } from "../../lib/pontualidadeRotas";
import { BarraEntregas } from "./ChipRiscoMelione";

export type LinhaMelione = {
  rota: string;
  rotaId: string;
  transportadora: string;
  ns: boolean;
  pont: PontualidadeRota | null;

  risco: RiscoMelione | null;

  sacas: { feitas: number; total: number } | null;

  paradas: { feitas: number; total: number } | null;

  coleta: { estimados: number; pontos: number } | null;
};

type Status = "ns" | "v1" | "risco" | "semInicio" | "entregando" | "v1Logou" | "finalizado";
const ORDEM: Record<Status, number> = { ns: 0, v1: 1, risco: 2, semInicio: 3, entregando: 4, v1Logou: 5, finalizado: 6 };
const ESTILO: Record<Status, string> = {
  ns: "border-[#cf1f14] bg-[#cf1f14] text-white",
  v1: "border-[#cf1f14] bg-[#fdeceb] text-[#94160e]",
  risco: "border-[#ca7916] bg-[#fdf3e4] text-[#8a5210]",
  semInicio: "border-slate-300 bg-white text-slate-500",
  entregando: "border-[#93b4f5] bg-[#eef4ff] text-[#1e40af]",
  v1Logou: "border-slate-300 bg-slate-50 text-slate-600",
  finalizado: "border-[#1da578] bg-[#e6f6f0] text-[#0f6b4e]",
};

function statusDe(l: LinhaMelione): { s: Status; rotulo: string; dica: string } | null {
  const r = l.risco;
  if (l.ns || r?.nivel === "nsRota") return { s: "ns", rotulo: "NS MeliOne", dica: "Rota MeliOne NS pelo critério do painel: não saiu para a coleta." };
  if (!r) return null;
  const v1 =
    "MeliOne 1.0: a tela de entregas desta rota está zerada - entrega e coleta não ficaram atreladas. " +
    "O motorista termina as entregas em outra rota e precisa logar na coleta depois";
  if (r.nivel === "v1") return { s: "v1", rotulo: "MeliOne 1.0", dica: v1 + "; ainda não logou (risco alto)." };
  if (r.nivel === "v1Logou") return { s: "v1Logou", rotulo: "MeliOne 1.0", dica: v1 + "; já logou." };
  if (r.nivel === "concluidas") return { s: "finalizado", rotulo: "Finalizado", dica: "Entregas concluídas" };
  const rotulo = r.feitas === 0 ? "Sem início" : "Entregando";
  if (r.nivel === "risco") {
    return {
      s: "risco",
      rotulo,
      dica: r.texto + ". Risco: faltam " + RISCO_PENDENTES_MIN + "+ entregas a " + RISCO_ANTES_COLETA_MIN + " min (ou menos) do início planejado da coleta.",
    };
  }
  return { s: r.feitas === 0 ? "semInicio" : "entregando", rotulo, dica: r.texto + (r.nivel === "coletando" ? " · já coletando" : "") };
}

const comEntregas = (l: LinhaMelione) =>
  l.risco && l.risco.total > 0 && !l.ns && !["nsRota", "v1", "v1Logou"].includes(l.risco.nivel) ? l.risco : null;

type Coluna = "rota" | "transportadora" | "inicio" | "login" | "status" | "pacotes" | "sacas" | "paradas" | "evolucao" | "coleta";
const VALOR: Record<Coluna, (l: LinhaMelione) => string | number | null> = {
  rota: (l) => l.rota,
  transportadora: (l) => l.transportadora || null,
  inicio: (l) => l.pont?.inicioPlanejado || null,
  login: (l) => (l.ns ? "NS" : l.pont?.inicioRota || null),
  status: (l) => {
    const s = statusDe(l);
    return s ? ORDEM[s.s] : null;
  },
  pacotes: (l) => comEntregas(l)?.feitas ?? null,
  sacas: (l) => (l.sacas ? l.sacas.feitas : null),
  paradas: (l) => (l.paradas ? l.paradas.feitas : null),
  evolucao: (l) => {
    const r = comEntregas(l);
    return r ? r.feitas / r.total : null;
  },
  coleta: (l) => (l.coleta ? l.coleta.estimados : null),
};

const DO_MAIOR: Coluna[] = ["pacotes", "sacas", "paradas", "coleta"];
const COLUNAS: { k: Coluna; rotulo: string; dica?: string }[] = [
  { k: "rota", rotulo: "Rota" },
  { k: "transportadora", rotulo: "Transportadora" },
  { k: "inicio", rotulo: "Início plan." },
  { k: "login", rotulo: "Login coleta" },
  { k: "status", rotulo: "Status", dica: "Ordena pela gravidade: NS, MeliOne 1.0 sem login, risco, sem início, entregando, finalizado" },
  { k: "pacotes", rotulo: "Pct entreg.", dica: "Entregas feitas / total (pcts + sacas)" },
  { k: "sacas", rotulo: "Sacas", dica: "Sacas entregues / total. Saca é um saco com vários pcts, contado além dos pcts: rota com saca costuma andar mais rápido." },
  { k: "paradas", rotulo: "Paradas realizadas", dica: "Paradas de entrega feitas / total" },
  { k: "evolucao", rotulo: "Evolução entreg.", dica: "Ordena do menor progresso para o maior" },
  { k: "coleta", rotulo: "Estimado colet.", dica: "Estimado total da rota de coletas (FM) hoje" },
];

const linkColeta = (id: string) => "/demo/rota/" + encodeURIComponent(id);
const linkEntregas = (id: string) =>
  "/demo/rota/" + encodeURIComponent(id) + "?site=MLB";

function login(l: LinhaMelione) {
  if (l.ns) return <span className="font-semibold text-slate-500">NS</span>;
  const p = l.pont;
  if (!p) return <span className="text-slate-400">sem dado</span>;
  if (p.logou) return <span className={p.login === "loginAtrasado" ? "font-semibold text-[#8a5210]" : "text-slate-700"}>{p.inicioRota || "logou"}</span>;
  if (p.login === "semLogin") return <span className="font-semibold text-[#94160e]">sem login</span>;
  return <span className="text-slate-400">aguardando</span>;
}

function Fracao({ feitas, total, unidade }: { feitas: number; total: number; unidade: string }) {
  const completo = total > 0 && feitas >= total;
  return (
    <span
      title={feitas + " de " + total + " " + unidade}
      className={
        "whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold tabular-nums " +
        (completo ? "border-[#1da578] bg-[#e6f6f0] text-[#0f6b4e]" : "border-slate-300 bg-slate-50 text-slate-700")
      }
    >
      {feitas}/{total}
    </span>
  );
}

const vazio = <span className="text-slate-400">—</span>;

export default function QuadroMelione({
  linhas,
  titulo,
  fechado,
  alternar,
}: {
  linhas: LinhaMelione[];
  titulo: string;
  fechado: boolean;
  alternar: () => void;
}) {
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean } | null>(null);
  const ordenar = (k: Coluna) =>
    setOrdem((o) => (o?.coluna === k ? { coluna: k, desc: !o.desc } : { coluna: k, desc: DO_MAIOR.includes(k) }));
  const vistas = useMemo(() => {
    if (!ordem) return linhas;
    const f = VALOR[ordem.coluna];
    return [...linhas].sort((a, b) => {
      const x = f(a);
      const y = f(b);

      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
      return ordem.desc ? -c : c;
    });
  }, [linhas, ordem]);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">
            {titulo} <span className="font-semibold text-slate-500">({linhas.length})</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Todas as rotas da atribuição de hoje, com ou sem impacto · login na coleta, entregas (Last Mile) e o estimado da rota de coletas (FM)
          </p>
        </div>
        <button
          type="button"
          onClick={alternar}
          aria-expanded={!fechado}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm hover:text-slate-800"
        >
          {fechado ? "▸ Mostrar" : "▾ Minimizar"}
        </button>
      </div>
      {fechado ? null : linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nenhuma rota.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                {COLUNAS.map((c) => {
                  const ativa = ordem?.coluna === c.k;
                  return (
                    <th key={c.k} className="py-1.5 pr-2 align-bottom font-semibold">
                      <button
                        type="button"
                        onClick={() => ordenar(c.k)}
                        title={c.dica ?? "Ordenar"}
                        className={"text-left uppercase leading-tight hover:text-slate-900 " + (ativa ? "text-slate-900" : "")}
                      >
                        {c.rotulo}
                        <span className="ml-1 whitespace-nowrap text-[9px]">{ativa ? (ordem?.desc ? "▼" : "▲") : "↕"}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {vistas.map((l) => {
                const st = statusDe(l);
                const r = comEntregas(l);
                return (
                  <tr key={l.rota} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-2 font-medium text-slate-900">
                      {l.rotaId ? (
                        <a href={linkColeta(l.rotaId)} target="_blank" rel="noreferrer" className="text-blue-700 underline decoration-blue-300 underline-offset-2">
                          {l.rota}
                        </a>
                      ) : (
                        l.rota
                      )}
                      {l.rotaId && (
                        <a
                          href={linkEntregas(l.rotaId)}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1.5 rounded border border-[#0e7490] bg-[#ecfeff] px-1 text-[10px] font-semibold text-[#0e7490]"
                        >
                          entregas ↗
                        </a>
                      )}
                    </td>
                    <td className="max-w-[160px] truncate py-1.5 pr-2 text-slate-700" title={l.transportadora || undefined}>
                      {l.transportadora || vazio}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-slate-700">{l.pont?.inicioPlanejado || "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{login(l)}</td>
                    <td className="py-1.5 pr-2">
                      {st ? (
                        <span title={st.dica} className={"whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold " + ESTILO[st.s]}>
                          {st.rotulo}
                        </span>
                      ) : (
                        <span className="text-slate-400">Sem leitura</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2">{r ? <Fracao feitas={r.feitas} total={r.total} unidade="entregas (pcts + sacas)" /> : vazio}</td>
                    <td className="py-1.5 pr-2">{l.sacas && r ? <Fracao feitas={l.sacas.feitas} total={l.sacas.total} unidade="sacas" /> : vazio}</td>
                    <td className="py-1.5 pr-2">{l.paradas && r ? <Fracao feitas={l.paradas.feitas} total={l.paradas.total} unidade="paradas" /> : vazio}</td>
                    <td className="py-1.5 pr-2">{r ? <BarraEntregas r={r} /> : vazio}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-slate-700">
                      {l.coleta ? (
                        <span title={l.coleta.estimados + (l.coleta.estimados === 1 ? " pct estimado em " : " pcts estimados em ") + l.coleta.pontos + (l.coleta.pontos === 1 ? " ponto" : " pontos")}>
                          <span className="font-semibold text-slate-800">{l.coleta.estimados}</span>
                          <span className="ml-1 text-[10px] text-slate-400">
                            {l.coleta.pontos} {l.coleta.pontos === 1 ? "pt" : "pts"}
                          </span>
                        </span>
                      ) : (
                        vazio
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
