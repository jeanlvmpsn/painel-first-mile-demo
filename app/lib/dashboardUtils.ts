import type { RotaStatus } from "./sheets";

export function extrairCluster(rota: string): string | null {
  const match = rota.match(/(?:^|_)C(\d{1,3})(?:_|$)/i);
  return match ? `C${match[1].padStart(2, "0")}` : null;
}

export function truncarLabel(texto: string, max = 14): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

export function apelidarTransportadora(nome: string): string {
  const apelidos: Record<string, string> = { "Transportadora Grupo Vetor": "Vetor" };
  return apelidos[nome] ?? nome;
}

const GENERICAS = new Set([
  "transportadora", "transportes", "transporte", "transp", "grupo", "logistica", "logistics", "log", "ltda", "me", "eireli",
  "sa", "s", "a", "e", "de", "do", "da", "express", "expresso",
]);
function palavrasTransportadora(nome: string): string[] {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !GENERICAS.has(p));
}
export function mesmaTransportadora(a: string, b: string): boolean {
  const pa = palavrasTransportadora(a);
  const pb = palavrasTransportadora(b);
  return pa.length > 0 && pb.length > 0 && pa[0] === pb[0];
}

export type ItemOfensor = { chave: string; pendentes: number };

export function contarPendentesPor(
  rotas: RotaStatus[],
  nseFiltro: "todas" | "sim" | "ns",
  extrairChave: (r: RotaStatus) => string | null
): ItemOfensor[] {
  const base =
    nseFiltro === "sim"
      ? rotas.filter((r) => r.resposta?.estourou.trim().toLowerCase().startsWith("sim"))
      : rotas;
  const contagem = new Map<string, number>();
  base.forEach((r) => {
    if (r.ns) return;
    if (nseFiltro !== "sim" && r.status === "concluida") return;
    const chave = extrairChave(r);
    if (!chave) return;
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  });
  return Array.from(contagem.entries())
    .map(([chave, pendentes]) => ({ chave, pendentes }))
    .sort((a, b) => b.pendentes - a.pendentes)
    .slice(0, 8);
}

const BASE_LINK_ROTA =
  "/demo/rota/";

export function extrairIdRota(valor: string | undefined | null): string | null {
  let texto = valor ?? "";
  let anterior = "";
  while (texto !== anterior) {
    anterior = texto;
    texto = texto.replace(/(\d)\.(\d)/g, "$1$2");
  }
  const blocos = texto.match(/\d+/g);
  if (!blocos) return null;
  const maior = blocos.reduce((a, b) => (b.length > a.length ? b : a), "");
  return maior.length >= 6 ? maior : null;
}

export function linkRota(id: string): string {
  return `${BASE_LINK_ROTA}${id}`;
}
