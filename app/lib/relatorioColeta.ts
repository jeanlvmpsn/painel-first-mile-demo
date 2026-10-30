const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

export function colunaIdParada(cabecalho: unknown[]): number {
  return cabecalho.findIndex((c) => ["IDDEPARADA", "IDPARADA"].includes(norm(c)));
}

export function ehLinhaDoCd(linha: unknown[], iParada: number): boolean {
  if (iParada < 0) return false;
  if (String(linha[iParada] ?? "").trim()) return false;
  return linha.some((c) => String(c ?? "").trim().toUpperCase() === "CAMPINAS");
}

export function semLinhasDoCd<T extends unknown[]>(linhas: T[]): T[] {
  if (linhas.length < 2) return linhas;
  const iParada = colunaIdParada(linhas[0] ?? []);
  if (iParada < 0) return linhas;
  return [linhas[0], ...linhas.slice(1).filter((l) => !ehLinhaDoCd(l, iParada))];
}
