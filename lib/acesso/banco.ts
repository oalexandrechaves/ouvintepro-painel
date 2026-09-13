import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  MODULOS,
  RegraRecusada,
  ehNivel,
  type Permissoes,
} from "./modelo";

// ACESSO AO BANCO PARA LOGIN, SESSAO E GESTAO. Roda no edge e no servidor.
// As tabelas acesso_* nao tem GRANT para nenhum papel da API: tudo passa pelas
// funcoes acesso_* da migration, com service_role. O hash da senha nunca chega
// aqui.

export function clienteServico(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    throw new Error("Supabase nao configurado (URL ou service role ausente).");
  }
  return createClient(url, chave, {
    auth: { persistSession: false },
    // Sem cache: permissao lida de cache seria permissao velha.
    global: { fetch: (i, init) => fetch(i, { ...init, cache: "no-store" }) },
  });
}

export interface DadosSessao {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  // Milissegundos; so vale token emitido DEPOIS (estritamente).
  validasDesdeMs: number;
  grupo: { id: string; nome: string; ativo: boolean };
  permissoes: Permissoes;
}

// Resposta que nao tem o formato esperado e FALHA, nunca "sem permissao" nem
// "tudo liberado".
function converterSessao(bruto: unknown): DadosSessao | null {
  if (bruto === null) return null;
  const r = bruto as Record<string, unknown>;
  const g = r.grupo as Record<string, unknown> | undefined;
  const p = r.permissoes as Record<string, unknown> | undefined;
  if (
    typeof r.id !== "string" ||
    typeof r.nome !== "string" ||
    typeof r.email !== "string" ||
    typeof r.perfil !== "string" ||
    typeof r.ativo !== "boolean" ||
    typeof r.deve_trocar_senha !== "boolean" ||
    typeof r.validas_desde_ms !== "number" ||
    !g ||
    typeof g.id !== "string" ||
    typeof g.nome !== "string" ||
    typeof g.ativo !== "boolean" ||
    !p
  ) {
    throw new Error("Resposta de acesso_sessao fora do formato.");
  }
  const permissoes = {} as Permissoes;
  for (const m of MODULOS) {
    const nivel = p[m.chave];
    if (!ehNivel(nivel)) throw new Error(`Nivel invalido para ${m.chave}.`);
    permissoes[m.chave] = nivel;
  }
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    perfil: r.perfil,
    ativo: r.ativo,
    deveTrocarSenha: r.deve_trocar_senha,
    validasDesdeMs: r.validas_desde_ms,
    grupo: { id: g.id, nome: g.nome, ativo: g.ativo },
    permissoes,
  };
}

// null: o usuario nao existe. Falha de leitura LANCA.
export async function lerSessaoDoBanco(
  usuarioId: string,
): Promise<DadosSessao | null> {
  const { data, error } = await clienteServico().rpc("acesso_sessao", {
    p_usuario_id: usuarioId,
  });
  if (error) throw new Error(`acesso_sessao: ${error.message}`);
  return converterSessao(data);
}

// A sessao vale se o usuario existe, esta ativo e o token foi emitido DEPOIS da
// ultima troca ou redefinicao de senha (ou desativacao). Em milissegundos e com
// comparacao estrita: em segundos inteiros, uma sessao emitida no mesmo segundo,
// antes da redefinicao, sobrevivia (o teste de ponta a ponta pegou).
export function sessaoVigente(
  dados: DadosSessao | null,
  emitidoEmMs: number,
): dados is DadosSessao {
  return Boolean(dados && dados.ativo && emitidoEmMs > dados.validasDesdeMs);
}

// Erro de funcao acesso_*: codigo AC vira RegraRecusada, com a mensagem do banco
// para a tela; o resto e falha e lanca como falha.
export function erroDoBanco(
  funcao: string,
  error: { code?: string; message: string },
): Error {
  if (error.code && /^AC\d{3}$/.test(error.code)) {
    return new RegraRecusada(error.code, error.message);
  }
  return new Error(`${funcao}: ${error.message}`);
}
