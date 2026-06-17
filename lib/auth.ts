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
