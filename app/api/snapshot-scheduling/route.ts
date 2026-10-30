import { NextResponse, type NextRequest } from "next/server";

import { registrarSnapshotScheduling } from "../../lib/scheduling";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { erro: "CRON_SECRET nao configurado no ambiente." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }

  try {
    const resultado = await registrarSnapshotScheduling();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        erro: err instanceof Error ? err.message : "Erro desconhecido.",
      },
      { status: 500 },
    );
  }
}
