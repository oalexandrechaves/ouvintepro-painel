import type { Modulo, Nivel } from "./modelo";

// MAPA DE ROTAS: TODA ROTA DO PAINEL TEM DONO, E O QUE NAO ESTA AQUI E NEGADO.
// O middleware consulta este mapa em todo pedido. Rota nova (tela ou /api) que
// ninguem colocar aqui responde 404 para quem esta logado e manda para o login
// quem nao esta. Antes era o contrario: tudo que nao estava na lista publica
// abria para qualquer sessao.
//
// Os caminhos sao EXATOS, e o metodo faz parte da regra. Ler exige Visualizacao;
// mudar exige Edicao; gerir usuarios e grupos exige Full no Painel de Controle.
// Metodo que nao esta listado e negado (um GET liberado nao abre o POST).
// Unica excecao por prefixo: o hotlink /r/..., que precisa ficar aberto para os
// ouvintes.
//
// Este mapa e a PRIMEIRA camada. A segunda esta nas funcoes de dados, que exigem
// a sessao conferida como parametro (lib/acesso/servidor.ts).

export type Regra =
  // Sem login: login, logout e hotlink.
  | { tipo: "publica" }
  // Qualquer usuario ativo logado. `trocaPendente`: continua aberta para quem
  // ainda precisa trocar a senha temporaria (todas as outras fecham).
  | { tipo: "sessao"; trocaPendente?: boolean }
  | { tipo: "modulo"; modulo: Modulo; nivel: Nivel };

type Metodo = "GET" | "POST" | "PATCH";

const LER = (modulo: Modulo): Regra => ({ tipo: "modulo", modulo, nivel: "visualizacao" });
const EDITAR = (modulo: Modulo): Regra => ({ tipo: "modulo", modulo, nivel: "edicao" });
const GERIR: Regra = { tipo: "modulo", modulo: "painel_de_controle", nivel: "full" };
const PUBLICA: Regra = { tipo: "publica" };

export const ROTAS: Record<string, Partial<Record<Metodo, Regra>>> = {
  // Publicas
  "/login": { GET: PUBLICA },
  "/api/login": { POST: PUBLICA },
  "/api/logout": { POST: PUBLICA },

  // So sessao
  "/trocar-senha": { GET: { tipo: "sessao", trocaPendente: true } },
  "/api/sessao/senha": { POST: { tipo: "sessao", trocaPendente: true } },
  "/sem-acesso": { GET: { tipo: "sessao" } },

  // Visao geral
  "/": { GET: LER("visao_geral") },
  "/api/visao-geral": { GET: LER("visao_geral") },

  // Ouvintes (a conversa do ouvinte abre dentro desta tela)
  "/ouvintes": { GET: LER("ouvintes") },
  "/api/painel": { GET: LER("ouvintes") },
  "/api/conversa": { GET: LER("ouvintes") },

  // Comercial (/audiencia e o endereco antigo, que redireciona)
  "/comercial": { GET: LER("comercial") },
  "/audiencia": { GET: LER("comercial") },
  "/api/comercial": { GET: LER("comercial") },

  // Promocoes: ver e sortear e leitura; confirmar ganhador grava.
  "/promocoes": { GET: LER("promocoes") },
  "/api/promocoes": { GET: LER("promocoes") },
  "/api/promocao": { GET: LER("promocoes") },
  "/api/promocao/ganhador": { POST: EDITAR("promocoes") },

  // Painel de Controle: ver com Visualizacao, mudar so com Full.
  "/painel-de-controle": { GET: LER("painel_de_controle") },
  "/painel-de-controle/grupos": { GET: LER("painel_de_controle") },
  "/api/acesso/usuarios": {
    GET: LER("painel_de_controle"),
    POST: GERIR,
    PATCH: GERIR,
  },
  "/api/acesso/usuarios/senha": { POST: GERIR },
  "/api/acesso/grupos": { GET: LER("painel_de_controle"), POST: GERIR },
};

// null = rota ou metodo sem regra: NEGADO.
export function regraDaRota(caminho: string, metodo: string): Regra | null {
  // Arquivos internos do Next (em dev, o HMR). Os estaticos nem passam pelo
  // middleware; o que sobra aqui nao tem dado.
  if (caminho.startsWith("/_next/")) return PUBLICA;
  if (caminho.startsWith("/r/")) return PUBLICA;

  const semBarraFinal =
    caminho.length > 1 && caminho.endsWith("/") ? caminho.slice(0, -1) : caminho;
  const regras = ROTAS[semBarraFinal];
  if (!regras) return null;
  // HEAD e o GET sem corpo; OPTIONS nao e usado pelo painel.
  const m = (metodo === "HEAD" ? "GET" : metodo) as Metodo;
  return regras[m] ?? null;
}
