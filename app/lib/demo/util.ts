// Pecas comuns dos geradores de aba.
import { agoraSP, br, hhmm, hojeISO, minutoSimulado, somarDias } from "./mundo";

export const PRINCIPAL = "demo-principal";
export const HB = "demo-hb";
export const PROCESSO = "demo-processo";
export const UPGRADE_BASE = "demo-upgrade-base";
export const UPGRADE_ORIGINAL = "demo-upgrade-original";
export const AVULSAS = "demo-avulsas";
export const POOL = "demo-pool";

// "30/10/2026 14:05:12" do momento real, menos alguns minutos.
export function carimboAgora(minutosAtras = 0): string {
  const a = agoraSP();
  let min = a.min - minutosAtras;
  let iso = a.iso;
  if (min < 0) {
    iso = somarDias(iso, -1);
    min += 24 * 60;
  }
  return br(iso) + " " + hhmm(min) + ":" + String(a.seg).padStart(2, "0");
}

// Carimbo de um dia no minuto dado ("dd/mm/aaaa hh:mm:ss").
export const carimbo = (iso: string, min: number, seg = 0) => br(iso) + " " + hhmm(min) + ":" + String(seg % 60).padStart(2, "0");

// Ultimo minuto "acontecido" de um dia: hoje = minuto simulado; passado = 23h.
export function ateQuando(iso: string): number {
  const m = minutoSimulado(iso);
  return m >= 24 * 60 ? 23 * 60 : m;
}

export const hoje = () => hojeISO();
export const ontem = () => somarDias(hojeISO(), -1);
