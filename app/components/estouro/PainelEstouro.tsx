"use client";

import { Fragment, useMemo, useState } from "react";

import { Campo, MultiSelect } from "../ui/filtros";
import ComparacaoFontes from "./ComparacaoFontes";
import DetalheRota from "./DetalheRota";
import ApoioCidades from "./ApoioCidades";
import {
  LIMITE_ALERTA,
  casaProcura,
  compararFontes,
  nomeDoEstouro,
  type Risco,
  type RotaAgora,
  type RotaCarga,
  type TipoVeiculo,
} from "../../lib/estouro";
import type { InfoAgora } from "../../lib/estouroDados";
import type { MapaApoio } from "../../lib/apoioCidades";

const int = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const pct = (f: number | null) => (f === null ? "—" : int(f * 100) + "%");

const ROTULO: Record<Risco, string> = {
  estouro: "Estouro previsto",
  limite: "No limite",
  ok: "Com folga",
  "sem-veiculo": "Veículo fora da tabela",
};

const COR: Record<Risco, string> = {
  estouro: "border-red-200 bg-red-50 text-red-800",
  limite: "border-amber-200 bg-amber-50 text-amber-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "sem-veiculo": "border-slate-200 bg-slate-50 text-slate-600",
};

function Uso({ valor, uso, limite, unidade }: { valor: number; uso: number | null; limite?: number; unidade: string }) {
  const cor =
    uso === null ? "bg-slate-300" : uso >= 1 ? "bg-red-500" : uso >= LIMITE_ALERTA ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-32">
      <div className="flex justify-between gap-2 text-xs tabular-nums">
        <span>
          {int(valor)}
          {limite ? <span className="text-slate-400"> / {int(limite)}</span> : null} {unidade}
        </span>
        <span className="font-semibold">{pct(uso)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded bg-slate-100">
        <div className={"h-1.5 rounded " + cor} style={{ width: Math.min(100, (uso ?? 0) * 100) + "%" }} />
      </div>
    </div>
  );
}

type Campo =
  | "rota"
  | "cluster"
  | "cidades"
  | "transportadora"
  | "veiculo"
  | "pacotes"
  | "peso"
  | "volume"
  | "risco";

const PESO_RISCO: Record<Risco, number> = { estouro: 3, limite: 2, "sem-veiculo": 1, ok: 0 };

function valor(r: RotaCarga, campo: Campo): number | string {
  switch (campo) {
    case "rota":
      return r.rota;
    case "cluster":
      return r.cluster || "~";
    case "cidades":
      return r.cidades?.[0] ?? "~";
    case "transportadora":
      return r.transportadora || "~";
    case "veiculo":
      return r.tipo?.pesoMaxKg ?? -1;
    case "pacotes":
      return r.pacotes;
    case "peso":
      return r.usoPeso ?? -1;
    case "volume":
      return r.usoVolume ?? -1;
    case "risco":

      return PESO_RISCO[r.risco] * 10 + Math.min(9.99, Math.max(r.usoPeso ?? 0, r.usoVolume ?? 0));
  }
}

const TEXTO: Campo[] = ["rota", "cluster", "transportadora"];

function Titulo({
  titulo,
  campo,
  ordem,
  setOrdem,
  direita,
}: {
  titulo: string;
  campo: Campo;
  ordem: { campo: Campo | null; desc: boolean };
  setOrdem: (o: { campo: Campo; desc: boolean }) => void;
  direita?: boolean;
}) {
  const ativa = ordem.campo === campo;
  return (
    <th className={"px-3 py-2 " + (direita ? "text-right" : "")}>
      <button
        type="button"
        onClick={() => setOrdem({ campo, desc: ativa ? !ordem.desc : !TEXTO.includes(campo) })}
        className={"uppercase tracking-wide hover:text-slate-900 " + (ativa ? "text-slate-900" : "")}
      >
        {titulo}
        <span className="ml-1 text-[10px]">{ativa ? (ordem.desc ? "▼" : "▲") : "⇅"}</span>
      </button>
    </th>
  );
}

type Fonte = "agora" | "config";

type Porte = "menor" | "maior";

const SEM_PORTE = "Fora da tabela";
const porteDe = (r: RotaCarga) => r.tipo?.tipo ?? SEM_PORTE;

const hora = (t: string) => (t.match(/\d{2}:\d{2}/) ?? [""])[0];

export default function PainelEstouro({
  dataBR,
  rotas: rotasConfig,
  agora = [],
  info,
  comparar = false,
  aviso,
  erro,
  veiculos,
  apoio = {},
}: {
  dataBR: string;
  rotas: RotaCarga[];
  agora?: RotaAgora[];
  info?: InfoAgora;
  comparar?: boolean;
  aviso: string;
  erro: string | null;
  veiculos: TipoVeiculo[];
  apoio?: MapaApoio;
}) {
  const temFonteNova = Boolean(
    info && (info.paradas > info.paradasSemPrevisao || info.monitoramentoEm),
  );
  const [fonte, setFonte] = useState<Fonte>(temFonteNova ? "agora" : "config");
  const rotas: (RotaCarga | RotaAgora)[] = fonte === "agora" && agora.length ? agora : rotasConfig;
  const comparacao = useMemo(
    () => (comparar && temFonteNova ? compararFontes(rotasConfig, agora) : null),
    [comparar, temFonteNova, rotasConfig, agora],
  );
  const [riscos, setRiscos] = useState<Risco[]>([]);

  const [portes, setPortes] = useState<Porte[]>([]);
  const [clusters, setClusters] = useState<string[]>([]);
  const [transps, setTransps] = useState<string[]>([]);
  const [perfis, setPerfis] = useState<string[]>([]);
  const [procura, setProcura] = useState("");
  const [ordem, setOrdem] = useState<{ campo: Campo | null; desc: boolean }>({ campo: null, desc: true });
  const [aberta, setAberta] = useState<string | null>(null);

  const opcoesCluster = useMemo(() => [...new Set(rotas.map((r) => r.cluster).filter(Boolean))].sort(), [rotas]);
  const opcoesTransp = useMemo(() => [...new Set(rotas.map((r) => r.transportadora).filter(Boolean))].sort(), [rotas]);

  const opcoesPerfil = useMemo(() => {
    const tem = new Set(rotas.map(porteDe));
    const frota = veiculos.map((v) => v.tipo);
    const outros = [...tem].filter((p) => !frota.includes(p) && p !== SEM_PORTE).sort();
    return [...frota, ...outros, SEM_PORTE].filter((p) => tem.has(p));
  }, [rotas, veiculos]);

  const base = useMemo(
    () =>
      rotas.filter(
        (r) =>
          (!clusters.length || clusters.includes(r.cluster)) &&
          (!transps.length || transps.includes(r.transportadora)) &&
          (!perfis.length || perfis.includes(porteDe(r))) &&
          casaProcura(r, procura),
      ),
    [rotas, clusters, transps, perfis, procura],
  );
  const filtradas = base.filter(
    (r) =>
      (!riscos.length || riscos.includes(r.risco)) &&
      (!portes.length || (r.porte != null && portes.includes(r.porte))),
  );

  const visiveis = useMemo(() => {
    const campo = ordem.campo;
    if (!campo) return filtradas;
    const sinal = ordem.desc ? -1 : 1;
    return [...filtradas].sort((a, b) => {
      const va = valor(a, campo);
      const vb = valor(b, campo);
      const cmp =
        typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return cmp * sinal || a.rota.localeCompare(b.rota);
    });
  }, [filtradas, ordem]);

  const conta = (risco: Risco) => base.filter((r) => r.risco === risco);
  const estouros = conta("estouro");
  const limite = conta("limite");

  if (erro) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  }

  const cartao = (risco: Risco, lista: RotaCarga[], detalhe?: string) => {
    const ativo = riscos.includes(risco);
    return (
      <button
        type="button"
        onClick={() => setRiscos(ativo ? riscos.filter((x) => x !== risco) : [...riscos, risco])}
        className={
          "rounded-lg border bg-white p-4 text-left transition hover:shadow-sm " +
          (ativo ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200")
        }
      >
        <span className={"inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium " + COR[risco]}>
          {ROTULO[risco]}
        </span>
        <div className="mt-2 text-2xl font-bold tabular-nums">{lista.length}</div>
        <div className="text-xs text-slate-500">{detalhe ?? "rotas"}</div>
      </button>
    );
  };

  const cartaoPorte = (porte: Porte) => {
    const ativo = portes.includes(porte);
    const lista = base.filter((r) => r.porte === porte);
    return (
      <button
        type="button"
        onClick={() => setPortes(ativo ? portes.filter((x) => x !== porte) : [...portes, porte])}
        className={
          "rounded-lg border bg-white p-4 text-left transition hover:shadow-sm " +
          (ativo ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200")
        }
      >
        <span
          className={
            "inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium " +
            (porte === "menor" ? "border-red-200 bg-red-50 text-red-800" : "border-sky-200 bg-sky-50 text-sky-800")
          }
        >
          Perfil {porte}
        </span>
        <div className="mt-2 text-2xl font-bold tabular-nums">{lista.length}</div>
        <div className="text-xs text-slate-500">
          {porte === "menor" ? "veículo abaixo do pedido" : "veículo acima do pedido"}
        </div>
      </button>
    );
  };

  const porGargalo = (lista: RotaCarga[]) => {
    const peso = lista.filter((r) => r.gargalo === "peso").length;
    return peso + " NSE peso · " + (lista.length - peso) + " NSE";
  };

  return (
    <div className="space-y-4">
      {aviso && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{aviso}</div>
      )}
      {info && info.avisos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {info.avisos.join(" ")}
        </div>
      )}

      {agora.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {comparar && (
            <div className="flex gap-1">
              {(
                [
                  ["agora", "Fonte nova"],
                  ["config", "Config"],
                ] as [Fonte, string][]
              ).map(([f, rotulo]) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFonte(f)}
                  className={
                    "rounded-md px-3 py-1 text-sm font-medium " +
                    (fonte === f
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")
                  }
                >
                  {rotulo}
                </button>
              ))}
            </div>
          )}
          {fonte === "agora" && info && temFonteNova ? (
            <span>
              {"Pacotes do Monitoramento por Sellers" +
                (info.monitoramentoEm ? " (" + hora(info.monitoramentoEm) + ")" : "")}
              ; peso e volume por pacote da previsão da véspera
              {info.previsaoEm ? " (copiada às " + hora(info.previsaoEm) + ")" : ""}; veículo da atribuição.
              {info.paradasSemPrevisao > 0 &&
                " " + int(info.paradasSemPrevisao) + " de " + int(info.paradas) + " paradas sem previsão usam o peso e volume da config."}
            </span>
          ) : (
            <span>Peso, volume e pacotes da Extração Config.</span>
          )}
        </div>
      )}

      {comparacao && <ComparacaoFontes c={comparacao} />}

      <div className="flex flex-wrap items-end gap-3">
        <Campo titulo="Cluster">
          <MultiSelect opcoes={opcoesCluster} selecionados={clusters} setSelecionados={setClusters} rotuloTodas="Todos" />
        </Campo>
        <Campo titulo="Transportadora">
          <MultiSelect opcoes={opcoesTransp} selecionados={transps} setSelecionados={setTransps} rotuloTodas="Todas" />
        </Campo>
        <Campo titulo="Perfil">
          <MultiSelect opcoes={opcoesPerfil} selecionados={perfis} setSelecionados={setPerfis} rotuloTodas="Todos" />
        </Campo>
        <Campo titulo="Rota ou ID">
          <input
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
            placeholder="Nome da rota ou ID do ponto"
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </Campo>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cartao("estouro", estouros, estouros.length ? porGargalo(estouros) : "rotas acima de 100%")}
        {cartao("limite", limite, limite.length ? porGargalo(limite) : "rotas a partir de " + int(LIMITE_ALERTA * 100) + "%")}
        {cartao("ok", conta("ok"))}
        {cartaoPorte("menor")}
        {cartaoPorte("maior")}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <Titulo titulo="Rota" campo="rota" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Cluster" campo="cluster" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Cidades" campo="cidades" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Transportadora" campo="transportadora" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Veículo" campo="veiculo" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Pacotes" campo="pacotes" ordem={ordem} setOrdem={setOrdem} direita />
              <Titulo titulo="Peso" campo="peso" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Volume" campo="volume" ordem={ordem} setOrdem={setOrdem} />
              <Titulo titulo="Risco" campo="risco" ordem={ordem} setOrdem={setOrdem} />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => (
              <Fragment key={r.rota}>

              <tr
                onClick={() => setAberta(aberta === r.rota ? null : r.rota)}
                className={
                  "cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 " +
                  (aberta === r.rota ? "bg-slate-50" : "")
                }
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-medium">
                  <span className="mr-1 inline-block w-3 text-slate-400">{aberta === r.rota ? "▾" : "▸"}</span>
                  {r.rota}
                </td>
                <td className="px-3 py-1.5 text-slate-600">{r.cluster || "—"}</td>

                <td
                  className="max-w-56 truncate px-3 py-1.5 text-slate-600"
                  title={r.cidades?.length ? r.cidades.join(", ") : "Rota sem cidades na planificação"}
                >
                  {r.cidades?.length ? r.cidades.join(", ") : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-3 py-1.5 text-slate-600">{r.transportadora || "—"}</td>
                <td
                  className="whitespace-nowrap px-3 py-1.5 text-slate-600"
                  title={
                    (r.atribuido === false ? "Ainda sem veículo na atribuição. " : "Atribuído: " + r.veiculo + ". ") +
                    "Pedido: " + (r.veiculoPedido || "—") + ". " +
                    (r.capacidadeDaBase
                      ? "Capacidade da base de veículos do sistema."
                      : "Capacidade da tabela de portes (veículo fora da base).")
                  }
                >
                  {r.tipo?.tipo ?? <span className="text-slate-400">{r.veiculo || "—"}</span>}
                  {r.porte && (
                    <span
                      className={
                        "ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase " +
                        (r.porte === "menor" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800")
                      }
                    >
                      perfil {r.porte}
                    </span>
                  )}
                  {r.atribuido === false && (
                    <span className="ml-1.5 text-[10px] text-slate-400">não atribuído</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{int(r.pacotes)}</td>
                <td className="px-3 py-1.5">
                  <Uso valor={r.pesoKg} uso={r.usoPeso} limite={r.tipo?.pesoMaxKg} unidade="kg" />
                </td>
                <td className="px-3 py-1.5">
                  <Uso valor={r.volumeM3} uso={r.usoVolume} limite={r.tipo?.cubagemM3} unidade="m³" />
                </td>
                <td className="px-3 py-1.5">
                  <span className={"rounded border px-1.5 py-0.5 text-[11px] font-medium " + COR[r.risco]}>
                    {r.risco === "estouro" || r.risco === "limite"
                      ? nomeDoEstouro(r.gargalo) + (r.risco === "limite" ? " no limite" : "")
                      : ROTULO[r.risco]}
                  </span>
                </td>
              </tr>
              {aberta === r.rota && (
                <tr className="border-b border-slate-200">
                  <td colSpan={9} className="p-0">
                    <DetalheRota rota={r} todas={rotas} procura={procura} apoio={apoio} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {!visiveis.length && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Nenhuma rota de {dataBR} com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ApoioCidades apoio={apoio} />

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer">
          Tabela de portes (vale só para veículo que não está na base de capacidade do sistema)
        </summary>
        <table className="mt-2 text-xs">
          <tbody>
            {veiculos.map((v) => (
              <tr key={v.tipo}>
                <td className="pr-4">{v.tipo}</td>
                <td className="pr-4 tabular-nums">{int(v.pesoMaxKg)} kg</td>
                <td className="tabular-nums">{int(v.cubagemM3)} m³</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2">
          Cada parada: pacotes estimados agora no Monitoramento por Sellers (amanhã, os da
          previsão) × peso e volume por pacote da previsão da véspera (replanejamento). Seller em
          mais de uma rota tem os pacotes repartidos na proporção da config; parada sem dado novo
          fica com o valor da Extração Config. O veículo é o que entrou na rota na atribuição
          (perfil menor/maior quando difere do pedido; rota ainda sem veículo usa o pedido),
          reconhecido pelo nome (Toco Fixo → Toco, Express Vuc → VUC, Yellow Pool → Van). É previsão: rota com alerta ainda pode coletar
          tudo.
        </p>
      </details>
    </div>
  );
}
