"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatValue, somaSerie } from "@/lib/tipos";
import type { DisplayMode, SerieItem } from "@/lib/tipos";

// Pecas visuais do tema claro, reproduzindo o arquivo de referencia.

// ENTRADA POR ROLAGEM. O que ja esta na tela aparece direto; o que esta abaixo
// entra com fade e 16px de subida quando chega a viewport. Fallback de 1,4 s
// porque aba em segundo plano nao dispara IntersectionObserver e a secao ficaria
// invisivel para sempre. Movimento reduzido: nada e escondido.
export function Revelar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(16px)";
    el.style.transition =
      "opacity .55s ease, transform .55s cubic-bezier(.22,.8,.3,1)";
    const mostrar = () => {
      el.style.opacity = "1";
      el.style.transform = "none";
    };
    const fallback = window.setTimeout(mostrar, 1400);
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          window.clearTimeout(fallback);
          mostrar();
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      window.clearTimeout(fallback);
      io.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// Secao numerada da Visao geral. O numero em DM Mono magenta e o titulo em Clash
// caem de tamanho da 01 para a 06: a hierarquia visual e parte do pedido.
export function Secao({
  numero,
  titulo,
  descricao,
  destaque = false,
  children,
}: {
  numero: string;
  titulo: string;
  descricao?: string;
  destaque?: boolean;
  children: React.ReactNode;
}) {
  const conteudo = (
    <section className={numero === "01" ? "" : "mt-12"}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs font-medium text-magenta">
          {numero}
        </span>
        <h2
          className={`m-0 font-semibold tracking-[-0.01em] text-texto-titulo ${
            destaque ? "text-[22px]" : "text-xl"
          }`}
        >
          {titulo}
        </h2>
        {descricao ? (
          <span className="text-[13px] text-texto-rotulo">{descricao}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
  return numero === "01" ? conteudo : <Revelar>{conteudo}</Revelar>;
}

export function Cartao({
  titulo,
  children,
  className = "",
}: {
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`cartao cartao-interativo min-w-0 p-[22px] ${className}`}>
      {titulo ? (
        <div className="mb-4 text-[13px] font-medium text-texto-titulo">
          {titulo}
        </div>
      ) : null}
      {children}
    </div>
  );
}

const useLayoutIsomorfico =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// ANIMACAO DE ENTRADA QUE NUNCA DEIXA NUMERO EM ZERO.
// Barras e contadores nasciam em 0 e cresciam por requestAnimationFrame. Em aba
// em segundo plano o navegador pausa o rAF, e o painel ficou mostrando 0 nos
// tres numeros da secao 01 com os dados certos na tela (conferido em producao em
// 12/09/2026: visibilityState "hidden", rAF parado, barras em 0%).
// Agora o estado INICIAL e o valor final, entao o HTML ja nasce certo. So anima
// se a aba estiver visivel e sem pedido de menos movimento; e um temporizador de
// seguranca completa o valor se o rAF parar no meio.
export function useEntradaAnimada(): boolean {
  const [cheio, setCheio] = useState(true);
  useLayoutIsomorfico(() => {
    if (
      document.visibilityState !== "visible" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    setCheio(false);
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setCheio(true)),
    );
    const seguro = window.setTimeout(() => setCheio(true), 400);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(seguro);
    };
  }, []);
  return cheio;
}

export function Barras({
  serie,
  mode,
  total,
  vazio = "Sem dados neste período.",
  gradiente = "barra-h",
}: {
  serie: SerieItem[];
  mode: DisplayMode;
  total?: number;
  vazio?: string;
  gradiente?: string;
}) {
  const cheio = useEntradaAnimada();
  if (!serie.length) return <EstadoVazio texto={vazio} />;
  const soma = total ?? somaSerie(serie);
  const max = Math.max(1, ...serie.map((s) => s.valor));
  return (
    <div className="flex flex-col gap-[13px]">
      {serie.map((item, i) => (
        <div key={item.label} className="min-w-0">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-texto-titulo">
              {item.label}
            </span>
            <span className="shrink-0 font-mono text-xs text-texto-corpo">
              {formatValue(item.valor, soma, mode)}
            </span>
          </div>
          <div className="h-[7px] overflow-hidden rounded bg-fundo-trilho">
            <div
              className={`${gradiente} h-full`}
              style={{
                width: cheio
                  ? `${((item.valor / max) * 100).toFixed(1)}%`
                  : "0%",
                transitionDelay: `${i * 55}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListaRanking({
  itens,
  mode,
  total,
  vazio = "Sem dados neste período.",
}: {
  itens: { label: string; valor: number; sub?: string | null }[];
  mode: DisplayMode;
  total?: number;
  vazio?: string;
}) {
  if (!itens.length) return <EstadoVazio texto={vazio} />;
  const soma = total ?? itens.reduce((a, x) => a + x.valor, 0);
  return (
    <div className="flex flex-col">
      {itens.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="flex items-center justify-between gap-3 border-b border-[#F4F4F7] py-[9px] text-[13.5px] last:border-b-0"
        >
          <span className="flex min-w-0 items-baseline gap-2.5">
            <span className="font-mono text-[11px] text-texto-off">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{r.label}</span>
              {r.sub ? (
                <span className="block truncate text-[11.5px] text-texto-rotulo">
                  {r.sub}
                </span>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 font-mono text-xs text-texto-corpo">
            {formatValue(r.valor, soma, mode)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EstadoVazio({ texto }: { texto: string }) {
  return (
    <p className="animate-fadeIn py-2 text-[13px] text-texto-rotulo">{texto}</p>
  );
}

export function EstadoVazioGrande({
  titulo,
  texto,
  acao,
}: {
  titulo: string;
  texto: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="animate-fadeIn px-6 py-14 text-center">
      <div className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-[14px] border border-[#EDEDF1] bg-fundo-hover text-[19px] text-[#B5B5C0]">
        ⌕
      </div>
      <div className="mt-4 font-display text-lg font-semibold">{titulo}</div>
      <div className="mt-1.5 text-[13px] text-texto-corpo">{texto}</div>
      {acao ? <div className="mt-4">{acao}</div> : null}
    </div>
  );
}

export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: "neutro" | "magenta" | "violeta" | "verde" | "ambar";
}) {
  const cores = {
    neutro: "bg-fundo-trilho text-texto-corpo",
    magenta: "bg-magenta-claro text-magenta-escuro",
    violeta: "bg-violeta-claro text-violeta-escuro",
    verde: "bg-verde-claro text-verde",
    ambar: "bg-ambar-claro text-ambar",
  }[tom];
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-[3px] text-xs font-medium ${cores}`}
    >
      {children}
    </span>
  );
}

// Esqueleto de carregamento: mesma geometria dos cartoes, com shimmer.
export function EsqueletoCartoes({ quantos = 3 }: { quantos?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
      {Array.from({ length: quantos }).map((_, i) => (
        <div key={i} className="cartao p-[26px]">
          <div className="esqueleto h-3 w-[46%] rounded-md" />
          <div className="esqueleto mt-4 h-11 w-[68%] rounded-[10px]" />
          <div className="esqueleto mt-4 h-2.5 w-[58%] rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoLista({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="esqueleto h-[11px] w-[44%] rounded-md" />
      {Array.from({ length: linhas }).map((_, i) => (
        <div
          key={i}
          className="h-[9px] rounded bg-[#F4F4F7]"
          style={{ width: `${100 - i * 14}%` }}
        />
      ))}
    </div>
  );
}
