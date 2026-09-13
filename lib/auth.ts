import { SignJWT, jwtVerify } from "jose";

// TOKEN DE SESSAO: SO O ID DO USUARIO.
// Nome, perfil, grupo, nivel e status NAO vao no token: sao lidos do banco a cada
// pedido (acesso_sessao). Desativar um usuario ou mudar o grupo dele vale no
// proximo clique, sem esperar o token vencer. Troca e redefinicao de senha
// derrubam os tokens emitidos antes (sessoes_validas_desde contra o "iat").
//
// Este modulo roda no middleware (edge) e no servidor; nao pode importar
// next/headers.

export const SESSION_COOKIE = "ouvintepro_session";
const MAX_AGE = 60 * 60 * 12; // 12 horas

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET nao configurado");
  return new TextEncoder().encode(secret);
}

// "iat" com milissegundos (o JWT aceita fracao de segundo): e o que ordena o
// token contra sessoes_validas_desde. `emitidoEmMs` so e passado na troca de
// senha: vem do banco, 1 ms depois da troca gravada, para o token novo nunca
// parecer anterior a ela.
export async function criarSessao(
  usuarioId: string,
  emitidoEmMs: number = Date.now(),
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(usuarioId)
    .setIssuedAt(emitidoEmMs / 1000)
    .setExpirationTime("12h")
    .sign(getSecret());
}

export interface TokenLido {
  usuarioId: string;
  // Milissegundos desde 1970 (o "iat" do JWT vezes 1000).
  emitidoEmMs: number;
}

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Token do login antigo (que carregava {user}) nao tem `sub` e cai aqui como
// invalido: quem estava logado antes desta versao entra de novo.
export async function lerToken(
  token: string | undefined,
): Promise<TokenLido | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string" || !uuidRe.test(payload.sub)) return null;
    if (typeof payload.iat !== "number") return null;
    return { usuarioId: payload.sub, emitidoEmMs: Math.round(payload.iat * 1000) };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

export const cookieApagado = { ...sessionCookieOptions, maxAge: 0 };
