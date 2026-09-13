import { NextResponse } from "next/server";
import { responderJson } from "@/lib/rotas";
import { exigirAcesso } from "@/lib/acesso/servidor";
import { redefinirSenha } from "@/lib/acesso/gestao";

// Redefinir senha de OUTRO usuario: Full no Painel de Controle. A senha nova e
// temporaria; o usuario troca no proximo acesso e as sessoes dele caem.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let b: Record<string, unknown> | null = null;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    b = null;
  }
  if (!b || typeof b !== "object") {
    return NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });
  }
  const corpo = b;
  return responderJson(async () =>
    redefinirSenha(await exigirAcesso("painel_de_controle", "full"), corpo),
  );
}
