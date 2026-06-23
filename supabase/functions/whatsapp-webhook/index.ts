// OuvintePro - webhook "ao receber" da Z-API.
// Recebe mensagens do WhatsApp da radio, roda a maquina de estados de cadastro,
// grava nas tabelas e responde a proxima pergunta pela Z-API.
// Tom: simpatico, direto e transparente. Sem fingir ser humano, sem disparo em massa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash-lite"; // se der 404 algum dia, tentar "gemini-flash-lite-latest"

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

// Chama o Gemini esperando JSON puro de volta. Retorna null em qualquer falha.
// Da uma segunda tentativa em falha transitoria (429 ou 5xx) antes de desistir.
async function geminiJSON<T>(prompt: string, tentativas = 2): Promise<T | null> {
  if (!GEMINI_API_KEY) return null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      });
      if (!res.ok) {
        console.error(`Gemini falhou: status=${res.status} (tentativa ${i + 1})`);
        if ((res.status === 429 || res.status >= 500) && i < tentativas - 1) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        return null;
      }
      const data = await res.json();
      const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!txt) return null;
      return JSON.parse(txt) as T;
    } catch (e) {
      console.error(`Gemini excecao (tentativa ${i + 1}): ${e}`);
      if (i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      return null;
    }
  }
  return null;
}

// Retorna ate 4 candidatos distintos {artista, titulo}, iTunes + Deezer, sem chave.
async function buscarCandidatos(
  termo: string,
  n = 5,
): Promise<{ artista: string; titulo: string }[]> {
  const q = termo.trim();
  if (!q) return [];
  const out: { artista: string; titulo: string }[] = [];
  const push = (a?: string, t?: string) => {
    if (!a || !t) return;
    const dup = out.some(
      (x) =>
        normalizarSemAcento(x.artista) === normalizarSemAcento(a) &&
        normalizarSemAcento(x.titulo) === normalizarSemAcento(t),
    );
    if (!dup) out.push({ artista: a, titulo: t });
  };
  try {
    const u =
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&media=music&entity=song&limit=${n}&lang=pt_br`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      for (const h of (j?.results ?? [])) push(h.artistName, h.trackName);
    }
  } catch (_) { /* ignora */ }
  if (out.length < 2) {
    try {
      const u = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${n}`;
      const r = await fetch(u);
      if (r.ok) {
        const j = await r.json();
        for (const h of (j?.data ?? [])) push(h?.artist?.name, h?.title);
      }
    } catch (_) { /* ignora */ }
  }
  return out.slice(0, 4);
}

// Detecta se o termo e um ARTISTA e devolve ate 4 musicas dele (iTunes -> Deezer).
async function buscarArtistaeMusicas(
  termo: string,
): Promise<
  { artista: string; faixas: { artista: string; titulo: string }[] } | null
> {
  const q = termo.trim();
  if (!q) return null;
  // iTunes: acha o artista e depois as musicas dele.
  try {
    const ua =
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&entity=musicArtist&limit=1&lang=pt_br`;
    const ra = await fetch(ua);
    if (ra.ok) {
      const ja = await ra.json();
      const art = ja?.results?.[0];
      if (art?.artistId && art?.artistName) {
        const ul =
          `https://itunes.apple.com/lookup?id=${art.artistId}&country=BR&entity=song&limit=12`;
        const rl = await fetch(ul);
        if (rl.ok) {
          const jl = await rl.json();
          const faixas: { artista: string; titulo: string }[] = [];
          for (const it of (jl?.results ?? [])) {
            if (it?.wrapperType === "track" && it?.trackName) {
              const dup = faixas.some((f) =>
                normalizarSemAcento(f.titulo) === normalizarSemAcento(it.trackName)
              );
              if (!dup) faixas.push({ artista: art.artistName, titulo: it.trackName });
            }
          }
          if (faixas.length) {
            return { artista: art.artistName, faixas: faixas.slice(0, 4) };
          }
        }
      }
    }
  } catch (_) { /* ignora */ }
  // Deezer fallback.
  try {
    const ua = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=1`;
    const ra = await fetch(ua);
    if (ra.ok) {
      const ja = await ra.json();
      const art = ja?.data?.[0];
      if (art?.id && art?.name) {
        const rt = await fetch(`https://api.deezer.com/artist/${art.id}/top?limit=8`);
        if (rt.ok) {
          const jt = await rt.json();
          const faixas: { artista: string; titulo: string }[] = [];
          for (const it of (jt?.data ?? [])) {
            if (it?.title) {
              const dup = faixas.some((f) =>
                normalizarSemAcento(f.titulo) === normalizarSemAcento(it.title)
              );
              if (!dup) faixas.push({ artista: art.name, titulo: it.title });
            }
          }
          if (faixas.length) {
            return { artista: art.name, faixas: faixas.slice(0, 4) };
          }
        }
      }
    }
  } catch (_) { /* ignora */ }
  return null;
}

// So dispara o caminho de artista quando o termo e exatamente o nome do artista.
function pareceArtista(termo: string, artista: string): boolean {
  const t = normalizarSemAcento(termo);
  const a = normalizarSemAcento(artista);
  return !!t && t === a;
}

// Normaliza pra chave de apelido (sem acento, minusculo, espacos colapsados).
function normaliza(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

// Resolve nome de radio concorrente pela tabela de apelidos (deterministico).
async function resolverRadio(texto: string): Promise<string> {
  const n = normaliza(texto);
  const { data } = await db.from("radios_alias").select("nome_canonico").eq(
    "alias_normalizado",
    n,
  ).maybeSingle();
  if (data?.nome_canonico) return data.nome_canonico as string;
  // Fallback: title case do que o ouvinte escreveu (agrupa por esse texto).
  return texto.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Interpreta data de nascimento em texto livre. Retorna ISO AAAA-MM-DD ou null.
async function interpretarData(texto: string): Promise<string | null> {
  const prompt = `
O ouvinte respondeu a data de nascimento em texto livre, que pode estar por extenso, abreviada, com ou sem separadores, ou com erros.
Converta para o formato ISO AAAA-MM-DD. Se vier so o ano, use 01-01 para dia e mes. Se for impossivel identificar uma data, retorne null.
Sempre devolva os nomes na grafia oficial com acentuação correta do português, por exemplo Marília Mendonça, Evidências, São Paulo, Tatuapé.
Responda APENAS com JSON, sem texto fora do JSON: {"iso":"AAAA-MM-DD ou null"}
Resposta do ouvinte: """${texto}"""
`;
  const out = await geminiJSON<{ iso: string | null }>(prompt);
  const iso = out?.iso ?? null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

// Interpreta bairro de Sao Paulo capital e devolve forma canonica + zona.
async function interpretarBairro(
  texto: string,
): Promise<{ bairro: string; zona: string } | null> {
  const prompt = `
O ouvinte informou em qual bairro da cidade de Sao Paulo (capital) ele esta, em texto informal e possivelmente com erros de grafia.
Identifique o bairro na forma canonica e a zona da cidade: uma de "Norte", "Sul", "Leste", "Oeste", "Centro".
Conheca apelidos e formas curtas (ex.: "Sao Miguel" e Sao Miguel Paulista, na Zona Leste).
Se nao reconhecer como bairro de Sao Paulo capital, use zona "Outras".
Sempre devolva os nomes na grafia oficial com acentuação correta do português, por exemplo Marília Mendonça, Evidências, São Paulo, Tatuapé.
Nao invente. Responda APENAS com JSON, sem texto fora do JSON:
{"bairro":"Forma Canonica","zona":"Norte|Sul|Leste|Oeste|Centro|Outras"}
Resposta do ouvinte: """${texto}"""
`;
  return await geminiJSON<{ bairro: string; zona: string }>(prompt);
}

// Grava uma musica canonica e devolve o id inserido (ou null).
async function gravarMusica(
  radioId: string,
  ouvinteId: string,
  sentimento: "ama" | "rejeita",
  artista: string | null,
  titulo: string | null,
  textoOriginal: string,
): Promise<string | null> {
  const { data } = await db.from("musicas").insert({
    radio_id: radioId,
    ouvinte_id: ouvinteId,
    sentimento,
    artista,
    titulo,
    texto_original: textoOriginal,
    // mantem a coluna "nome" preenchida pra compatibilidade: titulo, senao artista, senao cru
    nome: titulo ?? artista ?? textoOriginal,
  }).select("id").single();
  return (data?.id as string) ?? null;
}

// Janela de sessao: depois desse silencio, a proxima mensagem reinicia a coleta.
const JANELA_MS = 5 * 60 * 1000;

function escolher(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Variacoes pra nao repetir sempre a mesma frase.
const FALLBACK_MIDIA = [
  "Recebi sua mensagem! Por aqui eu só consigo ler texto. Pode me escrever a resposta?",
  "Opa! Esse tipo de arquivo eu ainda não leio. Me manda por texto que eu sigo com você.",
  "Valeu por mandar! Mas eu só entendo texto por enquanto. Pode digitar pra mim?",
  "Recebi! Só que eu leio mesmo é mensagem de texto. Me conta por escrito?",
];

async function sendText(phone: string, message: string) {
  // delayTyping (1-15s) faz a Z-API mostrar "Digitando..." antes de entregar.
  const delayTyping = Math.min(4, Math.max(2, Math.round(message.length / 60)));
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone, message, delayTyping }),
  });
  // Confere a resposta da Z-API e loga quando nao for 2xx (sem interromper o fluxo).
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error(
      `Z-API send-text falhou: status=${res.status} corpo=${corpo}`,
    );
  }
}

// Envia a resposta e grava a mensagem enviada.
async function reply(
  phone: string,
  conversaId: string,
  radioId: string,
  message: string,
) {
  await sendText(phone, message);
  await db.from("mensagens").insert({
    conversa_id: conversaId,
    radio_id: radioId,
    direcao: "enviada",
    tipo: "texto",
    conteudo: message,
  });
}

// Separa itens por quebra de linha, virgula, ponto-e-virgula ou barra.
// NUNCA por " e " (nao quebra "Edson e Hudson", "Vitor e Leo"). Max 5 itens.
function splitLista(texto: string): string[] {
  return texto
    .split(/[\n,;/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
}

// Title case em portugues, mantendo particulas em minusculo (exceto na 1a palavra).
const PARTICULAS = new Set([
  "de", "da", "do", "das", "dos", "e", "di", "du", "dal", "del", "della",
  "van", "von", "y",
]);
function titleCasePtBr(texto: string): string {
  const limpo = texto.trim().replace(/\s+/g, " ").toLowerCase();
  if (!limpo) return texto.trim();
  return limpo
    .split(" ")
    .map((palavra, i) => {
      if (i > 0 && PARTICULAS.has(palavra)) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    })
    .join(" ");
}

// Remove prefixos comuns antes do nome ("meu nome e", "me chamo", "sou o"...).
function limparPrefixoNome(texto: string): string {
  return texto
    .trim()
    .replace(
      /^(meu nome (é|eh|e)|me chamo|eu sou o|eu sou a|eu sou|sou o|sou a|sou|aqui (é|eh|e)|pode chamar de)\s+/i,
      "",
    )
    .trim();
}

// Mensagens que sao cumprimento/ruido e nunca devem ser gravadas como nome.
const SAUDACOES_NAO_NOME = new Set([
  "oi", "ola", "alo", "opa", "salve", "hey", "hi", "hello",
  "bom dia", "boa tarde", "boa noite", "boa madrugada",
  "e ai", "eai", "eae", "fala", "fala ai",
  "tudo bem", "tudo bom", "td bem", "td bom", "tudo certo", "tudo otimo",
  "blz", "beleza", "suave", "de boa",
  "sim", "nao", "ok", "okay", "entao", "entendi", "certo", "uai",
  "kk", "kkk", "kkkk", "rs", "rsrs", "haha", "hahaha", "hehe",
  "oi tudo bem", "ola tudo bem", "oi bom dia", "quem e voce", "quem e",
]);

// Remove uma saudacao no inicio da frase (oi, ola, opa, bom dia...) pra sobrar o nome.
function removerSaudacaoInicial(texto: string): string {
  let t = texto.trim().replace(/^[\s,.!?-]+/, "");
  const padrao =
    /^(oi|ol[aá]|al[oô]|opa|salve|e a[ií]|eai|eae|fala|hey|hi|hello|bom dia|boa tarde|boa noite)\b[\s,!.\-]*/i;
  t = t.replace(padrao, "").trim();
  return t;
}

// Normaliza pra comparacao sem acento e sem caixa.
function normalizarSemAcento(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Aceita DD/MM/AAAA, DD-MM-AAAA, DD/MM/AA, com espaco, ou sem separador (8 ou 6 digitos).
function parseAniversario(texto: string): string | null {
  const t = texto.trim();
  let m: RegExpMatchArray | null = t.match(
    /^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{2,4})$/,
  );
  if (!m) {
    const d = t.replace(/\D/g, "");
    if (d.length === 8) {
      m = [t, d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)] as RegExpMatchArray;
    } else if (d.length === 6) {
      m = [t, d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)] as RegExpMatchArray;
    }
  }
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  let ano = parseInt(m[3], 10);
  if (m[3].length === 2) ano += ano <= 25 ? 2000 : 1900;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const dt = new Date(Date.UTC(ano, mes - 1, dia));
  if (dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function calcularIdade(iso: string): number {
  const nasc = new Date(iso);
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const m = hoje.getUTCMonth() - nasc.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < nasc.getUTCDate())) idade--;
  return idade;
}

// Desfaz a ultima resposta gravada (usado quando o ouvinte corrige).
async function desfazerUltimo(
  ouvinteId: string,
  ultimo: { etapa?: string; ids?: string[] } | null | undefined,
) {
  if (!ultimo?.etapa) return;
  switch (ultimo.etapa) {
    case "nome":
      await db.from("ouvintes").update({ nome: null }).eq("id", ouvinteId);
      break;
    case "bairro":
      await db.from("ouvintes").update({ bairro: null, zona: null }).eq(
        "id",
        ouvinteId,
      );
      break;
    case "cidade":
      await db.from("ouvintes").update({ cidade: null, estado: null }).eq(
        "id",
        ouvinteId,
      );
      break;
    case "aniversario":
    case "ano_nascimento":
      await db.from("ouvintes").update({
        data_nascimento: null,
        idade: null,
        faixa_etaria: null,
      }).eq("id", ouvinteId);
      break;
    case "musicas_ama":
    case "musicas_rejeita":
    case "musica_pendente":
      if (ultimo.ids?.length) {
        await db.from("musicas").delete().in("id", ultimo.ids);
      }
      break;
    case "outras_radios":
      if (ultimo.ids?.length) {
        await db.from("radios_concorrentes").delete().in("id", ultimo.ids);
      }
      break;
  }
}

// Texto da pergunta de cada etapa (pra repergunta em correcao/conversa).
function perguntaDaEtapa(
  etapa: string,
  _ouvinte: { nome?: string | null },
  _ddd: string,
  _radioNome: string,
): string {
  switch (etapa) {
    case "nome":
      return "Pode me falar seu nome completo pra gente te cadastrar nas promoções?";
    case "sobrenome":
      return "Pode me passar seu nome completo, com sobrenome?";
    case "aniversario":
      return "Pode me passar sua data de nascimento, no formato dia/mês/ano?";
    case "ano_nascimento":
      return "Qual ano você nasceu? (ex: 1990)";
    case "cidade":
      return "Em qual cidade você mora?";
    case "bairro":
      return "E em qual bairro?";
    case "outros_estilos":
      return "E quais outros estilos você gosta de ouvir?";
    case "pedido_musica":
      return "Quer pedir uma música?";
    case "pedido_musica_nome":
      return "Qual música você quer pedir?";
    case "musicas_rejeita":
      return `Tem alguma música que toca aqui na ${RADIO_LABEL} que você não gosta?`;
    case "estilo_musical":
      return "Qual é o estilo musical que você mais gosta?";
    case "radio_troca":
      return "Quando toca uma música que você não curte, você muda pra qual rádio?";
    case "programa_locutor":
      return `Tem algum programa ou locutor aqui na ${RADIO_LABEL} que você mais gosta?`;
    default:
      return "Pode me contar?";
  }
}

type Intencao = {
  intencao: "resposta" | "correcao" | "conversa";
  tipo_correcao: "gosto" | "nao_gosto" | null;
};

// Classifica se a mensagem do ouvinte e resposta, correcao ou conversa.
async function classificarIntencao(
  pergunta: string,
  texto: string,
): Promise<Intencao | null> {
  const prompt = `
Você é o cérebro de um atendimento de rádio por WhatsApp. O bot acabou de perguntar ao ouvinte: "${pergunta}".
O ouvinte respondeu: """${texto}""".
Classifique a mensagem do ouvinte em uma de três intenções:
- "resposta": ele está respondendo a pergunta normalmente.
- "correcao": ele está dizendo que o bot entendeu errado, ou corrigindo algo anterior (ex.: "não é isso", "você entendeu errado", "na verdade eu gosto", "é Tatuapé, não Santana").
- "conversa": ele fez uma pergunta, comentário ou brincadeira que não é resposta direta (ex.: "por que você quer saber?", "kkkk", "quem é você?").
Se a mensagem puder ser uma resposta válida à pergunta, prefira "resposta".
Se for "correcao" sobre gostar ou não de música, defina tipo_correcao como "gosto" ou "nao_gosto"; caso contrário, null.
Responda APENAS com JSON, sem texto fora do JSON:
{"intencao":"resposta|correcao|conversa","tipo_correcao":"gosto|nao_gosto ou null"}
`;
  return await geminiJSON<Intencao>(prompt);
}

// Identidade fixa da Nativa FM.
const RADIO_LABEL = "Nativa FM";
const INSTAGRAM_URL = "https://www.instagram.com/nativa/";

// Respostas que significam "nao tem / pular".
const NEGATIVAS = new Set([
  "nao", "n", "nao tem", "nao tenho", "nenhuma", "nenhum", "nada", "nem uma",
  "nem um", "nao quero", "agora nao", "depois", "deixa", "deixa pra la",
  "to de boa", "nao obrigado", "gosto de todas", "gosto de tudo", "todas",
  "nao mudo", "fico aqui", "fico na nativa",
]);

// Respostas que significam "sim" (sem dizer a musica).
const AFIRMATIVAS = new Set([
  "sim", "s", "quero", "quero sim", "claro", "pode ser", "bora", "aceito",
  "vai", "com certeza", "uhum", "aham", "pode", "manda", "quero pedir",
]);

// Cidade da Grande SP (fora da capital). Retorna o nome canonico ou null.
async function resolverGrandeSP(texto: string): Promise<string | null> {
  const alvo = normalizarSemAcento(texto);
  const { data } = await db.from("cidades_grande_sp").select(
    "nome, nome_normalizado",
  );
  const achou = (data ?? []).find((c) =>
    (c.nome_normalizado as string) === alvo
  );
  return achou ? (achou.nome as string) : null;
}

// Detecta declaracao de nome novo ("meu nome e X", "me chamo X", "sou o X").
function extrairNomeDeclarado(texto: string): string | null {
  const m = texto.trim().match(
    /(?:meu nome (?:é|eh|e)|me chamo|pode chamar de|sou o|sou a|eu sou)\s+(.{2,})/i,
  );
  if (!m) return null;
  const nome = titleCasePtBr(m[1].replace(/[.!?]+$/, "").trim());
  return nome || null;
}

Deno.serve(async (req: Request) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  const fromMe = body.fromMe === true;
  const isGroup = body.isGroup === true;
  const isStatusReply = body.isStatusReply === true;
  const isReaction = body.reaction != null || body.type === "ReactionCallback";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const instanceId = typeof body.instanceId === "string" ? body.instanceId : "";
  const texto =
    (body.text as { message?: string } | undefined)?.message?.trim() ?? "";
  const audioUrl = (body.audio as { audioUrl?: string } | undefined)?.audioUrl;
  const isAudio = !!audioUrl;
  const isTexto = texto.length > 0;
  // Qualquer outra midia (imagem, video, documento, figurinha, localizacao, contato).
  const isMidia = !isAudio && !isTexto;

  // 1. Ignora apenas: mensagens proprias, de grupo, reacoes e respostas de status.
  if (fromMe || isGroup || isStatusReply || isReaction || !phone) {
    return new Response("ok", { status: 200 });
  }

  // 1b. Idempotencia: ignora entrega duplicada da Z-API (mesmo messageId).
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  if (messageId) {
    const { error } = await db
      .from("webhook_dedup")
      .insert({ message_id: messageId });
    if (error) {
      if (error.code === "23505") {
        // entrega duplicada: ja processamos essa mensagem, ignora.
        return new Response("ok", { status: 200 });
      }
      console.error(`dedup erro: ${error.code} ${error.message}`);
    }
  }

  // 2. Identifica a radio pelo instanceId (fallback: unica radio ativa na v1).
  let { data: radio } = await db
    .from("radios")
    .select("id, nome")
    .eq("zapi_instance_id", instanceId)
    .eq("ativo", true)
    .maybeSingle();
  if (!radio) {
    const { data: unica } = await db
      .from("radios")
      .select("id, nome")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    radio = unica;
  }
  if (!radio) return new Response("ok", { status: 200 });
  const radioId = radio.id as string;
  const radioNome = radio.nome as string;

  // 3. Acha ou cria o ouvinte. DDD = 2 digitos apos o 55 (formato 55DD9........).
  const ddd = phone.startsWith("55") ? phone.slice(2, 4) : phone.slice(0, 2);
  let { data: ouvinte } = await db
    .from("ouvintes")
    .select("*")
    .eq("radio_id", radioId)
    .eq("telefone", phone)
    .maybeSingle();
  if (!ouvinte) {
    const { data: novo } = await db
      .from("ouvintes")
      .insert({ radio_id: radioId, telefone: phone, ddd })
      .select("*")
      .single();
    ouvinte = novo;
  }
  if (!ouvinte) return new Response("ok", { status: 200 });
  const ouvinteId = ouvinte.id as string;
  await db
    .from("ouvintes")
    .update({ ultimo_contato_em: new Date().toISOString() })
    .eq("id", ouvinteId);

  // Fala usa so o primeiro nome (informal); o banco guarda o nome completo.
  const primeiroNome = (ouvinte.nome ?? "").trim().split(/\s+/)[0] ||
    (ouvinte.nome ?? "");

  // 4. Janela de sessao: acha a conversa mais recente ANTES de atualizar atividade.
  const { data: recente } = await db
    .from("conversas")
    .select("*")
    .eq("ouvinte_id", ouvinteId)
    .order("ultima_atividade_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const aberta = recente && recente.status === "aberta" ? recente : null;
  const intervaloMs = recente
    ? Date.now() - new Date(recente.ultima_atividade_em as string).getTime()
    : Infinity;

  let conversa = aberta;
  // Continua a conversa aberta so se a ultima atividade foi dentro da janela.
  if (!aberta || intervaloMs > JANELA_MS) {
    // Nova rodada. Encerra conversa aberta antiga parada, se houver.
    if (aberta) {
      await db
        .from("conversas")
        .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
        .eq("id", aberta.id);
    }
    // Ja tem nome: reinicio (pula o nome). Sem nome: inicio (pede o nome).
    const etapaInicial = ouvinte.nome ? "reinicio" : "inicio";
    const { data: nova } = await db
      .from("conversas")
      .insert({ radio_id: radioId, ouvinte_id: ouvinteId, etapa: etapaInicial })
      .select("*")
      .single();
    conversa = nova;
  }
  if (!conversa) return new Response("ok", { status: 200 });
  const conversaId = conversa.id as string;
  await db
    .from("conversas")
    .update({ ultima_atividade_em: new Date().toISOString() })
    .eq("id", conversaId);

  // Grava a mensagem recebida.
  await db.from("mensagens").insert({
    conversa_id: conversaId,
    radio_id: radioId,
    direcao: "recebida",
    tipo: isAudio ? "audio" : isTexto ? "texto" : "outro",
    conteudo: texto || null,
    audio_url: audioUrl ?? null,
  });

  // 7. Audio na v1: registra e pede para digitar. // TODO: transcrever com Gemini na fase 2.
  if (isAudio) {
    await reply(
      phone,
      conversaId,
      radioId,
      "Recebi seu áudio! Por enquanto eu só consigo ler texto. Pode me responder digitando?",
    );
    return new Response("ok", { status: 200 });
  }

  // Qualquer outra midia: ja registrada como "outro", responde pedindo texto.
  if (isMidia) {
    await reply(phone, conversaId, radioId, escolher(FALLBACK_MIDIA));
    return new Response("ok", { status: 200 });
  }

  // 5. Maquina de estados pela coluna etapa.
  const etapa = conversa.etapa as string;
  const setEtapa = (e: string) =>
    db.from("conversas").update({ etapa: e }).eq("id", conversaId);

  // 5b. Camada de intencao: entende se a mensagem e resposta, correcao ou conversa.
  const ETAPAS_RESPOSTA = new Set([
    "nome",
    "sobrenome",
    "cidade",
    "bairro",
    "aniversario",
    "ano_nascimento",
    "pedido_musica",
    "pedido_musica_nome",
    "musicas_rejeita",
    "estilo_musical",
    "outros_estilos",
    "radio_troca",
    "programa_locutor",
  ]);

  if (isTexto && ETAPAS_RESPOSTA.has(etapa)) {
    const ctxAtual = (conversa.contexto as Record<string, unknown> | null) ?? {};
    const perguntaAtual = perguntaDaEtapa(etapa, ouvinte, ddd, radioNome);

    const intent = await classificarIntencao(perguntaAtual, texto);

    if (intent && intent.intencao === "conversa") {
      const desvio = escolher([
        "Haha, boa! Mas deixa eu focar aqui que é rapidinho.",
        "Show! Bora seguir com o seu cadastro, falta pouco.",
        "Entendi! Pra gente continuar, é só me responder isto:",
        "Boa! Voltando pro cadastro pra não perder sua participação.",
      ]);
      await reply(phone, conversaId, radioId, `${desvio} ${perguntaAtual}`);
      return new Response("ok", { status: 200 });
    }

    if (intent && intent.intencao === "correcao") {
      const ultimo = ctxAtual.ultimo as
        | { etapa?: string; ids?: string[] }
        | undefined;

      // Caso 1: trocar gosto/nao gosto da ultima musica.
      if (
        (intent.tipo_correcao === "gosto" ||
          intent.tipo_correcao === "nao_gosto") &&
        ultimo?.ids?.length
      ) {
        const novo = intent.tipo_correcao === "gosto" ? "ama" : "rejeita";
        await db.from("musicas").update({ sentimento: novo }).in(
          "id",
          ultimo.ids,
        );
        await reply(
          phone,
          conversaId,
          radioId,
          `Corrigido, anotei que você ${
            novo === "ama" ? "gosta" : "não curte"
          }. ${perguntaAtual}`,
        );
        return new Response("ok", { status: 200 });
      }

      // Caso 2: correcao generica. Desfaz a ultima resposta e repergunta a etapa.
      if (ultimo?.etapa) {
        await desfazerUltimo(ouvinteId, ultimo);
        const novoCtx = { ...ctxAtual, ultimo: null };
        await db.from("conversas").update({
          etapa: ultimo.etapa,
          contexto: novoCtx,
        }).eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          `Sem problema, vamos corrigir. ${
            perguntaDaEtapa(ultimo.etapa, ouvinte, ddd, radioNome)
          }`,
        );
        return new Response("ok", { status: 200 });
      }

      // Sem "ultimo" registrado: so repergunta a atual.
      await reply(phone, conversaId, radioId, `Vamos de novo: ${perguntaAtual}`);
      return new Response("ok", { status: 200 });
    }

    // intencao "resposta" (ou classificador indisponivel): segue pro switch normal.
  }

  // Transita pra proxima etapa (ou encerra o pedido com agradecimento no retorno).
  async function avancarPara(proxima: string) {
    if (proxima === "retorno") {
      await db.from("conversas").update({ contexto: null }).eq(
        "id",
        conversaId,
      );
      await setEtapa("retorno");
      await reply(
        phone,
        conversaId,
        radioId,
        `Anotei seu pedido, ${primeiroNome}! Quer pedir mais alguma?`,
      );
      return;
    }
    await db.from("conversas").update({
      contexto: { ultimo: { etapa: "transicao" } },
    }).eq("id", conversaId);
    await setEtapa(proxima);
    await reply(
      phone,
      conversaId,
      radioId,
      perguntaDaEtapa(proxima, ouvinte, ddd, radioNome),
    );
  }

  // Busca a musica. Caminho do cantor (oferece musicas dele) ou do titulo (escolha exata).
  async function iniciarMusica(
    termo: string,
    sentimento: "ama" | "rejeita",
    proxima: string,
    opts: { jaPediuArtista?: boolean; modoArtista?: boolean } = {},
  ) {
    const palavras = termo.trim().split(/\s+/).length;

    // 1) Caminho do CANTOR: termo curto que bate exatamente com um artista, ou refino forcado.
    if (opts.modoArtista || (palavras <= 3 && !opts.jaPediuArtista)) {
      const art = await buscarArtistaeMusicas(termo);
      if (
        art && art.faixas.length &&
        (opts.modoArtista || pareceArtista(termo, art.artista))
      ) {
        const linhas = art.faixas.map((c, i) =>
          `${i + 1}. ${c.artista} - ${c.titulo}`
        ).join("\n");
        await db.from("conversas").update({
          contexto: {
            musica: {
              sentimento,
              proxima,
              candidatos: art.faixas,
              termo,
              artista: art.artista,
              tentativas: 0,
            },
          },
        }).eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          `Achei o cantor ${art.artista}! Qual música dele você quer? Responde com o número:\n${linhas}\n\nSe não for nenhuma, me manda o nome da música.`,
        );
        await setEtapa("musica_escolha");
        return;
      }
    }

    // 2) Caminho do TITULO.
    const cands = await buscarCandidatos(termo);
    if (cands.length === 0) {
      if (!opts.jaPediuArtista) {
        await db.from("conversas").update({
          contexto: { musica: { sentimento, proxima, termo, tentativas: 0 } },
        }).eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          "Hmm, não achei essa música. Me manda o cantor e a música juntos (ex: Daniel, Dia Que Eu Saí de Casa).",
        );
        await setEtapa("musica_artista");
        return;
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "Beleza, deixa essa de lado então.",
      );
      await avancarPara(proxima);
      return;
    }
    if (cands.length === 1) {
      const c = cands[0];
      const id = await gravarMusica(
        radioId,
        ouvinteId,
        sentimento,
        c.artista,
        c.titulo,
        termo,
      );
      await db.from("conversas").update({
        contexto: {
          ultimo: {
            etapa: sentimento === "ama" ? "musicas_ama" : "musicas_rejeita",
            ids: id ? [id] : [],
          },
        },
      }).eq("id", conversaId);
      await avancarPara(proxima);
      return;
    }
    const linhas = cands.map((c, i) => `${i + 1}. ${c.artista} - ${c.titulo}`)
      .join("\n");
    await db.from("conversas").update({
      contexto: {
        musica: { sentimento, proxima, candidatos: cands, termo, tentativas: 0 },
      },
    }).eq("id", conversaId);
    await reply(
      phone,
      conversaId,
      radioId,
      `Achei mais de uma com esse nome. Qual é a sua? Responde com o número:\n${linhas}\n\nSe não for nenhuma, me manda o cantor e a música.`,
    );
    await setEtapa("musica_escolha");
  }

  switch (etapa) {
    case "inicio": {
      await reply(
        phone,
        conversaId,
        radioId,
        `Olá! Tudo bem? Que bom saber que você está com a gente aqui na ${RADIO_LABEL}. Meu nome é Adriana. Pode me falar seu nome completo pra gente te cadastrar nas promoções?`,
      );
      await setEtapa("nome");
      break;
    }

    case "reinicio": {
      await reply(
        phone,
        conversaId,
        radioId,
        `Olá, ${primeiroNome}! Que bom te ver de novo por aqui. Obrigado por continuar ligado na ${RADIO_LABEL}! O que você quer hoje?`,
      );
      await setEtapa("retorno");
      break;
    }

    case "nome": {
      const semSaud = removerSaudacaoInicial(texto);
      const baseNome = limparPrefixoNome(semSaud || texto);
      const chave = normalizarSemAcento(baseNome);
      const soLetras = baseNome.replace(/[^A-Za-zÀ-ÿ]/g, "");
      const naoEhNome = baseNome.trim().length === 0 ||
        SAUDACOES_NAO_NOME.has(chave) || soLetras.length < 2;
      if (naoEhNome) {
        await reply(
          phone,
          conversaId,
          radioId,
          "Antes da gente começar, como você se chama? Pode mandar seu nome completo.",
        );
        break;
      }
      const nomeLimpo = titleCasePtBr(baseNome) || baseNome.trim();
      const partes = nomeLimpo.trim().split(/\s+/);
      const pn = partes[0] || nomeLimpo;
      await db.from("ouvintes").update({ nome: nomeLimpo }).eq("id", ouvinteId);
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: "nome" } },
      }).eq("id", conversaId);
      if (partes.length < 2) {
        await reply(
          phone,
          conversaId,
          radioId,
          `Show, ${pn}! Pode me passar seu nome completo, com sobrenome?`,
        );
        await setEtapa("sobrenome");
        break;
      }
      await reply(
        phone,
        conversaId,
        radioId,
        `Muito legal, ${pn}! Pode me passar sua data de nascimento, no formato dia/mês/ano?`,
      );
      await setEtapa("aniversario");
      break;
    }

    case "sobrenome": {
      const limpo = titleCasePtBr(
        limparPrefixoNome(removerSaudacaoInicial(texto) || texto),
      );
      const soLetras = limpo.replace(/[^A-Za-zÀ-ÿ]/g, "");
      if (!limpo || soLetras.length < 2) {
        await reply(
          phone,
          conversaId,
          radioId,
          "Pode me mandar seu nome completo, com nome e sobrenome?",
        );
        break;
      }
      const atual = (ouvinte.nome ?? "").trim();
      let completo = limpo;
      if (limpo.split(/\s+/).length < 2 && atual) {
        completo = `${atual} ${limpo}`.trim();
      }
      const pn = completo.split(/\s+/)[0] || completo;
      await db.from("ouvintes").update({ nome: completo }).eq("id", ouvinteId);
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: "nome" } },
      }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Muito legal, ${pn}! Pode me passar sua data de nascimento, no formato dia/mês/ano?`,
      );
      await setEtapa("aniversario");
      break;
    }

    case "aniversario": {
      // So dia/mes (duas partes, sem ano): pede so o ano. "27/10/95" NAO cai aqui.
      if (/^\s*\d{1,2}\s*[\/\-.\s]\s*\d{1,2}\s*$/.test(texto)) {
        await db.from("conversas").update({ contexto: null }).eq(
          "id",
          conversaId,
        );
        await reply(
          phone,
          conversaId,
          radioId,
          "Faltou o ano. Em que ano você nasceu? (ex: 1990)",
        );
        await setEtapa("ano_nascimento");
        break;
      }
      let iso = parseAniversario(texto);
      if (!iso) iso = await interpretarData(texto);
      if (!iso) {
        const jaTentou =
          (conversa.contexto as { dataTentativa?: boolean } | null)
            ?.dataTentativa === true;
        if (!jaTentou) {
          const ctx = (conversa.contexto as Record<string, unknown> | null) ??
            {};
          await db.from("conversas").update({
            contexto: { ...ctx, dataTentativa: true },
          }).eq("id", conversaId);
          await reply(
            phone,
            conversaId,
            radioId,
            "Não peguei direito a data. Pode mandar assim, por exemplo: 28/01/1995?",
          );
          break;
        }
        await db.from("conversas").update({ contexto: null }).eq(
          "id",
          conversaId,
        );
        await reply(
          phone,
          conversaId,
          radioId,
          "Não consegui a data completa. Me diz só o ano que você nasceu, por exemplo 1990.",
        );
        await setEtapa("ano_nascimento");
        break;
      }
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: "aniversario" } },
      }).eq("id", conversaId);
      const idade = calcularIdade(iso);
      const { data: faixa } = await db.from("faixas_etarias").select("id")
        .lte("idade_min", idade).or(`idade_max.gte.${idade},idade_max.is.null`)
        .order("id").limit(1).maybeSingle();
      await db.from("ouvintes").update({
        data_nascimento: iso,
        idade,
        faixa_etaria: faixa?.id ?? null,
      }).eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Ótimo, ${primeiroNome}! Em qual cidade você mora?`,
      );
      await setEtapa("cidade");
      break;
    }

    case "ano_nascimento": {
      const m = texto.replace(/\D/g, "");
      let ano = 0;
      if (m.length === 4) ano = parseInt(m, 10);
      else if (m.length === 2) {
        const a = parseInt(m, 10);
        ano = a <= 25 ? 2000 + a : 1900 + a;
      }
      const anoAtual = new Date().getUTCFullYear();
      if (!ano || ano < 1900 || ano > anoAtual) {
        await reply(
          phone,
          conversaId,
          radioId,
          "Só o ano mesmo, com 4 números, tipo 1990. Qual ano você nasceu?",
        );
        break;
      }
      const iso = `${ano}-01-01`;
      const idade = anoAtual - ano;
      const { data: faixa } = await db.from("faixas_etarias").select("id")
        .lte("idade_min", idade).or(`idade_max.gte.${idade},idade_max.is.null`)
        .order("id").limit(1).maybeSingle();
      await db.from("ouvintes").update({
        data_nascimento: iso,
        idade,
        faixa_etaria: faixa?.id ?? null,
      }).eq("id", ouvinteId);
      await db.from("conversas").update({ contexto: null }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Ótimo, ${primeiroNome}! Em qual cidade você mora?`,
      );
      await setEtapa("cidade");
      break;
    }

    case "cidade": {
      const alvo = normalizarSemAcento(texto);
      let cidade = titleCasePtBr(texto);
      let tipo: "capital" | "grandesp" | "outra" = "outra";
      let zona = "Outras";
      if (alvo === "sao paulo" || alvo === "sp") {
        tipo = "capital";
        cidade = "São Paulo";
      } else {
        const c = await resolverGrandeSP(texto);
        if (c) {
          tipo = "grandesp";
          cidade = c;
          zona = c;
        }
      }
      await db.from("ouvintes").update({ cidade }).eq("id", ouvinteId);
      await db.from("conversas").update({
        contexto: { loc: { tipo, zona } },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, "E em qual bairro?");
      await setEtapa("bairro");
      break;
    }

    case "bairro": {
      const loc =
        (conversa.contexto as { loc?: { tipo?: string; zona?: string } } | null)
          ?.loc ?? { tipo: "outra", zona: "Outras" };
      let bairroFinal = titleCasePtBr(texto);
      let zona = loc.zona ?? "Outras";
      if (loc.tipo === "capital") {
        const ia = await interpretarBairro(texto);
        if (ia && ia.bairro && ia.zona && ia.zona !== "Outras") {
          bairroFinal = ia.bairro;
          zona = ia.zona;
        } else {
          const alvo = normalizarSemAcento(texto);
          const { data: seeds } = await db.from("bairros_zonas").select(
            "bairro, zona",
          );
          const achou = (seeds ?? []).find(
            (b) => normalizarSemAcento(b.bairro as string) === alvo,
          );
          if (achou) {
            zona = achou.zona as string;
            if (ia?.bairro) bairroFinal = ia.bairro;
          } else {
            zona = "Outras";
          }
        }
      }
      // grandesp/outra: zona ja vem da cidade (nome da cidade ou "Outras").
      await db.from("ouvintes").update({ bairro: bairroFinal, zona }).eq(
        "id",
        ouvinteId,
      );
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: "bairro" } },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, "Show! Quer pedir uma música?");
      await setEtapa("pedido_musica");
      break;
    }

    case "pedido_musica": {
      const chave = normalizarSemAcento(texto);
      if (NEGATIVAS.has(chave)) {
        await reply(
          phone,
          conversaId,
          radioId,
          `Tranquilo! Tem alguma música que toca aqui na ${RADIO_LABEL} que você não gosta?`,
        );
        await setEtapa("musicas_rejeita");
        break;
      }
      if (AFIRMATIVAS.has(chave)) {
        await reply(phone, conversaId, radioId, "Boa! Qual música você quer pedir?");
        await setEtapa("pedido_musica_nome");
        break;
      }
      await iniciarMusica(texto, "ama", "musicas_rejeita");
      break;
    }

    case "pedido_musica_nome": {
      const chave = normalizarSemAcento(texto);
      if (NEGATIVAS.has(chave)) {
        await reply(
          phone,
          conversaId,
          radioId,
          `Tem alguma música que toca aqui na ${RADIO_LABEL} que você não gosta?`,
        );
        await setEtapa("musicas_rejeita");
        break;
      }
      await iniciarMusica(texto, "ama", "musicas_rejeita");
      break;
    }

    case "musica_escolha": {
      const ctx = (conversa.contexto as {
        musica?: {
          sentimento: "ama" | "rejeita";
          proxima: string;
          candidatos: { artista: string; titulo: string }[];
          termo: string;
          artista?: string;
          tentativas?: number;
        };
      } | null)?.musica;
      if (!ctx?.candidatos?.length) {
        await avancarPara("musicas_rejeita");
        break;
      }

      // Numero valido: grava a opcao escolhida.
      if (/^\s*\d+\s*$/.test(texto)) {
        const num = parseInt(texto.replace(/\D/g, ""), 10);
        if (num >= 1 && num <= ctx.candidatos.length) {
          const c = ctx.candidatos[num - 1];
          const id = await gravarMusica(
            radioId,
            ouvinteId,
            ctx.sentimento,
            c.artista,
            c.titulo,
            c.titulo,
          );
          await db.from("conversas").update({
            contexto: {
              ultimo: {
                etapa: ctx.sentimento === "ama"
                  ? "musicas_ama"
                  : "musicas_rejeita",
                ids: id ? [id] : [],
              },
            },
          }).eq("id", conversaId);
          await avancarPara(ctx.proxima);
          break;
        }
      }

      // Nao mandou numero: NUNCA repete a lista no vazio. Refina ou pede o nome.
      const tent = (ctx.tentativas ?? 0) + 1;

      // Tira a negativa do comeco ("nenhuma dessas", "nao e essa"), mantendo o resto.
      const resto = texto.trim()
        .replace(
          /^(n[aã]o[,\s]+(é|eh|e)?[,\s]*)?(nenhuma|nenhum)(\s+(delas|dessas|dessa|destas|desses))?[,.\s]*/i,
          "",
        )
        .replace(
          /^(n[aã]o[,\s]+(é|eh|e)\s+(essa|esse|essas|esses|isso))[,.\s]*/i,
          "",
        )
        .trim();

      // Limite: depois de muitas tentativas, aceita o que o ouvinte digitou e segue.
      if (tent > 4) {
        const id = await gravarMusica(
          radioId,
          ouvinteId,
          ctx.sentimento,
          ctx.artista ?? null,
          resto || ctx.termo,
          texto,
        );
        await db.from("conversas").update({
          contexto: {
            ultimo: {
              etapa: ctx.sentimento === "ama" ? "musicas_ama" : "musicas_rejeita",
              ids: id ? [id] : [],
            },
          },
        }).eq("id", conversaId);
        await avancarPara(ctx.proxima);
        break;
      }

      // Mencionou o cantor? ("é uma música do Fulano", "do cantor Fulano", "da banda X")
      const mArt = resto.match(
        /(?:m[uú]sica|can[cç][aã]o|cantor|cantora|banda)\s+d[oae]\s+(.+)/i,
      ) || resto.match(/^d[oa]\s+(.+)/i);
      if (mArt && mArt[1] && mArt[1].trim().length >= 2) {
        await iniciarMusica(mArt[1].trim(), ctx.sentimento, ctx.proxima, {
          modoArtista: true,
        });
        break;
      }

      // Mandou um nome (provavelmente a musica): junta com o artista/termo e busca de novo.
      if (resto.length >= 2) {
        const base = ctx.artista ? `${ctx.artista} ${resto}` : resto;
        await iniciarMusica(base, ctx.sentimento, ctx.proxima, {
          jaPediuArtista: true,
        });
        break;
      }

      // Negativa pura, sem nome: pede o nome da musica/cantor (guarda a tentativa).
      await db.from("conversas").update({
        contexto: { musica: { ...ctx, tentativas: tent } },
      }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Sem problema! Me manda o nome da música, ou o cantor e a música juntos (ex: Daniel, Dia Que Eu Saí de Casa).",
      );
      await setEtapa("musica_artista");
      break;
    }

    case "musica_artista": {
      const ctx = (conversa.contexto as {
        musica?: {
          sentimento: "ama" | "rejeita";
          proxima: string;
          termo: string;
          artista?: string;
        };
      } | null)?.musica;
      if (!ctx) {
        await avancarPara("musicas_rejeita");
        break;
      }
      const base = ctx.artista
        ? `${ctx.artista} ${texto}`
        : `${ctx.termo ?? ""} ${texto}`;
      await iniciarMusica(base.trim(), ctx.sentimento, ctx.proxima, {
        jaPediuArtista: true,
      });
      break;
    }

    case "musicas_rejeita": {
      const chave = normalizarSemAcento(texto);
      if (NEGATIVAS.has(chave)) {
        await reply(
          phone,
          conversaId,
          radioId,
          "Entendi! Qual é o estilo musical que você mais gosta?",
        );
        await setEtapa("estilo_musical");
        break;
      }
      await iniciarMusica(texto, "rejeita", "estilo_musical");
      break;
    }

    case "estilo_musical": {
      await db.from("ouvintes").update({ estilo_musical: titleCasePtBr(texto) })
        .eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Boa! E quais outros estilos você gosta de ouvir?",
      );
      await setEtapa("outros_estilos");
      break;
    }

    case "outros_estilos": {
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave)) {
        await db.from("ouvintes").update({
          outros_estilos: titleCasePtBr(texto),
        }).eq("id", ouvinteId);
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "Quando está tocando uma música que você não curte muito, você muda pra qual rádio?",
      );
      await setEtapa("radio_troca");
      break;
    }

    case "radio_troca": {
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave)) {
        for (const item of splitLista(texto)) {
          const nomeCanonico = await resolverRadio(item);
          await db.from("radios_concorrentes").insert({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome_radio: item,
            nome_canonico: nomeCanonico,
          });
        }
      }
      await reply(
        phone,
        conversaId,
        radioId,
        `Show! Tem algum programa ou locutor aqui na ${RADIO_LABEL} que você mais gosta?`,
      );
      await setEtapa("programa_locutor");
      break;
    }

    case "programa_locutor": {
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave)) {
        await db.from("ouvintes").update({
          programa_locutor: titleCasePtBr(texto),
        }).eq("id", ouvinteId);
      }
      await db.from("ouvintes").update({
        participacoes: (ouvinte.participacoes ?? 0) + 1,
      }).eq("id", ouvinteId);
      await setEtapa("concluido");
      await reply(
        phone,
        conversaId,
        radioId,
        `Muito obrigado por participar com a gente aqui na ${RADIO_LABEL}, ${primeiroNome}, e continue com a gente! Clique no link e siga a gente no Instagram: ${INSTAGRAM_URL}`,
      );
      break;
    }

    case "retorno": {
      // Refaz o cadastro SO se a pessoa declarar um nome novo.
      const nomeNovo = extrairNomeDeclarado(texto);
      if (nomeNovo) {
        await db.from("ouvintes").update({ nome: nomeNovo }).eq(
          "id",
          ouvinteId,
        );
        await db.from("conversas").update({
          contexto: { ultimo: { etapa: "nome" } },
        }).eq("id", conversaId);
        const pn = nomeNovo.split(/\s+/)[0] || nomeNovo;
        if (nomeNovo.split(/\s+/).length < 2) {
          await reply(
            phone,
            conversaId,
            radioId,
            `Show, ${pn}! Pode me passar seu nome completo, com sobrenome?`,
          );
          await setEtapa("sobrenome");
        } else {
          await reply(
            phone,
            conversaId,
            radioId,
            `Muito legal, ${pn}! Pode me passar sua data de nascimento, no formato dia/mês/ano?`,
          );
          await setEtapa("aniversario");
        }
        break;
      }
      // Sem nome novo: trata como pedido de musica (escolha exata via iniciarMusica).
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave) && chave.length > 1) {
        await iniciarMusica(texto, "ama", "retorno");
        break;
      }
      await reply(
        phone,
        conversaId,
        radioId,
        `Tô por aqui, ${primeiroNome}! Se quiser pedir uma música é só mandar o nome.`,
      );
      break;
    }

    case "concluido":
    default: {
      await reply(
        phone,
        conversaId,
        radioId,
        ouvinte.nome
          ? `Que bom te ver de novo, ${primeiroNome}! Se quiser pedir uma música é só mandar.`
          : `Obrigado por falar com a ${RADIO_LABEL}!`,
      );
      break;
    }
  }

  return new Response("ok", { status: 200 });
});
