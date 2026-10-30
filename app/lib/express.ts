export type RotaParaExpress = {
  rota?: string;
  placa?: string;
  data?: string;
  hub?: string;
  tipoRota?: string;
};

function chave(v: string | undefined | null): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const SEM_PLACA = new Set(["naoatribuido", "semplaca", ""]);

export function ehExpress(tipoRota: string | undefined | null): boolean {
  return /express/i.test(String(tipoRota ?? ""));
}

export function temPlaca(placa: string | undefined | null): boolean {
  return !SEM_PLACA.has(chave(placa));
}

function rotasExpress(rotas: RotaParaExpress[]): RotaParaExpress[] {
  const porRota = new Map<string, RotaParaExpress>();
  const semNome: RotaParaExpress[] = [];
  for (const r of rotas) {
    if (!ehExpress(r.tipoRota)) continue;
    const k = chave(r.rota);

    if (!k) semNome.push(r);
    else porRota.set(k, r);
  }
  return [...porRota.values(), ...semNome];
}

export function placasExpress(rotas: RotaParaExpress[]): string[] {
  return rotasExpress(rotas)
    .filter((r) => temPlaca(r.placa))
    .map((r) => String(r.placa).trim().toUpperCase())
    .sort();
}

export function contarExpress(rotas: RotaParaExpress[]): number {
  return rotasExpress(rotas).length;
}

export function contarExpressSemPlaca(rotas: RotaParaExpress[]): number {
  return rotasExpress(rotas).filter((r) => !temPlaca(r.placa)).length;
}

export function placasRepetidas(
  placas: string[]
): { placa: string; rotas: number }[] {
  const conta = new Map<string, number>();
  for (const p of placas) conta.set(p, (conta.get(p) ?? 0) + 1);
  return [...conta.entries()]
    .filter(([, n]) => n > 1)
    .map(([placa, rotas]) => ({ placa, rotas }));
}

export function textoExpress(placas: string[]): string {
  if (placas.length === 0) {
    return "Bom dia time,\n\nHoje não temos expresss.";
  }
  const quantas =
    placas.length === 1
      ? "é 01 no total"
      : "são " + String(placas.length).padStart(2, "0") + " no total";
  return (
    "Bom dia time,\n\n" +
    "Segue relação das expresss de hoje, " +
    quantas +
    "\n\n" +
    placas.join("\n")
  );
}
