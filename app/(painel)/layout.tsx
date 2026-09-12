import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import { SESSION_COOKIE, usuarioDaSessao } from "@/lib/auth";

// LAYOUT DO PAINEL AUTENTICADO.
// Route group: os parenteses NAO entram na URL, entao "/" continua "/". O que o
// grupo faz e delimitar QUEM recebe esta moldura: o /login fica de fora e nao
// ganha barra de navegacao.
//
// O fundo animado do tema escuro (orbs, grade, ruido) saiu: no tema claro o
// fundo e o gradiente quase imperceptivel do body, em globals.css.
//
// O middleware nao precisou ser tocado: o matcher dele e generico e rotaPublica
// e uma lista branca de 4 entradas, entao toda rota nova deste grupo ja nasce
// protegida sem ninguem fazer nada.
export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await usuarioDaSessao(cookies().get(SESSION_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar usuario={usuario} />
      <main className="min-w-0 flex-1 px-5 pb-20 sm:px-8 lg:px-10">
        {children}
      </main>
    </div>
  );
}
