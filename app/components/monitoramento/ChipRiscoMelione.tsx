import { RISCO_ANTES_COLETA_MIN, RISCO_PENDENTES_MIN, type NivelMelione, type RiscoMelione } from "../../lib/melioneEntregas";

const COR_MELIONE: Record<NivelMelione, string> = {
  concluidas: "border-[#1da578] bg-[#e6f6f0] text-[#0f6b4e]",
  andamento: "border-slate-300 bg-slate-50 text-slate-700",
  coletando: "border-slate-300 bg-slate-50 text-slate-600",
  v1Logou: "border-slate-300 bg-slate-50 text-slate-600",
  risco: "border-[#ca7916] bg-[#fdf3e4] text-[#8a5210]",
  v1: "border-[#cf1f14] bg-[#fdeceb] text-[#94160e]",
  nsRota: "border-[#cf1f14] bg-[#cf1f14] text-white",
};

export default function ChipRiscoMelione({ r }: { r: RiscoMelione | null }) {
  if (!r) return null;
  return (
    <span
      title={
        r.nivel === "nsRota"
          ? "Rota MeliOne NS pelo critério do painel: não saiu para a coleta."
          : r.nivel === "v1" || r.nivel === "v1Logou"
            ? "MeliOne 1.0: a tela de entregas desta rota está zerada - entrega e coleta não ficaram atreladas. " +
              "O motorista termina as entregas em outra rota e precisa logar na coleta depois" +
              (r.nivel === "v1" ? "; ainda não logou." : "; já logou.")
            : r.texto +
              ". Risco: faltam " + RISCO_PENDENTES_MIN + "+ entregas a " + RISCO_ANTES_COLETA_MIN +
              " min (ou menos) do início planejado da coleta."
      }
      className={"whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold " + COR_MELIONE[r.nivel]}
    >
      {r.curto}
    </span>
  );
}

export function BarraEntregas({ r }: { r: RiscoMelione | null }) {
  if (!r || r.total <= 0 || r.nivel === "nsRota" || r.nivel === "v1" || r.nivel === "v1Logou") return null;
  const pct = Math.round((r.feitas / r.total) * 100);
  const cor = r.nivel === "risco" ? "#ca7916" : r.nivel === "concluidas" ? "#1da578" : "#2563eb";
  return (
    <span className="inline-flex items-center gap-1 align-middle" title={r.feitas + " de " + r.total + " entregas (" + pct + "%)"}>
      <span className="inline-block h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
        <span className="block h-full rounded-full" style={{ width: pct + "%", background: cor }} />
      </span>
      <span className="text-[10px] tabular-nums text-slate-500">{pct}%</span>
    </span>
  );
}
