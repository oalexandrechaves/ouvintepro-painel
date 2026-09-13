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

// RANKING COM O TOTAL REAL, E NAO A SOMA DO QUE APARECE.
// Os rankings chegam cortados em 5 ou 6 itens. A porcentagem calculada sobre a
// soma dos exibidos dava Grajaú com 21,1% quando o real era 9,5% (572 de 6.033):
// numero errado com cara de exato. Por isso o total viaja junto, calculado no
// servidor sobre o universo inteiro do cartao, e Barras/ListaRanking EXIGEM este
// tipo: quem esquecer o total nao compila.
//  - total: o denominador da porcentagem (quem o cartao conta, nao quem aparece);
//  - distintos: quantos valores existiam antes do corte, para dizer "6 de 27".
export interface Ranking<T extends SerieItem = SerieItem> {
  itens: T[];
  total: number;
  distintos: number;
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
