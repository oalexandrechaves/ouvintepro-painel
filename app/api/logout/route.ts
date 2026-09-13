import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieApagado } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", cookieApagado);
  return res;
}
