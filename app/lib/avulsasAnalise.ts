export type Categoria = "NSE" | "NS" | "Erros" | "Backlog" | "Outros";

export const CATEGORIAS: Categoria[] = [
  "NSE",
  "NS",
  "Erros",
  "Backlog",
  "Outros",
];

export type LinhaAnalise = {
  id?: string;
  cluster?: string;
  motivo?: string;
  transportadora?: string;
  coletados?: number;
  link?: string;

  forms?: { fotoBau: string };
};

export type Contagem = {
  rotulo: string;
  vezes: number;
  porcento: number;
  itens: LinhaAnalise[];

  pacotes: number | null;
};

export type BlocoCategoria = Contagem & {
  categoria: Categoria;
  motivos: Contagem[];
};

const norm = (t: string | undefined | null) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export function categoriaDoMotivo(motivo: string | undefined): Categoria {
  const t = norm(motivo);
  if (!t) return "Outros";

  if (t.startsWith("erro") || t.includes("erro ")) return "Erros";
  if (t.includes("libera") && t.includes("xd")) return "Erros";
  if (t.includes("backlog") || t.includes("drop off")) return "Backlog";
  if (
    t === "ns" ||
    t.includes("ns driver") ||
    t.includes("m1 nao atendida") ||
    t.includes("cancelada")
  ) {
    return "NS";
  }
  if (
    t.includes("nse") ||
    t.includes("fmpp") ||
    t.includes("ajuste de perfil") ||
    t.includes("inacess") ||
    t.includes("nao subiu") ||
    t.includes("fragil") ||
    t.includes("dispers") ||
    (t.includes("subst") && t.includes("program"))
  ) {
    return "NSE";
  }
  return "Outros";
}

const pct = (n: number, total: number) => (total > 0 ? (n * 100) / total : 0);

const pacotes = (l: LinhaAnalise) => Number(l.coletados) || 0;

export function somaPacotes(itens: LinhaAnalise[]): number | null {
  const com = itens.filter((l) => Number.isFinite(Number(l.coletados)));
  return com.length ? com.reduce((a, l) => a + pacotes(l), 0) : null;
}

const ordenarItens = (itens: LinhaAnalise[]) =>
  [...itens].sort((a, b) => pacotes(b) - pacotes(a));

function agrupar(
  linhas: LinhaAnalise[],
  chave: (l: LinhaAnalise) => string,
  totalBase: number,
): Contagem[] {
  const grupos = new Map<string, LinhaAnalise[]>();
  for (const l of linhas) {
    const k = chave(l);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  return [...grupos.entries()]
    .map(([rotulo, itens]) => ({
      rotulo,
      vezes: itens.length,
      porcento: pct(itens.length, totalBase),
      itens: ordenarItens(itens),
      pacotes: somaPacotes(itens),
    }))
    .sort(
      (a, b) =>
        b.vezes - a.vezes || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
    );
}

export function contarPorCluster(linhas: LinhaAnalise[]): Contagem[] {
  return agrupar(
    linhas,
    (l) => String(l.cluster ?? "").trim().toUpperCase() || "Sem cluster",
    linhas.length,
  );
}

export function contarPorTransportadora(linhas: LinhaAnalise[]): Contagem[] {
  return agrupar(
    linhas,
    (l) => String(l.transportadora ?? "").trim() || "Sem transportadora",
    linhas.length,
  );
}

export function contarPorCategoria(linhas: LinhaAnalise[]): BlocoCategoria[] {
  const porCat = new Map<Categoria, LinhaAnalise[]>();
  for (const l of linhas) {
    const cat = categoriaDoMotivo(l.motivo);
    porCat.set(cat, [...(porCat.get(cat) ?? []), l]);
  }
  const saida: BlocoCategoria[] = [];
  for (const cat of CATEGORIAS) {
    const dentro = porCat.get(cat);
    if (!dentro) continue;
    saida.push({
      categoria: cat,
      rotulo: cat,
      vezes: dentro.length,
      porcento: pct(dentro.length, linhas.length),
      itens: ordenarItens(dentro),
      pacotes: somaPacotes(dentro),
      motivos: agrupar(
        dentro,
        (l) => String(l.motivo ?? "").trim() || "Sem motivo",
        dentro.length,
      ),
    });
  }
  return saida.sort((a, b) => b.vezes - a.vezes);
}

export type ResumoPacotes = {
  avulsas: number;
  comNumero: number;
  total: number;
  spr: number;
  menor: number;
  maior: number;
  faixas: Contagem[];
};

const FAIXAS = [
  { rotulo: "0 a 250", ate: 250 },
  { rotulo: "251 a 500", ate: 500 },
  { rotulo: "mais de 500", ate: Infinity },
];

export function resumoDePacotes(linhas: LinhaAnalise[]): ResumoPacotes {
  const comNumero = linhas.filter((l) =>
    Number.isFinite(Number(l.coletados)),
  );
  const nums = comNumero.map(pacotes);
  const total = nums.reduce((a, b) => a + b, 0);
  const porFaixa = new Map<string, LinhaAnalise[]>();
  for (const l of comNumero) {
    const n = pacotes(l);
    const faixa = FAIXAS.find((f) => n <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
    porFaixa.set(faixa.rotulo, [...(porFaixa.get(faixa.rotulo) ?? []), l]);
  }
  return {
    avulsas: linhas.length,
    comNumero: comNumero.length,
    total,
    spr: nums.length ? total / nums.length : 0,
    menor: nums.length ? Math.min(...nums) : 0,
    maior: nums.length ? Math.max(...nums) : 0,
    faixas: FAIXAS.map((f) => {
      const itens = porFaixa.get(f.rotulo) ?? [];
      return {
        rotulo: f.rotulo,
        vezes: itens.length,
        porcento: pct(itens.length, nums.length),
        itens: ordenarItens(itens),
        pacotes: somaPacotes(itens),
      };
    }),
  };
}
