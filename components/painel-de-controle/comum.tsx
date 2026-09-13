"use client";

import Link from "next/link";
import { useEffect } from "react";
import { NOME_NIVEL, type Nivel } from "@/lib/acesso/modelo";
import { ErroDaBusca } from "@/lib/buscar";

// PECAS COMPARTILHADAS DAS DUAS TELAS DO PAINEL DE CONTROLE.

// Escala aprovada dos niveis: neutro, violeta claro, ambar, verde. As cores do
// arquivo de referencia (ciano, violeta, magenta) ficaram de fora: magenta ja e a
// cor de marca e de alerta no painel.
const COR_NIVEL: Record<Nivel, string> = {
  sem_acesso: "border-borda-campo bg-fundo-trilho text-texto-corpo",
  visualizacao: "border-[#DCCCFB] bg-violeta-claro text-violeta-escuro",
  edicao: "border-[#FDE68A] bg-ambar-claro text-ambar",
  full: "border-[#BBE5C8] bg-verde-claro text-verde",
};

export function SeloNivel({ nivel }: { nivel: Nivel }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-medium ${COR_NIVEL[nivel]}`}
    >
      {NOME_NIVEL[nivel]}
    </span>
  );
}

export function LegendaNiveis() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {(Object.keys(NOME_NIVEL) as Nivel[]).map((n) => (
        <span key={n} className="flex items-center gap-2 text-[12.5px] text-texto-corpo">
          <span className={`inline-block h-[11px] w-[11px] rounded-[3px] border ${COR_NIVEL[n]}`} />
          {NOME_NIVEL[n]}
        </span>
      ))}
    </div>
  );
}

export function SeloStatus({ ativo, rotulo }: { ativo: boolean; rotulo?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
        ativo ? "bg-verde-claro text-verde" : "bg-fundo-trilho text-texto-corpo"
      }`}
    >
      {rotulo ?? (ativo ? "Ativo" : "Inativo")}
    </span>
  );
}

// Os dois cartoes do topo: onde estou e para onde vou.
export function NavPainel({ atual }: { atual: "usuarios" | "grupos" }) {
  const cartoes = [
    {
      chave: "usuarios",
      href: "/painel-de-controle",
      titulo: "Usuários",
      texto: "Quem entra no sistema, com qual perfil e status.",
    },
    {
      chave: "grupos",
      href: "/painel-de-controle/grupos",
      titulo: "Grupos de acesso",
      texto: "O que cada grupo pode ver e editar em cada módulo.",
    },
  ] as const;
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {cartoes.map((c) => {
        const aqui = c.chave === atual;
        const corpo = (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="font-display text-[17px] font-semibold">{c.titulo}</div>
              {aqui ? (
                <span className="rounded-md bg-magenta-claro px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-magenta-escuro">
                  Você está aqui
                </span>
              ) : (
                <span className="text-texto-rotulo">→</span>
              )}
            </div>
            <div className="mt-1.5 text-[13px] text-texto-corpo">{c.texto}</div>
          </>
        );
        return aqui ? (
          <div key={c.chave} aria-current="page" className="cartao border-magenta/40 px-[22px] py-5">
            {corpo}
          </div>
        ) : (
          <Link key={c.chave} href={c.href} className="cartao cartao-interativo block px-[22px] py-5">
            {corpo}
          </Link>
        );
      })}
    </div>
  );
}

export function Modal({
  titulo,
  subtitulo,
  onFechar,
  children,
  rodape,
}: {
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  children: React.ReactNode;
  rodape: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  return (
    <div
      className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-[rgba(20,22,26,0.32)] p-4 backdrop-blur-[3px]"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="flex max-h-[90vh] w-full max-w-lg animate-pop flex-col overflow-hidden rounded-[18px] border border-borda-cartao bg-fundo-cartao shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-borda-divisor px-6 py-4">
          <div className="min-w-0">
            <div className="font-display text-[19px] font-semibold">{titulo}</div>
            {subtitulo ? (
              <div className="truncate text-[13px] text-texto-corpo">{subtitulo}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onFechar}
            title="Fechar"
            className="rounded-lg px-2 py-0.5 text-lg leading-none text-texto-rotulo hover:text-texto-titulo"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda-divisor px-6 py-4">
          {rodape}
        </div>
      </div>
    </div>
  );
}

export function Campo({
  rotulo,
  children,
  nota,
}: {
  rotulo: string;
  children: React.ReactNode;
  nota?: string;
}) {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className="rotulo-mono">{rotulo}</span>
      {children}
      {nota ? <span className="text-[12px] text-texto-rotulo">{nota}</span> : null}
    </label>
  );
}

export function Interruptor({
  ligado,
  onMudar,
  desligado,
  titulo,
  texto,
}: {
  ligado: boolean;
  onMudar: (v: boolean) => void;
  desligado?: boolean;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-borda-campo px-4 py-3">
      <div>
        <div className="text-[13.5px] font-medium">{titulo}</div>
        <div className="text-[12.5px] text-texto-corpo">{texto}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        disabled={desligado}
        onClick={() => onMudar(!ligado)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          ligado ? "bg-verde" : "bg-[#D2D2DA]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            ligado ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

// Mensagem de falha ao GRAVAR. 403 e 422 trazem o motivo exato do servidor.
// Falha de rede ou 500 NAO dizem "nada foi alterado": o pedido pode ter chegado
// ao banco antes da falha. A tela recarrega a lista para mostrar o que ficou.
export function falhaIncerta(e: unknown): boolean {
  return !(e instanceof ErroDaBusca && (e.status === 403 || e.status === 422));
}

export function mensagemDeGravacao(e: unknown): string {
  if (!falhaIncerta(e)) return (e as ErroDaBusca).message;
  return "Não foi possível confirmar se salvou. A lista foi recarregada: confira antes de tentar de novo.";
}

export function dataBr(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function telefoneBr(digitos: string | null): string {
  if (!digitos) return "";
  const d = digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}
