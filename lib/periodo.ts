import type { Periodo } from "./tipos";

// DIAS DE BRASILIA. O painel inteiro trata "dia" como dia de Sao Paulo, com
// offset fixo -03:00 (o Brasil nao tem horario de verao desde 2019). Estas
// funcoes viviam dentro do Dashboard; sairam para cliente e servidor calcularem
// o mesmo periodo do mesmo jeito.

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hojeSaoPaulo(): string {
  return fmtDia.format(new Date());
}

export function diaSaoPaulo(iso: string): string {
  return fmtDia.format(new Date(iso));
}

export function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00-03:00`);
  d.setDate(d.getDate() + dias);
  return fmtDia.format(d);
}

export function diasEntre(de: string, ate: string): number {
  const a = new Date(`${de}T12:00:00-03:00`).getTime();
  const b = new Date(`${ate}T12:00:00-03:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function rangeDoPeriodo(p: Periodo): { de: string; ate: string } {
  const ate = hojeSaoPaulo();
  if (p === "hoje") return { de: ate, ate };
  if (p === "ano") return { de: `${ate.slice(0, 4)}-01-01`, ate };
  return { de: addDias(ate, -29), ate };
}

// Intervalo personalizado: defaults sensatos, sem datas futuras, fim nunca
// antes do inicio.
export function rangeCustom(
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
    a = hoje;
  } else if (!d && a) {
    d = a;
  }
  if (d! > hoje) d = hoje;
  if (a! > hoje) a = hoje;
  if (a! < d!) a = d;
  return { de: d!, ate: a! };
}

// O PERIODO ANTERIOR tem o mesmo numero de dias e termina no dia antes do
// inicio do atual. "30 dias" compara com os 30 anteriores; "Hoje", com ontem.
export function periodoAnterior(
  de: string,
  ate: string,
): { de: string; ate: string } {
  const n = diasEntre(de, ate) + 1;
  return { de: addDias(de, -n), ate: addDias(de, -1) };
}

// Dia de Brasilia [de, ate] -> limites UTC [deUtc, ateUtc).
export function janelaUtc(
  de: string,
  ate: string,
): { deUtc: string; ateUtc: string } {
  const fim = new Date(`${ate}T03:00:00.000Z`);
  fim.setUTCDate(fim.getUTCDate() + 1);
  return { deUtc: `${de}T03:00:00.000Z`, ateUtc: fim.toISOString() };
}

export function diaBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const MES_CURTO = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function diaMesCurto(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MES_CURTO[Number(iso.slice(5, 7)) - 1]}`;
}
