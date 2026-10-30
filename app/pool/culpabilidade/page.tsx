import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CulpabilidadeAntiga({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const sp = await searchParams;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? "")
    ? "&data=" + sp.data
    : "";
  redirect("/pool?vista=analise" + data);
}
