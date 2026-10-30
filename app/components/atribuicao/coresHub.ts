import type { CSSProperties } from "react";

export const CORES_HUB: Record<string, string> = {
  CPS: "#cf1f14",     // vermelho - hub de casa
  BRXSP5: "#f2711c",  // laranja
  BRXSP7: "#5e0f1c",  // vinho
  BRXSP11: "#eab308", // amarelo
  BRXSP14: "#96155a", // rosa escuro
  BRXMG2: "#bf69a9",  // rosa acinzentado - Minas
  BRXMG3: "#bf69a9",  // idem, diferenciado por hachura
};

export const COR_HUB_OUTRO = "#78716c";

export const HUBS_HACHURADOS = new Set(["BRXMG3"]);

export const CLASSES_HUB: Record<string, string> = {
  CPS: "bg-[#cf1f14]",
  BRXSP5: "bg-[#f2711c]",
  BRXSP7: "bg-[#5e0f1c]",
  BRXSP11: "bg-[#eab308]",
  BRXSP14: "bg-[#96155a]",
  BRXMG2: "bg-[#bf69a9]",
  BRXMG3: "bg-[#bf69a9]",
};

export const CLASSE_HUB_OUTRO = "bg-[#78716c]";

function normalizar(hub: string | null | undefined): string {
  return String(hub ?? "").trim().toUpperCase();
}

export function corHub(hub: string | null | undefined): string {
  const c = normalizar(hub);
  if (!c) return CORES_HUB.CPS;
  return CORES_HUB[c] ?? COR_HUB_OUTRO;
}

export function classeHub(hub: string | null | undefined): string {
  const c = normalizar(hub);
  if (!c) return CLASSES_HUB.CPS;
  return CLASSES_HUB[c] ?? CLASSE_HUB_OUTRO;
}

export function estiloHub(hub: string | null | undefined): CSSProperties {
  const c = normalizar(hub);
  const cor = corHub(hub);
  if (!HUBS_HACHURADOS.has(c)) return { backgroundColor: cor };
  return {
    backgroundColor: cor,
    backgroundImage:
      "linear-gradient(135deg, rgba(0,0,0,0.42) 0 50%, transparent 50% 100%)",
  };
}
