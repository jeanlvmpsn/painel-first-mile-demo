"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import AnalisesAvulsas from "./AnalisesAvulsas";

import { resumoDePacotes } from "../../lib/avulsasAnalise";

import {
  ehNaoPagar,
  MOTIVOS,
  chaveAvulsa,
  filtrarAvulsas,
  filtrosVaziosAvulsas,
  motivoPadrao,
  registroVazio,
  type Avulsa,
  type FiltrosAvulsas,
  type Registro,
} from "../../lib/avulsas";
import FiltroMulti from "../pool/FiltroMulti";
import { Campo, SeletorPeriodo } from "../ui/filtros";

type Opcoes = {
  transportadora: string[];
  cluster: string[];
  pagamento: string[];
  criador: string[];
  aprovacao: string[];
};

const CAIXA =
  "w-full rounded border border-slate-300 bg-white px-1 py-[3px] text-[11px] text-slate-800";

function Seletor({
  valor,
  opcoes,
  aoMudar,
}: {
  valor: string;
  opcoes: string[];
  aoMudar: (v: string) => void;
}) {
  const lista = !valor || opcoes.includes(valor) ? opcoes : [valor, ...opcoes];
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={CAIXA}>
      <option value="">—</option>
      {lista.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Texto({
  valor,
  aoMudar,
  dica,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  dica?: string;
}) {
  return (
    <input
      type="text"
      value={valor}
      placeholder={dica}
      onChange={(e) => aoMudar(e.target.value)}
      className={CAIXA}
    />
  );
}

const COLUNAS = [
  { chave: "id", rotulo: "ID", largura: "w-[9%]" },
  { chave: "transportadora", rotulo: "Transportadora", largura: "w-[12%]" },
  { chave: "cluster", rotulo: "Cluster", largura: "w-[6%]" },
  { chave: "motivo", rotulo: "Motivo", largura: "w-[16%]" },
  { chave: "pagamento", rotulo: "Pagto", largura: "w-[9%]" },
  { chave: "criador", rotulo: "Criador", largura: "w-[8%]" },
  { chave: "aprovacao", rotulo: "Aprovacao", largura: "w-[11%]" },
  { chave: "rotaImpactada", rotulo: "Rota impactada", largura: "w-[13%]" },
  { chave: "idRotaImpactada", rotulo: "ID rota", largura: "w-[8%]" },
  { chave: "mlpImpactado", rotulo: "MLP", largura: "w-[8%]" },
];

const inteiro = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(Math.round(n));
const umaCasa = (n: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);

function Cartao({
  titulo,
  valor,
  abaixo,
  cor,
  dica,
}: {
  titulo: string;
  valor: string;
  abaixo?: string;
  cor: { borda: string; texto: string };
  dica?: string;
}) {
  return (
    <div
      title={dica}
      className={"rounded-lg border border-l-4 bg-white p-6 shadow-sm " + cor.borda}
    >
      <h3 className="text-sm font-medium text-gray-500">{titulo}</h3>
      <p className={"text-3xl font-bold " + cor.texto}>{valor}</p>
      {abaixo ? <p className="text-xs text-gray-400">{abaixo}</p> : null}
    </div>
  );
}

const doRegistro = (r: Registro | undefined, chave: string) =>
  r ? String((r as unknown as Record<string, string>)[chave] ?? "") : "";

export default function PainelAvulsas({
  iso,
  dataFimISO,
  dataBR,
  dataFimBR,
  avulsas,
  jaRegistrados,
  opcoes,
  erro,
  rotasDoDia,
  rotasProgramadas,
}: {
  iso: string;
  dataFimISO: string;
  dataBR: string;
  dataFimBR: string;
  avulsas: Avulsa[];
  jaRegistrados: Record<string, Registro>;
  opcoes: Opcoes;
  erro: string | null;
  rotasDoDia: Record<string, string>;

  rotasProgramadas: number;
}) {
  const router = useRouter();
  const ehPeriodo = dataFimISO !== iso;

  const idDaRota = (nome: string | undefined) =>
    rotasDoDia[String(nome ?? "").trim().toUpperCase()] ?? "";
  const [rascunho, setRascunho] = useState<Record<string, Registro>>(() => {
    const inicio: Record<string, Registro> = {};
    for (const a of avulsas) {
      const ja = jaRegistrados[chaveAvulsa(a.data, a.id)];
      inicio[chaveAvulsa(a.data, a.id)] = ja
        ? {
            ...ja,
            motivo: motivoPadrao(ja.motivo),
            data: a.data || ja.data,
            transportadora: a.transportadora || ja.transportadora,
          }
        : registroVazio(a);
    }
    return inicio;
  });
  const [f, setF] = useState<FiltrosAvulsas>(filtrosVaziosAvulsas);
  const [ordem, setOrdem] = useState<{ chave: string; desc: boolean }>({
    chave: "id",
    desc: false,
  });
  const [salvando, setSalvando] = useState(false);

  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const mudar = (id: string, campo: keyof Registro, valor: string) =>
    setRascunho((r) => ({ ...r, [id]: { ...r[id], [campo]: valor } }));

  const opTransportadoras = opcoes.transportadora;

  const opClusters = [...opcoes.cluster].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

  const mostradas = useMemo(() => {
    const lista = filtrarAvulsas(avulsas, rascunho, f);
    const sinal = ordem.desc ? -1 : 1;
    return [...lista].sort((a, b) => {
      const va =
        ordem.chave === "id"
          ? a.id
          : ordem.chave === "transportadora"
            ? a.transportadora
            : doRegistro(rascunho[chaveAvulsa(a.data, a.id)], ordem.chave);
      const vb =
        ordem.chave === "id"
          ? b.id
          : ordem.chave === "transportadora"
            ? b.transportadora
            : doRegistro(rascunho[chaveAvulsa(b.data, b.id)], ordem.chave);
      return va.localeCompare(vb, "pt-BR") * sinal;
    });
  }, [avulsas, rascunho, f, ordem]);

  const pacotesDoFiltro = useMemo(
    () =>
      resumoDePacotes(
        mostradas.map((a) => ({ coletados: a.origemColeta ? a.coletados : undefined })),
      ),
    [mostradas],
  );

  const ordenarPor = (chave: string) =>
    setOrdem((o) => ({ chave, desc: o.chave === chave ? !o.desc : false }));

  const salvarTudo = async () => {
    setSalvando(true);
    setAviso(null);
    try {
      const paraGravar = Object.values(rascunho).map((r) => ({
        ...r,
        rotaImpactadaId: idDaRota(r.rotaImpactada),
      }));
      const resposta = await fetch("/api/avulsas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registros: paraGravar }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo.ok) throw new Error(corpo.erro ?? "Nao gravou.");
      setAviso({
        ok: true,
        texto:
          corpo.criadas + " nova(s) e " + corpo.atualizadas + " atualizada(s) na planilha.",
      });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto max-w-[110rem] space-y-4 px-4 py-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">Avulsas</h1>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">
            O preenchimento (motivo, cluster, pagamento, criador e aprovacao)
            agora e feito direto na planilha CONTROLE DE AVULSAS.
            Aqui ficam so os filtros e as caixas de analise.
          </p>
        </header>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
          <Campo titulo="Dia">
            <SeletorPeriodo
              inicio={iso}
              fim={dataFimISO}
              aoMudar={(i, f) => {
                const alvo = new URLSearchParams();
                alvo.set("data", i);
                if (f !== i) alvo.set("dataFim", f);
                router.push("?" + alvo.toString());
              }}
            />
          </Campo>
          <Campo titulo="Transportadora">
            <FiltroMulti
              rotulo="Transportadora"
              opcoes={opTransportadoras}
              escolhidos={f.transportadoras}
              aoMudar={(novos) => setF((x) => ({ ...x, transportadoras: novos }))}
            />
          </Campo>
          <Campo titulo="Cluster">
            <FiltroMulti
              rotulo="Cluster"
              opcoes={opClusters}
              escolhidos={f.clusters}
              aoMudar={(novos) => setF((x) => ({ ...x, clusters: novos }))}
            />
          </Campo>
          <Campo titulo="Motivo">
            <FiltroMulti
              rotulo="Motivo"
              opcoes={MOTIVOS}
              escolhidos={f.motivos}
              aoMudar={(novos) => setF((x) => ({ ...x, motivos: novos }))}
            />
          </Campo>
          <input
            type="text"
            value={f.busca}
            placeholder="ID da avulsa"
            onChange={(e) => setF((x) => ({ ...x, busca: e.target.value }))}
            className="w-36 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
          <span className="text-xs text-slate-600">
            {ehPeriodo ? `${dataBR} a ${dataFimBR}` : dataBR} · {mostradas.length} de {avulsas.length}
            {" · "}
            {mostradas.filter((a) => a.forms?.fotoBau).length} com foto do baú no Forms
          </span>
        </div>

        {avulsas.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Cartao
              titulo={ehPeriodo ? "Avulsas no período" : "Avulsas no dia"}
              valor={inteiro(mostradas.length)}
              abaixo={ehPeriodo ? `${dataBR} a ${dataFimBR}` : dataBR}
              cor={{ borda: "border-l-amber-400", texto: "text-amber-600" }}
            />
            <Cartao
              titulo="SPR (média de coletados)"
              valor={pacotesDoFiltro.comNumero ? umaCasa(pacotesDoFiltro.spr) : "\u2014"}
              abaixo={
                inteiro(pacotesDoFiltro.total) +
                " pacotes em " +
                inteiro(pacotesDoFiltro.comNumero) +
                " avulsa(s) com coletado"
              }
              cor={{ borda: "border-l-blue-500", texto: "text-blue-600" }}
              dica="Soma dos pacotes coletados dividida pelo número de avulsas com coletado conhecido (do relatório de coleta ou do histórico)."
            />
            <Cartao
              titulo="% de avulsas sobre as rotas"
              valor={
                rotasProgramadas > 0
                  ? umaCasa((avulsas.length / rotasProgramadas) * 100) + "%"
                  : "\u2014"
              }
              abaixo={
                rotasProgramadas > 0
                  ? inteiro(avulsas.length) +
                    " avulsa(s) / " +
                    inteiro(rotasProgramadas) +
                    " rotas programadas"
                  : "sem rotas gravadas na atribuição para esse período"
              }
              cor={{ borda: "border-l-orange-500", texto: "text-orange-600" }}
              dica="Todas as avulsas do dia/período dividido pelas rotas programadas nos mesmos dias (aba ATRIBUIÇÃO e HISTORICO_ATRIBUICAO). Não muda com os filtros de transportadora, cluster e motivo."
            />
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            {erro}
          </div>
        )}

        {avulsas.length === 0 && !erro && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            {ehPeriodo
              ? `Nenhuma avulsa nesse periodo entre ${dataBR} e ${dataFimBR}.`
              : "Nenhuma avulsa nesse dia."}
          </div>
        )}

        <AnalisesAvulsas
          linhas={mostradas
            .filter((a) => !ehNaoPagar(rascunho[chaveAvulsa(a.data, a.id)]?.pagamento))
            .map((a) => ({
              id: a.id,
              link: a.link,
              transportadora: a.transportadora,
              cluster: rascunho[chaveAvulsa(a.data, a.id)]?.cluster,
              motivo: rascunho[chaveAvulsa(a.data, a.id)]?.motivo,

              coletados: a.origemColeta ? a.coletados : undefined,
              forms: a.forms,
            }))}
        />
      </main>
    </div>
  );
}
