import { NextResponse } from "next/server";
import { AcessoNegado, RegraRecusada } from "@/lib/acesso/modelo";

// RESPOSTA DE ROTA: SUCESSO E 200, FALHA E 500. NUNCA 200 VAZIO.
// As leituras do serverData lancam quando falham. Antes cada funcao capturava o
// proprio erro e devolvia estrutura vazia com status 200, e o navegador nao
// tinha como distinguir "nao tem" de "nao consegui carregar": a tela Comercial
// chegou a tirar todos os filtros dizendo que o bairro "nao existe no recorte".
// Toda rota passa por aqui, entao a regra vale sem ninguem lembrar.
// O detalhe do erro fica no log do servidor (o serverData ja registra); o
// navegador recebe so a mensagem generica.
//
// Duas excecoes, que NAO sao falha e por isso tem status proprio:
//  - AcessoNegado: 401 (sem sessao) ou 403 (sem nivel), com a mensagem;
//  - RegraRecusada: 422, com a mensagem do banco ("Você não pode desativar o
//    próprio usuário."), para a tela mostrar exatamente o motivo.
export async function responderJson<T>(
  ler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    return NextResponse.json(await ler());
  } catch (e) {
    if (e instanceof AcessoNegado) {
      return NextResponse.json({ erro: e.message }, { status: e.status });
    }
    if (e instanceof RegraRecusada) {
      return NextResponse.json({ erro: e.message }, { status: 422 });
    }
    console.error("[rota] falhou:", e);
    return NextResponse.json(
      { erro: "Não foi possível carregar os dados agora." },
      { status: 500 },
    );
  }
}
