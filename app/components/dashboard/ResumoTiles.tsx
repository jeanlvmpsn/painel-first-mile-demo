"use client";

type Status = "todas" | "concluida" | "pendente" | "ns" | "avulsas" | "ded";

type Props = {
  total: number;
  concluidas: number;
  pendentes: number;
  ns: number;
  ded: number;
  dedConcluidas: number;
  percentual: number;
  percentualPendentes: number;
  statusSelecionado: Status;
  setStatusSelecionado: (s: Status) => void;
  avulsas: number;

  avulsasFeitas: number;
  avulsasTotal: number;
};

export default function ResumoTiles({
  total,
  concluidas,
  pendentes,
  ns,
  ded,
  dedConcluidas,
  percentual,
  percentualPendentes,
  statusSelecionado,
  setStatusSelecionado,
  avulsas,
  avulsasFeitas,
  avulsasTotal,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
      <div
        onClick={() => setStatusSelecionado("todas")}
        className={`bg-white px-5 py-6 rounded-lg shadow-sm border border-l-4 border-l-blue-500 cursor-pointer transition hover:shadow-md ${
          statusSelecionado === "todas" ? "ring-2 ring-blue-400" : ""
        }`}
      >
        <h3 className="whitespace-nowrap text-gray-500 text-sm font-medium">Rotas no filtro</h3>
        <p className="text-3xl font-bold text-blue-600">{total}</p>
      </div>
      <div
        onClick={() =>
          setStatusSelecionado(statusSelecionado === "concluida" ? "todas" : "concluida")
        }
        className={`bg-white px-5 py-6 rounded-lg shadow-sm border border-l-4 border-l-green-500 cursor-pointer transition hover:shadow-md ${
          statusSelecionado === "concluida" ? "ring-2 ring-green-400" : ""
        }`}
      >
        <h3 className="whitespace-nowrap text-gray-500 text-sm font-medium">Concluídas</h3>
        <p className="text-3xl font-bold text-green-600">
          {concluidas}{" "}
          <span className="text-base font-normal text-gray-400">
            ({percentual}%)
          </span>
        </p>
      </div>
      <div
        onClick={() =>
          setStatusSelecionado(statusSelecionado === "pendente" ? "todas" : "pendente")
        }
        className={`bg-white px-5 py-6 rounded-lg shadow-sm border border-l-4 border-l-orange-500 cursor-pointer transition hover:shadow-md ${
          statusSelecionado === "pendente" ? "ring-2 ring-orange-400" : ""
        }`}
      >
        <h3 className="whitespace-nowrap text-gray-500 text-sm font-medium">Pendentes</h3>
        <p className="text-3xl font-bold text-orange-600">
          {pendentes}{" "}
          <span className="text-base font-normal text-gray-400">
            ({percentualPendentes}%)
          </span>
        </p>
      </div>
      <div
        onClick={() => setStatusSelecionado(statusSelecionado === "ded" ? "todas" : "ded")}
        className={`bg-white px-5 py-6 rounded-lg shadow-sm border border-l-4 border-l-violet-500 cursor-pointer transition hover:shadow-md ${
          statusSelecionado === "ded" ? "ring-2 ring-violet-400" : ""
        }`}
        title="Rotas dedicadas (DED no nome). Clique para ver só elas na tabela."
      >
        <h3 className="whitespace-nowrap text-gray-500 text-sm font-medium">DED</h3>
        <p className="text-3xl font-bold text-violet-600">
          {dedConcluidas}
          <span className="text-xl font-semibold text-gray-400">/{ded}</span>
        </p>
        <p className="text-xs text-gray-400">concluídas / total</p>
      </div>
      <div
        onClick={() =>
            setStatusSelecionado(
              statusSelecionado === "avulsas" ? "todas" : "avulsas",
            )
          }
        className={`bg-white px-5 py-6 rounded-lg shadow-sm border border-l-4 border-l-amber-400 cursor-pointer transition hover:shadow-md ${
            statusSelecionado === "avulsas" ? "ring-2 ring-amber-400" : ""
          }`}
        title={
          "Avulsas do dia que responderam o Forms / avulsas do dia. A avulsa responde sem nome de rota, só com o ID e a placa; não entra no total de rotas. Clique para ver as respostas e as fotos" +
          (avulsasTotal > 0 ? " (" + avulsas + (avulsas === 1 ? " resposta" : " respostas") + ")." : ".")
        }
      >
        <h3 className="whitespace-nowrap text-gray-500 text-sm font-medium">Avulsas (fotos)</h3>
        {avulsasTotal > 0 ? (
          <p className="text-3xl font-bold text-amber-600">
            {avulsasFeitas}
            <span className="text-xl font-semibold text-gray-400">/{avulsasTotal}</span>
          </p>
        ) : (
          <p className="text-3xl font-bold text-amber-600">{avulsas}</p>
        )}
        <p className="text-xs text-gray-400">{avulsasTotal > 0 ? "com Forms / do dia" : "fora do total"}</p>
      </div>
      <div
        onClick={() =>
          setStatusSelecionado(statusSelecionado === "ns" ? "todas" : "ns")
        }
        className={`bg-white px-5 py-6 rounded-lg shadow-sm border border-l-4 border-l-gray-400 cursor-pointer transition hover:shadow-md ${
          statusSelecionado === "ns" ? "ring-2 ring-gray-400" : ""
        }`}
        title="Rotas não executadas: declinadas, canceladas ou sem nenhuma coleta até as 21h. Não precisam preencher o Forms, por isso ficam fora do percentual."
      >
        <h3 className="whitespace-nowrap text-gray-500 text-sm font-medium">NS (Não executada)</h3>
        <p className="text-3xl font-bold text-gray-600">{ns}</p>
      </div>
    </div>
  );
}
