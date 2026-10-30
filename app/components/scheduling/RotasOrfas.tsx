import type { Achado, Veredito } from "../../lib/ponte";
import { resumir } from "../../lib/ponte";
import { classeHub, estiloHub } from "../atribuicao/coresHub";
import { Tile } from "../ui/filtros";

const ESTILO: Record<
  Veredito,
  { rotulo: string; borda: string; texto: string; fundo: string }
> = {
  certa: {
    rotulo: "Responsável identificado",
    borda: "border-l-[#ae132d]",
    texto: "text-[#ae132d]",
    fundo: "bg-[#ae132d]",
  },
  ambigua: {
    rotulo: "Mais de um candidato",
    borda: "border-l-[#ca7916]",
    texto: "text-[#ca7916]",
    fundo: "bg-[#ca7916]",
  },
  semPedido: {
    rotulo: "Sem pedido por trás",
    borda: "border-l-[#495f6e]",
    texto: "text-[#495f6e]",
    fundo: "bg-[#495f6e]",
  },
};

export default function RotasOrfas({ achados }: { achados: Achado[] }) {
  const r = resumir(achados);

  if (achados.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Rotas sem transportadora
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Nenhuma rota do dia ficou sem transportadora. Nada a cobrar.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Rotas sem transportadora
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Cruzamento por cluster, HUB e perfil com quem recusou ou não respondeu no
          mesmo pedido.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          titulo="Rotas órfãs"
          valor={r.rotasOrfas}
          cor="border-l-blue-600"
          corTexto="text-blue-700"
          ativo={false}
          detalhe={r.baldes + " combinação(ões)"}
        />
        <Tile
          titulo="Com responsável"
          valor={r.comResponsavel}
          cor={ESTILO.certa.borda}
          corTexto={ESTILO.certa.texto}
          ativo={false}
          detalhe="dá pra cobrar"
        />
        <Tile
          titulo="Ambíguo"
          valor={r.ambiguos}
          cor={ESTILO.ambigua.borda}
          corTexto={ESTILO.ambigua.texto}
          ativo={false}
          detalhe="mais de um candidato"
        />
        <Tile
          titulo="Sem pedido"
          valor={r.semPedido}
          cor={ESTILO.semPedido.borda}
          corTexto={ESTILO.semPedido.texto}
          ativo={false}
          detalhe="outra causa"
        />
      </div>

      <ul className="space-y-3">
        {achados.map((a) => {
          const e = ESTILO[a.veredito];
          return (
            <li
              key={a.cluster + a.hub + a.perfil}
              className={`rounded-lg border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${e.borda}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${classeHub(a.hub)}`}
                  style={estiloHub(a.hub)}
                  aria-hidden
                />
                <span className="font-semibold text-slate-900">
                  {a.cluster}_{a.hub}
                </span>
                <span className="text-sm text-slate-600">{a.perfil}</span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium text-white ${e.fundo}`}
                >
                  {e.rotulo}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="text-slate-500">
                  {a.rotasOrfas.length === 1 ? "Rota:" : `${a.rotasOrfas.length} rotas:`}
                </span>
                <span className="font-medium text-slate-800">
                  {a.rotasOrfas.join(", ")}
                </span>
              </div>

              {a.veredito === "certa" && (
                <p className="mt-2 text-sm text-slate-700">
                  Cobrar de{" "}
                  <strong className={e.texto}>{a.responsavel}</strong> —{" "}
                  {descreverCulpa(a.culpados[0])} no mesmo cluster, HUB e perfil.
                </p>
              )}

              {a.veredito === "ambigua" && (
                <div className="mt-2 text-sm text-slate-700">
                  <p>
                    Não dá pra apontar uma só: o dado não diz qual recusa virou qual
                    rota. Candidatas:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    {a.culpados.map((c) => (
                      <li key={c.transportadora}>
                        <span className="font-medium text-slate-800">
                          {c.transportadora}
                        </span>{" "}
                        — {descreverCulpa(c)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {a.veredito === "semPedido" && (
                <p className="mt-2 text-sm text-slate-700">
                  Ninguém recusou nem deixou sem resposta nesse cluster, HUB e perfil.
                  A rota ficou órfã por outro motivo — vale olhar na mão.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function descreverCulpa(c: { recusas: number; semResposta: number }) {
  const partes: string[] = [];
  if (c.recusas > 0) {
    partes.push(c.recusas === 1 ? "1 recusa" : `${c.recusas} recusas`);
  }
  if (c.semResposta > 0) {
    partes.push(
      c.semResposta === 1 ? "1 sem resposta" : `${c.semResposta} sem resposta`,
    );
  }
  return partes.join(" e ");
}
