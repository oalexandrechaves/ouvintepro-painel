import { NextResponse } from "next/server";
import { getPainelExtra } from "@/lib/serverData";

// Protegido pelo middleware (exige sessao). Roda no servidor com service role.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leitura completa, sem o corte de 1000 linhas: com o seed de ~50 mil ouvintes
// ela pode passar dos 10 s padrao de funcao da Vercel. 60 s e o teto do plano.
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const faixaParam = searchParams.get("faixa");
  const zonaParam = searchParams.get("zona");
  const deParam = searchParams.get("de");
  const ateParam = searchParams.get("ate");

  const faixa =
    faixaParam && faixaParam !== "todas" ? Number(faixaParam) : null;
  const zona = zonaParam && zonaParam !== "todas" ? zonaParam : null;
  const dataRe = /^\d{4}-\d{2}-\d{2}$/;
  const de = deParam && dataRe.test(deParam) ? deParam : null;
  const ate = ateParam && dataRe.test(ateParam) ? ateParam : null;

  const data = await getPainelExtra(
    Number.isFinite(faixa as number) ? faixa : null,
    zona,
    de,
    ate,
  );
  return NextResponse.json(data);
}
