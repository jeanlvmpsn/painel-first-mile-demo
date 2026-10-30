"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

import {
  JANELA_PROXIMAS_MIN,
  MINIMO_SOBRA,
  type PontoMapa,
  type RotaMapa,
  type TipoRotaMapa,
} from "../../lib/mapeamento";
import { STATUS_MAPA, type MarcaMapa, type StatusMapa } from "../../lib/mapeamentoStatus";

const linkRota = (id: string) => "/demo/rota/" + encodeURIComponent(id);
const int = (n: number) => Math.round(n).toLocaleString("pt-BR");

function SituacaoRota({ r }: { r: RotaMapa }) {
  const [rotulo, classe] = r.cancelada
    ? ["Cancelada", "bg-white text-[#94160e] ring-1 ring-[#f2b8b3]"]
    : r.passou
    ? ["Coletado", "bg-[#e6f6f0] text-[#0f6b4e]"]
    : r.proxima
      ? ["Próximas 2h", "bg-[#eef4ff] text-[#1e40af]"]
      : ["Depois", "bg-slate-100 text-slate-600"];
  return <span className={"whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold " + classe}>{rotulo}</span>;
}

const TIPO_ROTA: Record<TipoRotaMapa, { rotulo: string; classe: string; dica: string }> = {
  prog: { rotulo: "prog", classe: "border-slate-300 bg-white text-slate-600", dica: "Rota programada no ponto (planejado = sim)" },
  apoio: { rotulo: "apoio", classe: "border-[#c4b5fd] bg-[#f5f3ff] text-[#5b21b6]", dica: "Rota prestando apoio (planejado = não)" },
  avulsa: { rotulo: "avulsa", classe: "border-[#f3d19c] bg-[#fdf3e4] text-[#8a5210]", dica: "Rota avulsa (sem nome)" },
};

export const COR_STATUS_MAPA: Record<StatusMapa, string> = {
  "Risco alto": "border-[#f2b8b3] bg-[#fdeceb] text-[#94160e]",
  "Risco moderado": "border-[#f3d19c] bg-[#fdf3e4] text-[#8a5210]",
  "Risco de não preparados": "border-dashed border-[#a78bfa] bg-white text-[#5b21b6]",
  "Sem risco": "border-[#a7dcc6] bg-[#e6f6f0] text-[#0f6b4e]",
  Acompanhar: "border-[#bcd0f7] bg-[#eef4ff] text-[#1e40af]",
  "Sem reversão": "border-[#94160e] bg-[#94160e] text-white",
  Zerado: "border-[#0f6b4e] bg-[#0f6b4e] text-white",
  "Não preparados": "border-[#c4b5fd] bg-[#f5f3ff] text-[#5b21b6]",
};

function useStatusMapa(hojeBR: string) {
  const [marcas, setMarcas] = useState<Record<string, MarcaMapa>>({});
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/mapeamento-status?data=" + encodeURIComponent(hojeBR), { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro ?? "Falhou.");
      setMarcas(j.status);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [hojeBR]);
  useEffect(() => {
    const t0 = setTimeout(carregar, 0);
    const t = setInterval(carregar, 60 * 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [carregar]);
  const salvar = async (idParada: string, status: string, autor: string) => {
    try {
      const r = await fetch("/api/mapeamento-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: hojeBR, idParada, status, autor }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.erro ?? "Falhou.");
      setMarcas(j.status);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  return { marcas, erro, salvar };
}

type Coluna = "ponto" | "status" | "estimados" | "preparados" | "coletados" | "restante";
const NUMERICAS: Coluna[] = ["estimados", "preparados", "coletados", "restante"];

const restante = (p: PontoMapa) => Math.max(0, p.estimados - p.coletados);

export function VisaoMapeamento({
  pontos,
  agoraTexto,
  hojeBR,
  autor,
}: {
  pontos: PontoMapa[];
  agoraTexto: string;
  hojeBR: string;

  autor: string;
}) {
  const [filtroStatus, setFiltroStatus] = useState<StatusMapa | "sem" | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const [buscaId, setBuscaId] = useState("");

  const [ordem, setOrdem] = useState<{ col: Coluna; desc: boolean } | null>(null);
  const { marcas, erro, salvar } = useStatusMapa(hojeBR);
  const q = buscaId.replace(/\s+/g, "").toLowerCase();
  const doId = q ? pontos.filter((p) => p.id.toLowerCase().includes(q)) : pontos;
  const alternar = (id: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const valor = (p: PontoMapa, c: Coluna): number | string => {
    switch (c) {
      case "ponto":
        return p.nome.toLowerCase();
      case "status": {
        const m = marcas[p.id];
        return m ? STATUS_MAPA.indexOf(m.status) : STATUS_MAPA.length;
      }
      case "restante":
        return restante(p);
      default:
        return p[c];
    }
  };
  const statusDe = (p: PontoMapa): StatusMapa | "sem" => marcas[p.id]?.status ?? "sem";
  const filtrados = doId.filter((p) => !filtroStatus || statusDe(p) === filtroStatus);
  const vistos = !ordem
    ? filtrados
    : filtrados.slice().sort((a, b) => {
        const va = valor(a, ordem.col);
        const vb = valor(b, ordem.col);
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
        return (ordem.desc ? -cmp : cmp) || b.sobra - a.sobra;
      });
  const ordenar = (col: Coluna) =>
    setOrdem((o) => (o?.col === col ? { col, desc: !o.desc } : { col, desc: NUMERICAS.includes(col) }));
  const conta = (s: StatusMapa | "sem") => doId.filter((p) => statusDe(p) === s).length;
  const sobraTotal = vistos.reduce((s, p) => s + p.sobra, 0);
  const th = "whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "whitespace-nowrap px-3 py-2";

  const titulo = (col: Coluna, rotulo: string, direita = false) => (
    <th key={col} className={th + (direita ? " text-right" : "")}>
      <button
        type="button"
        onClick={() => ordenar(col)}
        className={"uppercase hover:text-slate-900 " + (ordem?.col === col ? "text-slate-900" : "")}
        title="Clique para ordenar"
      >
        {rotulo}
        <span className="ml-1">{ordem?.col === col ? (ordem.desc ? "↓" : "↑") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Mapeamento · riscos antes da coleta</h2>
          <p className="text-xs text-slate-500">
            Todo ponto com {MINIMO_SOBRA}+ pacotes restantes (estimado − coletado). Rotas das próximas {JANELA_PROXIMAS_MIN / 60}h
            levam no máximo o que está preparado; o que falta preparar sobra para a rota seguinte. Em risco: sobra de {MINIMO_SOBRA}+
            ou sem rota a passar (abra o ponto para ver o motivo); os sem risco pela regra vêm por último · {vistos.length}{" "}
            {vistos.length === 1 ? "ponto" : "pontos"} · {int(sobraTotal)} pcts em risco · {agoraTexto}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setFiltroStatus(null)}
            className={"rounded-full border px-3 py-1 font-semibold " + (!filtroStatus ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-500")}
          >
            Todos {doId.length}
          </button>
          <button
            type="button"
            onClick={() => setFiltroStatus(filtroStatus === "sem" ? null : "sem")}
            className={
              "rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-500" +
              (filtroStatus === "sem" ? " ring-2 ring-slate-900/30" : "")
            }
          >
            Sem status {conta("sem")}
          </button>

          {STATUS_MAPA.filter((s) => conta(s) > 0 || filtroStatus === s).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(filtroStatus === s ? null : s)}
              className={"rounded-full border px-3 py-1 font-semibold " + COR_STATUS_MAPA[s] + (filtroStatus === s ? " ring-2 ring-slate-900/30" : "")}
            >
              {s} {conta(s)}
            </button>
          ))}
          <input
            value={buscaId}
            onChange={(e) => setBuscaId(e.target.value)}
            placeholder="ID do seller / place"
            className="w-48 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
          />
        </div>
      </div>
      {!autor.trim() && (
        <p className="mt-2 text-[11px] text-[#8a5210]">Preencha &quot;Seu nome&quot; nos filtros para marcar o status dos pontos.</p>
      )}
      {erro && <p className="mt-2 text-[11px] text-[#94160e]">Status: {erro}</p>}

      {vistos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Nenhum ponto em risco{filtroStatus ? " com status " + (filtroStatus === "sem" ? "vazio" : filtroStatus) : ""}
          {q ? " com o ID " + buscaId.trim() : ""} nos filtros.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                {titulo("ponto", "Ponto")}
                {titulo("status", "Status")}
                {titulo("estimados", "Estimado", true)}
                {titulo("preparados", "Preparado", true)}
                {titulo("coletados", "Coletado", true)}
                {titulo("restante", "Restantes", true)}
              </tr>
            </thead>
            <tbody>
              {vistos.map((p) => {
                const aberto = abertos.has(p.id);
                const marca = marcas[p.id];
                return (
                  <Fragment key={p.id}>
                    <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => alternar(p.id)}>
                      <td className={td + " max-w-[340px]"}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="text-slate-400">{aberto ? "▾" : "▸"}</span>
                          <span className="min-w-0 truncate font-semibold text-slate-900" title={p.nome}>
                            {p.nome || "Ponto sem nome"}
                          </span>

                          <span
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            title="Clique para selecionar e copiar"
                            className="shrink-0 cursor-text select-all font-mono text-[10px] text-slate-400 hover:text-slate-700"
                          >
                            {p.id}
                          </span>
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600">{p.cluster}</span>
                        </span>
                      </td>
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={marca?.status ?? ""}
                          disabled={!autor.trim()}
                          onChange={(e) => salvar(p.id, e.target.value, autor.trim())}
                          title={marca ? "Marcado por " + (marca.autor || "—") + " em " + marca.registradoEm : "Marque o status do ponto"}
                          className={
                            "rounded-full border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-60 " +
                            (marca ? COR_STATUS_MAPA[marca.status] : "border-slate-200 bg-white text-slate-400")
                          }
                        >
                          <option value="">— marcar —</option>
                          {STATUS_MAPA.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={td + " text-right tabular-nums text-slate-700"}>{int(p.estimados)}</td>
                      <td className={td + " text-right tabular-nums text-slate-700"}>{int(p.preparados)}</td>
                      <td className={td + " text-right tabular-nums text-slate-700"}>{int(p.coletados)}</td>
                      <td
                        className={td + " text-right font-semibold tabular-nums text-[#94160e]"}
                        title={"Estimado − coletado · sobra projetada: " + int(p.sobra) + " pcts"}
                      >
                        {int(restante(p))}
                      </td>
                    </tr>
                    {aberto && (
                      <>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={6} className="px-3 py-2 pl-9 text-xs text-slate-700">
                            {p.motivo}
                            <span className="ml-2 text-[10px] text-slate-400">saldo da tela às {p.atualizadoEm.slice(11, 16) || "—"}</span>
                            <span className="ml-2 text-[10px] text-slate-400">
                              · rotas da tela {p.rotasConsultadasEm ? "às " + p.rotasConsultadasEm.slice(11, 16) : "ainda não consultadas"}
                            </span>
                            {marca && (
                              <span className="ml-2 text-[10px] text-slate-400">
                                · status por {marca.autor || "—"} às {marca.registradoEm.slice(11, 16)}
                              </span>
                            )}
                          </td>
                        </tr>
                        {p.rotas.map((r, i) => (
                          <tr key={p.id + "|" + r.chave + "|" + i} className={"border-b border-slate-100 text-xs " + (r.recebe ? "bg-[#fff8f7]" : "")}>
                            <td className={td + " max-w-[340px] pl-9"}>
                              <span className="flex min-w-0 items-center gap-1.5">
                                {r.tipo && (
                                  <span
                                    title={TIPO_ROTA[r.tipo].dica}
                                    className={"shrink-0 rounded border px-1 text-[10px] font-semibold " + TIPO_ROTA[r.tipo].classe}
                                  >
                                    {TIPO_ROTA[r.tipo].rotulo}
                                  </span>
                                )}
                                <span className="min-w-0 truncate">
                                  {r.rotaId ? (
                                    <a
                                      href={linkRota(r.rotaId)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                                    >
                                      {r.rota}
                                    </a>
                                  ) : (
                                    r.rota
                                  )}
                                  <span className="ml-1.5 text-[10px] text-slate-400">{r.transportadora}</span>
                                </span>
                                {r.recebe && (
                                  <span className="shrink-0 rounded border border-[#f2b8b3] bg-white px-1.5 text-[10px] font-semibold text-[#94160e]">
                                    recebe a sobra
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className={td + " text-slate-600"}>
                              <SituacaoRota r={r} />
                              <span className="ml-2">{r.janela || "—"}</span>
                            </td>
                            <td
                              className={td + " text-right tabular-nums text-slate-700"}
                              title="Pacotes que a rota já coletou hoje, somando todas as paradas dela (relatório de coleta)"
                            >
                              {!r.passou && !r.cancelada && (
                                <>
                                  <span className="mr-1 text-[10px] text-slate-400">já coletou</span>
                                  {int(r.coletadoNaRota)}
                                </>
                              )}
                            </td>
                            <td className={td + " text-slate-600"}>{r.veiculo || "—"}</td>
                            <td className={td + " text-right tabular-nums text-slate-700"} title="Coletado pela rota neste ponto">
                              {r.coletados === null ? <span className="text-slate-400">—</span> : int(r.coletados)}
                            </td>
                            <td
                              className={td + " max-w-[300px] truncate text-right text-[11px] text-[#8a5210]"}
                              title={r.outros.map((o) => o.nome + " (" + int(o.sobra) + ")").join(" · ")}
                            >
                              {r.outros.length > 0 &&
                                "+" + r.outros.length + (r.outros.length === 1 ? " ponto" : " pontos") + " em risco: " + r.outros.map((o) => o.nome || o.id).join(", ")}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
