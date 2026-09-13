import { NextResponse } from "next/server";
import { getConversa } from "@/lib/serverData";
import { responderJson } from "@/lib/rotas";
import { exigirAcesso } from "@/lib/acesso/servidor";

// Exige Visualizacao em Ouvintes (middleware e sessao conferida). Roda no servidor com service role.
// Busca as mensagens SEMPRE por ouvinte_id (UUID interno), nunca por telefone.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ouvinte = searchParams.get("ouvinte");
  if (!ouvinte || !uuidRe.test(ouvinte)) {
    return NextResponse.json({ mensagens: [] }, { status: 400 });
  }
  return responderJson(async () => ({
    mensagens: await getConversa(
      await exigirAcesso("ouvintes", "visualizacao"),
      ouvinte,
    ),
  }));
}
