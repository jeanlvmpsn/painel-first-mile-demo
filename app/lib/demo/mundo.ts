// Mundo ficticio da demo: hub, clusters, transportadoras, pontos de coleta e
// a operacao de cada dia (rotas, paradas, coletas, respostas do Forms).
//
// Tudo e deterministico: a mesma data gera sempre os mesmos dados (semente
// pela data). O dia de hoje "anda" com o relogio: so as paradas com horario
// ja passado aparecem como visitadas.

// --- aleatorio com semente ---------------------------------------------------

export function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = {
  (): number;
  int: (min: number, max: number) => number;
  pick: <T>(lista: readonly T[]) => T;
  chance: (p: number) => boolean;
};

export function rng(semente: string | number): Rng {
  let a = typeof semente === "number" ? semente >>> 0 : hash(semente);
  const f = (() => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  f.int = (min, max) => min + Math.floor(f() * (max - min + 1));
  f.pick = (lista) => lista[Math.floor(f() * lista.length)];
  f.chance = (p) => f() < p;
  return f;
}

// --- datas -------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

export function agoraSP(): { iso: string; min: number; seg: number } {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()))
    p[x.type] = x.value;
  return { iso: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, seg: +p.second };
}

export const hojeISO = () => agoraSP().iso;

export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export const br = (iso: string) => iso.split("-").reverse().join("/");
export const brTraco = (iso: string) => iso.split("-").reverse().join("-");
export const diaDaSemana = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

export const hhmm = (min: number) => {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};

// Minuto "simulado" do dia de hoje: antes das 11h30 a demo mostra a operacao
// como estaria as 11h30, para quem abre cedo nao ver um dia vazio.
export function minutoSimulado(iso: string): number {
  const agora = agoraSP();
  if (iso < agora.iso) return 24 * 60;
  if (iso > agora.iso) return -1;
  return Math.max(agora.min, 11 * 60 + 30);
}

// --- mundo fixo --------------------------------------------------------------

export const HUB = "CAMPINAS";

export type Cluster = { codigo: string; cidade: string; cidades: string[] };

export const CLUSTERS: Cluster[] = [
  { codigo: "C01", cidade: "Campinas", cidades: ["Campinas"] },
  { codigo: "C02", cidade: "Campinas", cidades: ["Campinas"] },
  { codigo: "C03", cidade: "Valinhos", cidades: ["Valinhos", "Vinhedo"] },
  { codigo: "C04", cidade: "Sumaré", cidades: ["Sumaré", "Hortolândia"] },
  { codigo: "C05", cidade: "Americana", cidades: ["Americana", "Santa Bárbara d'Oeste"] },
  { codigo: "C06", cidade: "Paulínia", cidades: ["Paulínia", "Cosmópolis"] },
  { codigo: "C07", cidade: "Indaiatuba", cidades: ["Indaiatuba", "Salto"] },
  { codigo: "C08", cidade: "Jundiaí", cidades: ["Jundiaí", "Itupeva"] },
  { codigo: "C09", cidade: "Itatiba", cidades: ["Itatiba", "Morungaba"] },
  { codigo: "C10", cidade: "Limeira", cidades: ["Limeira", "Cordeirópolis"] },
  { codigo: "C11", cidade: "Piracicaba", cidades: ["Piracicaba"] },
  { codigo: "C12", cidade: "Mogi Mirim", cidades: ["Mogi Mirim", "Mogi Guaçu"] },
];

// Transportadoras ficticias. "A DEFINIR" e o marcador de rota sem dono.
export const TRANSPORTADORAS = [
  "Alfa Rotas",
  "Beta Cargas",
  "Ciclo Transportes",
  "Delta Log",
  "Ômega Logística",
  "Prisma Transportes",
  "Vértice Cargas",
  "Zênite Log",
] as const;
export const TRANSPORTADORA_MELIONE = "Frota Própria";
export const TRANSPORTADORA_SEM_DONO = "A DEFINIR";

export const PERFIS_VEICULO = [
  { perfil: "VUC", veiculo: "VUC Fixo", cap: 900 },
  { perfil: "Van", veiculo: "Van Fixo", cap: 450 },
  { perfil: "HR", veiculo: "HR Fixo", cap: 650 },
  { perfil: "Médio", veiculo: "3/4 Fixo", cap: 1400 },
  { perfil: "Utilitário", veiculo: "Utilitário Fixo", cap: 250 },
] as const;

const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Hugo", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nelson", "Olívia", "Paulo", "Rafaela", "Sérgio", "Tatiane", "Vitor", "Wesley", "Yasmin"];
const SOBRENOMES = ["Almeida", "Barbosa", "Cardoso", "Dias", "Esteves", "Ferraz", "Gomes", "Henriques", "Lima", "Macedo", "Nogueira", "Pereira", "Queiroz", "Ramos", "Siqueira", "Teixeira", "Vieira"];

const PREFIXOS_LOJA = ["Casa", "Mundo", "Loja", "Empório", "Planeta", "Central", "Super", "Mega", "Top", "Rei"];
const TEMAS_LOJA = ["dos Presentes", "Eletrônicos", "Fit", "Pet", "Kids", "Utilidades", "da Moda", "Auto Peças", "Games", "Decor", "Beleza", "Ferramentas", "Esportes", "Móveis", "Celulares", "Papelaria", "Calçados", "Cozinha", "Bebê", "Iluminação"];
const SUFIXOS_LOJA = ["", "", " Store", " Shop", " Distribuidora", " Comércio", " Online", " Brasil"];
const RUAS = ["Rua das Acácias", "Av. dos Ipês", "Rua do Comércio", "Av. Brasil", "Rua XV de Novembro", "Rua das Palmeiras", "Av. Industrial", "Rua Santos Dumont", "Rua dos Andradas", "Av. das Nações"];

export type Ponto = {
  // ID da parada como o relatorio mostra: seller ("1131387475") ou place
  // ("849817033_22414").
  id: string;
  sellerId: string;
  nome: string;
  ehPlace: boolean;
  cluster: string;
  cidade: string;
  endereco: string;
  // Pacotes medios por dia.
  media: number;
  hb: boolean;
  // Janela de coleta.
  janelaIni: number;
  janelaFim: number;
  // Entra na rota todo dia ou so as vezes.
  frequencia: number;
  // Ponto que costuma dar problema (local fechado, nao preparado).
  problematico: boolean;
  // Rota "dona" do ponto (indice da rota do cluster).
  rotaBase: number;
};

export type Motorista = { nome: string; id: string; placa: string; perfil: (typeof PERFIS_VEICULO)[number]; transportadora: string };

function placa(r: Rng): string {
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return L[r.int(0, 25)] + L[r.int(0, 25)] + L[r.int(0, 25)] + r.int(0, 9) + L[r.int(0, 25)] + r.int(10, 99);
}

function montarPontos(): Ponto[] {
  const r = rng("pontos-v1");
  const pontos: Ponto[] = [];
  const usados = new Set<string>();
  for (const c of CLUSTERS) {
    const qtd = c.codigo === "C01" || c.codigo === "C02" ? 46 : r.int(26, 38);
    const rotasNoCluster = Math.max(4, Math.round(qtd / 4.2));
    for (let i = 0; i < qtd; i++) {
      let nome = "";
      do {
        nome = r.pick(PREFIXOS_LOJA) + " " + r.pick(TEMAS_LOJA) + r.pick(SUFIXOS_LOJA);
      } while (usados.has(nome));
      usados.add(nome);
      const sellerId = String(r.int(100000000, 1999999999));
      const ehPlace = r.chance(0.18);
      const grande = r.chance(0.12);
      const media = grande ? r.int(250, 900) : r.int(8, 140);
      const ini = r.pick([8 * 60, 9 * 60, 10 * 60, 11 * 60, 13 * 60, 14 * 60]);
      pontos.push({
        id: ehPlace ? sellerId + "_" + r.int(10000, 99999) : sellerId,
        sellerId,
        nome: ehPlace ? "Agência " + nome : nome,
        ehPlace,
        cluster: c.codigo,
        cidade: r.pick(c.cidades),
        endereco: r.pick(RUAS) + ", " + r.int(10, 2400),
        media,
        hb: r.chance(0.16),
        janelaIni: ini,
        janelaFim: ini + r.pick([120, 180, 240]),
        frequencia: r.chance(0.8) ? 1 : 0.6,
        problematico: r.chance(0.08),
        rotaBase: r.int(0, rotasNoCluster - 1),
      });
    }
  }
  return pontos;
}

function montarMotoristas(): Motorista[] {
  const r = rng("motoristas-v1");
  const lista: Motorista[] = [];
  for (const t of TRANSPORTADORAS) {
    const frota = r.int(14, 26);
    for (let i = 0; i < frota; i++) {
      lista.push({
        nome: r.pick(NOMES) + " " + r.pick(SOBRENOMES),
        id: String(r.int(10000000, 99999999)),
        placa: placa(r),
        perfil: r.chance(0.55) ? PERFIS_VEICULO[0] : r.pick(PERFIS_VEICULO),
        transportadora: t,
      });
    }
  }
  for (let i = 0; i < 22; i++) {
    lista.push({
      nome: r.pick(NOMES) + " " + r.pick(SOBRENOMES),
      id: String(r.int(10000000, 99999999)),
      placa: placa(r),
      perfil: r.chance(0.5) ? PERFIS_VEICULO[0] : PERFIS_VEICULO[1],
      transportadora: TRANSPORTADORA_MELIONE,
    });
  }
  return lista;
}

let cachePontos: Ponto[] | null = null;
let cacheMotoristas: Motorista[] | null = null;
export const pontos = () => (cachePontos ??= montarPontos());
export const motoristas = () => (cacheMotoristas ??= montarMotoristas());
export const pontoPorId = (() => {
  let m: Map<string, Ponto> | null = null;
  return (id: string) => (m ??= new Map(pontos().map((p) => [p.id, p]))).get(id);
})();

// Transportadora "dona" de cada cluster (com uma segunda para dividir).
export function transportadorasDoCluster(cluster: string): string[] {
  const i = CLUSTERS.findIndex((c) => c.codigo === cluster);
  return [TRANSPORTADORAS[i % TRANSPORTADORAS.length], TRANSPORTADORAS[(i + 3) % TRANSPORTADORAS.length]];
}

// --- operacao do dia ---------------------------------------------------------

export const MOTIVOS = {
  semEspaco: "Não tenho mais espaço",
  naoPreparado: "O vendedor não os tem preparados",
  fechado: "O local estava fechado",
  parcial: "Coleta Parcial",
  naoCabe: "Os pacotes não cabem no veículo",
  inacessivel: "Área inacessível",
} as const;

export type ParadaDia = {
  ponto: Ponto;
  ordem: number;
  // Minuto do dia previsto para a passagem.
  previsto: number;
  estimados: number;
  preparados: number;
  // Desfecho (vale quando a passagem ja aconteceu).
  coletados: number;
  naoPreparados: number;
  naoCabem: number;
  motivo: string;
  pontualidade: "on_time" | "early" | "late";
  horaReal: number;
  foraDeArea: boolean;
  handshake: "agree" | "disagree" | "";
  planejada: boolean;
};

export type RotaDia = {
  nome: string;
  id: string;
  cluster: string;
  tipo: "first_mile" | "melione";
  dedicada: boolean;
  avulsa: boolean;
  transportadora: string;
  // Transportadora "A DEFINIR" ate alguem assumir.
  emAberto: boolean;
  start: number;
  perfil: string;
  veiculo: string;
  motorista: Motorista | null;
  paradas: ParadaDia[];
  // Rota que nao saiu (NS): nao aparece no relatorio de coleta.
  ns: boolean;
  // Motorista respondeu o Forms (quando terminar).
  respondeForms: boolean;
  estouro: boolean;
  hub: string;
  // Avulsa: a rota e a transportadora do ponto que ficou com pacote.
  origem?: { rota: string; transportadora: string; motivo: string };
};

export type Dia = {
  iso: string;
  rotas: RotaDia[];
};

const cacheDias = new Map<string, Dia>();

// Clusters em que roda uma dedicada (um ponto grande, rota exclusiva).
const CLUSTERS_DED = ["C01", "C04", "C05", "C08", "C10"];

export function dia(iso: string): Dia {
  const c = cacheDias.get(iso);
  if (c) return c;
  const r = rng("dia-" + iso);
  const dow = diaDaSemana(iso);
  const sabado = dow === 6;
  const domingo = dow === 0;
  const escala = domingo ? 0.35 : sabado ? 0.7 : 1;
  const frota = motoristas();
  const usados = new Set<string>();
  const motoristaPara = (transportadora: string, perfilPedido: string) => {
    const livres = frota.filter((m) => m.transportadora === transportadora && !usados.has(m.id));
    if (!livres.length) return null;
    const mesmo = livres.filter((m) => m.perfil.perfil === perfilPedido);
    const m = mesmo.length && r.chance(0.85) ? r.pick(mesmo) : r.pick(livres);
    usados.add(m.id);
    return m;
  };

  const rotas: RotaDia[] = [];
  let seq = 0;
  const novoId = () => String(40_000_000 + (hash(iso) % 4_000_000) * 10 + ++seq);

  const desfecho = (p: Ponto, ordem: number, previsto: number, carga: number): ParadaDia => {
    const estimados = carga;
    // A maioria dos pontos entrega tudo; alguns ficam com poucos pacotes nao
    // preparados.
    let preparados = r.chance(0.88) ? estimados : Math.round(estimados * (0.92 + r() * 0.07));
    let coletados = preparados;
    let motivo = "";
    let naoPreparados = estimados - preparados;
    let naoCabem = 0;
    const sorteio = r();
    const risco = p.problematico ? 3 : 1;
    if (sorteio < 0.025 * risco) {
      motivo = MOTIVOS.fechado;
      coletados = 0;
    } else if (sorteio < 0.05 * risco) {
      motivo = MOTIVOS.naoPreparado;
      coletados = Math.round(preparados * r() * 0.5);
      naoPreparados = estimados - coletados;
      preparados = coletados;
    } else if (sorteio < 0.065 * risco + 0.01) {
      motivo = MOTIVOS.semEspaco;
      coletados = Math.round(preparados * (0.3 + r() * 0.5));
      naoCabem = preparados - coletados;
    } else if (sorteio < 0.075 * risco + 0.015) {
      motivo = MOTIVOS.parcial;
      coletados = Math.round(preparados * (0.5 + r() * 0.4));
      naoCabem = preparados - coletados;
    } else if (sorteio < 0.08 * risco + 0.017) {
      motivo = MOTIVOS.inacessivel;
      coletados = 0;
    }
    const desvio = Math.round((r() - 0.35) * 70);
    const horaReal = previsto + desvio;
    const pontualidade = horaReal < p.janelaIni - 10 ? "early" : horaReal > p.janelaFim + 10 ? "late" : "on_time";
    return {
      ponto: p,
      ordem,
      previsto,
      estimados,
      preparados,
      coletados,
      naoPreparados: Math.max(0, naoPreparados),
      naoCabem: Math.max(0, naoCabem),
      motivo,
      pontualidade,
      horaReal,
      foraDeArea: motivo === MOTIVOS.fechado && r.chance(0.2),
      handshake: motivo ? (r.chance(0.6) ? "agree" : "disagree") : "",
      planejada: true,
    };
  };

  // Rotas regulares por cluster.
  for (const cl of CLUSTERS) {
    const doCluster = pontos().filter((p) => p.cluster === cl.codigo && !(CLUSTERS_DED.includes(cl.codigo) && p.media > 600));
    const qtdRotas = Math.max(...doCluster.map((p) => p.rotaBase)) + 1;
    const [tp1, tp2] = transportadorasDoCluster(cl.codigo);
    for (let k = 0; k < qtdRotas; k++) {
      if (r() > escala + 0.05) continue;
      const doRota = doCluster
        .filter((p) => p.rotaBase === k && r() < p.frequencia * (domingo ? 0.5 : 1))
        .sort((a, b) => a.janelaIni - b.janelaIni || a.id.localeCompare(b.id));
      if (!doRota.length) continue;
      const numero = 100 + Number(cl.codigo.slice(1)) * 10 + k;
      const transportadora = k % 3 === 2 ? tp2 : tp1;
      const perfilPedido = r.chance(0.6) ? "VUC" : r.pick(["Van", "HR", "Médio"]);
      const pv = PERFIS_VEICULO.find((p) => p.perfil === perfilPedido)!;
      const emAberto = r.chance(sabado ? 0.06 : 0.03);
      const motorista = emAberto || r.chance(0.04) ? null : motoristaPara(transportadora, perfilPedido);
      const start = Math.max(7 * 60, Math.min(...doRota.map((p) => p.janelaIni)) - 40) + r.int(0, 3) * 15;
      let t = start + 35;
      const paradas = doRota.map((p, i) => {
        const carga = Math.max(1, Math.round(p.media * (0.6 + r() * 0.8)));
        t = Math.max(t, p.janelaIni - 15) + r.int(10, 40);
        return desfecho(p, i + 1, t, carga);
      });
      rotas.push({
        nome: `${HUB}_${cl.codigo}_${numero}`,
        id: novoId(),
        cluster: cl.codigo,
        tipo: "first_mile",
        dedicada: false,
        avulsa: false,
        transportadora: emAberto ? TRANSPORTADORA_SEM_DONO : transportadora,
        emAberto,
        start,
        perfil: pv.perfil,
        veiculo: motorista ? motorista.perfil.veiculo : "",
        motorista,
        paradas,
        ns: !emAberto && !!motorista && r.chance(0.02),
        respondeForms: r.chance(0.86),
        estouro: r.chance(0.05),
        hub: "CPS",
      });
    }
  }

  // Dedicadas: o ponto grande do cluster tem rota exclusiva.
  for (const codigo of CLUSTERS_DED) {
    if (domingo) continue;
    const grandes = pontos().filter((p) => p.cluster === codigo && p.media > 600);
    grandes.forEach((p, i) => {
      const [tp] = transportadorasDoCluster(codigo);
      const viagens = p.media > 800 ? 2 : 1;
      for (let v = 0; v < viagens; v++) {
        const motorista = motoristaPara(tp, "Médio");
        const start = p.janelaIni - 30 + v * 150;
        const carga = Math.round((p.media / viagens) * (0.8 + r() * 0.4));
        rotas.push({
          nome: `CPS_${codigo}_DED_${String(i * 10 + v + 1).padStart(3, "0")}`,
          id: novoId(),
          cluster: codigo,
          tipo: "first_mile",
          dedicada: true,
          avulsa: false,
          transportadora: tp,
          emAberto: false,
          start,
          perfil: "Médio",
          veiculo: motorista?.perfil.veiculo ?? "",
          motorista,
          paradas: [desfecho(p, 1, start + 40, carga)],
          ns: false,
          respondeForms: r.chance(0.9),
          estouro: false,
          hub: "CPS",
        });
      }
    });
  }

  // MeliOne: frota propria, poucas rotas nos clusters centrais.
  if (!domingo) {
    const centrais = pontos().filter((p) => ["C01", "C02", "C03"].includes(p.cluster) && p.media < 80);
    const qtd = sabado ? 4 : 8;
    for (let k = 0; k < qtd; k++) {
      const cl = ["C01", "C02", "C03"][k % 3];
      const escolha = centrais.filter((p) => p.cluster === cl && r.chance(0.18)).slice(0, 5);
      if (!escolha.length) continue;
      const motorista = motoristaPara(TRANSPORTADORA_MELIONE, "VUC");
      const start = 9 * 60 + r.int(0, 8) * 15;
      let t = start + 30;
      rotas.push({
        nome: `CPS_${cl}_MEL_${String(k + 1).padStart(3, "0")}`,
        id: novoId(),
        cluster: cl,
        tipo: "melione",
        dedicada: false,
        avulsa: false,
        transportadora: TRANSPORTADORA_MELIONE,
        emAberto: false,
        start,
        perfil: "VUC",
        veiculo: motorista?.perfil.veiculo ?? "",
        motorista,
        paradas: escolha.map((p, i) => {
          t += r.int(15, 35);
          return desfecho(p, i + 1, t, Math.max(1, Math.round(p.media * (0.5 + r()))));
        }),
        ns: false,
        respondeForms: false,
        estouro: false,
        hub: "CPS",
      });
    }
  }

  // Sabado: rotas de hubs satelite que descarregam em Campinas.
  if (sabado) {
    for (const [hub, n] of [["BRXSP5", 6], ["BRXMG3", 4]] as const) {
      for (let k = 0; k < n; k++) {
        const tp = r.pick(TRANSPORTADORAS);
        const motorista = motoristaPara(tp, "VUC");
        rotas.push({
          nome: `${hub}_C0${(k % 4) + 1}_${200 + k}`,
          id: novoId(),
          cluster: `C0${(k % 4) + 1}`,
          tipo: "first_mile",
          dedicada: false,
          avulsa: false,
          transportadora: tp,
          emAberto: false,
          start: 9 * 60 + k * 15,
          perfil: "VUC",
          veiculo: motorista?.perfil.veiculo ?? "",
          motorista,
          paradas: [],
          ns: false,
          respondeForms: false,
          estouro: false,
          hub,
        });
      }
    }
  }

  // Avulsas: rotas criadas no dia para voltar em ponto que ficou com pacote
  // (local fechado, sem espaco). Sem nome no relatorio, so o ID.
  const comSobra = rotas
    .filter((x) => !x.ns && x.tipo === "first_mile")
    .flatMap((x) => x.paradas.map((p) => Object.assign(p, { rotaDona: x })))
    .filter((p) => p.estimados - p.coletados > 25 && p.previsto < 15 * 60);
  const qtdAvulsas = Math.min(comSobra.length, domingo ? 1 : r.int(4, 9));
  for (let k = 0; k < qtdAvulsas; k++) {
    const alvo = comSobra[Math.floor((k * comSobra.length) / qtdAvulsas)] as ParadaDia & { rotaDona: RotaDia };
    const tp = transportadorasDoCluster(alvo.ponto.cluster)[1];
    const motorista = motoristaPara(tp, "Van");
    const start = alvo.previsto + 90 + r.int(0, 60);
    const sobra = alvo.estimados - alvo.coletados;
    const parada = desfecho(alvo.ponto, 1, start + 40, sobra);
    parada.planejada = false;
    parada.motivo = r.chance(0.8) ? "" : parada.motivo;
    if (!parada.motivo) parada.coletados = Math.round(sobra * (0.85 + r() * 0.15));
    rotas.push({
      nome: "",
      id: novoId(),
      cluster: alvo.ponto.cluster,
      tipo: "first_mile",
      dedicada: false,
      avulsa: true,
      transportadora: tp,
      emAberto: false,
      start,
      perfil: "Van",
      veiculo: motorista?.perfil.veiculo ?? "Van Fixo",
      motorista,
      paradas: [parada],
      ns: false,
      respondeForms: r.chance(0.5),
      estouro: false,
      hub: "CPS",
      origem: { rota: alvo.rotaDona.nome, transportadora: alvo.rotaDona.transportadora, motivo: alvo.motivo },
    });
  }

  const d = { iso, rotas };
  cacheDias.set(iso, d);
  if (cacheDias.size > 70) cacheDias.delete(cacheDias.keys().next().value!);
  return d;
}

// Paradas que ja aconteceram (no dia de hoje, so ate o minuto simulado).
export function visitada(p: ParadaDia, iso: string): boolean {
  return p.horaReal <= minutoSimulado(iso);
}

export function rotaTerminou(rt: RotaDia, iso: string): boolean {
  return rt.paradas.length > 0 && rt.paradas.every((p) => visitada(p, iso));
}

export function rotaComecou(rt: RotaDia, iso: string): boolean {
  return rt.start <= minutoSimulado(iso);
}

// Datas com historico na demo.
export function diasAnteriores(iso: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => somarDias(iso, -(n - i)));
}

export const nomeDaRota = (rt: RotaDia) => rt.nome || rt.id;
