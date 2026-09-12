import Link from "next/link";

// Topo de cada tela, no formato do arquivo de referencia: breadcrumb em DM Mono
// ("Painel / Tela", com nivel extra em subtela), titulo em Clash e subtitulo.
// Os filtros da tela entram como filhos e ficam no mesmo bloco fixo no topo.
// Fixo so a partir de lg: no celular a barra superior ja e fixa, e duas faixas
// fixas empilhadas comeriam metade da tela.
export default function Cabecalho({
  tela,
  pai,
  subtitulo,
  children,
}: {
  tela: string;
  pai?: { rotulo: string; href: string };
  subtitulo?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative z-20 -mx-5 lg:sticky lg:top-0 border-b border-borda-cartao bg-[rgba(246,246,248,0.92)] px-5 pt-5 backdrop-blur-[8px] sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
      <nav
        aria-label="Trilha"
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-texto-rotulo"
      >
        Painel <span className="text-[#C9C9D2]">/</span>{" "}
        {pai ? (
          <>
            <Link
              href={pai.href}
              className="text-texto-rotulo hover:text-magenta"
            >
              {pai.rotulo}
            </Link>{" "}
            <span className="text-[#C9C9D2]">/</span>{" "}
          </>
        ) : null}
        <span className="text-texto-titulo">{tela}</span>
      </nav>
      <div className="mt-2.5">
        <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em] sm:text-[31px]">
          {tela}
        </h1>
        {subtitulo ? (
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] text-texto-corpo">
            {subtitulo}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="pb-4 pt-[18px]">{children}</div>
      ) : (
        <div className="h-[22px]" />
      )}
    </header>
  );
}
