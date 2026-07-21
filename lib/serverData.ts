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
  faixaEtaria: SerieItem[];
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
  faixaEtaria: [],
  bairrosPorZona: {},
  bairrosGeral: [],
  radios: [],
  ouvintes: [],
};

// Conta ocorrencias agrupando por chave canonica (minusculo, sem acento),
// exibindo o primeiro rotulo visto. Devolve ranking desc.
function ranking(itens: (string | null | undefined)[], limite = 10): SerieItem[] {
  const mapa = new Map<string, { label: string; valor: number }>();
  for (const it of itens) {
    const raw = (it ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase().normalize("NFD").replace(
      /[\u0300-\u036f]/g,
      "",
    );
    const cur = mapa.get(key);
    if (cur) cur.valor += 1;
    else mapa.set(key, { label: raw, valor: 1 });
  }
  return Array.from(mapa.values())
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
  de: string | null = null,
  ate: string | null = null,
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
    // Filtro por data de cadastro: as datas escolhidas sao dias de Brasilia
    // (UTC-03:00 fixo, sem horario de verao). Converte pra UTC antes de consultar.
    if (de) q = q.gte("primeiro_contato_em", `${de}T03:00:00.000Z`);
    if (ate) {
      const fim = new Date(`${ate}T03:00:00.000Z`);
      fim.setUTCDate(fim.getUTCDate() + 1); // ate < dia seguinte (03:00Z)
      q = q.lt("primeiro_contato_em", fim.toISOString());
    }

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
    const faixaCount = new Map<number, number>();

    const ouvintes: OuvinteRow[] = rows.map((o) => {
      const ama: string[] = [];
      const rejeita: string[] = [];
      for (const m of o.musicas ?? []) {
        // Dois votos independentes: voto de MUSICA so quando ha titulo; voto de CANTOR quando
        // ha artista. Assim um pedido de "so cantor" nao polui o ranking de musicas.
        const temTitulo = !!m.titulo;
        const chave = chaveMusica(m);
        if (m.sentimento === "ama") {
          if (temTitulo) {
            ama.push(chave);
            amaMus.push(chave);
          }
          if (m.artista) amaArt.push(m.artista);
        } else if (m.sentimento === "rejeita") {
          if (temTitulo) {
            rejeita.push(chave);
            rejMus.push(chave);
          }
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
      if (o.faixa_etaria != null) {
        faixaCount.set(o.faixa_etaria, (faixaCount.get(o.faixa_etaria) ?? 0) + 1);
      }

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
      faixaEtaria: faixas
        .filter((f) => faixaCount.has(f.id))
        .map((f) => ({ label: f.label, valor: faixaCount.get(f.id) ?? 0 })),
      bairrosPorZona,
      bairrosGeral: ranking(bairrosAll),
      radios: ranking(radiosAll),
      ouvintes,
    };
  } catch {
    return vazio;
  }
}
