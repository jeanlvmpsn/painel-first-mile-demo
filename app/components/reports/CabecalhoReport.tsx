"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CabecalhoReport({
  titulo,
  dataISO,
  texto,
  children,
}: {
  titulo: string;

  dataISO?: string;

  texto: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {titulo}
      </h2>
      <button
        type="button"
        onClick={copiar}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
      {dataISO !== undefined && (
        <input
          type="date"
          value={dataISO}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) router.push("?data=" + v);
          }}
          className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
        />
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
