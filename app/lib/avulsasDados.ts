import {
  LINK_BASE,
  acharLinhaPorId,
  formulaLink,
  textoRotaImpactada,
  agruparAvulsas,
  chaveAvulsa,
  completarComHistorico,
  dataParaBR,
  formsDasAvulsas,
  lerColetasSalvas,
  paraHistorico,
  opcoesDaColuna,
  type Avulsa,
  type ColetaSalva,
  type ParadaColeta,
  type Registro,
} from "./avulsas";
import { getRespostasForm, getSheetsClient, SPREADSHEET_ID } from "./sheets";
import { semLinhasDoCd } from "./relatorioColeta";

const PD_ID = "demo-avulsas";
const ABA_CONTROLE = "CONTROLE DE AVULSAS";
const ABA_COLETAS = "COLETAS_D0";

const ABA_HISTORICO_COLETA = "HISTORICO_COLETA_AVULSAS";
const CABECALHO_HISTORICO_COLETA = [
  "DATA",
  "ID",
  "TRANSPORTADORA",
  "COLETADO",
  "PACOTES_COLETADOS",
];

async function garantirAbaHistoricoColeta(): Promise<void> {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: PD_ID });
  const existe = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === ABA_HISTORICO_COLETA,
  );
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: PD_ID,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: ABA_HISTORICO_COLETA } } },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: PD_ID,
      range: `${ABA_HISTORICO_COLETA}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [CABECALHO_HISTORICO_COLETA] },
    });
  }
}

export async function registrarHistoricoColeta(
  avulsasDaTela: Avulsa[],
): Promise<number> {
  const avulsas = paraHistorico(avulsasDaTela);
  if (!avulsas.length) return 0;
  try {
    await garantirAbaHistoricoColeta();
    const sheets = getSheetsClient();
    const salvas = await lerHistoricoColeta();
    const linhaPorChave = new Map<string, number>();
    for (const [chave, salva] of salvas) {
      if (salva.linha) linhaPorChave.set(chave, salva.linha);
    }

    const cab = ((await ler(PD_ID, `'${ABA_HISTORICO_COLETA}'!A1:Z1`))[0] ?? []).map(
      (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase(),
    );
    const achar = (padrao: number, ...nomes: string[]) => {
      for (const n of nomes) {
        const i = cab.indexOf(n);
        if (i >= 0) return i;
      }
      return cab.length ? -1 : padrao;
    };
    const iData = achar(0, "data", "datadarota", "dia");
    const iId = achar(1, "id", "iddarota", "iddorota", "idrota", "idavulsa");
    const iTp = achar(2, "transportadora");
    const iCol = achar(3, "coletado");
    const iPac = achar(4, "pacotescoletados", "coletados", "pacotes", "qtdcoletada", "quantidadecoletada");
    if (iData < 0 || iId < 0 || iPac < 0) {
      throw new Error("a aba nao tem as colunas DATA, ID e PACOTES_COLETADOS");
    }
    const largura = Math.max(cab.length, 5);

    const dados: { range: string; values: string[][] }[] = [];
    const novasLinhas: string[][] = [];
    for (const a of avulsas) {
      const coletado = a.coletados > 0 ? "Sim" : "Nao";
      const pacotes = String(a.coletados ?? 0);
      const linha = linhaPorChave.get(chaveAvulsa(a.data, a.id));
      if (linha) {
        dados.push({
          range: `${ABA_HISTORICO_COLETA}!${letra(iPac)}${linha}`,
          values: [[pacotes]],
        });
        if (iCol >= 0) {
          dados.push({
            range: `${ABA_HISTORICO_COLETA}!${letra(iCol)}${linha}`,
            values: [[coletado]],
          });
        }
      } else {
        const nova = new Array<string>(largura).fill("");
        nova[iData] = a.data;
        nova[iId] = a.id;
        if (iTp >= 0) nova[iTp] = a.transportadora;
        if (iCol >= 0) nova[iCol] = coletado;
        nova[iPac] = pacotes;
        novasLinhas.push(nova);
      }
    }

    if (dados.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: PD_ID,
        requestBody: { valueInputOption: "RAW", data: dados },
      });
    }
    if (novasLinhas.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: PD_ID,
        range: `${ABA_HISTORICO_COLETA}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: novasLinhas },
      });
    }
    return avulsas.length;
  } catch (e) {
    console.error("Falha ao gravar historico de coleta das avulsas:", e);
    return 0;
  }
}

async function lerHistoricoColeta(): Promise<Map<string, ColetaSalva>> {
  try {
    const r = await getSheetsClient().spreadsheets.values.get({
      spreadsheetId: PD_ID,
      range: `'${ABA_HISTORICO_COLETA}'!A1:Z200000`,

      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    });
    const salvas = lerColetasSalvas((r.data.values ?? []) as unknown[][]);
    if (salvas.size === 0) {
      console.warn(
        "HISTORICO_COLETA_AVULSAS sem linhas legiveis: confira as colunas DATA, ID e PACOTES_COLETADOS.",
      );
    }
    return salvas;
  } catch (e) {
    console.error("Falha ao ler HISTORICO_COLETA_AVULSAS:", e);
    return new Map();
  }
}

const PAINEL_ID = SPREADSHEET_ID;

const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const acharCol = (cabecalho: string[], ...nomes: string[]) => {
  const alvos = nomes.map(normalizar);
  return cabecalho.findIndex((c) => alvos.includes(normalizar(c)));
};

async function ler(planilha: string, faixa: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId: planilha,
    range: faixa,
  });
  return (r.data.values ?? []) as string[][];
}

async function anexarFotos(avulsas: Avulsa[]): Promise<void> {
  if (!avulsas.length) return;
  try {
    const forms = formsDasAvulsas(avulsas, await getRespostasForm());
    for (const a of avulsas) {
      const achado = forms[chaveAvulsa(a.data, a.id)];
      if (achado) a.forms = achado;
    }
  } catch (e) {
    console.error("Falha ao ler as fotos do bau no Forms:", e);
  }
}

export async function registrarHistoricoColetaDoRelatorio(): Promise<{
  avulsas: number;
}> {
  const coletas = semLinhasDoCd(await ler(PAINEL_ID, ABA_COLETAS + "!A1:AJ5000"));
  const cab = coletas[0] ?? [];
  const iId = acharCol(cab, "ID do Rota", "ID da Rota");
  const iNome = acharCol(cab, "Nome da Rota", "Nome do Rota");
  if (iId < 0 || iNome < 0) {
    throw new Error(
      "A aba " + ABA_COLETAS + " nao tem as colunas ID do Rota e Nome da Rota.",
    );
  }
  const iData = acharCol(cab, "Data da rota", "Data da Rota");
  const iTp = acharCol(cab, "Transportadora");
  const iColetados = cab.findIndex((c) =>
    String(c ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .includes("coletad"),
  );
  const paradas: ParadaColeta[] = coletas.slice(1).map((l) => ({
    idRota: l[iId],
    nomeRota: l[iNome],
    dataRota: iData >= 0 ? l[iData] : "",
    transportadora: iTp >= 0 ? l[iTp] : "",
    coletados: iColetados >= 0 ? l[iColetados] : "",
  }));

  const dias = [
    ...new Set(paradas.map((p) => dataParaBR(p.dataRota)).filter(Boolean)),
  ];
  const avulsas = dias.flatMap((dia) => agruparAvulsas(paradas, dia));
  return { avulsas: await registrarHistoricoColeta(avulsas) };
}

export type LeituraAvulsas = {
  avulsas: Avulsa[];
  jaRegistrados: Record<string, Registro>;

  rotasDoDia: Record<string, string>;
  opcoes: {
    motivo: string[];
    transportadora: string[];
    pagamento: string[];
    criador: string[];
    cluster: string[];
    aprovacao: string[];
  };
  erro: string | null;
};

export async function lerAvulsasDoDia(dataBR: string): Promise<LeituraAvulsas> {
  const vazio: LeituraAvulsas = {
    avulsas: [],
    jaRegistrados: {},
    rotasDoDia: {},
    opcoes: { motivo: [], transportadora: [], pagamento: [], criador: [], cluster: [], aprovacao: [] },
    erro: null,
  };

  let coletas: string[][] = [];
  const salvasPromessa = lerHistoricoColeta();
  try {
    coletas = semLinhasDoCd(await ler(PAINEL_ID, ABA_COLETAS + "!A1:AJ5000"));
  } catch (e) {
    return { ...vazio, erro: "Nao consegui ler a aba " + ABA_COLETAS + ": " + (e as Error).message };
  }

  const cab = coletas[0] ?? [];
  const iId = acharCol(cab, "ID do Rota", "ID da Rota");
  const iData = acharCol(cab, "Data da rota", "Data da Rota");
  const iTp = acharCol(cab, "Transportadora");
  const iPlan = acharCol(cab, "Planejado");
  const iNome = acharCol(cab, "Nome da Rota", "Nome do Rota");

  if (iId < 0 || iNome < 0) {
    return {
      ...vazio,
      erro:
        "A aba " + ABA_COLETAS + " nao tem as colunas ID do Rota e Nome da Rota.",
    };
  }

  const iColetados = (coletas[0] ?? []).findIndex((c) =>
    String(c ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .includes("coletad"),
  );
  const paradas: ParadaColeta[] = coletas.slice(1).map((l) => ({
    idRota: l[iId],
    nomeRota: l[iNome],
    dataRota: iData >= 0 ? l[iData] : "",
    transportadora: iTp >= 0 ? l[iTp] : "",
    planejado: iPlan >= 0 ? l[iPlan] : "",
    coletados: iColetados >= 0 ? l[iColetados] : "",
  }));
  const avulsas = agruparAvulsas(paradas, dataBR);

  const rotasDoDia: Record<string, string> = {};
  for (const p of paradas) {
    const nome = String(p.nomeRota ?? "").trim().toUpperCase();
    const id = String(p.idRota ?? "").trim();
    if (nome && id && !rotasDoDia[nome]) rotasDoDia[nome] = id;
  }

  try {
    const controle = await ler(PD_ID, "'" + ABA_CONTROLE + "'!A:M");
    const cc = controle[0] ?? [];
    const c = {
      data: acharCol(cc, "DATA"),
      tp: acharCol(cc, "TRANSPORTADORA"),
      id: acharCol(cc, "ID"),
      motivo: acharCol(cc, "MOTIVO"),
      pagamento: acharCol(cc, "PAGAMENTO"),
      criador: acharCol(cc, "Criador"),
      cluster: acharCol(cc, "CLUSTER"),
      rota: acharCol(cc, "ROTA IMPACTADA"),
      mlp: acharCol(cc, "MLP IMPACTADO"),
    };

    const iAprov = cc.findIndex(
      (t, i) => i > c.pagamento && normalizar(t) === "pagamento",
    );

    const corpo = controle.slice(1);

    const conhecidos = new Set(avulsas.map((a) => a.id));
    for (const l of corpo) {
      const id = String(l[c.id] ?? "").trim();
      if (!id || conhecidos.has(id)) continue;
      if (String(l[c.data] ?? "").trim() !== dataBR) continue;
      conhecidos.add(id);
      avulsas.push({
        id,
        data: dataBR,
        transportadora: String(l[c.tp] ?? "").trim(),
        paradas: 0,
        coletados: 0,
        link: LINK_BASE + id,
      });
    }

    completarComHistorico(avulsas, await salvasPromessa, [dataBR]);
    avulsas.sort((a, b) => a.id.localeCompare(b.id));

    const ja: Record<string, Registro> = {};
    for (const l of corpo) {
      const id = String(l[c.id] ?? "").trim();
      if (!id || !conhecidos.has(id)) continue;
      ja[chaveAvulsa(dataBR, id)] = {
        id,
        data: String(l[c.data] ?? "").trim(),
        transportadora: String(l[c.tp] ?? "").trim(),
        motivo: String(l[c.motivo] ?? "").trim(),
        pagamento: String(l[c.pagamento] ?? "").trim(),
        criador: String(l[c.criador] ?? "").trim(),
        cluster: String(l[c.cluster] ?? "").trim(),
        aprovacao: iAprov >= 0 ? String(l[iAprov] ?? "").trim() : "",
        rotaImpactada: String(l[c.rota] ?? "").trim(),
        mlpImpactado: String(l[c.mlp] ?? "").trim(),
      };
    }

    const col = (i: number) => (i < 0 ? [] : corpo.map((l) => l[i]));
    await Promise.all([registrarHistoricoColeta(avulsas), anexarFotos(avulsas)]);

    return {
      avulsas,
      jaRegistrados: ja,
      rotasDoDia,
      opcoes: {
        motivo: opcoesDaColuna(col(c.motivo)),
        transportadora: opcoesDaColuna(col(c.tp)),
        pagamento: opcoesDaColuna(col(c.pagamento)),
        criador: opcoesDaColuna(col(c.criador)),
        cluster: opcoesDaColuna(col(c.cluster)),
        aprovacao: opcoesDaColuna(col(iAprov)),
      },
      erro: null,
    };
  } catch (e) {
    completarComHistorico(avulsas, await salvasPromessa, [dataBR]);
    avulsas.sort((a, b) => a.id.localeCompare(b.id));
    return {
      ...vazio,
      avulsas,
      rotasDoDia,
      erro:
        "Li as avulsas, mas nao consegui abrir a " +
        ABA_CONTROLE +
        " da planilha de controle: " +
        (e as Error).message,
    };
  }
}

export async function lerAvulsasPeriodo(
  dataInicioBR: string,
  dataFimBR: string,
): Promise<LeituraAvulsas> {
  const vazio: LeituraAvulsas = {
    avulsas: [],
    jaRegistrados: {},
    rotasDoDia: {},
    opcoes: {
      motivo: [],
      transportadora: [],
      pagamento: [],
      criador: [],
      cluster: [],
      aprovacao: [],
    },
    erro: null,
  };

  let coletas: string[][] = [];
  const salvasPromessa = lerHistoricoColeta();
  try {
    coletas = semLinhasDoCd(await ler(PAINEL_ID, ABA_COLETAS + "!A1:AJ5000"));
  } catch (e) {
    return {
      ...vazio,
      erro:
        "Nao consegui ler a aba " + ABA_COLETAS + ": " + (e as Error).message,
    };
  }

  const cab = coletas[0] ?? [];
  const iId = acharCol(cab, "ID do Rota", "ID da Rota");
  const iData = acharCol(cab, "Data da rota", "Data da Rota");
  const iTp = acharCol(cab, "Transportadora");
  const iPlan = acharCol(cab, "Planejado");
  const iNome = acharCol(cab, "Nome da Rota", "Nome do Rota");
  const iColetados = (coletas[0] ?? []).findIndex((c) =>
    String(c ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .includes("coletad"),
  );
  const paradas: ParadaColeta[] = coletas.slice(1).map((l) => ({
    idRota: l[iId],
    nomeRota: l[iNome],
    dataRota: iData >= 0 ? l[iData] : "",
    transportadora: iTp >= 0 ? l[iTp] : "",
    planejado: iPlan >= 0 ? l[iPlan] : "",
    coletados: iColetados >= 0 ? l[iColetados] : "",
  }));

  const dias = diasNoIntervaloBR(dataInicioBR, dataFimBR);
  let avulsas: Avulsa[] = [];
  for (const dia of dias) {
    avulsas = avulsas.concat(agruparAvulsas(paradas, dia));
  }

  const rotasDoDia: Record<string, string> = {};
  for (const p of paradas) {
    const nome = String(p.nomeRota ?? "").trim().toUpperCase();
    const id = String(p.idRota ?? "").trim();
    if (nome && id && !rotasDoDia[nome]) rotasDoDia[nome] = id;
  }

  try {
    const controle = await ler(PD_ID, "'" + ABA_CONTROLE + "'!A:M");
    const cc = controle[0] ?? [];
    const c = {
      data: acharCol(cc, "DATA"),
      tp: acharCol(cc, "TRANSPORTADORA"),
      id: acharCol(cc, "ID"),
      motivo: acharCol(cc, "MOTIVO"),
      pagamento: acharCol(cc, "PAGAMENTO"),
      criador: acharCol(cc, "Criador"),
      cluster: acharCol(cc, "CLUSTER"),
      rota: acharCol(cc, "ROTA IMPACTADA"),
      mlp: acharCol(cc, "MLP IMPACTADO"),
    };

    const iAprov = cc.findIndex(
      (t, i) => i > c.pagamento && normalizar(t) === "pagamento",
    );

    const corpo = controle.slice(1);

    const ja: Record<string, Registro> = {};
    for (const dia of dias) {
      const conhecidos = new Set(
        avulsas.filter((a) => a.data === dia).map((a) => a.id),
      );
      for (const l of corpo) {
        const id = String(l[c.id] ?? "").trim();
        if (!id || conhecidos.has(id)) continue;
        if (String(l[c.data] ?? "").trim() !== dia) continue;
        conhecidos.add(id);
        avulsas.push({
          id,
          data: dia,
          transportadora: String(l[c.tp] ?? "").trim(),
          paradas: 0,
          coletados: 0,
          link: LINK_BASE + id,
        });
      }

      for (const l of corpo) {
        const id = String(l[c.id] ?? "").trim();
        if (!id || !conhecidos.has(id)) continue;
        ja[chaveAvulsa(dia, id)] = {
          id,
          data: String(l[c.data] ?? "").trim(),
          transportadora: String(l[c.tp] ?? "").trim(),
          motivo: String(l[c.motivo] ?? "").trim(),
          pagamento: String(l[c.pagamento] ?? "").trim(),
          criador: String(l[c.criador] ?? "").trim(),
          cluster: String(l[c.cluster] ?? "").trim(),
          aprovacao: iAprov >= 0 ? String(l[iAprov] ?? "").trim() : "",
          rotaImpactada: String(l[c.rota] ?? "").trim(),
          mlpImpactado: String(l[c.mlp] ?? "").trim(),
        };
      }
    }
    completarComHistorico(avulsas, await salvasPromessa, dias);
    avulsas.sort((a, b) =>
      a.data === b.data
        ? a.id.localeCompare(b.id)
        : a.data.localeCompare(b.data),
    );

    const col = (i: number) => (i < 0 ? [] : corpo.map((l) => l[i]));
    await anexarFotos(avulsas);

    return {
      avulsas,
      jaRegistrados: ja,
      rotasDoDia,
      opcoes: {
        motivo: opcoesDaColuna(col(c.motivo)),
        transportadora: opcoesDaColuna(col(c.tp)),
        pagamento: opcoesDaColuna(col(c.pagamento)),
        criador: opcoesDaColuna(col(c.criador)),
        cluster: opcoesDaColuna(col(c.cluster)),
        aprovacao: opcoesDaColuna(col(iAprov)),
      },
      erro: null,
    };
  } catch (e) {
    return {
      ...vazio,
      avulsas,
      rotasDoDia,
      erro:
        "Li as avulsas, mas nao consegui abrir a " +
        ABA_CONTROLE +
        " da planilha de controle: " +
        (e as Error).message,
    };
  }
}

function diasNoIntervaloBR(inicioBR: string, fimBR: string): string[] {
  const [di, mi, ai] = inicioBR.split("/").map(Number);
  const [df, mf, af] = fimBR.split("/").map(Number);
  const ini = Date.UTC(ai, mi - 1, di);
  const fim = Date.UTC(af, mf - 1, df);
  const dias: string[] = [];
  for (let t = ini, n = 0; t <= fim && n < 366; t += 86400000, n += 1) {
    const d = new Date(t);
    dias.push(
      String(d.getUTCDate()).padStart(2, "0") +
        "/" +
        String(d.getUTCMonth() + 1).padStart(2, "0") +
        "/" +
        d.getUTCFullYear(),
    );
  }
  return dias;
}

const letra = (i: number) => String.fromCharCode(65 + i);

export type ResultadoLinha = {
  id: string;
  ok: boolean;
  criou: boolean;
  erro?: string;
};

export type ResultadoGravacao = {
  ok: boolean;
  criadas: number;
  atualizadas: number;
  linhas: ResultadoLinha[];
  erro?: string;
};

async function mapaDeRotas(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const linhas = await ler(PAINEL_ID, "ROTAS_BQ!A1:D26000");
    const cab = linhas[0] ?? [];
    const iNome = acharCol(cab, "NOME_ROTA", "NOME DA ROTA", "ROTA");
    const iId = acharCol(cab, "ID_ROTA", "ID DA ROTA", "ID");
    if (iNome < 0 || iId < 0) return mapa;
    for (const l of linhas.slice(1)) {
      const nome = String(l[iNome] ?? "").trim().toUpperCase();
      const id = String(l[iId] ?? "").trim();
      if (nome && id && !mapa.has(nome)) mapa.set(nome, id);
    }
  } catch {
    // Sem o mapa a rota impactada vai como texto puro. Nao vale derrubar a
    // gravacao inteira por causa do link.
  }
  return mapa;
}

export async function gravarAvulsas(
  regs: Registro[],
): Promise<ResultadoGravacao> {
  const vazio: ResultadoGravacao = {
    ok: true,
    criadas: 0,
    atualizadas: 0,
    linhas: [],
  };
  if (!regs.length) return vazio;

  const sheets = getSheetsClient();
  const faixa = "'" + ABA_CONTROLE + "'!A:M";
  const linhas = await ler(PD_ID, faixa);
  const cc = linhas[0] ?? [];
  if (!cc.length) {
    return { ...vazio, ok: false, erro: "A aba " + ABA_CONTROLE + " voltou vazia." };
  }

  const iId = acharCol(cc, "ID");
  if (iId < 0) {
    return { ...vazio, ok: false, erro: "Nao achei a coluna ID na " + ABA_CONTROLE + "." };
  }
  const iPag = acharCol(cc, "PAGAMENTO");
  const iAprov = cc.findIndex((t, i) => i > iPag && normalizar(t) === "pagamento");
  const col = {
    data: acharCol(cc, "DATA"),
    tp: acharCol(cc, "TRANSPORTADORA"),
    motivo: acharCol(cc, "MOTIVO"),
    criador: acharCol(cc, "Criador"),
    link: acharCol(cc, "LINK"),
    cluster: acharCol(cc, "CLUSTER"),
    rota: acharCol(cc, "ROTA IMPACTADA"),
    mlp: acharCol(cc, "MLP IMPACTADO"),
  };

  const precisaMapa = regs.some(
    (r) =>
      String(r.rotaImpactada ?? "").trim() &&
      !String(r.rotaImpactadaId ?? "").trim(),
  );
  const rotas = precisaMapa ? await mapaDeRotas() : new Map<string, string>();

  const dados: { range: string; values: string[][] }[] = [];
  const novas: string[][] = [];
  const saida: ResultadoLinha[] = [];
  let criadas = 0;
  let atualizadas = 0;

  for (const reg of regs) {
    const id = String(reg.id ?? "").trim();
    if (!id) {
      saida.push({ id: "", ok: false, criou: false, erro: "Registro sem ID." });
      continue;
    }

    const valorPor: Record<number, string> = {};
    const por = (i: number, v: string) => {
      if (i >= 0) valorPor[i] = v;
    };
    const url = LINK_BASE + id;
    por(col.data, reg.data);
    por(col.tp, reg.transportadora);

    por(iId, formulaLink(url, id));
    por(col.motivo, reg.motivo);
    por(iPag, reg.pagamento);
    por(col.criador, reg.criador);
    por(col.link, url);
    por(col.cluster, reg.cluster);
    por(iAprov, reg.aprovacao);

    por(col.mlp, "");

    const nomeRota = String(reg.rotaImpactada ?? "").trim();
    const juntos = textoRotaImpactada(nomeRota, reg.mlpImpactado);

    const idRota =
      String(reg.rotaImpactadaId ?? "").trim() ||
      (nomeRota ? (rotas.get(nomeRota.toUpperCase()) ?? "") : "");
    por(col.rota, idRota ? formulaLink(LINK_BASE + idRota, juntos) : juntos);

    const achada = acharLinhaPorId(linhas, iId, id);
    if (achada > 0) {
      const numero = achada + 1;
      for (const [k, v] of Object.entries(valorPor)) {
        dados.push({
          range: "'" + ABA_CONTROLE + "'!" + letra(Number(k)) + numero,
          values: [[v]],
        });
      }
      atualizadas += 1;
      saida.push({ id, ok: true, criou: false });
      continue;
    }

    const nova: string[] = [];
    for (let k = 0; k < cc.length; k += 1) nova.push(valorPor[k] ?? "");
    novas.push(nova);
    criadas += 1;
    saida.push({ id, ok: true, criou: true });
  }

  try {
    if (dados.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: PD_ID,
        requestBody: { valueInputOption: "USER_ENTERED", data: dados },
      });
    }
    if (novas.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: PD_ID,
        range: faixa,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: novas },
      });
    }
  } catch (e) {
    return {
      ok: false,
      criadas: 0,
      atualizadas: 0,
      linhas: saida.map((l) => ({ ...l, ok: false })),
      erro: (e as Error).message,
    };
  }

  return { ok: true, criadas, atualizadas, linhas: saida };
}
