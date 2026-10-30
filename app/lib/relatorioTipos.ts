export type ParadaColeta = {
  rota: string;
  rotaSemNome?: boolean;
  transportadora: string;
  motorista: string;
  parada: string;
  pontualidade: string;
  estimados: number;
  coletados: number;

  preparados: number;
  planejado: string;

  motivo?: string;
  rotaId?: string;
};

export type Pontualidade = "onTime" | "early" | "late";

export function classificarPontualidade(texto: string): Pontualidade | null {
  const t = String(texto ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("on_time") || t.includes("on time")) return "onTime";
  if (t.includes("early")) return "early";
  if (t.includes("late")) return "late";
  return null;
}

function ehAvulsa(planejado: string): boolean {
  const p = String(planejado ?? "").trim().toLowerCase();

  return p === "nao" || p === "não" || p === "no" || p === "false";
}

export type MetricasColeta = {
  totalParadas: number;
  onTime: number;
  early: number;
  late: number;
  rotasDistintas: number;
  rotasComAtraso: number;
  paradasAvulsas: number;
  rotasAvulsas: number;
  rotasSegundaSaida: number;
};

export function metricasDeColeta(paradas: ParadaColeta[]): MetricasColeta {
  const validas = paradas.filter((p) => String(p.rota ?? "").trim());
  const total = validas.length;

  let onTime = 0;
  let early = 0;
  let late = 0;
  const rotas = new Set<string>();
  const rotasAtraso = new Set<string>();
  let paradasAvulsas = 0;
  const avulsas = new Set<string>();
  const rotasPorMotorista = new Map<string, Set<string>>();

  for (const p of validas) {
    rotas.add(p.rota);
    const c = classificarPontualidade(p.pontualidade);
    if (c === "onTime") onTime++;
    else if (c === "early") early++;
    else if (c === "late") {
      late++;

      rotasAtraso.add(p.rota);
    }
    if (ehAvulsa(p.planejado)) paradasAvulsas++;

    if (p.rotaSemNome) avulsas.add(p.rota);

    const mot = String(p.motorista ?? "").trim();
    if (mot) {
      const dele = rotasPorMotorista.get(mot) ?? new Set<string>();
      dele.add(p.rota);
      rotasPorMotorista.set(mot, dele);
    }
  }

  let segundaSaida = 0;
  for (const dele of rotasPorMotorista.values()) {
    if (dele.size > 1) segundaSaida += dele.size - 1;
  }

  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return {
    totalParadas: total,
    onTime: pct(onTime),
    early: pct(early),
    late: pct(late),
    rotasDistintas: rotas.size,
    rotasComAtraso: rotasAtraso.size,
    paradasAvulsas,
    rotasAvulsas: avulsas.size,
    rotasSegundaSaida: segundaSaida,
  };
}

export function formatarPct(valor: number, casas = 2): string {
  return valor.toFixed(casas).replace(".", ",") + "%";
}

export function ehSabado(dataBR: string): boolean {
  const m = String(dataBR ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDay() === 6;
}

export function listarComE(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
}

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(Math.round(valor));
}

export function numeroReport(valor: number): string {
  const inteiro = Math.round(valor);
  return inteiro >= 0 && inteiro < 10 ? String(inteiro).padStart(2, "0") : formatarNumero(inteiro);
}

export const PU_ALVO = 93.3;

export type MetricasPacotes = {
  estimados: number;
  coletados: number;

  estimadosPorParada: number;
  paradasDistintas: number;
  pu: number;
  puNoAlvo: boolean;

  alvoPu: number;
};

export function metricasDePacotes(
  paradas: ParadaColeta[],
  alvoPu: number = PU_ALVO,
): MetricasPacotes {
  const validas = paradas.filter((p) => String(p.rota ?? "").trim());
  let estimados = 0;
  let coletados = 0;
  const maiorPorParada = new Map<string, number>();
  for (const p of validas) {
    const est = Number(p.estimados) || 0;
    estimados += est;
    coletados += Number(p.coletados) || 0;
    const chave = String(p.parada ?? "").trim();
    if (!chave) continue;
    const atual = maiorPorParada.get(chave);
    if (atual === undefined || est > atual) maiorPorParada.set(chave, est);
  }
  let estimadosPorParada = 0;
  for (const v of maiorPorParada.values()) estimadosPorParada += v;
  const pu = estimados > 0 ? (coletados / estimados) * 100 : 0;
  return {
    estimados,
    coletados,
    estimadosPorParada,
    paradasDistintas: maiorPorParada.size,
    pu,
    puNoAlvo: pu >= alvoPu,
    alvoPu,
  };
}

export type Monitoramento = {
  estimados: number;
  coletados: number;
  rotasAvulsas: number;

  paradasTotal: number;
};

export type EntradaFechamento = {
  rotasNs?: string[];
  paradas: ParadaColeta[];
  rotasAtribuidas: number;

  ns: number;
  monitoramento?: Monitoramento | null;
  capacidadeTotal: number | null;
  rotasPerfilMenor: number | null;

  alvoPu?: number;
};

export type Fechamento = {
  rotasAtribuidas: number;
  ns: number;
  avulsas: number;
  paradasAvulsas: number;
  rotasTT: number;
  rotasComAtraso: number;
  segundaSaida: number;
  onTime: number;
  early: number;
  late: number;
  totalParadas: number;
  pacotes: MetricasPacotes;

  origem: "monitoramento" | "coletas";
  capacidadeTotal: number | null;
  ofensores: OfensorSemReversao[];
  aderenciaPerfil: number | null;
  sprPlan: number | null;
  sprExec: number | null;

  pacotesPendentes?: boolean;
};

export function montarFechamento(e: EntradaFechamento): Fechamento {
  const m = metricasDeColeta(e.paradas);
  const alvo = e.alvoPu ?? PU_ALVO;
  const daColeta = metricasDePacotes(e.paradas, alvo);

  const mon = e.monitoramento ?? null;
  const pu = mon
    ? (mon.estimados > 0 ? (mon.coletados / mon.estimados) * 100 : 0)
    : daColeta.pu;
  const pacotes: MetricasPacotes = mon
    ? {
        ...daColeta,
        estimados: mon.estimados,
        coletados: mon.coletados,
        pu,
        puNoAlvo: pu >= alvo,
        alvoPu: alvo,
      }
    : daColeta;
  const avulsas = mon ? mon.rotasAvulsas : m.rotasAvulsas;

  const rotasTT = e.rotasAtribuidas - e.ns + avulsas;

  const aderenciaPerfil =
    e.rotasPerfilMenor === null || e.rotasAtribuidas <= 0
      ? null
      : ((e.rotasAtribuidas - e.rotasPerfilMenor) / e.rotasAtribuidas) * 100;
  const sprPlan =
    e.capacidadeTotal === null || e.rotasAtribuidas <= 0
      ? null
      : e.capacidadeTotal / e.rotasAtribuidas;
  const sprExec = rotasTT > 0 ? pacotes.coletados / rotasTT : null;
  return {
    rotasAtribuidas: e.rotasAtribuidas,
    ns: e.ns,
    avulsas,
    origem: mon ? "monitoramento" : "coletas",
    paradasAvulsas: m.paradasAvulsas,
    rotasTT,
    rotasComAtraso: m.rotasComAtraso,
    segundaSaida: m.rotasSegundaSaida,
    onTime: m.onTime,
    early: m.early,
    late: m.late,
    totalParadas: mon ? mon.paradasTotal : m.totalParadas,
    pacotes,
    capacidadeTotal: e.capacidadeTotal,
    ofensores: ofensoresSemReversao(e.paradas, e.rotasNs ?? []),
    aderenciaPerfil,
    sprPlan,
    sprExec,
  };
}

export type LinhaAtribuicao = {
  perfilMenor?: boolean;
};

export type MetricasAtribuicao = {
  rotas: number;
  perfilMenor: number | null;
};

export function metricasDeAtribuicao(
  rotas: LinhaAtribuicao[]
): MetricasAtribuicao {
  let menores = 0;
  let comDado = 0;
  for (const r of rotas) {
    if (r.perfilMenor === undefined) continue;
    comDado++;
    if (r.perfilMenor) menores++;
  }
  return {
    rotas: rotas.length,
    perfilMenor: comDado > 0 ? menores : null,
  };
}

export const A_PREENCHER = "___";

export type CamposManuais = {
  culpMeli?: string;
  nsSemReversao?: string;
};

export type ExtrasFechamento = {
  schedulingsAceitos?: number | null;

  rotasConfig?: number | null;
  manuais?: CamposManuais;

  titulo?: string;
};

function n(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? A_PREENCHER : numeroReport(valor);
}

function p(valor: number | null | undefined, casas = 2): string {
  return valor === null || valor === undefined ? A_PREENCHER : formatarPct(valor, casas);
}

export function textoFechamento(
  f: Fechamento,
  dataBR: string,
  extras: ExtrasFechamento = {}
): string {
  const [dia, mes] = String(dataBR ?? "").split("/");
  const m = extras.manuais ?? {};
  const bolinha = f.pacotes.puNoAlvo ? "\u{1F7E2}" : "\u{1F534}";
  const sem = !!f.pacotesPendentes;
  const linhas = [
    "*" + (extras.titulo ?? "Prévia Fechamento CAMPINAS FM") + " - " + dia + "/" + mes + "*",
    "",
    "*Estimados fim:* " + n(sem ? null : f.pacotes.estimados) +
      " | *Coletados:* " + n(sem ? null : f.pacotes.coletados) +
      " | *Capacidade:* " + n(f.capacidadeTotal),
    "",
    "*Prévia PU:* " + (sem ? A_PREENCHER : p(f.pacotes.pu, 1) + " " + bolinha),
    "*Rotas Config:* " + n(extras.rotasConfig),
    "*Rotas atribuição:* " + n(f.rotasAtribuidas),
    "*Schedulings aceitos:* " + n(extras.schedulingsAceitos),

    "*Declínios totais:* " + n(f.ns),
    "*Aderência ao perfil:* " + p(f.aderenciaPerfil),
    "*Rotas Segunda Saída:* " + n(f.segundaSaida),
    "*Rotas Avulsas:* " + n(f.avulsas),
    "*Rotas com atraso na coleta:* " + n(f.rotasComAtraso) + " rotas com atraso",
    "*Porcentual Paradas:* *Early:* " + p(f.early) +
      " - *Late:* " + p(f.late) +
      " - e *On Time:* " + p(f.onTime),
    "*Total de Paradas planejadas:* " + n(f.totalParadas) + " Paradas",
    "*Rotas executadasTT:* " + n(f.rotasTT),
    "*SPR plan:* " + n(f.sprPlan === null ? null : Math.round(f.sprPlan)),
    "*SPR exe:* " + n(f.sprExec === null ? null : Math.round(f.sprExec)),
    "",

    "*Culp Meli:*" + (String(m.culpMeli ?? "").trim() ? "\n" + String(m.culpMeli).trim() : " " + A_PREENCHER),
    "",

    "*NS driver e NS carrier sem reversão:* " +
      (m.nsSemReversao
        ? m.nsSemReversao
        : f.ofensores.length > 0
          ? "\n" + textoOfensores(f.ofensores)
          : A_PREENCHER),
  ];
  return linhas.join("\n");
}

export type OfensorSemReversao = {
  transportadora: string;
  pacotes: number;
  rotas: number;
  paradas: number;
};

export function ofensoresSemReversao(
  paradas: ParadaColeta[],
  rotasNs: string[]
): OfensorSemReversao[] {
  const chave = (r: string) => String(r ?? "").trim().toUpperCase();
  const alvo = new Set(rotasNs.map(chave));
  if (alvo.size === 0) return [];

  const historico = new Map<string, { coletados: number; preparados: number }>();
  for (const p of paradas) {
    const ponto = String(p.parada ?? "").trim();
    if (!ponto) continue;
    const h = historico.get(ponto) ?? { coletados: 0, preparados: 0 };
    h.coletados += Number(p.coletados) || 0;

    h.preparados = Math.max(h.preparados, Number(p.preparados) || 0);
    historico.set(ponto, h);
  }

  const porTp = new Map<string, { pacotes: number; rotas: Set<string>; paradas: number }>();
  const vistos = new Set<string>();
  for (const p of paradas) {
    const rota = chave(p.rota);
    if (!alvo.has(rota)) continue;
    const ponto = String(p.parada ?? "").trim();
    if (!ponto || vistos.has(ponto)) continue;
    vistos.add(ponto);

    const h = historico.get(ponto);
    if (!h || h.coletados > 0) continue;
    if (h.preparados <= 0) continue;

    const nome = String(p.transportadora ?? "").trim() || "Sem transportadora";
    const o = porTp.get(nome) ?? { pacotes: 0, rotas: new Set<string>(), paradas: 0 };
    o.pacotes += h.preparados;
    o.paradas++;
    o.rotas.add(rota);
    porTp.set(nome, o);
  }

  return [...porTp.entries()]
    .map(([transportadora, o]) => ({
      transportadora,
      pacotes: o.pacotes,
      rotas: o.rotas.size,
      paradas: o.paradas,
    }))
    .sort(
      (a, b) =>
        b.pacotes - a.pacotes ||
        a.transportadora.localeCompare(b.transportadora, "pt-BR")
    );
}

export const TOP_OFENSORES = 3;

export function textoOfensores(lista: OfensorSemReversao[]): string {
  if (lista.length === 0) return A_PREENCHER;
  return lista
    .slice(0, TOP_OFENSORES)
    .map((o) => o.transportadora + " - " + numeroReport(o.pacotes) + " pcts")
    .join("\n");
}
