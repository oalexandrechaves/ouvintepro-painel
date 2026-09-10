"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// NAVEGACAO LATERAL DO PAINEL.
// Vive dentro do route group (painel), entao NAO aparece no /login: mostrar
// navegacao de painel para quem ainda nao autenticou e o erro classico de quem
// poe a barra no layout raiz.
//
// Dois itens de proposito. "Ouvintes" nao existe como visao separada hoje (o
// que existe e o ModalOuvinte, que abre de dentro do dashboard), e item de menu
// que aponta para pagina inventada e pior do que menu curto.
const ITENS: { href: string; label: string; desc: string }[] = [
  { href: "/", label: "Dashboard", desc: "Visão geral dos ouvintes" },
  { href: "/audiencia", label: "Audiência", desc: "Público para anunciantes" },
];

function itemAtivo(pathname: string, href: string): boolean {
  // "/" so casa exato, senao ficaria ativo em toda rota do painel.
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Sidebar({ usuario }: { usuario: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  // SO PARA ACESSIBILIDADE. Quem decide a visibilidade continua sendo o Tailwind
  // (lg:hidden e lg:flex). Isto existe porque display:none esconde da tela mas os
  // DOIS blocos de navegacao coexistem no DOM: querySelectorAll("nav a") devolvia
  // 4 links e um leitor de tela anunciava Dashboard e Audiencia duas vezes.
  // Comeca false para o HTML do servidor bater com o do cliente na hidratacao.
  const [ehDesktop, setEhDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setEhDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setSaindo(false);
    }
  }

  const navItens = (
    <nav className="flex flex-col gap-1">
      {ITENS.map((it) => {
        const ativo = itemAtivo(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setAberto(false)}
            aria-current={ativo ? "page" : undefined}
            className={`group flex flex-col gap-0.5 rounded-xl border px-3.5 py-2.5 transition-colors ${
              ativo
                ? "border-neon-violet/40 bg-gradient-to-r from-neon-pink/15 to-neon-violet/15"
                : "border-transparent hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                ativo ? "text-mist-50" : "text-mist-100"
              }`}
            >
              {it.label}
            </span>
            <span className="text-[11px] text-mist-400">{it.desc}</span>
          </Link>
        );
      })}
    </nav>
  );

  const rodape = (
    <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
      <div className="flex items-center gap-2.5 px-1">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink to-neon-violet text-xs font-bold text-white">
          {(usuario ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-semibold text-mist-100">
            {usuario ?? "Sessão"}
          </span>
          <span className="text-[10px] text-mist-400">Rádio Liverpool</span>
        </div>
      </div>
      <button
        onClick={sair}
        disabled={saindo}
        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-mist-300 transition-colors hover:border-neon-pink/40 hover:text-mist-50 disabled:opacity-50"
      >
        {saindo ? "Saindo..." : "Sair"}
      </button>
    </div>
  );

  const marca = (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-xl font-black italic tracking-tight">
        <span className="text-mist-50">Ouvinte</span>
        <span className="text-gradient">PRO</span>
      </span>
      <span className="text-[10px] uppercase tracking-widest text-mist-400">
        Painel
      </span>
    </div>
  );

  return (
    <>
      {/* Barra superior: abaixo de lg. Sem biblioteca, so estado e classes. */}
      <div
        aria-hidden={ehDesktop}
        className="sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-ink-950/80 px-5 py-3 backdrop-blur-xl lg:hidden"
      >
        {marca}
        <button
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-mist-200"
        >
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>
      {aberto ? (
        <div
          aria-hidden={ehDesktop}
          className="sticky top-[57px] z-30 flex flex-col gap-4 border-b border-white/5 bg-ink-950/95 px-5 py-4 backdrop-blur-xl lg:hidden"
        >
          {navItens}
          {rodape}
        </div>
      ) : null}

      {/* Coluna fixa: a partir de lg. */}
      <aside
        aria-hidden={!ehDesktop}
        className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-white/5 bg-ink-900/50 px-4 py-6 backdrop-blur-xl lg:flex"
      >
        <div className="flex flex-col gap-7">
          {marca}
          {navItens}
        </div>
        {rodape}
      </aside>
    </>
  );
}
