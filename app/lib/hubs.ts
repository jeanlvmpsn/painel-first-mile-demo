const DE_CAMPINAS = new Set(["", "CPS", "BRXSP2"]);

export const OUTRO_HUB_NO_TEXTO = /(?<![A-Z0-9])BRX(?!SP2(?!\d))[A-Z]{2}\d+(?!\d)/i;

export function hubPeloNome(rota: string | undefined | null): string {
  const m = String(rota ?? "").trim().toUpperCase().match(/^(BRX[A-Z]{2}\d+)(?=_|$)/);
  return m && m[1] !== "BRXSP2" ? m[1] : "";
}

export const SATELITES_DE_CAMPINAS = new Set(["BRXSP5", "BRXSP7", "BRXSP11", "BRXSP14", "BRXMG2", "BRXMG3"]);

export function ehDeOutraBase(rota: string | undefined | null): boolean {
  const hub = hubPeloNome(rota);
  return hub !== "" && !SATELITES_DE_CAMPINAS.has(hub);
}

export function hubDaRota(rota: string | undefined | null, hub: string | undefined | null): string {
  return hubPeloNome(rota) || String(hub ?? "").trim();
}

export function ehDeCampinas(hub: string | undefined | null): boolean {
  return DE_CAMPINAS.has(String(hub ?? "").trim().toUpperCase());
}

export function somenteCampinas<T extends { hub?: string; regiao?: string }>(
  rotas: T[]
): T[] {
  return rotas.filter((r) => ehDeCampinas(r.hub || r.regiao));
}
