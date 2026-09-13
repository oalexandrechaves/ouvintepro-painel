// MODULOS, NIVEIS E ERROS DE ACESSO. SEM DEPENDENCIA NENHUMA.
// Roda no middleware (edge), no servidor e no navegador. Os seis modulos e os
// quatro niveis tambem existem no check da migration
// 20260913100000_acesso_usuarios_grupos.sql: quem acrescentar um, mexe nos dois.

export const MODULOS = [
  { chave: "visao_geral", nome: "Visão geral", href: "/" },
  { chave: "atendimentos", nome: "Atendimentos", href: "/atendimentos" },
  { chave: "ouvintes", nome: "Ouvintes", href: "/ouvintes" },
  { chave: "comercial", nome: "Comercial", href: "/comercial" },
  { chave: "promocoes", nome: "Promoções", href: "/promocoes" },
  {
    chave: "painel_de_controle",
    nome: "Painel de Controle",
    href: "/painel-de-controle",
  },
] as const;

export type Modulo = (typeof MODULOS)[number]["chave"];

export const NIVEIS = ["sem_acesso", "visualizacao", "edicao", "full"] as const;
export type Nivel = (typeof NIVEIS)[number];

export const NOME_NIVEL: Record<Nivel, string> = {
  sem_acesso: "Sem acesso",
  visualizacao: "Visualização",
  edicao: "Edição",
  full: "Full",
};

// O perfil e so o rotulo do usuario. Quem libera tela e o grupo.
export const PERFIS = [
  "Administrador",
  "Comercial",
  "Produção",
  "Atendimento",
] as const;
export type Perfil = (typeof PERFIS)[number];

export type Permissoes = Record<Modulo, Nivel>;

export function ehModulo(v: unknown): v is Modulo {
  return MODULOS.some((m) => m.chave === v);
}

export function ehNivel(v: unknown): v is Nivel {
  return NIVEIS.includes(v as Nivel);
}

export function nomeDoModulo(m: Modulo): string {
  return MODULOS.find((x) => x.chave === m)?.nome ?? m;
}

// Nivel desconhecido conta como sem acesso: nunca libera por engano.
export function permite(p: Permissoes, modulo: Modulo, minimo: Nivel): boolean {
  const tem = NIVEIS.indexOf(p[modulo]);
  return tem >= 0 && tem >= NIVEIS.indexOf(minimo);
}

// Quem pede nao entrou (401) ou entrou e nao pode (403). Quem responde a rota
// transforma isto no status certo; nunca vira 500 nem dado vazio.
export class AcessoNegado extends Error {
  constructor(
    readonly status: 401 | 403,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "AcessoNegado";
  }
}

// Regra de negocio recusada pelo banco (codigos AC da migration), com mensagem
// ja escrita para a tela: "Você não pode desativar o próprio usuário."
export class RegraRecusada extends Error {
  constructor(
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "RegraRecusada";
  }
}
