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

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

// Janela de sessao: depois desse silencio, a proxima mensagem reinicia a coleta.
const JANELA_MS = 5 * 60 * 1000;

function escolher(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Variacoes pra nao repetir sempre a mesma frase.
const FALLBACK_MIDIA = [
  "Recebi sua mensagem! Por aqui eu so consigo ler texto. Pode me escrever a resposta?",
  "Opa! Esse tipo de arquivo eu ainda nao leio. Me manda por texto que eu sigo com voce.",
  "Valeu por mandar! Mas eu so entendo texto por enquanto. Pode digitar pra mim?",
  "Recebi! So que eu leio mesmo e mensagem de texto. Me conta por escrito?",
];

const SAUDACOES_RETORNO = [
  "Oi de novo",
  "Que bom te ver de volta",
  "Opa, voce de novo por aqui",
  "E ai, de volta",
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

// Aceita DD/MM/AAAA, DD-MM-AAAA e DD/MM/AA. Retorna ISO yyyy-mm-dd ou null.
function parseAniversario(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const dia = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  let ano = parseInt(m[3], 10);
  if (m[3].length === 2) ano += ano <= 25 ? 2000 : 1900;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
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
      "Recebi seu audio! Por enquanto eu so consigo ler texto. Pode me responder digitando?",
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

  switch (etapa) {
    case "inicio": {
      await reply(
        phone,
        conversaId,
        radioId,
        `Oi! Aqui e o atendimento da ${radioNome}. Pra voce participar, me conta seu nome completo?`,
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
          `${saud}, ${ouvinte.nome}! Bora atualizar rapidinho. Em qual bairro voce esta agora?`,
        );
        await setEtapa("bairro");
      } else {
        await reply(
          phone,
          conversaId,
          radioId,
          `${saud}, ${ouvinte.nome}! Bora atualizar rapidinho. Me diz sua cidade e estado agora (ex: Campinas, SP).`,
        );
        await setEtapa("cidade");
      }
      break;
    }

    case "nome": {
      await db.from("ouvintes").update({ nome: texto }).eq("id", ouvinteId);
      if (ddd === "11") {
        await reply(phone, conversaId, radioId, `Prazer, ${texto}! Em qual bairro voce mora?`);
        await setEtapa("bairro");
      } else {
        await reply(
          phone,
          conversaId,
          radioId,
          `Prazer, ${texto}! Me diz sua cidade e estado (ex: Campinas, SP).`,
        );
        await setEtapa("cidade");
      }
      break;
    }

    case "bairro": {
      const { data: bz } = await db
        .from("bairros_zonas")
        .select("zona")
        .ilike("bairro", texto)
        .maybeSingle();
      const zona = bz?.zona ?? "Outras";
      await db
        .from("ouvintes")
        .update({ bairro: texto, zona })
        .eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Show! Qual a sua data de nascimento? (formato DD/MM/AAAA)",
      );
      await setEtapa("aniversario");
      break;
    }

    case "cidade": {
      const partes = texto.split(",").map((s) => s.trim());
      const cidade = partes[0] || texto;
      const estado = partes[1] ? partes[1].slice(0, 2).toUpperCase() : null;
      await db
        .from("ouvintes")
        .update({ cidade, estado })
        .eq("id", ouvinteId);
      await reply(
        phone,
        conversaId,
        radioId,
        "Show! Qual a sua data de nascimento? (formato DD/MM/AAAA)",
      );
      await setEtapa("aniversario");
      break;
    }

    case "aniversario": {
      const iso = parseAniversario(texto);
      if (!iso) {
        await reply(
          phone,
          conversaId,
          radioId,
          "Nao entendi a data. Pode mandar no formato DD/MM/AAAA? (ex: 25/12/1990)",
        );
        break;
      }
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
        "Quais musicas voce mais ama ouvir? Pode mandar varias separadas por virgula.",
      );
      await setEtapa("musicas_ama");
      break;
    }

    case "musicas_ama": {
      const lista = splitLista(texto);
      if (lista.length > 0) {
        await db.from("musicas").insert(
          lista.map((nome) => ({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome,
            sentimento: "ama",
          })),
        );
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "E tem alguma musica que voce nao gosta de jeito nenhum?",
      );
      await setEtapa("musicas_rejeita");
      break;
    }

    case "musicas_rejeita": {
      const lista = splitLista(texto);
      if (lista.length > 0) {
        await db.from("musicas").insert(
          lista.map((nome) => ({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome,
            sentimento: "rejeita",
          })),
        );
      }
      await reply(
        phone,
        conversaId,
        radioId,
        "Ultima pergunta: alem da nossa, quais outras radios voce costuma escutar?",
      );
      await setEtapa("outras_radios");
      break;
    }

    case "outras_radios": {
      const lista = splitLista(texto);
      if (lista.length > 0) {
        await db.from("radios_concorrentes").insert(
          lista.map((nome_radio) => ({
            radio_id: radioId,
            ouvinte_id: ouvinteId,
            nome_radio,
          })),
        );
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
          ouvinte.nome ? ", " + ouvinte.nome : ""
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
          ? `Que bom te ver de novo, ${ouvinte.nome}! Obrigado por falar com a ${radioNome}.`
          : `Obrigado por falar com a ${radioNome}!`,
      );
      break;
    }
  }

  return new Response("ok", { status: 200 });
});
