import { NextResponse } from "next/server";
import { responderJson } from "@/lib/rotas";
import { exigirAcesso } from "@/lib/acesso/servidor";
import { atualizarUsuario, criarUsuario, listarUsuarios } from "@/lib/acesso/gestao";

// Usuarios do painel. GET: Visualizacao no Painel de Controle. POST (criar) e
// PATCH (editar): Full. Middleware e sessao conferida; o banco confere de novo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function corpo(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const invalida = () =>
  NextResponse.json({ erro: "Requisição inválida." }, { status: 400 });

export async function GET() {
  return responderJson(async () => ({
    usuarios: await listarUsuarios(await exigirAcesso("painel_de_controle", "visualizacao")),
  }));
}

export async function POST(req: Request) {
  const b = await corpo(req);
  if (!b) return invalida();
  return responderJson(async () =>
    criarUsuario(await exigirAcesso("painel_de_controle", "full"), b),
  );
}

export async function PATCH(req: Request) {
  const b = await corpo(req);
  if (!b) return invalida();
  return responderJson(async () =>
    atualizarUsuario(await exigirAcesso("painel_de_controle", "full"), b),
  );
}
