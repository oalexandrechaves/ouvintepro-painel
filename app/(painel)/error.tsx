"use client";

import { ErroCarregamento } from "@/components/ui";

// Falha ao montar a tela (por exemplo, o banco caiu entre a conferencia do
// middleware e a leitura da sessao no layout). Diz que e falha e oferece tentar
// de novo; nunca mostra tela vazia como se fosse dado.
export default function ErroDaTela({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-lg">
      <ErroCarregamento
        texto="Não foi possível abrir esta tela agora."
        detalhe="Pode ser uma falha momentânea na verificação do seu acesso ou na leitura dos dados."
        onTentar={reset}
      />
    </div>
  );
}
