import { NextResponse } from "next/server";
import { registrarGanhador } from "@/lib/serverData";

// Protegido pelo middleware (exige sessao). Roda no servidor com service role.
// Registra um ganhador confirmado. Sem trava de unicidade: a mesma promocao
// pode ter varios premios (varios ganhadores).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: { ouvinte?: string; promocao?: string; variacao?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ouvinte = (body.ouvinte ?? "").trim();
  const promocao = (body.promocao ?? "").trim();
  if (!uuidRe.test(ouvinte) || !promocao) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const ok = await registrarGanhador({
    ouvinteId: ouvinte,
    promocaoNome: promocao,
    variacaoDigitada: body.variacao ?? null,
  });
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
