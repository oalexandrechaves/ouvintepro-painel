import { NextResponse } from "next/server";
import { responderJson } from "@/lib/rotas";
import { exigirAcesso } from "@/lib/acesso/servidor";
import { listarGrupos, salvarGrupo } from "@/lib/acesso/gestao";

// Grupos de acesso. GET: Visualizacao no Painel de Controle. POST (criar ou
// editar, com os seis niveis de uma vez): Full.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return responderJson(async () => ({
    grupos: await listarGrupos(await exigirAcesso("painel_de_controle", "visualizacao")),
  }));
}

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
    salvarGrupo(await exigirAcesso("painel_de_controle", "full"), corpo),
  );
}
