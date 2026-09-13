import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, cookieApagado, lerToken } from "@/lib/auth";
import { lerSessaoDoBanco, sessaoVigente, type DadosSessao } from "@/lib/acesso/banco";
import { permite } from "@/lib/acesso/modelo";
import { regraDaRota } from "@/lib/acesso/rotas";

// PRIMEIRA CAMADA DE ACESSO. Todo pedido passa por aqui, nesta ordem:
//  1. rota publica (login, logout, hotlink /r/...) segue;
//  2. sem token valido: tela vai para o login, /api responde 401;
//  3. le o usuario NO BANCO (acesso_sessao). Inexistente, inativo ou token
//     anterior a ultima troca de senha: apaga o cookie e trata como 2;
//  4. rota fora do mapa (lib/acesso/rotas.ts): 404. Negacao por padrao;
//  5. senha temporaria ainda nao trocada: so /trocar-senha abre;
//  6. nivel do grupo abaixo do exigido: tela vai para /sem-acesso, /api 403.
//
// FALHA NAO VIRA DECISAO. Se o banco nao responde, a resposta e 503 "nao foi
// possivel verificar seu acesso", nunca "sem acesso" nem login: quem tem acesso
// nao pode ser mandado embora por uma queda, e quem nao tem nao pode passar.
//
// Roda no edge (Next 14 nao roda middleware em Node): a leitura do banco e um
// fetch para a funcao acesso_sessao, com service role, como no servidor.

function ehApi(caminho: string): boolean {
  return caminho === "/api" || caminho.startsWith("/api/");
}

function paraLogin(req: NextRequest, apagarCookie: boolean): NextResponse {
  const res = ehApi(req.nextUrl.pathname)
    ? NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 })
    : NextResponse.redirect(new URL("/login", req.url));
  if (apagarCookie) res.cookies.set(SESSION_COOKIE, "", cookieApagado);
  return res;
}

function falhaDeVerificacao(req: NextRequest): NextResponse {
  const texto = "Não foi possível verificar seu acesso agora. Tente de novo em instantes.";
  if (ehApi(req.nextUrl.pathname)) {
    return NextResponse.json({ erro: texto }, { status: 503 });
  }
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AtendentePRO</title><body style="font-family:system-ui,sans-serif;background:#F6F6F8;color:#16181D;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px"><div style="max-width:420px;background:#fff;border:1px solid #E9E9EE;border-radius:16px;padding:28px"><p style="margin:0 0 16px;font-size:15px">${texto}</p><a href="" style="color:#D81B60;font-size:14px">Tentar de novo</a></div></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "retry-after": "5" } },
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const regra = regraDaRota(pathname, req.method);

  if (regra?.tipo === "publica") return NextResponse.next();

  const token = await lerToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!token) return paraLogin(req, Boolean(req.cookies.get(SESSION_COOKIE)));

  let dados: DadosSessao | null;
  try {
    dados = await lerSessaoDoBanco(token.usuarioId);
  } catch (e) {
    console.error("[middleware] acesso_sessao falhou:", e);
    return falhaDeVerificacao(req);
  }
  if (!sessaoVigente(dados, token.emitidoEmMs)) return paraLogin(req, true);

  if (!regra) {
    return ehApi(pathname)
      ? NextResponse.json({ erro: "Rota não encontrada." }, { status: 404 })
      : new NextResponse("Página não encontrada.", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  }

  const liberadaNaTroca = regra.tipo === "sessao" && regra.trocaPendente === true;
  if (dados.deveTrocarSenha && !liberadaNaTroca) {
    return ehApi(pathname)
      ? NextResponse.json(
          { erro: "Troque a senha temporária antes de continuar." },
          { status: 403 },
        )
      : NextResponse.redirect(new URL("/trocar-senha", req.url));
  }

  if (regra.tipo === "modulo" && !permite(dados.permissoes, regra.modulo, regra.nivel)) {
    if (ehApi(pathname)) {
      return NextResponse.json(
        { erro: "Seu grupo de acesso não permite esta ação." },
        { status: 403 },
      );
    }
    const destino = new URL("/sem-acesso", req.url);
    destino.searchParams.set("modulo", regra.modulo);
    return NextResponse.redirect(destino);
  }

  return NextResponse.next();
}

export const config = {
  // Fora do middleware so os arquivos estaticos do Next e as imagens de /public.
  // Antes a exclusao era "qualquer caminho com ponto", o que deixaria uma rota
  // futura como /api/exportar.csv sem conferencia nenhuma.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico$|.*\\.(?:png|PNG|svg|jpg|jpeg|webp|ico)$).*)",
  ],
};
