"use client";

import { useRouter } from "next/navigation";

export default function SeletorDataCurva({ dataISO, hojeISO }: { dataISO: string; hojeISO: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      aria-label="Data da curva"
      value={dataISO}
      max={hojeISO}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
        router.push(v === hojeISO ? "/curva" : "/curva?data=" + v);
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
    />
  );
}
