import { lerStatusSessao, type StatusFonte } from "../lib/statusSessao";

const LIMITE_MINUTOS = 70;

const NOME_FONTE: Record<string, string> = {
  atribuicao: "A lista de rotas do dia",
  coleta: "O relatório de coleta",
};

function descrever(s: StatusFonte): string {
  const nome = NOME_FONTE[s.fonte] ?? s.fonte;
  if (s.estado === "erro") {
    return nome + " parou em " + (s.quando ?? "horário desconhecido");
  }
  const horas = Math.floor((s.minutosAtras ?? 0) / 60);
  const atraso =
    horas >= 1 ? "há mais de " + horas + "h" : "há " + s.minutosAtras + " min";
  return nome + " não atualiza " + atraso;
}

export default async function AvisoSessao() {
  const { fontes, tutorial } = await lerStatusSessao();

  const problemas = fontes.filter(
    (s) =>
      s.estado === "erro" ||
      (s.estado === "ok" &&
        s.minutosAtras !== null &&
        s.minutosAtras > LIMITE_MINUTOS),
  );

  if (problemas.length === 0) return null;

  const vencida = problemas.some(
    (p) => p.estado === "erro" && /sess|401|login/i.test(p.mensagem),
  );

  return (
    <div
      role="alert"
      className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"
    >
      <p className="font-semibold">
        {vencida
          ? "Credencial da integração vencida — os dados de hoje pararam de atualizar."
          : "Os dados de hoje podem estar desatualizados."}
      </p>

      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        {problemas.map((p) => (
          <li key={p.fonte}>
            {descrever(p)}
            {!vencida && p.estado === "erro" && p.mensagem
              ? " — " + p.mensagem
              : ""}
          </li>
        ))}
      </ul>

      <p className="mt-2">
        {vencida ? (
          <>
            Renove a credencial da integração na planilha (aba <strong>SEMI AUTO
            ATRIBUIÇÃO</strong>). O painel volta sozinho na próxima rodada da
            atualização, até 15 minutos depois.
          </>
        ) : (
          <>
            Confira se a rotina de atualização da planilha ainda está ativa. Até
            lá, o que está na tela é o último dia que o script conseguiu gravar.
          </>
        )}
      </p>

      {tutorial && /^https?:\/\//.test(tutorial) && (
        <p className="mt-2">
          <a
            href={tutorial}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline hover:text-red-700"
          >
            Passo a passo para renovar a credencial
          </a>
        </p>
      )}
    </div>
  );
}
