import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, lerToken } from "@/lib/auth";
import { lerSessaoDoBanco, sessaoVigente, type DadosSessao } from "./banco";
import { AcessoNegado, nomeDoModulo, permite, type Modulo, type Nivel } from "./modelo";

// SEGUNDA CAMADA: A SESSAO CONFERIDA E PARAMETRO DAS FUNCOES DE DADOS.
// O middleware ja barra quem nao pode. Esta camada existe para o dia em que o
// mapa de rotas errar: toda funcao de dados (serverData, gestao) recebe uma
// SessaoVerificada e chama garantirAcesso antes de ler. Uma rota que esqueca de
// conferir a sessao nao compila, porque SessaoVerificada so nasce aqui dentro:
// a marca e um simbolo que este arquivo nao exporta.
//
// Servidor apenas (usa next/headers). Middleware usa lib/acesso/banco direto.

declare const marca: unique symbol;
export type SessaoVerificada = DadosSessao & { readonly [marca]: true };

// Uma leitura por pedido: layout e pagina do mesmo render compartilham.
// Falha de leitura LANCA; null e "nao ha sessao valida".
const carregar = cache(async (): Promise<SessaoVerificada | null> => {
  const token = await lerToken(cookies().get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const dados = await lerSessaoDoBanco(token.usuarioId);
  if (!sessaoVigente(dados, token.emitidoEmMs)) return null;
  return dados as SessaoVerificada;
});

export async function sessaoAtual(): Promise<SessaoVerificada | null> {
  return carregar();
}

// Confere um nivel numa sessao ja carregada. Lanca AcessoNegado.
export function garantirAcesso(
  sessao: SessaoVerificada,
  modulo: Modulo,
  nivel: Nivel,
): void {
  if (sessao.deveTrocarSenha) {
    throw new AcessoNegado(403, "Troque a senha temporária antes de continuar.");
  }
  if (!permite(sessao.permissoes, modulo, nivel)) {
    throw new AcessoNegado(
      403,
      `Seu grupo de acesso não permite esta ação em ${nomeDoModulo(modulo)}.`,
    );
  }
}

// ROTAS DE API. Lanca AcessoNegado (401 ou 403); responderJson devolve o status.
export async function exigirAcesso(
  modulo: Modulo,
  nivel: Nivel,
): Promise<SessaoVerificada> {
  const sessao = await carregar();
  if (!sessao) throw new AcessoNegado(401, "Sessão expirada. Entre de novo.");
  garantirAcesso(sessao, modulo, nivel);
  return sessao;
}

// So sessao valida, sem modulo (trocar a propria senha, tela "sem acesso").
export async function exigirSessao(): Promise<SessaoVerificada> {
  const sessao = await carregar();
  if (!sessao) throw new AcessoNegado(401, "Sessão expirada. Entre de novo.");
  return sessao;
}

// PAGINAS. Em vez de lancar, redireciona como o middleware faria.
export async function exigirAcessoPagina(
  modulo: Modulo,
  nivel: Nivel,
): Promise<SessaoVerificada> {
  const sessao = await carregar();
  if (!sessao) redirect("/login");
  if (sessao.deveTrocarSenha) redirect("/trocar-senha");
  if (!permite(sessao.permissoes, modulo, nivel)) {
    redirect(`/sem-acesso?modulo=${modulo}`);
  }
  return sessao;
}

export async function exigirSessaoPagina(): Promise<SessaoVerificada> {
  const sessao = await carregar();
  if (!sessao) redirect("/login");
  return sessao;
}
