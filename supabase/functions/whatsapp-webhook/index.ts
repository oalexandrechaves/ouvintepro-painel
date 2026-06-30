// OuvintePro - webhook "ao receber" da Z-API.
// Recebe mensagens do WhatsApp da radio, roda a maquina de estados de cadastro,
// grava nas tabelas e responde a proxima pergunta pela Z-API.
// Tom: simpatico, direto e transparente. A IA so atua nos bastidores.
// v37: nao inventa musica/artista (filtro de semelhanca + reconhecido), premio
// cadastrado x novo, fluxo de ajuda, ack de afeto/locutor, transcricao de audio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
// Modelo so para transcricao de audio (aceita audio com seguranca). Free tier.
const GEMINI_AUDIO_MODEL = "gemini-2.5-flash";

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

// Chama o Gemini esperando JSON puro de volta. Retorna null em qualquer falha.
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

// Converte bytes em base64 em blocos (evita estourar a pilha em audios maiores).
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Transcreve um audio do WhatsApp nos bastidores (Gemini). Retorna o texto falado ou null.
// O WhatsApp NAO manda a transcricao no webhook, entao a gente transcreve aqui.
async function transcreverAudio(url: string, mime: string): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`download de audio falhou: status=${r.status}`);
      return null;
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 8_000_000) {
      console.error(`audio grande demais para transcrever: ${bytes.length} bytes`);
      return null;
    }
    const b64 = bytesToB64(bytes);
    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_AUDIO_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text:
                "Transcreva exatamente o que a pessoa falou neste audio, em portugues do Brasil. " +
                "Responda APENAS com o texto falado, sem aspas e sem comentarios. Se nao houver fala, responda vazio.",
            },
            { inlineData: { mimeType: mime || "audio/ogg", data: b64 } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) {
      console.error(`Gemini audio falhou: status=${res.status}`);
      return null;
    }
    const data = await res.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return (typeof txt === "string" && txt.trim()) ? txt.trim() : null;
  } catch (e) {
    console.error(`transcrever audio excecao: ${e}`);
    return null;
  }
}

// Busca 1 musica no catalogo gratuito (sem chave). Prioriza a gravacao mais recente.
async function buscarMusicaCatalogo(
  termo: string,
): Promise<{ artista: string; titulo: string } | null> {
  const q = termo.trim();
  if (!q) return null;
  try {
    const u =
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&media=music&entity=song&limit=10&lang=pt_br`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      const arr = (j?.results ?? []).filter((h: Record<string, unknown>) => h.artistName && h.trackName);
      if (arr.length) {
        arr.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const da = Date.parse((a.releaseDate as string) ?? "") || 0;
          const dbb = Date.parse((b.releaseDate as string) ?? "") || 0;
          return dbb - da;
        });
        return { artista: arr[0].artistName, titulo: arr[0].trackName };
      }
    }
  } catch (_) { /* ignora */ }
  try {
    const u = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      const hit = j?.data?.[0];
      if (hit?.artist?.name && hit?.title) {
        return { artista: hit.artist.name, titulo: hit.title };
      }
    }
  } catch (_) { /* ignora */ }
  return null;
}

// Confirma se um nome corresponde a um artista no catalogo. Retorna o nome canonico ou null.
async function confirmarArtista(termo: string): Promise<string | null> {
  const q = termo.trim();
  if (!q) return null;
  try {
    const u =
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&entity=musicArtist&limit=1&lang=pt_br`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      const art = j?.results?.[0];
      if (art?.artistName) return art.artistName as string;
    }
  } catch (_) { /* ignora */ }
  try {
    const u = `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=1`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      const art = j?.data?.[0];
      if (art?.name) return art.name as string;
    }
  } catch (_) { /* ignora */ }
  return null;
}

// Normaliza pra chave de apelido (sem acento, minusculo, espacos colapsados).
function normaliza(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

// Semelhanca simples entre dois textos (0 a 1). Usa contencao + Jaccard de palavras.
function semelhanca(a: string, b: string): number {
  const limpa = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const na = limpa(a);
  const nb = limpa(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const sa = new Set(na.split(" "));
  const sb = new Set(nb.split(" "));
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  const uni = new Set([...sa, ...sb]).size;
  return uni ? inter / uni : 0;
}

// Resolve nome de radio concorrente pela tabela de apelidos (deterministico).
async function resolverRadio(texto: string): Promise<string> {
  const n = normaliza(texto);
  const { data } = await db.from("radios_alias").select("nome_canonico").eq(
    "alias_normalizado",
    n,
  ).maybeSingle();
  if (data?.nome_canonico) return data.nome_canonico as string;
  return texto.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Interpreta data de nascimento em texto livre. Retorna ISO AAAA-MM-DD ou null.
async function interpretarData(texto: string): Promise<string | null> {
  const prompt = `
O ouvinte respondeu a data de nascimento em texto livre, que pode estar por extenso, abreviada, com ou sem separadores, ou com erros.
Converta para o formato ISO AAAA-MM-DD. Se vier so o ano, use 01-01 para dia e mes. Se for impossivel identificar uma data, retorne null.
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
Nao invente. Responda APENAS com JSON, sem texto fora do JSON:
{"bairro":"Forma Canonica","zona":"Norte|Sul|Leste|Oeste|Centro|Outras"}
Resposta do ouvinte: """${texto}"""
`;
  return await geminiJSON<{ bairro: string; zona: string }>(prompt);
}

// Separa um pedido de musica em titulo e/ou artista. "qualquer" = pedido generico do artista.
// "reconhecido" = false quando a mensagem NAO nomeia musica nem artista de verdade.
type PedidoMusica = {
  titulo: string | null;
  artista: string | null;
  qualquer: boolean;
  reconhecido: boolean;
};
async function interpretarPedidoMusica(texto: string): Promise<PedidoMusica | null> {
  const prompt = `
O ouvinte de uma radio mandou esta mensagem no WhatsApp: """${texto}""".
A intencao geral dele e pedir uma musica. Extraia o titulo da musica e o nome do artista/cantor/banda, se estiverem presentes.
Regras:
- Se a mensagem tiver so o titulo da musica, preencha "titulo" e deixe "artista" null.
- Se tiver so o nome do artista, preencha "artista" e deixe "titulo" null.
- Se tiver os dois (ex: "E o Amor do Zeze di Camargo"), preencha os dois.
- Se o ouvinte pedir QUALQUER musica de um artista (ex: "qualquer uma do Bruno e Marrone", "toca um Bruno e Marrone", "o que tiver do Roberto Carlos"), preencha "artista" e marque "qualquer" como true.
- "reconhecido": marque false quando a mensagem NAO nomeia uma musica nem um artista de verdade. Isso inclui perguntas ("tem musica?", "qual musica?", "quem e?", "que musica?"), comandos genericos sem dizer qual ("pedir musica", "quero musica"), saudacoes, e textos sem sentido ou aleatorios. Nesses casos, titulo e artista devem ser null.
- So marque "reconhecido" como true se houver de fato um nome plausivel de musica OU de artista. Nao invente nomes.
Responda APENAS com JSON, sem texto fora do JSON:
{"titulo":"texto ou null","artista":"texto ou null","qualquer":true ou false,"reconhecido":true ou false}
`;
  return await geminiJSON<PedidoMusica>(prompt);
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
    nome: titulo ?? artista ?? textoOriginal,
  }).select("id").single();
  return (data?.id as string) ?? null;
}

const JANELA_MS = 5 * 60 * 1000;

function escolher(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

const FALLBACK_MIDIA = [
  "Recebi sua mensagem! Por aqui eu só consigo ler texto e áudio. Pode me escrever ou mandar um áudio?",
  "Opa! Esse tipo de arquivo eu ainda não leio. Me manda por texto ou áudio que eu sigo com você.",
  "Valeu por mandar! Mas eu entendo mesmo é texto e áudio por enquanto. Pode digitar pra mim?",
  "Recebi! Só que eu leio mensagem de texto e escuto áudio. Me conta por aí?",
];

function calcularDelayDigitando(message: string): number {
  const segundos = 1.5 + message.length / 28;
  return Math.min(9, Math.max(2, Math.round(segundos)));
}

async function sendText(phone: string, message: string) {
  const delayTyping = calcularDelayDigitando(message);
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone, message, delayTyping }),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    console.error(`Z-API send-text falhou: status=${res.status} corpo=${corpo}`);
  }
}

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

function splitLista(texto: string): string[] {
  return texto
    .split(/[\n,;/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
}

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

function limparPrefixoNome(texto: string): string {
  return texto
    .trim()
    .replace(
      /^(meu nome (é|eh|e)|me chamo|eu sou o|eu sou a|eu sou|sou o|sou a|sou|aqui (é|eh|e)|pode chamar de)\s+/i,
      "",
    )
    .trim();
}

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

function removerSaudacaoInicial(texto: string): string {
  let t = texto.trim().replace(/^[\s,.!?-]+/, "");
  const padrao =
    /^(oi|ol[aá]|al[oô]|opa|salve|e a[ií]|eai|eae|fala|hey|hi|hello|bom dia|boa tarde|boa noite)\b[\s,!.\-]*/i;
  t = t.replace(padrao, "").trim();
  return t;
}

function normalizarSemAcento(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Detecta se a mensagem e so uma pergunta/meta curta (nao e nome de musica/artista).
function pareceMeta(texto: string): boolean {
  const t = normalizarSemAcento(texto);
  if (!t) return true;
  if (/\?\s*$/.test(texto.trim()) && t.split(/\s+/).length <= 4) return true;
  const metas = new Set([
    "qual musica", "que musica", "qual", "quem e", "quem", "como assim",
    "oi", "ola", "opa", "nao entendi", "que isso", "como", "hein", "ne",
    "tem musica", "pedir musica", "musica", "pedir", "que", "ok", "o que",
    "como funciona", "e ai", "eai",
  ]);
  return metas.has(t);
}

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
      await db.from("ouvintes").update({ bairro: null, zona: null }).eq("id", ouvinteId);
      break;
    case "cidade":
      await db.from("ouvintes").update({ cidade: null }).eq("id", ouvinteId);
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
      if (ultimo.ids?.length) {
        await db.from("musicas").delete().in("id", ultimo.ids);
      }
      break;
  }
}

// Texto da pergunta de cada etapa (pra repergunta em correcao/conversa/bloqueio).
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
    case "pedido_musica":
      return "Quer pedir uma música?";
    case "pedido_musica_nome":
      return "Qual música você quer pedir?";
    case "musica_titulo":
      return "Qual é a música que você quer?";
    case "musica_artista":
      return "E quem canta essa música?";
    case "musica_confirma":
      return "É essa mesmo? (responde sim ou não)";
    case "musicas_rejeita":
      return `Tem alguma música que toca aqui na ${RADIO_LABEL} que você não gosta?`;
    case "estilo_musical":
      return "Qual é o estilo musical que você mais gosta?";
    case "outros_estilos":
      return "E quais outros estilos você gosta de ouvir?";
    case "radio_troca":
      return "Quando toca uma música que você não curte, você muda pra qual rádio?";
    case "programa_locutor":
      return `Tem algum programa ou locutor aqui na ${RADIO_LABEL} que você mais gosta?`;
    case "ajuda_descricao":
      return "O que você está precisando? Pode me contar que eu repasso pro nosso time.";
    case "retorno":
      return "Se quiser pedir uma música é só mandar o nome!";
    default:
      return "Se quiser pedir uma música é só mandar o nome!";
  }
}

type Intencao = {
  intencao: "resposta" | "correcao" | "conversa";
  tipo_correcao: "gosto" | "nao_gosto" | null;
};

async function classificarIntencao(
  pergunta: string,
  texto: string,
): Promise<Intencao | null> {
  const prompt = `
Você é o cérebro de um atendimento de rádio por WhatsApp. O bot acabou de perguntar ao ouvinte: "${pergunta}".
O ouvinte respondeu: """${texto}""".
Classifique a mensagem do ouvinte em uma de três intenções:
- "resposta": ele está respondendo a pergunta normalmente.
- "correcao": ele está dizendo que o bot entendeu errado, ou corrigindo algo anterior.
- "conversa": ele fez uma pergunta, comentário ou brincadeira que não é resposta direta.
Se a mensagem puder ser uma resposta válida à pergunta, prefira "resposta".
Se for "correcao" sobre gostar ou não de música, defina tipo_correcao como "gosto" ou "nao_gosto"; caso contrário, null.
Responda APENAS com JSON, sem texto fora do JSON:
{"intencao":"resposta|correcao|conversa","tipo_correcao":"gosto|nao_gosto ou null"}
`;
  return await geminiJSON<Intencao>(prompt);
}

// No retorno (ouvinte ja cadastrado), separa o que a pessoa quer.
type IntencaoRetorno = {
  intencao: "pedido_musica" | "premio" | "ajuda" | "afeto" | "despedida";
  termo_musica: string | null;
  programa_locutor: string | null;
};

async function classificarRetorno(texto: string): Promise<IntencaoRetorno | null> {
  const prompt = `
Você é o cérebro da Adriana, atendente de uma rádio (${RADIO_LABEL}) no WhatsApp.
O ouvinte já é cadastrado e mandou esta mensagem: """${texto}""".
Classifique a intenção dele em UMA destas:
- "pedido_musica": ele está pedindo uma música ou citou um nome de música, cantor ou banda de verdade. NÃO use esta opção se for só uma pergunta tipo "tem música?", "qual música?", "quem é?" ou um comando genérico tipo "pedir música" sem dizer qual. Preencha "termo_musica" SOMENTE se houver um nome plausível de música ou artista; senão, deixe null.
- "premio": ele fala de prêmio, sorteio, promoção, brinde, ganhar algo ou concorrer.
- "ajuda": ele pede ajuda, faz um pedido ou serviço que não é música nem prêmio (ex.: mandar um recado, falar com o locutor, tirar uma dúvida, resolver um problema, uma reclamação que precisa de atendimento humano).
- "afeto": elogio, carinho, saudação, comentário sem ação possível (ex.: "amo a rádio", "vocês são demais", "bom dia", "um abraço", "beijos", "obrigado"). Se ele citar um locutor ou programa preferido, preencha "programa_locutor" com o nome; senão, null.
- "despedida": ele está encerrando ou dizendo que não quer nada agora.
Responda APENAS com JSON, sem texto fora do JSON:
{"intencao":"pedido_musica|premio|ajuda|afeto|despedida","termo_musica":"texto ou null","programa_locutor":"texto ou null"}
`;
  return await geminiJSON<IntencaoRetorno>(prompt);
}

// Identidade fixa da Nativa FM.
const RADIO_LABEL = "Nativa FM";
const INSTAGRAM_URL = "https://www.instagram.com/nativa/";

const NEGATIVAS = new Set([
  "nao", "n", "nao tem", "nao tenho", "nenhuma", "nenhum", "nada", "nem uma",
  "nem um", "nao quero", "agora nao", "depois", "deixa", "deixa pra la",
  "to de boa", "nao obrigado", "gosto de todas", "gosto de tudo", "todas",
  "nao mudo", "fico aqui", "fico na nativa",
]);

const AFIRMATIVAS = new Set([
  "sim", "s", "quero", "quero sim", "claro", "pode ser", "bora", "aceito",
  "vai", "com certeza", "uhum", "aham", "pode", "manda", "quero pedir",
  "isso", "isso mesmo", "e essa", "e ela", "exato", "certo", "perfeito",
]);

const DESPEDIDAS = new Set([
  "tchau", "falou", "flw", "vlw", "valeu", "obrigado", "obrigada", "obg",
  "ate mais", "ate logo", "ate", "por enquanto so", "so isso", "era so isso",
  "nada nao", "nada", "to de boa", "de boa",
]);

// Termos que indicam pergunta sobre premio/promocao (fast-path deterministico).
const TERMOS_PREMIO = [
  "premio", "premios", "premiacao", "sorteio", "sorteios", "sortear",
  "promocao", "promocoes", "brinde", "brindes", "concorrer", "concorre",
  "quero ganhar", "ganhar um", "ganhar uma", "vale presente", "ingresso",
  "ingressos", "vou ganhar",
];
function ehPremio(texto: string): boolean {
  return listaContemTermo(texto, TERMOS_PREMIO);
}

// Resposta de premio para quem JA e cadastrado.
const PREMIO_CADASTRADO = [
  "Pra concorrer aos prêmios da nossa Nativa é só você ficar na nossa escuta. Quando a gente falar pra você participar, você nos manda a mensagem!",
  "Os prêmios da Nativa saem pra quem está na escuta! Fica ligado que, quando for a hora de participar, a gente avisa no ar e você me manda a mensagem.",
];
// Resposta de premio para quem AINDA NAO e cadastrado (puxa o cadastro).
const PREMIO_NOVO =
  "Pra concorrer a prêmios da Nativa FM você precisa participar da nossa pesquisa. Vamos participar? Qual é seu nome completo?";

// Acuse de mensagens de carinho/elogio sem acao possivel.
const ACK_AFETO = [
  "Captei sua mensagem e já repassei pros nossos locutores! Se quiser pedir uma música, é só mandar o nome.",
  "Anotado e repassado pro nosso time de locutores! Quer aproveitar e pedir uma música?",
  "Recebido com carinho! Já deixei o recado com os locutores. Se quiser, posso colocar uma música pra tocar pra você.",
];
// Quando a pessoa diz qual locutor/programa prefere.
const ACK_LOCUTOR = [
  "Que massa! Anotei aqui que você curte o {LOC} e já repassei pro nosso time. Quer pedir uma música?",
  "Boa escolha! Vou registrar que o {LOC} é o seu preferido e avisar a galera. Quer aproveitar e pedir uma música?",
];
// Fluxo de ajuda/pedido que a gente nao faz por aqui.
const AJUDA_PERGUNTA = "Opa! O que você está precisando? Me conta que eu vejo aqui.";
const AJUDA_RESPOSTA = [
  "Entendi! Esse tipo de coisa a gente não costuma fazer por aqui, mas vou repassar pro nosso time interno, tá? Se quiser, posso colocar uma música pra tocar enquanto isso.",
  "Anotei! Não costumamos fazer esse tipo de coisa por aqui, mas vou passar pro nosso time interno dar uma olhada. Quer aproveitar e pedir uma música?",
];
// Quando nao da pra reconhecer a musica/artista (escrito muito errado ou sem sentido).
const MUSICA_NAO_ENTENDI = [
  "Hmm, não saquei qual música é essa. Me manda o nome da música e quem canta, por favor?",
  "Acho que não conheço essa. Me confirma certinho o nome da música e o cantor?",
  "Não consegui identificar a música. Pode mandar o nome dela e o artista?",
];

// Termos de DROGAS bloqueados. Detectados por substring (sozinhos ou no meio).
const TERMOS_DROGAS = [
  "maconha", "cocaina", "crack", "cracudo", "droga", "drogas",
  "baseado", "beck", "haxixe", "lsd", "ecstasy", "mdma", "heroina",
  "metanfetamina", "merla", "lolo", "cheirar po",
];

// Palavroes/ofensas direcionadas. Resposta especifica e mais seca. Lista ampliada.
const TERMOS_OFENSA = [
  "vai se fuder", "vai se foder", "vai si fuder", "vai si foder",
  "va se fuder", "va se foder", "vai se fude", "se fude", "se fuder",
  "se foder", "vai a merda", "vai pra merda", "vai pro inferno",
  "vai pra puta que pariu", "vai tomar no cu", "vai toma no cu",
  "toma no cu", "tomar no cu", "toma no rabo",
  "vai catar coquinho", "vai plantar batata",
  "filho da puta", "filha da puta", "fdp", "fdps",
  "puta que pariu", "pqp", "puta", "puto", "putinha", "putaria",
  "vai pra casa do caralho",
  "cuzao", "cusao", "cuzudo", "cu", "rabo", "buceta", "boceta",
  "piroca", "pica", "rola", "caralho", "caralha", "pinto", "penis",
  "xoxota", "xereca", "ppk", "punheta", "punheteiro", "siririca",
  "porra", "merda", "bosta", "foda", "foda se", "foda-se", "foder",
  "fuder", "fudido", "fudida", "caceta", "cacete",
  "arrombado", "arrombada", "corno", "cornao", "chifrudo", "otario",
  "otaria", "otarios", "babaca", "imbecil", "idiota", "burro", "burra",
  "jumento", "retardado", "retardada", "mongoloide", "mongol",
  "debil", "escroto", "escrota", "nojento", "nojenta", "desgracado",
  "desgracada", "vagabunda", "vagabundo", "vagaba", "safado", "safada",
  "cachorra", "cadela", "piranha", "quenga", "rapariga", "lixo",
  "verme", "trouxa", "palhaco", "ridiculo", "ridicula",
  "viado", "viada", "veado", "bicha", "bixa", "gay", "boiola",
  "baitola", "traveco", "sapatao", "frutinha",
];

const RECUSAS_DROGAS = [
  "Opa, esse assunto eu não consigo ajudar. Mas se quiser pedir uma música, é só me mandar o nome!",
  "Esse tema foge do que eu faço por aqui, então não vou entrar nele. Bora falar de música? Qual você quer ouvir?",
  "Continuo sem poder ajudar com isso, viu? O que eu posso mesmo é tocar uma música boa pra você. Qual vai ser?",
  "De verdade, isso aí não é comigo. Mas tô aqui pra deixar sua música no ar! Me fala o nome que eu anoto.",
  "Segue valendo: nesse assunto eu não entro. Agora, pedir música eu adoro! Qual você quer?",
];

const RECUSAS_OFENSA = [
  "Quanto a isso não posso te responder. Porém, se quiser pedir uma música, só falar.",
  "Isso aí eu vou deixar passar. Mas tô à disposição pra deixar sua música no ar, é só mandar o nome!",
  "Não vou responder a isso, mas sem ressentimento. Se quiser ouvir uma música, é só me dizer qual.",
  "A esse tipo de mensagem eu não respondo, viu? Agora, música boa eu coloco pra tocar! Qual você quer?",
  "Fica tranquilo que eu não levo a mal, mas não vou entrar nessa. Bora de música? Me fala o nome.",
  "Esse papo eu deixo de lado, mas sigo aqui pra te ajudar. Quer pedir uma música? É só falar o nome.",
];

function listaContemTermo(texto: string, lista: string[]): boolean {
  const t = normalizarSemAcento(texto);
  const tEspacos = ` ${t.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const termo of lista) {
    const tn = normalizarSemAcento(termo);
    if (!tn) continue;
    if (tn.includes(" ")) {
      if (t.includes(tn)) return true;
    } else {
      if (tEspacos.includes(` ${tn} `)) return true;
    }
  }
  return false;
}

async function resolverGrandeSP(texto: string): Promise<string | null> {
  const alvo = normalizarSemAcento(texto);
  const { data } = await db.from("cidades_grande_sp").select("nome, nome_normalizado");
  const achou = (data ?? []).find((c) => (c.nome_normalizado as string) === alvo);
  return achou ? (achou.nome as string) : null;
}

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
  let texto =
    (body.text as { message?: string } | undefined)?.message?.trim() ?? "";
  const audioUrl = (body.audio as { audioUrl?: string } | undefined)?.audioUrl;
  const audioMime =
    ((body.audio as { mimeType?: string } | undefined)?.mimeType ?? "audio/ogg")
      .split(";")[0].trim();
  const isAudio = !!audioUrl;
  let isTexto = texto.length > 0;
  const isMidia = !isAudio && !isTexto;

  if (fromMe || isGroup || isStatusReply || isReaction || !phone) {
    return new Response("ok", { status: 200 });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  if (messageId) {
    const { error } = await db
      .from("webhook_dedup")
      .insert({ message_id: messageId });
    if (error) {
      if (error.code === "23505") {
        return new Response("ok", { status: 200 });
      }
      console.error(`dedup erro: ${error.code} ${error.message}`);
    }
  }

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

  const primeiroNome = (ouvinte.nome ?? "").trim().split(/\s+/)[0] ||
    (ouvinte.nome ?? "");

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
  if (!aberta || intervaloMs > JANELA_MS) {
    if (aberta) {
      await db
        .from("conversas")
        .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
        .eq("id", aberta.id);
    }
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

  // Audio: transcreve nos bastidores (Gemini) e segue como se fosse texto.
  // O WhatsApp transcreve so no aparelho de quem recebe; o webhook traz o arquivo, nao o texto.
  let audioFalhou = false;
  if (isAudio && !isTexto) {
    const transcrito = await transcreverAudio(audioUrl!, audioMime);
    if (transcrito && transcrito.length >= 1) {
      texto = transcrito;
      isTexto = true;
    } else {
      audioFalhou = true;
    }
  }

  await db.from("mensagens").insert({
    conversa_id: conversaId,
    radio_id: radioId,
    direcao: "recebida",
    tipo: isAudio ? "audio" : isTexto ? "texto" : "outro",
    conteudo: texto || null,
    audio_url: audioUrl ?? null,
  });

  if (isAudio && audioFalhou) {
    await reply(
      phone,
      conversaId,
      radioId,
      "Recebi seu áudio, mas não consegui entender direito o que você falou. Pode mandar de novo ou me escrever?",
    );
    return new Response("ok", { status: 200 });
  }

  if (isMidia) {
    await reply(phone, conversaId, radioId, escolher(FALLBACK_MIDIA));
    return new Response("ok", { status: 200 });
  }

  const etapa = conversa.etapa as string;
  const setEtapa = (e: string) =>
    db.from("conversas").update({ etapa: e }).eq("id", conversaId);

  // ===== BLOQUEIO GLOBAL: ofensas e drogas em QUALQUER etapa =====
  if (isTexto && etapa !== "inicio" && etapa !== "reinicio") {
    const ehOfensa = listaContemTermo(texto, TERMOS_OFENSA);
    const ehDroga = !ehOfensa && listaContemTermo(texto, TERMOS_DROGAS);
    if (ehOfensa || ehDroga) {
      const ctxB = (conversa.contexto as Record<string, unknown> | null) ?? {};
      const n = (ctxB.bloqueio as number) ?? 0;
      const lista = ehOfensa ? RECUSAS_OFENSA : RECUSAS_DROGAS;
      const recusa = lista[Math.min(n, lista.length - 1)];
      await db.from("conversas").update({
        contexto: { ...ctxB, bloqueio: n + 1 },
      }).eq("id", conversaId);
      const pendente = perguntaDaEtapa(etapa, ouvinte, ddd, radioNome);
      await reply(phone, conversaId, radioId, `${recusa} ${pendente}`);
      return new Response("ok", { status: 200 });
    }
  }

  async function avancarPara(proxima: string) {
    if (proxima === "retorno") {
      await db.from("conversas").update({ contexto: null }).eq("id", conversaId);
      await setEtapa("retorno");
      await reply(
        phone,
        conversaId,
        radioId,
        `Anotei seu pedido, ${primeiroNome}! Quer pedir mais alguma?`,
      );
      return;
    }
    await setEtapa(proxima);
    await reply(
      phone,
      conversaId,
      radioId,
      perguntaDaEtapa(proxima, ouvinte, ddd, radioNome),
    );
  }

  // Inicia um pedido de musica. Se nao reconhecer musica nem artista, NAO inventa: pede de novo.
  async function iniciarMusica(
    texto: string,
    sentimento: "ama" | "rejeita",
    proxima: string,
  ) {
    const pedido = await interpretarPedidoMusica(texto);
    const titulo = pedido?.titulo?.trim() || null;
    const artista = pedido?.artista?.trim() || null;

    if (pedido?.qualquer && artista) {
      const artistaCanon = (await confirmarArtista(artista)) ?? artista;
      const id = await gravarMusica(radioId, ouvinteId, sentimento, artistaCanon, null, texto.trim());
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: sentimento === "ama" ? "musicas_ama" : "musicas_rejeita", ids: id ? [id] : [] } },
      }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Fechado! Vou colocar um ${artistaCanon} pra você. Ótima escolha!`,
      );
      await avancarPara(proxima);
      return;
    }

    if (!pedido?.reconhecido || (!titulo && !artista)) {
      await reply(phone, conversaId, radioId, escolher(MUSICA_NAO_ENTENDI));
      return;
    }

    await processarMusicaParcial(titulo, artista, sentimento, proxima);
  }

  // Decide o proximo passo a partir do que ja se sabe (titulo e/ou artista).
  async function processarMusicaParcial(
    titulo: string | null,
    artista: string | null,
    sentimento: "ama" | "rejeita",
    proxima: string,
  ) {
    const ctxMus = { sentimento, proxima, titulo, artista };

    if (titulo && !artista) {
      await db.from("conversas").update({ contexto: { musica: ctxMus } }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Boa! E quem canta "${titulo}"? Me manda o nome do cantor ou da banda.`,
      );
      await setEtapa("musica_artista");
      return;
    }

    if (!titulo && artista) {
      await db.from("conversas").update({ contexto: { musica: ctxMus } }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Show, do ${artista}! E qual é a música que você quer?`,
      );
      await setEtapa("musica_titulo");
      return;
    }

    // Tem os dois: so usa o resultado do catalogo se ele de fato bate com o que a pessoa falou.
    const busca = await buscarMusicaCatalogo(`${titulo} ${artista}`);
    let tituloFinal = titulo!;
    let artistaFinal = artista!;
    if (busca) {
      const simT = semelhanca(titulo!, busca.titulo);
      const simA = semelhanca(artista!, busca.artista);
      if (simT >= 0.4 || simA >= 0.5 || (simT + simA) >= 0.8) {
        tituloFinal = busca.titulo;
        artistaFinal = busca.artista;
      }
    }
    await db.from("conversas").update({
      contexto: { musica: { sentimento, proxima, titulo: tituloFinal, artista: artistaFinal } },
    }).eq("id", conversaId);
    await reply(
      phone,
      conversaId,
      radioId,
      `Só pra confirmar: é "${tituloFinal}", do ${artistaFinal}? (responde sim ou não)`,
    );
    await setEtapa("musica_confirma");
  }

  const ETAPAS_RESPOSTA = new Set([
    "nome", "sobrenome", "cidade", "bairro", "aniversario", "ano_nascimento",
    "pedido_musica", "pedido_musica_nome", "musicas_rejeita",
    "estilo_musical", "outros_estilos", "radio_troca", "programa_locutor",
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

      if (
        (intent.tipo_correcao === "gosto" ||
          intent.tipo_correcao === "nao_gosto") &&
        ultimo?.ids?.length
      ) {
        const novo = intent.tipo_correcao === "gosto" ? "ama" : "rejeita";
        await db.from("musicas").update({ sentimento: novo }).in("id", ultimo.ids);
        await reply(
          phone,
          conversaId,
          radioId,
          `Corrigido, anotei que você ${novo === "ama" ? "gosta" : "não curte"}. ${perguntaAtual}`,
        );
        return new Response("ok", { status: 200 });
      }

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
          `Sem problema, vamos corrigir. ${perguntaDaEtapa(ultimo.etapa, ouvinte, ddd, radioNome)}`,
        );
        return new Response("ok", { status: 200 });
      }

      await reply(phone, conversaId, radioId, `Vamos de novo: ${perguntaAtual}`);
      return new Response("ok", { status: 200 });
    }
  }

  switch (etapa) {
    case "inicio": {
      // Pessoa nova que ja chega perguntando de premio: puxa o cadastro.
      if (ehPremio(texto)) {
        await reply(phone, conversaId, radioId, PREMIO_NOVO);
        await setEtapa("nome");
        break;
      }
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
        if (ehPremio(texto)) {
          await reply(phone, conversaId, radioId, PREMIO_NOVO);
          break;
        }
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
      let iso = parseAniversario(texto);
      if (!iso) {
        if (/\d{1,2}\s*[\/\-.\s]\s*\d{1,2}/.test(texto) && !/\d{4}/.test(texto)) {
          await db.from("conversas").update({ contexto: null }).eq("id", conversaId);
          await reply(
            phone,
            conversaId,
            radioId,
            "Faltou o ano. Em que ano você nasceu? (ex: 1990)",
          );
          await setEtapa("ano_nascimento");
          break;
        }
        iso = await interpretarData(texto);
      }
      if (!iso) {
        const jaTentou =
          (conversa.contexto as { dataTentativa?: boolean } | null)
            ?.dataTentativa === true;
        if (!jaTentou) {
          const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
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
        await db.from("conversas").update({ contexto: null }).eq("id", conversaId);
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
      await db.from("conversas").update({ contexto: { loc: { tipo, zona } } }).eq("id", conversaId);
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
          const { data: seeds } = await db.from("bairros_zonas").select("bairro, zona");
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
      await db.from("ouvintes").update({ bairro: bairroFinal, zona }).eq("id", ouvinteId);
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

    case "musica_titulo": {
      const ctx = (conversa.contexto as {
        musica?: { sentimento: "ama" | "rejeita"; proxima: string; titulo: string | null; artista: string | null };
      } | null)?.musica;
      if (!ctx) {
        await avancarPara("musicas_rejeita");
        break;
      }
      const chave = normalizarSemAcento(texto);
      if (chave === "qualquer" || chave === "qualquer uma" || chave === "qualquer musica" || chave === "tanto faz" || chave === "pode ser qualquer" || chave === "o que tiver") {
        const artistaCanon = ctx.artista ? ((await confirmarArtista(ctx.artista)) ?? ctx.artista) : null;
        const id = await gravarMusica(radioId, ouvinteId, ctx.sentimento, artistaCanon, null, ctx.artista ?? texto);
        await db.from("conversas").update({
          contexto: { ultimo: { etapa: ctx.sentimento === "ama" ? "musicas_ama" : "musicas_rejeita", ids: id ? [id] : [] } },
        }).eq("id", conversaId);
        await reply(phone, conversaId, radioId, `Fechado! Vou colocar um ${artistaCanon ?? ctx.artista} pra você. Ótima escolha!`);
        await avancarPara(ctx.proxima);
        break;
      }
      if (NEGATIVAS.has(chave)) {
        await reply(phone, conversaId, radioId, "Sem problema, deixa essa de lado então.");
        await avancarPara(ctx.proxima);
        break;
      }
      // Se a pessoa so fez uma pergunta/meta, nao trata como titulo: pergunta de novo.
      if (pareceMeta(texto)) {
        await reply(phone, conversaId, radioId, `Qual é o nome da música do ${ctx.artista} que você quer?`);
        break;
      }
      await processarMusicaParcial(texto.trim(), ctx.artista, ctx.sentimento, ctx.proxima);
      break;
    }

    case "musica_artista": {
      const ctx = (conversa.contexto as {
        musica?: { sentimento: "ama" | "rejeita"; proxima: string; titulo: string | null; artista: string | null };
      } | null)?.musica;
      if (!ctx) {
        await avancarPara("musicas_rejeita");
        break;
      }
      const chave = normalizarSemAcento(texto);
      if (NEGATIVAS.has(chave) || chave === "nao sei" || chave === "sei la" || chave === "naoseio") {
        const id = await gravarMusica(radioId, ouvinteId, ctx.sentimento, null, ctx.titulo, ctx.titulo ?? texto);
        await db.from("conversas").update({
          contexto: { ultimo: { etapa: ctx.sentimento === "ama" ? "musicas_ama" : "musicas_rejeita", ids: id ? [id] : [] } },
        }).eq("id", conversaId);
        await avancarPara(ctx.proxima);
        break;
      }
      // Se a pessoa so fez uma pergunta/meta, nao trata como artista: pergunta de novo.
      if (pareceMeta(texto)) {
        await reply(phone, conversaId, radioId, `Me manda só o nome de quem canta "${ctx.titulo}", o cantor ou a banda.`);
        break;
      }
      await processarMusicaParcial(ctx.titulo, texto.trim(), ctx.sentimento, ctx.proxima);
      break;
    }

    case "musica_confirma": {
      const ctx = (conversa.contexto as {
        musica?: { sentimento: "ama" | "rejeita"; proxima: string; titulo: string | null; artista: string | null };
      } | null)?.musica;
      if (!ctx) {
        await avancarPara("musicas_rejeita");
        break;
      }
      const chave = normalizarSemAcento(texto);
      if (AFIRMATIVAS.has(chave)) {
        const textoOrig = `${ctx.titulo} - ${ctx.artista}`;
        const id = await gravarMusica(radioId, ouvinteId, ctx.sentimento, ctx.artista, ctx.titulo, textoOrig);
        await db.from("conversas").update({
          contexto: { ultimo: { etapa: ctx.sentimento === "ama" ? "musicas_ama" : "musicas_rejeita", ids: id ? [id] : [] } },
        }).eq("id", conversaId);
        await avancarPara(ctx.proxima);
        break;
      }
      if (NEGATIVAS.has(chave)) {
        await db.from("conversas").update({
          contexto: { musica: { sentimento: ctx.sentimento, proxima: ctx.proxima, titulo: null, artista: null } },
        }).eq("id", conversaId);
        await reply(phone, conversaId, radioId, "Sem problema! Então me diz de novo: qual é a música que você quer?");
        await setEtapa("musica_titulo");
        break;
      }
      // Pergunta/meta: repete a confirmacao sem perder o contexto.
      if (pareceMeta(texto)) {
        await reply(phone, conversaId, radioId, `Só pra confirmar: é "${ctx.titulo}", do ${ctx.artista}? (responde sim ou não)`);
        break;
      }
      // Resposta diferente de sim/nao: trata como novo pedido.
      await iniciarMusica(texto, ctx.sentimento, ctx.proxima);
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
        await db.from("ouvintes").update({ outros_estilos: titleCasePtBr(texto) })
          .eq("id", ouvinteId);
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

    case "ajuda_descricao": {
      // A pessoa descreveu o que precisa: agradece, repassa pro time e volta ao retorno.
      await reply(phone, conversaId, radioId, escolher(AJUDA_RESPOSTA));
      await db.from("conversas").update({ contexto: null }).eq("id", conversaId);
      await setEtapa("retorno");
      break;
    }

    case "retorno": {
      const nomeNovo = extrairNomeDeclarado(texto);
      if (nomeNovo) {
        await db.from("ouvintes").update({ nome: nomeNovo }).eq("id", ouvinteId);
        await db.from("conversas").update({
          contexto: { ultimo: { etapa: "nome" } },
        }).eq("id", conversaId);
        const pn = nomeNovo.split(/\s+/)[0] || nomeNovo;
        if (nomeNovo.split(/\s+/).length < 2) {
          await reply(phone, conversaId, radioId, `Show, ${pn}! Pode me passar seu nome completo, com sobrenome?`);
          await setEtapa("sobrenome");
        } else {
          await reply(phone, conversaId, radioId, `Muito legal, ${pn}! Pode me passar sua data de nascimento, no formato dia/mês/ano?`);
          await setEtapa("aniversario");
        }
        break;
      }

      const chave = normalizarSemAcento(texto);

      // Negativa ou despedida explicita: encerra com simpatia.
      if (NEGATIVAS.has(chave) || DESPEDIDAS.has(chave)) {
        await reply(
          phone,
          conversaId,
          radioId,
          `Tranquilo, ${primeiroNome}! Qualquer hora que quiser pedir uma música é só me chamar. Continue ligado na ${RADIO_LABEL}!`,
        );
        break;
      }

      // Premio: fast-path deterministico (cadastrado).
      if (ehPremio(texto)) {
        await reply(phone, conversaId, radioId, escolher(PREMIO_CADASTRADO));
        break;
      }

      const ir = await classificarRetorno(texto);

      if (ir?.intencao === "premio") {
        await reply(phone, conversaId, radioId, escolher(PREMIO_CADASTRADO));
        break;
      }

      if (ir?.intencao === "ajuda") {
        await reply(phone, conversaId, radioId, AJUDA_PERGUNTA);
        await setEtapa("ajuda_descricao");
        break;
      }

      if (ir?.intencao === "afeto") {
        if (ir.programa_locutor && ir.programa_locutor.trim()) {
          const loc = titleCasePtBr(ir.programa_locutor.trim());
          await db.from("ouvintes").update({ programa_locutor: loc }).eq("id", ouvinteId);
          await reply(phone, conversaId, radioId, escolher(ACK_LOCUTOR).replace(/\{LOC\}/g, loc));
        } else {
          await reply(phone, conversaId, radioId, escolher(ACK_AFETO));
        }
        break;
      }

      if (ir?.intencao === "despedida") {
        await reply(
          phone,
          conversaId,
          radioId,
          `Tranquilo, ${primeiroNome}! Qualquer hora que quiser pedir uma música é só me chamar. Continue ligado na ${RADIO_LABEL}!`,
        );
        break;
      }

      // pedido_musica (ou ir nulo): usa o termo extraido se houver, senao o texto.
      const termo = (ir?.intencao === "pedido_musica" && ir.termo_musica && ir.termo_musica.trim())
        ? ir.termo_musica.trim()
        : texto;
      if (normalizarSemAcento(termo).length > 1) {
        await iniciarMusica(termo, "ama", "retorno");
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
