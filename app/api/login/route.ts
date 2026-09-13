import { NextResponse } from "next/server";
import { SESSION_COOKIE, criarSessao, sessionCookieOptions } from "@/lib/auth";
import { clienteServico, lerSessaoDoBanco } from "@/lib/acesso/banco";
import { primeiraTela } from "@/lib/acesso/destino";

// LOGIN POR USUARIO DO BANCO. Nao existe mais login por variavel de ambiente, nem
// como reserva: se o banco nao responde, ninguem entra e a tela diz que foi falha.
// A senha vai para acesso_autenticar e e conferida la dentro (bcrypt do
// pgcrypto); o hash nunca vem para ca.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENSAGEM: Record<string, { texto: string; status: number }> = {
  invalido: { texto: "E-mail ou senha incorretos.", status: 401 },
  inativo: {
    texto: "Seu usuário está inativo. Fale com o administrador do painel.",
    status: 403,
  },
  bloqueado: {
    texto: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo.",
    status: 429,
  },
};

export async function POST(req: Request) {
  let email = "";
  let senha = "";
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email : "";
    senha = typeof body.senha === "string" ? body.senha : "";
  } catch {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  if (!email.trim() || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha." }, { status: 400 });
  }

  try {
    const { data, error } = await clienteServico().rpc("acesso_autenticar", {
      p_email: email,
      p_senha: senha,
    });
    if (error) throw new Error(`acesso_autenticar: ${error.message}`);
    const r = data as { resultado?: string; usuario_id?: string; deve_trocar_senha?: boolean };

    if (r?.resultado !== "ok" || typeof r.usuario_id !== "string") {
      const m = MENSAGEM[r?.resultado ?? ""];
      if (!m) throw new Error(`acesso_autenticar: resultado inesperado ${JSON.stringify(r)}`);
      return NextResponse.json({ erro: m.texto }, { status: m.status });
    }

    const token = await criarSessao(r.usuario_id);
    let destino = "/trocar-senha";
    if (!r.deve_trocar_senha) {
      const dados = await lerSessaoDoBanco(r.usuario_id);
      destino = dados ? primeiraTela(dados.permissoes) : "/sem-acesso";
    }
    const res = NextResponse.json({ ok: true, destino });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    console.error("[login] falhou:", e);
    return NextResponse.json(
      { erro: "Não foi possível entrar agora. Tente de novo em instantes." },
      { status: 503 },
    );
  }
}
