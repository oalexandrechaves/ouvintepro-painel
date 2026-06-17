import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  credenciaisValidas,
  criarSessao,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let user = "";
  let password = "";
  try {
    const body = await req.json();
    user = typeof body.user === "string" ? body.user : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ erro: "Requisicao invalida" }, { status: 400 });
  }

  if (!credenciaisValidas(user, password)) {
    return NextResponse.json(
      { erro: "Usuario ou senha incorretos" },
      { status: 401 },
    );
  }

  const token = await criarSessao(user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
