"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// NAVEGACAO LATERAL DO AtendentePRO.
// Vive dentro do route group (painel), entao NAO aparece no /login: mostrar
// navegacao de painel para quem ainda nao autenticou e o erro classico de quem
// poe a barra no layout raiz.
//
// ITENS SEM TELA SAO DE DOIS TIPOS, E NAO SAO A MESMA SITUACAO.
// Os dois aparecem, nao navegam e dizem por que; o que muda e a promessa.
//  - "proximo": a tela ja tem escopo aprovado e fila de entrega. Etiqueta
//    violeta "em breve". E o Painel de Controle, que chega no PR C (usuarios e
//    grupos de acesso), o proximo depois do PR B.
//  - "futuro": ninguem construiu, e nao ha data. Etiqueta neutra "futuro". E
//    Atendimentos. Dizer "em breve" aqui seria prometer o que nao esta marcado.
// Quem mudar um item de "futuro" para "proximo" precisa ter a entrega na fila;
// quem liberar a rota, apaga o `pendente` e o item passa a navegar.
type Pendente = { tipo: "proximo" | "futuro"; motivo: string };

const ITENS: { href: string; rotulo: string; pendente?: Pendente }[] = [
  { href: "/", rotulo: "Visão geral" },
  {
    href: "/atendimentos",
    rotulo: "Atendimentos",
    pendente: {
      tipo: "futuro",
      motivo: "Tela ainda não construída, sem data prevista.",
    },
  },
  { href: "/ouvintes", rotulo: "Ouvintes" },
  { href: "/comercial", rotulo: "Comercial" },
  { href: "/promocoes", rotulo: "Promoções" },
  {
    href: "/painel-de-controle",
    rotulo: "Painel de Controle",
    pendente: {
      tipo: "proximo",
      motivo: "Chega com usuários e grupos de acesso, na próxima entrega.",
    },
  },
];

function itemAtivo(pathname: string, href: string): boolean {
  // "/" so casa exato, senao ficaria ativo em toda rota do painel.
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function iniciais(nome: string | null): string {
  const partes = (nome ?? "")
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (!partes.length) return "?";
  return (
    partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")
  ).toUpperCase();
}

export default function Sidebar({ usuario }: { usuario: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  // SO PARA ACESSIBILIDADE. Quem decide a visibilidade e o Tailwind (lg:hidden e
  // lg:flex); isto existe porque display:none esconde da tela mas os DOIS blocos
  // de navegacao coexistem no DOM, e leitor de tela anunciava tudo duas vezes.
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

  const marca = (
    <div>
      <div className="font-display text-[23px] leading-none tracking-[-0.02em]">
        <span className="font-medium text-texto-titulo">Atendente</span>
        <span className="font-bold text-magenta">PRO</span>
      </div>
      <div className="rotulo-mono mt-2 tracking-[0.14em]">Rádio Liverpool</div>
    </div>
  );

  const navItens = (
    <nav className="flex flex-col gap-0.5">
      {ITENS.map((it) => {
        if (it.pendente) {
          const proximo = it.pendente.tipo === "proximo";
          return (
            <div
              key={it.href}
              aria-disabled="true"
              title={it.pendente.motivo}
              className="flex cursor-default select-none items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-sm text-texto-off"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-[2px] bg-[#E4E4EA]" />
              <span className="flex-1">{it.rotulo}</span>
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] ${
                  proximo
                    ? "bg-violeta-claro text-violeta-escuro"
                    : "bg-fundo-trilho text-texto-rotulo"
                }`}
              >
                {proximo ? "em breve" : "futuro"}
              </span>
              <span className="sr-only">. {it.pendente.motivo}</span>
            </div>
          );
        }
        const ativo = itemAtivo(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setAberto(false)}
            aria-current={ativo ? "page" : undefined}
            className={`flex items-center gap-[11px] rounded-[9px] px-3 py-2.5 text-sm transition-colors ${
              ativo
                ? "bg-magenta-claro font-semibold text-magenta-escuro shadow-[inset_2px_0_0_#D81B60]"
                : "text-texto-forte hover:bg-fundo-hover hover:text-texto-titulo"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-[2px] transition-colors ${
                ativo ? "bg-magenta" : "bg-[#D2D2DA]"
              }`}
            />
            <span>{it.rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );

  const rodape = (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-magenta-claro text-[13px] font-bold text-magenta">
        {iniciais(usuario)}
      </div>
      <div className="min-w-0 flex-1 leading-[1.3]">
        {/* Perfil chega no PR C, com os usuarios no banco. Ate la a sessao so
            conhece o login. */}
        <div className="truncate text-[13px] font-medium">
          {usuario ?? "Sessão"}
        </div>
        <div className="text-[11.5px] text-texto-rotulo">Rádio Liverpool</div>
      </div>
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        className="shrink-0 rounded-lg border border-borda-campo px-2.5 py-1.5 text-xs text-texto-corpo transition-colors hover:border-magenta hover:text-magenta disabled:opacity-50"
      >
        {saindo ? "Saindo" : "Sair"}
      </button>
    </div>
  );

  return (
    <>
      {/* Barra superior: abaixo de lg. Sem biblioteca, so estado e classes. */}
      <div
        aria-hidden={ehDesktop}
        className="sticky top-0 z-40 flex items-center justify-between border-b border-borda-cartao bg-fundo-cartao/95 px-5 py-3 backdrop-blur-[8px] lg:hidden"
      >
        {marca}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-label={aberto ? "Fechar menu" : "Abrir menu"}
          className="rounded-[9px] border border-borda-campo px-3 py-1.5 text-sm text-texto-forte"
        >
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>
      {aberto ? (
        <div
          aria-hidden={ehDesktop}
          className="sticky top-[65px] z-30 flex animate-fadeIn flex-col gap-4 border-b border-borda-cartao bg-fundo-cartao px-4 py-4 shadow-hover lg:hidden"
        >
          {navItens}
          <div className="border-t border-borda-divisor pt-4">{rodape}</div>
        </div>
      ) : null}

      {/* Coluna fixa: a partir de lg. */}
      <aside
        aria-hidden={!ehDesktop}
        className="sticky top-0 z-30 hidden h-screen w-[250px] shrink-0 flex-col border-r border-borda-cartao bg-fundo-cartao lg:flex"
      >
        <div className="border-b border-borda-divisor px-[22px] pb-[22px] pt-[26px]">
          {marca}
        </div>
        <div className="px-3 py-3.5">{navItens}</div>
        <div className="mt-auto border-t border-borda-divisor px-[22px] pb-[22px] pt-[18px]">
          {rodape}
        </div>
      </aside>
    </>
  );
}
