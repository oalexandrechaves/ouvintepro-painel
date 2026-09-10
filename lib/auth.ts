import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ouvintepro_session";
const MAX_AGE = 60 * 60 * 12; // 12 horas

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET nao configurado");
  return new TextEncoder().encode(secret);
}

// Confere usuario e senha contra as variaveis de ambiente.
export function credenciaisValidas(user: string, password: string): boolean {
  const u = process.env.PAINEL_USER;
  const p = process.env.PAINEL_PASSWORD;
  return Boolean(u && p && user === u && password === p);
}

export async function criarSessao(user: string): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function sessaoValida(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
};

// Nome do usuario logado, para a area de usuario da barra lateral.
// ADITIVA: nao altera sessaoValida, criarSessao nem credenciaisValidas, que
// continuam sendo o caminho de autenticacao. Recebe o token em vez de ler o
// cookie sozinha porque este modulo tambem roda no middleware (edge), onde
// next/headers nao existe. Quem le o cookie e o layout.
export async function usuarioDaSessao(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const u = payload.user;
    return typeof u === "string" && u.trim() ? u.trim() : null;
  } catch {
    return null;
  }
}
