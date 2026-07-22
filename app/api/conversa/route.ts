import { NextResponse } from "next/server";
import { getConversa } from "@/lib/serverData";

// Protegido pelo middleware (exige sessao). Roda no servidor com service role.
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
  const mensagens = await getConversa(ouvinte);
  return NextResponse.json({ mensagens });
}
