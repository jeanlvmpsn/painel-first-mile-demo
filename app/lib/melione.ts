export type RotaParaMelione = {
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

export function ehMelione(tipoRota: string | undefined | null): boolean {
  return /melione/i.test(String(tipoRota ?? ""));
}

export function temPlaca(placa: string | undefined | null): boolean {
  return !SEM_PLACA.has(chave(placa));
}

function rotasMelione(rotas: RotaParaMelione[]): RotaParaMelione[] {
  const porRota = new Map<string, RotaParaMelione>();
  const semNome: RotaParaMelione[] = [];
  for (const r of rotas) {
    if (!ehMelione(r.tipoRota)) continue;
    const k = chave(r.rota);

    if (!k) semNome.push(r);
    else porRota.set(k, r);
  }
  return [...porRota.values(), ...semNome];
}

export function placasMelione(rotas: RotaParaMelione[]): string[] {
  return rotasMelione(rotas)
    .filter((r) => temPlaca(r.placa))
    .map((r) => String(r.placa).trim().toUpperCase())
    .sort();
}

export function contarMelione(rotas: RotaParaMelione[]): number {
  return rotasMelione(rotas).length;
}

export function contarMelioneSemPlaca(rotas: RotaParaMelione[]): number {
  return rotasMelione(rotas).filter((r) => !temPlaca(r.placa)).length;
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

export function textoMelione(placas: string[]): string {
  if (placas.length === 0) {
    return "Bom dia time,\n\nHoje não temos meliones.";
  }
  const quantas =
    placas.length === 1
      ? "é 01 no total"
      : "são " + String(placas.length).padStart(2, "0") + " no total";
  return (
    "Bom dia time,\n\n" +
    "Segue relação das meliones de hoje, " +
    quantas +
    "\n\n" +
    placas.join("\n")
  );
}
