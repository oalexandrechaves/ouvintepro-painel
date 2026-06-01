// TODO: substituir por queries do Supabase

export type Periodo = "hoje" | "30dias" | "ano";
export type DisplayMode = "numero" | "percentual" | "combinado";

export interface Kpi {
  label: string;
  valor: number;
  delta: string;
  detalhe?: string;
  cor: string;
}

export interface SerieItem {
  label: string;
  valor: number;
}

export interface PontoArea {
  rotulo: string;
  cadastros: number;
}

// KPIs principais do topo
export const kpis: Kpi[] = [
  {
    label: "Ouvintes cadastrados",
    valor: 8412,
    delta: "+6,2%",
    cor: "neon-pink",
  },
  {
    label: "Novos no período",
    valor: 1840,
    delta: "+11,8%",
    cor: "neon-violet",
  },
  {
    label: "Conversas hoje",
    valor: 327,
    delta: "tempo real",
    cor: "neon-cyan",
  },
  {
    label: "Cliques no hotlink",
    valor: 1213,
    delta: "9,4%",
    detalhe: "taxa de clique",
    cor: "neon-gold",
  },
];

// Cadastros por período (gráfico de área)
export const cadastrosPorPeriodo: Record<Periodo, PontoArea[]> = {
  hoje: [
    { rotulo: "06h", cadastros: 18 },
    { rotulo: "09h", cadastros: 42 },
    { rotulo: "12h", cadastros: 61 },
    { rotulo: "15h", cadastros: 53 },
    { rotulo: "18h", cadastros: 88 },
    { rotulo: "21h", cadastros: 65 },
  ],
  "30dias": [
    { rotulo: "Sem 1", cadastros: 380 },
    { rotulo: "Sem 2", cadastros: 460 },
    { rotulo: "Sem 3", cadastros: 510 },
    { rotulo: "Sem 4", cadastros: 490 },
  ],
  ano: [
    { rotulo: "Jan", cadastros: 520 },
    { rotulo: "Fev", cadastros: 610 },
    { rotulo: "Mar", cadastros: 700 },
    { rotulo: "Abr", cadastros: 660 },
    { rotulo: "Mai", cadastros: 780 },
    { rotulo: "Jun", cadastros: 840 },
    { rotulo: "Jul", cadastros: 910 },
    { rotulo: "Ago", cadastros: 870 },
    { rotulo: "Set", cadastros: 960 },
    { rotulo: "Out", cadastros: 1020 },
    { rotulo: "Nov", cadastros: 1090 },
    { rotulo: "Dez", cadastros: 1180 },
  ],
};

// Distribuição por zona
export const zonas: SerieItem[] = [
  { label: "Zona Sul", valor: 2980 },
  { label: "Zona Norte", valor: 2210 },
  { label: "Centro", valor: 1640 },
  { label: "Zona Leste", valor: 980 },
  { label: "Zona Oeste", valor: 602 },
];

// Faixa etária
export const faixaEtaria: SerieItem[] = [
  { label: "18 a 24", valor: 1180 },
  { label: "25 a 34", valor: 2760 },
  { label: "35 a 44", valor: 2240 },
  { label: "45 a 54", valor: 1420 },
  { label: "55 ou mais", valor: 812 },
];

// Músicas mais amadas (ranking)
export const musicas: SerieItem[] = [
  { label: "Evidências", valor: 1420 },
  { label: "Garota de Ipanema", valor: 1180 },
  { label: "É o Amor", valor: 990 },
  { label: "Sina", valor: 760 },
  { label: "Trem Bala", valor: 540 },
];

// Atribuição comercial / hotlink
export const hotlink = {
  acessos: 1213,
  conversoes: 114,
  taxa: 9.4,
};

const nf = new Intl.NumberFormat("pt-BR");

// Devolve numero em pt-BR, percentual com uma casa (virgula) ou combinado
export function formatValue(
  val: number,
  total: number,
  mode: DisplayMode
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
