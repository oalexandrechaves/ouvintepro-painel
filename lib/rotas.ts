import { NextResponse } from "next/server";

// RESPOSTA DE ROTA DE LEITURA: SUCESSO E 200, FALHA E 500. NUNCA 200 VAZIO.
// As leituras do serverData lancam quando falham. Antes cada funcao capturava o
// proprio erro e devolvia estrutura vazia com status 200, e o navegador nao
// tinha como distinguir "nao tem" de "nao consegui carregar": a tela Comercial
// chegou a tirar todos os filtros dizendo que o bairro "nao existe no recorte".
// Toda rota de leitura passa por aqui, entao a regra vale sem ninguem lembrar.
// O detalhe do erro fica no log do servidor (o serverData ja registra); o
// navegador recebe so a mensagem generica.
export async function responderJson<T>(
  ler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    return NextResponse.json(await ler());
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível carregar os dados agora." },
      { status: 500 },
    );
  }
}
