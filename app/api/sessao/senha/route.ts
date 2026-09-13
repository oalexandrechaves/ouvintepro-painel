import { NextResponse } from "next/server";
import { SESSION_COOKIE, criarSessao, sessionCookieOptions } from "@/lib/auth";
import { clienteServico, erroDoBanco, lerSessaoDoBanco } from "@/lib/acesso/banco";
import { primeiraTela } from "@/lib/acesso/destino";
import { exigirSessao } from "@/lib/acesso/servidor";
import { responderJson } from "@/lib/rotas";

// TROCA DA PROPRIA SENHA: obrigatoria depois de senha temporaria, ou por vontade.
// A funcao do banco derruba as sessoes emitidas antes; esta rota emite uma nova
// para quem acabou de trocar, e as outras abas e aparelhos pedem login de novo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let atual = "";
  let nova = "";
  try {
    const body = await req.json();
    atual = typeof body.atual === "string" ? body.atual : "";
    nova = typeof body.nova === "string" ? body.nova : "";
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }

  let token = "";
  const res = await responderJson(async () => {
    const sessao = await exigirSessao();
    const { data, error } = await clienteServico().rpc("acesso_trocar_senha", {
      p_usuario_id: sessao.id,
      p_senha_atual: atual,
      p_senha_nova: nova,
    });
    if (error) throw erroDoBanco("acesso_trocar_senha", error);
    // O token novo leva como "iat" o sessoes_validas_desde que a funcao acabou de
    // gravar: igual, entao vale, e as sessoes anteriores (menores) caem.
    if (typeof data !== "number") {
      throw new Error("acesso_trocar_senha: resposta sem validas_desde.");
    }
    token = await criarSessao(sessao.id, data);
    const dados = await lerSessaoDoBanco(sessao.id);
    return { ok: true, destino: dados ? primeiraTela(dados.permissoes) : "/sem-acesso" };
  });
  if (token && res.status === 200) {
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }
  return res;
}
