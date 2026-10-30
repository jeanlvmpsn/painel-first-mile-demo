"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

const REPORTS = [
  { href: "/reports/start", rotulo: "Start D0" },
  { href: "/reports", rotulo: "Fechamento total" },
  { href: "/reports/previa", rotulo: "Previa D+1" },
  { href: "/reports/gap", rotulo: "GAP de rotas" },
  { href: "/reports/express", rotulo: "M1 D0" },
  { href: "/reports/hb", rotulo: "Start H&B" },
  { href: "/reports/hb/fechamento", rotulo: "Fechamento H&B" },
];

export default function NavReports() {
  const caminho = usePathname();
  return (
    <div className="mb-5 flex items-center gap-1">
      {REPORTS.map((r) => {
        const casa = (h: string) => caminho === h || caminho.startsWith(h + "/");
        const maisLongo = REPORTS.filter((x) => x.href !== "/reports" && casa(x.href)).sort(
          (a, b) => b.href.length - a.href.length,
        )[0]?.href;
        const ativo = r.href === "/reports" ? caminho === "/reports" : r.href === maisLongo;
        return (
          <Link
            key={r.href}
            href={r.href}
            aria-current={ativo ? "page" : undefined}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition " +
              (ativo
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900")
            }
          >
            {r.rotulo}
          </Link>
        );
      })}
      <BotaoAtualizar />
    </div>
  );
}

function BotaoAtualizar() {
  const router = useRouter();
  const [carregando, iniciar] = useTransition();
  return (
    <button
      type="button"
      onClick={() =>
        iniciar(async () => {
          await fetch("/api/monitoramento", { method: "PUT" }).catch(() => null);
          router.refresh();
        })
      }
      disabled={carregando}
      title="Busca os dados da planilha de novo"
      className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:text-slate-900 disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        className={"h-3.5 w-3.5 " + (carregando ? "animate-spin" : "")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-2.6-6.4" />
        <path d="M21 3v6h-6" />
      </svg>
      {carregando ? "Atualizando..." : "Atualizar"}
    </button>
  );
}
