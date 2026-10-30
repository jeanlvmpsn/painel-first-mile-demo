const DATA = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{1,4})\s*$/;
const CARIMBO = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export function corrigirDataForm(
  dataDigitada: string | undefined | null,
  carimbo: string | undefined | null
): string {
  const m = String(dataDigitada ?? "").trim().match(DATA);
  if (!m) return "";

  const dia = Number(m[1]);
  const mes = Number(m[2]);

  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return "";

  const c = String(carimbo ?? "").trim().match(CARIMBO);
  if (!c) {
    const bruto = Number(m[3]);
    return (
      doisDigitos(dia) + "/" + doisDigitos(mes) + "/" +
      (bruto < 100 ? 2000 + bruto : bruto)
    );
  }

  const diaC = Number(c[1]);
  const mesC = Number(c[2]);
  const anoC = Number(c[3]);
  const alvo = Date.UTC(anoC, mes - 1, dia);
  const doCarimbo = Date.UTC(anoC, mesC - 1, diaC);
  const LIMITE = 180 * 86400000;
  const ano = alvo - doCarimbo > LIMITE ? anoC - 1 : anoC;

  return doisDigitos(dia) + "/" + doisDigitos(mes) + "/" + ano;
}
