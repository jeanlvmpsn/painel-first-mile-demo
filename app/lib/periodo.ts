export function diasDoPeriodo(inicioBR: string, fimBR: string, max: number): string[] {
  const paraUTC = (br: string) => {
    const [d, m, a] = br.split("/").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  const dias: string[] = [];
  for (let t = paraUTC(inicioBR); t <= paraUTC(fimBR) && dias.length < max; t += 86400000) {
    const d = new Date(t);
    dias.push(
      String(d.getUTCDate()).padStart(2, "0") + "/" +
        String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + d.getUTCFullYear(),
    );
  }
  return dias;
}
