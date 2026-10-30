"use client";

import { useMemo, useState } from "react";

import {
  carrosDaDedicada,
  mediaPorCarro,
  serieDosPontos,
  tituloDaDedicada,
  type CarroDia,
  type DiaDedicada,
  type DiaHistorico,
  type LinhaBaseDedicada,
} from "../../lib/dedicadas";

const int = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number | null) => (n === null ? "—" : (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");

const COR_COLETADOS = "#2563eb";
const COR_NAO_COLETADOS = "#cf1f14";
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const rotuloDia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

const rotaCurta = (rota: string) => rota.replace(/^(CPS|CAMPINAS)_+/i, "");

function CarrosDoDia({ carros, hoje }: { carros: CarroDia[] | null; hoje: boolean }) {
  if (!carros?.length) {
    return <p className="mt-1 border-t border-slate-100 pt-1 text-slate-400">Carros: sem registro neste dia</p>;
  }
  const passaram = carros.filter((c) => c.passou).length;
  return (
    <div className="mt-1 border-t border-slate-100 pt-1">
      <p className="mb-0.5 font-semibold text-slate-900">
        {passaram} {passaram === 1 ? "carro" : "carros"}
        {hoje && carros.length > passaram ? " · " + (carros.length - passaram) + " a passar" : ""}
      </p>
      {carros.map((c) => (
        <p key={c.rotaId || c.rota} className="flex justify-between gap-2">
          <span className="min-w-0 truncate text-slate-600" title={c.rota + (c.janela ? " · " + c.janela : "")}>
            {rotaCurta(c.rota)}
            {c.janela ? " · " + c.janela.replace(/^início /, "").replace(/\s*hs$/i, "") : ""}
            {!c.ded ? " · apoio" : ""}
          </span>
          <b className={"shrink-0 tabular-nums " + (c.passou ? "" : "font-normal text-slate-400")}>{c.passou ? int(c.coletados) : "a passar"}</b>
        </p>
      ))}
    </div>
  );
}
const diaDaSemana = (iso: string) => SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()];

function teto(max: number): number {
  if (max <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max) ?? 10 * p;
}

export default function GraficoDedicada({
  dataBR,
  dias,
  base,
  historico,
}: {
  dataBR: string;
  dias: DiaDedicada[];
  base: LinhaBaseDedicada[];
  historico: Record<string, DiaHistorico[]>;
}) {
  const [busca, setBusca] = useState("");

  const [cluster, setCluster] = useState("");
  const [dedEscolhida, setDedEscolhida] = useState("");
  const [foco, setFoco] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);

  const conhecidos = useMemo(() => {
    const ids = new Set<string>(base.map((l) => l.ponto));
    const dedDoId = new Map<string, DiaDedicada>();
    for (const d of dias)
      for (const p of d.pontos) {
        ids.add(p.id);
        if (!dedDoId.has(p.id)) dedDoId.set(p.id, d);
      }
    for (const hs of Object.values(historico)) for (const h of hs) for (const id of h.ids) ids.add(id);
    return { ids: [...ids], dedDoId };
  }, [base, dias, historico]);

  const ordenadas = useMemo(
    () =>
      dias
        .filter((d) => d.pontos.length)
        .slice()
        .sort((a, b) => a.cluster.localeCompare(b.cluster, "pt-BR", { numeric: true }) || tituloDaDedicada(a).localeCompare(tituloDaDedicada(b), "pt-BR")),
    [dias],
  );
  const clusters = useMemo(() => [...new Set(ordenadas.map((d) => d.cluster).filter(Boolean))], [ordenadas]);
  const dedsDoCluster = useMemo(() => ordenadas.filter((d) => !cluster || d.cluster === cluster), [ordenadas, cluster]);
  const dedAtual = dedsDoCluster.find((d) => d.chave === dedEscolhida) ?? dedsDoCluster[0];

  const escolha = useMemo(() => {
    if (!busca.trim()) {
      return { ids: dedAtual ? dedAtual.pontos.map((p) => p.id).sort() : [], deds: dedAtual ? [dedAtual] : [], naoAchados: [] as string[] };
    }
    const tokens = busca
      .split(/[\s,;|]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    const achados = new Set<string>();
    const naoAchados: string[] = [];
    for (const t of tokens) {
      const exato = conhecidos.ids.find((id) => id.toUpperCase() === t);
      const parecidos = exato ? [exato] : t.length >= 4 ? conhecidos.ids.filter((id) => id.toUpperCase().includes(t)) : [];
      if (!parecidos.length) naoAchados.push(t);
      parecidos.forEach((id) => achados.add(id));
    }
    const ids = new Set(achados);
    const deds = new Set<DiaDedicada>();
    for (const id of achados) {
      const d = conhecidos.dedDoId.get(id);
      if (!d) continue;
      deds.add(d);
      d.pontos.forEach((p) => ids.add(p.id));
    }
    return { ids: [...ids].sort(), deds: [...deds], naoAchados };
  }, [busca, conhecidos, dedAtual]);

  const serie = useMemo(() => {
    if (!escolha.ids.length) return [];
    const porPonto: Record<string, { estimados: number; coletados: number }> = {};
    for (const d of dias)
      for (const p of d.pontos)
        if (!porPonto[p.id] || p.estimados > porPonto[p.id].estimados) porPonto[p.id] = { estimados: p.estimados, coletados: p.coletados };
    const alvo = new Set(escolha.ids);
    const dedsHoje = dias.filter((d) => d.status !== "semRota" && d.pontos.some((p) => alvo.has(p.id)));
    const rotasHoje = dedsHoje.map((d) => d.nome).filter(Boolean);
    const carrosHoje = dedsHoje.flatMap(carrosDaDedicada);
    return serieDosPontos(escolha.ids, base, Object.values(historico).flat(), { dataBR, porPonto, rotas: rotasHoje, carros: carrosHoje });
  }, [escolha, dias, base, historico, dataBR]);

  const resumo = useMemo(() => {
    const fechados = serie.filter((d) => d.fonte !== "hoje");
    const est = fechados.reduce((s, d) => s + d.estimados, 0);
    const col = fechados.reduce((s, d) => s + d.coletados, 0);
    return {
      dias: fechados.length,
      media: fechados.length ? Math.round(col / fechados.length) : 0,
      pu: est ? col / est : null,
      comPerda: fechados.filter((d) => d.naoColetados > 0).length,
      porCarro: mediaPorCarro(serie),
    };
  }, [serie]);

  const max = teto(Math.max(0, ...serie.map((d) => d.estimados)));
  const grade = [0, 0.25, 0.5, 0.75, 1];
  const passo = serie.length > 16 ? Math.ceil(serie.length / 12) : 1;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Histórico de coleta por DED</h2>
          <p className="text-xs text-slate-500">
            Pacotes por dia nos pontos da DED (pelos IDs: o nome da rota muda e a série continua) · base oficial do PU, últimos 30
            dias, e o dia de hoje ao vivo
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Cluster</span>
          <select
            value={cluster}
            onChange={(e) => {
              setCluster(e.target.value);
              setDedEscolhida("");
              setBusca("");
              setFoco(null);
            }}
            className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {clusters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">DED</span>
          <select
            value={dedAtual?.chave ?? ""}
            onChange={(e) => {
              setDedEscolhida(e.target.value);
              setBusca("");
              setFoco(null);
            }}
            className="w-72 max-w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {dedsDoCluster.map((d) => (
              <option key={d.chave} value={d.chave}>
                {(cluster ? "" : (d.cluster || "—") + " · ") + tituloDaDedicada(d)}
              </option>
            ))}
            {!dedsDoCluster.length && <option value="">Nenhuma dedicada</option>}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">ou ID do ponto</span>
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setFoco(null);
            }}
            placeholder="BRP…, 849817033_…"
            aria-label="Buscar pelo ID do ponto"
            className="w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      {!escolha.ids.length && !busca.trim() ? (
        <p className="py-6 text-center text-sm text-slate-500">Nenhuma dedicada para mostrar.</p>
      ) : !escolha.ids.length ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Nenhum ponto de dedicada com esse ID ({escolha.naoAchados.join(", ")}). O histórico cobre os pontos das dedicadas (aba
          HIST_DEDICADAS_30D).
        </p>
      ) : !serie.length ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Sem histórico para esses pontos ainda. O histórico vem da planilha de processos; o painel também grava cada dia às
          23h.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-500">
            {escolha.ids.length} {escolha.ids.length === 1 ? "ponto" : "pontos"}:{" "}
            <span className="font-mono text-slate-700">{escolha.ids.join(" · ")}</span>
            {escolha.deds.length ? " · dedicada " + escolha.deds.map((d) => tituloDaDedicada(d)).join(", ") : ""}
            {escolha.naoAchados.length ? " · não achei: " + escolha.naoAchados.join(", ") : ""}
          </p>
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <span>
              Média <b className="tabular-nums text-slate-900">{int(resumo.media)}</b> pcts coletados/dia
            </span>
            <span>
              PU no período <b className="tabular-nums text-slate-900">{pct(resumo.pu)}</b>
            </span>
            <span>
              Perdeu pacote em <b className="tabular-nums text-slate-900">{resumo.comPerda}</b> de {resumo.dias} dias
            </span>
            <span
              title={
                resumo.porCarro
                  ? "Média do que cada rota DED coletou nos pontos, em " + resumo.porCarro.carros + " viagens de " + resumo.porCarro.dias + " dias com os carros gravados"
                  : "Quanto cada carro coletou é gravado às 23h a partir de 22/10; a média aparece depois do primeiro dia gravado"
              }
            >
              1 carro coleta em média{" "}
              {resumo.porCarro ? (
                <>
                  <b className="tabular-nums text-slate-900">{int(resumo.porCarro.media)}</b> pcts
                  <span className="text-xs text-slate-400">
                    {" "}
                    ({resumo.porCarro.carros} {resumo.porCarro.carros === 1 ? "viagem" : "viagens"})
                  </span>
                </>
              ) : (
                <span className="text-slate-400">— (começa a contar no registro das 23h)</span>
              )}
            </span>
          </div>

          <div className="mb-4 flex items-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_COLETADOS }} /> Coletados
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_NAO_COLETADOS }} /> Não coletados
            </span>
            <button type="button" onClick={() => setTabela(!tabela)} className="ml-auto text-blue-700 hover:underline">
              {tabela ? "ver gráfico" : "ver tabela"}
            </button>
          </div>

          {tabela ? (
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-semibold">Dia</th>
                    <th className="py-1 pr-3 font-semibold">Rota</th>
                    <th className="py-1 pr-3 text-right font-semibold">Estimados</th>
                    <th className="py-1 pr-3 text-right font-semibold">Coletados</th>
                    <th className="py-1 pr-3 text-right font-semibold">Não coletados</th>
                    <th className="py-1 text-right font-semibold">PU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {serie
                    .slice()
                    .reverse()
                    .map((d) => (
                      <tr key={d.dia}>
                        <td className="py-1 pr-3">
                          {rotuloDia(d.dia)} {diaDaSemana(d.dia)}
                          {d.fonte === "hoje" ? " (hoje)" : ""}
                        </td>
                        <td className="py-1 pr-3 text-slate-600">{d.rota || "—"}</td>
                        <td className="py-1 pr-3 text-right">{int(d.estimados)}</td>
                        <td className="py-1 pr-3 text-right">{int(d.coletados)}</td>
                        <td className="py-1 pr-3 text-right">{int(d.naoColetados)}</td>
                        <td className="py-1 text-right">{pct(d.estimados ? d.coletados / d.estimados : null)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex gap-2">

              <div className="relative h-56 w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-400">
                {grade.map((g) => (
                  <span key={g} className="absolute right-0 translate-y-1/2" style={{ bottom: g * 100 + "%" }}>
                    {int(Math.round(max * g))}
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="relative h-56" onMouseLeave={() => setFoco(null)}>
                  {grade.map((g) => (
                    <div key={g} className="absolute inset-x-0 border-t border-slate-100" style={{ bottom: g * 100 + "%" }} />
                  ))}
                  <div className="absolute inset-0 flex items-end gap-[3px]">
                    {serie.map((d, i) => {
                      const hCol = (d.coletados / max) * 100;
                      const hNc = (d.naoColetados / max) * 100;
                      return (
                        <div
                          key={d.dia}
                          className="relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end"
                          onMouseEnter={() => setFoco(i)}
                          onFocus={() => setFoco(i)}
                          tabIndex={0}
                          aria-label={rotuloDia(d.dia) + ": " + d.coletados + " coletados de " + d.estimados}
                          style={{ opacity: foco === null || foco === i ? 1 : 0.45 }}
                        >
                          {d.naoColetados > 0 && (
                            <div
                              className="mx-auto w-full max-w-[28px] rounded-t-[4px]"
                              style={{ height: hNc + "%", background: COR_NAO_COLETADOS, marginBottom: d.coletados > 0 ? 2 : 0 }}
                            />
                          )}
                          {d.coletados > 0 && (
                            <div
                              className={"mx-auto w-full max-w-[28px] " + (d.naoColetados > 0 ? "" : "rounded-t-[4px]")}
                              style={{
                                height: hCol + "%",
                                background: COR_COLETADOS,
                                backgroundImage:
                                  d.fonte === "hoje" ? "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 3px, transparent 3px 7px)" : undefined,
                              }}
                            />
                          )}
                          {foco === i && (
                            <div
                              className={
                                "pointer-events-none absolute bottom-full z-10 mb-2 w-64 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700 shadow-lg " +
                                (i > serie.length / 2 ? "right-0" : "left-0")
                              }
                            >
                              <p className="font-semibold text-slate-900">
                                {rotuloDia(d.dia)} · {diaDaSemana(d.dia)}
                                {d.fonte === "hoje" ? " · hoje (parcial)" : ""}
                              </p>
                              <p className="mb-1 text-slate-500">{d.rota || "rota do dia não gravada"}</p>
                              <p className="flex justify-between">
                                <span>Estimados</span>
                                <b className="tabular-nums">{int(d.estimados)}</b>
                              </p>
                              <p className="flex justify-between">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-sm" style={{ background: COR_COLETADOS }} />
                                  Coletados
                                </span>
                                <b className="tabular-nums">{int(d.coletados)}</b>
                              </p>
                              <p className="flex justify-between">
                                <span className="flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-sm" style={{ background: COR_NAO_COLETADOS }} />
                                  Não coletados
                                </span>
                                <b className="tabular-nums">{int(d.naoColetados)}</b>
                              </p>
                              <p className="mt-1 flex justify-between border-t border-slate-100 pt-1">
                                <span>PU</span>
                                <b className="tabular-nums">{pct(d.estimados ? d.coletados / d.estimados : null)}</b>
                              </p>
                              <CarrosDoDia carros={d.carros} hoje={d.fonte === "hoje"} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-1 flex gap-[3px] text-[11px] tabular-nums text-slate-400">
                  {serie.map((d, i) => (
                    <span key={d.dia} className="min-w-0 flex-1 text-center">
                      {i % passo === 0 || d.fonte === "hoje" ? (d.fonte === "hoje" ? "hoje" : rotuloDia(d.dia)) : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
