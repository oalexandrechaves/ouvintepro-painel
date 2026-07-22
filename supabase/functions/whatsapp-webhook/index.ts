// OuvintePro - webhook "ao receber" da Z-API.
// Recebe mensagens do WhatsApp da radio, roda a conversa da Adriana e responde pela Z-API.
// Tom: simpatico, direto e transparente. A IA conduz a conversa nos bastidores.
// v54: MIGRACAO Gemini -> Claude (Anthropic). cerebroAdriana/falaAdriana usam claude-haiku-4-5
// (claudeJSON via tool use forcado para manter o JSON; claudeTexto para a fala). Correcao de
// musica usa a busca web da Claude (claudeBusca) como fonte de verdade, mantendo iTunes/Deezer de
// reserva. Transcricao de audio migrada para o Groq Whisper (whisper-large-v3-turbo). Guarda-corpos
// preservados. Secrets: ANTHROPIC_API_KEY, GROQ_API_KEY.
// v53: regra anti-placeholder tambem no prompt do cerebroAdriana (espelha a do falaAdriana):
// nome vazio -> nao cita nome, nunca inventa "[Nome do ouvinte]". Fecha o unico caminho cru
// (dec.resposta_ao_ouvinte usado direto) que ainda podia vazar o placeholder na pergunta da data.
// v52: TODOS os campos de cadastro (nome, data, cidade, bairro, estilo, outros, programa) tem
// handler deterministico ANTES do cerebro (handleCampoCadastro), imune a 503/429 - mata o loop.
// Anti-loop: repergunta 1x variada (falaAdriana) e forca avanco (nome aceita texto; data pula).
// v51: radio_troca agora extrai o nome da radio de frase natural ("eu troco pra mix" -> Mix),
// via extrairRadioDaFrase (tira verbos/conectores do inicio, preserva "Radio" quando faz parte
// do nome) + resolverRadio; nega/loop tratados; sem regressao no fluxo de musica.
// v50: fluxo de musica reprojetado (dois votos independentes cantor/musica). So busca no
// Google quando existe TEXTO de musica (regra de ouro: so cantor nunca dispara busca). Toda
// fala do fluxo de musica vem do cerebro (falaAdriana), sem frase fixa do codigo. Estados:
// musica_aguarda_titulo (tem cantor), musica_aguarda_cantor (tem musica). v71+: quando a busca
// acha a musica oficial, grava direto com o nome corrigido (sem pedir confirmacao); so nao achou repergunta.
// Base v49: privacidade (cerebro sem valores) + pula campos preenchidos + grounding.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPI_INSTANCE_ID = Deno.env.get("ZAPI_INSTANCE_ID")!;
const ZAPI_TOKEN = Deno.env.get("ZAPI_TOKEN")!;
const ZAPI_CLIENT_TOKEN = Deno.env.get("ZAPI_CLIENT_TOKEN")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CLAUDE_MODEL = "claude-haiku-4-5";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const GROQ_MODEL = "whisper-large-v3-turbo";

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

// Chama a Claude esperando JSON estruturado, via tool use forcado. Retorna null em qualquer falha.
async function claudeJSON<T>(prompt: string, tentativas = 2): Promise<T | null> {
  if (!ANTHROPIC_API_KEY) return null;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          temperature: 0.2,
          tools: [{
            name: "responder",
            description: "Devolve a resposta estruturada exatamente no formato JSON pedido no prompt. Preencha CADA campo separadamente; NUNCA coloque o JSON inteiro dentro de resposta_ao_ouvinte.",
            input_schema: {
              type: "object",
              properties: {
                resposta_ao_ouvinte: {
                  type: "string",
                  description: "Somente o texto humano da fala da Adriana para o ouvinte, sem JSON, sem nomes de campo.",
                },
                campos_extraidos: {
                  type: "object",
                  description: "So os campos que a mensagem atual permitiu preencher.",
                  additionalProperties: { type: "string" },
                },
                proximo_campo: { type: "string" },
                e_pedido_musica: { type: "boolean" },
                musica_bruta: { type: ["string", "null"] },
                artista_bruto: { type: ["string", "null"] },
                qualquer_do_artista: { type: "boolean" },
              },
              required: ["resposta_ao_ouvinte", "proximo_campo"],
              additionalProperties: false,
            },
          }],
          tool_choice: { type: "tool", name: "responder" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        console.error(`Claude JSON falhou: status=${res.status} (tentativa ${i + 1})`);
        if ((res.status === 429 || res.status === 529 || res.status >= 500) && i < tentativas - 1) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        return null;
      }
      const data = await res.json();
      const bloco = (data?.content ?? []).find((b: { type?: string }) => b?.type === "tool_use");
      if (bloco?.input) return bloco.input as T;
      return null;
    } catch (e) {
      console.error(`Claude JSON excecao (tentativa ${i + 1}): ${e}`);
      if (i < tentativas - 1) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      return null;
    }
  }
  return null;
}

// Chama a Claude esperando TEXTO livre (fala natural da Adriana), sem tools.
async function claudeTexto(prompt: string, temperature = 0.6): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error(`claudeTexto falhou: status=${res.status}`);
      return null;
    }
    const data = await res.json();
    const txt = (data?.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b?.text ?? "")
      .join(" ").trim();
    return txt || null;
  } catch (e) {
    console.error(`claudeTexto excecao: ${e}`);
    return null;
  }
}

// Usa a busca web da Claude como FONTE DE VERDADE para achar a musica real. Devolve o texto ou null.
async function claudeBusca(prompt: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
          user_location: { type: "approximate", country: "BR" },
        }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error(`claudeBusca falhou: status=${res.status}`);
      return null;
    }
    const data = await res.json();
    const txt = (data?.content ?? [])
      .filter((b: { type?: string }) => b?.type === "text")
      .map((b: { text?: string }) => b?.text ?? "")
      .join(" ").trim();
    return txt || null;
  } catch (e) {
    console.error(`claudeBusca excecao: ${e}`);
    return null;
  }
}

// FONTE DE VERDADE: usa a busca web da Claude pra achar a musica real.
// Duas chamadas: 1) busca em texto livre; 2) extracao estruturada. Nunca inventa.
async function buscarMusicaGrounding(
  textoBruto: string,
  artistaOpcional?: string | null,
): Promise<{ titulo: string; artista: string | null } | null> {
  const q = (textoBruto ?? "").trim();
  if (!q) return null;
  const dica = artistaOpcional && artistaOpcional.trim()
    ? ` O ouvinte mencionou o artista "${artistaOpcional.trim()}".`
    : "";
  const prompt1 = `
Você ajuda uma rádio brasileira a identificar pedidos de música no WhatsApp.
O ouvinte escreveu o pedido, possivelmente com erro de grafia ou de ouvido: "${q}".${dica}
Usando a busca web, descubra qual é a MÚSICA REAL e o ARTISTA REAL que ele quis pedir.
Responda em uma frase curta com o título oficial e o artista oficial, por exemplo: A música é "Dormi na Praça", do Bruno e Marrone.
Se não existir nenhuma música correspondente, responda exatamente: NAO ENCONTRADO
`;
  const t = await claudeBusca(prompt1);
  if (!t) return null;
  if (/n[aã]o\s+encontrad/i.test(t)) return null;
  const prompt2 = `
Do texto a seguir, extraia a música e o artista mencionados.
Texto: """${t}"""
Se o texto disser claramente que não encontrou, use encontrou=false.
Responda APENAS com JSON, sem texto fora do JSON:
{"encontrou":true ou false,"titulo":"Título Oficial ou null","artista":"Artista Oficial ou null"}
`;
  const out = await claudeJSON<{ encontrou: boolean; titulo: string | null; artista: string | null }>(prompt2);
  if (!out || !out.encontrou || !out.titulo) return null;
  return { titulo: out.titulo, artista: out.artista ?? null };
}

// Transcreve um audio do WhatsApp nos bastidores (Groq Whisper). Retorna o texto falado ou null.
async function transcreverAudio(url: string, mime: string): Promise<string | null> {
  if (!GROQ_API_KEY) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`download de audio falhou: status=${r.status}`);
      return null;
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 24_000_000) {
      console.error(`audio grande demais para transcrever: ${bytes.length} bytes`);
      return null;
    }
    const tipo = (mime || "audio/ogg").toLowerCase();
    const ext = tipo.includes("mp4") || tipo.includes("m4a") || tipo.includes("aac")
      ? "m4a"
      : tipo.includes("mpeg") || tipo.includes("mp3")
      ? "mp3"
      : tipo.includes("wav")
      ? "wav"
      : tipo.includes("webm")
      ? "webm"
      : "ogg";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime || "audio/ogg" }), `audio.${ext}`);
    form.append("model", GROQ_MODEL);
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("temperature", "0");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: form,
    });
    if (!res.ok) {
      console.error(`Groq audio falhou: status=${res.status}`);
      return null;
    }
    const data = await res.json();
    const txt = data?.text;
    return (typeof txt === "string" && txt.trim()) ? txt.trim() : null;
  } catch (e) {
    console.error(`transcrever audio excecao: ${e}`);
    return null;
  }
}

// Busca 1 musica no catalogo gratuito (sem chave). Backup do grounding.
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

// Resolve a musica oficial: grounding (Google) -> catalogo. Retorna null quando nao acha (nunca inventa).
async function resolverMusicaOficial(
  textoBruto: string,
  artistaHint?: string | null,
): Promise<{ titulo: string; artista: string | null } | null> {
  const g = await buscarMusicaGrounding(textoBruto, artistaHint);
  if (g && g.titulo) {
    return { titulo: g.titulo, artista: g.artista ?? (artistaHint ? titleCasePtBr(artistaHint) : null) };
  }
  const termo = artistaHint ? `${artistaHint} ${textoBruto}` : textoBruto;
  const cat = await buscarMusicaCatalogo(termo);
  if (cat) return { titulo: cat.titulo, artista: cat.artista };
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
  return texto.trim().replace(/\b\w/g, (c) => c.toUpperCase());
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
  return await claudeJSON<{ bairro: string; zona: string }>(prompt);
}

// ===== ENDERECO POR CEP (portado do EthnosPRO, adaptado para a Adriana) =====
// So alimenta cidade e bairro; a zona continua sendo resolvida pela logica atual.
// fetch com timeout curto (via AbortController) para nao travar o webhook.
async function fetchComTimeout(url: string, ms = 5000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    console.error(`fetch de CEP falhou (${url}): ${e}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface EnderecoCep {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  provedor: string;
}

// Provedor 1: ViaCEP (gratis, sem chave).
async function consultarViaCep(d: string): Promise<EnderecoCep | null> {
  const r = await fetchComTimeout(`https://viacep.com.br/ws/${d}/json/`);
  if (!r) {
    console.error(`ViaCEP sem resposta para cep=${d}`);
    return null;
  }
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    console.error(`ViaCEP falhou: status=${r.status} corpo=${corpo.slice(0, 200)} cep=${d}`);
    return null;
  }
  let j: Record<string, unknown>;
  try {
    j = await r.json();
  } catch (e) {
    console.error(`ViaCEP JSON invalido cep=${d}: ${e}`);
    return null;
  }
  if (!j || j.erro) {
    console.error(`ViaCEP nao encontrou o cep=${d}`);
    return null;
  }
  return {
    logradouro: (j.logradouro as string) ?? "",
    bairro: (j.bairro as string) ?? "",
    localidade: (j.localidade as string) ?? "",
    uf: (j.uf as string) ?? "",
    provedor: "viacep",
  };
}

// Provedor 2: BrasilAPI (resiliencia). Mapeia street/neighborhood/city/state.
async function consultarBrasilApi(d: string): Promise<EnderecoCep | null> {
  const r = await fetchComTimeout(`https://brasilapi.com.br/api/cep/v2/${d}`);
  if (!r) {
    console.error(`BrasilAPI sem resposta para cep=${d}`);
    return null;
  }
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    console.error(`BrasilAPI falhou: status=${r.status} corpo=${corpo.slice(0, 200)} cep=${d}`);
    return null;
  }
  let j: Record<string, unknown>;
  try {
    j = await r.json();
  } catch (e) {
    console.error(`BrasilAPI JSON invalido cep=${d}: ${e}`);
    return null;
  }
  if (!j || !(j.street || j.neighborhood || j.city)) {
    console.error(`BrasilAPI resposta sem endereco cep=${d}`);
    return null;
  }
  return {
    logradouro: (j.street as string) ?? "",
    bairro: (j.neighborhood as string) ?? "",
    localidade: (j.city as string) ?? "",
    uf: (j.state as string) ?? "",
    provedor: "brasilapi",
  };
}

// Busca CEP em cascata: ViaCEP -> BrasilAPI -> null (fallback manual no fluxo).
async function consultarCep(cep: string): Promise<EnderecoCep | null> {
  const d = (cep ?? "").replace(/\D/g, "");
  if (d.length !== 8) {
    console.error(`CEP com digitos invalidos: "${d}" (${d.length} digitos)`);
    return null;
  }
  const via = await consultarViaCep(d);
  if (via) {
    console.log(`CEP ${d} resolvido pelo provedor: ${via.provedor}`);
    return via;
  }
  const brasil = await consultarBrasilApi(d);
  if (brasil) {
    console.log(`CEP ${d} resolvido pelo provedor: ${brasil.provedor}`);
    return brasil;
  }
  console.error(`CEP ${d} falhou em ViaCEP e BrasilAPI, cai no fallback manual`);
  return null;
}

// Parece um CEP: 8 digitos (com ou sem hifen).
function pareceCep(texto: string): boolean {
  if (/\b\d{5}-?\d{3}\b/.test(texto.trim())) return true;
  return texto.replace(/\D/g, "").length === 8;
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

// Marcadores estruturais do JSON de decisao do cerebroAdriana. Se aparecerem numa
// fala, e porque o modelo vazou o JSON dentro do texto: cortamos antes de enviar.
const MARCADORES_VAZAMENTO_JSON = [
  '"campos_extraidos"',
  '"proximo_campo"',
  '"e_pedido_musica"',
  '"musica_bruta"',
  '"artista_bruto"',
  '"qualquer_do_artista"',
  '"resposta_ao_ouvinte"',
];

// Rede de seguranca: garante que NENHUM pedaco do JSON do cerebro chegue ao ouvinte.
// Se a fala contiver um marcador do schema, corta ali e limpa aspas/chaves residuais.
function limparVazamentoJSON(texto: string): string {
  if (!texto) return texto;
  let corte = -1;
  for (const marca of MARCADORES_VAZAMENTO_JSON) {
    const i = texto.indexOf(marca);
    if (i !== -1 && (corte === -1 || i < corte)) corte = i;
  }
  if (corte === -1) return texto;
  // Remove o lixo estrutural que costuma anteceder o marcador (ex: ...!","campos_extraidos").
  return texto.slice(0, corte).replace(/["'{}\[\]\s,:]+$/g, "").trim();
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
  const corpoResp = await res.text().catch(() => "");
  if (!res.ok) {
    console.error(`Z-API send-text falhou: status=${res.status} corpo=${corpoResp}`);
  }
}

async function reply(
  phone: string,
  conversaId: string,
  radioId: string,
  message: string,
) {
  const limpo = limparVazamentoJSON(message);
  await sendText(phone, limpo);
  await db.from("mensagens").insert({
    conversa_id: conversaId,
    radio_id: radioId,
    direcao: "enviada",
    tipo: "texto",
    conteudo: limpo,
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

// Saudacoes/cortesias e prefixos de nome removidos do INICIO da resposta, em laco.
// Cada item e uma sequencia de palavras (normalizadas, sem acento). Ordena por tamanho desc.
const PREFIXOS_NOME: string[][] = [
  ["meu", "nome", "e"], ["pode", "me", "chamar", "de"], ["pode", "chamar", "de"],
  ["aqui", "e", "o"], ["aqui", "e", "a"], ["aqui", "e"], ["me", "chamo"],
  ["eu", "sou", "o"], ["eu", "sou", "a"], ["eu", "sou"], ["sou", "o"], ["sou", "a"], ["sou"],
  ["bom", "dia"], ["boa", "tarde"], ["boa", "noite"],
  ["tudo", "bem"], ["tudo", "bom"], ["tudo", "otimo"], ["tudo", "certo"], ["tudo", "tranquilo"],
  ["e", "ai"], ["oi"], ["ola"], ["alo"], ["opa"], ["salve"], ["eai"], ["eae"], ["fala"],
  ["hey"], ["hi"], ["hello"], ["beleza"], ["blz"], ["de", "boa"], ["suave"], ["tranquilo"],
].sort((a, b) => b.length - a.length);

// Extrai o nome proprio: tokeniza e descarta saudacoes/prefixos do inicio ate sobrar o nome.
// Se sobrar nome composto (ex: "Ana Paula"), mantem as duas palavras.
function extrairNomeProprio(texto: string): string {
  let s = texto.trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    s = s.replace(/^[\s,.!?;:-]+/, "");
    const palavras = s.split(/\s+/).filter(Boolean);
    if (!palavras.length) break;
    const norm = palavras.map((p) =>
      normalizarSemAcento(p.replace(/^[.,!?;:-]+|[.,!?;:-]+$/g, ""))
    );
    for (const pref of PREFIXOS_NOME) {
      if (palavras.length >= pref.length && pref.every((w, i) => norm[i] === w)) {
        s = palavras.slice(pref.length).join(" ");
        mudou = true;
        break;
      }
    }
  }
  return s.replace(/^[\s,.!?;:-]+|[\s,.!?;:-]+$/g, "").trim();
}

// Extrai o nome proprio via Claude (mesma Haiku). Timeout 4s; qualquer falha retorna null
// e o chamador cai no backup (extrairNomeProprio). Anti-invencao: so aceita nome cujas
// palavras realmente aparecem na mensagem original (token normalizado, sem acento).
async function extrairNomeIA(texto: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const prompt =
    `Você recebe a resposta de uma pessoa à pergunta "como você se chama?". ` +
    `Extraia APENAS o nome próprio (primeiro nome, ou nome e sobrenome se houver). ` +
    `Ignore saudações e cortesias como oi, olá, tudo bem, beleza, prazer, sou o, sou a, meu nome é, aqui é o. ` +
    `Se NÃO houver nome próprio na mensagem, responda exatamente a palavra VAZIO. ` +
    `NUNCA invente um nome que não esteja na mensagem. Responda só o nome, sem pontuação, sem frase.\n\n` +
    `Mensagem: """${texto}"""`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 40,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`extrairNomeIA falhou: status=${res.status}`);
      return null;
    }
    const data = await res.json();
    const txt = ((data?.content ?? []) as { type?: string; text?: string }[])
      .filter((b) => b?.type === "text")
      .map((b) => b?.text ?? "")
      .join(" ").trim().replace(/^["']+|["']+$/g, "").trim();
    if (!txt || normalizarSemAcento(txt) === "vazio") return null;
    // Anti-invencao: cada palavra do nome tem que existir na mensagem original.
    const limpaToken = (t: string) => t.replace(/[^a-z0-9]/g, "");
    const tokensMsg = new Set(
      normalizarSemAcento(texto).split(/\s+/).map(limpaToken).filter(Boolean),
    );
    const palavrasNome = normalizarSemAcento(txt).split(/\s+/).map(limpaToken).filter(Boolean);
    if (!palavrasNome.length || !palavrasNome.every((p) => tokensMsg.has(p))) {
      console.error(`extrairNomeIA descartado (nao deriva da mensagem): "${txt}"`);
      return null;
    }
    return txt;
  } catch (e) {
    console.error(`extrairNomeIA excecao: ${e}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

// Identidade fixa da Rádio Liverpool.
const RADIO_LABEL = "Rádio Liverpool";
const INSTAGRAM_URL = "https://www.instagram.com/estudiowa_?igsh=NjljZDdlMmc3d2Vs";

// Campos cujo texto de pergunta segue o roteiro VERBATIM (sem parafrase da IA).
const FALA_FIXA_CAMPOS = new Set([
  "data_nascimento",
  "pedido_musica",
  "estilo_musical",
  "radio_troca",
  "programa_locutor",
]);

const AFIRMATIVAS = new Set([
  "sim", "s", "quero", "quero sim", "claro", "pode ser", "bora", "aceito",
  "vai", "com certeza", "uhum", "aham", "pode", "manda", "quero pedir",
  "isso", "isso mesmo", "e essa", "e ela", "exato", "certo", "perfeito",
  "sim e essa", "essa mesmo", "e essa mesmo", "correto", "aha",
]);

const NEGATIVAS = new Set([
  "nao", "n", "nao tem", "nao tenho", "nenhuma", "nenhum", "nada", "nem uma",
  "nem um", "nao quero", "agora nao", "depois", "deixa", "deixa pra la",
  "to de boa", "nao obrigado", "nao mudo", "fico aqui", "fico na nativa",
  "fico na liverpool",
  "nao e essa", "nao e", "errado", "nao era essa", "outra",
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

const PREMIO_CADASTRADO = [
  `Pra concorrer aos prêmios da nossa ${RADIO_LABEL} é só você ficar na nossa escuta. Quando a gente falar pra você participar, você nos manda a mensagem!`,
  `Os prêmios da ${RADIO_LABEL} saem pra quem está na escuta! Fica ligado que, quando for a hora de participar, a gente avisa no ar e você me manda a mensagem.`,
];
const PREMIO_NOVO =
  `Pra concorrer a prêmios da ${RADIO_LABEL} você precisa participar da nossa pesquisa. Vamos participar? Qual é seu nome completo?`;

// Termos de DROGAS bloqueados. Detectados por substring.
const TERMOS_DROGAS = [
  "maconha", "cocaina", "crack", "cracudo", "droga", "drogas",
  "baseado", "beck", "haxixe", "lsd", "ecstasy", "mdma", "heroina",
  "metanfetamina", "merla", "lolo", "cheirar po",
];

// Palavroes/ofensas direcionadas. Resposta especifica e mais seca.
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
];

const RECUSAS_OFENSA = [
  "Quanto a isso não posso te responder. Porém, se quiser pedir uma música, só falar.",
  "Isso aí eu vou deixar passar. Mas tô à disposição pra deixar sua música no ar, é só mandar o nome!",
  "Não vou responder a isso, mas sem ressentimento. Se quiser ouvir uma música, é só me dizer qual.",
  "A esse tipo de mensagem eu não respondo, viu? Agora, música boa eu coloco pra tocar! Qual você quer?",
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

// ===== Cerebro conversacional da Adriana =====
type DecisaoCerebro = {
  resposta_ao_ouvinte: string;
  campos_extraidos: Record<string, string>;
  proximo_campo: string;
  e_pedido_musica: boolean;
  musica_bruta: string | null;
  artista_bruto: string | null;
  qualquer_do_artista: boolean;
};

// Lista ordenada de campos ainda faltantes (bairro so quando a cidade e Sao Paulo capital).
function camposFaltantes(
  o: Record<string, unknown>,
  flags: Record<string, unknown>,
): string[] {
  const capital = normalizarSemAcento((o.cidade as string) ?? "") === "sao paulo";
  const faltam: string[] = [];
  if (!o.nome) faltam.push("nome");
  if (!o.data_nascimento && flags.data_pulada !== true) faltam.push("data_nascimento");
  if (!o.cidade) faltam.push("cidade");
  if (capital && !o.bairro) faltam.push("bairro");
  if (flags.musica_pedida !== true) faltam.push("pedido_musica");
  if (!o.estilo_musical && flags.pulou_estilo !== true) faltam.push("estilo_musical");
  if (flags.radio_troca_pedida !== true) faltam.push("radio_troca");
  if (!o.programa_locutor && flags.pulou_programa !== true) faltam.push("programa_locutor");
  return faltam;
}

// PRIVACIDADE: o cerebro NAO recebe valores dos dados do ouvinte, so o primeiro nome
// (pro cumprimento) e a lista de campos que faltam. Assim nao ha como recitar dados.
function montarColetado(
  ouvinte: Record<string, unknown>,
  flags: Record<string, unknown>,
): Record<string, unknown> {
  const primeiro = ((ouvinte.nome as string) ?? "").trim().split(/\s+/)[0] || null;
  return {
    primeiro_nome: primeiro,
    campos_faltantes: camposFaltantes(ouvinte, flags),
  };
}

// Proxima pergunta faltante (usada no fallback e apos confirmar a musica).
function proximaPerguntaFaltante(
  o: Record<string, unknown>,
  flags: Record<string, unknown>,
): { campo: string; texto: string } {
  const capital = normalizarSemAcento((o.cidade as string) ?? "") === "sao paulo";
  if (!o.nome) return { campo: "nome", texto: "Pra te deixar ligado nas promoções, qual é o seu nome completo?" };
  if (!o.data_nascimento) return { campo: "data_nascimento", texto: `${o.nome ? (o.nome as string).split(/\s+/)[0] + ", v" : "V"}ocê pode me passar sua data de aniversário? Dia, mês e ano.` };
  if (!o.cidade) return { campo: "cidade", texto: "Em qual cidade você mora?" };
  if (capital && !o.bairro) return { campo: "bairro", texto: "E em qual bairro?" };
  if (flags.musica_pedida !== true) return { campo: "pedido_musica", texto: "Que legal! Seu cadastro já foi preenchido. Você gostaria de pedir uma música? Qual seria?" };
  if (!o.estilo_musical) return { campo: "estilo_musical", texto: "Aliás, qual estilo musical que você mais gosta?" };
  if (flags.radio_troca_pedida !== true) return { campo: "radio_troca", texto: "Além da Rádio Liverpool, qual outra rádio você gosta de ouvir?" };
  if (!o.programa_locutor) return { campo: "programa_locutor", texto: "O que você mais gosta aqui da Rádio Liverpool?" };
  return { campo: "concluido", texto: `Prontinho, é isso! Muito obrigada por participar. Continue ligado na ${RADIO_LABEL}!` };
}

function pushHist(
  hist: unknown,
  ouvinteTexto: string,
  adriaTexto: string,
): { de: string; texto: string }[] {
  const anterior = Array.isArray(hist) ? hist as { de: string; texto: string }[] : [];
  return [...anterior, { de: "ouvinte", texto: ouvinteTexto }, { de: "adriana", texto: adriaTexto }].slice(-8);
}

async function cerebroAdriana(
  historico: { de: string; texto: string }[],
  coletado: Record<string, unknown>,
  mensagem: string,
): Promise<DecisaoCerebro | null> {
  const hist = (historico ?? []).map((h) =>
    `${h.de === "ouvinte" ? "Ouvinte" : "Adriana"}: ${h.texto}`
  ).join("\n") || "(inicio da conversa)";
  const primeiroNome = (coletado.primeiro_nome as string | null) ?? "";
  const faltantes = (coletado.campos_faltantes as string[]) ?? [];
  const prompt = `
Você é a Adriana, atendente simpática e animada da rádio ${RADIO_LABEL}, no WhatsApp. Fala português do Brasil com acentos corretos, tom de rádio, natural e acolhedor. NUNCA use travessão.

PRIVACIDADE (regra absoluta): os dados do ouvinte são informação INTERNA do sistema. Você NUNCA repete, lista, cita ou confirma em voz alta qualquer dado dele (nem sobrenome, nem data de nascimento, nem cidade, bairro, estilo musical, rádios, programa ou locutor). O ÚNICO dado que você pode usar é o PRIMEIRO NOME, e só no cumprimento (ex.: "Opa, Fulano!"). Nada além disso. Nunca diga frases do tipo "já tenho aqui seu nome/sua cidade...".

O OuvintePro cadastra os ouvintes pra participarem das promoções e registra os gostos musicais. Você coleta UMA COISA POR VEZ.

Primeiro nome do ouvinte (use só no cumprimento; pode estar vazio): "${primeiroNome}"
Se o primeiro nome estiver vazio, NÃO use nome nenhum nem invente placeholder (nada de "[Nome do ouvinte]", "[nome]" ou parecido); apenas fale de forma natural, sem citar nome.
Campos que ainda faltam coletar, em ordem de prioridade: ${JSON.stringify(faltantes)}

Significado dos campos: nome=nome completo; data_nascimento=dia/mês/ano; cidade; bairro (só aparece na lista quando é São Paulo capital); pedido_musica=uma música que a pessoa queira ouvir; estilo_musical=estilo preferido; radio_troca=outra rádio que ela também gosta de ouvir; programa_locutor=o que ela mais gosta na ${RADIO_LABEL}.

Histórico recente da conversa:
${hist}

Nova mensagem do ouvinte: """${mensagem}"""

Regras:
- Pergunte APENAS o primeiro campo que ainda falta (o primeiro item de campos_faltantes). NUNCA pergunte um campo que não está nessa lista. Se a lista estiver vazia, NÃO pergunte cadastro: apenas converse de forma simpática e trate pedidos de música.
- Se for a primeira interação (sem histórico), se apresente rapidinho como Adriana da ${RADIO_LABEL} e já pergunte o primeiro campo que falta.
- Uma pergunta por vez, breve e natural. Aceite respostas informais, sem exigir formato.
- Música (REGRA DE OURO): só existe pedido de música quando há um TEXTO de música que a pessoa digitou. Se a pessoa citar SÓ o CANTOR (sem nome de música), marque e_pedido_musica=true, ponha o cantor em artista_bruto e deixe musica_bruta null; o sistema vai perguntar a música e esperar. NUNCA trate só o cantor como se fosse a música. Se citar a MÚSICA (com ou sem cantor), ponha o texto cru dela em musica_bruta e o cantor, se houver, em artista_bruto. Se, ao ser perguntada qual música do cantor, a pessoa disser "qualquer uma", "tanto faz", "não sei", "o que tiver", "você escolhe" ou algo assim, marque qualquer_do_artista=true e ponha o cantor em artista_bruto (deixe musica_bruta null) — isso significa aceitar qualquer música daquele artista, sem música específica. NUNCA invente nome de música nem corrija a grafia; quem busca e confirma com a fonte oficial é o sistema.
- Em campos_extraidos, coloque SÓ o que a mensagem atual permitiu preencher, e SÓ para campos que estão em campos_faltantes, usando exatamente os nomes de campo. Para data_nascimento use AAAA-MM-DD só se tiver certeza do ANO; se faltar o ano, NÃO preencha.
- proximo_campo: o próximo campo que falta, ou "concluido" se não falta nada.
Responda APENAS com JSON, sem texto fora do JSON:
{"resposta_ao_ouvinte":"...","campos_extraidos":{},"proximo_campo":"...","e_pedido_musica":false,"musica_bruta":null,"artista_bruto":null,"qualquer_do_artista":false}
`;
  return await claudeJSON<DecisaoCerebro>(prompt);
}

// Gera UMA fala natural da Adriana a partir de uma intencao interna. TODA fala do
// fluxo de musica passa por aqui: o codigo nunca escreve frase fixa pro ouvinte.
async function falaAdriana(
  instrucao: string,
  primeiroNome: string,
  jaSaudou = false,
): Promise<string | null> {
  // jaSaudou=true significa que a conversa ja teve mensagens antes (nao e o primeiro
  // contato). Nesse caso a Adriana NAO deve cumprimentar de novo, so ir direto ao ponto.
  const temNome = primeiroNome.trim().length > 0;
  const regraNomeSempre = temNome
    ? ` Como uma locutora de radio que ja conhece a pessoa, use SEMPRE o primeiro nome dela ("${primeiroNome}") de forma natural e calorosa nesta mensagem, no meio ou no fim da frase (ex: "Qual e a sua data de nascimento, ${primeiroNome}?"). O nome deve aparecer fluido, NUNCA grudado no comeco como saudacao, e sem virar um novo cumprimento.`
    : "";
  const regraSaudacao = jaSaudou
    ? `Esta NAO e a primeira mensagem desta conversa. NAO cumprimente de novo: nada de "Oi", "Ola", "Opa", "Tudo bem", "Bom dia", "Boa tarde", "Boa noite".${regraNomeSempre} Va direto ao ponto da intencao.`
    : `Se fizer sentido, voce pode cumprimentar o ouvinte de forma calorosa, usando o primeiro nome no cumprimento se houver.`;
  const prompt = `
Você é a Adriana, atendente simpática e animada da rádio ${RADIO_LABEL} no WhatsApp. Fala português do Brasil com acentos corretos, tom de rádio, natural e caloroso. NUNCA use travessão. NUNCA escreva "(responde sim ou não)" nem instruções robóticas; a própria frase já convida a resposta.
Primeiro nome do ouvinte (pode estar vazio): "${primeiroNome}". NUNCA cite nenhum outro dado do ouvinte. Se o primeiro nome estiver vazio, NÃO use nome nenhum nem invente placeholder (nada de "[Nome do ouvinte]" ou parecido); apenas fale sem citar nome.
${regraSaudacao}
Escreva UMA mensagem curta (1 ou 2 frases) para o ouvinte cumprindo esta intenção interna (a intenção é só sua, não a repita literalmente): ${instrucao}
Responda APENAS com o texto da mensagem, sem aspas, sem JSON.
`;
  const t = await claudeTexto(prompt);
  return t ? t.replace(/^["']+|["']+$/g, "").trim() : null;
}

// Conectores/verbos comuns antes do nome da radio. "radio/rádio" NAO entra aqui:
// so e removida se sobrar sozinha (conector puro), preservando "Radio Globo", "Radio Mix" etc.
const STOP_RADIO_INICIO = new Set([
  "eu", "voce", "vc", "a", "gente", "troco", "mudo", "muda", "vou", "viro",
  "passo", "pra", "para", "pro", "pras", "pros", "o", "na", "no", "numa", "num",
  "de", "do", "da", "escuto", "ouco", "coloco", "ponho", "boto", "sempre",
  "geralmente", "normalmente", "as", "vezes", "quando", "costumo", "fico", "mais",
  "ai", "entao", "gosto", "curto", "prefiro", "sintonizo", "vou pra",
]);

// Extrai o nome da radio de uma frase natural, removendo conectores do INICIO.
function extrairRadioDaFrase(texto: string): string {
  const limpo = texto.trim().replace(/[.!?,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  let palavras = limpo.split(" ");
  while (palavras.length && STOP_RADIO_INICIO.has(normalizarSemAcento(palavras[0]))) {
    palavras.shift();
  }
  // "radio"/"rádio" sozinha (sem nome depois) e conector puro -> descarta.
  if (palavras.length === 1 && /^r[aá]dio$/i.test(palavras[0])) palavras = [];
  return palavras.join(" ").trim();
}

// Negativa de troca de radio ("nao mudo", "fico na Nativa", "nao troco", "nenhuma"...).
function ehNegativaRadio(texto: string): boolean {
  const n = normalizarSemAcento(texto);
  if (NEGATIVAS.has(n)) return true;
  return /\b(nao (mudo|muda|troco|saio|mexo|mudo de radio)|fico (na nativa|na liverpool|aqui|com voces|com a nativa|com a liverpool)|nenhuma|so (a )?(nativa|liverpool)|(nativa|liverpool) mesmo|nao troco)\b/
    .test(n);
}

// Intencao interna do proximo campo de cadastro (usada quando a Adriana segue apos a musica).
function intencaoProximoCampo(campo: string): string {
  switch (campo) {
    case "nome":
      return "peça o nome completo dele pra cadastrar nas promoções";
    case "data_nascimento":
      return "pergunte a data de nascimento dele, no formato dia, mês e ano";
    case "cidade":
      return "pergunte em qual cidade ele mora";
    case "bairro":
      return "pergunte em qual bairro ele mora";
    case "pedido_musica":
      return "pergunte se ele quer pedir uma música";
    case "estilo_musical":
      return "pergunte qual estilo musical ele mais gosta";
    case "radio_troca":
      return "pergunte pra qual rádio ele troca quando não gosta da música que está tocando";
    case "programa_locutor":
      return `pergunte se ele tem um programa ou locutor preferido aqui na ${RADIO_LABEL}`;
    default:
      return "puxe papo de forma simpática";
  }
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

  // Idempotencia: ignora entrega duplicada da Z-API (mesmo messageId).
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

  // Multi-tenant: identifica a radio pelo instanceId (fallback: unica radio ativa).
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

  // Janela de 5 min: acha a conversa mais recente ANTES de atualizar atividade.
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
    const { data: nova } = await db
      .from("conversas")
      .insert({ radio_id: radioId, ouvinte_id: ouvinteId, etapa: "cadastro" })
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

  // Audio: transcreve nos bastidores (Groq Whisper) e segue como se fosse texto.
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
  const ctx = (conversa.contexto as Record<string, unknown> | null) ?? {};
  const flags = (ctx.flags as Record<string, unknown> | null) ?? {};
  // Ja houve mensagem antes nesta conversa? Se sim, a Adriana nao cumprimenta de novo.
  const jaSaudou = Array.isArray(ctx.historico) &&
    (ctx.historico as unknown[]).length > 0;

  // Nao achou a musica na busca: a Adriana pede o nome de novo, sem inventar nada.
  async function reperguntarMusica(flagsBase: Record<string, unknown>) {
    const inst = "você não encontrou a música que o ouvinte pediu; peça de forma calorosa e curta pra ele repetir o nome da música e quem canta, sem chutar nenhum nome";
    const fallback = `Não encontrei essa aqui${primeiroNome ? ", " + primeiroNome : ""}, me diz de novo o nome da música e quem canta?`;
    const msg = (await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fallback;
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "cadastro",
      contexto: { flags: flagsBase, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
  }

  // Grava os votos (cantor e/ou musica) e a Adriana agradece e segue pro proximo passo.
  // titulo preenchido = voto de musica; artista preenchido = voto de cantor. 1 linha p/ os dois.
  async function gravarVotosESeguir(
    titulo: string | null,
    artista: string | null,
    flagsBase: Record<string, unknown>,
  ) {
    const textoOrig = (titulo && artista)
      ? `${titulo} - ${artista}`
      : (titulo ?? artista ?? "");
    await gravarMusica(radioId, ouvinteId, "ama", artista, titulo, textoOrig);
    const flags2: Record<string, unknown> = { ...flagsBase, musica_pedida: true };
    const prox = proximaPerguntaFaltante(ouvinte, flags2);
    const concluido = prox.campo === "concluido";
    // O que foi realmente registrado: musica (com o nome oficial ja corrigido) ou so o cantor.
    const oQueAnotou = titulo
      ? (artista ? `a música "${titulo}", do ${artista}` : `a música "${titulo}"`)
      : `o cantor ${artista}`;
    const inst = concluido
      ? `você acabou de anotar ${oQueAnotou} pro ouvinte; avise com naturalidade e carinho que anotou isso (mencionando o nome que foi anotado) e convide ele a continuar ouvindo a ${RADIO_LABEL}`
      : `você acabou de anotar ${oQueAnotou} pro ouvinte; avise com naturalidade e carinho que anotou isso (mencionando o nome que foi anotado) e, na sequência, ${intencaoProximoCampo(prox.campo)}`;
    const anotadoFrase = titulo
      ? (artista ? `Anotei "${titulo}", do ${artista}` : `Anotei "${titulo}"`)
      : `Anotei o ${artista}`;
    const fallback = concluido
      ? `${anotadoFrase}${primeiroNome ? ", " + primeiroNome : ""}! Obrigada por participar. Continue ligado na ${RADIO_LABEL}!`
      : `${anotadoFrase}! ${prox.texto}`;
    // Mantem o feedback "Anotei X" e usa a pergunta VERBATIM do roteiro pro proximo campo.
    let msg = FALA_FIXA_CAMPOS.has(prox.campo)
      ? `${anotadoFrase}! ${prox.texto}`
      : ((await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fallback);
    if (concluido && flags2.concluido !== true) {
      flags2.concluido = true;
      msg = `${msg} Segue a gente no Instagram: ${INSTAGRAM_URL}`;
      await db.from("ouvintes").update({
        participacoes: (ouvinte.participacoes ?? 0) + 1,
      }).eq("id", ouvinteId);
    }
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: concluido ? "concluido" : "cadastro",
      contexto: { flags: flags2, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
  }

  // Trata a resposta de radio_troca (extrai nome de frase natural, registra e segue).
  // Deterministico: nao depende do cerebro (imune a 429), nunca entra em loop.
  async function handleRadioTroca(radioAlvoRaw: string) {
    const flags2: Record<string, unknown> = { ...flags, radio_troca_pedida: true };
    let registrou = false;
    if (!ehNegativaRadio(radioAlvoRaw)) {
      const bruto = extrairRadioDaFrase(radioAlvoRaw);
      const alnum = normalizarSemAcento(bruto).replace(/[^a-z0-9]/g, "");
      if (alnum.length >= 2) {
        for (const item of splitLista(bruto)) {
          const nc = await resolverRadio(item);
          await db.from("radios_concorrentes").insert({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome_radio: item,
            nome_canonico: nc,
          });
        }
        registrou = true;
      } else if (flags.radio_tentativa !== true) {
        // 1a vez sem nome identificavel: pede de novo UMA vez, de forma natural (nao identica).
        const reask = (await falaAdriana(
          "o ouvinte nao deixou claro pra qual radio ele troca quando nao gosta da musica; pergunte de novo, de um jeito diferente e natural, o nome da radio que ele coloca",
          primeiroNome,
          jaSaudou,
        )) ?? `E me diz${primeiroNome ? ", " + primeiroNome : ""}, qual rádio você coloca quando não curte a música que tá tocando?`;
        const hist = pushHist(ctx.historico, texto, reask);
        await db.from("conversas").update({
          etapa: "cadastro",
          contexto: { flags: { ...flags, radio_tentativa: true }, historico: hist },
        }).eq("id", conversaId);
        await reply(phone, conversaId, radioId, reask);
        return;
      }
      // 2a vez ainda vazio: desiste (flags2.radio_troca_pedida ja true) e segue.
    }
    // Registrou ou ficou na Rádio Liverpool: a Adriana agradece/segue pro proximo campo.
    const prox = proximaPerguntaFaltante(ouvinte, flags2);
    const concluido = prox.campo === "concluido";
    const inst = concluido
      ? `agradeça e convide o ouvinte a continuar ouvindo a ${RADIO_LABEL}`
      : `${registrou ? "anotei a rádio que ele troca quando não gosta; " : `tudo bem, ele fica na ${RADIO_LABEL}; `}na sequência, ${intencaoProximoCampo(prox.campo)}`;
    const fallbackMsg = concluido
      ? `Show${primeiroNome ? ", " + primeiroNome : ""}! Obrigada por participar. Continue ligado na ${RADIO_LABEL}!`
      : `Show! ${prox.texto}`;
    let msg = FALA_FIXA_CAMPOS.has(prox.campo)
      ? prox.texto
      : ((await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fallbackMsg);
    if (concluido && flags2.concluido !== true) {
      flags2.concluido = true;
      msg = `${msg} Segue a gente no Instagram: ${INSTAGRAM_URL}`;
      await db.from("ouvintes").update({
        participacoes: (ouvinte.participacoes ?? 0) + 1,
      }).eq("id", ouvinteId);
    }
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: concluido ? "concluido" : "cadastro",
      contexto: { flags: flags2, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
  }

  // Grava o campo e a Adriana pergunta o proximo (fala natural via falaAdriana).
  async function avancarCadastro(
    updObj: Record<string, unknown>,
    flags2: Record<string, unknown>,
    extraCtx?: Record<string, unknown>,
  ) {
    if (Object.keys(updObj).length) {
      await db.from("ouvintes").update(updObj).eq("id", ouvinteId);
    }
    const ouv2 = { ...ouvinte, ...updObj };
    // Primeiro nome ATUALIZADO (o nome pode ter acabado de ser gravado neste turno).
    const pn = ((ouv2.nome as string) ?? "").trim().split(/\s+/)[0] || primeiroNome;
    const prox = proximaPerguntaFaltante(ouv2, flags2);
    // Se o proximo campo e a cidade, capturamos o endereco por CEP em vez de perguntar
    // cidade/bairro em texto livre. Se o ouvinte ja desistiu do CEP (cep_desistiu), segue
    // pelo fluxo antigo de texto livre, sem re-perguntar o CEP.
    if (prox.campo === "cidade" && flags2.cep_desistiu !== true) {
      const msgCep = "Você pode me passar certinho o CEP da sua casa?";
      const histCep = pushHist(ctx.historico, texto, msgCep);
      await db.from("conversas").update({
        etapa: "aguarda_cep",
        contexto: { flags: flags2, historico: histCep, ...(extraCtx ?? {}) },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, msgCep);
      return;
    }
    const concluido = prox.campo === "concluido";
    const inst = concluido
      ? `agradeça e convide o ouvinte a continuar ouvindo a ${RADIO_LABEL}`
      : intencaoProximoCampo(prox.campo);
    const fallback = concluido
      ? `Prontinho${pn ? ", " + pn : ""}! Obrigada por participar. Continue ligado na ${RADIO_LABEL}!`
      : prox.texto;
    // Campos do roteiro com texto fixo: envia verbatim, sem parafrase da IA.
    let msg = FALA_FIXA_CAMPOS.has(prox.campo)
      ? prox.texto
      : ((await falaAdriana(inst, pn, jaSaudou)) ?? fallback);
    if (concluido && flags2.concluido !== true) {
      flags2.concluido = true;
      msg = `${msg} Segue a gente no Instagram: ${INSTAGRAM_URL}`;
      await db.from("ouvintes").update({
        participacoes: (ouvinte.participacoes ?? 0) + 1,
      }).eq("id", ouvinteId);
    }
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: concluido ? "concluido" : "cadastro",
      contexto: { flags: flags2, historico: hist, ...(extraCtx ?? {}) },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
  }

  // Repergunta UMA vez, de forma natural (nao identica), setando uma flag de tentativa.
  async function reperguntar(
    instrucao: string,
    fallback: string,
    flagsMerge: Record<string, unknown>,
  ) {
    const msg = (await falaAdriana(instrucao, primeiroNome, jaSaudou)) ?? fallback;
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "cadastro",
      contexto: { flags: { ...flags, ...flagsMerge }, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
  }

  // Trata deterministico UM campo de cadastro (antes do cerebro; imune a 503/429, sem loop).
  async function handleCampoCadastro(campo: string) {
    const flags2: Record<string, unknown> = { ...flags };
    const anoAtual = new Date().getUTCFullYear();

    if (campo === "nome") {
      // Tira "ja falei que.../falei que..." pra sobrar a resposta limpa.
      const semReclamacao = texto.replace(
        /^(ja falei[,\s]*(que\s+)?(é|eh|e)?|eu ja disse[,\s]*(que\s+)?|falei[,\s]*(que\s+)?)\s+/i,
        "",
      );
      // Captura pela IA (Claude); se falhar/timeout/nao derivar, cai no backup regex.
      const viaIA = await extrairNomeIA(texto);
      const base = viaIA ?? extrairNomeProprio(semReclamacao);
      const soLetras = base.replace(/[^A-Za-zÀ-ÿ]/g, "");
      const naoEhNome = base.trim().length === 0 ||
        SAUDACOES_NAO_NOME.has(normalizarSemAcento(base)) || soLetras.length < 2;
      if (naoEhNome && flags.nome_tentativa !== true) {
        await reperguntar(
          `voce ainda nao pegou o nome do ouvinte; se apresente rapidinho como Adriana da ${RADIO_LABEL} e peca o nome completo dele, de um jeito diferente`,
          "Antes da gente começar, como você se chama? Pode mandar seu nome completo.",
          { nome_tentativa: true },
        );
        return;
      }
      const nome = titleCasePtBr(naoEhNome ? texto.trim() : base) || texto.trim();
      // Grava o nome e pede o consentimento LGPD ANTES de seguir pra data de nascimento.
      await db.from("ouvintes").update({ nome }).eq("id", ouvinteId);
      const pn = (nome.split(/\s+/)[0] || nome);
      const msgLGPD =
        `Que legal que você está aqui com a gente, ${pn}! Podemos fazer um cadastro seu pra futuras promoções? E pode ficar tranquilo, seus dados estão protegidos de acordo com a LGPD 🙂`;
      const histLGPD = pushHist(ctx.historico, texto, msgLGPD);
      await db.from("conversas").update({
        etapa: "aguarda_consentimento",
        contexto: { flags: flags2, historico: histLGPD },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, msgLGPD);
      return;
    }

    if (campo === "data_nascimento") {
      // Sub-passo: aguardando so o ANO.
      if (flags.aguardando_ano === true) {
        const d = texto.replace(/\D/g, "");
        let ano = 0;
        if (d.length === 4) ano = parseInt(d, 10);
        else if (d.length === 2) {
          const a = parseInt(d, 10);
          ano = a <= 25 ? 2000 + a : 1900 + a;
        }
        if (!ano || ano < 1900 || ano > anoAtual) {
          if (flags.ano_tentativa === true) {
            // Desiste da data pra nao travar (pula).
            const f2: Record<string, unknown> = { ...flags };
            delete f2.aguardando_ano;
            delete f2.ano_tentativa;
            delete f2.data_tentativa;
            f2.data_pulada = true;
            await avancarCadastro({}, f2);
            return;
          }
          await reperguntar(
            "voce so precisa do ANO de nascimento; peca so o ano com 4 numeros (ex: 1990), de um jeito natural",
            "Só o ano mesmo, com 4 números, tipo 1990. Qual ano você nasceu?",
            { ano_tentativa: true },
          );
          return;
        }
        const iso = `${ano}-01-01`;
        const idade = anoAtual - ano;
        const { data: faixa } = await db.from("faixas_etarias").select("id")
          .lte("idade_min", idade).or(`idade_max.gte.${idade},idade_max.is.null`)
          .order("id").limit(1).maybeSingle();
        const f2: Record<string, unknown> = { ...flags };
        delete f2.aguardando_ano;
        delete f2.ano_tentativa;
        delete f2.data_tentativa;
        await avancarCadastro({
          data_nascimento: iso,
          idade,
          faixa_etaria: faixa?.id ?? null,
        }, f2);
        return;
      }
      const iso = parseAniversario(texto);
      if (iso) {
        const idade = calcularIdade(iso);
        const { data: faixa } = await db.from("faixas_etarias").select("id")
          .lte("idade_min", idade).or(`idade_max.gte.${idade},idade_max.is.null`)
          .order("id").limit(1).maybeSingle();
        await avancarCadastro({
          data_nascimento: iso,
          idade,
          faixa_etaria: faixa?.id ?? null,
        }, flags2);
        return;
      }
      const temDiaMes = /\d{1,2}\s*[\/\-.\s]\s*\d{1,2}/.test(texto);
      const temAno4 = /\d{4}/.test(texto);
      if (temDiaMes && !temAno4) {
        await reperguntar(
          "faltou o ano na data de nascimento; pergunte em que ano ele nasceu, de forma natural",
          "Faltou o ano. Em que ano você nasceu? (ex: 1990)",
          { aguardando_ano: true },
        );
        return;
      }
      if (flags.data_tentativa !== true) {
        await reperguntar(
          "voce nao entendeu a data de nascimento; peca de novo no formato dia/mes/ano (ex: 28/01/1995), natural e diferente",
          "Não peguei direito. Pode mandar sua data assim, por exemplo: 28/01/1995?",
          { data_tentativa: true },
        );
        return;
      }
      // 2a falha: pede so o ano.
      await reperguntar(
        "peca so o ano de nascimento, com 4 numeros, de forma natural",
        "Sem problema. Me diz só o ano que você nasceu, tipo 1990.",
        { aguardando_ano: true },
      );
      return;
    }

    if (campo === "cidade") {
      const alvo = normalizarSemAcento(texto);
      let cidade = titleCasePtBr(texto);
      let loc: Record<string, unknown> = { tipo: "outra", zona: "Outras" };
      const upd: Record<string, unknown> = {};
      if (alvo === "sao paulo" || alvo === "sp") {
        cidade = "São Paulo";
        loc = { tipo: "capital", zona: "" };
      } else {
        const c = await resolverGrandeSP(texto);
        if (c) {
          cidade = c;
          loc = { tipo: "grandesp", zona: c };
          upd.zona = c;
        } else {
          upd.zona = "Outras";
        }
      }
      upd.cidade = cidade;
      await avancarCadastro(upd, flags2, { loc });
      return;
    }

    if (campo === "bairro") {
      const loc =
        (ctx.loc as { tipo?: string; zona?: string } | null) ??
          { tipo: "outra", zona: "Outras" };
      let bairroFinal = titleCasePtBr(texto);
      let zona = loc.zona || "Outras";
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
      await avancarCadastro({ bairro: bairroFinal, zona }, flags2);
      return;
    }

    if (campo === "estilo_musical") {
      if (NEGATIVAS.has(normalizarSemAcento(texto))) {
        await avancarCadastro({}, { ...flags2, pulou_estilo: true });
      } else {
        await avancarCadastro({ estilo_musical: titleCasePtBr(texto) }, flags2);
      }
      return;
    }

    if (campo === "programa_locutor") {
      if (NEGATIVAS.has(normalizarSemAcento(texto))) {
        await avancarCadastro({}, { ...flags2, pulou_programa: true });
      } else {
        await avancarCadastro({ programa_locutor: titleCasePtBr(texto) }, flags2);
      }
      return;
    }
  }

  // ===== GUARDA-CORPO: ofensa e drogas ANTES de tudo (a IA nunca ve isso) =====
  if (isTexto) {
    const ehOfensa = listaContemTermo(texto, TERMOS_OFENSA);
    const ehDroga = !ehOfensa && listaContemTermo(texto, TERMOS_DROGAS);
    if (ehOfensa || ehDroga) {
      const n = (flags.bloqueio as number) ?? 0;
      const lista = ehOfensa ? RECUSAS_OFENSA : RECUSAS_DROGAS;
      const recusa = lista[Math.min(n, lista.length - 1)];
      const pendente = proximaPerguntaFaltante(ouvinte, flags).texto;
      await db.from("conversas").update({
        contexto: { ...ctx, flags: { ...flags, bloqueio: n + 1 } },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, `${recusa} ${pendente}`);
      return new Response("ok", { status: 200 });
    }
  }

  // ===== PROMOCAO por hashtag: "#nomedapromocao" registra a participacao =====
  if (isTexto && texto.trim().startsWith("#")) {
    const nomePromo = texto.trim().slice(1).trim().replace(/\s+/g, " ");
    if (nomePromo) {
      // PREPARADO: a tabela promocao_participacoes ainda NAO existe (sera criada em outra tarefa).
      // O insert do supabase-js NAO lanca excecao: em erro (ex: tabela inexistente) so retorna { error },
      // que apenas logamos. Assim o fluxo nunca quebra enquanto a tabela nao existir.
      const { error: promoErr } = await db.from("promocao_participacoes").insert({
        radio_id: radioId,
        ouvinte_id: ouvinteId,
        promocao_nome: nomePromo,
      });
      if (promoErr) {
        console.error(`promocao_participacoes insert falhou (tabela pode nao existir ainda): ${promoErr.code} ${promoErr.message}`);
      }
      const msg = `Anotei sua participação na promoção ${nomePromo}! Boa sorte 🙂`;
      const hist = pushHist(ctx.historico, texto, msg);
      await db.from("conversas").update({
        contexto: { ...ctx, flags, historico: hist },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, msg);
      return new Response("ok", { status: 200 });
    }
  }

  // ===== CONSENTIMENTO LGPD: pedido logo apos o nome, antes da data de nascimento =====
  if (isTexto && etapa === "aguarda_consentimento") {
    const chave = normalizarSemAcento(texto);
    const recusou = NEGATIVAS.has(chave) ||
      /\bnao\b|\bagora nao\b|\bnao quero\b|\bnao aceito\b/.test(chave);
    if (recusou) {
      const msg =
        "Sem problema! Só que sem seus dados eu não consigo seguir com o atendimento. Se mudar de ideia e quiser continuar, é só me chamar!";
      const hist = pushHist(ctx.historico, texto, msg);
      await reply(phone, conversaId, radioId, msg);
      await db.from("conversas").update({
        status: "encerrada",
        etapa: "encerrado_sem_consentimento",
        encerrada_em: new Date().toISOString(),
        contexto: { ...ctx, flags: { ...flags, consentimento: false }, historico: hist },
      }).eq("id", conversaId);
      return new Response("ok", { status: 200 });
    }
    // Qualquer confirmacao (ou resposta nao-negativa): segue pro nascimento.
    const msg =
      `${primeiroNome ? primeiroNome + ", v" : "V"}ocê pode me passar sua data de aniversário? Dia, mês e ano.`;
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "cadastro",
      contexto: { ...ctx, flags: { ...flags, consentimento: true }, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
    return new Response("ok", { status: 200 });
  }

  // ===== ENDERECO POR CEP: pede, confirma e grava cidade+bairro (zona pela logica atual) =====
  // Fallback manual (recusa / 2 falhas): volta ao fluxo antigo de cidade em texto livre.
  async function pedirCidadeManual(flagsBase: Record<string, unknown>) {
    const inst = "tudo bem, sem CEP; pergunte de forma leve em qual cidade o ouvinte mora";
    const fb = "Sem problema! Em qual cidade você mora?";
    const msg = (await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fb;
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "cadastro",
      contexto: { flags: { ...flagsBase, cep_desistiu: true }, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
  }

  if (isTexto && etapa === "aguarda_cep") {
    const chave = normalizarSemAcento(texto);
    // Recusa explicita ou "nao sei/nao tenho o CEP": cai no manual, sem travar o cadastro.
    if (NEGATIVAS.has(chave) || /nao\s+(sei|lembro|tenho)/.test(chave)) {
      await pedirCidadeManual(flags);
      return new Response("ok", { status: 200 });
    }
    const end = await consultarCep(texto);
    if (end) {
      const cidadeCep = (end.localidade || "").trim();
      const bairroCep = (end.bairro || "").trim();
      const flags2 = { ...flags };
      delete flags2.cep_tentativa;
      const msg = bairroCep
        ? `Achei aqui que você mora na ${bairroCep}, é isso mesmo?`
        : `Achei aqui que você mora em ${cidadeCep}, é isso mesmo?`;
      const hist = pushHist(ctx.historico, texto, msg);
      await db.from("conversas").update({
        etapa: "aguarda_confirma_endereco",
        contexto: {
          flags: flags2,
          historico: hist,
          endereco_pendente: { cidade: cidadeCep, bairro: bairroCep },
        },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, msg);
      return new Response("ok", { status: 200 });
    }
    // Nao achou o CEP. Ja tentou uma vez? cai no manual. Senao, pede de novo.
    if (flags.cep_tentativa === true) {
      await pedirCidadeManual(flags);
      return new Response("ok", { status: 200 });
    }
    const inst = "voce nao achou esse CEP; com leveza, peca pra pessoa conferir e mandar o CEP de novo";
    const fb = "Não achei esse CEP aqui. Será que saiu trocado? Confere e manda de novo pra mim?";
    const msg = (await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fb;
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "aguarda_cep",
      contexto: { flags: { ...flags, cep_tentativa: true }, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
    return new Response("ok", { status: 200 });
  }

  if (isTexto && etapa === "aguarda_confirma_endereco") {
    const pend = (ctx.endereco_pendente as { cidade?: string; bairro?: string } | null) ?? null;
    const chave = normalizarSemAcento(texto);
    // Recusou o endereco: ja tentou? vai pro manual; senao pede o CEP de novo.
    if (NEGATIVAS.has(chave)) {
      if (flags.cep_tentativa === true) {
        await pedirCidadeManual(flags);
        return new Response("ok", { status: 200 });
      }
      const inst = "talvez o CEP tenha vindo trocado; peca com leveza pra pessoa conferir e mandar o CEP de novo";
      const fb = "Ah, então talvez esse CEP esteja trocado. Sem problema! Me manda o CEP de novo?";
      const msg = (await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fb;
      const hist = pushHist(ctx.historico, texto, msg);
      await db.from("conversas").update({
        etapa: "aguarda_cep",
        contexto: { flags: { ...flags, cep_tentativa: true }, historico: hist },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, msg);
      return new Response("ok", { status: 200 });
    }
    // Confirmou: resolve a zona pela MESMA logica de hoje e grava cidade+bairro.
    const cidadeRaw = (pend?.cidade ?? "").trim();
    const bairroRaw = (pend?.bairro ?? "").trim();
    const alvoCidade = normalizarSemAcento(cidadeRaw);
    let cidadeFinal = titleCasePtBr(cidadeRaw);
    let zona = "Outras";
    let capital = false;
    if (alvoCidade === "sao paulo" || alvoCidade === "sp") {
      cidadeFinal = "São Paulo";
      capital = true;
    } else {
      const c = await resolverGrandeSP(cidadeRaw);
      if (c) {
        cidadeFinal = c;
        zona = c;
      }
    }
    let bairroFinal = titleCasePtBr(bairroRaw);
    if (capital && bairroRaw) {
      const ia = await interpretarBairro(bairroRaw);
      if (ia && ia.bairro && ia.zona && ia.zona !== "Outras") {
        bairroFinal = ia.bairro;
        zona = ia.zona;
      } else {
        const { data: seeds } = await db.from("bairros_zonas").select("bairro, zona");
        const achou = (seeds ?? []).find(
          (b) => normalizarSemAcento(b.bairro as string) === normalizarSemAcento(bairroRaw),
        );
        zona = achou ? (achou.zona as string) : "Outras";
      }
    }
    const flags2 = { ...flags };
    delete flags2.cep_tentativa;
    const upd: Record<string, unknown> = { cidade: cidadeFinal, zona };
    if (bairroFinal) upd.bairro = bairroFinal;
    await avancarCadastro(upd, flags2);
    return new Response("ok", { status: 200 });
  }

  // ===== CASO 1 (2o tempo): tem o CANTOR, agora chega a MUSICA. Junta e busca. =====
  if (etapa === "musica_aguarda_titulo" && ctx.pending_artista) {
    const artista = ctx.pending_artista as string;
    const chave = normalizarSemAcento(texto);
    // "qualquer/tanto faz/nao sei" => registra SO o voto do cantor (nao ha texto de musica).
    const QUALQUER = new Set([
      "qualquer", "qualquer uma", "qualquer musica", "tanto faz", "o que tiver",
      "pode ser qualquer", "qualquer coisa", "surpresa", "escolhe voce",
      "nao sei", "sei la", "voce escolhe", "o que voce quiser",
    ]);
    if (QUALQUER.has(chave)) {
      const artCanon = (await confirmarArtista(artista)) ?? titleCasePtBr(artista);
      await gravarVotosESeguir(null, artCanon, flags);
      return new Response("ok", { status: 200 });
    }
    if (NEGATIVAS.has(chave)) {
      // Desistiu da musica: nao grava nada, segue o cadastro.
      const flags2 = { ...flags, musica_pedida: true };
      const prox = proximaPerguntaFaltante(ouvinte, flags2);
      const inst = prox.campo === "concluido"
        ? `o ouvinte nao quis pedir musica agora; agradeça e convide ele a continuar ouvindo a ${RADIO_LABEL}`
        : `o ouvinte nao quis pedir musica agora; diga tranquilo e ${intencaoProximoCampo(prox.campo)}`;
      const fallback = `Tranquilo${primeiroNome ? ", " + primeiroNome : ""}! ${prox.texto}`;
      const msg = (await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fallback;
      const hist = pushHist(ctx.historico, texto, msg);
      await db.from("conversas").update({
        etapa: prox.campo === "concluido" ? "concluido" : "cadastro",
        contexto: { flags: flags2, historico: hist },
      }).eq("id", conversaId);
      await reply(phone, conversaId, radioId, msg);
      return new Response("ok", { status: 200 });
    }
    // Tem cantor + texto de musica: busca a versao oficial. Achou => grava direto; nao achou => repergunta.
    const oficial = await resolverMusicaOficial(texto, artista);
    if (oficial) {
      await gravarVotosESeguir(oficial.titulo, oficial.artista ?? titleCasePtBr(artista), flags);
    } else {
      await reperguntarMusica(flags);
    }
    return new Response("ok", { status: 200 });
  }

  // ===== CASO 2 (2o tempo): tem a MUSICA, agora chega o CANTOR (ou "nao sei"). =====
  if (etapa === "musica_aguarda_cantor" && ctx.pending_musica_texto) {
    const musica = ctx.pending_musica_texto as string;
    const chave = normalizarSemAcento(texto);
    const NAO_SEI = new Set([
      "nao sei", "nao sei quem canta", "sei la", "nao lembro", "nao faco ideia",
      "nao faco a menor ideia", "sla", "nem sei", "nao conheco",
    ]);
    if (NAO_SEI.has(chave) || NEGATIVAS.has(chave)) {
      // Existe texto de musica: a Adriana busca a musica sozinha pra descobrir o cantor real.
      const oficial = await resolverMusicaOficial(musica, null);
      if (oficial) {
        await gravarVotosESeguir(oficial.titulo, oficial.artista ?? null, flags);
      } else {
        await reperguntarMusica(flags);
      }
      return new Response("ok", { status: 200 });
    }
    // Tem musica + cantor: junta e busca. Achou => grava direto; nao achou => repergunta.
    const oficial = await resolverMusicaOficial(musica, texto);
    if (oficial) {
      await gravarVotosESeguir(oficial.titulo, oficial.artista ?? titleCasePtBr(texto), flags);
    } else {
      await reperguntarMusica(flags);
    }
    return new Response("ok", { status: 200 });
  }

  // ===== Premio: fast-path deterministico =====
  const cadastroCompleto = !!(ouvinte.nome && ouvinte.data_nascimento && ouvinte.cidade);
  if (isTexto && ehPremio(texto)) {
    if (!ouvinte.nome) {
      await reply(phone, conversaId, radioId, PREMIO_NOVO);
      await setEtapa("cadastro");
      return new Response("ok", { status: 200 });
    }
    if (cadastroCompleto) {
      await reply(phone, conversaId, radioId, escolher(PREMIO_CADASTRADO));
      return new Response("ok", { status: 200 });
    }
  }

  // ===== Abertura: no primeiro contato, se apresenta e pede o nome (texto fixo do roteiro) =====
  if (isTexto && !jaSaudou && !ouvinte.nome && flags.abertura_feita !== true) {
    const msg = "Olá! Sou a Adriana da Rádio Liverpool, tudo bem? Qual é o seu nome?";
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "cadastro",
      contexto: { ...ctx, flags: { ...flags, abertura_feita: true }, historico: hist },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
    return new Response("ok", { status: 200 });
  }

  // ===== Cadastro deterministico: trata o campo ATUAL antes do cerebro (imune a 503/429, sem loop) =====
  const campoAtual = camposFaltantes(ouvinte, flags)[0];
  const CAMPOS_CADASTRO = new Set([
    "nome", "data_nascimento", "cidade", "bairro",
    "estilo_musical", "programa_locutor",
  ]);
  if (isTexto && CAMPOS_CADASTRO.has(campoAtual)) {
    await handleCampoCadastro(campoAtual);
    return new Response("ok", { status: 200 });
  }

  // ===== radio_troca: quando essa e a pergunta atual, trata deterministico (antes do cerebro) =====
  if (isTexto && flags.radio_troca_pedida !== true && campoAtual === "radio_troca") {
    await handleRadioTroca(texto);
    return new Response("ok", { status: 200 });
  }

  // ===== Cerebro conversacional: a Adriana conduz =====
  const coletado = montarColetado(ouvinte, flags);
  const dec = await cerebroAdriana(
    (ctx.historico as { de: string; texto: string }[]) ?? [],
    coletado,
    texto,
  );

  // Fallback deterministico se a IA cair (nunca trava a coleta).
  if (!dec) {
    const prox = proximaPerguntaFaltante(ouvinte, flags);
    const hist = pushHist(ctx.historico, texto, prox.texto);
    await db.from("conversas").update({
      etapa: prox.campo === "concluido" ? "concluido" : "cadastro",
      contexto: { ...ctx, flags, historico: hist, pending_musica: null },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, prox.texto);
    return new Response("ok", { status: 200 });
  }

  // Persistir campos extraidos, com validacao deterministica.
  const campos = (dec.campos_extraidos ?? {}) as Record<string, string>;
  const upd: Record<string, unknown> = {};
  const flagsNovas: Record<string, unknown> = { ...flags };
  let overrideMsg: string | null = null;

  const val = (v: unknown): string | null =>
    (typeof v === "string" && v.trim()) ? v.trim() : null;

  const nomeCampo = val(campos.nome);
  if (nomeCampo) {
    const nome = titleCasePtBr(limparPrefixoNome(nomeCampo));
    if (nome) upd.nome = nome;
  }

  const dataCampo = val(campos.data_nascimento);
  if (dataCampo) {
    const rawSemAno = /\d{1,2}\s*[\/\-.\s]\s*\d{1,2}/.test(texto) && !/\d{4}/.test(texto);
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dataCampo) ? dataCampo : parseAniversario(dataCampo);
    const anoOk = !!iso && (() => {
      const y = parseInt(iso!.slice(0, 4), 10);
      return y >= 1900 && y <= new Date().getUTCFullYear();
    })();
    if (iso && anoOk && !rawSemAno) {
      upd.data_nascimento = iso;
      const idade = calcularIdade(iso);
      upd.idade = idade;
      const { data: faixa } = await db.from("faixas_etarias").select("id")
        .lte("idade_min", idade).or(`idade_max.gte.${idade},idade_max.is.null`)
        .order("id").limit(1).maybeSingle();
      upd.faixa_etaria = faixa?.id ?? null;
    } else {
      overrideMsg = "Faltou o ano. Em que ano você nasceu? (ex: 1990)";
    }
  }

  const cidadeCampo = val(campos.cidade);
  if (cidadeCampo) {
    const alvo = normalizarSemAcento(cidadeCampo);
    if (alvo === "sao paulo" || alvo === "sp") {
      upd.cidade = "São Paulo";
    } else {
      const gsp = await resolverGrandeSP(cidadeCampo);
      upd.cidade = gsp ?? titleCasePtBr(cidadeCampo);
    }
  }

  const bairroCampo = val(campos.bairro);
  if (bairroCampo) {
    const cidStr = (upd.cidade as string) ?? (ouvinte.cidade as string) ?? "";
    const capital = normalizarSemAcento(cidStr) === "sao paulo";
    let bairroFinal = titleCasePtBr(bairroCampo);
    let zona = "Outras";
    if (capital) {
      const ia = await interpretarBairro(bairroCampo);
      if (ia && ia.bairro && ia.zona && ia.zona !== "Outras") {
        bairroFinal = ia.bairro;
        zona = ia.zona;
      } else {
        const alvo = normalizarSemAcento(bairroCampo);
        const { data: seeds } = await db.from("bairros_zonas").select("bairro, zona");
        const achou = (seeds ?? []).find((b) => normalizarSemAcento(b.bairro as string) === alvo);
        if (achou) {
          zona = achou.zona as string;
          if (ia?.bairro) bairroFinal = ia.bairro;
        }
      }
    } else {
      const gsp = await resolverGrandeSP(cidStr);
      zona = gsp ?? "Outras";
    }
    upd.bairro = bairroFinal;
    upd.zona = zona;
  }

  const estiloCampo = val(campos.estilo_musical);
  if (estiloCampo) upd.estilo_musical = titleCasePtBr(estiloCampo);

  const programaCampo = val(campos.programa_locutor);
  if (programaCampo && !NEGATIVAS.has(normalizarSemAcento(programaCampo))) {
    upd.programa_locutor = titleCasePtBr(programaCampo);
  }

  if (Object.keys(upd).length) {
    await db.from("ouvintes").update(upd).eq("id", ouvinteId);
  }
  const ouvinteAtual = { ...ouvinte, ...upd };

  // ===== Musica: fonte de verdade + portao de confirmacao =====
  const artistaHint = val(dec.artista_bruto);
  const musicaBruta = val(dec.musica_bruta);

  // "Qualquer uma do X": registra SO o voto de cantor e segue (sem confirmacao, sem busca).
  if (dec.qualquer_do_artista && artistaHint && !overrideMsg) {
    const artCanon = (await confirmarArtista(artistaHint)) ?? titleCasePtBr(artistaHint);
    await gravarVotosESeguir(null, artCanon, flagsNovas);
    return new Response("ok", { status: 200 });
  }

  // CASO 3: cantor + musica juntos -> busca a versao oficial. Achou => grava direto; nao achou => repergunta.
  if (dec.e_pedido_musica && musicaBruta && artistaHint && !overrideMsg) {
    const oficial = await resolverMusicaOficial(musicaBruta, artistaHint);
    if (oficial) {
      await gravarVotosESeguir(oficial.titulo, oficial.artista ?? titleCasePtBr(artistaHint), flagsNovas);
    } else {
      await reperguntarMusica(flagsNovas);
    }
    return new Response("ok", { status: 200 });
  }

  // CASO 2: SO a musica (sem cantor). Guarda a musica e pergunta quem canta. NAO busca ainda.
  if (dec.e_pedido_musica && musicaBruta && !artistaHint && !overrideMsg) {
    const msg = "Legal! E consegue me confirmar o nome do artista?";
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "musica_aguarda_cantor",
      contexto: { flags: flagsNovas, historico: hist, pending_musica_texto: musicaBruta },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
    return new Response("ok", { status: 200 });
  }

  // CASO 1: SO o cantor (sem titulo). Guarda o cantor e pergunta a musica. PROIBIDO buscar aqui.
  if (dec.e_pedido_musica && artistaHint && !musicaBruta && !overrideMsg) {
    const inst = `o ouvinte quer ouvir o cantor ${artistaHint}; pergunte de forma animada qual música dele(a) o ouvinte quer ouvir`;
    const fallback = `${primeiroNome ? primeiroNome + ", " : ""}boa escolha! E qual música do ${artistaHint} você quer ouvir?`;
    const msg = (await falaAdriana(inst, primeiroNome, jaSaudou)) ?? fallback;
    const hist = pushHist(ctx.historico, texto, msg);
    await db.from("conversas").update({
      etapa: "musica_aguarda_titulo",
      contexto: { flags: flagsNovas, historico: hist, pending_artista: artistaHint },
    }).eq("id", conversaId);
    await reply(phone, conversaId, radioId, msg);
    return new Response("ok", { status: 200 });
  }

  // ===== Resposta normal da Adriana =====
  // Se estava perguntando a musica e o ouvinte declinou, marca como pedido feito (nao repergunta).
  const chaveMsg = normalizarSemAcento(texto);
  let declinouMusica = false;
  if (
    !dec.e_pedido_musica && !dec.qualquer_do_artista &&
    flagsNovas.musica_pedida !== true && NEGATIVAS.has(chaveMsg) &&
    camposFaltantes(ouvinteAtual, flagsNovas)[0] === "pedido_musica"
  ) {
    flagsNovas.musica_pedida = true;
    declinouMusica = true;
  }
  const proxAtual = proximaPerguntaFaltante(ouvinteAtual, flagsNovas);
  // Se a fala do cerebro veio contaminada com o JSON de decisao, descarta e usa a pergunta deterministica.
  const falaCerebro = val(dec.resposta_ao_ouvinte);
  const falaLimpa = falaCerebro && falaCerebro === limparVazamentoJSON(falaCerebro)
    ? falaCerebro
    : null;
  let resposta = overrideMsg ??
    (declinouMusica ? proxAtual.texto : (falaLimpa ?? proxAtual.texto));
  const concluido = !overrideMsg && proxAtual.campo === "concluido";
  if (concluido && flagsNovas.concluido !== true) {
    flagsNovas.concluido = true;
    resposta = `${resposta} Ah, e segue a gente no Instagram: ${INSTAGRAM_URL}`;
    await db.from("ouvintes").update({ participacoes: (ouvinte.participacoes ?? 0) + 1 }).eq("id", ouvinteId);
  }
  const hist = pushHist(ctx.historico, texto, resposta);
  await db.from("conversas").update({
    etapa: concluido ? "concluido" : "cadastro",
    contexto: { flags: flagsNovas, historico: hist, pending_musica: null },
  }).eq("id", conversaId);
  await reply(phone, conversaId, radioId, resposta);
  return new Response("ok", { status: 200 });
});
