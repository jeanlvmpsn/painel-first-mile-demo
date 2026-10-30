"use client";

import { useCallback, useSyncExternalStore } from "react";

const ouvintes = new Set<() => void>();

const memoria = new Map<string, string>();

const chave = (nome: string, dataBR: string) => "report-" + nome + "-" + dataBR;

function assinar(avisar: () => void) {
  ouvintes.add(avisar);

  window.addEventListener("storage", avisar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

function ler(k: string): string {
  if (memoria.has(k)) return memoria.get(k) ?? "";
  try {
    return window.localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}

export function useCampoDoDia(nome: string, dataBR: string): [string, (valor: string) => void] {
  const k = chave(nome, dataBR);
  const valor = useSyncExternalStore(
    assinar,
    () => ler(k),
    () => "",
  );
  const mudar = useCallback(
    (novo: string) => {
      memoria.set(k, novo);
      try {
        if (novo) window.localStorage.setItem(k, novo);
        else window.localStorage.removeItem(k);
      } catch {
        // storage bloqueado: fica so na memoria
      }
      ouvintes.forEach((o) => o());
    },
    [k],
  );
  return [valor, mudar];
}
