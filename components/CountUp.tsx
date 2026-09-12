"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
}

const nf = (decimals: number) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const useLayoutIsomorfico =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// CONTAGEM ANIMADA QUE NUNCA MOSTRA ZERO POR ENGANO.
// O estado inicial e o VALOR, entao o HTML do servidor ja traz o numero certo.
// A contagem a partir de zero so acontece com a aba visivel e sem pedido de
// menos movimento. Em aba em segundo plano o requestAnimationFrame fica pausado,
// e a versao anterior deixava o painel mostrando 0 com o dado certo carregado;
// o temporizador de seguranca garante o valor final mesmo se o rAF parar.
export default function CountUp({
  value,
  duration = 1400,
  decimals = 0,
  suffix = "",
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);

  useLayoutIsomorfico(() => {
    if (
      document.visibilityState !== "visible" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    setDisplay(0);
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(value * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    rafRef.current = requestAnimationFrame(tick);
    const seguro = window.setTimeout(() => setDisplay(value), duration + 250);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearTimeout(seguro);
    };
  }, [value, duration]);

  return (
    <span>
      {nf(decimals).format(display)}
      {suffix}
    </span>
  );
}
