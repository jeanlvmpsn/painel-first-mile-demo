export type Carimbo = {
  rotulo: string;
  estado: "ok" | "erro";
  mensagem: string;

  quando: string | null;
};

export type RespostaUltimaAtualizacao = {
  quando: string | null;
  estado: "ok" | "erro" | "ausente";
  mensagem: string;

  minutosAtras: number | null;
};

export const LIMITE_ATRASO_MINUTOS = 70;

export function normalizarRotulo(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extrairCarimbos(linhas: string[][]): Carimbo[] {
  const saida: Carimbo[] = [];
  for (const l of linhas) {
    const rotulo = normalizarRotulo(String(l?.[0] ?? ""));
    if (!rotulo.startsWith("ultima atualizacao")) continue;
    const bruto = String(l?.[1] ?? "").trim();
    if (!bruto) continue;
    saida.push({
      rotulo,
      estado: /^erro/i.test(bruto) ? "erro" : "ok",
      mensagem: bruto
        .replace(/^(OK|ERRO)\s*[—-]\s*/i, "")
        .replace(/\s*[—-]\s*\d{2}\/\d{2}\/\d{4}.*$/, "")
        .trim(),
      quando: bruto.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}(?::\d{2})?/)?.[0] ?? null,
    });
  }
  return saida;
}

const ROTULOS_POR_ABA: { prefixo: string; rotulos: string[] }[] = [
  { prefixo: "/atribuicoes", rotulos: ["ultima atualizacao atribuicao"] },
  { prefixo: "/scheduling", rotulos: ["ultima atualizacao scheduling"] },

  { prefixo: "/monitoramento", rotulos: ["ultima atualizacao"] },

  { prefixo: "/dedicadas", rotulos: ["ultima atualizacao"] },
  {
    prefixo: "/avulsas",
    rotulos: ["ultima atualizacao avulsas", "ultima atualizacao"],
  },
  {
    prefixo: "/reports",
    rotulos: ["ultima atualizacao reports", "ultima atualizacao atribuicao"],
  },

  {
    prefixo: "/",
    rotulos: ["ultima atualizacao forms", "ultima atualizacao atribuicao"],
  },
];

export function rotulosDaAba(caminho: string): string[] {
  const c = String(caminho ?? "/");
  const achada = ROTULOS_POR_ABA.find((a) =>
    a.prefixo === "/" ? c === "/" : c.startsWith(a.prefixo),
  );
  return achada?.rotulos ?? [];
}

export function carimboDaAba(
  caminho: string,
  carimbos: Carimbo[],
): Carimbo | null {
  for (const rotulo of rotulosDaAba(caminho)) {
    const achado = carimbos.find((c) => c.rotulo === rotulo);
    if (achado) return achado;
  }
  return null;
}
