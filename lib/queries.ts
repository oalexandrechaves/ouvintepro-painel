import { supabase } from "./supabase";
import {
  cadastrosPorPeriodo as mockCadastros,
  faixaEtaria as mockFaixa,
  hotlink as mockHotlink,
  kpis as mockKpis,
  musicas as mockMusicas,
  zonas as mockZonas,
} from "./mockData";
import type { Kpi, Periodo, PontoArea, SerieItem } from "./mockData";

export interface PainelData {
  kpis: Kpi[];
  cadastrosPorPeriodo: Record<Periodo, PontoArea[]>;
  zonas: SerieItem[];
  faixaEtaria: SerieItem[];
  musicas: SerieItem[];
  hotlink: { acessos: number; conversoes: number; taxa: number };
  fonte: "supabase" | "mock";
}

const mockData: PainelData = {
  kpis: mockKpis,
  cadastrosPorPeriodo: mockCadastros,
  zonas: mockZonas,
  faixaEtaria: mockFaixa,
  musicas: mockMusicas,
  hotlink: mockHotlink,
  fonte: "mock",
};

const periodos: Periodo[] = ["hoje", "30dias", "ano"];

export async function getPainelData(): Promise<PainelData> {
  // Sem Supabase configurado: fallback de desenvolvimento.
  if (!supabase) return mockData;
  const sb = supabase;

  try {
    const [
      kpiRes,
      zonasRes,
      faixaRes,
      musicasRes,
      hotlinkRes,
      ...series
    ] = await Promise.all([
      sb.rpc("painel_kpis", { p_periodo: "ano" }),
      sb.from("painel_zonas").select("label, valor"),
      sb.from("painel_faixa_etaria").select("label, valor"),
      sb.from("painel_musicas_amadas").select("label, valor"),
      sb.from("painel_hotlink").select("acessos, conversoes, taxa").single(),
      ...periodos.map((p) =>
        sb.rpc("painel_cadastros_serie", { p_periodo: p }),
      ),
    ]);

    const k = Array.isArray(kpiRes.data) ? kpiRes.data[0] : kpiRes.data;
    const h = hotlinkRes.data as
      | { acessos: number; conversoes: number; taxa: number }
      | null;

    const cadastros = {} as Record<Periodo, PontoArea[]>;
    periodos.forEach((p, i) => {
      const rows = (series[i]?.data ?? []) as { rotulo: string; cadastros: number }[];
      cadastros[p] = rows.map((r) => ({ rotulo: r.rotulo, cadastros: r.cadastros }));
    });

    const kpis: Kpi[] = [
      { label: "Ouvintes cadastrados", valor: k?.ouvintes_total ?? 0, delta: "atualizado", cor: "neon-pink" },
      { label: "Novos no período", valor: k?.novos_periodo ?? 0, delta: "neste ano", cor: "neon-violet" },
      { label: "Conversas hoje", valor: k?.conversas_hoje ?? 0, delta: "tempo real", cor: "neon-cyan" },
      { label: "Cliques no hotlink", valor: k?.hotlink_acessos ?? 0, delta: "acessos", detalhe: "atribuição comercial", cor: "neon-gold" },
    ];

    return {
      kpis,
      cadastrosPorPeriodo: cadastros,
      zonas: (zonasRes.data ?? []) as SerieItem[],
      faixaEtaria: (faixaRes.data ?? []) as SerieItem[],
      musicas: (musicasRes.data ?? []) as SerieItem[],
      hotlink: {
        acessos: h?.acessos ?? 0,
        conversoes: h?.conversoes ?? 0,
        taxa: Number(h?.taxa ?? 0),
      },
      fonte: "supabase",
    };
  } catch {
    // Em caso de erro de rede/consulta, nao quebra o painel.
    return mockData;
  }
}
