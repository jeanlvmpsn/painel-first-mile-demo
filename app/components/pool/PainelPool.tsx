"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import FiltroMulti from "./FiltroMulti";
import {
  alternar,
  filtrarLinhas,
  filtrosVazios,
  type FiltrosPool,
} from "../../lib/poolFiltros";
import { formatarNumero } from "../../lib/relatorioTipos";
import { useRouter } from "next/navigation";
import { SeletorPeriodo } from "../ui/filtros";

export type LinhaPoolTela = {
  transportadora: string;
  clusterBruto: string;
  cluster: string;
  perfilBruto: string;
  perfil: string;
  segSex: number;
  sab: number;
};

export type LinhaAnalise = {
  transportadora: string;
  cluster: string;
  perfil: string;
  pool: number;
  pedidos: number;
  dentroDoPool: number;
  desafio: number;
  sobra: number;
  sinergia: number;
  sinergiaCedida: number;
  aceites: number;
  recusas: number;
  semResposta: number;
  culpaPlanejamento: number;
  culpaTransportadora: number;
};

export type DadosAtribuicaoPool = {
  linhas: LinhaAnalise[];

  rotas: number;
  emAberto: number;
  melione: number;
  assumidos: number;
  motivosSemPool: { motivo: string; quantidade: number }[];
};

type Vista = "pool" | "analise" | "atribuicao";

type Ordem = { chave: string; desc: boolean };

type Coluna<T> = {
  chave: string;
  rotulo: string;
  num?: boolean;
  cor?: string;
  valor: (l: T) => string | number;
  ordenar?: (l: T) => string | number;
};

const ROTULO_MARCA: Record<string, string> = {
  dentro: "Dentro do pool",
  desafio: "Desafio",
  sinergia: "Coberto por sinergia",
  sobra: "Sobra",
};
const ROTULO_CULPA: Record<string, string> = {
  plan: "Planejamento",
  tp: "Transportadora",
};
const ROTULO_RESPOSTA: Record<string, string> = {
  aceito: "Aceito",
  recusado: "Recusado",
  sem: "Sem resposta",
};

const ROTULO_VEICULO: Record<string, string> = {
  aceito: "Com veículo",
  sem: "Sem veículo",
};

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const diaDaSemana = (br: string) => {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return DIAS[
    new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))).getUTCDay()
  ];
};

function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 w-52">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {titulo}
      </span>
      {children}
    </div>
  );
}

const BOTAO_PAGINA =
  "rounded border border-slate-200 px-3 py-1.5 font-medium text-slate-700 " +
  "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 " +
  "disabled:hover:bg-transparent";

const listar = (vals: string[]) =>
  [...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

const celulaCsv = (v: string | number) => {
  const t = String(v ?? "");
  return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
};

function baixarCsv<T>(arquivo: string, dataBR: string, colunas: Coluna<T>[], linhas: T[]) {
  const corpo = [
    ["Data", ...colunas.map((c) => c.rotulo)].map(celulaCsv).join(";"),

    ...linhas.map((l) => [dataBR, ...colunas.map((c) => (c.ordenar ?? c.valor)(l))].map(celulaCsv).join(";")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + corpo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function Tabela<T>({
  colunas,
  linhas,
  inicial,
  vazio,
  porPagina,
  exportar,
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  inicial: Ordem;
  vazio: string;
  porPagina?: number;
  exportar?: { arquivo: string; dataBR: string };
}) {
  const [ordem, setOrdem] = useState<Ordem>(inicial);
  const [pagina, setPagina] = useState(1);

  useEffect(() => setPagina(1), [linhas]);

  const ordenadas = useMemo(() => {
    const col = colunas.find((c) => c.chave === ordem.chave);
    if (!col) return linhas;
    const ler = col.ordenar ?? col.valor;
    return [...linhas].sort((a, b) => {
      const x = ler(a);
      const y = ler(b);
      const c =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "pt-BR");
      return ordem.desc ? -c : c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, ordem]);

  if (linhas.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">{vazio}</p>;
  }

  const totalPaginas = porPagina
    ? Math.max(1, Math.ceil(ordenadas.length / porPagina))
    : 1;
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = porPagina ? (paginaAtual - 1) * porPagina : 0;
  const visiveis = porPagina
    ? ordenadas.slice(inicio, inicio + porPagina)
    : ordenadas;

  const rodape =
    totalPaginas > 1 ? (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
        <span className="text-slate-500">
          {"P\u00e1gina "}
          <strong className="text-slate-800">{paginaAtual}</strong>
          {" de " + totalPaginas + " \u00b7 " + ordenadas.length + " linhas"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagina(1)}
            disabled={paginaAtual === 1}
            className={BOTAO_PAGINA}
          >
            Primeira
          </button>
          <button
            type="button"
            onClick={() => setPagina(paginaAtual - 1)}
            disabled={paginaAtual === 1}
            className={BOTAO_PAGINA}
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPagina(paginaAtual + 1)}
            disabled={paginaAtual === totalPaginas}
            className={BOTAO_PAGINA}
          >
            {"Pr\u00f3xima"}
          </button>
          <button
            type="button"
            onClick={() => setPagina(totalPaginas)}
            disabled={paginaAtual === totalPaginas}
            className={BOTAO_PAGINA}
          >
            {"\u00daltima"}
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
    {exportar && (
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => baixarCsv(exportar.arquivo, exportar.dataBR, colunas, ordenadas)}
          className="rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {"Exportar CSV (" + ordenadas.length + " linhas)"}
        </button>
      </div>
    )}
    <div className="overflow-x-auto rounded-lg border border-slate-200/80">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
          <tr>
            {colunas.map((c) => {
              const ativo = ordem.chave === c.chave;
              return (
                <th
                  key={c.chave}
                  onClick={() =>
                    setOrdem((o) =>
                      o.chave === c.chave
                        ? { chave: c.chave, desc: !o.desc }
                        : { chave: c.chave, desc: true },
                    )
                  }
                  className={
                    "cursor-pointer select-none whitespace-nowrap px-2 py-2 font-semibold " +
                    (c.num ? "text-right " : "") +
                    (ativo ? "text-gray-900" : "hover:text-gray-700")
                  }
                >
                  {c.rotulo}
                  <span className="ml-1 text-[9px] tracking-normal text-gray-400">
                    {ativo ? (ordem.desc ? "▼" : "▲") : "⇅"}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l, i) => (
            <tr key={i} className="border-t border-gray-100 even:bg-slate-50/40 hover:bg-slate-50">
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={
                    "px-2 py-2 " +
                    (c.num ? "text-right tabular-nums " : "") +
                    (c.cor ?? "")
                  }
                >
                  {c.valor(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {rodape}
    </>
  );
}

function Tile({
  r,
  v,
  cor,
  nota,
  ativo,
  aoClicar,
  dica,
}: {
  r: string;
  v: string;
  cor?: string;
  nota?: string;
  ativo?: boolean;
  aoClicar?: () => void;
  dica?: ReactNode;
}) {
  const miolo = (
    <>
      <p className="text-xs text-gray-500">{r}</p>
      <p className={"text-2xl font-bold " + (cor ?? "text-gray-900")}>{v}</p>
      {nota && (
        <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{nota}</p>
      )}
    </>
  );

  const caixa = !aoClicar ? (
    <div className="h-full rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      {miolo}
    </div>
  ) : (
    <button
      type="button"
      onClick={aoClicar}
      className={
        "h-full w-full rounded-lg border bg-white p-4 text-left shadow-sm transition " +
        (ativo
          ? "border-gray-900 ring-1 ring-gray-900"
          : "border-gray-100 hover:border-gray-400")
      }
    >
      {miolo}
    </button>
  );

  if (!dica) return caixa;

  return (
    <div className="group relative h-full">
      {caixa}
      <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-snug text-gray-600 shadow-lg group-hover:block">
        {dica}
      </div>
    </div>
  );
}

export default function PainelPool({
  iso,
  limite,
  dataBR,
  sabado,
  vistaInicial,
  aba,
  atualizadoEm,
  erro,
  linhasPool,
  analise,
  cancelados,
  assumidos,
  motivosSemPool,
  sinergiaLinhas,
  sinergiaErro,
  atribuicao,
}: {
  iso: string;
  limite: string;
  dataBR: string;
  sabado: boolean;
  vistaInicial: Vista;
  aba: string | null;
  atualizadoEm: string;
  erro: string | null;
  linhasPool: LinhaPoolTela[];
  analise: LinhaAnalise[];
  cancelados: number;
  assumidos: number;
  motivosSemPool: { motivo: string; quantidade: number }[];
  sinergiaLinhas: number;
  sinergiaErro: string | null;
  atribuicao: DadosAtribuicaoPool;
}) {
  const [vista, setVistaCrua] = useState<Vista>(vistaInicial);
  const router = useRouter();
  const [f, setF] = useState<FiltrosPool>(filtrosVazios());
  const muda = (parte: Partial<FiltrosPool>) =>
    setF((v) => ({ ...v, ...parte }));

  const setVista = (v: Vista) => {
    setVistaCrua(v);
    setF((x) => ({ ...x, culpas: [], respostas: [] }));
  };

  const opTp = useMemo(
    () =>
      listar([
        ...linhasPool.map((l) => l.transportadora),
        ...analise.map((l) => l.transportadora),
        ...atribuicao.linhas.map((l) => l.transportadora),
      ]),
    [linhasPool, analise, atribuicao],
  );
  const opPerfil = useMemo(
    () =>
      listar([
        ...linhasPool.map((l) => l.perfil),
        ...analise.map((l) => l.perfil),
        ...atribuicao.linhas.map((l) => l.perfil),
      ]),
    [linhasPool, analise, atribuicao],
  );
  const opCluster = useMemo(
    () =>
      listar([
        ...linhasPool.map((l) => l.cluster),
        ...analise.map((l) => l.cluster),
        ...atribuicao.linhas.map((l) => l.cluster),
      ]),
    [linhasPool, analise, atribuicao],
  );

  const poolFiltrado = useMemo(
    () =>
      filtrarLinhas(linhasPool, {
        ...f,
        marcas: [],
        culpas: [],
        respostas: [],
      }),
    [linhasPool, f],
  );

  const ehAtrib = vista === "atribuicao";
  const base = ehAtrib ? atribuicao.linhas : analise;
  const analiseCrua = useMemo(
    () =>
      base.map((l) => ({
        ...l,
        dentroDoPool: l.dentroDoPool - l.sinergia,
        desafio: l.desafio + l.sinergia,
        sobra: l.sobra + l.sinergiaCedida,
      })),
    [base],
  );
  const analiseFiltrada = useMemo(
    () => filtrarLinhas(analiseCrua, f),
    [analiseCrua, f],
  );

  const totalSegSex = poolFiltrado.reduce((s, l) => s + l.segSex, 0);
  const totalSabado = poolFiltrado.reduce((s, l) => s + l.sab, 0);

  const poolPorTp = useMemo(() => {
    const m = new Map<
      string,
      { transportadora: string; segSex: number; sab: number }
    >();
    for (const l of poolFiltrado) {
      const a = m.get(l.transportadora) ?? {
        transportadora: l.transportadora,
        segSex: 0,
        sab: 0,
      };
      a.segSex += l.segSex;
      a.sab += l.sab;
      m.set(l.transportadora, a);
    }
    return [...m.values()];
  }, [poolFiltrado]);

  const analisePorTp = useMemo(() => {
    const m = new Map<string, LinhaAnalise>();
    for (const l of analiseFiltrada) {
      const a = m.get(l.transportadora) ?? {
        transportadora: l.transportadora,
        cluster: "",
        perfil: "",
        pool: 0,
        pedidos: 0,
        dentroDoPool: 0,
        desafio: 0,
        sobra: 0,
        sinergia: 0,
        sinergiaCedida: 0,
        aceites: 0,
        recusas: 0,
        semResposta: 0,
        culpaPlanejamento: 0,
        culpaTransportadora: 0,
      };
      a.pool += l.pool;
      a.pedidos += l.pedidos;

      a.dentroDoPool += l.dentroDoPool + l.sinergia;
      a.desafio += l.desafio - l.sinergia;
      a.sobra += l.sobra - l.sinergiaCedida;
      a.sinergia += l.sinergia;
      a.sinergiaCedida += l.sinergiaCedida;
      a.aceites += l.aceites;
      a.recusas += l.recusas;
      a.semResposta += l.semResposta;
      a.culpaPlanejamento += l.culpaPlanejamento;
      a.culpaTransportadora += l.culpaTransportadora;
      m.set(l.transportadora, a);
    }
    return [...m.values()];
  }, [analiseFiltrada]);

  const t = useMemo(() => {
    const s = {
      pool: 0,
      pedidos: 0,
      dentroDoPool: 0,
      desafio: 0,
      sobra: 0,
      sinergia: 0,
      aceites: 0,
      recusas: 0,
      semResposta: 0,
      plan: 0,
      tp: 0,
    };
    for (const l of analiseFiltrada) {
      s.pool += l.pool;
      s.pedidos += l.pedidos;

      s.dentroDoPool += l.dentroDoPool + l.sinergia;
      s.desafio += l.desafio - l.sinergia;
      s.sobra += l.sobra - l.sinergiaCedida;
      s.sinergia += l.sinergia;
      s.aceites += l.aceites;
      s.recusas += l.recusas;
      s.semResposta += l.semResposta;
      s.plan += l.culpaPlanejamento;
      s.tp += l.culpaTransportadora;
    }
    return s;
  }, [analiseFiltrada]);

  const naAnalise = vista !== "pool";

  const P = ehAtrib
    ? { Item: "Rotas", item: "rotas", nada: "Nenhuma rota atribuída" }
    : { Item: "Pedidos", item: "pedidos", nada: "Nenhum pedido" };
  const num = (n: number) => (n ? formatarNumero(n) : "");

  const colunasResposta: Coluna<LinhaAnalise>[] = [
    { chave: "recusas", rotulo: "Recusas", num: true, cor: "text-orange-600", valor: (l) => num(l.recusas), ordenar: (l) => l.recusas },
    { chave: "plan", rotulo: "Plan.", num: true, cor: "text-blue-600", valor: (l) => num(l.culpaPlanejamento), ordenar: (l) => l.culpaPlanejamento },
    {
      chave: "tp",
      rotulo: "Transp.",
      num: true,
      cor: "font-medium text-red-600",
      valor: (l) => num(l.culpaTransportadora),
      ordenar: (l) => l.culpaTransportadora,
    },
  ];
  const colunasVeiculo: Coluna<LinhaAnalise>[] = [
    { chave: "aceites", rotulo: "Com veíc.", num: true, cor: "text-green-600", valor: (l) => num(l.aceites), ordenar: (l) => l.aceites },
    { chave: "semResposta", rotulo: "Sem veíc.", num: true, cor: "text-gray-500", valor: (l) => num(l.semResposta), ordenar: (l) => l.semResposta },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-[96rem] space-y-6 px-4 py-8">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">
            {ehAtrib ? "Atribuição × Pool" : naAnalise ? "Pedidos × Pool" : "Pool"}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {ehAtrib
              ? "As rotas que a atribuição deu a cada transportadora contra o pool dela, por cluster e perfil: quantas cabem no que ela declara ter, quantas passaram (desafio) e quantos carros sobraram. E quantas já têm veículo."
              : naAnalise
              ? "Duas camadas. A primeira julga o pedido, antes de qualquer resposta: ele cabe no que a transportadora tem? A segunda olha o que ela respondeu."
              : "Quantos carros cada transportadora declara ter em CPS, por cluster e por perfil. A semana vem da data escolhida."}
          </p>
        </header>

        <p className="text-sm text-slate-600">
          Mostrando <strong>{dataBR}</strong> &middot; {diaDaSemana(dataBR)}
        </p>

        <section className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Campo titulo="Dia">
          <SeletorPeriodo
            inicio={iso}
            fim={iso}
            aoMudar={(i) => {
              const alvo = new URLSearchParams();
              alvo.set("data", i);
              alvo.set("vista", vista);
              router.push("?" + alvo.toString());
            }}
          />
        </Campo>

          <span className="mb-1 h-8 w-px shrink-0 bg-slate-200" />

          <Campo titulo="Transportadora">
            <FiltroMulti
              rotulo="Transportadora"
              rotuloTodos="Todas"
              opcoes={opTp}
              escolhidos={f.transportadoras}
              aoMudar={(v) => muda({ transportadoras: v })}
            />
          </Campo>
          <Campo titulo="Perfil">
            <FiltroMulti
              rotulo="Perfil"
              rotuloTodos="Todos"
              opcoes={opPerfil}
              escolhidos={f.perfis}
              aoMudar={(v) => muda({ perfis: v })}
            />
          </Campo>
          <Campo titulo="Cluster">
            <FiltroMulti
              rotulo="Cluster"
              rotuloTodos="Todos"
              opcoes={opCluster}
              escolhidos={f.clusters}
              aoMudar={(v) => muda({ clusters: v })}
            />
          </Campo>

          {naAnalise && (
            <>
              <Campo titulo={"Situação"}>
                <FiltroMulti
                  rotulo={"Situação"}
                  rotuloTodos="Todas"
                  opcoes={["dentro", "desafio", "sinergia", "sobra"]}
                  rotulos={ROTULO_MARCA}
                  escolhidos={f.marcas}
                  aoMudar={(v) => muda({ marcas: v })}
                />
              </Campo>
              {!ehAtrib && (
                <Campo titulo="Culpabilidade">
                  <FiltroMulti
                    rotulo="Culpabilidade"
                    rotuloTodos="Todas"
                    opcoes={["plan", "tp"]}
                    rotulos={ROTULO_CULPA}
                    escolhidos={f.culpas}
                    aoMudar={(v) => muda({ culpas: v })}
                  />
                </Campo>
              )}
              <Campo titulo={ehAtrib ? "Veículo" : "Resposta"}>
                <FiltroMulti
                  rotulo={ehAtrib ? "Veículo" : "Resposta"}
                  rotuloTodos="Todas"
                  opcoes={ehAtrib ? ["aceito", "sem"] : ["aceito", "recusado", "sem"]}
                  rotulos={ehAtrib ? ROTULO_VEICULO : ROTULO_RESPOSTA}
                  escolhidos={f.respostas}
                  aoMudar={(v) => muda({ respostas: v })}
                />
              </Campo>
            </>
          )}

          <div className="ml-auto flex overflow-hidden rounded-md border border-slate-300 text-sm font-medium">
            {(
              [
                ["pool", "Pool"],
                ["analise", "Pedidos × Pool"],
                ["atribuicao", "Atribuição × Pool"],
              ] as [Vista, string][]
            ).map(([v, rotulo]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                aria-pressed={vista === v}
                className={
                  "px-3 py-1.5 " + (vista === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100")
                }
              >
                {rotulo}
              </button>
            ))}
          </div>
        </section>

        {erro ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-medium">{"Não deu para ler o pool"}</p>
            <p className="mt-2">{erro}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              {atualizadoEm ? (
                <>
                  {"O time do pool atualizou essa aba em "}
                  <strong>{atualizadoEm}</strong>.
                </>
              ) : (
                "Essa aba não traz carimbo de atualização."
              )}
              {naAnalise && (
                <>
                  {" · capacidade de "}
                  {sabado ? "sábado" : "segunda a sexta"}
                  {ehAtrib && (
                    <>
                      {" \u00b7 " +
                        formatarNumero(atribuicao.rotas) +
                        " rota(s) de CPS na atribuição; fora da conta: " +
                        formatarNumero(atribuicao.emAberto) +
                        " em aberto (sem transportadora ou A DEFINIR) e " +
                        formatarNumero(atribuicao.melione) +
                        " MeliOne (pool em outra base)"}
                      {atribuicao.assumidos > 0 &&
                        " \u00b7 " +
                          formatarNumero(atribuicao.assumidos) +
                          " rota(s) de quem n\u00e3o tem pool declarado entraram como 100% dentro do pool (" +
                          atribuicao.motivosSemPool.map((x) => x.quantidade + " " + x.motivo).join(" \u00b7 ") +
                          ")"}
                    </>
                  )}
                  {!ehAtrib && cancelados > 0 && (
                    <>
                      {" \u00b7 " +
                        formatarNumero(cancelados) +
                        " cancelado(s) fora da conta \u2014 o planejamento desistiu do pedido"}
                    </>
                  )}
                  {!ehAtrib && assumidos > 0 && (
                    <>
                      {" \u00b7 " +
                        formatarNumero(assumidos) +
                        " pedido(s) de quem n\u00e3o tem pool declarado entraram como 100% dentro do pool (" +
                        motivosSemPool
                          .map((x) => x.quantidade + " " + x.motivo)
                          .join(" \u00b7 ") +
                        ")"}
                    </>
                  )}
                  {sinergiaErro
                    ? " \u00b7 sinergia indispon\u00edvel: " + sinergiaErro
                    : " \u00b7 " +
                      formatarNumero(sinergiaLinhas) +
                      " linha(s) de sinergia declaradas para CPS"}
                </>
              )}
            </p>

            {naAnalise ? (
              <>
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                    {ehAtrib ? "1 · Rota atribuída contra o pool " : "1 · Pedido contra o pool "}
                    <span className="font-normal normal-case text-gray-400">
                      {ehAtrib ? "— pelo perfil pedido no planejamento" : "— antes da resposta"}
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Tile
                      r={P.Item}
                      v={formatarNumero(t.pedidos)}
                      nota={ehAtrib ? "clique para limpar situação e veículo" : "clique para limpar situação, culpa e resposta"}
                      aoClicar={() =>
                        muda({ marcas: [], culpas: [], respostas: [] })
                      }
                    />
                    <Tile
                      r="Dentro do pool"
                      v={formatarNumero(t.dentroDoPool)}
                      cor="text-green-600"
                      nota="cabem no pool dela"
                      dica={
                        <>
                          <p className="font-medium text-gray-900">
                            De onde vem esse número
                          </p>
                          <p className="mt-1">
                            {formatarNumero(t.dentroDoPool - t.sinergia) +
                              " " + P.item + " couberam no pool do próprio cluster."}
                          </p>
                          {t.sinergia > 0 ? (
                            <>
                              <p className="mt-1">
                                {formatarNumero(t.sinergia) +
                                  " " + P.item + " entraram por sinergia: carro que sobrava num cluster que a transportadora declarou que atende esse, no mesmo perfil de veículo."}
                              </p>
                              <p className="mt-1 text-gray-400">
                                {"Sem sinergia o desafio seria " +
                                  formatarNumero(t.desafio + t.sinergia) +
                                  " e a sobra " +
                                  formatarNumero(t.sobra + t.sinergia) +
                                  "."}
                              </p>
                            </>
                          ) : (
                            <p className="mt-1 text-gray-400">
                              Nenhum carro veio por sinergia neste dia.
                            </p>
                          )}
                        </>
                      }
                      ativo={f.marcas.includes("dentro")}
                      aoClicar={() =>
                        muda({ marcas: alternar(f.marcas, "dentro") })
                      }
                    />
                    <Tile
                      r="Desafio"
                      v={formatarNumero(t.desafio)}
                      cor="text-blue-600"
                      nota="acima do pool dela"
                      ativo={f.marcas.includes("desafio")}
                      aoClicar={() =>
                        muda({ marcas: alternar(f.marcas, "desafio") })
                      }
                    />
                    <Tile
                      r="Sobra"
                      v={formatarNumero(t.sobra)}
                      cor="text-amber-600"
                      nota={ehAtrib ? "pool sem rota — em carros" : "pool sem pedido — em carros"}
                      dica={
                        <>
                          <p className="font-medium text-gray-900">
                            A sobra sai do pool, não dos pedidos
                          </p>
                          <p className="mt-1">
                            {"Pool considerado no dia: " +
                              formatarNumero(t.pool) +
                              " carros. Desses, " +
                              formatarNumero(t.dentroDoPool) +
                              (ehAtrib ? " receberam rota e " : " receberam pedido e ") +
                              formatarNumero(t.sobra) +
                              " ficaram sem."}
                          </p>
                          <p className="mt-1">
                            {"Do outro lado, as " +
                              formatarNumero(t.pedidos) +
                              " " + P.item + " se dividem em " +
                              formatarNumero(t.dentroDoPool) +
                              " dentro do pool e " +
                              formatarNumero(t.desafio) +
                              " desafio."}
                          </p>
                          <p className="mt-1 text-gray-400">
                            {"Sobra menos desafio = pool menos " + P.item + ": " +
                              formatarNumero(t.sobra) +
                              " - " +
                              formatarNumero(t.desafio) +
                              " = " +
                              formatarNumero(t.pool) +
                              " - " +
                              formatarNumero(t.pedidos) +
                              "."}
                          </p>
                        </>
                      }
                      ativo={f.marcas.includes("sobra")}
                      aoClicar={() =>
                        muda({ marcas: alternar(f.marcas, "sobra") })
                      }
                    />
                  </div>
                </section>

                {ehAtrib ? (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                    {"2 · Veículo"}
                  </h2>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <Tile
                      r="Com veículo"
                      v={formatarNumero(t.aceites)}
                      cor="text-green-600"
                      nota="rota com placa na atribuição"
                      ativo={f.respostas.includes("aceito")}
                      aoClicar={() =>
                        muda({ respostas: alternar(f.respostas, "aceito") })
                      }
                    />
                    <Tile
                      r="Sem veículo"
                      v={formatarNumero(t.semResposta)}
                      cor="text-gray-400"
                      nota="transportadora ainda não alocou"
                      ativo={f.respostas.includes("sem")}
                      aoClicar={() =>
                        muda({ respostas: alternar(f.respostas, "sem") })
                      }
                    />
                    <Tile
                      r="Em aberto"
                      v={formatarNumero(atribuicao.emAberto)}
                      cor="text-red-600"
                      nota="sem transportadora ou A DEFINIR — fora da conta"
                    />
                    <Tile
                      r="MeliOne"
                      v={formatarNumero(atribuicao.melione)}
                      cor="text-gray-500"
                      nota="pool em outra base — fora da conta"
                    />
                  </div>
                </section>
                ) : (
                <section className="space-y-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                    {"2 · Depois da resposta"}
                  </h2>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                    <Tile
                      r="Aceites"
                      v={formatarNumero(t.aceites)}
                      cor="text-green-600"
                      ativo={f.respostas.includes("aceito")}
                      aoClicar={() =>
                        muda({ respostas: alternar(f.respostas, "aceito") })
                      }
                    />
                    <Tile
                      r="Recusas"
                      v={formatarNumero(t.recusas)}
                      cor="text-orange-600"
                      ativo={f.respostas.includes("recusado")}
                      aoClicar={() =>
                        muda({ respostas: alternar(f.respostas, "recusado") })
                      }
                    />
                    <Tile
                      r="Sem resposta"
                      v={formatarNumero(t.semResposta)}
                      cor="text-gray-400"
                      ativo={f.respostas.includes("sem")}
                      aoClicar={() =>
                        muda({ respostas: alternar(f.respostas, "sem") })
                      }
                    />
                    <Tile
                      r="Culpa planejamento"
                      v={formatarNumero(t.plan)}
                      cor="text-blue-600"
                      nota="recusou o que era desafio"
                      ativo={f.culpas.includes("plan")}
                      aoClicar={() => muda({ culpas: alternar(f.culpas, "plan") })}
                    />
                    <Tile
                      r="Culpa transportadora"
                      v={formatarNumero(t.tp)}
                      cor="text-red-600"
                      nota="recusou o que tinha"
                      ativo={f.culpas.includes("tp")}
                      aoClicar={() => muda({ culpas: alternar(f.culpas, "tp") })}
                    />
                  </div>
                </section>
                )}

                <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-sm font-medium text-gray-700">
                    Por transportadora
                  </h2>
                  <Tabela
                    key="analise-tp"
                    linhas={analisePorTp}
                    inicial={{ chave: "pedidos", desc: true }}
                    vazio={P.nada + " em " + dataBR + " com esses filtros."}
                    colunas={[
                      {
                        chave: "transportadora",
                        rotulo: "Transportadora",
                        valor: (l) => l.transportadora,
                      },
                      {
                        chave: "pool",
                        rotulo: "Pool",
                        num: true,
                        cor: "text-gray-500",
                        valor: (l) => l.pool,
                      },
                      {
                        chave: "pedidos",
                        rotulo: P.Item,
                        num: true,
                        valor: (l) => l.pedidos,
                      },
                      {
                        chave: "dentroDoPool",
                        rotulo: "Dentro do pool",
                        num: true,
                        cor: "text-green-600",
                        valor: (l) => num(l.dentroDoPool),
                        ordenar: (l) => l.dentroDoPool,
                      },
                      {
                        chave: "desafio",
                        rotulo: "Desafio",
                        num: true,
                        cor: "text-blue-600",
                        valor: (l) => num(l.desafio),
                        ordenar: (l) => l.desafio,
                      },
                      {
                        chave: "sobra",
                        rotulo: "Sobra",
                        num: true,
                        cor: "text-amber-600",
                        valor: (l) => num(l.sobra),
                        ordenar: (l) => l.sobra,
                      },
                      ...(ehAtrib ? colunasVeiculo : colunasResposta),
                    ]}
                  />
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                  <h2 className="mb-1 text-sm font-medium text-gray-700">
                    {"Linha a linha do pool (" + analiseFiltrada.length + ")"}
                  </h2>
                  <p className="mb-3 text-xs text-gray-500">
                    {"Cada linha é uma transportadora × cluster × perfil — o mesmo grão da planilha de pool. Sobra e desafio nunca se anulam entre clusters ou perfis diferentes."}
                  </p>
                  <Tabela
                    key="analise-linhas"
                    porPagina={60}
                    exportar={{ arquivo: (ehAtrib ? "atribuicao-x-pool-" : "pedidos-x-pool-") + iso + ".csv", dataBR }}
                    linhas={analiseFiltrada}
                    inicial={{ chave: "pedidos", desc: true }}
                    vazio="Nenhuma linha com esses filtros."
                    colunas={[
                      {
                        chave: "transportadora",
                        rotulo: "Transportadora",
                        valor: (l) => l.transportadora,
                      },
                      {
                        chave: "cluster",
                        rotulo: "Cluster",
                        valor: (l) => l.cluster || "—",
                      },
                      {
                        chave: "perfil",
                        rotulo: "Perfil",
                        valor: (l) => l.perfil || "—",
                      },
                      {
                        chave: "pool",
                        rotulo: "Pool",
                        num: true,
                        valor: (l) => l.pool,
                      },
                      {
                        chave: "pedidos",
                        rotulo: P.Item,
                        num: true,
                        valor: (l) => l.pedidos,
                      },
                      {
                        chave: "dentroDoPool",
                        rotulo: "Dentro",
                        num: true,
                        cor: "text-green-600",
                        valor: (l) => num(l.dentroDoPool),
                        ordenar: (l) => l.dentroDoPool,
                      },
                      {
                        chave: "sobraTotal",
                        rotulo: "Sobra TT",
                        num: true,
                        cor: "text-amber-600",
                        valor: (l) => num(l.sobra),
                        ordenar: (l) => l.sobra,
                      },
                      {
                        chave: "sinergiaCedida",
                        rotulo: "Sin. cedida",
                        num: true,
                        cor: "text-violet-600",
                        valor: (l) => num(l.sinergiaCedida),
                        ordenar: (l) => l.sinergiaCedida,
                      },
                      {
                        chave: "sinergia",
                        rotulo: "Sin. usada",
                        num: true,
                        cor: "text-sky-400",
                        valor: (l) => num(l.sinergia),
                        ordenar: (l) => l.sinergia,
                      },
                      {
                        chave: "desafio",
                        rotulo: "Desafio",
                        num: true,
                        cor: "text-blue-600",
                        valor: (l) => num(l.desafio),
                        ordenar: (l) => l.desafio,
                      },
                      {
                        chave: "sobra",
                        rotulo: "Sobra real",
                        num: true,
                        cor: "text-amber-600",
                        valor: (l) => num(l.sobra - l.sinergiaCedida),
                        ordenar: (l) => l.sobra - l.sinergiaCedida,
                      },
                      ...(ehAtrib
                        ? colunasVeiculo
                        : [
                            {
                              chave: "aceites",
                              rotulo: "Aceit.",
                              num: true,
                              cor: "text-gray-500",
                              valor: (l: LinhaAnalise) => num(l.aceites),
                              ordenar: (l: LinhaAnalise) => l.aceites,
                            },
                            ...colunasResposta.map((c) => (c.chave === "recusas" ? { ...c, rotulo: "Recus." } : c)),
                          ]),
                    ]}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Tile r="Semana filtrada" v={aba ?? "—"} />
                  <Tile
                    r={"Carros seg–sex"}
                    v={formatarNumero(totalSegSex)}
                  />
                  <Tile
                    r={"Carros sábado"}
                    v={formatarNumero(totalSabado)}
                  />
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-sm font-medium text-gray-700">
                    Por transportadora
                  </h2>
                  <Tabela
                    key="pool-tp"
                    linhas={poolPorTp}
                    inicial={{ chave: "segSex", desc: true }}
                    vazio="Nenhuma linha com esses filtros."
                    colunas={[
                      {
                        chave: "transportadora",
                        rotulo: "Transportadora",
                        valor: (l) => l.transportadora,
                      },
                      {
                        chave: "segSex",
                        rotulo: "Seg–Sex",
                        num: true,
                        valor: (l) => formatarNumero(l.segSex),
                        ordenar: (l) => l.segSex,
                      },
                      {
                        chave: "sab",
                        rotulo: "Sábado",
                        num: true,
                        cor: "text-gray-500",
                        valor: (l) => formatarNumero(l.sab),
                        ordenar: (l) => l.sab,
                      },
                    ]}
                  />
                </div>

                <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                  <h2 className="mb-1 text-sm font-medium text-gray-700">
                    {"Linha a linha do pool (" + poolFiltrado.length + ")"}
                  </h2>
                  <p className="mb-3 text-xs text-gray-500">
                    {"As colunas “→ lido” mostram a tradução acontecendo. Se alguma sair em vermelho, o cruzamento com o scheduling não fecha ali."}
                  </p>
                  <Tabela
                    key="pool-linhas"
                    porPagina={60}
                    exportar={{ arquivo: "pool-" + iso + ".csv", dataBR }}
                    linhas={poolFiltrado}
                    inicial={{ chave: "transportadora", desc: false }}
                    vazio="Nenhuma linha com esses filtros."
                    colunas={[
                      {
                        chave: "transportadora",
                        rotulo: "Transportadora",
                        valor: (l) => l.transportadora,
                      },
                      {
                        chave: "clusterBruto",
                        rotulo: "Cluster",
                        cor: "text-gray-500",
                        valor: (l) => l.clusterBruto,
                      },
                      {
                        chave: "cluster",
                        rotulo: "→ lido",
                        valor: (l) => l.cluster || "não reconhecido",
                      },
                      {
                        chave: "perfilBruto",
                        rotulo: "Perfil",
                        cor: "text-gray-500",
                        valor: (l) => l.perfilBruto,
                      },
                      {
                        chave: "perfil",
                        rotulo: "→ lido",
                        valor: (l) => l.perfil || "não reconhecido",
                      },
                      {
                        chave: "segSex",
                        rotulo: "Seg–Sex",
                        num: true,
                        valor: (l) => formatarNumero(l.segSex),
                        ordenar: (l) => l.segSex,
                      },
                      {
                        chave: "sab",
                        rotulo: "Sábado",
                        num: true,
                        cor: "text-gray-500",
                        valor: (l) => formatarNumero(l.sab),
                        ordenar: (l) => l.sab,
                      },
                    ]}
                  />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
