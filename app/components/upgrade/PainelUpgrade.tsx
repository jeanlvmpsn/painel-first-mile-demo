"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CORTE_PADRAO,
  MOTIVOS_UPGRADE,
  DIAS_RECENTES,
  PISO_BASE,
  PISO_BUSCA,
  ROTULO_STATUS,
  avaliar,
  idValido,
  estadoDoSeller,
  nomeDoPdf,
  motivoDaRecusa,
  seloSolicitacao,
  ativacaoDoUpgrade,
  type AtivacaoUpgrade,
  type Candidato,
  type LinhaDrop,
  type MotivoUpgrade,
  type Solicitacao,
  type Status,
} from "../../lib/upgrade";
import FiltroMulti from "../pool/FiltroMulti";
import { Campo, SeletorPeriodo } from "../ui/filtros";

const inteiro = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));
const br = (iso: string) => iso.split("-").reverse().join("/");

type Info = {
  atualizadoEm: string;
  baseInicio: string;
  baseFim: string;
  inicio: string;
  fim: string;
};

async function pegar(params: Record<string, string>) {
  const r = await fetch("/api/upgrade?" + new URLSearchParams(params).toString(), {
    cache: "no-store",
  });
  const json = await r.json().catch(() => ({ ok: false, erro: "Resposta invalida do servidor." }));
  if (!json.ok) throw new Error(json.erro ?? "Falhou.");
  return json;
}

const COR_STATUS: Record<Status, string> = {
  passivel: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "em-alta": "bg-sky-50 text-sky-800 border-sky-200",
  "em-baixa": "bg-amber-50 text-amber-800 border-amber-200",
  abaixo: "bg-slate-100 text-slate-600 border-slate-200",
};

function Selo({ status }: { status: Status }) {
  return (
    <span
      className={
        "inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium " +
        COR_STATUS[status]
      }
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

function Cartao({
  titulo,
  valor,
  abaixo,
  borda,
}: {
  titulo: string;
  valor: React.ReactNode;
  abaixo?: string;
  borda: string;
}) {
  return (
    <div className={"rounded-lg border border-l-4 bg-white p-4 shadow-sm " + borda}>
      <h3 className="text-sm font-medium text-gray-500">{titulo}</h3>
      <div className="text-2xl font-bold text-slate-900">{valor}</div>
      {abaixo ? <p className="text-xs text-gray-400">{abaixo}</p> : null}
    </div>
  );
}

function TabelaDrops({ linhas }: { linhas: LinhaDrop[] }) {
  return (
    <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-sky-50 text-left text-[11px] text-slate-600">
          <tr>
            <th className="px-2 py-1.5 font-medium">Data do drop</th>
            <th className="px-2 py-1.5 font-medium">ID seller</th>
            <th className="px-2 py-1.5 font-medium">Seller</th>
            <th className="px-2 py-1.5 font-medium">ID place</th>
            <th className="px-2 py-1.5 font-medium">Place</th>
            <th className="px-2 py-1.5 text-right font-medium">Estimados</th>
            <th className="px-2 py-1.5 text-right font-medium">Coletados</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l, i) => (
            <tr key={l.data + l.sellerId + l.placeId + i} className="hover:bg-slate-50">
              <td className="px-2 py-1">{br(l.data)}</td>
              <td className="px-2 py-1 font-mono">{l.sellerId}</td>
              <td className="px-2 py-1">{l.sellerNome}</td>
              <td className="px-2 py-1 font-mono">{l.placeId}</td>
              <td className="px-2 py-1">{l.placeNome}</td>
              <td className="px-2 py-1 text-right">{inteiro(l.estimados)}</td>
              <td className="px-2 py-1 text-right">{inteiro(l.coletados)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuscaId({
  titulo,
  dica,
  valor,
  setValor,
  aoBuscar,
  carregando,
}: {
  titulo: string;
  dica: string;
  valor: string;
  setValor: (v: string) => void;
  aoBuscar: () => void;
  carregando: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoBuscar();
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <Campo titulo={titulo}>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={dica}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm"
        />
      </Campo>
      <button
        type="submit"
        disabled={carregando}
        className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {carregando ? "Buscando..." : "Buscar"}
      </button>
    </form>
  );
}

type CampoOrdem =
  | "sellerId"
  | "sellerNome"
  | "placeNome"
  | "cluster"
  | "dias"
  | "estimados"
  | "coletados"
  | "recente"
  | "status"
  // Status Solicitacao: depende das solicitacoes, ordenado no componente.
  | "solicitacao";

const PESO_STATUS: Record<Status, number> = {
  passivel: 0,
  "em-alta": 1,
  "em-baixa": 2,
  abaixo: 3,
};

function valorOrdem(c: Candidato, campo: CampoOrdem): number | string {
  switch (campo) {
    case "sellerId":
      return Number(c.sellerId) || 0;
    case "sellerNome":
      return c.sellerNome;
    case "placeNome":
      return c.placeNome || c.placeId;
    case "cluster":

      return c.cluster || "~";
    case "dias":
      return c.geral.dias;
    case "estimados":
      return c.geral.estimados;
    case "coletados":
      return c.geral.coletados;
    case "recente":
      return c.recente.dias ? c.recente.estimados : -1;
    case "status":
      return PESO_STATUS[c.status];
    case "solicitacao":
      return 0;
  }
}

function Titulo({
  titulo,
  campo,
  ordem,
  setOrdem,
  direita,
}: {
  titulo: string;
  campo: CampoOrdem;
  ordem: { campo: CampoOrdem | null; desc: boolean };
  setOrdem: (o: { campo: CampoOrdem; desc: boolean }) => void;
  direita?: boolean;
}) {
  const ativa = ordem.campo === campo;
  return (
    <th className={"px-2 py-1.5 font-medium " + (direita ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => setOrdem({ campo, desc: ativa ? !ordem.desc : campo !== "status" })}
        className={"hover:text-slate-900 " + (ativa ? "text-slate-900" : "")}
      >
        {titulo}
        <span className="ml-1 text-[10px]">{ativa ? (ordem.desc ? "▼" : "▲") : "⇅"}</span>
      </button>
    </th>
  );
}

const ler = (chave: string) => {
  try {
    return window.localStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
};
const guardar = (chave: string, valor: string) => {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento: so nao lembra na proxima vez
  }
};

type Pedido = {
  estado: "enviando" | "na-fila" | "pronto" | "registrado" | "erro";
  pedido?: string;
  link?: string;
  erro?: string;
};

export default function PainelUpgrade({ hojeISO }: { hojeISO: string }) {
  const [corte, setCorte] = useState(CORTE_PADRAO);
  const [periodo, setPeriodo] = useState<{ inicio: string; fim: string } | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [lista, setLista] = useState<Candidato[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [solicitantes, setSolicitantes] = useState<string[]>([]);
  const [avisoSol, setAvisoSol] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregarResumo = useCallback(
    async (p: { inicio: string; fim: string } | null, c: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await pegar({
          acao: "resumo",
          corte: String(c),
          ...(p ? { inicio: p.inicio, fim: p.fim } : {}),
        });
        setInfo(r.info);
        setPeriodo({ inicio: r.info.inicio, fim: r.info.fim });
        setLista(r.candidatos);
        setSolicitacoes(r.solicitacoes);
        setSolicitantes(r.solicitantes);
        setAvisoSol(r.avisoSolicitacao ?? "");
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    carregarResumo(null, CORTE_PADRAO);
  }, [carregarResumo]);

  const porSeller = useMemo(() => {
    const m = new Map<string, Solicitacao[]>();
    for (const s of solicitacoes) m.set(s.sellerId, [...(m.get(s.sellerId) ?? []), s]);
    return m;
  }, [solicitacoes]);

  const ativacaoDe = (id: string): AtivacaoUpgrade | null => {
    const s = porSeller.get(id);
    if (!s?.length) return null;
    const ultima = s[s.length - 1];
    if (seloSolicitacao(ultima.status, ultima.statusFinal).tom !== "aceito") return null;
    return ativacaoDoUpgrade(ultima.prazoAtivacao, hojeISO);
  };

  const pesoSolicitacao = (id: string): number => {
    const s = porSeller.get(id);
    if (!s?.length) return 0;
    const ultima = s[s.length - 1];
    const tom = seloSolicitacao(ultima.status, ultima.statusFinal).tom;
    if (tom === "aceito") {
      const a = ativacaoDoUpgrade(ultima.prazoAtivacao, hojeISO);
      if (a?.estado === "concluida") return 7;
      if (a) {
        const iso = a.dataBR.split("/").reverse().join("");
        return 6 - Number(iso) / 1e9;
      }
      return 5;
    }
    return tom === "solicitado" ? 4 : tom === "pendente" ? 3 : 2;
  };

  const jaSolicitado = (id: string) => {
    const s = porSeller.get(id);
    if (!s?.length) return null;
    const ultima = s[s.length - 1];
    const selo = seloSolicitacao(ultima.status, ultima.statusFinal);
    const ajuda = [
      ultima.placeNome || ultima.placeId,
      ultima.statusFinal &&
        ultima.statusFinal + (ultima.origemFinal === "base" ? " (base original)" : ultima.origemFinal === "copia" ? " (cópia da aba)" : ""),
      ultima.resultado,
      ultima.feedback,
    ]
      .filter(Boolean)
      .join(" · ");
    const cor =
      selo.tom === "recusado"
        ? "text-red-700"
        : selo.tom === "pendente"
          ? "text-amber-700"
          : selo.tom === "aceito"
            ? "text-emerald-700"
            : "text-violet-700";
    const ativacao = ativacaoDe(id);
    const motivo = motivoDaRecusa(ultima);
    return (
      <>
        <span className={"text-[11px] font-medium " + cor} title={ajuda || undefined}>
          {ultima.link ? (
            <a href={ultima.link} target="_blank" rel="noreferrer" className="underline">
              {selo.texto}
            </a>
          ) : (
            selo.texto
          )}
        </span>
        {ativacao && (
          <span
            className={
              "rounded px-1.5 py-px text-[10px] font-medium " +
              (ativacao.estado === "concluida" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800")
            }
            title="PRAZO ATIVAÇÃO: a partir dessa data o seller entra na roteirização, com coleta direta"
          >
            {ativacao.estado === "concluida"
              ? "Ativação concluída (" + ativacao.dataBR + ")"
              : "Ativação em " + ativacao.dataBR}
          </span>
        )}

        {motivo && (
          <span
            className="block max-w-[260px] truncate text-[10px] text-red-700/80"
            title={[ultima.resultado, ultima.feedback].filter(Boolean).join(" · ")}
          >
            Motivo: {motivo}
          </span>
        )}
      </>
    );
  };

  const [filtroStatus, setFiltroStatus] = useState<Status | "todos">("passivel");

  const [filtroAtivacao, setFiltroAtivacao] = useState<"todos" | "agendada" | "concluida">("todos");
  const [procura, setProcura] = useState("");
  const [mostrar, setMostrar] = useState(50);

  const [clustersSel, setClustersSel] = useState<string[]>([]);
  const opcoesCluster = useMemo(
    () => [...new Set(lista.map((c) => c.cluster).filter(Boolean))].sort(),
    [lista],
  );
  const doCluster = useMemo(
    () =>
      clustersSel.length === 0
        ? lista
        : lista.filter((c) => clustersSel.includes(c.cluster)),
    [lista, clustersSel],
  );

  const [ordem, setOrdem] = useState<{ campo: CampoOrdem | null; desc: boolean }>({
    campo: null,
    desc: true,
  });
  const filtrada = useMemo(() => {
    const alvo = procura.trim().toLowerCase();
    const achados = doCluster.filter(
      (c) =>
        (filtroStatus === "todos" || c.status === filtroStatus) &&
        (filtroAtivacao === "todos" || ativacaoDe(c.sellerId)?.estado === filtroAtivacao) &&
        (!alvo ||
          (c.sellerId + " " + c.sellerNome + " " + c.placeNome + " " + c.placeId)
            .toLowerCase()
            .includes(alvo)),
    );
    const campo = ordem.campo;
    if (!campo) return achados;
    const sinal = ordem.desc ? -1 : 1;
    return [...achados].sort((a, b) => {
      const va = campo === "solicitacao" ? pesoSolicitacao(a.sellerId) : valorOrdem(a, campo);
      const vb = campo === "solicitacao" ? pesoSolicitacao(b.sellerId) : valorOrdem(b, campo);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "pt-BR");

      return cmp * sinal || b.geral.estimados - a.geral.estimados;
    });
    // ativacaoDe depende de porSeller e hojeISO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doCluster, filtroStatus, filtroAtivacao, procura, ordem, porSeller, hojeISO]);
  const contagem = useMemo(() => {
    const n: Record<Status, number> = { passivel: 0, "em-alta": 0, "em-baixa": 0, abaixo: 0 };
    for (const c of doCluster) n[c.status] += 1;
    return n;
  }, [doCluster]);

  const [sellerId, setSellerId] = useState("");
  const [seller, setSeller] = useState<{ id: string; linhas: LinhaDrop[] } | null>(null);
  const [buscandoSeller, setBuscandoSeller] = useState(false);
  const [erroSeller, setErroSeller] = useState<string | null>(null);
  const blocoSeller = useRef<HTMLElement>(null);
  const [placeEscolhido, setPlaceEscolhido] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [estado, setEstado] = useState("SP");

  const [motivo, setMotivo] = useState<MotivoUpgrade>("quantidade");
  const [placeManual, setPlaceManual] = useState("");
  const [placeNomeManual, setPlaceNomeManual] = useState("");

  const [sellerNomeManual, setSellerNomeManual] = useState("");
  const [evidenciaVolume, setEvidenciaVolume] = useState("");

  const comPdf = motivo === "quantidade";
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    setSolicitante(ler("upgrade.solicitante"));
  }, []);

  const buscarSeller = async (id = sellerId) => {
    const limpo = id.trim();
    setPedido(null);
    if (!idValido("seller", limpo)) {
      setErroSeller("ID de seller invalido.");
      return;
    }
    if (!periodo) return;
    setBuscandoSeller(true);
    setErroSeller(null);
    try {
      const r = await pegar({ acao: "seller", id: limpo, ...periodo });
      setSeller({ id: limpo, linhas: r.linhas });

      const uf = estadoDoSeller(r.linhas);
      if (uf) setEstado(uf);
    } catch (e) {
      setErroSeller((e as Error).message);
    } finally {
      setBuscandoSeller(false);
    }
  };

  const avSeller = useMemo(
    () => (seller && periodo ? avaliar(seller.linhas, periodo.fim, corte) : null),
    [seller, periodo, corte],
  );
  const placesDoSeller = useMemo(() => {
    const m = new Map<string, { nome: string; est: number }>();
    for (const l of seller?.linhas ?? []) {
      if (!l.placeId) continue;
      const p = m.get(l.placeId) ?? { nome: l.placeNome, est: 0 };
      p.est += l.estimados;
      m.set(l.placeId, p);
    }
    return [...m.entries()].sort((a, b) => b[1].est - a[1].est);
  }, [seller]);

  const irParaSeller = (id: string, place?: string) => {
    setSellerId(id);
    setPlaceEscolhido(place ?? "");
    buscarSeller(id);
    blocoSeller.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const placeDaSolicitacao =
    placesDoSeller.find(([id]) => id === placeEscolhido) ?? placesDoSeller[0];

  useEffect(() => {
    if (pedido?.estado !== "na-fila" || !pedido.pedido) return;
    let vivo = true;
    let tentativas = 0;
    const olhar = async () => {
      tentativas += 1;
      try {
        const r = await pegar({ acao: "pedido", id: pedido.pedido! });
        if (!vivo) return;
        if (r.status === "pronto") {
          setPedido({ ...pedido, estado: "pronto", link: r.link });
          return;
        }
        if (r.status === "erro") {
          setPedido({ ...pedido, estado: "erro", erro: r.erro || "O script nao conseguiu gerar o PDF." });
          return;
        }
      } catch {
        // tenta de novo no proximo ciclo
      }
      if (vivo && tentativas < 24) setTimeout(olhar, 15000);
    };
    const t = setTimeout(olhar, 15000);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [pedido]);

  const solicitar = async () => {
    if (!seller || !avSeller || !periodo) return;
    const nomeSol = solicitante.trim();
    if (!nomeSol) {
      setPedido({ estado: "erro", erro: "Informe o solicitante." });
      return;
    }

    const naBase = seller.linhas.length > 0;
    const placeId = naBase ? (placeDaSolicitacao?.[0] ?? "") : placeManual.trim();
    const placeNome = naBase ? (placeDaSolicitacao?.[1].nome ?? "") : placeNomeManual.trim();
    if (!idValido("place", placeId)) {
      setPedido({ estado: "erro", erro: "Informe o K74 (ID do place) da solicitação." });
      return;
    }
    if (!comPdf && !evidenciaVolume.trim()) {
      setPedido({ estado: "erro", erro: "Informe a evidência do pacote (link das fotos)." });
      return;
    }
    const nome = nomePrevisto;
    const ja = porSeller.get(seller.id);
    const alerta =
      (ja?.length ? "Esse seller ja tem " + ja.length + " solicitacao(oes) na planilha.\n" : "") +
      (motivo === "quantidade" && avSeller.status !== "passivel"
        ? "Status: " + ROTULO_STATUS[avSeller.status] + ".\n"
        : "") +
      "Registrar o upgrade (" + MOTIVOS_UPGRADE[motivo].rotulo + ") de " + seller.id +
      " no place " + (placeNome || placeId) + (comPdf ? " e gerar " + nome : " com a evidência do pacote") + "?";
    if (!window.confirm(alerta)) return;
    guardar("upgrade.solicitante", nomeSol);
    setPedido({ estado: "enviando" });
    try {
      const r = await fetch("/api/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: seller.id,
          sellerNome: seller.linhas[0]?.sellerNome ?? sellerNomeManual.trim(),
          placeId,
          placeNome,
          estado,
          solicitante: nomeSol,
          motivo,
          evidenciaVolume: motivo === "quantidade" ? "" : evidenciaVolume.trim(),
          inicio: periodo.inicio,
          fim: periodo.fim,
        }),
      });
      const json = await r.json();
      if (!json.ok) throw new Error(json.erro ?? "Falhou.");
      setPedido(json.pedido ? { estado: "na-fila", pedido: json.pedido } : { estado: "registrado" });
      setSolicitacoes((s) => [
        ...s,
        {
          sellerId: seller.id,
          placeId,
          placeNome,
          solicitante: nomeSol,
          link: comPdf ? "" : evidenciaVolume.trim(),
          status: "Pendente",
          statusFinal: "",
        },
      ]);
    } catch (e) {
      setPedido({ estado: "erro", erro: (e as Error).message });
    }
  };

  const naBase = (seller?.linhas.length ?? 0) > 0;
  const nomePrevisto = !seller
    ? ""
    : naBase && avSeller
      ? nomeDoPdf(seller.id, avSeller.geral.estimados)
      : "SELLER_" + seller.id + "_<média>PCTS_DIA";

  const blocoSolicitacao =
    seller && avSeller ? (
      <>
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      {naBase ? (
      <div className="flex w-96 flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Place da solicitação
        </span>
        <select
          value={placeDaSolicitacao?.[0] ?? ""}
          onChange={(e) => setPlaceEscolhido(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {placesDoSeller.map(([id, p]) => (
            <option key={id} value={id}>
              {(p.nome ? p.nome + " · " : "") + id + " (" + inteiro(p.est) + " pcts)"}
            </option>
          ))}
        </select>
      </div>
      ) : (
        <>
          <Campo titulo="K74 do place">
            <input
              value={placeManual}
              onChange={(e) => setPlaceManual(e.target.value)}
              placeholder="ex.: 849817033_25144"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-sm"
            />
          </Campo>
          <Campo titulo="Nome do seller (opcional)">
            <input
              value={sellerNomeManual}
              onChange={(e) => setSellerNomeManual(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </Campo>
          <Campo titulo="Nome do place (opcional)">
            <input
              value={placeNomeManual}
              onChange={(e) => setPlaceNomeManual(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </Campo>
        </>
      )}
      {motivo !== "quantidade" && (
        <Campo titulo="Evidência do pacote (H e link)">
          <input
            value={evidenciaVolume}
            onChange={(e) => setEvidenciaVolume(e.target.value)}
            placeholder={motivo === "peso" ? "link das fotos, peso dos pacotes, NSE peso na coleta" : "link das fotos, obs."}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </Campo>
      )}
      <Campo titulo="Solicitante">
        <input
          list="upgrade-solicitantes"
          value={solicitante}
          onChange={(e) => setSolicitante(e.target.value)}
          placeholder="seu nome"
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
        <datalist id="upgrade-solicitantes">
          {solicitantes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Campo>
      <Campo titulo="Estado do seller">
        <input
          value={estado}
          onChange={(e) => setEstado(e.target.value.toUpperCase().slice(0, 2))}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </Campo>
      <button
        type="button"
        onClick={solicitar}
        disabled={pedido?.estado === "enviando" || pedido?.estado === "na-fila"}
        className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {comPdf ? "Gerar PDF e solicitar upgrade" : "Solicitar upgrade"}
      </button>
      <span className="pb-1.5 text-xs font-medium text-emerald-800">
        {MOTIVOS_UPGRADE[motivo].rotulo}
      </span>
      {comPdf && (
        <span className="pb-1.5 text-xs text-slate-500">
          {nomePrevisto}
        </span>
      )}
      {jaSolicitado(seller.id)}
    </div>
    {pedido?.estado === "enviando" && (
      <p className="text-sm text-slate-600">Registrando na planilha...</p>
    )}
    {pedido?.estado === "na-fila" && (
      <p className="text-sm text-slate-600">
        Solicitação registrada como <strong>Pendente</strong>. O PDF está na fila e fica
        pronto em até ~1 minuto; o link aparece aqui e na coluna LINK DA EVIDENCIA.
      </p>
    )}
    {pedido?.estado === "pronto" && (
      <p className="text-sm text-emerald-800">
        PDF salvo na pasta:{" "}
        <a href={pedido.link} target="_blank" rel="noreferrer" className="underline">
          abrir o PDF
        </a>{" "}
        · link gravado na solicitação.
      </p>
    )}
    {pedido?.estado === "registrado" && (
      <p className="text-sm text-emerald-800">
        Solicitação registrada como <strong>Pendente</strong>, com a evidência do pacote na coluna H e no LINK DA
        EVIDENCIA (sem PDF de volume).
      </p>
    )}
    {pedido?.estado === "erro" && <p className="text-sm text-red-700">{pedido.erro}</p>}
      </>
    ) : null;

  const aplicarFiltros = (p: { inicio: string; fim: string }, c: number) => {
    carregarResumo(p, c);
    setSeller(null);
    setPedido(null);
  };

  if (!info && carregando) {
    return <p className="text-sm text-slate-500">Carregando a base de candidatos...</p>;
  }
  if (!info) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Não consegui abrir a base de candidatos: {erro}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Campo titulo="Período">
          {periodo && (
            <SeletorPeriodo
              inicio={periodo.inicio}
              fim={periodo.fim}
              aoMudar={(inicio, fim) => aplicarFiltros({ inicio, fim }, corte)}
            />
          )}
        </Campo>
        <div className="flex w-72 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Motivo do upgrade
          </span>
          <select
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value as MotivoUpgrade);
              setPedido(null);
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {(Object.keys(MOTIVOS_UPGRADE) as MotivoUpgrade[]).map((m) => (
              <option key={m} value={m}>
                {MOTIVOS_UPGRADE[m].rotulo}
              </option>
            ))}
          </select>
        </div>
        <Campo titulo="Cluster">
          <FiltroMulti
            rotulo="Cluster"
            opcoes={opcoesCluster}
            escolhidos={clustersSel}
            aoMudar={(novos) => {
              setClustersSel(novos);
              setMostrar(50);
            }}
          />
        </Campo>
        <Campo titulo="Corte (pacotes/dia)">
          <input
            type="number"
            min={1}
            value={corte}
            onChange={(e) => setCorte(Math.max(1, Number(e.target.value) || CORTE_PADRAO))}
            onBlur={() => periodo && aplicarFiltros(periodo, corte)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </Campo>
        <p className="max-w-xl pb-1 text-xs text-slate-500">
          Base atualizada em <strong>{info.atualizadoEm || "—"}</strong>: a lista mostra os sellers com média ≥{" "}
          {PISO_BASE} pacotes/dia de {br(info.baseInicio)} a {br(info.baseFim)}; a busca por ID acha qualquer seller
          a partir de {PISO_BUSCA} pacote/dia. Média = soma ÷ dias com drop. Passível é quem fica acima do corte no período e nos últimos{" "}
          {DIAS_RECENTES} dias.
        </p>
        {carregando && <span className="pb-1 text-xs text-slate-400">atualizando...</span>}
      </div>
      {erro && <p className="text-sm text-red-700">{erro}</p>}
      {avisoSol && (
        <p className="text-xs text-amber-700">Não consegui ler as solicitações: {avisoSol}</p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Candidatos em Campinas</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {(["passivel", "em-alta", "em-baixa", "abaixo"] as Status[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltroStatus(filtroStatus === s ? "todos" : s)}
              className={
                "rounded-lg border bg-white p-4 text-left shadow-sm transition hover:shadow-md " +
                (filtroStatus === s ? "ring-2 ring-blue-400" : "")
              }
            >
              <Selo status={s} />
              <p className="mt-1 text-2xl font-bold text-slate-900">{inteiro(contagem[s])}</p>
              <p className="text-xs text-slate-400">sellers</p>
            </button>
          ))}
        </div>
        <input
          value={procura}
          onChange={(e) => {
            setProcura(e.target.value);
            setMostrar(50);
          }}
          placeholder="buscar seller ou place"
          className="w-64 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <select
          value={filtroAtivacao}
          onChange={(e) => {
            setFiltroAtivacao(e.target.value as "todos" | "agendada" | "concluida");
            setMostrar(50);
          }}
          title="Upgrades aceitos pelo PRAZO ATIVAÇÃO (a partir dessa data o seller tem coleta direta)"
          className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="todos">Ativação: todos</option>
          <option value="agendada">Ativação agendada</option>
          <option value="concluida">Ativação concluída</option>
        </select>
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-sky-50 text-left text-[11px] text-slate-600">
              <tr>
                <Titulo titulo="ID seller" campo="sellerId" ordem={ordem} setOrdem={setOrdem} />
                <Titulo titulo="Seller" campo="sellerNome" ordem={ordem} setOrdem={setOrdem} />
                <Titulo titulo="Place principal" campo="placeNome" ordem={ordem} setOrdem={setOrdem} />
                <Titulo titulo="Cluster" campo="cluster" ordem={ordem} setOrdem={setOrdem} />
                <Titulo titulo="Dias" campo="dias" ordem={ordem} setOrdem={setOrdem} direita />
                <Titulo titulo="Média estimados" campo="estimados" ordem={ordem} setOrdem={setOrdem} direita />
                <Titulo titulo="Média coletados" campo="coletados" ordem={ordem} setOrdem={setOrdem} direita />
                <Titulo
                  titulo={"Últimos " + DIAS_RECENTES + " dias"}
                  campo="recente"
                  ordem={ordem}
                  setOrdem={setOrdem}
                  direita
                />
                <Titulo titulo="Situação" campo="status" ordem={ordem} setOrdem={setOrdem} />
                <Titulo titulo="Status Solicitação" campo="solicitacao" ordem={ordem} setOrdem={setOrdem} />
                <th className="px-2 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrada.slice(0, mostrar).map((c) => (
                <tr key={c.sellerId} className="hover:bg-slate-50">
                  <td className="px-2 py-1 font-mono">{c.sellerId}</td>
                  <td className="px-2 py-1">{c.sellerNome}</td>
                  <td className="px-2 py-1">
                    {c.placeNome || c.placeId}
                    {c.places > 1 ? <span className="text-slate-400"> +{c.places - 1}</span> : null}
                  </td>
                  <td className="px-2 py-1" title={c.clusters.join(", ") || undefined}>
                    {c.cluster || "\u2014"}
                    {c.clusters.length > 1 ? (
                      <span className="text-slate-400"> +{c.clusters.length - 1}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1 text-right">{c.geral.dias}</td>
                  <td className="px-2 py-1 text-right font-semibold">{inteiro(c.geral.estimados)}</td>
                  <td className="px-2 py-1 text-right">{inteiro(c.geral.coletados)}</td>
                  <td className="px-2 py-1 text-right">
                    {c.recente.dias ? inteiro(c.recente.estimados) : "—"}
                  </td>
                  <td className="px-2 py-1">
                    <Selo status={c.status} />
                  </td>

                  <td className="px-2 py-1">
                    <div className="flex flex-col items-start gap-0.5">
                      {jaSolicitado(c.sellerId) ?? <span className="text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => irParaSeller(c.sellerId, c.placeId)}
                      className="text-blue-700 underline hover:text-blue-900"
                    >
                      analisar
                    </button>
                  </td>
                </tr>
              ))}
              {filtrada.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-2 py-3 text-slate-500">
                    Nenhum seller nesse filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtrada.length > mostrar && (
          <button
            type="button"
            onClick={() => setMostrar((m) => m + 100)}
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Mostrar mais ({inteiro(filtrada.length - mostrar)} restantes)
          </button>
        )}
      </section>

      <section ref={blocoSeller} className="scroll-mt-4 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Busca por seller</h2>
        <BuscaId
          titulo="ID do seller"
          dica="ex.: 244397015"
          valor={sellerId}
          setValor={setSellerId}
          aoBuscar={() => {
            setPlaceEscolhido("");
            buscarSeller();
          }}
          carregando={buscandoSeller}
        />
        {erroSeller && <p className="text-sm text-red-700">{erroSeller}</p>}
        {seller && avSeller && periodo && (
          seller.linhas.length === 0 ? (
            <>
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Esse seller não está na base: não dropou em Campinas no período (ou fica abaixo de {PISO_BUSCA}{" "}
                pacote/dia de média).
                {motivo === "quantidade"
                  ? " Para pedir upgrade por volume, fragilidade ou peso, troque o motivo na barra de cima."
                  : " Por " + MOTIVOS_UPGRADE[motivo].rotulo.toLowerCase() +
                    " dá para solicitar mesmo assim: informe o K74 do place e a evidência do pacote (os nomes são opcionais)."}
              </p>
              {motivo !== "quantidade" && blocoSolicitacao}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Cartao
                  titulo="Média de estimados"
                  valor={inteiro(avSeller.geral.estimados)}
                  abaixo={inteiro(avSeller.geral.somaEstimados) + " em " + avSeller.geral.dias + " dia(s) com drop"}
                  borda="border-l-blue-500"
                />
                <Cartao
                  titulo="Média de coletados"
                  valor={inteiro(avSeller.geral.coletados)}
                  abaixo={inteiro(avSeller.geral.somaColetados) + " em " + avSeller.geral.dias + " dia(s) com drop"}
                  borda="border-l-green-500"
                />
                <Cartao
                  titulo={"Últimos " + DIAS_RECENTES + " dias (estimados)"}
                  valor={avSeller.recente.dias ? inteiro(avSeller.recente.estimados) : "—"}
                  abaixo={avSeller.recente.dias + " dia(s) com drop até " + br(periodo.fim)}
                  borda="border-l-orange-500"
                />
                <Cartao
                  titulo="Status"
                  valor={<Selo status={avSeller.status} />}
                  abaixo={"corte de " + corte + " pacotes/dia"}
                  borda="border-l-violet-500"
                />
              </div>

              {blocoSolicitacao}

              <TabelaDrops linhas={seller.linhas} />
            </>
          )
        )}
      </section>
    </div>
  );
}
