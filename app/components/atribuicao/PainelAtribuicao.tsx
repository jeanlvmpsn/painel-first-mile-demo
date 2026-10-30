"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SeletorPeriodo } from "../ui/filtros";
import {
  agrupar,
  formatarPercentual,
  ordenar,
  perfilCanonico,
  PERFIL_OUTROS,
  PERFIS,
  resumir,
  valoresUnicos,
  type Grupo,
  tipoDaRota,
  type RotaPlanejada,
  type TipoRota,
} from "../../lib/atribuicaoUtils";
import { apelidarTransportadora } from "../../lib/dashboardUtils";
import { classeHub } from "./coresHub";

const TODAS = "__todas__";

const TODOS_HUBS = "__todos__";

type Lado = "atribuidas" | "pendentes";

function escaparCsv(valor: string) {
  const texto = String(valor ?? "");
  return /[";\r\n]/.test(texto)
    ? '"' + texto.replace(/"/g, '""') + '"'
    : texto;
}

function baixarCsv(arquivo: string, rotas: RotaPlanejada[]) {
  const linhas = [
    "ROTA;TRANSPORTADORA;HUB;PERFIL;PLACA;MOTORISTA;SITUACAO",
    ...rotas.map(
      (r) =>
        escaparCsv(r.rota) +
        ";" +
        escaparCsv(r.transportadora || "Sem transportadora") +
        ";" +
        escaparCsv(r.regiao || "CPS") +
        ";" +
        escaparCsv(r.perfil ?? "") +
        ";" +
        escaparCsv(r.atribuida ? r.placa : "") +
        ";" +
        escaparCsv(r.motorista ?? "") +
        ";" +
        (r.atribuida ? "Atribuída" : "Sem atribuição"),
    ),
  ];
  salvarCsv(arquivo, linhas);
}

function salvarCsv(arquivo: string, linhas: string[]) {
  const blob = new Blob(["\uFEFF" + linhas.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivo;
  link.click();
  URL.revokeObjectURL(url);
}

function baixarCsvFiltrado(arquivo: string, rotas: RotaPlanejada[]) {
  const linhas = [
    "ROTA;TRANSPORTADORA;TIPO;PLACA",
    ...rotas.map((r) =>
      [
        r.rota,
        r.transportadora || "Sem transportadora",
        tipoDaRota(r.tipoRota) ?? "",

        r.atribuida ? r.placa : "",
      ]
        .map(escaparCsv)
        .join(";"),
    ),
  ];
  salvarCsv(arquivo, linhas);
}

function achatar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function soAlfanumerico(texto: string): string {
  return achatar(texto).replace(/[^a-z0-9]/g, "");
}

function casaComBusca(
  r: RotaPlanejada,
  alvo: string,
  alvoCompacto: string,
): boolean {
  if (!alvo) return true;
  const campos = achatar(
    [r.rota, r.cluster, r.regiao, r.transportadora, r.motorista ?? ""].join(" "),
  );
  if (campos.includes(alvo)) return true;
  return (
    alvoCompacto.length >= 2 && soAlfanumerico(r.placa).includes(alvoCompacto)
  );
}

function pedacoArquivo(texto: string) {
  return texto.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export type Situacao = "todas" | "atribuidas" | "sem";

export default function PainelAtribuicao({
  rotas,
  dataISO,
  dataFimISO,
}: {
  rotas: RotaPlanejada[];
  dataISO: string;
  dataFimISO: string;
}) {
  const router = useRouter();
  const parametros = useSearchParams();

  const [transportadorasSel, setTransportadorasSel] = useState<string[]>(() => {
    const bruto = parametros.get("tp");
    if (!bruto || bruto === TODAS) return [];
    return bruto
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  });
  const [hub, setHub] = useState(() => parametros.get("hub") || TODAS);
  const [tipo, setTipo] = useState(() => parametros.get("tipo") || TODAS);

  const [perfis, setPerfis] = useState<string[]>(() => {
    const bruto = parametros.get("perfil");
    return bruto
      ? bruto.split(",").map((p) => p.trim()).filter(Boolean)
      : [];
  });

  const [menor, setMenor] = useState(() => {
    const pedido = parametros.get("menor");
    return pedido === "sim" || pedido === "nao" ? pedido : TODAS;
  });

  const [busca, setBusca] = useState(() => parametros.get("q") ?? "");
  const [clusters, setClusters] = useState<string[]>(() => {
    const bruto = parametros.get("cluster");
    return bruto
      ? bruto.split(",").map((c) => c.trim()).filter(Boolean)
      : [];
  });
  const [situacao, setSituacao] = useState<Situacao>(() => {
    const pedida = parametros.get("situacao");
    return pedida === "atribuidas" || pedida === "sem" ? pedida : "todas";
  });

  const [abertos, setAbertos] = useState<Record<string, string>>({});

  const [lados, setLados] = useState<Record<string, Lado>>({});

  const consulta = useMemo(() => {
    const p = new URLSearchParams();
    p.set("data", dataISO);
    if (dataFimISO !== dataISO) p.set("dataFim", dataFimISO);
    if (transportadorasSel.length > 0)
      p.set("tp", transportadorasSel.join(","));
    if (hub !== TODAS) p.set("hub", hub);
    if (clusters.length > 0) p.set("cluster", clusters.join(","));
    if (situacao !== "todas") p.set("situacao", situacao);
    if (tipo !== TODAS) p.set("tipo", tipo);
    if (perfis.length > 0) p.set("perfil", perfis.join(","));
    if (menor !== TODAS) p.set("menor", menor);
    if (busca.trim()) p.set("q", busca.trim());
    return p.toString();
  }, [
    dataISO,
    dataFimISO,
    transportadorasSel,
    hub,
    clusters,
    situacao,
    tipo,
    perfis,
    menor,
    busca,
  ]);

  useEffect(() => {
    const alvo = window.location.pathname + "?" + consulta;
    if (alvo !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", alvo);
    }
  }, [consulta]);

  const comEscolhido = (lista: string[], escolhido: string) =>
    escolhido !== TODAS && !lista.includes(escolhido)
      ? [...lista, escolhido].sort((a, b) => a.localeCompare(b, "pt-BR"))
      : lista;

  const transportadoras = useMemo(() => {
    const base = rotas.filter(
      (r) =>
        (hub === TODAS || r.regiao === hub) &&
        (clusters.length === 0 || clusters.includes(r.cluster)),
    );
    return transportadorasSel.reduce(
      (lista, escolhida) => comEscolhido(lista, escolhida),
      valoresUnicos(base, (r) => r.transportadora),
    );
  }, [rotas, hub, clusters, transportadorasSel]);

  const hubs = useMemo(() => {
    const base = rotas.filter(
      (r) =>
        (transportadorasSel.length === 0 ||
          transportadorasSel.includes(r.transportadora)) &&
        (clusters.length === 0 || clusters.includes(r.cluster)),
    );
    return comEscolhido(valoresUnicos(base, (r) => r.regiao), hub);
  }, [rotas, transportadorasSel, clusters, hub]);

  const listaClusters = useMemo(() => {
    const base = rotas.filter(
      (r) =>
        (transportadorasSel.length === 0 ||
          transportadorasSel.includes(r.transportadora)) &&
        (hub === TODAS || r.regiao === hub),
    );
    const disponiveis = valoresUnicos(base, (r) => r.cluster);
    const faltando = clusters.filter((c) => !disponiveis.includes(c));
    return faltando.length
      ? [...disponiveis, ...faltando].sort((a, b) => a.localeCompare(b, "pt-BR"))
      : disponiveis;
  }, [rotas, transportadorasSel, hub, clusters]);

  const alvoBusca = useMemo(() => achatar(busca), [busca]);
  const alvoCompacto = useMemo(() => soAlfanumerico(busca), [busca]);
  const diaTemMotorista = useMemo(
    () => rotas.some((r) => (r.motorista ?? "") !== ""),
    [rotas],
  );

  const tiposDoDia = useMemo(() => {
    const achados = new Set<TipoRota>();
    for (const r of rotas) {
      const t = tipoDaRota(r.tipoRota);
      if (t) achados.add(t);
    }
    return [...achados].sort();
  }, [rotas]);

  const perfisDoDia = useMemo(() => {
    const achados = new Set<string>();
    for (const r of rotas) {
      const p = perfilCanonico(r.perfil);
      if (p) achados.add(p);
    }
    return [...PERFIS, PERFIL_OUTROS].filter((p) => achados.has(p));
  }, [rotas]);

  const diaTemPerfilMenor = useMemo(
    () => rotas.some((r) => r.perfilMenor !== undefined),
    [rotas],
  );

  const recorte = useMemo(
    () =>
      rotas.filter((r) => {
        if (
          transportadorasSel.length > 0 &&
          !transportadorasSel.includes(r.transportadora)
        )
          return false;
        if (hub !== TODAS && r.regiao !== hub) return false;
        if (clusters.length > 0 && !clusters.includes(r.cluster)) return false;
      if (tipo !== TODAS && tipoDaRota(r.tipoRota) !== tipo) return false;
      if (perfis.length > 0 && !perfis.includes(perfilCanonico(r.perfil)))
          return false;
        if (menor === "sim" && !(r.atribuida && r.perfilMenor === true))
          return false;
        if (menor === "nao" && !(r.atribuida && r.perfilMenor === false))
          return false;
        if (!casaComBusca(r, alvoBusca, alvoCompacto)) return false;
        return true;
      }),
    [
      rotas,
      transportadorasSel,
      hub,
      clusters,
      tipo,
      perfis,
      menor,
      alvoBusca,
      alvoCompacto,
    ],
  );

  const resumo = useMemo(() => resumir(recorte), [recorte]);

  const filtradas = useMemo(
    () =>
      recorte.filter((r) => {
        if (situacao === "atribuidas") return r.atribuida;
        if (situacao === "sem") return !r.atribuida;
        return true;
      }),
    [recorte, situacao],
  );

  const grupos = useMemo(
    () =>
      ordenar(
        agrupar(filtradas, (r) => r.transportadora),
        "maisNaoAtribuidas",
      ),
    [filtradas],
  );

  const pendentesPorTransportadora = useMemo(() => {
    const mapa = new Map<string, RotaPlanejada[]>();
    for (const r of filtradas) {
      if (r.atribuida) continue;
      const chave = r.transportadora || "Sem transportadora";
      const lista = mapa.get(chave) ?? [];
      lista.push(r);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [filtradas]);

  const atribuidasPorTransportadora = useMemo(() => {
    const mapa = new Map<string, RotaPlanejada[]>();
    for (const r of filtradas) {
      if (!r.atribuida) continue;
      const chave = r.transportadora || "Sem transportadora";
      const lista = mapa.get(chave) ?? [];
      lista.push(r);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [filtradas]);

  const pendentesTodas = useMemo(
    () => filtradas.filter((r) => !r.atribuida),
    [filtradas],
  );

  const pendentesPorHub = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of recorte) {
      if (r.atribuida) continue;
      mapa.set(r.regiao, (mapa.get(r.regiao) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .map(([reg, qtd]) => ({ regiao: reg, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
  }, [recorte]);

  const alternarAberto = (chave: string, alvo: string) =>
    setAbertos((atual) => {
      if (atual[chave] === alvo) {
        const copia = { ...atual };
        delete copia[chave];
        return copia;
      }
      return { ...atual, [chave]: alvo };
    });

  const abrirLado = (chave: string, lado: Lado, alvo: string) => {
    const ladoAtual = lados[chave] ?? "pendentes";
    setLados((atual) => ({ ...atual, [chave]: lado }));
    if (abertos[chave] !== undefined && ladoAtual !== lado) {
      setAbertos((atual) => ({ ...atual, [chave]: alvo }));
      return;
    }
    alternarAberto(chave, alvo);
  };

  const temFiltro =
    transportadorasSel.length > 0 ||
    hub !== TODAS ||
    clusters.length > 0 ||
    situacao !== "todas" ||
    tipo !== TODAS ||
    perfis.length > 0 ||
    menor !== TODAS ||
    busca.trim() !== "";

  const limpar = () => {
    setTransportadorasSel([]);
    setHub(TODAS);
    setClusters([]);
    setSituacao("todas");
    setAbertos({});
    setLados({});
    setTipo(TODAS);
    setPerfis([]);
    setMenor(TODAS);
    setBusca("");
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Campo titulo="Dia">
          <SeletorPeriodo
            inicio={dataISO}
            fim={dataFimISO}
            aoMudar={(i, f) => {
              const alvo = new URLSearchParams(consulta);
              alvo.set("data", i);
              if (f !== i) alvo.set("dataFim", f);
              else alvo.delete("dataFim");
              router.push("/atribuicoes?" + alvo.toString());
            }}
          />
        </Campo>

        <span className="mb-1 h-8 w-px shrink-0 bg-slate-200" />

        <Campo titulo="Transportadora">
          <MultiCluster
            opcoes={transportadoras}
            selecionados={transportadorasSel}
            setSelecionados={setTransportadorasSel}
            rotulo={apelidarTransportadora}
            rotuloTodos="Todas"
            buscaPlaceholder="buscar transportadora"
          />
        </Campo>

        {hubs.length > 1 && (
          <Campo titulo="HUB">
            <Select
              valor={hub}
              setValor={setHub}
              opcoes={hubs}
              rotuloTodas="Todas"
            />
          </Campo>
        )}

        <Campo titulo="Cluster">
          <MultiCluster
            opcoes={listaClusters}
            selecionados={clusters}
            setSelecionados={setClusters}
          />
        </Campo>

        {tiposDoDia.length > 1 && (
          <Campo titulo="Tipo">
            <Select
              valor={tipo}
              setValor={setTipo}
              opcoes={tiposDoDia}
              rotuloTodas="Todos"
            />
          </Campo>
        )}

        {perfisDoDia.length > 1 && (
          <Campo titulo="Perfil">
            <MultiCluster
              opcoes={perfisDoDia}
              selecionados={perfis}
              setSelecionados={setPerfis}
            />
          </Campo>
        )}

        {diaTemPerfilMenor && (
          <Campo titulo="Perfil menor">
            <Select
              valor={menor}
              setValor={setMenor}
              opcoes={["sim", "nao"]}
              rotuloTodas="Todas"
              rotulo={(v) =>
                v === "sim"
                  ? "Só atribuídas em perfil menor"
                  : "Atribuídas no perfil certo"
              }
            />
          </Campo>
        )}

        <Campo titulo="Buscar">
          <div className="relative">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="rota, placa ou motorista"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 pr-7 text-sm"
            />
            {busca !== "" && (
              <button
                type="button"
                onClick={() => setBusca("")}
                title="limpar a busca"
                aria-label="limpar a busca"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700"
              >
                &times;
              </button>
            )}
          </div>
        </Campo>

        <div className="pb-0.5">
          <BotaoCsv
            titulo={
              "Exportar as " + filtradas.length + " rotas do filtro atual"
            }
            onClick={() =>
              baixarCsvFiltrado("rotas-" + dataISO + ".csv", filtradas)
            }
          />
        </div>

        {temFiltro && (
          <button
            onClick={limpar}
            className="pb-1.5 text-sm text-slate-500 underline hover:text-slate-800"
          >
            limpar filtros
          </button>
        )}
      </section>

      {busca.trim() !== "" && (
        <ResultadosDaBusca
          termo={busca.trim()}
          rotas={filtradas}
          diaTemMotorista={diaTemMotorista}
        />
      )}

      <ResumoTiles
        resumo={resumo}
        situacao={situacao}
        setSituacao={setSituacao}
      />

      {pendentesPorHub.length > 1 && (
        <QuebraPorBase itens={pendentesPorHub} />
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Transportadoras
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {grupos.length}{" "}
              {grupos.length === 1 ? "transportadora" : "transportadoras"}
            </span>

            {filtradas.length > 0 && (
              <BotaoCsv
                titulo={
                  "Exportar as " +
                  filtradas.length +
                  " rotas do filtro (" +
                  (filtradas.length - pendentesTodas.length) +
                  " atribuídas, " +
                  pendentesTodas.length +
                  " sem atribuição)"
                }
                onClick={() => baixarCsv("rotas-" + dataISO + ".csv", filtradas)}
              />
            )}
          </div>
        </div>

        {grupos.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Nenhuma rota para os filtros selecionados.
          </p>
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => (
              <BarraProgresso
                key={g.chave}
                grupo={g}
                dataISO={dataISO}
                pendentes={pendentesPorTransportadora.get(g.chave) ?? []}
              atribuidas={atribuidasPorTransportadora.get(g.chave) ?? []}
                mostrarHubs={pendentesPorHub.length > 1}
                hubAberto={abertos[g.chave]}
                lado={lados[g.chave] ?? "pendentes"}
              alternar={(alvo) => alternarAberto(g.chave, alvo)}
              abrirLado={(lado, alvo) => abrirLado(g.chave, lado, alvo)}
              filtrar={() => setTransportadorasSel([g.chave])}
              />
            ))}
            <Legenda />
          </div>
        )}
      </section>
    </div>
  );
}

function ResultadosDaBusca({
  termo,
  rotas,
  diaTemMotorista,
}: {
  termo: string;
  rotas: RotaPlanejada[];
  diaTemMotorista: boolean;
}) {
  const mostradas = rotas.slice(0, 50);
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">
        {rotas.length} rota(s) para &ldquo;{termo}&rdquo;
      </h2>
      {rotas.length === 0 ? (
        <p className="py-1 text-sm text-slate-500">
          Nada com esse texto em rota, placa, motorista ou transportadora.
          {!diaTemMotorista &&
            " Este dia n\u00e3o tem motorista gravado, ent\u00e3o busca por nome n\u00e3o acha nada aqui."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Rota</th>
                <th className="px-3 py-1.5 text-left font-medium">Tipo</th>
                <th className="px-3 py-1.5 text-left font-medium">Transportadora</th>
                <th className="px-3 py-1.5 text-left font-medium">Cluster</th>
                <th className="px-3 py-1.5 text-left font-medium">HUB</th>
                <th className="px-3 py-1.5 text-left font-medium">Placa</th>
                <th className="px-3 py-1.5 text-left font-medium">Motorista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mostradas.map((r) => (
                <tr key={r.rota} className="hover:bg-slate-50">
                  <td className="px-3 py-1.5 font-medium text-slate-800">{r.rota}</td>
                  <td className="px-3 py-1.5 text-slate-600">
                    {tipoDaRota(r.tipoRota) ?? "-"}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">
                    {apelidarTransportadora(r.transportadora)}
                  </td>
                  <td className="px-3 py-1.5 text-slate-600">{r.cluster}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.regiao}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.placa}</td>
                  <td className="px-3 py-1.5 text-slate-600">{r.motorista || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rotas.length > mostradas.length && (
            <p className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500">
              Mostrando as {mostradas.length} primeiras. Refine a busca para ver o resto.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Campo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 w-52">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {titulo}
      </span>
      {children}
    </div>
  );
}

function Select({
  valor,
  setValor,
  opcoes,
  rotuloTodas,
  rotulo,
}: {
  valor: string;
  setValor: (v: string) => void;
  opcoes: string[];
  rotuloTodas: string;
  rotulo?: (v: string) => string;
}) {
  return (
    <div className="relative">
      <select
        className="w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1.5 pr-7 text-sm"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
      >
        <option value={TODAS}>{rotuloTodas}</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {rotulo ? rotulo(o) : o}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-60">&#9662;</span>
    </div>
  );
}

function MultiCluster({
  opcoes,
  selecionados,
  setSelecionados,
  rotulo = (c: string) => c,
  rotuloTodos = "Todos",
  buscaPlaceholder,
}: {
  opcoes: string[];
  selecionados: string[];
  setSelecionados: (v: string[]) => void;

  rotulo?: (c: string) => string;
  rotuloTodos?: string;

  buscaPlaceholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const [procura, setProcura] = useState("");
  const alvo = procura.trim().toLowerCase();
  const visiveis = alvo
    ? opcoes.filter((c) => rotulo(c).toLowerCase().includes(alvo))
    : opcoes;

  const rotuloBotao =
    selecionados.length === 0
      ? rotuloTodos
      : selecionados.length === 1
        ? rotulo(selecionados[0])
        : selecionados.length + " selecionados";

  const alternar = (c: string) =>
    setSelecionados(
      selecionados.includes(c)
        ? selecionados.filter((x) => x !== c)
        : [...selecionados, c],
    );

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-slate-300 px-2 py-1.5 text-left text-sm"
      >
        <span className="truncate">{rotuloBotao}</span>
        <span className="ml-2 text-slate-400">&#9662;</span>
      </button>

      {aberto && (
        <div className="absolute z-20 mt-1 max-h-64 w-48 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {buscaPlaceholder && (
            <div className="px-2 pb-1 pt-1.5">
              <input
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder={buscaPlaceholder}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
          )}
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => setSelecionados([])}
              className="w-full px-2 py-1.5 text-left text-xs text-slate-500 underline hover:bg-slate-50"
            >
              limpar selecao
            </button>
          )}
          {visiveis.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => alternar(c)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="w-4 text-gray-700">
                {selecionados.includes(c) ? "✓" : ""}
              </span>
              <span>{rotulo(c)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResumoTiles({
  resumo,
  situacao,
  setSituacao,
}: {
  resumo: ReturnType<typeof resumir>;
  situacao: Situacao;
  setSituacao: (s: Situacao) => void;
}) {
  const base =
    "rounded-lg border border-l-4 bg-white p-5 text-left shadow-sm transition hover:shadow-md";

  const classe = (alvo: Situacao, cor: string) =>
    base +
    " " +
    cor +
    (situacao === alvo
      ? " border-slate-400 ring-2 ring-slate-300"
      : " border-slate-200");

  const alternar = (alvo: Situacao) =>
    setSituacao(situacao === alvo ? "todas" : alvo);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <button
        type="button"
        onClick={() => setSituacao("todas")}
        className={classe("todas", "border-l-slate-700")}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Rotas no dia
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{resumo.total}</p>
        <p className="text-sm text-slate-500">todas</p>
      </button>

      <button
        type="button"
        onClick={() => alternar("atribuidas")}
        className={classe("atribuidas", "border-l-blue-600")}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Atribuído
        </p>
        <p className="mt-1 text-3xl font-bold text-blue-700">
          {formatarPercentual(resumo.percAtribuidas)}
        </p>
        <p className="text-sm text-slate-500">{resumo.atribuidas} rotas</p>
      </button>

      <button
        type="button"
        onClick={() => alternar("sem")}
        className={classe("sem", "border-l-[#cf1f14]")}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Sem atribuição
        </p>
        <p className="mt-1 text-3xl font-bold text-[#cf1f14]">
          {formatarPercentual(resumo.percNaoAtribuidas)}
        </p>
        <p className="text-sm text-slate-500">{resumo.naoAtribuidas} rotas</p>
      </button>
    </div>
  );
}

function QuebraPorBase({
  itens,
}: {
  itens: { regiao: string; qtd: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-rose-200 bg-rose-50 px-5 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-rose-700">
        Sem atribuição por HUB
      </span>
      {itens.map((item) => (
        <span key={item.regiao} className="flex items-center gap-2">
          <span
            className={
              "inline-block h-2.5 w-2.5 rounded-sm " + classeHub(item.regiao)
            }
          />
          <span className="text-sm text-slate-700">
            <strong className="tabular-nums text-slate-900">{item.qtd}</strong>{" "}
            {item.regiao}
          </span>
        </span>
      ))}
    </div>
  );
}

function BarraProgresso({
  grupo,
  dataISO,
  pendentes,
  atribuidas,
  mostrarHubs,
  hubAberto,
  lado,
  alternar,
  abrirLado,
  filtrar,
}: {
  grupo: Grupo;
  dataISO: string;
  pendentes: RotaPlanejada[];
  atribuidas: RotaPlanejada[];
  mostrarHubs: boolean;
  hubAberto: string | undefined;
  lado: Lado;
  alternar: (alvo: string) => void;
  abrirLado: (lado: Lado, alvo: string) => void;
  filtrar: () => void;
}) {
  const perc = grupo.percAtribuidas;
  const percNao = 100 - perc;
  const podeAbrir = pendentes.length > 0;
  const nome = apelidarTransportadora(grupo.chave);

  const aberto = hubAberto !== undefined;
  const recorteHub =
    hubAberto !== undefined && hubAberto !== TODOS_HUBS ? hubAberto : null;

  const daVez = lado === "atribuidas" ? atribuidas : pendentes;
  const visiveis = recorteHub
    ? daVez.filter((r) => r.regiao === recorteHub)
    : daVez;

  const varios = grupo.semPorRegiao.length > 1;
  const alvoDaFatia = (regiao: string) => (varios ? regiao : TODOS_HUBS);

  const descricaoNome = "Ver só a " + nome + " no painel inteiro";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={filtrar}
          title={descricaoNome}
          className={
            "w-44 shrink-0 truncate text-right text-sm font-medium text-slate-700 " +
            "cursor-pointer hover:text-slate-900 hover:underline"
          }
        >
          {nome}
        </button>

        <div className="relative flex h-9 flex-1 overflow-hidden rounded-md bg-slate-200">

          <button
            type="button"
            onClick={
              atribuidas.length > 0
                ? () => abrirLado("atribuidas", TODOS_HUBS)
                : undefined
            }
            aria-expanded={aberto && lado === "atribuidas"}
            title={
              atribuidas.length > 0
                ? "ver as " +
                  grupo.atribuidas +
                  " atribuídas da " +
                  nome +
                  " (placa e motorista)"
                : nome + ": nada atribuido ainda"
            }
            className={
              "h-full bg-blue-600 " +
              (atribuidas.length > 0 ? "cursor-pointer" : "cursor-default")
            }
            style={{ width: perc + "%" }}
          />

          {grupo.semPorRegiao.map((fatia, i) => (
            <button
              key={fatia.regiao}
              type="button"
              onClick={() => abrirLado("pendentes", alvoDaFatia(fatia.regiao))}
              aria-expanded={
                lado === "pendentes" && hubAberto === alvoDaFatia(fatia.regiao)
              }
              title={
                (varios ? fatia.regiao + ": " : "") +
                "ver as " +
                fatia.qtd +
                " rotas sem atribuição" +
                (varios ? " deste HUB" : "") +
                " da " +
                nome
              }
              className={
                "h-full cursor-pointer " +
                classeHub(fatia.regiao) +
                (i > 0 || grupo.atribuidas > 0
                  ? " ring-2 ring-inset ring-white"
                  : "")
              }
              style={{
                width:
                  (grupo.total > 0 ? (fatia.qtd / grupo.total) * 100 : 0) + "%",
              }}
            />
          ))}

          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2.5 text-xs font-semibold text-white">

            <button
              type="button"
              onClick={
                atribuidas.length > 0
                  ? () => abrirLado("atribuidas", TODOS_HUBS)
                  : undefined
              }
              title={
                atribuidas.length > 0
                  ? "ver as " + grupo.atribuidas + " atribuídas da " + nome
                  : ""
              }
              className={
                "pointer-events-auto rounded px-1.5 py-0.5 " +
                (grupo.atribuidas > 0 && perc >= 15 ? "" : "invisible") +
                (atribuidas.length > 0
                  ? " cursor-pointer hover:bg-black/30"
                  : " cursor-default")
              }
            >
              {grupo.atribuidas} atribuídas &middot; {formatarPercentual(perc)}
            </button>
            <button
              type="button"
              onClick={
                podeAbrir ? () => abrirLado("pendentes", TODOS_HUBS) : undefined
              }
              title={
                podeAbrir
                  ? "ver as " + pendentes.length + " sem atribuição da " + nome
                  : ""
              }
              className={
                "pointer-events-auto rounded px-1.5 py-0.5 " +
                (grupo.naoAtribuidas > 0 ? "bg-black/40" : "invisible") +
                (podeAbrir ? " cursor-pointer hover:bg-black/60" : " cursor-default")
              }
            >
              {(podeAbrir || atribuidas.length > 0) && (aberto ? "▾ " : "▸ ")}
              {grupo.naoAtribuidas} sem atribuição &middot;{" "}
              {formatarPercentual(percNao)}
            </button>
          </div>
        </div>

        <div className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
          {grupo.total}
        </div>
      </div>

      {mostrarHubs && grupo.semPorRegiao.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600"
          style={{ marginLeft: "11.75rem" }}
        >
          <span className="text-slate-400">sem atribuição por HUB:</span>
          {grupo.semPorRegiao.map((fatia) => (
            <button
              key={fatia.regiao}
              type="button"
              onClick={() => abrirLado("pendentes", alvoDaFatia(fatia.regiao))}
              title={"Ver as " + fatia.qtd + " de " + fatia.regiao}
              className={
                "flex items-center gap-1.5 rounded px-2 py-0.5 hover:bg-slate-200 " +
                (recorteHub === fatia.regiao ? "bg-slate-200" : "bg-slate-100")
              }
            >
              <span
                className={
                  "inline-block h-2 w-2 rounded-sm " + classeHub(fatia.regiao)
                }
              />
              <span className="font-medium tabular-nums">
                {fatia.qtd} {fatia.regiao}
              </span>
            </button>
          ))}
        </div>
      )}

      {aberto && (
        <div
          className="space-y-1"
          style={{ marginLeft: "11.75rem", marginRight: "3.75rem" }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              <button
                type="button"
                onClick={() => abrirLado(lado, TODOS_HUBS)}
                title="fechar a lista"
                className="underline hover:text-slate-800"
              >
                {visiveis.length} rota(s){" "}
                {lado === "atribuidas" ? "atribuídas" : "sem atribuição"}
              </button>
              {recorteHub ? " de " + recorteHub : ""}
              {recorteHub && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => abrirLado(lado, TODOS_HUBS)}
                    className="underline hover:text-slate-800"
                  >
                    ver os {daVez.length} de todos os HUBs
                  </button>
                </>
              )}
            </span>
            <BotaoCsv
              titulo={
                "Exportar as " +
                visiveis.length +
                " da " +
                nome +
                (recorteHub ? " em " + recorteHub : "")
              }
              onClick={() =>
                baixarCsv(
                  (lado === "atribuidas"
                    ? "rotas-atribuidas-"
                    : "rotas-sem-atribuicao-") +
                    pedacoArquivo(nome) +
                    (recorteHub ? "-" + pedacoArquivo(recorteHub) : "") +
                    "-" +
                    dataISO +
                    ".csv",
                  visiveis,
                )
              }
            />
          </div>
          <TabelaDoGrupo rotas={visiveis} lado={lado} />
        </div>
      )}
    </div>
  );
}

type ColunaTabela =
  | "rota"
  | "cluster"
  | "regiao"
  | "perfil"
  | "placa"
  | "motorista";

function TabelaDoGrupo({
  rotas,
  lado,
}: {
  rotas: RotaPlanejada[];
  lado: Lado;
}) {
  const [coluna, setColuna] = useState<ColunaTabela>("rota");
  const [crescente, setCrescente] = useState(true);
  const [procura, setProcura] = useState("");

  const comMotorista = lado === "atribuidas";

  const achadas = useMemo(() => {
    const alvo = procura.trim().toLowerCase();
    if (!alvo) return rotas;
    return rotas.filter((r) =>
      [r.rota, r.cluster, r.placa, r.motorista]
        .join(" ")
        .toLowerCase()
        .includes(alvo),
    );
  }, [rotas, procura]);

  const ordenadas = useMemo(() => {
    const copia = [...achadas];
    copia.sort((a, b) => {
      const cmp = String(a[coluna] ?? "").localeCompare(
        String(b[coluna] ?? ""),
        "pt-BR",
        { numeric: true },
      );
      return crescente ? cmp : -cmp;
    });
    return copia;
  }, [achadas, coluna, crescente]);

  const clicar = (campo: ColunaTabela) => {
    if (campo === coluna) {
      setCrescente((v) => !v);
    } else {
      setColuna(campo);
      setCrescente(true);
    }
  };

  const cabecalho = (campo: ColunaTabela, titulo: string) => (
    <th className="px-3 py-1.5 text-left font-medium">
      <button
        type="button"
        onClick={() => clicar(campo)}
        className="flex items-center gap-1 uppercase tracking-wide hover:text-slate-800"
      >
        {titulo}
        <span
          className={coluna === campo ? "text-slate-600" : "text-slate-300"}
        >
          {coluna === campo ? (crescente ? "\u25b2" : "\u25bc") : "\u21c5"}
        </span>
      </button>
    </th>
  );

  return (
    <div className="space-y-1">
      <input
        value={procura}
        onChange={(e) => setProcura(e.target.value)}
        placeholder="buscar rota"
        className="w-56 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <div className="overflow-hidden rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {cabecalho("rota", "Rota")}
              {cabecalho("cluster", "Cluster")}
              {cabecalho("regiao", "HUB")}
              <th className="px-3 py-1.5 text-left font-medium">Tipo</th>
              {cabecalho("perfil", "Perfil")}
              {comMotorista && cabecalho("placa", "Placa")}
              {comMotorista && cabecalho("motorista", "Motorista")}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ordenadas.map((r) => (
              <tr key={r.rota} className="hover:bg-slate-50">
                <td className="px-3 py-1.5 font-medium text-slate-800">
                  {r.rota}
                </td>
                <td className="px-3 py-1.5 text-slate-600">{r.cluster}</td>
                <td className="px-3 py-1.5 text-slate-600">{r.regiao}</td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {tipoDaRota(r.tipoRota) ?? "-"}
                    </td>
                <td className="px-3 py-1.5 text-slate-600">
                  <Perfil rota={r} />
                </td>
                {comMotorista && (
                  <td className="px-3 py-1.5 text-slate-600">{r.placa}</td>
                )}
                {comMotorista && (
                  <td className="px-3 py-1.5 text-slate-600">
                    {r.motorista || "\u2014"}
                  </td>
                )}
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <td
                  colSpan={comMotorista ? 7 : 5}
                  className="px-3 py-2 text-xs text-slate-500"
                >
                  Nenhuma rota com esse texto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Perfil({ rota }: { rota: RotaPlanejada }) {
  const pedido = rota.perfil || "\u2014";
  if (!(rota.atribuida && rota.perfilMenor)) return <>{pedido}</>;
  return (
    <span title="Veículo que entrou é menor que o pedido">
      {pedido}{" "}
      <span className="font-medium text-amber-700">
        {"\u2192 " + (rota.veiculoTipo || "menor")}
      </span>
    </span>
  );
}

function BotaoCsv({
  titulo,
  onClick,
}: {
  titulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
    >
      Exportar CSV
    </button>
  );
}

function Legenda() {
  return (
    <div className="flex items-center gap-4 pt-2 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-600" />
        Atribuída
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#cf1f14]" />
        Sem atribuição
      </span>
      <span className="ml-auto">
        Clique no nome da transportadora pra ver só ela. Na barra, o azul abre as
        atribuídas com placa e motorista e o vermelho as que faltam — clicando na
        fatia de um HUB, só as dele.
      </span>
    </div>
  );
}
