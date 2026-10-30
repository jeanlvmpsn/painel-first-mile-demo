// Abas da planilha falsa: cada aba que o painel le tem um gerador aqui.
// Aba sem gerador nao existe (a leitura falha como na planilha real, e o
// painel trata como "aba ausente").

import type { Celula } from "./planilhaFalsa";
import { ABAS_PRINCIPAL } from "./abasPrincipal";
import { ABAS_OPERACAO } from "./abasOperacao";
import { ABAS_HB } from "./abasHb";
import { ABAS_EXTRAS } from "./abasExtras";
import { ABAS_MAIS } from "./abasMais";

export type Gerador = () => Celula[][];
export type Registro = Record<string, Record<string, Gerador>>;

const REGISTRO: Registro = {};
for (const parte of [ABAS_PRINCIPAL, ABAS_OPERACAO, ABAS_HB, ABAS_EXTRAS, ABAS_MAIS]) {
  for (const [planilha, abas] of Object.entries(parte)) {
    REGISTRO[planilha] = { ...(REGISTRO[planilha] ?? {}), ...abas };
  }
}

export function abaGerada(planilhaId: string, titulo: string): Celula[][] | null {
  const g = REGISTRO[planilhaId]?.[titulo];
  if (!g) {
    if (process.env.DEMO_LOG_ABAS) console.warn("[demo] aba sem gerador:", planilhaId, titulo);
    return null;
  }
  return g();
}

export function abasConhecidas(planilhaId: string): string[] {
  return Object.keys(REGISTRO[planilhaId] ?? {});
}
