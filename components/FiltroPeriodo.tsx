"use client";

import DateRange from "./DateRange";
import type { DisplayMode, SeletorPeriodo } from "@/lib/tipos";
import { diaBr, hojeSaoPaulo } from "@/lib/periodo";

const PERIODOS: { id: SeletorPeriodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "30dias", rotulo: "30 dias" },
  { id: "ano", rotulo: "Ano" },
  { id: "custom", rotulo: "Personalizado" },
];

const MODOS: { id: DisplayMode; rotulo: string }[] = [
  { id: "numero", rotulo: "Número" },
  { id: "percentual", rotulo: "Porcentagem" },
  { id: "combinado", rotulo: "Combinado" },
];

// Periodo e forma de exibicao, VISIVEIS no topo e nao escondidos em menu.
export default function FiltroPeriodo({
  sel,
  onSel,
  customDe,
  customAte,
  onCustom,
  de,
  ate,
  modo,
  onModo,
  atualizadoEm,
}: {
  sel: SeletorPeriodo;
  onSel: (s: SeletorPeriodo) => void;
  customDe: string | null;
  customAte: string | null;
  onCustom: (de: string | null, ate: string | null) => void;
  de: string;
  ate: string;
  modo?: DisplayMode;
  onModo?: (m: DisplayMode) => void;
  atualizadoEm?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="rotulo-mono">Período</span>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => {
            const ativo = p.id === sel;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSel(p.id)}
                aria-pressed={ativo}
                className={`rounded-[9px] border px-3.5 py-[7px] text-[13px] transition-colors ${
                  ativo
                    ? "border-magenta bg-magenta font-medium text-white"
                    : "border-borda-campo bg-fundo-cartao text-texto-forte hover:border-[#D0D0D8] hover:text-texto-titulo"
                }`}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>
        {sel === "custom" ? (
          <DateRange
            inicio={customDe}
            fim={customAte}
            onChange={(i, f) => {
              const h = hojeSaoPaulo();
              onCustom(i && i > h ? h : i, f && f > h ? h : f);
            }}
          />
        ) : null}
        <span className="text-xs text-texto-rotulo">
          {de === ate ? diaBr(de) : `${diaBr(de)} a ${diaBr(ate)}`}
        </span>
      </div>

      {modo && onModo ? (
        <div className="flex items-center gap-2">
          <span className="rotulo-mono">Exibir</span>
          <div className="flex gap-[3px] rounded-[9px] bg-fundo-grupo p-[3px]">
            {MODOS.map((m) => {
              const ativo = m.id === modo;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onModo(m.id)}
                  aria-pressed={ativo}
                  className={`rounded-[7px] px-[13px] py-1.5 text-[12.5px] transition-colors ${
                    ativo
                      ? "bg-fundo-cartao font-medium text-texto-titulo shadow-[0_1px_2px_rgba(20,22,26,0.08)]"
                      : "text-texto-corpo hover:text-texto-titulo"
                  }`}
                >
                  {m.rotulo}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {atualizadoEm ? (
        <div className="text-[12.5px] text-texto-rotulo lg:ml-auto">
          Atualizado às{" "}
          {new Date(atualizadoEm).toLocaleTimeString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      ) : null}
    </div>
  );
}
