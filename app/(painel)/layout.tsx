import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { sessaoAtual } from "@/lib/acesso/servidor";
import { MODULOS, permite } from "@/lib/acesso/modelo";

// LAYOUT DO PAINEL AUTENTICADO.
// Route group: os parenteses NAO entram na URL, entao "/" continua "/". O que o
// grupo faz e delimitar QUEM recebe esta moldura: o /login e o /trocar-senha
// ficam de fora e nao ganham barra de navegacao.
//
// O fundo animado do tema escuro (orbs, grade, ruido) saiu: no tema claro o
// fundo e o gradiente quase imperceptivel do body, em globals.css.
//
// ACESSO: quem decide e o middleware (mapa de rotas) e, de novo, cada pagina e
// cada funcao de dados. A barra lateral so ESCONDE o que o grupo nao abre, por
// conveniencia; esconder nao e proteger. A leitura da sessao e a mesma da pagina
// (cache por pedido), entao nao custa uma ida a mais ao banco.
export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  if (sessao.deveTrocarSenha) redirect("/trocar-senha");

  const modulos = MODULOS.filter((m) =>
    permite(sessao.permissoes, m.chave, "visualizacao"),
  ).map((m) => m.chave);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar usuario={{ nome: sessao.nome, perfil: sessao.perfil }} modulos={modulos} />
      <main className="min-w-0 flex-1 px-5 pb-20 sm:px-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}
