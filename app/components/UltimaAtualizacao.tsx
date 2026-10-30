"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  LIMITE_ATRASO_MINUTOS,
  type RespostaUltimaAtualizacao,
} from "../lib/ultimaAtualizacao";

export default function UltimaAtualizacao() {
  const caminho = usePathname();
  const [dado, setDado] = useState<{
    caminho: string;
    resposta: RespostaUltimaAtualizacao;
  } | null>(null);

  const semCarimbo = caminho.startsWith("/upgrade") || caminho.startsWith("/capacidade") || caminho.startsWith("/curva");

  useEffect(() => {
    if (semCarimbo) return;
    let vivo = true;
    fetch("/api/ultima-atualizacao?caminho=" + encodeURIComponent(caminho), {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resposta: RespostaUltimaAtualizacao | null) => {
        if (vivo && resposta) setDado({ caminho, resposta });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [caminho, semCarimbo]);

  if (semCarimbo || !dado || dado.caminho !== caminho) return null;
  const { quando, estado, mensagem, minutosAtras } = dado.resposta;

  if (estado === "ausente" || !quando) {
    return (
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-slate-400">
        Sem carimbo de atualização na planilha
      </span>
    );
  }

  const atrasado =
    estado === "erro" ||
    (minutosAtras !== null && minutosAtras > LIMITE_ATRASO_MINUTOS);

  return (
    <span
      title={(estado === "erro" ? "Falhou em " : "Última atualização ") + quando + (mensagem ? " · " + mensagem : "")}
      className={
        "ml-auto shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs " +
        (atrasado ? "bg-red-50 font-medium text-red-700" : "text-slate-500")
      }
    >

      {estado === "erro" ? "Falhou " : "Atualizado "}
      <strong className="font-semibold">{quando.slice(0, 5) + " " + quando.slice(11, 16)}</strong>
    </span>
  );
}
