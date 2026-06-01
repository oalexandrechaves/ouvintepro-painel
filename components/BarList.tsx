"use client";

import { formatValue, somaSerie } from "@/lib/mockData";
import type { DisplayMode, SerieItem } from "@/lib/mockData";

interface BarListProps {
  serie: SerieItem[];
  mode: DisplayMode;
}

export default function BarList({ serie, mode }: BarListProps) {
  const total = somaSerie(serie);
  const max = Math.max(...serie.map((s) => s.valor));

  return (
    <div className="flex flex-col gap-4">
      {serie.map((item) => (
        <div key={item.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-mist-100">{item.label}</span>
            <span className="font-display text-sm text-mist-50 tabular-nums">
              {formatValue(item.valor, total, mode)}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="bar-fill h-full"
              style={{ width: `${(item.valor / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
