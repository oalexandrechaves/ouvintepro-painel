// Tipos e formatacao compartilhados pelo painel. Viviam em mockData.ts junto dos
// numeros ficticios de fallback; o fallback saiu (mostrar numero inventado quando
// o banco falha e mentir), e o que era util ficou aqui.

export type Periodo = "hoje" | "30dias" | "ano";
export type SeletorPeriodo = Periodo | "custom";
export type DisplayMode = "numero" | "percentual" | "combinado";

export interface SerieItem {
  label: string;
  valor: number;
}

const nf = new Intl.NumberFormat("pt-BR");

export function numeroBr(n: number): string {
  return nf.format(n);
}

// Numero em pt-BR, percentual com uma casa (virgula) ou combinado.
export function formatValue(
  val: number,
  total: number,
  mode: DisplayMode,
): string {
  const numero = nf.format(val);
  const pct =
    total > 0
      ? ((val / total) * 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : "0,0";
  if (mode === "numero") return numero;
  if (mode === "percentual") return `${pct}%`;
  return `${numero} · ${pct}%`;
}

export function somaSerie(serie: SerieItem[]): number {
  return serie.reduce((acc, item) => acc + item.valor, 0);
}

// Variacao percentual assinada, com uma casa: "+8,4%", "-2,0%". Sem base
// anterior nao ha variacao que se possa afirmar, e devolve null.
export function variacaoPct(atual: number, anterior: number): string | null {
  if (anterior <= 0) return null;
  const v = ((atual - anterior) / anterior) * 100;
  const s = Math.abs(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${v >= 0 ? "+" : "-"}${s}%`;
}
