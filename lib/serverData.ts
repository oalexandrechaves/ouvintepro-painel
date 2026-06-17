import { createClient } from "@supabase/supabase-js";
import type { SerieItem } from "./mockData";

// Cliente com service role: SO no servidor, nunca exposto ao cliente.
// A lista de ouvintes tem nome (PII) e RLS bloqueia anon, por isso service role.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serviceConfigured = Boolean(url && serviceKey);

function getServiceClient() {
  if (!serviceConfigured) return null;
  return createClient(url!, serviceKey!, { auth: { persistSession: false } });
}

export interface OuvinteRow {
  id: string;
  nome: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  idade: number | null;
  faixa: string | null;
  cadastroEm: string | null;
  participacoes: number;
  ama: string[];
  rejeita: string[];
  radios: string[];
}

export interface PainelExtra {
  configurado: boolean;
  faixas: { id: number; label: string }[];
  musicasAmadas: SerieItem[];
  musicasRejeitadas: SerieItem[];
  artistasAmados: SerieItem[];
  artistasRejeitados: SerieItem[];
  zonas: SerieItem[];
  bairrosPorZona: Record<string, SerieItem[]>;
  bairrosGeral: SerieItem[];
  radios: SerieItem[];
  ouvintes: OuvinteRow[];
}

const vazio: PainelExtra = {
  configurado: false,
  faixas: [],
  musicasAmadas: [],
  musicasRejeitadas: [],
  artistasAmados: [],
  artistasRejeitados: [],
  zonas: [],
  bairrosPorZona: {},
  bairrosGeral: [],
  radios: [],
  ouvintes: [],
};

// Conta ocorrencias por chave e devolve ranking desc.
function ranking(itens: (string | null | undefined)[], limite = 10): SerieItem[] {
  const mapa = new Map<string, number>();
  for (const it of itens) {
    const chave = (it ?? "").trim();
    if (!chave) continue;
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

function chaveMusica(m: {
  artista: string | null;
  titulo: string | null;
  nome: string | null;
}): string {
  if (m.artista && m.titulo) return `${m.artista} - ${m.titulo}`;
  return m.titulo ?? m.artista ?? m.nome ?? "";
}

interface MusicaEmbed {
  sentimento: string | null;
  artista: string | null;
  titulo: string | null;
  nome: string | null;
}
interface RadioEmbed {
  nome_radio: string | null;
  nome_canonico: string | null;
}
interface OuvinteEmbed {
  id: string;
  nome: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  idade: number | null;
  faixa_etaria: number | null;
  primeiro_contato_em: string | null;
  participacoes: number | null;
  musicas: MusicaEmbed[] | null;
  radios_concorrentes: RadioEmbed[] | null;
}

// Busca os dados expandidos (com nome) aplicando filtros de faixa e zona.
// Tudo derivado de uma unica leitura de ouvintes + embeds.
export async function getPainelExtra(
  faixa: number | null,
  zona: string | null,
): Promise<PainelExtra> {
  const sb = getServiceClient();
  if (!sb) return vazio;

  try {
    const { data: faixasRows } = await sb
      .from("faixas_etarias")
      .select("id, label, idade_min")
      .gte("idade_min", 10)
      .order("id");
    const faixas = (faixasRows ?? []).map((f) => ({
      id: f.id as number,
      label: f.label as string,
    }));
    const faixaLabel = new Map(
      faixas.map((f) => [f.id, f.label] as [number, string]),
    );

    let q = sb
      .from("ouvintes")
      .select(
        "id, nome, bairro, zona, cidade, estado, idade, faixa_etaria, primeiro_contato_em, participacoes, musicas(sentimento, artista, titulo, nome), radios_concorrentes(nome_radio, nome_canonico)",
      )
      .order("primeiro_contato_em", { ascending: false })
      .limit(2000);
    if (faixa) q = q.eq("faixa_etaria", faixa);
    if (zona) q = q.eq("zona", zona);

    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as OuvinteEmbed[];

    const amaMus: string[] = [];
    const rejMus: string[] = [];
    const amaArt: string[] = [];
    const rejArt: string[] = [];
    const radiosAll: string[] = [];
    const zonasAll: string[] = [];
    const bairrosAll: string[] = [];
    const bairrosPorZonaMap = new Map<string, string[]>();

    const ouvintes: OuvinteRow[] = rows.map((o) => {
      const ama: string[] = [];
      const rejeita: string[] = [];
      for (const m of o.musicas ?? []) {
        const chave = chaveMusica(m);
        if (m.sentimento === "ama") {
          if (chave) ama.push(chave);
          amaMus.push(chave);
          if (m.artista) amaArt.push(m.artista);
        } else if (m.sentimento === "rejeita") {
          if (chave) rejeita.push(chave);
          rejMus.push(chave);
          if (m.artista) rejArt.push(m.artista);
        }
      }
      const radios = (o.radios_concorrentes ?? []).map(
        (r) => r.nome_canonico ?? r.nome_radio ?? "",
      ).filter(Boolean);
      radiosAll.push(...radios);

      if (o.zona) {
        zonasAll.push(o.zona);
        if (o.bairro) {
          const lista = bairrosPorZonaMap.get(o.zona) ?? [];
          lista.push(o.bairro);
          bairrosPorZonaMap.set(o.zona, lista);
        }
      }
      if (o.bairro) bairrosAll.push(o.bairro);

      return {
        id: o.id,
        nome: o.nome,
        bairro: o.bairro,
        zona: o.zona,
        cidade: o.cidade,
        estado: o.estado,
        idade: o.idade,
        faixa: o.faixa_etaria ? faixaLabel.get(o.faixa_etaria) ?? null : null,
        cadastroEm: o.primeiro_contato_em,
        participacoes: o.participacoes ?? 0,
        ama,
        rejeita,
        radios,
      };
    });

    const bairrosPorZona: Record<string, SerieItem[]> = {};
    Array.from(bairrosPorZonaMap.entries()).forEach(([z, lista]) => {
      bairrosPorZona[z] = ranking(lista);
    });

    return {
      configurado: true,
      faixas,
      musicasAmadas: ranking(amaMus),
      musicasRejeitadas: ranking(rejMus),
      artistasAmados: ranking(amaArt),
      artistasRejeitados: ranking(rejArt),
      zonas: ranking(zonasAll, 6),
      bairrosPorZona,
      bairrosGeral: ranking(bairrosAll),
      radios: ranking(radiosAll),
      ouvintes,
    };
  } catch {
    return vazio;
  }
}
