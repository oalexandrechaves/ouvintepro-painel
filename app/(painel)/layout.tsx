import { cookies } from "next/headers";
import Background from "@/components/Background";
import Sidebar from "@/components/Sidebar";
import { SESSION_COOKIE, usuarioDaSessao } from "@/lib/auth";

// LAYOUT DO PAINEL AUTENTICADO.
// Route group: os parenteses NAO entram na URL, entao "/" continua "/" e
// "/audiencia" continua "/audiencia". O que o grupo faz e delimitar QUEM recebe
// esta moldura: o /login fica de fora e nao ganha barra de navegacao, que era o
// jeito de quebrar isto pondo a sidebar no layout raiz.
//
// A moldura (min-h-screen, Background, container) mora AQUI e nao mais dentro
// do Dashboard, senao vira moldura dentro de moldura quando a sidebar entra.
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
    <div className="relative min-h-screen bg-grid">
      <Background />
      <div className="relative z-10 flex flex-col lg:flex-row">
        <Sidebar usuario={usuario} />
        <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
