import { clienteServico, erroDoBanco } from "./banco";
import { garantirAcesso, type SessaoVerificada } from "./servidor";
import {
  MODULOS,
  RegraRecusada,
  ehNivel,
  type Nivel,
  type Permissoes,
} from "./modelo";

// GESTAO DE USUARIOS E GRUPOS (Painel de Controle).
// Ler exige Visualizacao; mudar exige Full. Conferido aqui, pela sessao, e de
// novo dentro do banco (acesso_exigir), com o id de quem pede. As regras de
// "nao desativar a si mesmo" e "sempre ha um Full" moram no banco e voltam como
// RegraRecusada, com a mensagem pronta para a tela.

export interface UsuarioAcesso {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: string;
  grupoId: string;
  grupoNome: string;
  ativo: boolean;
  deveTrocarSenha: boolean;
  bloqueado: boolean;
  ultimoAcessoEm: string | null;
  criadoEm: string;
}

export interface GrupoAcesso {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  usuarios: number;
  usuariosAtivos: number;
  modulos: Permissoes;
}

async function chamar<T>(funcao: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await clienteServico().rpc(funcao, args);
  if (error) throw erroDoBanco(funcao, error);
  return data as T;
}

function lerModulos(bruto: unknown): Permissoes {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const p = {} as Permissoes;
  for (const m of MODULOS) {
    const n = o[m.chave];
    if (!ehNivel(n)) throw new Error(`Nivel invalido para ${m.chave}.`);
    p[m.chave] = n;
  }
  return p;
}

export async function listarUsuarios(sessao: SessaoVerificada): Promise<UsuarioAcesso[]> {
  garantirAcesso(sessao, "painel_de_controle", "visualizacao");
  const linhas = await chamar<Record<string, unknown>[]>("acesso_listar_usuarios", {
    p_ator: sessao.id,
  });
  if (!Array.isArray(linhas)) throw new Error("acesso_listar_usuarios: resposta fora do formato.");
  return linhas.map((u) => ({
    id: String(u.id),
    nome: String(u.nome),
    email: String(u.email),
    telefone: typeof u.telefone === "string" ? u.telefone : null,
    perfil: String(u.perfil),
    grupoId: String(u.grupo_id),
    grupoNome: String(u.grupo_nome),
    ativo: u.ativo === true,
    deveTrocarSenha: u.deve_trocar_senha === true,
    bloqueado: u.bloqueado === true,
    ultimoAcessoEm: typeof u.ultimo_acesso_em === "string" ? u.ultimo_acesso_em : null,
    criadoEm: String(u.criado_em),
  }));
}

export async function listarGrupos(sessao: SessaoVerificada): Promise<GrupoAcesso[]> {
  garantirAcesso(sessao, "painel_de_controle", "visualizacao");
  const linhas = await chamar<Record<string, unknown>[]>("acesso_listar_grupos", {
    p_ator: sessao.id,
  });
  if (!Array.isArray(linhas)) throw new Error("acesso_listar_grupos: resposta fora do formato.");
  return linhas.map((g) => ({
    id: String(g.id),
    nome: String(g.nome),
    descricao: String(g.descricao ?? ""),
    ativo: g.ativo === true,
    usuarios: Number(g.usuarios),
    usuariosAtivos: Number(g.usuarios_ativos),
    modulos: lerModulos(g.modulos),
  }));
}

// ----------------------------------------------------------------------------
// ENTRADAS. O navegador manda JSON; o que nao tem o tipo certo e recusado aqui,
// antes do banco, com mensagem para a tela.
// ----------------------------------------------------------------------------

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: unknown, campo: string): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new RegraRecusada("AC006", `Preencha ${campo}.`);
  }
  return v.trim();
}

function id(v: unknown, campo: string): string {
  if (typeof v !== "string" || !uuidRe.test(v)) {
    throw new RegraRecusada("AC006", `Escolha ${campo}.`);
  }
  return v;
}

function booleano(v: unknown, campo: string): boolean {
  if (typeof v !== "boolean") throw new RegraRecusada("AC006", `Informe ${campo}.`);
  return v;
}

export async function criarUsuario(
  sessao: SessaoVerificada,
  corpo: Record<string, unknown>,
): Promise<{ id: string }> {
  garantirAcesso(sessao, "painel_de_controle", "full");
  const novo = await chamar<string>("acesso_criar_usuario", {
    p_ator: sessao.id,
    p_nome: texto(corpo.nome, "o nome"),
    p_email: texto(corpo.email, "o e-mail"),
    p_telefone: typeof corpo.telefone === "string" ? corpo.telefone : null,
    p_perfil: texto(corpo.perfil, "o perfil"),
    p_grupo_id: id(corpo.grupoId, "o grupo de acesso"),
    p_senha_temporaria: typeof corpo.senha === "string" ? corpo.senha : "",
  });
  return { id: novo };
}

export async function atualizarUsuario(
  sessao: SessaoVerificada,
  corpo: Record<string, unknown>,
): Promise<{ ok: true }> {
  garantirAcesso(sessao, "painel_de_controle", "full");
  await chamar("acesso_atualizar_usuario", {
    p_ator: sessao.id,
    p_id: id(corpo.id, "o usuário"),
    p_nome: texto(corpo.nome, "o nome"),
    p_telefone: typeof corpo.telefone === "string" ? corpo.telefone : null,
    p_perfil: texto(corpo.perfil, "o perfil"),
    p_grupo_id: id(corpo.grupoId, "o grupo de acesso"),
    p_ativo: booleano(corpo.ativo, "se o usuário fica ativo"),
  });
  return { ok: true };
}

export async function redefinirSenha(
  sessao: SessaoVerificada,
  corpo: Record<string, unknown>,
): Promise<{ ok: true }> {
  garantirAcesso(sessao, "painel_de_controle", "full");
  await chamar("acesso_redefinir_senha", {
    p_ator: sessao.id,
    p_id: id(corpo.id, "o usuário"),
    p_senha_temporaria: typeof corpo.senha === "string" ? corpo.senha : "",
  });
  return { ok: true };
}

export async function salvarGrupo(
  sessao: SessaoVerificada,
  corpo: Record<string, unknown>,
): Promise<{ id: string }> {
  garantirAcesso(sessao, "painel_de_controle", "full");
  const bruto = (corpo.modulos ?? {}) as Record<string, unknown>;
  const modulos: Record<string, Nivel> = {};
  for (const m of MODULOS) {
    const n = bruto[m.chave];
    if (!ehNivel(n)) {
      throw new RegraRecusada("AC006", `Escolha o nível de ${m.nome}.`);
    }
    modulos[m.chave] = n;
  }
  const salvo = await chamar<string>("acesso_salvar_grupo", {
    p_ator: sessao.id,
    p_id: corpo.id === null || corpo.id === undefined ? null : id(corpo.id, "o grupo"),
    p_nome: texto(corpo.nome, "o nome do grupo"),
    p_descricao: typeof corpo.descricao === "string" ? corpo.descricao : "",
    p_ativo: booleano(corpo.ativo, "se o grupo fica ativo"),
    p_modulos: modulos,
  });
  return { id: salvo };
}
