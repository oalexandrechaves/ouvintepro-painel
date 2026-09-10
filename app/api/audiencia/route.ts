import { NextRequest, NextResponse } from "next/server";
import { getAudiencia, type AudienciaFiltros } from "@/lib/serverData";

// Rota da tela de Audiencia. Nasce PROTEGIDA sem ninguem fazer nada: o matcher
// do middleware e generico e rotaPublica() e uma lista branca de 4 entradas, e
// esta nao esta la. Por isso o middleware nao precisou ser tocado.
export const dynamic = "force-dynamic";

function texto(v: string | null): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const faixaBruta = Number(p.get("faixa"));
  const filtros: AudienciaFiltros = {
    cidade: texto(p.get("cidade")),
    bairro: texto(p.get("bairro")),
    zona: texto(p.get("zona")),
    faixa: Number.isFinite(faixaBruta) && faixaBruta > 0 ? faixaBruta : null,
    estilo: texto(p.get("estilo")),
    programa: texto(p.get("programa")),
    comPedido: p.get("comPedido") === "1",
    comPromocao: p.get("comPromocao") === "1",
    // Demo LIGADO por padrao: a base real ainda e pequena e a tela existe para
    // demonstrar. Quem desliga ve so cadastro de gente de verdade.
    incluirDemo: p.get("incluirDemo") !== "0",
  };
  return NextResponse.json(await getAudiencia(filtros));
}
