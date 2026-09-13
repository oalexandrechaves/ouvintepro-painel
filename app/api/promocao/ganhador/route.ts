import { NextResponse } from "next/server";
import { registrarGanhador } from "@/lib/serverData";
import { exigirAcesso } from "@/lib/acesso/servidor";
import { AcessoNegado } from "@/lib/acesso/modelo";

// Exige EDICAO em Promocoes: grava. Middleware e sessao conferida.
// Registra um ganhador confirmado. Sem trava de unicidade: a mesma promocao
// pode ter varios premios (varios ganhadores).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let sessao;
  try {
    sessao = await exigirAcesso("promocoes", "edicao");
  } catch (e) {
    if (e instanceof AcessoNegado) {
      return NextResponse.json({ ok: false, erro: e.message }, { status: e.status });
    }
    return NextResponse.json({ ok: false }, { status: 500 });
  }

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
  const ok = await registrarGanhador(sessao, {
    ouvinteId: ouvinte,
    promocaoNome: promocao,
    variacaoDigitada: body.variacao ?? null,
  });
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
