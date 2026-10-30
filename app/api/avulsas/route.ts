import { NextResponse } from "next/server";

import type { Registro } from "../../lib/avulsas";
import { gravarAvulsas } from "../../lib/avulsasDados";

export const dynamic = "force-dynamic";

const texto = (v: unknown) => String(v ?? "").trim();

function limpar(r: Partial<Registro>): Registro {
  return {
    id: texto(r.id),
    data: texto(r.data),
    transportadora: texto(r.transportadora),
    motivo: texto(r.motivo),
    pagamento: texto(r.pagamento),
    criador: texto(r.criador),
    cluster: texto(r.cluster),
    aprovacao: texto(r.aprovacao),
    rotaImpactada: texto(r.rotaImpactada),
    mlpImpactado: texto(r.mlpImpactado),
  };
}

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido." }, { status: 400 });
  }

  const bruto = (corpo ?? {}) as { registros?: Partial<Registro>[] };
  const lista = Array.isArray(bruto.registros) ? bruto.registros : [];
  const regs = lista.map(limpar).filter((r) => r.id);
  if (!regs.length) {
    return NextResponse.json(
      { ok: false, erro: "Nenhuma avulsa para gravar." },
      { status: 400 },
    );
  }

  try {
    const saida = await gravarAvulsas(regs);
    return NextResponse.json(saida, { status: saida.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 });
  }
}
