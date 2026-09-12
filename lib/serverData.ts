import { createClient } from "@supabase/supabase-js";
import type { SerieItem } from "./tipos";
import {
  diaSaoPaulo,
  diasEntre,
  addDias,
  diaMesCurto,
  janelaUtc as janelaDias,
  periodoAnterior,
} from "./periodo";

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

// ============================================================================
// O POSTGREST CORTA EM 1000 LINHAS POR REQUISICAO, EM SILENCIO.
// `db-max-rows=1000` faz `.limit(2000)` devolver 1000 sem erro nem aviso. Este
// painel mentiu por causa disso: no periodo "Ano" nenhum total passava de 1000,
// e com o seed de 49 mil ouvintes a mentira chegaria ate a janela de 30 dias.
// Toda leitura que pode passar de 1000 linhas usa um destes dois caminhos:
//   - contar(): numero exato calculado no banco (count exact, head), para KPI;
//   - carregarTudo(): paginacao completa, para quando a linha e necessaria.
// `.limit()` acima de 1000 nao deve voltar a aparecer neste arquivo.
// ============================================================================

type RespostaPagina = {
  data: unknown[] | null;
  error: unknown;
  count?: number | null;
};

// Pagina ate o fim, com as paginas seguintes em paralelo (lotes de 6, para nao
// despejar dezenas de requisicoes simultaneas no banco). O total vem do count
// exato da primeira pagina, entao nao ha "pagina incompleta" adivinhando o fim.
// TETO EXPLICITO: passar dele e ERRO, nunca corte silencioso. A ordenacao da
// consulta tem que ser por coluna unica (id), senao a paginacao repete ou pula.
async function carregarTudo<T>(
  monta: (
    de: number,
    ate: number,
    contar: boolean,
  ) => PromiseLike<RespostaPagina>,
  teto = 500_000,
): Promise<T[]> {
  const bloco = 1000;
  const primeira = await monta(0, bloco - 1, true);
  if (primeira.error) throw primeira.error;
  const total = primeira.count ?? primeira.data?.length ?? 0;
  if (total > teto) {
    throw new Error(`carregarTudo: ${total} linhas passa do teto de ${teto}`);
  }
  const out = [...((primeira.data ?? []) as T[])];
  const inicios: number[] = [];
  for (let de = bloco; de < total; de += bloco) inicios.push(de);
  for (let i = 0; i < inicios.length; i += 6) {
    const lote = await Promise.all(
      inicios.slice(i, i + 6).map((de) => monta(de, de + bloco - 1, false)),
    );
    for (const r of lote) {
      if (r.error) throw r.error;
      out.push(...((r.data ?? []) as T[]));
    }
  }
  return out;
}

async function contar(q: PromiseLike<RespostaPagina>): Promise<number> {
  const r = await q;
  if (r.error) throw r.error;
  return r.count ?? 0;
}

// `.in("id", ids)` com milhares de ids vira uma URL de centenas de KB e o
// PostgREST recusa; o catch devolvia vazio e o sorteio ficava sem participante.
// Em lotes de 150 a URL fica curta e cada resposta cabe nas 1000 linhas.
async function emLotes<T>(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<RespostaPagina>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const r = await consulta(ids.slice(i, i + 150));
    if (r.error) throw r.error;
    out.push(...((r.data ?? []) as T[]));
  }
  return out;
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

// Dados da tela OUVINTES (interna). KPIs e atribuicao comercial sairam daqui e
// foram para getVisaoGeral, contados no banco.
export interface PainelExtra {
  configurado: boolean;
  faixas: { id: number; label: string }[];
  zonasDisponiveis: string[];
  musicasAmadas: SerieItem[];
  musicasRejeitadas: SerieItem[];
  artistasAmados: SerieItem[];
  artistasRejeitados: SerieItem[];
  zonas: SerieItem[];
  faixaEtaria: SerieItem[];
  bairrosPorZona: Record<string, SerieItem[]>;
  bairrosGeral: SerieItem[];
  radios: SerieItem[];
  pedidosDiversos: SerieItem[];
  funilAbandono: SerieItem[];
  ouvintes: OuvinteRow[];
  totalOuvintes: number;
}

// A lista vai para o navegador com nome completo (tela interna). Com o corte em
// 1000 corrigido ela pode ter dezenas de milhares de linhas, que travariam a
// pagina; os rankings continuam contando todo mundo, so a lista e limitada.
const OUVINTES_LISTA_MAX = 500;

const vazio: PainelExtra = {
  configurado: false,
  faixas: [],
  zonasDisponiveis: [],
  musicasAmadas: [],
  musicasRejeitadas: [],
  artistasAmados: [],
  artistasRejeitados: [],
  zonas: [],
  faixaEtaria: [],
  bairrosPorZona: {},
  bairrosGeral: [],
  radios: [],
  pedidosDiversos: [],
  funilAbandono: [],
  ouvintes: [],
  totalOuvintes: 0,
};

// Mascara o telefone mantendo DDD/pais e os ultimos 4 digitos (ex: 5511*****7060).
function mascararTelefone(tel: string | null | undefined): string | null {
  const t = (tel ?? "").replace(/\D/g, "");
  if (!t) return null;
  if (t.length <= 8)
    return t.slice(0, 2) + "*".repeat(Math.max(0, t.length - 6)) + t.slice(-4);
  const inicio = t.slice(0, 4);
  const fim = t.slice(-4);
  return `${inicio}${"*".repeat(t.length - 8)}${fim}`;
}

// Conta ocorrencias agrupando por chave canonica (minusculo, sem acento),
// exibindo o primeiro rotulo visto. Devolve ranking desc.
function ranking(
  itens: (string | null | undefined)[],
  limite = 10,
): SerieItem[] {
  const mapa = new Map<string, { label: string; valor: number }>();
  for (const it of itens) {
    const raw = (it ?? "").trim();
    if (!raw) continue;
    const key = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
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
  numero: string | null;
  consentimento_em: string | null;
  estilo_musical: string | null;
  faixa_etaria: number | null;
  primeiro_contato_em: string | null;
  participacoes: number | null;
  musicas: MusicaEmbed[] | null;
  radios_concorrentes: RadioEmbed[] | null;
}

// RÉGUA DE CADASTRO COMPLETO (v82). Espelha public.ouvinte_completo no SQL
// (migration 20260804000005_painel_cadastro_completo.sql) e cadastroEstaCompleto no
// bot (supabase/functions/whatsapp-webhook/index.ts). Se mudar aqui, mude nos DOIS
// outros lugares. completo = nome + data_nascimento + cidade + numero + consentimento,
// MAIS bairro e zona quando a cidade for Sao Paulo capital.
function ouvinteCompleto(o: {
  nome: string | null;
  data_nascimento: string | null;
  cidade: string | null;
  numero: string | null;
  consentimento_em: string | null;
  bairro: string | null;
  zona: string | null;
}): boolean {
  const base =
    !!o.nome &&
    !!o.data_nascimento &&
    !!o.cidade &&
    !!o.numero &&
    !!o.consentimento_em;
  if (!base) return false;
  const cidade = (o.cidade ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const capital = cidade === "sao paulo";
  if (capital) return !!o.bairro && !!o.zona;
  return true;
}

// Rotulo da etapa em que um cadastro INCOMPLETO parou (primeiro campo faltante),
// para o card de funil de abandono. Mesma ordem do fluxo do bot.
function etapaAbandono(o: {
  nome: string | null;
  consentimento_em: string | null;
  data_nascimento: string | null;
  cidade: string | null;
  numero: string | null;
  bairro: string | null;
  zona: string | null;
}): string {
  if (!o.nome) return "Sem nome";
  if (!o.consentimento_em) return "Sem consentimento";
  if (!o.data_nascimento) return "Sem data de nascimento";
  if (!o.cidade) return "Sem cidade";
  const cidade = (o.cidade ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (cidade === "sao paulo" && (!o.bairro || !o.zona)) return "Sem bairro";
  if (!o.numero) return "Sem número";
  return "Completo";
}

// Rotulos em pt-BR para os tipos de pedido diverso.
const PEDIDO_TIPO_LABEL: Record<string, string> = {
  abraco: "Abraço",
  beijo: "Beijo",
  alo: "Alô",
  camiseta: "Camiseta",
  premio: "Prêmio",
  musica: "Música",
  promocao: "Promoção",
  outro: "Outro",
};

// Dados da tela OUVINTES, com filtros de faixa, zona e periodo.
// Todas as leituras paginam ate o fim (carregarTudo): antes eram `.limit()` de
// 2000 a 100000, e o PostgREST cortava cada uma em 1000.
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

    // Filtro por data de cadastro: as datas escolhidas sao dias de Brasilia
    // (UTC-03:00 fixo, sem horario de verao). Converte pra UTC antes de consultar.
    const { deUtc, ateUtc } = janelaUtc(de, ate);

    const [rowsRaw, promoRows, convRows, pedidosRows] = await Promise.all([
      carregarTudo<OuvinteEmbed & { zona: string | null }>((i, f, c) => {
        let q = sb
          .from("ouvintes")
          .select(
            "id, nome, telefone, bairro, zona, cidade, estado, idade, data_nascimento, numero, consentimento_em, estilo_musical, faixa_etaria, primeiro_contato_em, participacoes, musicas(sentimento, artista, titulo, nome), radios_concorrentes(nome_radio, nome_canonico)",
            c ? { count: "exact" } : undefined,
          )
          .order("id")
          .range(i, f);
        if (faixa) q = q.eq("faixa_etaria", faixa);
        if (zona) q = q.eq("zona", zona);
        if (deUtc) q = q.gte("primeiro_contato_em", deUtc);
        if (ateUtc) q = q.lt("primeiro_contato_em", ateUtc);
        return q;
      }),
      carregarTudo<{ promocao_nome: string | null; ouvinte_id: string | null }>(
        (i, f, c) => {
          let q = sb
            .from("promocao_participacoes")
            .select(
              "promocao_nome, ouvinte_id",
              c ? { count: "exact" } : undefined,
            )
            .order("id")
            .range(i, f);
          if (radioId) q = q.eq("radio_id", radioId);
          if (deUtc) q = q.gte("criado_em", deUtc);
          if (ateUtc) q = q.lt("criado_em", ateUtc);
          return q;
        },
      ),
      // Quem tem conversa: a contagem de mensagens vem agregada por conversa
      // (mensagens(count)), em vez de baixar todas as mensagens so para saber
      // quais conversas tem alguma.
      carregarTudo<{
        ouvinte_id: string | null;
        mensagens: { count: number }[] | null;
      }>((i, f, c) => {
        let q = sb
          .from("conversas")
          .select(
            "ouvinte_id, mensagens(count)",
            c ? { count: "exact" } : undefined,
          )
          .order("id")
          .range(i, f);
        if (radioId) q = q.eq("radio_id", radioId);
        return q;
      }),
      carregarTudo<{ tipo: string | null }>((i, f, c) => {
        let q = sb
          .from("pedidos")
          .select("tipo", c ? { count: "exact" } : undefined)
          .order("id")
          .range(i, f);
        if (radioId) q = q.eq("radio_id", radioId);
        if (deUtc) q = q.gte("criado_em", deUtc);
        if (ateUtc) q = q.lt("criado_em", ateUtc);
        return q;
      }),
    ]);

    // A lista aparece do cadastro mais recente para o mais antigo; a paginacao
    // e por id (unico), entao a ordem de exibicao e aplicada aqui.
    const rows = rowsRaw.sort((a, b) =>
      (b.primeiro_contato_em ?? "").localeCompare(a.primeiro_contato_em ?? ""),
    );

    const comConversa = new Set<string>();
    for (const c of convRows) {
      if (c.ouvinte_id && (c.mensagens?.[0]?.count ?? 0) > 0) {
        comConversa.add(c.ouvinte_id);
      }
    }

    // Promocoes: agrupa variacoes parecidas (Levenshtein) sob o nome canonico.
    const partsRaw: ParticipacaoRaw[] = promoRows.map((p) => ({
      ouvinteId: p.ouvinte_id ?? "",
      raw: p.promocao_nome ?? "",
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

    const amaMus: string[] = [];
    const rejMus: string[] = [];
    const amaArt: string[] = [];
    const rejArt: string[] = [];
    const radiosAll: string[] = [];
    const zonasAll: string[] = [];
    const bairrosAll: string[] = [];
    const bairrosPorZonaMap = new Map<string, string[]>();
    const faixaCount = new Map<number, number>();
    const zonasDisponiveis = new Set<string>();

    const ouvintes: OuvinteRow[] = rows.map((o) => {
      if (o.zona) zonasDisponiveis.add(o.zona);
      // v82: metricas/rankings/zonas/faixas contam SO cadastros completos. As listas
      // ama/rejeita/radios do PROPRIO ouvinte (usadas no ModalOuvinte) seguem sempre;
      // os acumuladores globais (amaMus, zonasAll, faixaCount, etc.) so recebem se completo.
      const completo = ouvinteCompleto(o);
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
            if (completo) amaMus.push(chave);
          }
          if (m.artista && completo) amaArt.push(m.artista);
        } else if (m.sentimento === "rejeita") {
          if (temTitulo) {
            rejeita.push(chave);
            if (completo) rejMus.push(chave);
          }
          if (m.artista && completo) rejArt.push(m.artista);
        }
      }
      const radios = (o.radios_concorrentes ?? [])
        .map((r) => r.nome_canonico ?? r.nome_radio ?? "")
        .filter(Boolean);
      if (completo) radiosAll.push(...radios);

      if (completo && o.zona) {
        zonasAll.push(o.zona);
        if (o.bairro) {
          const lista = bairrosPorZonaMap.get(o.zona) ?? [];
          lista.push(o.bairro);
          bairrosPorZonaMap.set(o.zona, lista);
        }
      }
      if (completo && o.bairro) bairrosAll.push(o.bairro);
      if (completo && o.faixa_etaria != null) {
        faixaCount.set(
          o.faixa_etaria,
          (faixaCount.get(o.faixa_etaria) ?? 0) + 1,
        );
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
        faixa: o.faixa_etaria ? (faixaLabel.get(o.faixa_etaria) ?? null) : null,
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

    // Pedidos diversos por tipo (rotulo pt-BR). Ranking desc para o card.
    const pedidoCount = new Map<string, number>();
    for (const p of pedidosRows) {
      const label =
        PEDIDO_TIPO_LABEL[(p.tipo ?? "").toLowerCase()] ??
        PEDIDO_TIPO_LABEL.outro;
      pedidoCount.set(label, (pedidoCount.get(label) ?? 0) + 1);
    }
    const pedidosDiversos: SerieItem[] = Array.from(pedidoCount.entries())
      .map(([label, valor]) => ({ label, valor }))
      .sort((a, b) => b.valor - a.valor);

    // Funil de abandono: cadastros INCOMPLETOS agrupados pela etapa em que pararam.
    const funilCount = new Map<string, number>();
    for (const o of rows) {
      if (ouvinteCompleto(o)) continue;
      const etapa = etapaAbandono(o);
      funilCount.set(etapa, (funilCount.get(etapa) ?? 0) + 1);
    }
    // Ordem fixa das etapas para o funil (do inicio ao fim do fluxo).
    const ordemFunil = [
      "Sem nome",
      "Sem consentimento",
      "Sem data de nascimento",
      "Sem cidade",
      "Sem bairro",
      "Sem número",
    ];
    const funilAbandono: SerieItem[] = ordemFunil
      .filter((e) => funilCount.has(e))
      .map((e) => ({ label: e, valor: funilCount.get(e) ?? 0 }));

    return {
      configurado: true,
      faixas,
      zonasDisponiveis: Array.from(zonasDisponiveis).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
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
      pedidosDiversos,
      funilAbandono,
      ouvintes: ouvintes.slice(0, OUVINTES_LISTA_MAX),
      totalOuvintes: ouvintes.length,
    };
  } catch (e) {
    console.error("[getPainelExtra] falhou:", e);
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
    const data = await carregarTudo<Record<string, unknown>>((i, f, c) =>
      sb
        .from("mensagens")
        .select(
          "id, direcao, tipo, conteudo, criado_em",
          c ? { count: "exact" } : undefined,
        )
        .in("conversa_id", ids)
        .order("criado_em", { ascending: true })
        .order("id")
        .range(i, f),
    );
    return data.map((m) => ({
      id: m.id as string,
      direcao: (m.direcao === "enviada" ? "enviada" : "recebida") as
        "recebida" | "enviada",
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
    {
      rawCount: Map<string, number>;
      participacoes: number;
      ouvintes: Set<string>;
    }
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
    (a, b) =>
      b.ouvintes.size - a.ouvintes.size || b.participacoes - a.participacoes,
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

// Lista da tela PROMOCOES: grupos canonicos com participantes no periodo. Era
// um pedaco do getPainelExtra; ganhou funcao propria para a tela nao carregar
// ouvintes, musicas e conversas so para listar promocoes.
export async function getPromocoes(
  de: string | null,
  ate: string | null,
): Promise<{ configurado: boolean; promocoes: PromocaoRow[] }> {
  const sb = getServiceClient();
  if (!sb) return { configurado: false, promocoes: [] };
  try {
    const radioId = await resolverRadioId(sb);
    const { deUtc, ateUtc } = janelaUtc(de, ate);
    const rows = await carregarTudo<{
      promocao_nome: string | null;
      ouvinte_id: string | null;
    }>((i, f, c) => {
      let q = sb
        .from("promocao_participacoes")
        .select("promocao_nome, ouvinte_id", c ? { count: "exact" } : undefined)
        .order("id")
        .range(i, f);
      if (radioId) q = q.eq("radio_id", radioId);
      if (deUtc) q = q.gte("criado_em", deUtc);
      if (ateUtc) q = q.lt("criado_em", ateUtc);
      return q;
    });
    const grupos = agruparPromocoes(
      rows.map((r) => ({
        ouvinteId: r.ouvinte_id ?? "",
        raw: r.promocao_nome ?? "",
        criadoEm: null,
      })),
    );
    return {
      configurado: true,
      promocoes: grupos.map((g) => ({
        slug: g.slug,
        label: g.label,
        variacoes: g.variacoes,
        participantes: g.ouvintes.size,
        participacoes: g.participacoes,
      })),
    };
  } catch (e) {
    console.error("[getPromocoes] falhou:", e);
    return { configurado: false, promocoes: [] };
  }
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

    // Paginado ate o fim: com `.limit(20000)` o PostgREST devolvia 1000, e quem
    // estava depois do corte nunca podia ser sorteado.
    const partsData = await carregarTudo<Record<string, unknown>>((i, f, c) => {
      let q = sb
        .from("promocao_participacoes")
        .select(
          "promocao_nome, ouvinte_id, criado_em",
          c ? { count: "exact" } : undefined,
        )
        .order("id")
        .range(i, f);
      if (radioId) q = q.eq("radio_id", radioId);
      if (deUtc) q = q.gte("criado_em", deUtc);
      if (ateUtc) q = q.lt("criado_em", ateUtc);
      return q;
    });

    const parts: ParticipacaoRaw[] = partsData.map((p) => ({
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
    // Em lotes: `.in` com milhares de ids estoura a URL e a consulta falhava.
    const [ouvData, vitData] = await Promise.all([
      emLotes<Record<string, unknown>>(ids, (lote) =>
        sb
          .from("ouvintes")
          .select("id, nome, telefone, bairro, zona, cidade, estado")
          .in("id", lote),
      ),
      emLotes<Record<string, unknown>>(ids, (lote) => {
        let q = sb
          .from("promocao_ganhadores")
          .select("ouvinte_id, promocao_nome, confirmado_em")
          .in("ouvinte_id", lote);
        if (radioId) q = q.eq("radio_id", radioId);
        return q;
      }),
    ]);

    const ouvMap = new Map(
      ouvData.map(
        (o) => [o.id as string, o] as [string, Record<string, unknown>],
      ),
    );
    const vitPorOuvinte = new Map<string, PromoVitoria[]>();
    for (const v of vitData) {
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
      const go = await emLotes<Record<string, unknown>>(ganIds, (lote) =>
        sb.from("ouvintes").select("id, nome, telefone, bairro").in("id", lote),
      );
      ganOuvMap = new Map(
        go.map((o) => [o.id as string, o] as [string, Record<string, unknown>]),
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

// ============================================================================
// AUDIENCIA: publico segmentado para a equipe comercial provar alcance.
//
// LGPD, e a razao do desenho: esta tela e mostrada a um TERCEIRO (o anunciante).
// Quem consentiu autorizou a radio a guardar os dados dele, nao autorizou a
// radio a entregar a base para um anunciante. Entao:
//  - so entra quem tem consentimento_em (quem recusou teve o nome anulado e
//    quem esta em consentimento_pausado nunca teve carimbo, os dois caem por
//    esta mesma condicao, sem precisar consultar conversas.etapa);
//  - a lista devolve PRIMEIRO nome, nunca o nome inteiro;
//  - telefone sai mascarado pelo mesmo mascararTelefone do resto do painel;
//  - numero da casa e data de nascimento NAO saem daqui.
//
// NAO usa ouvinteCompleto nem toca nela. "Da para mandar carta para essa
// pessoa?" e outra pergunta que "o cadastro esta completo?", e as tres reguas de
// cadastro completo (bot, view ouvinte_completo, ouvinteCompleto aqui) precisam
// continuar identicas entre si.
// ============================================================================

export interface AudienciaFiltros {
  cidade?: string | null;
  bairro?: string | null;
  zona?: string | null;
  faixa?: number | null;
  estilo?: string | null;
  programa?: string | null;
  comPedido?: boolean;
  comPromocao?: boolean;
  incluirDemo?: boolean;
}

export interface AudienciaItem {
  id: string;
  primeiroNome: string | null;
  bairro: string | null;
  cidade: string | null;
  faixa: string | null;
  telefoneMasc: string | null;
  temEndereco: boolean;
}

export interface AudienciaOpcoes {
  cidades: string[];
  bairros: string[];
  zonas: string[];
  estilos: string[];
  programas: string[];
  faixas: { id: number; label: string }[];
}

export interface Audiencia {
  configurado: boolean;
  total: number;
  comEndereco: number;
  // EXCLUSIVOS: quantos do publico filtrado nao aparecem em radios_concorrentes,
  // ou seja, nao declararam ouvir nenhuma outra radio. E o numero que o
  // anunciante so alcanca aqui, e substituiu a comparacao com a concorrencia.
  exclusivos: number;
  demoNoTotal: number;
  distFaixa: SerieItem[];
  distEstilo: SerieItem[];
  distPrograma: SerieItem[];
  lista: AudienciaItem[];
  listaTruncadaEm: number;
  opcoes: AudienciaOpcoes;
}

const audienciaVazia: Audiencia = {
  configurado: false,
  total: 0,
  comEndereco: 0,
  exclusivos: 0,
  demoNoTotal: 0,
  distFaixa: [],
  distEstilo: [],
  distPrograma: [],
  lista: [],
  listaTruncadaEm: 0,
  opcoes: {
    cidades: [],
    bairros: [],
    zonas: [],
    estilos: [],
    programas: [],
    faixas: [],
  },
};

// Quantas linhas da lista vao para o navegador. O TOTAL nao passa por aqui: ele
// e contado sobre o universo inteiro. Limite existe porque a lista e prova
// visual ("sao pessoas de verdade"), nao a base para levar embora.
const AUDIENCIA_LISTA_MAX = 120;

// PAGINACAO REAL, E NAO .limit(N).
// O PostgREST corta em db-max-rows=1000 por requisicao, entao `.limit(2000)`
// devolve 1000 calado. Numero apresentado a anunciante nao pode ser truncado em
// silencio, entao aqui se busca em blocos ate a pagina vir incompleta.
async function carregarTodos<T>(
  monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>,
  bloco = 1000,
  tetoAbsoluto = 50000,
): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < tetoAbsoluto; de += bloco) {
    const { data } = await monta(de, de + bloco - 1);
    const linhas = data ?? [];
    out.push(...linhas);
    if (linhas.length < bloco) break;
  }
  return out;
}

type OuvinteAud = {
  id: string;
  nome: string | null;
  telefone: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  numero: string | null;
  faixa_etaria: number | null;
  estilo_musical: string | null;
  programa_locutor: string | null;
  consentimento_texto: string | null;
  radios_concorrentes:
    { nome_radio: string | null; nome_canonico: string | null }[] | null;
};

function ehDemo(o: OuvinteAud): boolean {
  return (o.consentimento_texto ?? "").startsWith("[DEMO]");
}

// ENDERECO POSTAVEL NAO EXISTE NA BASE DE HOJE, e este comentario e para quem
// vier depois achar que faltou colocar: `ouvintes` guarda cidade, bairro, zona,
// estado e numero, e NAO guarda logradouro nem CEP. O bot consulta o ViaCEP e
// descarta a rua que vem na resposta. Entao o maximo que da para dizer e "tem
// bairro e numero", que e o que esta funcao mede, e a tela diz com todas as
// letras que falta a rua para postar. Chamar isso de "endereco utilizavel" sem
// a ressalva faria o comercial prometer carta que os Correios nao entregam.
function temEnderecoParcial(o: OuvinteAud): boolean {
  return Boolean(o.cidade && o.bairro && o.numero);
}

function ordenarSerie(m: Map<string, number>, limite?: number): SerieItem[] {
  const arr = Array.from(m.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort(
      (a, b) => b.valor - a.valor || a.label.localeCompare(b.label, "pt-BR"),
    );
  return limite ? arr.slice(0, limite) : arr;
}

export async function getAudiencia(f: AudienciaFiltros): Promise<Audiencia> {
  const sb = getServiceClient();
  if (!sb) return audienciaVazia;

  try {
    const [{ data: faixasRows }, ouvintes, pedidosRows, promoRows] =
      await Promise.all([
        sb.from("faixas_etarias").select("id, label").order("id"),
        carregarTodos<OuvinteAud>((de, ate) =>
          sb
            .from("ouvintes")
            .select(
              "id, nome, telefone, bairro, zona, cidade, numero, faixa_etaria, estilo_musical, programa_locutor, consentimento_texto, radios_concorrentes(nome_radio, nome_canonico)",
            )
            .not("consentimento_em", "is", null)
            .order("id")
            .range(de, ate),
        ),
        carregarTodos<{ ouvinte_id: string }>((de, ate) =>
          sb
            .from("pedidos")
            .select("ouvinte_id")
            .order("ouvinte_id")
            .range(de, ate),
        ),
        carregarTodos<{ ouvinte_id: string }>((de, ate) =>
          sb
            .from("promocao_participacoes")
            .select("ouvinte_id")
            .order("ouvinte_id")
            .range(de, ate),
        ),
      ]);

    const faixas = (faixasRows ?? []).map((r) => ({
      id: Number((r as { id: number }).id),
      label: String((r as { label: string }).label),
    }));
    const faixaLabel = new Map(
      faixas.map((x) => [x.id, x.label] as [number, string]),
    );
    const comPedido = new Set(pedidosRows.map((r) => r.ouvinte_id));
    const comPromo = new Set(promoRows.map((r) => r.ouvinte_id));

    // A COMPARACAO COM A CONCORRENCIA SAIU DA TELA, DE PROPOSITO.
    // Dizer "temos X ouvintes que tambem ouvem a Alpha" tem dupla leitura e pode
    // sugerir ao anunciante que vale anunciar na outra radio. O dado continua no
    // banco e o bot continua perguntando; o que mudou e que a tela de Audiencia
    // nao filtra nem exibe por concorrente.
    // O que sobrou desta funcao e medir EXCLUSIVIDADE: quem nao aparece em
    // radios_concorrentes nenhuma vez so e alcancavel pela Liverpool.
    const radiosDe = (o: OuvinteAud): string[] => {
      const brutos = (o.radios_concorrentes ?? [])
        .map((r) => (r.nome_canonico ?? r.nome_radio ?? "").trim())
        .filter(Boolean);
      return Array.from(new Set(brutos));
    };

    // FILTROS EM CASCATA: CADA LISTA RESPEITA TODOS OS OUTROS FILTROS, MENOS ELA.
    // Filtros independentes geravam contradicao na frente do cliente: escolhida
    // a cidade Guarulhos, o filtro de zona seguia oferecendo as zonas de Sao
    // Paulo e o de bairro oferecia Alphaville. Agora a cidade restringe as zonas,
    // a zona restringe os bairros, e o bairro restringe o resto.
    // O "MENOS ELA" e o que evita travar: se o filtro de bairro obedecesse ao
    // proprio bairro escolhido, escolher Tatuape apagaria os outros bairros da
    // lista e ninguem conseguiria trocar de bairro sem limpar tudo.
    // O interruptor de demonstracao vale para todas as listas: com a demo
    // desligada, bairro que so existe no seed nao aparece e nao devolve zero.
    type Dim = "cidade" | "bairro" | "zona" | "faixa" | "estilo" | "programa";
    const passa = (o: OuvinteAud, ignorar?: Dim): boolean => {
      if (!f.incluirDemo && ehDemo(o)) return false;
      if (ignorar !== "cidade" && f.cidade && o.cidade !== f.cidade)
        return false;
      if (ignorar !== "bairro" && f.bairro && o.bairro !== f.bairro)
        return false;
      if (ignorar !== "zona" && f.zona && o.zona !== f.zona) return false;
      if (ignorar !== "faixa" && f.faixa && o.faixa_etaria !== f.faixa)
        return false;
      if (ignorar !== "estilo" && f.estilo && o.estilo_musical !== f.estilo)
        return false;
      if (
        ignorar !== "programa" &&
        f.programa &&
        o.programa_locutor !== f.programa
      )
        return false;
      if (f.comPedido && !comPedido.has(o.id)) return false;
      if (f.comPromocao && !comPromo.has(o.id)) return false;
      return true;
    };
    const ordenar = (s: Set<string>) =>
      Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const opcoesDe = (d: Dim, valor: (o: OuvinteAud) => string | null) => {
      const set = new Set<string>();
      for (const o of ouvintes) {
        if (!passa(o, d)) continue;
        const v = valor(o);
        if (v) set.add(v);
      }
      return ordenar(set);
    };
    const faixasPresentes = new Set(
      opcoesDe("faixa", (o) =>
        o.faixa_etaria != null ? String(o.faixa_etaria) : null,
      ),
    );

    const filtrados = ouvintes.filter((o) => passa(o));

    const mFaixa = new Map<string, number>();
    const mEstilo = new Map<string, number>();
    const mPrograma = new Map<string, number>();
    let exclusivos = 0;
    let comEndereco = 0;
    let demoNoTotal = 0;
    for (const o of filtrados) {
      if (temEnderecoParcial(o)) comEndereco += 1;
      if (radiosDe(o).length === 0) exclusivos += 1;
      if (ehDemo(o)) demoNoTotal += 1;
      const fl = o.faixa_etaria != null ? faixaLabel.get(o.faixa_etaria) : null;
      if (fl) mFaixa.set(fl, (mFaixa.get(fl) ?? 0) + 1);
      if (o.estilo_musical)
        mEstilo.set(o.estilo_musical, (mEstilo.get(o.estilo_musical) ?? 0) + 1);
      if (o.programa_locutor)
        mPrograma.set(
          o.programa_locutor,
          (mPrograma.get(o.programa_locutor) ?? 0) + 1,
        );
    }

    // A ordem da distribuicao por faixa segue a idade, nao o volume: faixa
    // etaria e escala, e escala fora de ordem nao se le.
    const distFaixa = faixas
      .map((x) => ({ label: x.label, valor: mFaixa.get(x.label) ?? 0 }))
      .filter((x) => x.valor > 0);

    const lista: AudienciaItem[] = filtrados
      .slice(0, AUDIENCIA_LISTA_MAX)
      .map((o) => ({
        id: o.id,
        // PRIMEIRO nome apenas. O sobrenome nao vai para o navegador do comercial,
        // entao nao ha como vazar dele para o anunciante nem por inspecao da rede.
        primeiroNome: (o.nome ?? "").trim().split(/\s+/)[0] || null,
        bairro: o.bairro,
        cidade: o.cidade,
        faixa:
          o.faixa_etaria != null
            ? (faixaLabel.get(o.faixa_etaria) ?? null)
            : null,
        telefoneMasc: mascararTelefone(o.telefone),
        temEndereco: temEnderecoParcial(o),
      }));

    return {
      configurado: true,
      total: filtrados.length,
      comEndereco,
      exclusivos,
      demoNoTotal,
      distFaixa,
      distEstilo: ordenarSerie(mEstilo, 8),
      distPrograma: ordenarSerie(mPrograma, 6),
      lista,
      listaTruncadaEm: AUDIENCIA_LISTA_MAX,
      opcoes: {
        cidades: opcoesDe("cidade", (o) => o.cidade),
        bairros: opcoesDe("bairro", (o) => o.bairro),
        zonas: opcoesDe("zona", (o) => o.zona),
        estilos: opcoesDe("estilo", (o) => o.estilo_musical),
        programas: opcoesDe("programa", (o) => o.programa_locutor),
        // Faixa segue a ordem das idades, nao a alfabetica.
        faixas: faixas.filter((x) => faixasPresentes.has(String(x.id))),
      },
    };
  } catch (e) {
    console.error("[getAudiencia] falhou:", e);
    return audienciaVazia;
  }
}

// ============================================================================
// VISAO GERAL: seis secoes em sequencia de leitura.
//
// SECAO 01, AS TRES MEDIDAS SAO ANINHADAS E TODAS SO COM CONSENTIMENTO.
//  - base: quem consentiu e chegou ate o fim do periodo (acumulado);
//  - completos: os da base que passam na regua de cadastro completo;
//  - novos: os da base cujo primeiro contato caiu dentro do periodo.
// Completos e novos sao subconjuntos da base, entao nenhum cartao contradiz
// outro. Antes existiam dois cartoes com a MESMA variavel
// (`cadastrados: completosCount, novos: completosCount`) e um total que incluia
// quem nao consentiu, contados sobre uma lista cortada em 1000.
// Quem nao consentiu nao e audiencia utilizavel, e a tela Comercial ja contava
// assim: os dois lugares agora dizem a mesma coisa.
//
// A REGUA NAO E COPIADA. `ouvinte_completo=is.true` usa a funcao SQL
// public.ouvinte_completo(ouvintes) como coluna calculada do PostgREST, e as
// secoes 03 a 06 usam ouvinteCompleto() deste arquivo. As tres reguas (bot,
// SQL, este arquivo) continuam sendo as mesmas tres.
//
// SECOES 03 A 06 contam os CADASTROS COMPLETOS QUE CHEGARAM NO PERIODO, que e a
// decisao da v82 para rankings e distribuicoes, mantida sem alteracao.
// ============================================================================

export type Granularidade = "hora" | "dia" | "semana";

export interface PontoSerie {
  rotulo: string;
  atual: number;
  anterior: number;
}

export interface ItemMusica {
  label: string;
  sub: string | null;
  valor: number;
}

export interface VisaoGeral {
  configurado: boolean;
  de: string;
  ate: string;
  geradoEm: string;
  base: number;
  baseInicio: number;
  completos: number;
  novos: number;
  novosAnterior: number;
  dias: number;
  serie: {
    granularidade: Granularidade;
    pontos: PontoSerie[];
    melhor: { rotulo: string; valor: number } | null;
  };
  completosNoPeriodo: number;
  faixa: {
    distribuicao: SerieItem[];
    concentracao: { rotulo: string; pct: number } | null;
    idadeMedia: number | null;
    maisComum: string | null;
  };
  zonas: SerieItem[];
  bairros: SerieItem[];
  cidades: SerieItem[];
  estilos: SerieItem[];
  artistas: SerieItem[];
  musicas: ItemMusica[];
  programas: SerieItem[];
  promocao: {
    participantes: number;
    promocoes: number;
    maiorAdesao: { label: string; participantes: number } | null;
  };
  pedidos: { musica: number; recados: number; porTipo: SerieItem[] };
  ativosSemana: number;
  hotlink: { acessos: number; conversoes: number; taxa: number };
}

const TIPOS_RECADO = ["beijo", "abraco", "alo"];

function visaoVazia(de: string, ate: string): VisaoGeral {
  return {
    configurado: false,
    de,
    ate,
    geradoEm: new Date().toISOString(),
    base: 0,
    baseInicio: 0,
    completos: 0,
    novos: 0,
    novosAnterior: 0,
    dias: diasEntre(de, ate) + 1,
    serie: { granularidade: "dia", pontos: [], melhor: null },
    completosNoPeriodo: 0,
    faixa: {
      distribuicao: [],
      concentracao: null,
      idadeMedia: null,
      maisComum: null,
    },
    zonas: [],
    bairros: [],
    cidades: [],
    estilos: [],
    artistas: [],
    musicas: [],
    programas: [],
    promocao: { participantes: 0, promocoes: 0, maiorAdesao: null },
    pedidos: { musica: 0, recados: 0, porTipo: [] },
    ativosSemana: 0,
    hotlink: { acessos: 0, conversoes: 0, taxa: 0 },
  };
}

const fmtHoraSp = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hour12: false,
});

// Serie do periodo atual contra o anterior, alinhada por posicao: o 1o dia do
// atual contra o 1o dia do anterior. Um dia vira 24 horas; ate 62 dias, um ponto
// por dia; acima disso, um ponto por semana (365 barras nao se leem).
function montarSerie(
  timestamps: string[],
  de: string,
  ate: string,
  deAnt: string,
): VisaoGeral["serie"] {
  const dias = diasEntre(de, ate) + 1;
  const gran: Granularidade =
    dias === 1 ? "hora" : dias <= 62 ? "dia" : "semana";
  const n = gran === "hora" ? 24 : gran === "dia" ? dias : Math.ceil(dias / 7);
  const atual = new Array<number>(n).fill(0);
  const anterior = new Array<number>(n).fill(0);
  for (const ts of timestamps) {
    const dia = diaSaoPaulo(ts);
    const ehAtual = dia >= de && dia <= ate;
    const inicio = ehAtual ? de : deAnt;
    let idx: number;
    if (gran === "hora") idx = Number(fmtHoraSp.format(new Date(ts))) % 24;
    else if (gran === "dia") idx = diasEntre(inicio, dia);
    else idx = Math.floor(diasEntre(inicio, dia) / 7);
    if (idx < 0 || idx >= n) continue;
    if (ehAtual) atual[idx] += 1;
    else anterior[idx] += 1;
  }
  const rotulo = (i: number) =>
    gran === "hora"
      ? `${String(i).padStart(2, "0")}h`
      : diaMesCurto(addDias(de, gran === "dia" ? i : i * 7));
  const pontos = atual.map((v, i) => ({
    rotulo: rotulo(i),
    atual: v,
    anterior: anterior[i],
  }));
  let melhor: { rotulo: string; valor: number } | null = null;
  for (const p of pontos) {
    if (p.atual > 0 && (!melhor || p.atual > melhor.valor)) {
      melhor = { rotulo: p.rotulo, valor: p.atual };
    }
  }
  return { granularidade: gran, pontos, melhor };
}

// Janela de 4 faixas consecutivas (20 anos) com mais gente. E o "publico que a
// radio vende melhor" do arquivo de referencia, calculado e nao escrito a mao.
function concentracaoFaixas(
  dist: { label: string; valor: number }[],
  total: number,
): { rotulo: string; pct: number } | null {
  if (dist.length < 4 || total <= 0) return null;
  let melhor = -1;
  let ini = 0;
  for (let i = 0; i + 4 <= dist.length; i++) {
    const soma = dist.slice(i, i + 4).reduce((a, x) => a + x.valor, 0);
    if (soma > melhor) {
      melhor = soma;
      ini = i;
    }
  }
  const nums = (t: string) => (t.match(/\d+/g) ?? []).map(Number);
  const a = nums(dist[ini].label)[0];
  const ultimo = dist[ini + 3].label;
  const b = nums(ultimo);
  const rotulo =
    /mais/i.test(ultimo) || b.length < 2
      ? `${a} anos ou mais`
      : `${a} a ${b[1]} anos`;
  return { rotulo, pct: Math.round((melhor / total) * 100) };
}

export async function getVisaoGeral(
  de: string,
  ate: string,
): Promise<VisaoGeral> {
  const sb = getServiceClient();
  if (!sb) return visaoVazia(de, ate);

  try {
    const ant = periodoAnterior(de, ate);
    const { deUtc, ateUtc } = janelaDias(de, ate);
    const { deUtc: deAntUtc } = janelaDias(ant.de, ant.ate);
    const semanaUtc = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const radioId = await resolverRadioId(sb);

    const cont = () =>
      sb
        .from("ouvintes")
        .select("id", { count: "exact", head: true })
        .not("consentimento_em", "is", null);

    const [
      { data: faixasRows },
      base,
      baseInicio,
      completos,
      novos,
      novosAnterior,
      ativosSemana,
      acessos,
      conversoes,
      pedidosMusica,
      porTipoContagens,
      timestamps,
      periodoRows,
      promoRows,
    ] = await Promise.all([
      sb
        .from("faixas_etarias")
        .select("id, label, idade_min")
        .gte("idade_min", 10)
        .order("id"),
      contar(cont().lt("primeiro_contato_em", ateUtc)),
      contar(cont().lt("primeiro_contato_em", deUtc)),
      contar(
        cont().lt("primeiro_contato_em", ateUtc).is("ouvinte_completo", true),
      ),
      contar(
        cont()
          .gte("primeiro_contato_em", deUtc)
          .lt("primeiro_contato_em", ateUtc),
      ),
      contar(
        cont()
          .gte("primeiro_contato_em", deAntUtc)
          .lt("primeiro_contato_em", deUtc),
      ),
      contar(cont().gte("ultimo_contato_em", semanaUtc)),
      contar(
        sb
          .from("hotlink_cliques")
          .select("id", { count: "exact", head: true })
          .gte("criado_em", deUtc)
          .lt("criado_em", ateUtc),
      ),
      contar(
        sb
          .from("hotlink_cliques")
          .select("id", { count: "exact", head: true })
          .gte("criado_em", deUtc)
          .lt("criado_em", ateUtc)
          .eq("convertido", true),
      ),
      // PEDIDO DE MUSICA vem de `musicas` (sentimento "ama" com titulo), que e
      // onde o bot grava; o bot nao grava musica em `pedidos`.
      (() => {
        let q = sb
          .from("musicas")
          .select("id", { count: "exact", head: true })
          .eq("sentimento", "ama")
          .not("titulo", "is", null)
          .gte("criado_em", deUtc)
          .lt("criado_em", ateUtc);
        if (radioId) q = q.eq("radio_id", radioId);
        return contar(q);
      })(),
      Promise.all(
        Object.keys(PEDIDO_TIPO_LABEL).map(async (tipo) => {
          let q = sb
            .from("pedidos")
            .select("id", { count: "exact", head: true })
            .eq("tipo", tipo)
            .gte("criado_em", deUtc)
            .lt("criado_em", ateUtc);
          if (radioId) q = q.eq("radio_id", radioId);
          return [tipo, await contar(q)] as [string, number];
        }),
      ),
      carregarTudo<{ primeiro_contato_em: string }>((i, f, c) =>
        sb
          .from("ouvintes")
          .select("primeiro_contato_em", c ? { count: "exact" } : undefined)
          .not("consentimento_em", "is", null)
          .gte("primeiro_contato_em", deAntUtc)
          .lt("primeiro_contato_em", ateUtc)
          .order("id")
          .range(i, f),
      ),
      carregarTudo<OuvinteEmbed & { programa_locutor: string | null }>(
        (i, f, c) =>
          sb
            .from("ouvintes")
            .select(
              "id, nome, bairro, zona, cidade, estado, idade, data_nascimento, numero, consentimento_em, estilo_musical, programa_locutor, faixa_etaria, primeiro_contato_em, musicas(sentimento, artista, titulo, nome)",
              c ? { count: "exact" } : undefined,
            )
            .not("consentimento_em", "is", null)
            .gte("primeiro_contato_em", deUtc)
            .lt("primeiro_contato_em", ateUtc)
            .order("id")
            .range(i, f),
      ),
      carregarTudo<{ promocao_nome: string | null; ouvinte_id: string | null }>(
        (i, f, c) => {
          let q = sb
            .from("promocao_participacoes")
            .select(
              "promocao_nome, ouvinte_id",
              c ? { count: "exact" } : undefined,
            )
            .gte("criado_em", deUtc)
            .lt("criado_em", ateUtc)
            .order("id")
            .range(i, f);
          if (radioId) q = q.eq("radio_id", radioId);
          return q;
        },
      ),
    ]);

    const faixas = (faixasRows ?? []).map((x) => ({
      id: x.id as number,
      label: x.label as string,
    }));

    // Secoes 03 a 06: cadastros completos que chegaram no periodo.
    const completosPer = periodoRows.filter((o) => ouvinteCompleto(o));
    const faixaCount = new Map<number, number>();
    const zonasL: string[] = [];
    const bairrosL: string[] = [];
    const cidadesL: string[] = [];
    const estilosL: string[] = [];
    const artistasL: string[] = [];
    const programasL: string[] = [];
    const musicasMap = new Map<string, ItemMusica>();
    let somaIdade = 0;
    let comIdade = 0;
    for (const o of completosPer) {
      if (o.faixa_etaria != null) {
        faixaCount.set(
          o.faixa_etaria,
          (faixaCount.get(o.faixa_etaria) ?? 0) + 1,
        );
      }
      if (o.idade != null) {
        somaIdade += o.idade;
        comIdade += 1;
      }
      if (o.zona) zonasL.push(o.zona);
      if (o.bairro) bairrosL.push(o.bairro);
      if (o.cidade) cidadesL.push(o.cidade);
      if (o.estilo_musical) estilosL.push(o.estilo_musical);
      if (o.programa_locutor) programasL.push(o.programa_locutor);
      for (const m of o.musicas ?? []) {
        if (m.sentimento !== "ama") continue;
        if (m.artista) artistasL.push(m.artista);
        if (m.titulo) {
          const chave = `${m.titulo}|${m.artista ?? ""}`
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "");
          const cur = musicasMap.get(chave);
          if (cur) cur.valor += 1;
          else
            musicasMap.set(chave, {
              label: m.titulo,
              sub: m.artista,
              valor: 1,
            });
        }
      }
    }
    const distribuicao = faixas
      .map((x) => ({ label: x.label, valor: faixaCount.get(x.id) ?? 0 }))
      .filter((x) => x.valor > 0);
    const totalFaixa = distribuicao.reduce((a, x) => a + x.valor, 0);
    const maisComum =
      distribuicao.length > 0
        ? distribuicao.reduce((a, x) => (x.valor > a.valor ? x : a)).label
        : null;

    const grupos = agruparPromocoes(
      promoRows.map((r) => ({
        ouvinteId: r.ouvinte_id ?? "",
        raw: r.promocao_nome ?? "",
        criadoEm: null,
      })),
    );
    const participantes = new Set(
      promoRows.map((r) => r.ouvinte_id).filter(Boolean),
    ).size;

    const porTipo = porTipoContagens
      .filter(([, n]) => n > 0)
      .map(([tipo, n]) => ({
        label: PEDIDO_TIPO_LABEL[tipo] ?? tipo,
        valor: n,
      }))
      .sort((a, b) => b.valor - a.valor);
    const recados = porTipoContagens
      .filter(([tipo]) => TIPOS_RECADO.includes(tipo))
      .reduce((a, [, n]) => a + n, 0);

    return {
      configurado: true,
      de,
      ate,
      geradoEm: new Date().toISOString(),
      base,
      baseInicio,
      completos,
      novos,
      novosAnterior,
      dias: diasEntre(de, ate) + 1,
      serie: montarSerie(
        timestamps.map((t) => t.primeiro_contato_em),
        de,
        ate,
        ant.de,
      ),
      completosNoPeriodo: completosPer.length,
      faixa: {
        distribuicao,
        concentracao: concentracaoFaixas(distribuicao, totalFaixa),
        idadeMedia: comIdade > 0 ? Math.round(somaIdade / comIdade) : null,
        maisComum,
      },
      zonas: ranking(zonasL, 6),
      bairros: ranking(bairrosL, 6),
      cidades: ranking(cidadesL, 5),
      estilos: ranking(estilosL, 6),
      artistas: ranking(artistasL, 6),
      musicas: Array.from(musicasMap.values())
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 6),
      programas: ranking(programasL, 5),
      promocao: {
        participantes,
        promocoes: grupos.length,
        maiorAdesao: grupos[0]
          ? { label: grupos[0].label, participantes: grupos[0].ouvintes.size }
          : null,
      },
      pedidos: { musica: pedidosMusica, recados, porTipo },
      ativosSemana,
      hotlink: {
        acessos,
        conversoes,
        taxa: acessos > 0 ? Math.round((1000 * conversoes) / acessos) / 10 : 0,
      },
    };
  } catch (e) {
    console.error("[getVisaoGeral] falhou:", e);
    return visaoVazia(de, ate);
  }
}
