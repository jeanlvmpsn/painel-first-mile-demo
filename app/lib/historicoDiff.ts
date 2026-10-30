export type DiferencaHistorico = {
  novas: string[][];
  correcoes: { linha: number; valores: string[] }[];
};

const mesmaLinha = (a: string[], b: string[]): boolean => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (String(a[i] ?? "") !== String(b[i] ?? "")) return false;
  }
  return true;
};

export function diferencaDoHistorico(
  alvo: string[][],
  historico: string[][],
  chave: (l: string[]) => string,
): DiferencaHistorico {
  const indice = new Map<string, number>();
  historico.forEach((l, i) => {
    const k = chave(l);
    if (!indice.has(k)) indice.set(k, i);
  });

  const novas: string[][] = [];
  const correcoes: { linha: number; valores: string[] }[] = [];
  const vistas = new Set<string>();

  for (const l of alvo) {
    const k = chave(l);
    if (vistas.has(k)) continue;
    vistas.add(k);

    const i = indice.get(k);
    if (i === undefined) {
      novas.push(l);
      continue;
    }
    if (!mesmaLinha(historico[i], l)) correcoes.push({ linha: i, valores: l });
  }

  return { novas, correcoes };
}
