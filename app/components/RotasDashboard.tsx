"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { RotaStatus, RespostaForm } from "../lib/sheets";
import {
  contarPendentesPor,
  extrairCluster,
  truncarLabel,
  apelidarTransportadora,
  mesmaTransportadora,
} from "../lib/dashboardUtils";
import FiltrosBar from "./dashboard/FiltrosBar";
import RespostasOrfas from "./dashboard/RespostasOrfas";

import { ehNomeDedicada } from "../lib/dedicadas";
import ResumoTiles from "./dashboard/ResumoTiles";
import GraficoBarrasOfensores from "./dashboard/GraficoBarrasOfensores";
import TabelaRotas from "./dashboard/TabelaRotas";
import GraficoAdesao from "./dashboard/GraficoAdesao";
import type { PontoAdesao } from "../lib/adesao";
import {
  SEM_PERFIL,
  opcoesDePerfil,
  perfilAtendido,
  perfilCanonico,
  perfilPlanejado,
} from "../lib/atribuicaoUtils";
import { etapaDaRota, ROTULO_ETAPA, type EtapaColeta, type EtapasColeta } from "../lib/etapaColeta";

const ETAPAS: EtapaColeta[] = ["coletando", "finalizada", "nao_iniciada"];

type Props = {
  rotas: RotaStatus[];
  dataSelecionadaISO: string;

  dataFimISO?: string;
  maxDiasPeriodo?: number;

  diasSemAtribuicao?: string[];
  comparavel: boolean;
  respostasOrfas: RespostaForm[];
  respostasRepetidas: RespostaForm[];
  serieAdesao: PontoAdesao[];
  idsAvulsas?: string[];
  transpAvulsas?: Record<string, string>;

  etapasColeta?: EtapasColeta | null;
};

export default function RotasDashboard({
  rotas,
  dataSelecionadaISO,
  dataFimISO = dataSelecionadaISO,
  maxDiasPeriodo = 31,
  diasSemAtribuicao = [],
  comparavel,
  respostasOrfas,
  respostasRepetidas,
  serieAdesao,
  idsAvulsas = [],
  transpAvulsas = {},
  etapasColeta = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const transportadoras = useMemo(() => {
    const unicas = new Set(rotas.map((r) => r.transportadora).filter(Boolean));
    return Array.from(unicas).sort();
  }, [rotas]);

  const clusters = useMemo(() => {
    const unicos = new Set(
      rotas.map((r) => extrairCluster(r.rota)).filter((c): c is string => Boolean(c))
    );
    return Array.from(unicos).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [rotas]);

  const [transportadora, setTransportadora] = useState<string>(
    () => searchParams.get("transportadora") ?? "Todas"
  );
  const [clustersSelecionados, setClustersSelecionados] = useState<string[]>(
    () => {
      const raw = searchParams.get("clusters");
      return raw ? raw.split(",").filter(Boolean) : [];
    }
  );
  const listaDaUrl = (nome: string) => {
    const raw = searchParams.get(nome);
    return raw ? raw.split(",").filter(Boolean) : [];
  };
  const [planejadosSelecionados, setPlanejadosSelecionados] = useState<string[]>(
    () => listaDaUrl("planejado")
  );
  const [atendidosSelecionados, setAtendidosSelecionados] = useState<string[]>(
    () => listaDaUrl("atendido")
  );

  const perfisPlanejados = useMemo(
    () => opcoesDePerfil(rotas.map(perfilPlanejado)),
    [rotas]
  );
  const perfisAtendidos = useMemo(
    () => opcoesDePerfil(rotas.map(perfilAtendido)),
    [rotas]
  );
  const [busca, setBusca] = useState(() => searchParams.get("busca") ?? "");
  const [statusSelecionado, setStatusSelecionado] = useState<
    "todas" | "concluida" | "pendente" | "ns" | "avulsas" | "ded"
  >(() => {
    const raw = searchParams.get("status");
    return raw === "concluida" || raw === "pendente" || raw === "ns" || raw === "ded"
      ? raw
      : "todas";
  });
  const [nseFiltro, setNseFiltro] = useState<"todas" | "sim" | "ns">(() => {
    const raw = searchParams.get("nse");
    return raw === "sim" ? "sim" : "todas";
  });

  const [coletaFiltro, setColetaFiltro] = useState<string[]>(() =>
    listaDaUrl("coleta").filter((e) => (ETAPAS as string[]).includes(e)),
  );
  const etapaDe = (r: RotaStatus): EtapaColeta | null =>
    etapasColeta ? etapaDaRota(etapasColeta, r.rota, r.idRota) : null;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (transportadora === "Todas") query.delete("transportadora");
    else query.set("transportadora", transportadora);

    if (clustersSelecionados.length === 0) query.delete("clusters");
    else query.set("clusters", clustersSelecionados.join(","));

    if (planejadosSelecionados.length === 0) query.delete("planejado");
    else query.set("planejado", planejadosSelecionados.join(","));

    if (atendidosSelecionados.length === 0) query.delete("atendido");
    else query.set("atendido", atendidosSelecionados.join(","));

    if (busca.trim() === "") query.delete("busca");
    else query.set("busca", busca);

    if (statusSelecionado === "todas") query.delete("status");
    else query.set("status", statusSelecionado);

    if (nseFiltro === "todas") query.delete("nse");
    else query.set("nse", nseFiltro);

    if (coletaFiltro.length === 0) query.delete("coleta");
    else query.set("coleta", coletaFiltro.join(","));

    const queryString = query.toString();
    const novaUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    window.history.replaceState(null, "", novaUrl);
  }, [
    transportadora,
    clustersSelecionados,
    planejadosSelecionados,
    atendidosSelecionados,
    busca,
    statusSelecionado,
    nseFiltro,
    coletaFiltro,
  ]);

  function alternarCluster(c: string) {
    setClustersSelecionados((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  const [orfasAbertas, setOrfasAbertas] = useState(false);

  const orfasFiltradas = useMemo(() => {
    return respostasOrfas.filter(
      (r) =>
        (transportadora === "Todas" || r.transportadora === transportadora) &&
        (planejadosSelecionados.length === 0 ||
          planejadosSelecionados.includes(SEM_PERFIL)) &&
        (atendidosSelecionados.length === 0 ||
          atendidosSelecionados.includes(perfilCanonico(r.perfilVeiculo) || SEM_PERFIL)),
    );
  }, [respostasOrfas, transportadora, planejadosSelecionados, atendidosSelecionados]);

  const rotasFiltradas = useMemo(() => {
    return rotas.filter((r) => {
      const bateTransportadora =
        transportadora === "Todas" || r.transportadora === transportadora;
      const clusterDaRota = extrairCluster(r.rota);
      const bateCluster =
        clustersSelecionados.length === 0 ||
        (clusterDaRota !== null && clustersSelecionados.includes(clusterDaRota));
      const batePerfil =
        (planejadosSelecionados.length === 0 ||
          planejadosSelecionados.includes(perfilPlanejado(r))) &&
        (atendidosSelecionados.length === 0 ||
          atendidosSelecionados.includes(perfilAtendido(r)));
      const bateBusca =
        busca.trim() === "" ||
        r.rota.toLowerCase().includes(busca.trim().toLowerCase()) ||
        r.placa.toLowerCase().includes(busca.trim().toLowerCase());
      const etapa = etapasColeta ? etapaDaRota(etapasColeta, r.rota, r.idRota) : null;
      const bateColeta = coletaFiltro.length === 0 || (etapa !== null && coletaFiltro.includes(etapa));
      return bateTransportadora && bateCluster && batePerfil && bateBusca && bateColeta;
    });
  }, [
    rotas,
    transportadora,
    clustersSelecionados,
    planejadosSelecionados,
    atendidosSelecionados,
    busca,
    coletaFiltro,
    etapasColeta,
  ]);

  const contagemEtapas = useMemo(() => {
    const c: Record<EtapaColeta, number> = { coletando: 0, finalizada: 0, nao_iniciada: 0 };
    if (!etapasColeta) return c;
    for (const r of rotas) c[etapaDaRota(etapasColeta, r.rota, r.idRota)]++;
    return c;
  }, [rotas, etapasColeta]);

  const rotasParaTabela = useMemo(() => {
    let resultado = rotasFiltradas;
    if (statusSelecionado === "ns") {
      resultado = resultado.filter((r) => Boolean(r.ns));
    } else if (statusSelecionado === "ded") {
      resultado = resultado.filter((r) => ehNomeDedicada(r.rota));
    } else if (statusSelecionado === "pendente") {
      resultado = resultado.filter((r) => r.status === "pendente" && !r.ns);
    } else if (
      statusSelecionado !== "todas" &&
      statusSelecionado !== "avulsas"
    ) {
      resultado = resultado.filter((r) => r.status === statusSelecionado);
    }
    if (nseFiltro === "ns") {
      resultado = resultado.filter((r) => Boolean(r.ns));
    } else if (nseFiltro === "sim") {
      resultado = resultado.filter((r) =>
        r.resposta?.estourou.trim().toLowerCase().startsWith("sim")
      );
    }
    return resultado;
  }, [rotasFiltradas, statusSelecionado, nseFiltro]);

  const pendentesPorCluster = useMemo(
    () => contarPendentesPor(rotasFiltradas, nseFiltro, (r) => extrairCluster(r.rota)),
    [rotasFiltradas, nseFiltro]
  );

  const pendentesPorTransportadora = useMemo(
    () => contarPendentesPor(rotasFiltradas, nseFiltro, (r) => r.transportadora),
    [rotasFiltradas, nseFiltro]
  );

  const resumo = useMemo(() => {
    const total = rotasFiltradas.length;
    const concluidas = rotasFiltradas.filter((r) => r.status === "concluida").length;
    const ns = rotasFiltradas.filter(
      (r) => r.status !== "concluida" && Boolean(r.ns)
    ).length;
    const pendentes = total - concluidas - ns;

    const base = total - ns;
    const percentual = base > 0 ? Math.round((concluidas / base) * 100) : 0;
    const percentualPendentes = base > 0 ? 100 - percentual : 0;
    const dedicadas = rotasFiltradas.filter((r) => ehNomeDedicada(r.rota));
    const ded = dedicadas.length;
    const dedConcluidas = dedicadas.filter((r) => r.status === "concluida").length;
    return { total, concluidas, pendentes, ns, percentual, percentualPendentes, ded, dedConcluidas };
  }, [rotasFiltradas]);

  function handlePeriodoChange(inicioISO: string, fimISO: string) {
    const umDia = 86400000;
    const paraUTC = (iso: string) => Date.parse(iso + "T00:00:00Z");
    const maxFim = new Date(paraUTC(inicioISO) + (maxDiasPeriodo - 1) * umDia)
      .toISOString()
      .slice(0, 10);
    const fim = fimISO > maxFim ? maxFim : fimISO;
    const query = new URLSearchParams(window.location.search);
    query.set("data", inicioISO);
    if (fim !== inicioISO) query.set("dataFim", fim);
    else query.delete("dataFim");
    router.push(`/?${query.toString()}`);
  }

  const avulsasDoDia = new Set(idsAvulsas.map((x) => String(x).trim()));
  const ehDeAvulsa = (r: RespostaForm) => {
    const bruto = String(r.idRota ?? "") + " " + String(r.rota ?? "");
    return (bruto.match(/[0-9]{5,}/g) ?? []).some((id) => avulsasDoDia.has(id));
  };
  const avulsasOrfas = orfasFiltradas.filter(ehDeAvulsa);

  const avulsasNoFiltro = [...avulsasDoDia].filter(
    (id) => id && (transportadora === "Todas" || mesmaTransportadora(transpAvulsas[id] ?? "", transportadora)),
  );
  const idsComForms = new Set(
    respostasOrfas.flatMap((r) => (String(r.idRota ?? "") + " " + String(r.rota ?? "")).match(/[0-9]{5,}/g) ?? []),
  );
  const avulsasFeitas = avulsasNoFiltro.filter((id) => idsComForms.has(id)).length;

  const linhasAvulsas: RotaStatus[] = avulsasOrfas.map((r) => {
    const bruto = String(r.idRota ?? "") + " " + String(r.rota ?? "");
    const id = (bruto.match(/[0-9]{5,}/) ?? [])[0] ?? String(r.rota ?? "");
    return {
      rota: id,
      start: "",
      transportadora: r.transportadora,
      placa: r.placa,
      status: "avulsa" as const,
      resposta: r,
    };
  });

  const orfasSemAvulsas = orfasFiltradas.filter((r) => !ehDeAvulsa(r));

  return (
    <div className="space-y-6">
      <FiltrosBar
        dataSelecionadaISO={dataSelecionadaISO}
        dataFimISO={dataFimISO}
        onPeriodoChange={handlePeriodoChange}
        perfisPlanejados={perfisPlanejados}
        planejadosSelecionados={planejadosSelecionados}
        setPlanejadosSelecionados={setPlanejadosSelecionados}
        perfisAtendidos={perfisAtendidos}
        atendidosSelecionados={atendidosSelecionados}
        setAtendidosSelecionados={setAtendidosSelecionados}
        transportadoras={transportadoras}
        transportadora={transportadora}
        setTransportadora={setTransportadora}
        clusters={clusters}
        clustersSelecionados={clustersSelecionados}
        alternarCluster={alternarCluster}
        setClustersSelecionados={setClustersSelecionados}
        busca={busca}
        setBusca={setBusca}
        nseFiltro={nseFiltro}
        setNseFiltro={setNseFiltro}
        coleta={
          etapasColeta
            ? {
                opcoes: ETAPAS,
                selecionados: coletaFiltro,
                setSelecionados: setColetaFiltro,
                rotulo: (e: string) => ROTULO_ETAPA[e as EtapaColeta] + " (" + contagemEtapas[e as EtapaColeta] + ")",
              }
            : null
        }
      />

      {!comparavel && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-4">
          {diasSemAtribuicao.length > 0
            ? "Não temos lista de atribuição salva para " +
              diasSemAtribuicao.join(", ") +
              ": nesses dias só aparecem as rotas que tiveram resposta no Forms, sem as pendentes."
            : "Não temos uma lista de atribuição salva pra essa data, então só conseguimos mostrar as rotas que tiveram resposta no Forms — não dá pra saber quais ficaram pendentes nesse dia."}
        </div>
      )}

      <div id="respostas-orfas">
        <RespostasOrfas
                respostas={orfasSemAvulsas}
            repetidas={respostasRepetidas}
                dataSelecionadaISO={dataSelecionadaISO}
          aberta={orfasAbertas}
          setAberta={setOrfasAbertas}
              />
      </div>

      <ResumoTiles
        avulsas={avulsasOrfas.length}
        avulsasFeitas={avulsasFeitas}
        avulsasTotal={avulsasNoFiltro.length}
        total={resumo.total}
        concluidas={resumo.concluidas}
        pendentes={resumo.pendentes}
        ns={resumo.ns}
        ded={resumo.ded}
        dedConcluidas={resumo.dedConcluidas}
        percentual={resumo.percentual}
        percentualPendentes={resumo.percentualPendentes}
        statusSelecionado={statusSelecionado}
        setStatusSelecionado={setStatusSelecionado}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GraficoBarrasOfensores
          titulo="Clusters ofensores"
          dados={pendentesPorCluster}
          nomeCategoria="Cluster"
          larguraEixoY={48}
          corBase="#fb923c"
          corSelecionada="#c2410c"
          estaSelecionado={(chave) => clustersSelecionados.includes(chave)}
          onClickBarra={(chave) => alternarCluster(chave)}
        />
        <GraficoBarrasOfensores
          titulo="Transportadoras ofensoras"
          dados={pendentesPorTransportadora}
          nomeCategoria="Transportadora"
          larguraEixoY={110}
          corBase="#60a5fa"
          corSelecionada="#1d4ed8"
          estaSelecionado={(chave) => transportadora === chave}
          onClickBarra={(chave) =>
            setTransportadora((atual) => (atual === chave ? "Todas" : chave))
          }
          formatarRotuloEixo={(chave) => truncarLabel(apelidarTransportadora(chave))}
          formatarRotuloTooltip={(chave) => apelidarTransportadora(chave)}
        />
      </div>

      <GraficoAdesao pontos={serieAdesao} />

      <TabelaRotas
        rotas={
          statusSelecionado === "avulsas" ? linhasAvulsas : rotasParaTabela
        }
        dataSelecionadaISO={dataSelecionadaISO}
        etapaDe={etapasColeta ? etapaDe : undefined}
      />
    </div>
  );
}
