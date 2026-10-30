export type FonteApoio = "planilha" | "automático";

export type MapaApoio = Record<string, { nome: string; para: string[]; fonte: FonteApoio }>;

export type MotivoApoio =
  | { tipo: "mesma"; cidade: string }
  | { tipo: "caminho"; de: string; para: string; fonte: FonteApoio };

export function chaveCidade(v: unknown): string {
  return String(v ?? "")
    .replace(/\s*[/-]\s*[A-Za-z]{2}\s*$/, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function lerTabelaApoio(linhas: unknown[][]): Map<string, Set<string>> {
  const saida = new Map<string, Set<string>>();
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => chaveCidade(c).replace(/[^A-Z]/g, ""));
  let de = cab.findIndex((c) => c.startsWith("CIDADEDAROTA") || c === "CIDADE" || c === "ORIGEM");
  let para = cab.findIndex((c) => c.startsWith("PODEAPOIAR") || c === "DESTINO" || c === "APOIA");
  if (de < 0) de = 0;
  if (para < 0) para = 1;
  for (const l of linhas.slice(1)) {
    const x = chaveCidade(l[de]);
    if (!x) continue;
    const destinos = saida.get(x) ?? new Set<string>();
    for (const y of String(l[para] ?? "").split(/[,;\n]+/)) {
      const k = chaveCidade(y);
      if (k && k !== x) destinos.add(k);
    }
    saida.set(x, destinos);
  }
  return saida;
}

export function motivoDeApoio(
  ajudante: string[] | undefined,
  alvo: string[] | undefined,
  mapa: MapaApoio,
): MotivoApoio | null {
  if (!ajudante?.length || !alvo?.length) return null;
  const alvos = new Map(alvo.map((c) => [chaveCidade(c), c]));
  for (const c of ajudante) {
    if (alvos.has(chaveCidade(c))) return { tipo: "mesma", cidade: alvos.get(chaveCidade(c))! };
  }
  for (const c of ajudante) {
    const regra = mapa[chaveCidade(c)];
    if (!regra) continue;
    for (const y of regra.para) {
      const nome = alvos.get(chaveCidade(y));
      if (nome) return { tipo: "caminho", de: c, para: nome, fonte: regra.fonte };
    }
  }
  return null;
}
