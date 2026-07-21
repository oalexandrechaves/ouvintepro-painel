"use client";

import { useState } from "react";
import type { DisplayMode, Periodo } from "@/lib/mockData";
import type { PainelData } from "@/lib/queries";
import AreaCadastros from "./AreaCadastros";
import Background from "./Background";
import BarList from "./BarList";
import CountUp from "./CountUp";
import PainelExtra from "./PainelExtra";
import Ranking from "./Ranking";

const periodos: { id: Periodo; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "30dias", label: "30 dias" },
  { id: "ano", label: "Ano" },
];

const modos: { id: DisplayMode; label: string }[] = [
  { id: "numero", label: "Número" },
  { id: "percentual", label: "%" },
  { id: "combinado", label: "Combinado" },
];

const corValor: Record<string, string> = {
  "neon-pink": "text-neon-pink",
  "neon-violet": "text-neon-violet",
  "neon-cyan": "text-neon-cyan",
  "neon-gold": "text-neon-gold",
};

export default function Dashboard({ data }: { data: PainelData }) {
  const { kpis, cadastrosPorPeriodo, zonas, faixaEtaria, musicas, hotlink } = data;
  const [periodo, setPeriodo] = useState<Periodo>("30dias");
  const [mode, setMode] = useState<DisplayMode>("numero");
  const serieArea = cadastrosPorPeriodo[periodo] ?? [];

  return (
    <div className="relative min-h-screen bg-grid">
      <Background />

      <main className="relative z-10 mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {/* Topo */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-radio-liverpool.png"
              alt="Rádio Liverpool"
              className="h-14 w-auto shrink-0"
            />
            <p className="text-sm text-mist-300">Painel de ouvintes</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegMenu
              options={periodos}
              value={periodo}
              onChange={(v) => setPeriodo(v as Periodo)}
            />
            <SegMenu
              options={modos}
              value={mode}
              onChange={(v) => setMode(v as DisplayMode)}
            />
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm font-medium text-mist-400 transition-colors hover:text-mist-50"
                title="Sair"
              >
                Sair
              </button>
            </form>
          </div>
        </header>

        {/* KPIs */}
        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="glass p-5">
              <p className="text-sm text-mist-300">{kpi.label}</p>
              <p
                className={`mt-3 font-display text-3xl font-bold tabular-nums ${
                  corValor[kpi.cor] ?? "text-mist-50"
                }`}
              >
                <CountUp value={kpi.valor} />
              </p>
              <p className="mt-1 text-xs text-mist-400">
                {kpi.delta}
                {kpi.detalhe ? ` · ${kpi.detalhe}` : ""}
              </p>
            </div>
          ))}
        </section>

        {/* Area + Zonas */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass p-6 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Cadastros por período</h2>
              <span className="text-xs text-mist-400">
                {periodos.find((p) => p.id === periodo)?.label}
              </span>
            </div>
            <AreaCadastros data={serieArea} />
          </div>

          <div className="glass p-6">
            <h2 className="mb-5 text-lg font-semibold">Zonas</h2>
            <BarList serie={zonas} mode={mode} />
          </div>
        </section>

        {/* Faixa etária + Músicas + Hotlink */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass p-6">
            <h2 className="mb-5 text-lg font-semibold">Faixa etária</h2>
            <BarList serie={faixaEtaria} mode={mode} />
          </div>

          <div className="glass p-6">
            <h2 className="mb-5 text-lg font-semibold">Músicas preferidas</h2>
            <Ranking serie={musicas} mode={mode} />
          </div>

          {/* Hotlink em dourado */}
          <div className="glass relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-neon-gold/15 via-transparent to-transparent" />
            <div className="relative">
              <h2 className="text-lg font-semibold text-neon-gold">
                Atribuição comercial
              </h2>
              <p className="mt-1 text-sm text-mist-300">Hotlink</p>

              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <p className="text-xs uppercase tracking-wide text-mist-400">
                    Acessos
                  </p>
                  <p className="font-display text-3xl font-bold tabular-nums text-neon-gold">
                    <CountUp value={hotlink.acessos} />
                  </p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-mist-400">
                      Conversões
                    </p>
                    <p className="font-display text-2xl font-bold tabular-nums text-mist-50">
                      <CountUp value={hotlink.conversoes} />
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-mist-400">
                      Taxa
                    </p>
                    <p className="font-display text-2xl font-bold tabular-nums text-neon-gold">
                      <CountUp value={hotlink.taxa} decimals={1} suffix="%" />
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Painel expandido (filtros, rankings, zonas, radios, lista de ouvintes) */}
        <PainelExtra mode={mode} />

        {/* Rodapé */}
        <footer className="mt-10 border-t border-white/5 pt-6 text-center text-xs text-mist-400">
          Rádio Liverpool · powered by OuvintePro · Dados e Conexão na Rádio
        </footer>
      </main>
    </div>
  );
}

interface SegMenuProps {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}

function SegMenu({ options, value, onChange }: SegMenuProps) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-ink-900/60 p-1 backdrop-blur-xl">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.id
              ? "bg-gradient-to-r from-neon-pink to-neon-violet text-white shadow-lg shadow-neon-violet/20"
              : "text-mist-300 hover:text-mist-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
