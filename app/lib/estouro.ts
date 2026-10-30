import { dataParaBR, porId, texto } from "./hb.ts";
import { motivoDeApoio, type MapaApoio, type MotivoApoio } from "./apoioCidades.ts";

export type TipoVeiculo = {
  tipo: string;
  pesoMaxKg: number;
  cubagemM3: number;
};

const VAN = { pesoMaxKg: 1500, cubagemM3: 9 };
export const VEICULOS: TipoVeiculo[] = [
  { tipo: "Utilitário", pesoMaxKg: 500, cubagemM3: 2 },
  { tipo: "Van", ...VAN },

  { tipo: "HR", pesoMaxKg: VAN.pesoMaxKg * 1.3, cubagemM3: VAN.cubagemM3 * 1.3 },
  { tipo: "VUC", pesoMaxKg: 2200, cubagemM3: 16 },
  { tipo: "Médio", pesoMaxKg: 3500, cubagemM3: 25 },
  { tipo: "Toco", pesoMaxKg: 6000, cubagemM3: 40 },
  { tipo: "Truck", pesoMaxKg: 12000, cubagemM3: 50 },
  { tipo: "Carreta", pesoMaxKg: 24000, cubagemM3: 90 },
];

const semAcento = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

const PALAVRAS: [RegExp, string][] = [
  [/\b(UTILITARIO|FIORINO|UTIL)\b/, "Utilitário"],

  [/\bVAN\b|\bYELLOW POOL\b/, "Van"],
  [/\bHR\b/, "HR"],
  [/\bVUC\b/, "VUC"],
  [/\b(MEDIO|3\/4|TRES QUARTOS)\b/, "Médio"],
  [/\bTOCO\b/, "Toco"],
  [/\bTRUCK\b/, "Truck"],
  [/\bCARRETA\b/, "Carreta"],
];

export function tipoDoVeiculo(nome: unknown): TipoVeiculo | null {
  const t = semAcento(texto(nome));
  for (const [re, tipo] of PALAVRAS) {
    if (re.test(t)) return VEICULOS.find((v) => v.tipo === tipo) ?? null;
  }

  if (/EXPRESS/.test(t)) return VEICULOS.find((v) => v.tipo === "Van") ?? null;
  return null;
}

export function numeroBR(bruto: unknown): number {
  const t = texto(bruto);
  if (!t) return 0;

  const milhar = /^\d{1,3}(\.\d{3})+$/.test(t);
  const limpo = t.includes(",") || milhar ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

export const LIMITE_ALERTA = 0.9;

export type Risco = "estouro" | "limite" | "ok" | "sem-veiculo";

export type Gargalo = "peso" | "volume";

export type ParadaCarga = {
  id: string;
  nome: string;
  pacotes: number;
  pesoKg: number;
  volumeM3: number;

  cidade?: string;
};

export type RotaCarga = {
  rota: string;
  veiculo: string;
  tipo: TipoVeiculo | null;
  transportadora: string;
  cluster: string;
  eta: string;
  paradas: number;
  pacotes: number;
  pesoKg: number;
  volumeM3: number;

  usoPeso: number | null;
  usoVolume: number | null;
  risco: Risco;
  gargalo: Gargalo | null;
  detalhe: ParadaCarga[];

  cidades?: string[];

  veiculoPedido?: string;

  porte?: "menor" | "maior" | null;

  atribuido?: boolean;

  capacidadeDaBase?: boolean;
};

export function classificar(usoPeso: number | null, usoVolume: number | null): { risco: Risco; gargalo: Gargalo | null } {
  if (usoPeso === null || usoVolume === null) return { risco: "sem-veiculo", gargalo: null };
  const gargalo: Gargalo = usoPeso >= usoVolume ? "peso" : "volume";
  const maior = Math.max(usoPeso, usoVolume);
  return {
    risco: maior >= 1 ? "estouro" : maior >= LIMITE_ALERTA ? "limite" : "ok",
    gargalo,
  };
}

export function nomeDoEstouro(gargalo: Gargalo | null): string {
  return gargalo === "peso" ? "NSE peso" : gargalo === "volume" ? "NSE" : "";
}

export type LeituraCarga = {
  rotas: RotaCarga[];
  aviso: string;
};

export function rotasComCarga(linhas: string[][], dataBR: string): LeituraCarga {
  const iCab = linhas.slice(0, 10).findIndex((l) => (l ?? []).map((c) => semAcento(texto(c))).includes("NOME_ROTA"));
  if (iCab < 0) return { rotas: [], aviso: "A aba Extração Config não tem a coluna NOME_ROTA." };
  const cab = (linhas[iCab] ?? []).map((c) => semAcento(texto(c)).replace(/\s+/g, "_"));
  const col = (...nomes: string[]) => {
    for (const n of nomes) {
      const i = cab.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const c = {
    data: col("VIGENCIA", "DATA"),
    rota: col("NOME_ROTA"),
    veiculo: col("VEICULO"),
    peso: col("PESO"),
    volume: col("VOLUME"),
    pacotes: col("PACOTES"),
    transp: col("TRANSPORTADOR", "TRANSPORTADORA"),
    seller: col("ID_SELLER"),
    nome: col("NAME_CLIENTE", "NOME_CLIENTE", "NAME_CLIENT"),
    cluster: col("CLUSTER"),
    eta: col("ETA"),
  };
  const faltam = (["veiculo", "peso", "volume"] as const).filter((k) => c[k] < 0);
  if (faltam.length) {
    return {
      rotas: [],
      aviso: "A aba Extração Config não tem a(s) coluna(s) " + faltam.map((k) => k.toUpperCase()).join(", ") + ".",
    };
  }

  const porRota = new Map<string, RotaCarga>();
  const datas = new Set<string>();
  for (const l of linhas.slice(iCab + 1)) {
    const data = c.data >= 0 ? dataParaBR(l?.[c.data]) : dataBR;
    if (data) datas.add(data);
    const rota = texto(l?.[c.rota]);
    if (data !== dataBR || !rota) continue;
    let r = porRota.get(rota);
    if (!r) {
      const veiculo = texto(l[c.veiculo]);
      r = {
        rota,
        veiculo,
        tipo: tipoDoVeiculo(veiculo),
        transportadora: c.transp >= 0 ? texto(l[c.transp]) : "",
        cluster: c.cluster >= 0 ? texto(l[c.cluster]) : "",
        eta: c.eta >= 0 ? texto(l[c.eta]) : "",
        paradas: 0,
        pacotes: 0,
        pesoKg: 0,
        volumeM3: 0,
        usoPeso: null,
        usoVolume: null,
        risco: "sem-veiculo",
        gargalo: null,
        detalhe: [],
      };
      porRota.set(rota, r);
    }
    const parada: ParadaCarga = {
      id: c.seller >= 0 ? texto(l[c.seller]) : "",
      nome: c.nome >= 0 ? texto(l[c.nome]) : "",
      pacotes: c.pacotes >= 0 ? numeroBR(l[c.pacotes]) : 0,
      pesoKg: numeroBR(l[c.peso]),
      volumeM3: numeroBR(l[c.volume]),
    };
    r.detalhe.push(parada);
    r.paradas += 1;
    r.pacotes += parada.pacotes;
    r.pesoKg += parada.pesoKg;
    r.volumeM3 += parada.volumeM3;
  }

  for (const r of porRota.values()) {
    if (r.tipo) {
      r.usoPeso = r.pesoKg / r.tipo.pesoMaxKg;
      r.usoVolume = r.volumeM3 / r.tipo.cubagemM3;
    }
    Object.assign(r, classificar(r.usoPeso, r.usoVolume));
  }

  const ORDEM: Record<Risco, number> = { estouro: 0, limite: 1, "sem-veiculo": 2, ok: 3 };
  const uso = (r: RotaCarga) => Math.max(r.usoPeso ?? 0, r.usoVolume ?? 0);
  const rotas = [...porRota.values()].sort(
    (a, b) => ORDEM[a.risco] - ORDEM[b.risco] || uso(b) - uso(a) || a.rota.localeCompare(b.rota),
  );

  let aviso = "";
  if (!rotas.length) {
    const vistas = [...datas].slice(-3).join(", ");
    aviso =
      "A aba Extração Config não tem rotas de " + dataBR +
      (vistas ? " (datas encontradas: " + vistas + ")" : "") + ". Atualize a extração da query.";
  }
  return { rotas, aviso };
}

export type PorPacote = { nome: string; pesoKg: number; volumeM3: number; base: string };

export function porPacoteNoDia(rotas: RotaCarga[], id: string): PorPacote | null {
  const alvo = texto(id);
  let pacotes = 0;
  let peso = 0;
  let volume = 0;
  let nome = "";
  for (const r of rotas) {
    for (const p of r.detalhe) {
      if (p.id !== alvo) continue;
      pacotes += p.pacotes;
      peso += p.pesoKg;
      volume += p.volumeM3;
      nome = nome || p.nome;
    }
  }
  if (pacotes <= 0) return null;
  return {
    nome,
    pesoKg: peso / pacotes,
    volumeM3: volume / pacotes,
    base: "config de hoje (" + Math.round(pacotes) + " pacotes planejados)",
  };
}

export type Simulacao = {
  pesoKg: number;
  volumeM3: number;
  usoPeso: number | null;
  usoVolume: number | null;
  risco: Risco;
  gargalo: Gargalo | null;
};

export function simular(rota: RotaCarga, pacotes: number, por: { pesoKg: number; volumeM3: number }): Simulacao {
  const pesoKg = rota.pesoKg + pacotes * por.pesoKg;
  const volumeM3 = rota.volumeM3 + pacotes * por.volumeM3;
  const usoPeso = rota.tipo ? pesoKg / rota.tipo.pesoMaxKg : null;
  const usoVolume = rota.tipo ? volumeM3 / rota.tipo.cubagemM3 : null;
  return { pesoKg, volumeM3, usoPeso, usoVolume, ...classificar(usoPeso, usoVolume) };
}

export type Previsao = { pacotes: number; volumeM3: number; pesoKg: number };

export type OrigemPacotes = "monitoramento" | "previsão" | "config";
export type OrigemPorPacote = "previsão" | "config" | "sem dado";

export type ParadaAgora = ParadaCarga & {
  pacotesConfig: number;
  origemPacotes: OrigemPacotes;
  origemPorPacote: OrigemPorPacote;
};

export type RotaAgora = RotaCarga & {
  detalhe: ParadaAgora[];
};

export type FontesAgora = {
  previsao: Map<string, Previsao>;

  pacotesAgora?: (id: string) => number | null;
};

export function rotasAgora(
  rotas: RotaCarga[],
  fontes: FontesAgora,
  chaves: { id: (v: unknown) => string; rota: (v: unknown) => string },
): RotaAgora[] {
  const configPorId = new Map<string, number>();
  const paradasPorId = new Map<string, number>();
  for (const r of rotas) {
    for (const p of r.detalhe) {
      const k = chaves.id(p.id);
      if (!k) continue;
      configPorId.set(k, (configPorId.get(k) ?? 0) + p.pacotes);
      paradasPorId.set(k, (paradasPorId.get(k) ?? 0) + 1);
    }
  }
  const fatia = (k: string, pacotesConfig: number) => {
    const total = configPorId.get(k) ?? 0;
    return total > 0 ? pacotesConfig / total : 1 / (paradasPorId.get(k) ?? 1);
  };

  const saida = rotas.map((r): RotaAgora => {
    const nova: RotaAgora = {
      ...r,
      pacotes: 0,
      pesoKg: 0,
      volumeM3: 0,
      detalhe: [],
    };
    for (const p of r.detalhe) {
      const k = chaves.id(p.id);
      const prev = porId(fontes.previsao, k);
      const agora = k && fontes.pacotesAgora ? fontes.pacotesAgora(k) : null;

      let pacotes = p.pacotes;
      let origemPacotes: OrigemPacotes = "config";
      if (agora !== null) {
        pacotes = agora * fatia(k, p.pacotes);
        origemPacotes = "monitoramento";
      } else if (prev && prev.pacotes > 0) {
        pacotes = prev.pacotes * fatia(k, p.pacotes);
        origemPacotes = "previsão";
      }

      let volPac = p.pacotes > 0 ? p.volumeM3 / p.pacotes : 0;
      let pesoPac = p.pacotes > 0 ? p.pesoKg / p.pacotes : 0;
      let origemPorPacote: OrigemPorPacote = p.pacotes > 0 ? "config" : "sem dado";
      if (prev && prev.pacotes > 0 && prev.volumeM3 > 0) {
        volPac = prev.volumeM3 / prev.pacotes;

        if (prev.pesoKg > 0) pesoPac = prev.pesoKg / prev.pacotes;
        origemPorPacote = "previsão";
      }

      const parada: ParadaAgora = {
        ...p,
        pacotes,
        pesoKg: pacotes * pesoPac,
        volumeM3: pacotes * volPac,
        pacotesConfig: p.pacotes,
        origemPacotes,
        origemPorPacote,
      };
      nova.detalhe.push(parada);
      nova.pacotes += parada.pacotes;
      nova.pesoKg += parada.pesoKg;
      nova.volumeM3 += parada.volumeM3;
    }
    nova.usoPeso = nova.tipo ? nova.pesoKg / nova.tipo.pesoMaxKg : null;
    nova.usoVolume = nova.tipo ? nova.volumeM3 / nova.tipo.cubagemM3 : null;
    Object.assign(nova, classificar(nova.usoPeso, nova.usoVolume));
    return nova;
  });

  const ORDEM: Record<Risco, number> = { estouro: 0, limite: 1, "sem-veiculo": 2, ok: 3 };
  const uso = (r: RotaCarga) => Math.max(r.usoPeso ?? 0, r.usoVolume ?? 0);
  return saida.sort(
    (a, b) => ORDEM[a.risco] - ORDEM[b.risco] || uso(b) - uso(a) || a.rota.localeCompare(b.rota),
  );
}

export type Capacidade = { pesoMaxKg: number; cubagemM3: number };

export const chaveVeiculo = (nome: unknown) => semAcento(texto(nome)).replace(/\s+/g, " ").trim();

export function lerCapacidades(linhas: unknown[][]): Map<string, Capacidade> {
  const saida = new Map<string, Capacidade & { ativo: boolean }>();
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    tipo: i("SHP_LG_VEHICLE_TYPE"),
    status: i("SHP_LG_VEHICLE_TYPE_STATUS"),
    peso: i("SHP_LG_VEHICLE_WEIGHT"),
    cubagem: i("SHP_LG_VEHICLE_CAPACITY"),
  };
  if (c.tipo < 0 || c.peso < 0 || c.cubagem < 0) return saida;
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : numeroBR(v);
    return Number.isFinite(n) ? n : 0;
  };
  for (const l of linhas.slice(1)) {
    const k = chaveVeiculo(l[c.tipo]);
    const pesoMaxKg = num(l[c.peso]);
    const cubagemM3 = num(l[c.cubagem]);
    if (!k || pesoMaxKg < 100 || cubagemM3 <= 0) continue;
    const ativo = c.status < 0 || texto(l[c.status]).toLowerCase() === "active";
    const atual = saida.get(k);
    if (atual && (atual.ativo || !ativo)) continue;
    saida.set(k, { pesoMaxKg, cubagemM3, ativo });
  }
  return saida;
}

export type VeiculoDaRota = {
  pedido: string;

  atribuido: string;
};

const PORTE = (t: TipoVeiculo | null) => (t ? VEICULOS.findIndex((v) => v.tipo === t.tipo) : -1);

export function aplicarAtribuicao<T extends RotaCarga>(
  rotas: T[],
  porRota: Map<string, VeiculoDaRota>,
  chaveRota: (v: unknown) => string,
  capacidades: Map<string, Capacidade> = new Map(),
): T[] {
  for (const r of rotas) {
    const v = porRota.get(chaveRota(r.rota));
    const pedido = texto(v?.pedido) || r.veiculo;
    const tipoPedido = tipoDoVeiculo(pedido) ?? r.tipo;
    const tipoAtribuido = tipoDoVeiculo(v?.atribuido);
    r.veiculoPedido = pedido;
    r.atribuido = Boolean(texto(v?.atribuido));
    if (r.atribuido) {
      r.veiculo = texto(v?.atribuido);
      r.tipo = tipoAtribuido;
    } else {
      r.veiculo = pedido;
      r.tipo = tipoPedido;
    }

    const a = PORTE(r.tipo);
    const p = PORTE(tipoPedido);
    r.porte = r.atribuido && a >= 0 && p >= 0 && a !== p ? (a < p ? "menor" : "maior") : null;
    const cap = capacidades.get(chaveVeiculo(r.veiculo));
    r.capacidadeDaBase = Boolean(cap);
    if (cap) r.tipo = { tipo: r.tipo?.tipo ?? "Outros", ...cap };
    r.usoPeso = r.tipo ? r.pesoKg / r.tipo.pesoMaxKg : null;
    r.usoVolume = r.tipo ? r.volumeM3 / r.tipo.cubagemM3 : null;
    Object.assign(r, classificar(r.usoPeso, r.usoVolume));
  }
  const ORDEM: Record<Risco, number> = { estouro: 0, limite: 1, "sem-veiculo": 2, ok: 3 };
  const uso = (r: RotaCarga) => Math.max(r.usoPeso ?? 0, r.usoVolume ?? 0);
  return rotas.sort(
    (a, b) => ORDEM[a.risco] - ORDEM[b.risco] || uso(b) - uso(a) || a.rota.localeCompare(b.rota),
  );
}

export type MudancaRota = {
  rota: string;
  cluster: string;
  riscoConfig: Risco;
  riscoPrevisao: Risco;
  usoConfig: number | null;
  usoPrevisao: number | null;
  volumeConfigM3: number;
  volumePrevisaoM3: number;
  pesoConfigKg: number;
  pesoPrevisaoKg: number;
};

export type Comparacao = {
  rotas: number;
  volumeConfigM3: number;
  volumePrevisaoM3: number;
  pesoConfigKg: number;
  pesoPrevisaoKg: number;
  pacotesConfig: number;
  pacotesPrevisao: number;

  porRisco: Record<Risco, { config: number; previsao: number }>;

  mudancas: MudancaRota[];
};

const GRAU: Record<Risco, number> = { ok: 0, "sem-veiculo": 0, limite: 1, estouro: 2 };
const usoMaior = (r: RotaCarga) =>
  r.usoPeso === null || r.usoVolume === null ? null : Math.max(r.usoPeso, r.usoVolume);

export function compararFontes(config: RotaCarga[], previsao: RotaCarga[]): Comparacao {
  const porRota = new Map(previsao.map((r) => [r.rota, r]));
  const vazio = () => ({ config: 0, previsao: 0 });
  const c: Comparacao = {
    rotas: 0,
    volumeConfigM3: 0,
    volumePrevisaoM3: 0,
    pesoConfigKg: 0,
    pesoPrevisaoKg: 0,
    pacotesConfig: 0,
    pacotesPrevisao: 0,
    porRisco: { estouro: vazio(), limite: vazio(), ok: vazio(), "sem-veiculo": vazio() },
    mudancas: [],
  };
  for (const a of config) {
    const b = porRota.get(a.rota);
    if (!b) continue;
    c.rotas++;
    c.volumeConfigM3 += a.volumeM3;
    c.volumePrevisaoM3 += b.volumeM3;
    c.pesoConfigKg += a.pesoKg;
    c.pesoPrevisaoKg += b.pesoKg;
    c.pacotesConfig += a.pacotes;
    c.pacotesPrevisao += b.pacotes;
    c.porRisco[a.risco].config++;
    c.porRisco[b.risco].previsao++;
    if (a.risco !== b.risco) {
      c.mudancas.push({
        rota: a.rota,
        cluster: a.cluster,
        riscoConfig: a.risco,
        riscoPrevisao: b.risco,
        usoConfig: usoMaior(a),
        usoPrevisao: usoMaior(b),
        volumeConfigM3: a.volumeM3,
        volumePrevisaoM3: b.volumeM3,
        pesoConfigKg: a.pesoKg,
        pesoPrevisaoKg: b.pesoKg,
      });
    }
  }
  c.mudancas.sort(
    (x, y) =>
      GRAU[y.riscoPrevisao] - GRAU[y.riscoConfig] - (GRAU[x.riscoPrevisao] - GRAU[x.riscoConfig]) ||
      (y.usoPrevisao ?? 0) - (x.usoPrevisao ?? 0),
  );
  return c;
}

export type Ajudante = {
  rota: RotaCarga;
  folgaVolumeM3: number;
  folgaPesoKg: number;

  motivo?: MotivoApoio;
};

export function paradasQueCasam(r: RotaCarga, texto: string): ParadaCarga[] {
  const t = texto.trim().toUpperCase();
  if (!t) return [];
  return r.detalhe.filter((p) => p.id.toUpperCase().includes(t));
}

export function casaProcura(r: RotaCarga, texto: string): boolean {
  const t = texto.trim().toUpperCase();
  if (!t) return true;
  return r.rota.toUpperCase().includes(t) || paradasQueCasam(r, t).length > 0;
}

export type Excesso = { volumeM3: number; pesoKg: number };

export function excessoDaRota(r: RotaCarga): Excesso {
  if (!r.tipo) return { volumeM3: 0, pesoKg: 0 };
  return {
    volumeM3: Math.max(0, r.volumeM3 - r.tipo.cubagemM3 * LIMITE_ALERTA),
    pesoKg: Math.max(0, r.pesoKg - r.tipo.pesoMaxKg * LIMITE_ALERTA),
  };
}

export function rotasQuePodemAjudar(
  alvo: RotaCarga,
  todas: RotaCarga[],
  apoio: MapaApoio = {},
): Ajudante[] {
  if (!alvo.cluster) return [];
  const porCidade = Boolean(alvo.cidades?.length);
  const saida: Ajudante[] = [];
  for (const r of todas) {
    if (r.rota === alvo.rota || r.cluster !== alvo.cluster || !r.tipo || r.risco !== "ok") continue;
    const motivo = porCidade ? motivoDeApoio(r.cidades, alvo.cidades, apoio) : null;
    if (porCidade && !motivo) continue;
    const folgaVolumeM3 = r.tipo.cubagemM3 * LIMITE_ALERTA - r.volumeM3;
    const folgaPesoKg = r.tipo.pesoMaxKg * LIMITE_ALERTA - r.pesoKg;
    if (folgaVolumeM3 <= 0 || folgaPesoKg <= 0) continue;
    saida.push({ rota: r, folgaVolumeM3, folgaPesoKg, ...(motivo ? { motivo } : {}) });
  }
  const ordem = (a: Ajudante) => (a.motivo?.tipo === "caminho" ? 1 : 0);
  return saida.sort((a, b) => ordem(a) - ordem(b) || b.folgaVolumeM3 - a.folgaVolumeM3);
}

const UF_POR_NOME: Record<string, string> = {
  ACRE: "AC", ALAGOAS: "AL", AMAPA: "AP", AMAZONAS: "AM", BAHIA: "BA", CEARA: "CE", "DISTRITO FEDERAL": "DF",
  "ESPIRITO SANTO": "ES", GOIAS: "GO", MARANHAO: "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS",
  "MINAS GERAIS": "MG", PARA: "PA", PARAIBA: "PB", PARANA: "PR", PERNAMBUCO: "PE", PIAUI: "PI",
  "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS", RONDONIA: "RO", RORAIMA: "RR",
  "SANTA CATARINA": "SC", "SAO PAULO": "SP", SERGIPE: "SE", TOCANTINS: "TO",
};

function uf(id: unknown, nome: unknown): string {
  const m = texto(id).toUpperCase().match(/(?:^|[^A-Z])([A-Z]{2})$/);
  if (m) return m[1];
  const k = texto(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  return UF_POR_NOME[k] ?? "";
}

export function cidadesDosPontos(
  linhas: string[][],
  chaveId: (v: unknown) => string,
): Map<string, string> {
  const saida = new Map<string, string>();
  if (linhas.length < 2) return saida;
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const c = { id: cab.indexOf("ID_SELLER"), cidade: cab.indexOf("CIDADE"), ufId: cab.indexOf("UF_ID"), ufNome: cab.indexOf("UF_NOME") };
  if (c.id < 0 || c.cidade < 0) return saida;
  const contagem = new Map<string, Map<string, number>>();
  for (const l of linhas.slice(1)) {
    const k = chaveId(l[c.id]);
    const nome = texto(l[c.cidade]);
    if (!k || !nome) continue;
    const sigla = uf(c.ufId >= 0 ? l[c.ufId] : "", c.ufNome >= 0 ? l[c.ufNome] : "");
    const cidade = sigla ? nome + "/" + sigla : nome;
    const m = contagem.get(k) ?? new Map<string, number>();
    m.set(cidade, (m.get(cidade) ?? 0) + 1);
    contagem.set(k, m);
  }
  for (const [k, m] of contagem) saida.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return saida;
}

export function cidadesDasParadas(detalhe: ParadaCarga[]): string[] {
  const porCidade = new Map<string, number>();
  for (const p of detalhe) if (p.cidade) porCidade.set(p.cidade, (porCidade.get(p.cidade) ?? 0) + p.pacotes);
  return [...porCidade.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([c]) => c);
}

export function lerPrevisao(
  linhas: string[][],
  dataISO: string,
  chaveId: (v: unknown) => string,
): { previsao: Map<string, Previsao>; atualizadoEm: string } {
  const previsao = new Map<string, Previsao>();
  if (linhas.length < 2) return { previsao, atualizadoEm: "" };
  const cab = (linhas[0] ?? []).map((c) => texto(c).toUpperCase());
  const i = (n: string) => cab.indexOf(n);
  const c = {
    data: i("DATA"),
    id: i("ID_SELLER"),
    pacotes: i("PACOTES"),
    volume: i("VOLUME_M3"),
    peso: i("PESO_KG"),
    atualizado: i("ATUALIZADO_EM"),
  };
  if (c.id < 0 || c.data < 0) return { previsao, atualizadoEm: "" };
  const num = (v: unknown) => {
    const n = Number(texto(v));
    return Number.isFinite(n) ? n : 0;
  };
  let atualizadoEm = "";
  for (const l of linhas.slice(1)) {
    if (texto(l[c.data]).slice(0, 10) !== dataISO) continue;
    const k = chaveId(l[c.id]);
    if (!k) continue;
    const p = previsao.get(k) ?? { pacotes: 0, volumeM3: 0, pesoKg: 0 };
    p.pacotes += c.pacotes >= 0 ? num(l[c.pacotes]) : 0;
    p.volumeM3 += c.volume >= 0 ? num(l[c.volume]) : 0;
    p.pesoKg += c.peso >= 0 ? num(l[c.peso]) : 0;
    previsao.set(k, p);
    if (!atualizadoEm && c.atualizado >= 0) atualizadoEm = texto(l[c.atualizado]);
  }
  return { previsao, atualizadoEm };
}
