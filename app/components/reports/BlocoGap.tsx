"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";

import CabecalhoReport from "./CabecalhoReport";
import { chaveRota } from "../../lib/hb";
import { MINIMO_GAP, textoGap, type AcaoGap, type DadosGap, type PontoGap, type RotaGap } from "../../lib/gapRotas";

const CHAVE_AUTOR = "monitorD0.autor";
const ouvintes = new Set<() => void>();
let autorEmMemoria: string | null = null;
function assinarAutor(avisar: () => void) {
  ouvintes.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}
function lerAutor(): string {
  if (autorEmMemoria !== null) return autorEmMemoria;
  try {
    return window.localStorage.getItem(CHAVE_AUTOR) ?? "";
  } catch {
    return "";
  }
}
function gravarAutor(v: string) {
  autorEmMemoria = v;
  try {
    window.localStorage.setItem(CHAVE_AUTOR, v);
  } catch {
    // Sem localStorage: vale so enquanto a pagina estiver aberta.
  }
  ouvintes.forEach((f) => f());
}

const int = (n: number | null) => (n === null ? "—" : Math.round(n).toLocaleString("pt-BR"));

export default function BlocoGap({ dados, dataISO }: { dados: DadosGap; dataISO: string }) {
  const router = useRouter();
  const autor = useSyncExternalStore(assinarAutor, lerAutor, () => "");
  const [gravando, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const [novaRota, setNovaRota] = useState("");

  const mudarAutor = gravarAutor;

  const { rotas, tiradas, outras } = dados.resultado;
  const texto = useMemo(() => textoGap(rotas, dados.dataBR), [rotas, dados.dataBR]);

  const ajustarVarios = (lista: { rota: string; idParada: string; acao: AcaoGap }[], aviso = "") => {
    setErro("");
    if (!autor.trim()) {
      setErro('Preencha "Seu nome" para assinar o ajuste.');
      return;
    }
    iniciar(async () => {
      const falhas: string[] = aviso ? [aviso] : [];
      for (const a of lista) {
        try {
          const r = await fetch("/api/gap-rotas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: dados.dataBR, ...a, autor: autor.trim() }),
          });
          const j = (await r.json()) as { ok: boolean; erro?: string };
          if (!j.ok) falhas.push(a.rota + ": " + (j.erro || "não gravou"));
        } catch (e) {
          falhas.push(a.rota + ": " + (e as Error).message);
        }
      }
      setErro(falhas.join(" · "));
      router.refresh();
    });
  };
  const ajustar = (rota: string, idParada: string, acao: AcaoGap) => ajustarVarios([{ rota, idParada, acao }]);

  const incluirColadas = () => {
    const porChave = new Map(outras.map((o) => [chaveRota(o.rota), o.rota]));
    const noReport = new Set(rotas.map((r) => chaveRota(r.rota)));
    const achadas: string[] = [];
    const ja: string[] = [];
    const naoAchadas: string[] = [];
    for (const parte of novaRota.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
      const k = chaveRota(parte);
      const rota = porChave.get(k);
      if (rota) {
        if (!achadas.includes(rota)) achadas.push(rota);
      } else if (noReport.has(k)) ja.push(parte);
      else naoAchadas.push(parte);
    }
    const aviso = [
      ja.length ? "Já no report: " + ja.join(", ") : "",
      naoAchadas.length ? "Não é rota de " + dados.dataBR + " na atribuição: " + naoAchadas.join(", ") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (!achadas.length) {
      setErro(aviso || "Cole o nome de uma rota.");
      return;
    }
    ajustarVarios(
      achadas.map((rota) => ({ rota, idParada: "", acao: "incluir" as AcaoGap })),
      aviso,
    );
    setNovaRota("");
  };

  return (
    <section>
      <CabecalhoReport titulo="GAP de rotas" dataISO={dataISO} texto={texto}>
        <span className="flex items-center gap-1">
          <span className="text-sm text-slate-600">Seu nome</span>
          <input
            value={autor}
            onChange={(e) => mudarAutor(e.target.value)}
            className="w-40 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
          />
        </span>
      </CabecalhoReport>

      <p className="mb-2 text-xs text-slate-500">
        Rotas de {dados.dataBR} sem transportadora ou com a A DEFINIR entram sozinhas. Em evidência: paradas com{" "}
        {MINIMO_GAP}+ pcts planejados na config de {dados.dataBR} (
        {dados.fonteConfig ? "aba \u201c" + dados.fonteConfig + "\u201d, " + dados.rotasNaConfig + " rotas no dia" : "sem config do dia"}). Os ajustes
        abaixo valem para todo mundo.
      </p>
      {dados.avisos.map((a) => (
        <p key={a} className="mb-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {a}
        </p>
      ))}
      {erro && <p className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{erro}</p>}

      <pre className="max-h-[30rem] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">
        {texto}
      </pre>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ajustar o report</h3>
          {gravando && <span className="text-xs text-slate-500">Gravando…</span>}
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <input
              value={novaRota}
              onChange={(e) => setNovaRota(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && novaRota.trim() && !gravando && incluirColadas()}
              list="gap-rotas-do-dia"
              placeholder="Cole a rota em aberto com transportadora (uma ou várias)"
              className="w-[22rem] max-w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
            />
            <datalist id="gap-rotas-do-dia">
              {outras.map((o) => (
                <option key={o.rota} value={o.rota}>
                  {o.transportadora}
                </option>
              ))}
            </datalist>
            <button
              type="button"
              disabled={!novaRota.trim() || gravando}
              onClick={incluirColadas}
              className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Incluir
            </button>
          </span>
        </div>

        {rotas.length === 0 && <p className="py-2 text-sm text-slate-500">Nenhuma rota em aberto para {dados.dataBR}.</p>}
        <div className="space-y-2">
          {rotas.map((r) => (
            <CartaoRota key={r.rota} r={r} gravando={gravando} ajustar={ajustar} />
          ))}
        </div>

        {tiradas.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold text-slate-500">Tiradas do report</p>
            <ul className="space-y-1 text-sm">
              {tiradas.map((r) => (
                <li key={r.rota} className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-700">{r.rota}</span>
                  <span className="text-xs text-slate-400">
                    por {r.ajuste?.autor || "—"} {r.ajuste?.registradoEm ? "· " + r.ajuste.registradoEm : ""}
                  </span>
                  <button
                    type="button"
                    disabled={gravando}
                    onClick={() => ajustar(r.rota, "", "auto")}
                    className="rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Voltar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function CartaoRota({
  r,
  gravando,
  ajustar,
}: {
  r: RotaGap;
  gravando: boolean;
  ajustar: (rota: string, idParada: string, acao: AcaoGap) => void;
}) {
  const [novaParada, setNovaParada] = useState("");
  const noReport = r.pontos.filter((p) => p.noReport).length;

  const tirar = () => ajustar(r.rota, "", r.automatica ? "excluir" : "auto");

  const alternar = (p: PontoGap) => {
    const quer = !p.noReport;
    ajustar(r.rota, p.id, quer === p.destaque ? "auto" : quer ? "incluir" : "excluir");
  };
  return (
    <details className="rounded border border-slate-200">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-semibold text-slate-900">{r.rota}</span>
        <span className={"rounded px-1.5 py-0.5 text-[11px] " + (r.transportadora ? "bg-slate-100 text-slate-700" : "bg-[#fdeceb] text-[#94160e]")}>
          {r.transportadora || "Sem transportadora"}
        </span>
        <span className="text-xs text-slate-500">
          {noReport} de {r.pontos.length} paradas no report{r.start ? " · start " + r.start : ""}
        </span>
        {r.ajuste && (
          <span className="text-xs text-slate-400">
            incluída por {r.ajuste.autor || "—"} {r.ajuste.registradoEm ? "· " + r.ajuste.registradoEm : ""}
          </span>
        )}
        <button
          type="button"
          disabled={gravando}
          onClick={(e) => {
            e.preventDefault();
            tirar();
          }}
          className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Tirar do report
        </button>
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">
        {r.pontos.length === 0 && (
          <p className="py-1 text-xs text-slate-500">Sem paradas desta rota na config do dia nem na Formulas. Inclua pelo ID.</p>
        )}
        {r.pontos.length > 0 && (
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-6 py-1" />
                <th className="py-1">Parada</th>
                <th className="py-1 text-right">Planejado (config)</th>
                <th className="py-1 pl-3" />
              </tr>
            </thead>
            <tbody>
              {r.pontos.map((p) => (
                <tr key={p.id} className={"border-t border-slate-100 " + (p.noReport ? "" : "text-slate-400")}>
                  <td className="py-1">
                    <input type="checkbox" checked={p.noReport} disabled={gravando} onChange={() => alternar(p)} />
                  </td>
                  <td className="max-w-[18rem] truncate py-1" title={p.id}>
                    <span className={p.noReport ? "font-medium text-slate-800" : ""}>{p.nome}</span>
                    {p.nome !== p.id && <span className="ml-1.5 font-mono text-[10px] text-slate-400">{p.id}</span>}
                  </td>
                  <td className="py-1 text-right tabular-nums">{int(p.pacotes)}</td>
                  <td className="py-1 pl-3 text-[10px]">
                    {p.destaque && <span className="mr-1 rounded bg-[#fdf3e4] px-1 py-0.5 font-semibold text-[#8a5210]">{MINIMO_GAP}+</span>}
                    {!p.noPlano && <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-slate-600">fora do plano</span>}
                    {p.ajuste && (
                      <span className="text-slate-400">
                        {p.ajuste.acao === "incluir" ? "incluída" : "tirada"} por {p.ajuste.autor || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <input
            value={novaParada}
            onChange={(e) => setNovaParada(e.target.value)}
            placeholder="ID da parada (ex.: 849817033_25374)"
            className="w-64 rounded border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={!novaParada.trim() || gravando}
            onClick={() => {
              ajustar(r.rota, novaParada.trim(), "incluir");
              setNovaParada("");
            }}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Incluir parada
          </button>
        </div>
      </div>
    </details>
  );
}
