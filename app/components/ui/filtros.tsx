"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 w-52">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {titulo}
      </span>
      {children}
    </div>
  );
}

export const TODAS = "__todas__";

export function Select({
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
  rotulo?: (o: string) => string;
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

const BASE_TILE =
  "rounded-lg border border-l-4 bg-white p-5 text-left shadow-sm transition hover:shadow-md";

export function Tile({
  titulo,
  valor,
  cor,
  corTexto,
  ativo,
  onClick,
  detalhe,
}: {
  titulo: string;
  valor: number | string;
  cor: string;
  corTexto: string;
  ativo: boolean;
  onClick?: () => void;
  detalhe?: string;
}) {
  const classe =
    BASE_TILE +
    " " +
    cor +
    (ativo ? " border-slate-400 ring-2 ring-slate-300" : " border-slate-200") +
    (onClick ? " cursor-pointer" : " cursor-default");

  const conteudo = (
    <>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {titulo}
      </span>
      <p className={"mt-1 text-3xl font-bold " + corTexto}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </>
  );

  if (!onClick) return <div className={classe}>{conteudo}</div>;

  return (
    <button type="button" onClick={onClick} className={classe} aria-pressed={ativo}>
      {conteudo}
    </button>
  );
}

export function ColunaOrdenavel({
  titulo,
  campo,
  ordem,
  setOrdem,
  alinhar = "left",
}: {
  titulo: string;
  campo: string;
  ordem: { campo: string; desc: boolean };
  setOrdem: (o: { campo: string; desc: boolean }) => void;
  alinhar?: "left" | "right";
}) {
  const ativa = ordem.campo === campo;
  return (
    <th className={"py-2 pr-3 " + (alinhar === "right" ? "text-right" : "text-left")}>
      <button
        type="button"

        onClick={() => setOrdem({ campo, desc: ativa ? !ordem.desc : true })}
        className={
          "font-medium hover:text-slate-900 " +
          (ativa ? "text-slate-900" : "text-slate-600")
        }
      >
        {titulo}
        <span className="ml-1 text-[10px]">{ativa ? (ordem.desc ? "▼" : "▲") : ""}</span>
      </button>
    </th>
  );
}

export function MultiSelect({
  opcoes,
  selecionados,
  setSelecionados,
  rotuloTodas,
  rotulo,
  largura = "w-full",
}: {
  opcoes: string[];
  selecionados: string[];
  setSelecionados: (v: string[]) => void;
  rotuloTodas: string;
  rotulo?: (o: string) => string;
  largura?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
        setBusca("");
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const nomeDe = (o: string) => (rotulo ? rotulo(o) : o);

  const texto =
    selecionados.length === 0
      ? rotuloTodas
      : selecionados.length === 1
        ? nomeDe(selecionados[0])
        : selecionados.length + " selecionados";

  const alternar = (o: string) =>
    setSelecionados(
      selecionados.includes(o)
        ? selecionados.filter((x) => x !== o)
        : [...selecionados, o],
    );

  const comBusca = opcoes.length > 8;
  const visiveis = busca.trim()
    ? opcoes.filter((o) =>
        nomeDe(o).toLowerCase().includes(busca.trim().toLowerCase()),
      )
    : opcoes;

  return (
    <div className={"relative " + largura} ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between rounded-md border border-slate-300 px-2 py-1.5 text-left text-sm"
      >
        <span className="truncate">{texto}</span>
        <span className="ml-2 shrink-0 text-slate-400">&#9662;</span>
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1 max-h-72 w-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {comBusca && (
            <div className="px-2 pb-1">
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="buscar..."
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
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
          {visiveis.length === 0 ? (
            <p className="px-2 py-2 text-xs text-slate-400">nada encontrado</p>
          ) : (
            visiveis.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => alternar(o)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              >
                <span className="w-4 shrink-0 text-slate-700">
                  {selecionados.includes(o) ? "✓" : ""}
                </span>
                <span className="truncate">{nomeDe(o)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SeletorPeriodo({
  inicio,
  fim,
  aoMudar,
}: {
  inicio: string;
  fim: string;
  aoMudar: (inicio: string, fim: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pendente, setPendente] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [mes, setMes] = useState(() => inicio.slice(0, 7));
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setPendente(null);
    setHover(null);
    setMes(inicio.slice(0, 7));
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto, inicio]);

  const rotulo =
    inicio === fim ? formatarBR(inicio) : formatarBR(inicio) + " a " + formatarBR(fim);

  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const primeiroDia = new Date(Date.UTC(ano, mesNum - 1, 1));
  const diasNoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate();
  const offset = primeiroDia.getUTCDay();
  const celulas: (string | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) =>
      anoStr + "-" + mesStr + "-" + String(i + 1).padStart(2, "0"),
    ),
  ];

  const clicar = (dia: string) => {
    if (!pendente) {
      setPendente(dia);
      return;
    }
    const a = pendente <= dia ? pendente : dia;
    const b = pendente <= dia ? dia : pendente;
    setPendente(null);
    setAberto(false);
    aoMudar(a, b);
  };

  const trocarMes = (delta: number) => {
    const d = new Date(Date.UTC(ano, mesNum - 1 + delta, 1));
    setMes(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
  };

  const emIntervalo = (dia: string) => {
    if (pendente) {
      if (!hover) return dia === pendente;
      const a = pendente <= hover ? pendente : hover;
      const b = pendente <= hover ? hover : pendente;
      return dia >= a && dia <= b;
    }
    return dia >= inicio && dia <= fim;
  };

  const ehPonta = (dia: string) =>
    dia === pendente || (!pendente && (dia === inicio || dia === fim));

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center justify-between gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-sm hover:border-slate-400"
      >
        <span className="truncate">{rotulo}</span>
        <span className="text-[10px] opacity-60">&#9662;</span>
      </button>

      {aberto && (
        <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => trocarMes(-1)}
              className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              &#8249;
            </button>
            <span className="text-sm font-medium text-slate-700">{rotuloMes(mes)}</span>
            <button
              type="button"
              onClick={() => trocarMes(1)}
              className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            >
              &#8250;
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] text-slate-400">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
            {celulas.map((dia, i) => {
              if (!dia) return <span key={"vazio" + i} />;
              const ponta = ehPonta(dia);
              const dentro = emIntervalo(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => clicar(dia)}
                  onMouseEnter={() => setHover(dia)}
                  className={
                    "rounded py-1 " +
                    (ponta
                      ? "bg-slate-900 text-white"
                      : dentro
                        ? "bg-slate-100 text-slate-700"
                        : "text-slate-700 hover:bg-slate-50")
                  }
                >
                  {Number(dia.slice(8, 10))}
                </button>
              );
            })}
          </div>
          {pendente && (
            <p className="mt-2 text-[11px] text-slate-400">
              Clique no mesmo dia para um dia so, ou em outro dia para um periodo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatarBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d + "/" + m + "/" + a;
}

function rotuloMes(mesISO: string): string {
  const [a, m] = mesISO.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, 1));
  const s = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
