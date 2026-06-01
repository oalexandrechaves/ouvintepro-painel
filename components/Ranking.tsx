"use client";

import { formatValue, somaSerie } from "@/lib/mockData";
import type { DisplayMode, SerieItem } from "@/lib/mockData";

interface RankingProps {
  serie: SerieItem[];
  mode: DisplayMode;
}

const medalha = ["text-neon-gold", "text-mist-100", "text-neon-pink"];

export default function Ranking({ serie, mode }: RankingProps) {
  const total = somaSerie(serie);

  return (
    <ol className="flex flex-col gap-3">
      {serie.map((item, i) => (
        <li
          key={item.label}
          className="flex items-center justify-between rounded-xl border border-white/5 bg-ink-850/50 px-4 py-3 transition-colors hover:border-neon-violet/30"
        >
          <div className="flex items-center gap-3">
            <span
              className={`font-display text-lg font-bold tabular-nums ${
                medalha[i] ?? "text-mist-400"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm text-mist-100">{item.label}</span>
          </div>
          <span className="font-display text-sm text-mist-50 tabular-nums">
            {formatValue(item.valor, total, mode)}
          </span>
        </li>
      ))}
    </ol>
  );
}
