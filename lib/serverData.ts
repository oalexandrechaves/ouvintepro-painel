import { createClient } from "@supabase/supabase-js";
import type { SerieItem } from "./mockData";

// Cliente com service role: SO no servidor, nunca exposto ao cliente.
// A lista de ouvintes tem nome (PII) e RLS bloqueia anon, por isso service role.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serviceConfigured = Boolean(url && serviceKey);

// fetch que desativa o Data Cache do Next.js. Sem isso, os GET do supabase-js
// entram no cache e o painel passa a servir numeros congelados (ex.: promocoes
// e cards que "nao filtram"). Cobre TODAS as leituras server-side deste cliente.
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

function getServiceClient() {
  if (!serviceConfigured) return null;
  return createClient(url!, serviceKey!, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}

export interface PromocaoRow {
  slug: string;
  label: string;
  variacoes: string[];
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

export interface KpisExtra {
  cadastrados: number;
  novos: number;
  total: number;
}

export interface HotlinkExtra {
  acessos: number;
  conversoes: number;
  taxa: number;
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
  kpis: KpisExtra;
  hotlink: HotlinkExtra;
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
  kpis: { cadastrados: 0, novos: 0, total: 0 },
  hotlink: { acessos: 0, conversoes: 0, taxa: 0 },
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
    const [{ data: faixasRows }, { data: radioRow }] = await Promise.all([
      sb
        .from("faixas_etarias")
        .select("id, label, idade_min")
        .gte("idade_min", 10)
        .order("id"),
      // Radio deste painel (deploy single-tenant): usado pra nao vazar promocoes entre radios.
      sb.from("radios").select("id").eq("ativo", true).limit(1).maybeSingle(),
    ]);
    const radioId = (radioRow?.id as string | undefined) ?? null;
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
    if (radioId) qPromo = qPromo.eq("radio_id", radioId);
    if (deUtc) qPromo = qPromo.gte("criado_em", deUtc);
    if (ateUtc) qPromo = qPromo.lt("criado_em", ateUtc);

    // Conversas concluidas (cadastro completo) para o KPI "ja cadastrados".
    // conversas nao tem coluna de data util pra janela; a restricao de periodo vem
    // da propria base (idsBase, filtrada por primeiro_contato_em) na interseccao abaixo.
    const qConv = sb
      .from("conversas")
      .select("ouvinte_id")
      .eq("etapa", "concluido")
      .limit(20000);

    // Hotlink: cliques na mesma janela (a view painel_hotlink nao filtra data).
    let qHot = sb
      .from("hotlink_cliques")
      .select("convertido")
      .limit(100000);
    if (deUtc) qHot = qHot.gte("criado_em", deUtc);
    if (ateUtc) qHot = qHot.lt("criado_em", ateUtc);

    // Ouvintes com conversa: em vez de um embed reverso (mensagens ->
    // conversas(ouvinte_id)), que dava falso-negativo para quem tem varias
    // conversas, buscamos as duas tabelas e mapeamos conversa_id -> ouvinte_id.
    let qMsgConv = sb.from("mensagens").select("conversa_id").limit(50000);
    if (radioId) qMsgConv = qMsgConv.eq("radio_id", radioId);
    let qConvOwner = sb.from("conversas").select("id, ouvinte_id").limit(50000);
    if (radioId) qConvOwner = qConvOwner.eq("radio_id", radioId);

    const [{ data, error }, promoRes, msgRes, convOwnerRes, convRes, hotRes] =
      await Promise.all([q, qPromo, qMsgConv, qConvOwner, qConv, qHot]);
    if (error) throw error;
    const rows = (data ?? []) as unknown as OuvinteEmbed[];

    // Ouvintes que tem ao menos uma mensagem registrada (via conversa).
    const conversasComMensagem = new Set<string>();
    for (const m of (msgRes.data ?? []) as { conversa_id: string | null }[]) {
      if (m.conversa_id) conversasComMensagem.add(m.conversa_id);
    }
    const comConversa = new Set<string>();
    for (const c of (convOwnerRes.data ?? []) as {
      id: string;
      ouvinte_id: string | null;
    }[]) {
      if (c.ouvinte_id && conversasComMensagem.has(c.id)) {
        comConversa.add(c.ouvinte_id);
      }
    }

    // Promocoes: agrupa variacoes parecidas (Levenshtein) sob o nome canonico.
    const partsRaw: ParticipacaoRaw[] = (promoRes.data ?? []).map((p) => ({
      ouvinteId: (p as { ouvinte_id: string | null }).ouvinte_id ?? "",
      raw: (p as { promocao_nome: string | null }).promocao_nome ?? "",
      criadoEm: null,
    }));
    const gruposPromo = agruparPromocoes(partsRaw);
    // Nome canonico por ouvinte, para o detalhe do ModalOuvinte.
    const promoPorOuvinte = new Map<string, string[]>();
    for (const g of gruposPromo) {
      for (const oid of Array.from(g.ouvintes)) {
        const lista = promoPorOuvinte.get(oid) ?? [];
        if (!lista.includes(g.label)) lista.push(g.label);
        promoPorOuvinte.set(oid, lista);
      }
    }
    const promocoes: PromocaoRow[] = gruposPromo.map((g) => ({
      slug: g.slug,
      label: g.label,
      variacoes: g.variacoes,
      participantes: g.ouvintes.size,
      participacoes: g.participacoes,
    }));

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

    // KPIs no periodo: total/novos = ouvintes que entraram no intervalo (mesma base
    // filtrada por primeiro_contato_em); ja cadastrados = os que concluiram cadastro
    // dentro do intervalo (conversa etapa=concluido). Restringe aos ouvintes da base.
    const idsBase = new Set(rows.map((o) => o.id));
    const concluidos = new Set<string>();
    for (const c of (convRes.data ?? []) as unknown as { ouvinte_id: string | null }[]) {
      if (c.ouvinte_id && idsBase.has(c.ouvinte_id)) concluidos.add(c.ouvinte_id);
    }
    const kpis: KpisExtra = {
      cadastrados: concluidos.size,
      novos: rows.length,
      total: rows.length,
    };

    // Hotlink no periodo: conta cliques e conversoes na janela.
    const cliques = (hotRes.data ?? []) as unknown as { convertido: boolean | null }[];
    const acessos = cliques.length;
    const conversoes = cliques.filter((h) => h.convertido).length;
    const hotlink: HotlinkExtra = {
      acessos,
      conversoes,
      taxa: acessos > 0 ? Math.round((1000 * conversoes) / acessos) / 10 : 0,
    };

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
      kpis,
      hotlink,
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

// ===================== PROMOCOES: agrupamento e sorteios =====================

// Normaliza o nome da promocao pra comparar variacoes (minusculas, sem acento,
// espacos colapsados).
function normalizaPromo(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Distancia de Levenshtein entre duas strings (agrupa erros de digitacao).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + custo);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

interface ParticipacaoRaw {
  ouvinteId: string;
  raw: string;
  criadoEm: string | null;
}

export interface GrupoPromo {
  slug: string;
  label: string;
  variacoes: string[];
  chaves: Set<string>;
  participacoes: number;
  ouvintes: Set<string>;
}

// Agrupa participacoes por nome, fundindo variacoes muito parecidas (Levenshtein
// agressivo) sob o nome canonico (o raw com mais participacoes). Determinista:
// o mesmo conjunto sempre gera os mesmos grupos e slugs.
export function agruparPromocoes(parts: ParticipacaoRaw[]): GrupoPromo[] {
  const porChave = new Map<
    string,
    { rawCount: Map<string, number>; participacoes: number; ouvintes: Set<string> }
  >();
  for (const p of parts) {
    const raw = (p.raw ?? "").trim();
    if (!raw || !p.ouvinteId) continue;
    const key = normalizaPromo(raw);
    if (!key) continue;
    let g = porChave.get(key);
    if (!g) {
      g = { rawCount: new Map(), participacoes: 0, ouvintes: new Set() };
      porChave.set(key, g);
    }
    g.rawCount.set(raw, (g.rawCount.get(raw) ?? 0) + 1);
    g.participacoes += 1;
    g.ouvintes.add(p.ouvinteId);
  }

  // Funde chaves parecidas: as mais frequentes viram base dos super-grupos.
  const ordenadas = Array.from(porChave.entries()).sort(
    (a, b) => b[1].participacoes - a[1].participacoes,
  );
  const limiar = (len: number) => Math.max(1, Math.floor(0.34 * len));
  const supergrupos: { chaves: string[] }[] = [];
  for (const [key] of ordenadas) {
    let alvo: { chaves: string[] } | null = null;
    for (const sg of supergrupos) {
      const base = sg.chaves[0];
      if (levenshtein(key, base) <= limiar(Math.max(key.length, base.length))) {
        alvo = sg;
        break;
      }
    }
    if (alvo) alvo.chaves.push(key);
    else supergrupos.push({ chaves: [key] });
  }

  const grupos: GrupoPromo[] = supergrupos.map((sg) => {
    const rawCount = new Map<string, number>();
    let participacoes = 0;
    const ouvintes = new Set<string>();
    for (const k of sg.chaves) {
      const g = porChave.get(k)!;
      participacoes += g.participacoes;
      for (const o of Array.from(g.ouvintes)) ouvintes.add(o);
      for (const [raw, c] of Array.from(g.rawCount.entries())) {
        rawCount.set(raw, (rawCount.get(raw) ?? 0) + c);
      }
    }
    let label = "";
    let best = -1;
    for (const [raw, c] of Array.from(rawCount.entries())) {
      if (c > best) {
        best = c;
        label = raw;
      }
    }
    const variacoes = Array.from(rawCount.keys()).filter((r) => r !== label);
    return {
      slug: normalizaPromo(label),
      label,
      variacoes,
      chaves: new Set(sg.chaves),
      participacoes,
      ouvintes,
    };
  });

  return grupos.sort(
    (a, b) => b.ouvintes.size - a.ouvintes.size || b.participacoes - a.participacoes,
  );
}

// Resolve a radio deste painel (deploy single-tenant).
async function resolverRadioId(
  sb: ReturnType<typeof getServiceClient>,
): Promise<string | null> {
  if (!sb) return null;
  const { data } = await sb
    .from("radios")
    .select("id")
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// Converte um dia de Brasilia (YYYY-MM-DD) no par de limites UTC [de, ate).
function janelaUtc(
  de: string | null,
  ate: string | null,
): { deUtc: string | null; ateUtc: string | null } {
  const deUtc = de ? `${de}T03:00:00.000Z` : null;
  let ateUtc: string | null = null;
  if (ate) {
    const fim = new Date(`${ate}T03:00:00.000Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    ateUtc = fim.toISOString();
  }
  return { deUtc, ateUtc };
}

export interface PromoVitoria {
  promocao: string;
  data: string | null;
}

export interface PromoParticipante {
  ouvinteId: string;
  nome: string | null;
  telefoneMasc: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  participacoes: number;
  primeiraEm: string | null;
  ultimaEm: string | null;
  variacaoExata: string;
  jaGanhou: PromoVitoria[];
}

export interface PromoGanhador {
  id: string;
  ouvinteId: string;
  nome: string | null;
  telefoneMasc: string | null;
  bairro: string | null;
  confirmadoEm: string | null;
}

export interface PromocaoDetalhe {
  slug: string;
  label: string;
  variacoes: string[];
  participantes: PromoParticipante[];
  ganhadores: PromoGanhador[];
}

const detalheVazio = (slug: string): PromocaoDetalhe => ({
  slug,
  label: slug,
  variacoes: [],
  participantes: [],
  ganhadores: [],
});

// Detalhe de UMA promocao (pelo slug canonico), respeitando o periodo do painel.
// A checagem de "ja ganhou" ignora o periodo (olha todo o historico da radio) e
// inclui vitorias na propria promocao. Sempre por ouvinte_id; telefone mascarado.
export async function getPromocaoDetalhe(
  slug: string,
  de: string | null = null,
  ate: string | null = null,
): Promise<PromocaoDetalhe> {
  const sb = getServiceClient();
  if (!sb) return detalheVazio(slug);
  try {
    const radioId = await resolverRadioId(sb);
    const { deUtc, ateUtc } = janelaUtc(de, ate);

    let qParts = sb
      .from("promocao_participacoes")
      .select("promocao_nome, ouvinte_id, criado_em")
      .limit(20000);
    if (radioId) qParts = qParts.eq("radio_id", radioId);
    if (deUtc) qParts = qParts.gte("criado_em", deUtc);
    if (ateUtc) qParts = qParts.lt("criado_em", ateUtc);
    const { data: partsData } = await qParts;

    const parts: ParticipacaoRaw[] = (partsData ?? []).map((p) => ({
      ouvinteId: (p.ouvinte_id as string) ?? "",
      raw: (p.promocao_nome as string) ?? "",
      criadoEm: (p.criado_em as string) ?? null,
    }));

    const grupo = agruparPromocoes(parts).find((g) => g.slug === slug);
    if (!grupo) return detalheVazio(slug);

    // Estatisticas por ouvinte no grupo (1 participante mesmo com varios #).
    interface Acc {
      participacoes: number;
      primeiraEm: string | null;
      ultimaEm: string | null;
      variacaoExata: string;
    }
    const porOuvinte = new Map<string, Acc>();
    for (const p of parts) {
      if (!p.ouvinteId) continue;
      if (!grupo.chaves.has(normalizaPromo(p.raw))) continue;
      const acc = porOuvinte.get(p.ouvinteId);
      if (!acc) {
        porOuvinte.set(p.ouvinteId, {
          participacoes: 1,
          primeiraEm: p.criadoEm,
          ultimaEm: p.criadoEm,
          variacaoExata: p.raw.trim(),
        });
      } else {
        acc.participacoes += 1;
        if (p.criadoEm && (!acc.primeiraEm || p.criadoEm < acc.primeiraEm)) {
          acc.primeiraEm = p.criadoEm;
        }
        if (p.criadoEm && (!acc.ultimaEm || p.criadoEm > acc.ultimaEm)) {
          acc.ultimaEm = p.criadoEm;
          acc.variacaoExata = p.raw.trim();
        }
      }
    }

    const ids = Array.from(porOuvinte.keys());
    if (ids.length === 0) {
      return {
        slug: grupo.slug,
        label: grupo.label,
        variacoes: grupo.variacoes,
        participantes: [],
        ganhadores: [],
      };
    }

    // Dados dos ouvintes (por id) e historico COMPLETO de vitorias (sem periodo).
    let qVit = sb
      .from("promocao_ganhadores")
      .select("ouvinte_id, promocao_nome, confirmado_em")
      .in("ouvinte_id", ids);
    if (radioId) qVit = qVit.eq("radio_id", radioId);
    const [{ data: ouvData }, { data: vitData }] = await Promise.all([
      sb
        .from("ouvintes")
        .select("id, nome, telefone, bairro, zona, cidade, estado")
        .in("id", ids),
      qVit,
    ]);

    const ouvMap = new Map(
      (ouvData ?? []).map(
        (o) => [o.id as string, o] as [string, Record<string, unknown>],
      ),
    );
    const vitPorOuvinte = new Map<string, PromoVitoria[]>();
    for (const v of vitData ?? []) {
      const oid = v.ouvinte_id as string;
      const lista = vitPorOuvinte.get(oid) ?? [];
      lista.push({
        promocao: (v.promocao_nome as string) ?? "",
        data: (v.confirmado_em as string) ?? null,
      });
      vitPorOuvinte.set(oid, lista);
    }

    const participantes: PromoParticipante[] = ids.map((id) => {
      const acc = porOuvinte.get(id)!;
      const o = ouvMap.get(id);
      return {
        ouvinteId: id,
        nome: (o?.nome as string) ?? null,
        telefoneMasc: mascararTelefone((o?.telefone as string) ?? null),
        bairro: (o?.bairro as string) ?? null,
        zona: (o?.zona as string) ?? null,
        cidade: (o?.cidade as string) ?? null,
        estado: (o?.estado as string) ?? null,
        participacoes: acc.participacoes,
        primeiraEm: acc.primeiraEm,
        ultimaEm: acc.ultimaEm,
        variacaoExata: acc.variacaoExata,
        jaGanhou: vitPorOuvinte.get(id) ?? [],
      };
    });
    participantes.sort((a, b) => {
      const da = a.primeiraEm ?? "";
      const db = b.primeiraEm ?? "";
      return da < db ? -1 : da > db ? 1 : 0;
    });

    // Ganhadores ja confirmados DESTA promocao (pelo nome canonico).
    let qGan = sb
      .from("promocao_ganhadores")
      .select("id, ouvinte_id, confirmado_em")
      .eq("promocao_nome", grupo.label)
      .order("confirmado_em", { ascending: false });
    if (radioId) qGan = qGan.eq("radio_id", radioId);
    const { data: ganData } = await qGan;
    const ganIds = Array.from(
      new Set((ganData ?? []).map((g) => g.ouvinte_id as string)),
    );
    let ganOuvMap = new Map<string, Record<string, unknown>>();
    if (ganIds.length) {
      const { data: go } = await sb
        .from("ouvintes")
        .select("id, nome, telefone, bairro")
        .in("id", ganIds);
      ganOuvMap = new Map(
        (go ?? []).map(
          (o) => [o.id as string, o] as [string, Record<string, unknown>],
        ),
      );
    }
    const ganhadores: PromoGanhador[] = (ganData ?? []).map((g) => {
      const o = ganOuvMap.get(g.ouvinte_id as string);
      return {
        id: g.id as string,
        ouvinteId: g.ouvinte_id as string,
        nome: (o?.nome as string) ?? null,
        telefoneMasc: mascararTelefone((o?.telefone as string) ?? null),
        bairro: (o?.bairro as string) ?? null,
        confirmadoEm: (g.confirmado_em as string) ?? null,
      };
    });

    return {
      slug: grupo.slug,
      label: grupo.label,
      variacoes: grupo.variacoes,
      participantes,
      ganhadores,
    };
  } catch {
    return detalheVazio(slug);
  }
}

// Registra um ganhador confirmado. Retorna true em sucesso. Sempre por ouvinte_id.
export async function registrarGanhador(input: {
  ouvinteId: string;
  promocaoNome: string;
  variacaoDigitada?: string | null;
}): Promise<boolean> {
  const sb = getServiceClient();
  if (!sb) return false;
  try {
    const radioId = await resolverRadioId(sb);
    if (!radioId) return false;
    const agora = new Date().toISOString();
    const { error } = await sb.from("promocao_ganhadores").insert({
      radio_id: radioId,
      ouvinte_id: input.ouvinteId,
      promocao_nome: input.promocaoNome,
      variacao_digitada: input.variacaoDigitada ?? null,
      sorteado_em: agora,
      confirmado_em: agora,
    });
    return !error;
  } catch {
    return false;
  }
}
