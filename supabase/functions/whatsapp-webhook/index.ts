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

type ItemRadio = { texto_original: string; nome_canonico: string | null };

// Normaliza nomes de radios concorrentes ("98 fm", "radio 98" -> "98 FM").
async function interpretarRadios(texto: string): Promise<ItemRadio[] | null> {
  const prompt = `
O ouvinte citou radios que costuma escutar, em texto informal e com possiveis erros.
Extraia cada radio citada e normalize o nome para uma forma canonica consistente (ex.: "98 fm", "radio 98" viram "98 FM").
Nao invente radios que o ouvinte nao citou.
Sempre devolva os nomes na grafia oficial com acentuação correta do português, por exemplo Marília Mendonça, Evidências, São Paulo, Tatuapé.
Responda APENAS com JSON, sem texto fora do JSON, neste formato:
{"radios":[{"texto_original":"...","nome_canonico":"Forma Canonica ou null"}]}

Resposta do ouvinte: """${texto}"""
`;
  const out = await geminiJSON<{ radios: ItemRadio[] }>(prompt);
  return out?.radios ?? null;
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
  const itens = await interpretarLista(texto);
  const pendentes: string[] = [];
  const ids: string[] = [];
  if (itens && itens.length > 0) {
    for (const it of itens) {
      if (it.tipo === "artista" && it.artista) {
        pendentes.push(it.artista);
      } else {
        const id = await gravarMusica(
          radioId,
          ouvinteId,
          sentimento,
          it.artista ?? null,
          it.musica ?? null,
          it.texto_original ?? texto,
        );
        if (id) ids.push(id);
      }
    }
  } else {
    // Fallback sem IA: grava cru, split por virgula/quebra.
    for (const s of splitLista(texto)) {
      const id = await gravarMusica(
        radioId,
        ouvinteId,
        sentimento,
        null,
        null,
        s,
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

function splitLista(texto: string): string[] {
  return texto
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
      return "Pra você participar, me conta seu nome completo?";
    case "bairro":
      return "Em qual bairro você mora?";
    case "cidade":
      return "Me diz sua cidade e estado (ex: Campinas, SP).";
    case "aniversario":
      return "Qual a sua data de nascimento?";
    case "ano_nascimento":
      return "Qual ano você nasceu? (ex: 1990)";
    case "musicas_ama":
      return "Quais músicas você mais ama ouvir? Pode mandar várias.";
    case "musicas_rejeita":
      return "Tem alguma música que você não gosta de jeito nenhum?";
    case "outras_radios":
      return "Além da nossa, quais outras rádios você costuma escutar?";
    default:
      return "Pode me contar?";
  }
}

type Intencao = {
  intencao: "resposta" | "correcao" | "conversa";
  tipo_correcao: "gosto" | "nao_gosto" | null;
  fala: string | null;
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
Se for "conversa", escreva em "fala" uma resposta curta, simpática e direta ao ouvinte, de uma frase, sem travessão.
Responda APENAS com JSON, sem texto fora do JSON:
{"intencao":"resposta|correcao|conversa","tipo_correcao":"gosto|nao_gosto ou null","fala":"frase ou null"}
`;
  return await geminiJSON<Intencao>(prompt);
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
    "bairro",
    "cidade",
    "aniversario",
    "ano_nascimento",
    "musicas_ama",
    "musicas_rejeita",
    "musica_pendente",
    "outras_radios",
  ]);

  if (isTexto && ETAPAS_RESPOSTA.has(etapa)) {
    const ctxAtual = (conversa.contexto as Record<string, unknown> | null) ?? {};
    const perguntaAtual = etapa === "musica_pendente"
      ? `Qual música de ${
        ((ctxAtual.fila as string[] | undefined) ?? [])[0] ?? "do artista"
      } você citou?`
      : perguntaDaEtapa(etapa, ouvinte, ddd, radioNome);

    const intent = await classificarIntencao(perguntaAtual, texto);

    if (intent && intent.intencao === "conversa") {
      const fala = intent.fala || "Boa!";
      await reply(phone, conversaId, radioId, `${fala} ${perguntaAtual}`);
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
        `Oi! Aqui é a ${radioNome}. Pra você participar de todas as promoções da rádio, me conta seu nome completo?`,
      );
      await setEtapa("nome");
      break;
    }

    case "reinicio": {
      // Ouvinte que volta apos a janela: ja tem nome, recoleta a partir do local.
      // A mensagem que disparou a rodada nao e consumida como resposta.
      const saud = escolher(SAUDACOES_RETORNO);
      if (ddd === "11") {
        await reply(
          phone,
          conversaId,
          radioId,
          `${saud}, ${primeiroNome}! Bora atualizar rapidinho. Em qual bairro você está agora?`,
        );
        await setEtapa("bairro");
      } else {
        await reply(
          phone,
          conversaId,
          radioId,
          `${saud}, ${primeiroNome}! Bora atualizar rapidinho. Me diz sua cidade e estado agora (ex: Campinas, SP).`,
        );
        await setEtapa("cidade");
      }
      break;
    }

    case "nome": {
      const nomeLimpo = titleCasePtBr(limparPrefixoNome(texto)) || texto.trim();
      const pn = nomeLimpo.trim().split(/\s+/)[0] || nomeLimpo;
      await db.from("ouvintes").update({ nome: nomeLimpo }).eq("id", ouvinteId);
      const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
      await db.from("conversas").update({
        contexto: { ...ctx, ultimo: { etapa: "nome" } },
      }).eq("id", conversaId);
      if (ddd === "11") {
        await reply(
          phone,
          conversaId,
          radioId,
          `Prazer, ${pn}! Em qual bairro você mora?`,
        );
        await setEtapa("bairro");
      } else {
        await reply(
          phone,
          conversaId,
          radioId,
          `Prazer, ${pn}! Me diz sua cidade e estado (ex: Campinas, SP).`,
        );
        await setEtapa("cidade");
      }
      break;
    }

    case "bairro": {
      let bairroFinal = titleCasePtBr(texto);
      let zona = "Outras";
      const ia = await interpretarBairro(texto);
      if (ia && ia.bairro) {
        bairroFinal = ia.bairro;
        zona = ia.zona || "Outras";
      } else {
        const alvo = normalizarSemAcento(texto);
        const { data: seeds } = await db
          .from("bairros_zonas")
          .select("bairro, zona");
        const achou = (seeds ?? []).find(
          (b) => normalizarSemAcento(b.bairro as string) === alvo,
        );
        if (achou) zona = achou.zona as string;
      }
      await db
        .from("ouvintes")
        .update({ bairro: bairroFinal, zona })
        .eq("id", ouvinteId);
      {
        const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
        await db.from("conversas").update({
          contexto: { ...ctx, ultimo: { etapa: "bairro" } },
        }).eq("id", conversaId);
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "Show! Qual a sua data de nascimento?",
      );
      await setEtapa("aniversario");
      break;
    }

    case "cidade": {
      let cidade = "";
      let estado: string | null = null;
      const ia = await interpretarCidade(texto);
      if (ia && ia.cidade) {
        cidade = ia.cidade;
        estado = ia.estado ? ia.estado.slice(0, 2).toUpperCase() : null;
      } else {
        const partes = texto.split(",").map((s) => s.trim());
        cidade = titleCasePtBr(partes[0] || texto);
        estado = partes[1] ? partes[1].slice(0, 2).toUpperCase() : null;
      }
      await db
        .from("ouvintes")
        .update({ cidade, estado })
        .eq("id", ouvinteId);
      {
        const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
        await db.from("conversas").update({
          contexto: { ...ctx, ultimo: { etapa: "cidade" } },
        }).eq("id", conversaId);
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "Show! Qual a sua data de nascimento?",
      );
      await setEtapa("aniversario");
      break;
    }

    case "aniversario": {
      let iso = parseAniversario(texto);
      if (!iso) iso = await interpretarData(texto);

      if (!iso) {
        const jaTentou =
          (conversa.contexto as { dataTentativa?: boolean } | null)
            ?.dataTentativa === true;
        if (!jaTentou) {
          const ctx = (conversa.contexto as Record<string, unknown> | null) ??
            {};
          await db
            .from("conversas")
            .update({ contexto: { ...ctx, dataTentativa: true } })
            .eq("id", conversaId);
          await reply(
            phone,
            conversaId,
            radioId,
            "Não peguei direito a data. Pode mandar assim, por exemplo: 28/01/1995?",
          );
          break; // continua em aniversario
        }
        // Segunda falha: pergunta so o ano e insiste nisso.
        await db.from("conversas").update({ contexto: null }).eq(
          "id",
          conversaId,
        );
        await reply(
          phone,
          conversaId,
          radioId,
          "Não consegui a data completa. Sem problema, me diz só o ano que você nasceu, por exemplo 1990.",
        );
        await setEtapa("ano_nascimento");
        break;
      }

      // Limpa a flag de tentativa e marca a ultima resposta (descarta dataTentativa).
      await db.from("conversas").update({
        contexto: { ultimo: { etapa: "aniversario" } },
      }).eq("id", conversaId);

      const idade = calcularIdade(iso);
      const { data: faixa } = await db
        .from("faixas_etarias")
        .select("id")
        .lte("idade_min", idade)
        .or(`idade_max.gte.${idade},idade_max.is.null`)
        .order("id")
        .limit(1)
        .maybeSingle();
      await db
        .from("ouvintes")
        .update({
          data_nascimento: iso,
          idade,
          faixa_etaria: faixa?.id ?? null,
        })
        .eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Quais músicas você mais ama ouvir? Pode mandar várias.",
      );
      await setEtapa("musicas_ama");
      break;
    }

    case "ano_nascimento": {
      const m = texto.replace(/\D/g, "");
      let ano = 0;
      if (m.length === 4) {
        ano = parseInt(m, 10);
      } else if (m.length === 2) {
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
        break; // continua em ano_nascimento, insistindo
      }
      const iso = `${ano}-01-01`;
      const idade = anoAtual - ano;
      const { data: faixa } = await db
        .from("faixas_etarias")
        .select("id")
        .lte("idade_min", idade)
        .or(`idade_max.gte.${idade},idade_max.is.null`)
        .order("id")
        .limit(1)
        .maybeSingle();
      await db
        .from("ouvintes")
        .update({ data_nascimento: iso, idade, faixa_etaria: faixa?.id ?? null })
        .eq("id", ouvinteId);
      await db.from("conversas").update({ contexto: null }).eq("id", conversaId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Show! Quais músicas você mais ama ouvir? Pode mandar várias.",
      );
      await setEtapa("musicas_ama");
      break;
    }

    case "musicas_ama": {
      const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
      const { pendentes, ids } = await processarLista(
        radioId,
        ouvinteId,
        "ama",
        texto,
      );
      const ultimo = { etapa: "musicas_ama", ids, sentimento: "ama" };
      if (pendentes.length > 0) {
        await db
          .from("conversas")
          .update({
            contexto: {
              ...ctx,
              fila: pendentes,
              sentimento: "ama",
              proxima: "musicas_rejeita",
              ultimo,
            },
          })
          .eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          `Boa! E qual música de ${pendentes[0]} você mais curte?`,
        );
        await setEtapa("musica_pendente");
      } else {
        await db
          .from("conversas")
          .update({ contexto: { ...ctx, ultimo } })
          .eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          "E tem alguma música que você não gosta de jeito nenhum?",
        );
        await setEtapa("musicas_rejeita");
      }
      break;
    }

    case "musicas_rejeita": {
      const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
      const { pendentes, ids } = await processarLista(
        radioId,
        ouvinteId,
        "rejeita",
        texto,
      );
      const ultimo = { etapa: "musicas_rejeita", ids, sentimento: "rejeita" };
      if (pendentes.length > 0) {
        await db
          .from("conversas")
          .update({
            contexto: {
              ...ctx,
              fila: pendentes,
              sentimento: "rejeita",
              proxima: "outras_radios",
              ultimo,
            },
          })
          .eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          `Entendi! E qual música de ${pendentes[0]} te incomoda mais?`,
        );
        await setEtapa("musica_pendente");
      } else {
        await db
          .from("conversas")
          .update({ contexto: { ...ctx, ultimo } })
          .eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          "Última pergunta: além da nossa, quais outras rádios você costuma escutar?",
        );
        await setEtapa("outras_radios");
      }
      break;
    }

    case "musica_pendente": {
      const ctx = (conversa.contexto as {
        fila?: string[];
        sentimento?: "ama" | "rejeita";
        proxima?: string;
      } | null) ?? {};
      const fila = ctx.fila ?? [];
      const sentimento = ctx.sentimento ?? "ama";
      const artista = fila[0];

      if (!artista) {
        // Sem fila valida: segue pro fluxo normal.
        await db.from("conversas").update({ contexto: null }).eq(
          "id",
          conversaId,
        );
        await reply(
          phone,
          conversaId,
          radioId,
          "Última pergunta: além da nossa, quais outras rádios você costuma escutar?",
        );
        await setEtapa("outras_radios");
        break;
      }

      const r = await interpretarMusicaDoArtista(texto, artista);
      const titulo = r?.musica ?? texto;
      const id = await gravarMusica(
        radioId,
        ouvinteId,
        sentimento,
        artista,
        titulo,
        texto,
      );
      const ultimo = {
        etapa: "musica_pendente",
        ids: id ? [id] : [],
        sentimento,
      };

      // Monta complemento com sugestoes so se a IA ficou em duvida.
      let extra = "";
      if (
        r && (r.confianca ?? 0) < 0.6 && r.sugestoes && r.sugestoes.length > 0
      ) {
        extra = ` Anotei "${titulo}". Se eu errei, de ${artista} também tocam: ${
          r.sugestoes.slice(0, 2).join(", ")
        }.`;
      }

      fila.shift();

      if (fila.length > 0) {
        await db
          .from("conversas")
          .update({
            contexto: { ...ctx, fila, sentimento, proxima: ctx.proxima, ultimo },
          })
          .eq("id", conversaId);
        await reply(
          phone,
          conversaId,
          radioId,
          `Show!${extra} E de ${fila[0]}, qual música?`,
        );
        // permanece em musica_pendente
      } else {
        // Fim da fila: limpa fila/proxima mas preserva ultimo (pra correcao).
        await db.from("conversas").update({ contexto: { ultimo } }).eq(
          "id",
          conversaId,
        );
        if (ctx.proxima === "musicas_rejeita") {
          await reply(
            phone,
            conversaId,
            radioId,
            `Show!${extra} E tem alguma música que você não gosta de jeito nenhum?`,
          );
          await setEtapa("musicas_rejeita");
        } else {
          await reply(
            phone,
            conversaId,
            radioId,
            `Show!${extra} Última pergunta: além da nossa, quais outras rádios você costuma escutar?`,
          );
          await setEtapa("outras_radios");
        }
      }
      break;
    }

    case "outras_radios": {
      const radios = await interpretarRadios(texto);
      const ids: string[] = [];
      if (radios && radios.length > 0) {
        const { data } = await db.from("radios_concorrentes").insert(
          radios.map((r) => ({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome_radio: r.texto_original,
            nome_canonico: r.nome_canonico,
          })),
        ).select("id");
        for (const row of data ?? []) ids.push(row.id as string);
      } else {
        for (const s of splitLista(texto)) {
          const { data } = await db.from("radios_concorrentes").insert({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome_radio: s,
            nome_canonico: null,
          }).select("id").single();
          if (data?.id) ids.push(data.id as string);
        }
      }
      {
        const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
        await db.from("conversas").update({
          contexto: { ...ctx, ultimo: { etapa: "outras_radios", ids } },
        }).eq("id", conversaId);
      }
      await db
        .from("ouvintes")
        .update({ participacoes: (ouvinte.participacoes ?? 0) + 1 })
        .eq("id", ouvinteId);
      await setEtapa("concluido");
      await reply(
        phone,
        conversaId,
        radioId,
        `Prontinho! Obrigado por participar com a gente${
          primeiroNome ? ", " + primeiroNome : ""
        }. Fica ligado na ${radioNome}!`,
      );
      break;
    }

    case "concluido":
    default: {
      // Ouvinte que volta: reconhece, incrementa participacoes, agradece curto.
      await db
        .from("ouvintes")
        .update({ participacoes: (ouvinte.participacoes ?? 0) + 1 })
        .eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        ouvinte.nome
          ? `Que bom te ver de novo, ${primeiroNome}! Obrigado por falar com a ${radioNome}.`
          : `Obrigado por falar com a ${radioNome}!`,
      );
      break;
    }
  }

  return new Response("ok", { status: 200 });
});
