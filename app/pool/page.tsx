import type { Metadata } from "next";

import PainelPool from "../components/pool/PainelPool";
import {
  clusterCanonico,
  confrontarPool,
  motivoDeFora,
  nomesUnificados,
  transportadoraCanonica,
  type LinhaPool,
} from "../lib/pool";
import { getPoolCps } from "../lib/poolDados";
import { getRotasPlanejadas } from "../lib/atribuicoes";
import { ehTransportadoraFake } from "../lib/gapRotas";
import { lerScheduling } from "../lib/scheduling";
import { perfilCanonico, tipoDaRota } from "../lib/atribuicaoUtils";
import { ehDeCampinas, somenteCampinas } from "../lib/hubs";
import { ehSabado } from "../lib/relatorioTipos";
import { getSinergiasCps } from "../lib/sinergiaDados";
import { aplicarSinergia, montarAtendimentos } from "../lib/sinergia";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pool - FM-CPS",
  description: "Pool de veiculos de CPS contra os pedidos de scheduling e a atribuicao",
};

const TZ = "America/Sao_Paulo";
const hojeISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const isoParaBR = (iso: string) => iso.split("-").reverse().join("/");
const somarDias = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

const DIAS_A_FRENTE = 4;

export default async function PoolPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; vista?: string }>;
}) {
  const sp = await searchParams;

  const limite = somarDias(hojeISO(), DIAS_A_FRENTE);
  const pedida = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "") ? sp.data! : hojeISO();
  const iso = pedida > limite ? limite : pedida;
  const dataBR = isoParaBR(iso);
  const sabado = ehSabado(dataBR);

  const [pool, scheduling, sinergias, rotasDoDia] = await Promise.all([
    getPoolCps(dataBR),
    lerScheduling(),
    getSinergiasCps(),
    getRotasPlanejadas(dataBR, isoParaBR(hojeISO())),
  ]);

  const doDia = scheduling.filter(
    (p) => p.data === dataBR && ehDeCampinas(p.hub),
  );

  const cancelados = doDia.filter((p) => p.situacao === "cancelado").length;
  const vivos = doDia.filter((p) => p.situacao !== "cancelado");

  const analisar = (vivos: { transportadora: string; cluster: string; perfil: string; situacao: string | null }[]) => {
    const comPool = vivos.filter((p) => !motivoDeFora(p));
    const semPool = vivos.filter((p) => motivoDeFora(p));

    const contagem = new Map<string, number>();
    for (const p of semPool) {
      const m = motivoDeFora(p);
      if (m) contagem.set(m, (contagem.get(m) ?? 0) + 1);
    }
    const motivosSemPool = [...contagem.entries()].map(
      ([motivo, quantidade]) => ({ motivo, quantidade }),
    );

    const sintetico = new Map<string, LinhaPool>();
    for (const p of semPool) {
      const cluster = clusterCanonico(p.cluster);
      const perfil = perfilCanonico(p.perfil);
      const k =
        transportadoraCanonica(p.transportadora) + "|" + cluster + "|" + perfil;
      const l = sintetico.get(k) ?? {
        transportadora: p.transportadora,
        hub: "CPS",
        cluster,
        perfil,
        segSex: 0,
        sabado: 0,
        semana: 0,
        ano: 0,
      };
      if (sabado) l.sabado += 1;
      else l.segSex += 1;
      sintetico.set(k, l);
    }

    const opcoes = { sabado, normalizarPerfil: perfilCanonico };
    const julgados = confrontarPool(comPool, pool.linhas, opcoes);
    const assumidos = confrontarPool(semPool, [...sintetico.values()], opcoes);

    const nomePorChave = new Map<string, string>();
    for (const l of pool.linhas) {
      const k = transportadoraCanonica(l.transportadora);
      if (k && !nomePorChave.has(k)) nomePorChave.set(k, l.transportadora);
    }
    for (const b of [...julgados, ...assumidos]) {
      const k = transportadoraCanonica(b.transportadora);
      if (k) nomePorChave.set(k, b.transportadora);
    }
    const exibir = (nome: string) =>
      nomePorChave.get(transportadoraCanonica(nome)) ?? nome;

    const linhasPool = pool.linhas.map((l) => ({
      transportadora: exibir(l.transportadora),
      clusterBruto: l.cluster,
      cluster: clusterCanonico(l.cluster),
      perfilBruto: l.perfil,
      perfil: perfilCanonico(l.perfil),
      segSex: l.segSex,
      sab: l.sabado,
    }));

    const brutas = [...julgados, ...assumidos]
      .filter((b) => b.pedidos > 0 || b.sobra > 0)
      .map((b) => ({
        transportadora: exibir(b.transportadora),
        cluster: b.cluster,
        perfil: b.perfil,
        pool: b.pool,
        pedidos: b.pedidos,
        dentroDoPool: b.dentroDoPool,
        desafio: b.desafio,
        sobra: b.sobra,
        sinergia: 0,
        sinergiaCedida: 0,
        aceites: b.aceites,
        recusas: b.recusas,
        semResposta: b.semResposta,
        culpaPlanejamento: b.culpaPlanejamento,
        culpaTransportadora: b.culpaTransportadora,
      }));

    const atendimentos = montarAtendimentos(
      sinergias.linhas,
      transportadoraCanonica,
      clusterCanonico,
    );
    const analise = aplicarSinergia(brutas, atendimentos, transportadoraCanonica);
    return { analise, linhasPool, assumidos: semPool.length, motivosSemPool };
  };

  const doScheduling = analisar(vivos);

  const rotasCps = somenteCampinas(rotasDoDia);
  const emAberto = rotasCps.filter((r) => !String(r.transportadora ?? "").trim() || ehTransportadoraFake(r.transportadora)).length;
  const melione = rotasCps.filter((r) => tipoDaRota(r.tipoRota) === "MeliOne").length;
  const rotasComDono = rotasCps.filter(
    (r) => String(r.transportadora ?? "").trim() && !ehTransportadoraFake(r.transportadora) && tipoDaRota(r.tipoRota) !== "MeliOne",
  );
  const daAtribuicao = analisar(
    rotasComDono.map((r) => ({
      transportadora: r.transportadora,
      cluster: r.cluster,

      perfil: r.perfil || r.veiculoTipo || "",
      situacao: r.atribuida ? "aceite" : null,
    })),
  );

  const exibir = nomesUnificados(
    pool.linhas.map((l) => l.transportadora),
    rotasComDono.map((r) => r.transportadora),
    vivos.map((p) => p.transportadora),
  );
  const comNome = <T extends { transportadora: string }>(ls: T[]): T[] =>
    ls.map((l) => ({ ...l, transportadora: exibir(l.transportadora) }));
  doScheduling.linhasPool = comNome(doScheduling.linhasPool);
  doScheduling.analise = comNome(doScheduling.analise);
  daAtribuicao.analise = comNome(daAtribuicao.analise);

  const vista = sp.vista === "analise" || sp.vista === "atribuicao" ? sp.vista : "pool";

  return (
    <PainelPool
      key={vista + "|" + iso}
      iso={iso}
      limite={limite}
      dataBR={dataBR}
      sabado={sabado}
      vistaInicial={vista}
      aba={pool.aba}
      atualizadoEm={pool.atualizadoEm}
      erro={pool.erro}
      linhasPool={doScheduling.linhasPool}
      analise={doScheduling.analise}
      cancelados={cancelados}
      assumidos={doScheduling.assumidos}
      motivosSemPool={doScheduling.motivosSemPool}
      atribuicao={{
        linhas: daAtribuicao.analise,
        rotas: rotasCps.length,
        emAberto,
        melione,
        assumidos: daAtribuicao.assumidos,
        motivosSemPool: daAtribuicao.motivosSemPool,
      }}
      sinergiaLinhas={sinergias.linhas.length}
      sinergiaErro={sinergias.erro}
    />
  );
}
