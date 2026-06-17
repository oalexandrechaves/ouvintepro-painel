import { NextResponse } from "next/server";
import { getPainelExtra } from "@/lib/serverData";

// Protegido pelo middleware (exige sessao). Roda no servidor com service role.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const faixaParam = searchParams.get("faixa");
  const zonaParam = searchParams.get("zona");

  const faixa = faixaParam && faixaParam !== "todas" ? Number(faixaParam) : null;
  const zona = zonaParam && zonaParam !== "todas" ? zonaParam : null;

  const data = await getPainelExtra(
    Number.isFinite(faixa as number) ? faixa : null,
    zona,
  );
  return NextResponse.json(data);
}
