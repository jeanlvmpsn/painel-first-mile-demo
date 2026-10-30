"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import UltimaAtualizacao from "./UltimaAtualizacao";

const PAINEIS = [
  { href: "/", rotulo: "Forms final de rota" },
  { href: "/atribuicoes", rotulo: "Atribuição" },
  { href: "/scheduling", rotulo: "Scheduling" },
  { href: "/pool", rotulo: "Pool" },
  { href: "/avulsas", rotulo: "Avulsas" },
  { href: "/capacidade", rotulo: "Capacidade" },
  { href: "/curva", rotulo: "Curva de chegada" },
  { href: "/monitoramento", rotulo: "Monitoramento" },
  { href: "/dedicadas", rotulo: "Dedicada" },
  { href: "/upgrade", rotulo: "Upgrade" },
  { href: "/reports", rotulo: "Reports" },
];

export default function NavPaineis() {
  const caminho = usePathname();

  return (
    <nav className="border-b border-slate-200 bg-white">

      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4">
        <span aria-hidden />
        <div className="flex items-center gap-0.5">
        {PAINEIS.map((painel) => {
          const ativo =
            painel.href === "/"
              ? caminho === "/"
              : caminho.startsWith(painel.href);

          return (
            <Link
              key={painel.href}
              href={painel.href}
              aria-current={ativo ? "page" : undefined}
              className={
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-3 text-[15px] font-medium transition " +
                (ativo
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")
              }
            >
              {painel.rotulo}
            </Link>
          );
        })}
        </div>
        <div className="flex justify-end">
          <UltimaAtualizacao />
        </div>
      </div>
    </nav>
  );
}
