"use client";

import { useMemo, useState } from "react";
import type { DisplayMode, Periodo, PontoArea } from "@/lib/mockData";
import type { PainelData } from "@/lib/queries";
import type {
  OuvinteRow,
  PainelExtra as PainelExtraData,
} from "@/lib/serverData";
import AreaCadastros from "./AreaCadastros";
import Background from "./Background";
import BarList from "./BarList";
import CountUp from "./CountUp";
import DateRange from "./DateRange";
import PainelExtra from "./PainelExtra";
import Ranking from "./Ranking";

// Seletor de periodo do topo: os nomeados + o intervalo personalizado.
type Sel = Periodo | "custom";

const seletores: { id: Sel; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "30dias", label: "30 dias" },
  { id: "ano", label: "Ano" },
  { id: "custom", label: "Personalizado" },
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

// Data de hoje (YYYY-MM-DD) no fuso de Brasilia (America/Sao_Paulo).
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Soma/subtrai dias a uma data YYYY-MM-DD, sempre no fuso de Brasilia.
function addDiasSaoPaulo(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setDate(d.getDate() + dias);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Converte o seletor do topo (Hoje/30 dias/Ano) em um intervalo de/ate.
function rangeDoPeriodo(p: Periodo): { de: string; ate: string } {
  const ate = hojeSaoPaulo();
  if (p === "hoje") return { de: ate, ate };
  if (p === "ano") return { de: `${ate.slice(0, 4)}-01-01`, ate };
  return { de: addDiasSaoPaulo(ate, -29), ate };
}

// Intervalo personalizado: aplica defaults sensatos e nao permite datas futuras.
function rangeCustom(
  de: string | null,
  ate: string | null,
): { de: string; ate: string } {
  const hoje = hojeSaoPaulo();
  let d = de;
  let a = ate;
  if (!d && !a) {
    d = hoje;
    a = hoje;
  } else if (d && !a) {
    a = hoje; // so o inicio escolhido: ate = hoje
  } else if (!d && a) {
    d = a; // so o fim escolhido: um unico dia
  }
  // Nao permitir datas futuras.
  if (d! > hoje) d = hoje;
  if (a! > hoje) a = hoje;
  // Fim nunca antes do inicio.
  if (a! < d!) a = d;
  return { de: d!, ate: a! };
}

function diaBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Constroi a serie diaria de cadastros para o intervalo personalizado, a partir
// dos ouvintes ja filtrados pelo periodo (contagem por dia de primeiro contato,
// no fuso de Brasilia). Preenche os dias sem cadastro com zero para o grafico.
function serieDeOuvintes(
  ouvintes: OuvinteRow[],
  de: string,
  ate: string,
): PontoArea[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const cont = new Map<string, number>();
  for (const o of ouvintes) {
    if (!o.cadastroEm) continue;
    const dia = fmt.format(new Date(o.cadastroEm));
    if (dia < de || dia > ate) continue;
    cont.set(dia, (cont.get(dia) ?? 0) + 1);
  }
  const pontos: PontoArea[] = [];
  let cur = de;
  let guarda = 0;
  while (cur <= ate && guarda < 400) {
    pontos.push({ rotulo: `${cur.slice(8, 10)}/${cur.slice(5, 7)}`, cadastros: cont.get(cur) ?? 0 });
    cur = addDiasSaoPaulo(cur, 1);
    guarda++;
  }
  return pontos;
}

export default function Dashboard({ data }: { data: PainelData }) {
  const { kpis, cadastrosPorPeriodo, zonas, faixaEtaria, musicas, hotlink } = data;
  const [sel, setSel] = useState<Sel>("30dias");
  const [customDe, setCustomDe] = useState<string | null>(null);
  const [customAte, setCustomAte] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>("numero");
  const [extra, setExtra] = useState<PainelExtraData | null>(null);

  // Intervalo efetivo que governa TODAS as secoes do painel.
  const { de: periodoDe, ate: periodoAte } = useMemo(
    () => (sel === "custom" ? rangeCustom(customDe, customAte) : rangeDoPeriodo(sel)),
    [sel, customDe, customAte],
  );

  // No modo personalizado o grafico de cadastros e derivado dos ouvintes do
  // periodo; nos modos nomeados usa a serie pre-calculada (anon).
  const serieArea = useMemo(
    () =>
      sel === "custom"
        ? serieDeOuvintes(extra?.ouvintes ?? [], periodoDe, periodoAte)
        : cadastrosPorPeriodo[sel] ?? [],
    [sel, extra, periodoDe, periodoAte, cadastrosPorPeriodo],
  );

  const rotuloPeriodo =
    sel === "custom"
      ? `${diaBr(periodoDe)} a ${diaBr(periodoAte)}`
      : seletores.find((s) => s.id === sel)?.label;
  // Enquanto os dados filtrados nao chegam, mostra os valores do load inicial.
  // So usa o extra (service role) quando ele tem dados; se vier vazio (service
  // role indisponivel), mantem os dados do anon em vez de esvaziar os cards.
  const zonasView = extra?.zonas?.length ? extra.zonas : zonas;
  const faixaView = extra?.faixaEtaria?.length ? extra.faixaEtaria : faixaEtaria;
  const musicasView = extra?.musicasAmadas?.length ? extra.musicasAmadas : musicas;

  return (
    <div className="relative min-h-screen bg-grid">
      <Background />

      <main className="relative z-10 mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        {/* Topo */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-4xl font-black italic tracking-tight sm:text-5xl">
              <span className="text-mist-50">Rádio</span>{" "}
              <span className="text-[#D32029]">Liverpool</span>
            </h1>
            <p className="text-sm text-mist-300">Painel de ouvintes</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <SegMenu
              options={seletores}
              value={sel}
              onChange={(v) => setSel(v as Sel)}
            />
            {sel === "custom" ? (
              <div className="flex items-center gap-2">
                <DateRange
                  inicio={customDe}
                  fim={customAte}
                  onChange={(i, f) => {
                    const h = hojeSaoPaulo();
                    setCustomDe(i && i > h ? h : i);
                    setCustomAte(f && f > h ? h : f);
                  }}
                />
                <span className="hidden text-xs text-mist-300 sm:inline">
                  {diaBr(periodoDe)} a {diaBr(periodoAte)}
                </span>
              </div>
            ) : null}
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
              <span className="text-xs text-mist-400">{rotuloPeriodo}</span>
            </div>
            <AreaCadastros data={serieArea} />
          </div>

          <div className="glass p-6">
            <h2 className="mb-5 text-lg font-semibold">Zonas</h2>
            <BarList serie={zonasView} mode={mode} />
          </div>
        </section>

        {/* Faixa etária + Músicas + Hotlink */}
        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass p-6">
            <h2 className="mb-5 text-lg font-semibold">Faixa etária</h2>
            <BarList serie={faixaView} mode={mode} />
          </div>

          <div className="glass p-6">
            <h2 className="mb-5 text-lg font-semibold">Músicas preferidas</h2>
            <Ranking serie={musicasView} mode={mode} />
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
        <PainelExtra
          mode={mode}
          periodoDe={periodoDe}
          periodoAte={periodoAte}
          onData={setExtra}
        />

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
