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

type ItemMusica = {
  texto_original: string;
  tipo: "musica" | "artista" | "musica_e_artista" | "desconhecido";
  artista: string | null;
  musica: string | null;
  confianca: number;
};

// Interpreta uma resposta livre de musicas (ama ou rejeita).
async function interpretarLista(texto: string): Promise<ItemMusica[] | null> {
  const prompt = `
Voce interpreta respostas de ouvintes de uma radio brasileira (foco em sertanejo e musica popular) sobre musicas.
O ouvinte escreveu, em linguagem informal e as vezes com erros de digitacao, o que ele citou.
Tarefa: extrair os itens citados e, para cada um, dizer se e uma MUSICA, um ARTISTA, ou MUSICA E ARTISTA juntos.
Corrija a grafia para a forma canonica conhecida (ex.: "marilia mendonca" vira "Marília Mendonça"; "evidencias" vira "Evidências").
Sempre devolva a musica no formato canonico com o ARTISTA e o TITULO separados. Quando o ouvinte escrever so o titulo, descubra o artista; quando escrever artista e musica juntos, separe os dois (ex.: "meteoro luan santana" vira artista "Luan Santana" e musica "Meteoro"; "jura edson e hudson" vira artista "Edson & Hudson" e musica "Jura").
Use a grafia oficial com acentuação correta.
Se o ouvinte citar apenas o nome de um cantor, dupla ou banda, sem musica, classifique como "artista" e nunca como "desconhecido".
Use seu conhecimento de musica brasileira para reconhecer o artista mesmo escrito de forma informal ou incompleta (ex.: "ze neto" e Zé Neto & Cristiano; "maiara e maraisa" e Maiara & Maraisa).
Use seu conhecimento de musica brasileira. Nao invente itens que o ouvinte nao citou.
Sempre devolva os nomes na grafia oficial com acentuação correta do português, por exemplo Marília Mendonça, Evidências, São Paulo, Tatuapé.
Responda APENAS com JSON, sem nenhum texto fora do JSON, neste formato:
{"itens":[{"texto_original":"...","tipo":"musica|artista|musica_e_artista|desconhecido","artista":"Forma Canonica ou null","musica":"Forma Canonica ou null","confianca":0.0}]}

Resposta do ouvinte: """${texto}"""
`;
  const out = await geminiJSON<{ itens: ItemMusica[] }>(prompt);
  return out?.itens ?? null;
}

type MusicaDoArtista = {
  musica: string | null;
  confianca: number;
  sugestoes: string[];
};

// Dado o artista ja conhecido, interpreta a musica respondida e sugere hits.
async function interpretarMusicaDoArtista(
  texto: string,
  artista: string,
): Promise<MusicaDoArtista | null> {
  const prompt = `
O ouvinte de uma radio disse que curte o artista "${artista}" e agora respondeu qual musica dele(a) mais gosta.
A resposta pode ter erro de grafia ou nome aproximado. Identifique a musica mais provavel de ${artista} e corrija para a forma canonica.
Devolva o titulo da musica na grafia oficial com acentuação correta, separado do artista.
Se nao tiver certeza, traga ate 3 sugestoes de musicas famosas de ${artista}.
Use seu conhecimento de musica brasileira. Nao invente musicas que nao sejam de ${artista}.
Sempre devolva os nomes na grafia oficial com acentuação correta do português, por exemplo Marília Mendonça, Evidências, São Paulo, Tatuapé.
Responda APENAS com JSON, sem nenhum texto fora do JSON, neste formato:
{"musica":"Forma Canonica ou null","confianca":0.0,"sugestoes":["...","...","..."]}

Resposta do ouvinte: """${texto}"""
`;
  return await geminiJSON<MusicaDoArtista>(prompt);
}

// Busca musica/artista em catalogo gratuito (sem chave): iTunes -> Deezer.
// Tira o trabalho pesado do Gemini, que vira so reforco. Custo zero.
async function buscarMusicaCatalogo(
  termo: string,
): Promise<{ artista: string; titulo: string } | null> {
  const q = termo.trim();
  if (!q) return null;

  // 1) iTunes Search (BR), sem chave.
  try {
    const u =
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=BR&media=music&entity=song&limit=1&lang=pt_br`;
    const r = await fetch(u);
    if (r.ok) {
      const j = await r.json();
      const hit = j?.results?.[0];
      if (hit?.artistName && hit?.trackName) {
        return { artista: hit.artistName, titulo: hit.trackName };
      }
    }
  } catch (_) { /* ignora e tenta a proxima fonte */ }

  // 2) Deezer Search, sem chave.
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

// Interpreta "cidade, UF" em texto livre.
async function interpretarCidade(
  texto: string,
): Promise<{ cidade: string; estado: string | null } | null> {
  const prompt = `
O ouvinte informou cidade e estado dele, em texto informal.
Devolva a cidade na forma canonica e a sigla do estado (UF, 2 letras) quando der pra inferir, senao null.
Sempre devolva os nomes na grafia oficial com acentuação correta do português, por exemplo Marília Mendonça, Evidências, São Paulo, Tatuapé.
Responda APENAS com JSON, sem texto fora do JSON: {"cidade":"Forma Canonica","estado":"UF ou null"}
Resposta do ouvinte: """${texto}"""
`;
  return await geminiJSON<{ cidade: string; estado: string | null }>(prompt);
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

// Processa uma resposta de lista (ama/rejeita): grava completos e devolve artistas pendentes.
async function processarLista(
  radioId: string,
  ouvinteId: string,
  sentimento: "ama" | "rejeita",
  texto: string,
): Promise<{ pendentes: string[]; ids: string[] }> {
  const itens = splitLista(texto);
  const pendentes: string[] = [];
  const ids: string[] = [];
  for (const item of itens) {
    // 1) Catalogo gratuito (principal): iTunes -> Deezer.
    const cat = await buscarMusicaCatalogo(item);
    if (cat) {
      const id = await gravarMusica(
        radioId,
        ouvinteId,
        sentimento,
        cat.artista,
        cat.titulo,
        item,
      );
      if (id) ids.push(id);
      continue;
    }
    // 2) Gemini como reforco (por item), no plano gratuito.
    const interp = await interpretarLista(item);
    const it = interp && interp[0];
    if (it) {
      if (it.tipo === "artista" && it.artista) {
        pendentes.push(it.artista);
      } else {
        const id = await gravarMusica(
          radioId,
          ouvinteId,
          sentimento,
          it.artista ?? null,
          it.musica ?? null,
          it.texto_original ?? item,
        );
        if (id) ids.push(id);
      }
    } else {
      // 3) Ultimo caso: grava cru (artista null, titulo = item).
      const id = await gravarMusica(
        radioId,
        ouvinteId,
        sentimento,
        null,
        item,
        item,
      );
      if (id) ids.push(id);
    }
  }
  return { pendentes, ids };
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

const SAUDACOES_RETORNO = [
  "Oi de novo",
  "Que bom te ver de volta",
  "Opa, você de novo por aqui",
  "E aí, de volta",
];

async function sendText(phone: string, message: string) {
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone, message }),
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
    case "bairro":
      return "Me passa o bairro onde você mora?";
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

// Grava artistas que vieram sem musica (catalogo nao achou titulo) como linha de artista.
async function gravarPendentesComoArtista(
  radioId: string,
  ouvinteId: string,
  sent: "ama" | "rejeita",
  pendentes: string[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const a of pendentes) {
    const id = await gravarMusica(radioId, ouvinteId, sent, a, null, a);
    if (id) ids.push(id);
  }
  return ids;
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
    "bairro",
    "aniversario",
    "ano_nascimento",
    "pedido_musica",
    "pedido_musica_nome",
    "musicas_rejeita",
    "estilo_musical",
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
        `Olá, ${primeiroNome}! Tudo bem? Que bom te ver de volta. O que manda?`,
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
      // Dia/mes sem ano: pede so o ano (evita a IA inventar o ano).
      if (
        /\d{1,2}\s*[\/\-.\s]\s*\d{1,2}/.test(texto) && !/\d{4}/.test(texto)
      ) {
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
        `Ótimo, ${primeiroNome}! Me passa o bairro onde você mora?`,
      );
      await setEtapa("bairro");
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
        `Ótimo, ${primeiroNome}! Me passa o bairro onde você mora?`,
      );
      await setEtapa("bairro");
      break;
    }

    case "bairro": {
      let bairroFinal = titleCasePtBr(texto);
      let zona = "Outras";
      let cidade: string | null = null;
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
          const c = await resolverGrandeSP(texto);
          if (c) {
            zona = c;
            cidade = c;
            bairroFinal = c;
          }
        }
      }
      const upd: Record<string, unknown> = { bairro: bairroFinal, zona };
      if (cidade) upd.cidade = cidade;
      await db.from("ouvintes").update(upd).eq("id", ouvinteId);
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
      const { pendentes, ids } = await processarLista(
        radioId,
        ouvinteId,
        "ama",
        texto,
      );
      const idsArt = await gravarPendentesComoArtista(
        radioId,
        ouvinteId,
        "ama",
        pendentes,
      );
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: "musicas_ama", ids: [...ids, ...idsArt] } },
      }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        `Anotado! Tem alguma música que toca aqui na ${RADIO_LABEL} que você não gosta?`,
      );
      await setEtapa("musicas_rejeita");
      break;
    }

    case "pedido_musica_nome": {
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave)) {
        const { pendentes, ids } = await processarLista(
          radioId,
          ouvinteId,
          "ama",
          texto,
        );
        const idsArt = await gravarPendentesComoArtista(
          radioId,
          ouvinteId,
          "ama",
          pendentes,
        );
        await db.from("conversas").update({
          contexto: {
            ultimo: { etapa: "musicas_ama", ids: [...ids, ...idsArt] },
          },
        }).eq("id", conversaId);
      }
      await reply(
        phone,
        conversaId,
        radioId,
        `Show! Tem alguma música que toca aqui na ${RADIO_LABEL} que você não gosta?`,
      );
      await setEtapa("musicas_rejeita");
      break;
    }

    case "musicas_rejeita": {
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave)) {
        const { pendentes, ids } = await processarLista(
          radioId,
          ouvinteId,
          "rejeita",
          texto,
        );
        const idsArt = await gravarPendentesComoArtista(
          radioId,
          ouvinteId,
          "rejeita",
          pendentes,
        );
        await db.from("conversas").update({
          contexto: {
            ultimo: { etapa: "musicas_rejeita", ids: [...ids, ...idsArt] },
          },
        }).eq("id", conversaId);
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "Entendi! Qual é o estilo musical que você mais gosta?",
      );
      await setEtapa("estilo_musical");
      break;
    }

    case "estilo_musical": {
      await db.from("ouvintes").update({ estilo_musical: titleCasePtBr(texto) })
        .eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Boa! Quando está tocando uma música que você não curte muito, você muda pra qual rádio?",
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
      // Sem nome novo: trata como pedido de musica, com frases fixas.
      const chave = normalizarSemAcento(texto);
      if (!NEGATIVAS.has(chave) && chave.length > 1) {
        const { pendentes, ids } = await processarLista(
          radioId,
          ouvinteId,
          "ama",
          texto,
        );
        await gravarPendentesComoArtista(radioId, ouvinteId, "ama", pendentes);
        if (ids.length || pendentes.length) {
          await reply(
            phone,
            conversaId,
            radioId,
            `Anotei seu pedido, ${primeiroNome}! Quer pedir mais alguma?`,
          );
          break;
        }
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
