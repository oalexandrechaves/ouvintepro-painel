"use client";

import { useEffect, useRef, useState } from "react";

interface DateRangeProps {
  inicio: string | null; // yyyy-mm-dd
  fim: string | null; // yyyy-mm-dd
  onChange: (inicio: string | null, fim: string | null) => void;
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

function ymd(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function rotulo(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function DateRange({ inicio, fim, onChange }: DateRangeProps) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setAberto(false);
    }
    if (aberto) document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function clicarDia(dia: number) {
    const iso = ymd(ano, mes, dia);
    if (!inicio || (inicio && fim)) {
      onChange(iso, null);
    } else if (iso < inicio) {
      onChange(iso, null);
    } else {
      onChange(inicio, iso);
      setAberto(false);
    }
  }

  function mudarMes(delta: number) {
    let nm = mes + delta;
    let na = ano;
    if (nm < 0) {
      nm = 11;
      na--;
    } else if (nm > 11) {
      nm = 0;
      na++;
    }
    setMes(nm);
    setAno(na);
  }

  const primeiroDiaSemana = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas: (number | null)[] = [];
  for (let i = 0; i < primeiroDiaSemana; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);

  const texto = inicio
    ? fim
      ? `${rotulo(inicio)} - ${rotulo(fim)}`
      : `${rotulo(inicio)} - ...`
    : "Período";

  function estadoDia(dia: number): "inicio" | "fim" | "meio" | "" {
    const iso = ymd(ano, mes, dia);
    if (inicio && iso === inicio) return "inicio";
    if (fim && iso === fim) return "fim";
    if (inicio && fim && iso > inicio && iso < fim) return "meio";
    return "";
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-2 rounded-[9px] border border-borda-campo bg-fundo-cartao px-3 py-[7px] text-[13px] text-texto-titulo transition-colors hover:border-[#D0D0D8]"
      >
        <span className="text-texto-rotulo">Datas</span>
        <span className={inicio ? "text-texto-titulo" : "text-texto-rotulo"}>
          {texto}
        </span>
      </button>

      {aberto ? (
        <div className="absolute left-0 z-30 mt-2 w-72 animate-pop rounded-2xl border border-borda-cartao bg-fundo-cartao p-4 shadow-modal sm:left-auto sm:right-0">
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => mudarMes(-1)}
              className="rounded-lg px-2 py-1 text-texto-corpo transition-colors hover:bg-fundo-hover hover:text-texto-titulo"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-texto-titulo">
              {MESES[mes]} {ano}
            </span>
            <button
              onClick={() => mudarMes(1)}
              className="rounded-lg px-2 py-1 text-texto-corpo transition-colors hover:bg-fundo-hover hover:text-texto-titulo"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center font-mono text-[10px] uppercase text-texto-rotulo">
            {DIAS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {celulas.map((dia, i) => {
              if (dia === null) return <span key={i} />;
              const est = estadoDia(dia);
              const base =
                "h-8 rounded-lg text-sm tabular-nums transition-colors";
              const cor =
                est === "inicio" || est === "fim"
                  ? "bg-magenta text-white"
                  : est === "meio"
                    ? "bg-magenta-claro text-magenta-escuro"
                    : "text-texto-forte hover:bg-fundo-hover";
              return (
                <button
                  key={i}
                  onClick={() => clicarDia(dia)}
                  className={`${base} ${cor}`}
                >
                  {dia}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={() => {
                onChange(null, null);
                setAberto(false);
              }}
              className="text-xs text-texto-rotulo transition-colors hover:text-magenta"
            >
              Limpar
            </button>
            <button
              onClick={() => setAberto(false)}
              className="rounded-lg border border-borda-campo px-3 py-1 text-xs text-texto-forte transition-colors hover:text-texto-titulo"
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
