import { NextResponse } from "next/server";

import { MAX_IDS, idsValidos, montarPerfil } from "../../lib/perfil";
import { estadoPerfil, pedirPerfil } from "../../lib/perfilDados";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const erro = (msg: string, status = 400) => NextResponse.json({ ok: false, erro: msg }, { status });

export async function POST(req: Request) {
  let corpo: Record<string, unknown>;
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return erro("Corpo invalido.");
  }
  const ids = idsValidos(corpo.ids);
  const inicio = String(corpo.inicio ?? "");
  const fim = String(corpo.fim ?? "");
  if (!ids.length) return erro("Informe ao menos um ID (so numeros e _).");
  if (ids.length > MAX_IDS) return erro("No maximo " + MAX_IDS + " IDs por pesquisa.");
  if (!DATA.test(inicio) || !DATA.test(fim) || inicio > fim) return erro("Periodo invalido.");
  try {
    return NextResponse.json({ ok: true, pedido: await pedirPerfil(ids, inicio, fim), ids });
  } catch (e) {
    return erro((e as Error).message, 500);
  }
}

export async function GET(req: Request) {
  const pedido = new URL(req.url).searchParams.get("pedido") ?? "";
  if (!/^[a-z0-9]{6,20}$/.test(pedido)) return erro("Pedido invalido.");
  try {
    const e = await estadoPerfil(pedido);
    if (!e) return erro("Pedido nao encontrado.", 404);
    if (e.status !== "pronto") return NextResponse.json({ ok: true, status: e.status, erro: e.erro });
    return NextResponse.json({
      ok: true,
      status: "pronto",
      perfis: montarPerfil(e.resultado, idsValidos(e.ids)),
    });
  } catch (err) {
    return erro((err as Error).message, 500);
  }
}
