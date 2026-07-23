import { NextResponse } from "next/server";
import { getPromocaoDetalhe } from "@/lib/serverData";

// Protegido pelo middleware (exige sessao). Roda no servidor com service role.
// Detalhe de uma promocao (participantes, ganhadores, historico de vitorias).
// Sempre por ouvinte_id (UUID); telefone mascarado no serverData.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = (searchParams.get("slug") ?? "").trim();
  if (!slug) {
    return NextResponse.json({ detalhe: null }, { status: 400 });
  }
  const dataRe = /^\d{4}-\d{2}-\d{2}$/;
  const deParam = searchParams.get("de");
  const ateParam = searchParams.get("ate");
  const de = deParam && dataRe.test(deParam) ? deParam : null;
  const ate = ateParam && dataRe.test(ateParam) ? ateParam : null;
  const detalhe = await getPromocaoDetalhe(slug, de, ate);
  return NextResponse.json({ detalhe });
}
