"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  excessoDaRota,
  nomeDoEstouro,
  paradasQueCasam,
  porPacoteNoDia,
  rotasQuePodemAjudar,
  simular,
  type ParadaAgora,
  type ParadaCarga,
  type PorPacote,
  type RotaCarga,
} from "../../lib/estouro";
import type { PerfilId } from "../../lib/perfil";
import type { MapaApoio } from "../../lib/apoioCidades";

const int = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const dec = (n: number, c: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }).format(n);
const pct = (f: number | null) => (f === null ? "—" : int(f * 100) + "%");

const diasAtras = (n: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() - n * 86400000),
  );

async function buscarHistorico(id: string, aoMudar: (m: string) => void): Promise<PorPacote> {
  const r = await fetch("/api/perfil", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: id, inicio: diasAtras(7), fim: diasAtras(1) }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro ?? "Falhou.");
  const inicio = Date.now();
  while (Date.now() - inicio < 4 * 60 * 1000) {
    aoMudar("Buscando o histórico no BigQuery… até 1 minuto.");
    await new Promise((ok) => setTimeout(ok, 5000));
    const e = await (await fetch("/api/perfil?pedido=" + j.pedido, { cache: "no-store" })).json();
    if (!e.ok) throw new Error(e.erro ?? "Falhou.");
    if (e.status === "erro") throw new Error(e.erro || "A query falhou.");
    if (e.status !== "pronto") continue;
    const p = (e.perfis as PerfilId[]).find((x) => x.id === id) ?? (e.perfis as PerfilId[])[0];
    if (p?.plano && p.plano.pacotes > 0) {
      return {
        nome: p.nome,
        pesoKg: p.plano.pesoKg / p.plano.pacotes,
        volumeM3: p.plano.volumeM3 / p.plano.pacotes,
        base: "planejamento dos últimos 7 dias (" + int(p.plano.pacotes) + " pacotes)",
      };
    }
    throw new Error("Esse ID não tem planejamento nos últimos 7 dias: sem peso e volume por pacote.");
  }
  throw new Error("O script não respondeu em 4 minutos.");
}

const ehAgora = (p: ParadaCarga): p is ParadaAgora => "origemPacotes" in p;

export default function DetalheRota({
  rota,
  todas,
  procura = "",
  apoio = {},
}: {
  rota: RotaCarga;
  todas: RotaCarga[];

  procura?: string;
  apoio?: MapaApoio;
}) {
  const termo = procura.trim().toUpperCase();
  const achadas = new Set(
    termo && !rota.rota.toUpperCase().includes(termo) ? paradasQueCasam(rota, termo) : [],
  );

  const emRisco = rota.risco === "estouro" || rota.risco === "limite";
  const [vista, setVista] = useState<Vista>("ajudantes");
  const mostra: Vista = emRisco ? vista : "simular";
  const alternar = emRisco ? <Alternar vista={vista} aoTrocar={setVista} /> : null;

  return (
    <div className="space-y-4 bg-slate-50 px-4 py-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-3">ID</th>
            <th className="py-1 pr-3">Nome</th>
            <th className="py-1 pr-3">Cidade</th>
            <th className="py-1 pr-3 text-right">Pacotes</th>
            <th className="py-1 pr-3 text-right">Peso</th>
            <th className="py-1 text-right">Volume</th>
          </tr>
        </thead>
        <tbody>
          {rota.detalhe.map((p, i) => (
            <tr
              key={p.id + i}
              className={"border-t border-slate-200 " + (achadas.has(p) ? "bg-yellow-100 font-semibold" : "")}
            >
              <td className="py-1 pr-3 font-mono">{p.id || "—"}</td>
              <td className="py-1 pr-3">{p.nome || "—"}</td>
              <td className="whitespace-nowrap py-1 pr-3">{p.cidade || <span className="text-slate-400">—</span>}</td>
              <td
                className="py-1 pr-3 text-right tabular-nums"
                title={ehAgora(p) ? "Roteirizado na config: " + int(p.pacotesConfig) : undefined}
              >
                {int(p.pacotes)}
                {ehAgora(p) && (
                  <span className="ml-1 text-[9px] uppercase text-slate-400">
                    {p.origemPacotes === "monitoramento" ? "monit." : p.origemPacotes}
                  </span>
                )}
              </td>
              <td className="py-1 pr-3 text-right tabular-nums">{dec(p.pesoKg, 1)} kg</td>
              <td className="py-1 text-right tabular-nums">
                {dec(p.volumeM3, 2)} m³
                {ehAgora(p) && p.origemPorPacote !== "previsão" && (
                  <span className="ml-1 text-[9px] uppercase text-slate-400" title="Peso e volume por pacote">
                    {p.origemPorPacote}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {emRisco && (
        <div hidden={mostra !== "ajudantes"}>
          <Ajudantes rota={rota} todas={todas} apoio={apoio} alternar={alternar} />
        </div>
      )}
      <div hidden={mostra !== "simular"}>
        <Simulador rota={rota} todas={todas} alternar={alternar} />
      </div>
    </div>
  );
}

type Vista = "ajudantes" | "simular";

function Alternar({ vista, aoTrocar }: { vista: Vista; aoTrocar: (v: Vista) => void }) {
  const opcoes: [Vista, string][] = [
    ["ajudantes", "Rotas que podem ajudar"],
    ["simular", "Consultar ponto"],
  ];
  return (
    <div className="inline-flex shrink-0 rounded-md border border-slate-300 bg-slate-100 p-0.5 text-[11px] font-medium">
      {opcoes.map(([v, rotulo]) => (
        <button
          key={v}
          type="button"
          onClick={() => aoTrocar(v)}
          aria-pressed={vista === v}
          className={
            "whitespace-nowrap rounded px-2.5 py-1 " +
            (vista === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")
          }
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

function Cabecalho({ titulo, alternar }: { titulo: string; alternar: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-xs font-semibold text-slate-700">{titulo}</div>
      {alternar}
    </div>
  );
}

function Simulador({ rota, todas, alternar }: { rota: RotaCarga; todas: RotaCarga[]; alternar: ReactNode }) {
  const [id, setId] = useState("");
  const [qtd, setQtd] = useState("");
  const [base, setBase] = useState<PorPacote | null>(null);
  const [msg, setMsg] = useState("");
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const limpo = id.trim();
    setMsg("");
    setBase(limpo ? porPacoteNoDia(todas, limpo) : null);
  }, [id, todas]);

  const pacotes = Number(qtd.replace(/\D/g, "")) || 0;
  const sim = base && pacotes > 0 ? simular(rota, pacotes, base) : null;

  const buscar = async () => {
    setBuscando(true);
    try {
      setBase(await buscarHistorico(id.trim(), setMsg));
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <Cabecalho titulo="Simular: essa rota consegue pegar mais pacotes de outro ponto?" alternar={alternar} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">ID do ponto</span>
          <input
            value={id}
            onChange={(e) => setId(e.target.value)}
            className="w-56 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Pacotes</span>
          <input
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            inputMode="numeric"
            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs tabular-nums"
          />
        </label>
        {id.trim() && !base && (
          <button
            type="button"
            onClick={buscar}
            disabled={buscando || !/^[0-9_]{3,40}$/.test(id.trim())}
            className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Buscar no histórico
          </button>
        )}
      </div>

      <div className="mt-2 text-xs text-slate-600">
        {msg ? (
          <span className={buscando ? "" : "text-red-700"}>{msg}</span>
        ) : base ? (
          <>
            {base.nome && <strong>{base.nome}</strong>} ≈ {dec(base.pesoKg, 2)} kg e {dec(base.volumeM3, 3)} m³ por
            pacote, pela {base.base}.
          </>
        ) : id.trim() ? (
          "Esse ID não está na config de hoje. Busque no histórico para ter peso e volume por pacote."
        ) : (
          "Digite o ID de outro ponto e quantos pacotes ele mandaria."
        )}
      </div>

      {sim && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
          <span>
            Peso: {int(rota.pesoKg)} + {int(sim.pesoKg - rota.pesoKg)} = <strong>{int(sim.pesoKg)} kg</strong>
            {rota.tipo ? " de " + int(rota.tipo.pesoMaxKg) : ""} ({pct(sim.usoPeso)})
          </span>
          <span>
            Volume: {dec(rota.volumeM3, 1)} + {dec(sim.volumeM3 - rota.volumeM3, 1)} ={" "}
            <strong>{dec(sim.volumeM3, 1)} m³</strong>
            {rota.tipo ? " de " + int(rota.tipo.cubagemM3) : ""} ({pct(sim.usoVolume)})
          </span>
          <span
            className={
              "rounded border px-2 py-0.5 font-semibold " +
              (sim.risco === "estouro"
                ? "border-red-200 bg-red-50 text-red-800"
                : sim.risco === "limite"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : sim.risco === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600")
            }
          >
            {sim.risco === "estouro"
              ? "Vai estourar: " + nomeDoEstouro(sim.gargalo)
              : sim.risco === "limite"
                ? "Cabe, mas no limite (" + nomeDoEstouro(sim.gargalo) + ")"
                : sim.risco === "ok"
                  ? "Consegue coletar"
                  : "Veículo fora da tabela"}
          </span>
        </div>
      )}
    </div>
  );
}

function Ajudantes({
  rota,
  todas,
  apoio,
  alternar,
}: {
  rota: RotaCarga;
  todas: RotaCarga[];
  apoio: MapaApoio;
  alternar: ReactNode;
}) {
  const excesso = excessoDaRota(rota);
  const lista = rotasQuePodemAjudar(rota, todas, apoio);
  const porCidade = Boolean(rota.cidades?.length);
  const precisa = [
    excesso.volumeM3 > 0 ? dec(excesso.volumeM3, 1) + " m³" : "",
    excesso.pesoKg > 0 ? int(excesso.pesoKg) + " kg" : "",
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <Cabecalho
        titulo={
          porCidade
            ? "Rotas em " + rota.cidades!.join(", ") + " ou no caminho, que podem ajudar"
            : "Rotas do " + (rota.cluster || "cluster") + " que podem ajudar"
        }
        alternar={alternar}
      />
      {!porCidade && (
        <div className="mb-1 text-[11px] text-amber-700">
          Sem as cidades dessa rota na planificação: a lista considera o cluster inteiro.
        </div>
      )}
      <div className="mb-2 text-xs text-slate-600">
        {precisa.length
          ? "Para ficar abaixo do alerta, essa rota precisa passar adiante ~" + precisa.join(" e ") + "."
          : "Essa rota está no limite, mas ainda abaixo do alerta."}
      </div>
      {!rota.cluster ? (
        <p className="text-xs text-slate-500">A rota não tem cluster na config.</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-slate-500">
          {porCidade
            ? "Nenhuma rota com folga na mesma cidade ou numa cidade que tem essa no caminho."
            : "Nenhuma rota do mesmo cluster com folga."}
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-3">Rota</th>
              <th className="py-1 pr-3">Veículo</th>
              <th className="py-1 pr-3">Transportadora</th>
              <th className="py-1 pr-3">Cidades</th>
              {porCidade && <th className="py-1 pr-3">Por quê</th>}
              <th className="py-1 pr-3 text-right">Cabe (volume)</th>
              <th className="py-1 text-right">Cabe (peso)</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const cobre =
                a.folgaVolumeM3 >= excesso.volumeM3 && a.folgaPesoKg >= excesso.pesoKg && precisa.length > 0;
              return (
                <tr key={a.rota.rota} className="border-t border-slate-200">
                  <td className="py-1 pr-3 font-medium">
                    {a.rota.rota}
                    {cobre && (
                      <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-emerald-800">
                        cobre tudo
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-3">{a.rota.tipo?.tipo ?? a.rota.veiculo}</td>
                  <td className="py-1 pr-3">{a.rota.transportadora || "—"}</td>
                  <td className="py-1 pr-3">{a.rota.cidades?.length ? a.rota.cidades.join(", ") : "—"}</td>
                  {porCidade && (
                    <td className="whitespace-nowrap py-1 pr-3">
                      {a.motivo?.tipo === "caminho" ? (
                        <span
                          className="rounded bg-sky-50 px-1 py-0.5 text-sky-800"
                          title={
                            a.motivo.fonte === "planilha"
                              ? "Pela aba CIDADES_APOIO"
                              : "Sugestão automática: cidade vizinha no caminho de volta para a base"
                          }
                        >
                          caminho: {a.motivo.de.replace(/\/[A-Z]{2}$/, "")} → {a.motivo.para.replace(/\/[A-Z]{2}$/, "")}
                        </span>
                      ) : (
                        <span className="text-slate-500">mesma cidade</span>
                      )}
                    </td>
                  )}
                  <td className="py-1 pr-3 text-right tabular-nums">{dec(a.folgaVolumeM3, 1)} m³</td>
                  <td className="py-1 text-right tabular-nums">{int(a.folgaPesoKg)} kg</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
