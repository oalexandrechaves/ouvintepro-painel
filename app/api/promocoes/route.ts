import { NextResponse } from "next/server";
import { getPromocoes } from "@/lib/serverData";

// Protegido pelo middleware (exige sessao). Service role no servidor.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leitura completa, sem o corte de 1000 linhas: com o seed de ~50 mil ouvintes
// ela pode passar dos 10 s padrao de funcao da Vercel. 60 s e o teto do plano.
export const maxDuration = 60;

const dataRe = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const deP = searchParams.get("de");
  const ateP = searchParams.get("ate");
  const de = deP && dataRe.test(deP) ? deP : null;
  const ate = ateP && dataRe.test(ateP) ? ateP : null;
  return NextResponse.json(await getPromocoes(de, ate));
}
