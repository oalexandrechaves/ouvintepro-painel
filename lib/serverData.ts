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

export interface PromocaoRow {
  label: string;
  participantes: number;
  participacoes: number;
}

export interface OuvinteRow {
  id: string;
  nome: string | null;
  telefoneMasc: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  idade: number | null;
  dataNascimento: string | null;
  faixa: string | null;
  estiloMusical: string | null;
  cadastroEm: string | null;
  participacoes: number;
  ama: string[];
  rejeita: string[];
  radios: string[];
  promocoes: string[];
  temConversa: boolean;
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
  promocoes: PromocaoRow[];
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
  promocoes: [],
  ouvintes: [],
};

// Mascara o telefone mantendo DDD/pais e os ultimos 4 digitos (ex: 5511*****7060).
function mascararTelefone(tel: string | null | undefined): string | null {
  const t = (tel ?? "").replace(/\D/g, "");
  if (!t) return null;
  if (t.length <= 8) return t.slice(0, 2) + "*".repeat(Math.max(0, t.length - 6)) + t.slice(-4);
  const inicio = t.slice(0, 4);
  const fim = t.slice(-4);
  return `${inicio}${"*".repeat(t.length - 8)}${fim}`;
}

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
  telefone: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  idade: number | null;
  data_nascimento: string | null;
  estilo_musical: string | null;
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
        "id, nome, telefone, bairro, zona, cidade, estado, idade, data_nascimento, estilo_musical, faixa_etaria, primeiro_contato_em, participacoes, musicas(sentimento, artista, titulo, nome), radios_concorrentes(nome_radio, nome_canonico)",
      )
      .order("primeiro_contato_em", { ascending: false })
      .limit(2000);
    if (faixa) q = q.eq("faixa_etaria", faixa);
    if (zona) q = q.eq("zona", zona);
    // Filtro por data de cadastro: as datas escolhidas sao dias de Brasilia
    // (UTC-03:00 fixo, sem horario de verao). Converte pra UTC antes de consultar.
    const deUtc = de ? `${de}T03:00:00.000Z` : null;
    let ateUtc: string | null = null;
    if (ate) {
      const fim = new Date(`${ate}T03:00:00.000Z`);
      fim.setUTCDate(fim.getUTCDate() + 1); // ate < dia seguinte (03:00Z)
      ateUtc = fim.toISOString();
    }
    if (deUtc) q = q.gte("primeiro_contato_em", deUtc);
    if (ateUtc) q = q.lt("primeiro_contato_em", ateUtc);

    // Promocoes: mesma janela de periodo (por criado_em). Agrega participantes distintos.
    let qPromo = sb
      .from("promocao_participacoes")
      .select("promocao_nome, ouvinte_id")
      .limit(20000);
    if (deUtc) qPromo = qPromo.gte("criado_em", deUtc);
    if (ateUtc) qPromo = qPromo.lt("criado_em", ateUtc);

    const [{ data, error }, promoRes, msgRes] = await Promise.all([
      q,
      qPromo,
      // So para saber QUAIS ouvintes tem conversa (nao traz o conteudo aqui).
      sb.from("mensagens").select("conversa_id, conversas(ouvinte_id)").limit(50000),
    ]);
    if (error) throw error;
    const rows = (data ?? []) as unknown as OuvinteEmbed[];

    // Ouvintes que tem ao menos uma mensagem registrada (via conversa).
    const comConversa = new Set<string>();
    for (const m of (msgRes.data ?? []) as unknown as { conversas: { ouvinte_id: string | null } | null }[]) {
      const oid = m.conversas?.ouvinte_id;
      if (oid) comConversa.add(oid);
    }

    // Promocoes por ouvinte (para o detalhe) e agregado geral (para o card).
    const promoPorOuvinte = new Map<string, string[]>();
    const promoAgg = new Map<string, { label: string; participacoes: number; ouvintes: Set<string> }>();
    for (const p of (promoRes.data ?? []) as unknown as { promocao_nome: string | null; ouvinte_id: string | null }[]) {
      const raw = (p.promocao_nome ?? "").trim();
      if (!raw || !p.ouvinte_id) continue;
      const key = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cur = promoAgg.get(key);
      if (cur) { cur.participacoes += 1; cur.ouvintes.add(p.ouvinte_id); }
      else promoAgg.set(key, { label: raw, participacoes: 1, ouvintes: new Set([p.ouvinte_id]) });
      const lista = promoPorOuvinte.get(p.ouvinte_id) ?? [];
      if (!lista.includes(raw)) lista.push(raw);
      promoPorOuvinte.set(p.ouvinte_id, lista);
    }
    const promocoes: PromocaoRow[] = Array.from(promoAgg.values())
      .map((v) => ({ label: v.label, participantes: v.ouvintes.size, participacoes: v.participacoes }))
      .sort((a, b) => b.participantes - a.participantes || b.participacoes - a.participacoes);

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
        telefoneMasc: mascararTelefone(o.telefone),
        bairro: o.bairro,
        zona: o.zona,
        cidade: o.cidade,
        estado: o.estado,
        idade: o.idade,
        dataNascimento: o.data_nascimento,
        faixa: o.faixa_etaria ? faixaLabel.get(o.faixa_etaria) ?? null : null,
        estiloMusical: o.estilo_musical,
        cadastroEm: o.primeiro_contato_em,
        participacoes: o.participacoes ?? 0,
        ama,
        rejeita,
        radios,
        promocoes: promoPorOuvinte.get(o.id) ?? [],
        temConversa: comConversa.has(o.id),
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
      promocoes,
      ouvintes,
    };
  } catch {
    return vazio;
  }
}

export interface MensagemChat {
  id: string;
  direcao: "recebida" | "enviada";
  tipo: string | null;
  conteudo: string | null;
  criadoEm: string | null;
}

// Busca o historico de conversa de UM ouvinte, sempre pelo ouvinte_id (UUID interno),
// nunca pelo telefone. Ordem cronologica (mais antiga primeiro). Service role.
export async function getConversa(ouvinteId: string): Promise<MensagemChat[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  try {
    const { data: convs } = await sb
      .from("conversas")
      .select("id")
      .eq("ouvinte_id", ouvinteId);
    const ids = (convs ?? []).map((c) => c.id as string);
    if (ids.length === 0) return [];
    const { data, error } = await sb
      .from("mensagens")
      .select("id, direcao, tipo, conteudo, criado_em")
      .in("conversa_id", ids)
      .order("criado_em", { ascending: true })
      .limit(2000);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      id: m.id as string,
      direcao: (m.direcao === "enviada" ? "enviada" : "recebida") as
        | "recebida"
        | "enviada",
      tipo: (m.tipo as string) ?? null,
      conteudo: (m.conteudo as string) ?? null,
      criadoEm: (m.criado_em as string) ?? null,
    }));
  } catch {
    return [];
  }
}
