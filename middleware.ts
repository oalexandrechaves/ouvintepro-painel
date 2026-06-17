import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessaoValida } from "@/lib/auth";

// Rotas publicas (sem login). O hotlink /r/... PRECISA continuar aberto pros ouvintes.
function rotaPublica(path: string): boolean {
  return (
    path === "/login" ||
    path.startsWith("/api/login") ||
    path.startsWith("/api/logout") ||
    path.startsWith("/r/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (rotaPublica(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await sessaoValida(token)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Roda em tudo, exceto assets estaticos e arquivos com extensao (ex: ouvintepro.PNG).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
