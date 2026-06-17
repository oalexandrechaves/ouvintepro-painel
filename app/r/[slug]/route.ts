import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!supabase) {
    return NextResponse.json({ erro: "Supabase nao configurado" }, { status: 500 });
  }

  const userAgent = req.headers.get("user-agent");
  const { data, error } = await supabase.rpc("registrar_clique", {
    p_slug: params.slug,
    p_user_agent: userAgent,
  });

  if (error || !data) {
    return NextResponse.json({ erro: "Hotlink nao encontrado" }, { status: 404 });
  }

  return NextResponse.redirect(data, 302);
}
