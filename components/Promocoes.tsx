"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SeletorPeriodo } from "@/lib/tipos";
import { rangeCustom, rangeDoPeriodo } from "@/lib/periodo";
import Cabecalho from "./Cabecalho";
import FiltroPeriodo from "./FiltroPeriodo";
import { EsqueletoLista } from "./ui";

// PROMOCOES: lista de promocoes com participacao e o sorteio com ganhadores.
// Era um card dentro do dashboard e virou tela no redesign; o sorteio e uma
// funcao em uso e nao podia sumir.

interface PromocaoRow {
  slug: string;
  label: string;
  variacoes: string[];
  participantes: number;
  participacoes: number;
}

interface PromoVitoria {
  promocao: string;
  data: string | null;
}

interface PromoParticipante {
  ouvinteId: string;
  nome: string | null;
  telefoneMasc: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  participacoes: number;
  primeiraEm: string | null;
  ultimaEm: string | null;
  variacaoExata: string;
  jaGanhou: PromoVitoria[];
}

interface PromoGanhador {
  id: string;
  ouvinteId: string;
  nome: string | null;
  telefoneMasc: string | null;
  bairro: string | null;
  confirmadoEm: string | null;
}

interface PromocaoDetalhe {
  slug: string;
  label: string;
  variacoes: string[];
  participantes: PromoParticipante[];
  ganhadores: PromoGanhador[];
}

function dataPtBr(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  // Sempre no fuso de Brasilia (sem horario de verao, offset fixo -03:00).
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function Promocoes() {
  const [sel, setSel] = useState<SeletorPeriodo>("30dias");
  const [customDe, setCustomDe] = useState<string | null>(null);
  const [customAte, setCustomAte] = useState<string | null>(null);
  const [promocoes, setPromocoes] = useState<PromocaoRow[] | null>(null);
  const [configurado, setConfigurado] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [promoAberta, setPromoAberta] = useState<PromocaoRow | null>(null);

  const { de, ate } = useMemo(
    () =>
      sel === "custom" ? rangeCustom(customDe, customAte) : rangeDoPeriodo(sel),
    [sel, customDe, customAte],
  );

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    fetch(`/api/promocoes?de=${de}&ate=${ate}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configurado: boolean; promocoes: PromocaoRow[] } | null) => {
        if (!ativo) return;
        setConfigurado(!!d?.configurado);
        setPromocoes(d?.promocoes ?? []);
        setAtualizadoEm(new Date().toISOString());
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [de, ate]);

  return (
    <>
      <Cabecalho
        tela="Promoções"
        subtitulo="Quem participou de cada promoção, sorteio e ganhadores confirmados."
      >
        <FiltroPeriodo
          sel={sel}
          onSel={setSel}
          customDe={customDe}
          customAte={customAte}
          onCustom={(i, f) => {
            setCustomDe(i);
            setCustomAte(f);
          }}
          de={de}
          ate={ate}
          atualizadoEm={carregando ? null : atualizadoEm}
        />
      </Cabecalho>

      <div className="max-w-[860px] pt-8">
        <div className="cartao p-[22px] sm:p-7">
          {carregando && promocoes === null ? (
            <EsqueletoLista linhas={6} />
          ) : !configurado ? (
            <p className="text-center text-sm text-texto-corpo">
              Não foi possível carregar os dados agora. Tente de novo em
              instantes.
            </p>
          ) : (
            <div
              className={
                carregando
                  ? "opacity-60 transition-opacity"
                  : "transition-opacity"
              }
            >
              <PromocoesLista
                promocoes={promocoes ?? []}
                onOpen={setPromoAberta}
              />
            </div>
          )}
        </div>
      </div>

      {promoAberta ? (
        <ModalPromocao
          promo={promoAberta}
          periodoDe={de}
          periodoAte={ate}
          onClose={() => setPromoAberta(null)}
        />
      ) : null}
    </>
  );
}

function PromocoesLista({
  promocoes,
  onOpen,
}: {
  promocoes: PromocaoRow[];
  onOpen: (p: PromocaoRow) => void;
}) {
  if (!promocoes || promocoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
        <span className="text-2xl">🎁</span>
        <p className="text-sm text-texto-corpo">
          Nenhuma promoção ativa ainda.
        </p>
        <p className="text-xs text-texto-rotulo">
          As participações via <span className="text-magenta">#promo</span>{" "}
          aparecem aqui.
        </p>
      </div>
    );
  }
  const max = Math.max(1, ...promocoes.map((p) => p.participantes));
  return (
    <div className="flex flex-col gap-3">
      {promocoes.map((p) => (
        <button
          key={p.slug}
          type="button"
          onClick={() => onOpen(p)}
          title="Ver participantes e sortear"
          className="flex w-full flex-col gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-fundo-hover"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-texto-titulo">{p.label}</span>
            <span className="font-display text-sm tabular-nums text-texto-titulo">
              {p.participantes}
              <span className="ml-1 text-xs text-texto-rotulo">
                {p.participantes === 1 ? "participante" : "participantes"}
              </span>
            </span>
          </div>
          {p.variacoes.length > 0 ? (
            <span className="text-[11px] text-texto-rotulo">
              inclui: {p.variacoes.join(", ")}
            </span>
          ) : null}
          <div className="h-2 w-full overflow-hidden rounded-full bg-fundo-trilho">
            <div
              className="barra-h h-full"
              style={{ width: `${(p.participantes / max) * 100}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

// Modal de uma promocao: participantes, sorteio e ganhadores. Espelha o padrao
// do ModalOuvinte (overlay, fecha no Esc/clique fora). Sempre por ouvinte_id.
function ModalPromocao({
  promo,
  periodoDe,
  periodoAte,
  onClose,
}: {
  promo: PromocaoRow;
  periodoDe: string | null;
  periodoAte: string | null;
  onClose: () => void;
}) {
  const [detalhe, setDetalhe] = useState<PromocaoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sorteado, setSorteado] = useState<PromoParticipante | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    const params = new URLSearchParams({ slug: promo.slug });
    if (periodoDe) params.set("de", periodoDe);
    if (periodoAte) params.set("ate", periodoAte);
    return fetch(`/api/promocao?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { detalhe: null }))
      .then((d) => setDetalhe((d?.detalhe ?? null) as PromocaoDetalhe | null))
      .catch(() => setDetalhe(null))
      .finally(() => setCarregando(false));
  }, [promo.slug, periodoDe, periodoAte]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const participantes = detalhe?.participantes ?? [];
  const ganhadores = detalhe?.ganhadores ?? [];
  const label = detalhe?.label ?? promo.label;
  const variacoes = detalhe?.variacoes ?? promo.variacoes;

  function sortear() {
    setAviso(null);
    if (participantes.length === 0) {
      setSorteado(null);
      return;
    }
    const escolhido =
      participantes[Math.floor(Math.random() * participantes.length)];
    setSorteado(escolhido);
  }

  async function confirmar() {
    if (!sorteado || !detalhe) return;
    setConfirmando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/promocao/ganhador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ouvinte: sorteado.ouvinteId,
          promocao: detalhe.label,
          variacao: sorteado.variacaoExata,
        }),
      });
      const d = (await r.json().catch(() => ({ ok: false }))) as {
        ok?: boolean;
      };
      if (d?.ok) {
        setAviso(`${sorteado.nome ?? "Ganhador"} confirmado!`);
        setSorteado(null);
        await carregar();
      } else {
        setAviso("Não foi possível registrar o ganhador. Tente de novo.");
      }
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-[rgba(20,22,26,0.32)] p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] animate-pop rounded-[18px] border border-borda-cartao bg-fundo-cartao shadow-modal w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecalho */}
        <div className="flex items-start justify-between border-b border-borda-divisor px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-texto-titulo">
              {label}
            </h3>
            <p className="text-xs text-texto-rotulo">
              {participantes.length}{" "}
              {participantes.length === 1 ? "participante" : "participantes"}
            </p>
            {variacoes.length > 0 ? (
              <p className="mt-0.5 text-[11px] text-texto-rotulo">
                inclui: {variacoes.join(", ")}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2.5 py-1 text-lg leading-none text-texto-rotulo transition-colors hover:text-texto-titulo"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Sorteio */}
        <div className="border-b border-borda-divisor px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={sortear}
              disabled={carregando || participantes.length === 0}
              className="botao-primario disabled:cursor-not-allowed"
            >
              {sorteado ? "Sortear novamente" : "Sortear"}
            </button>
            {aviso ? (
              <span className="text-sm text-texto-forte">{aviso}</span>
            ) : null}
          </div>

          {sorteado ? (
            <div className="mt-4 rounded-2xl border border-borda-hover bg-fundo-claro p-4">
              {sorteado.jaGanhou.length > 0 ? (
                <div className="mb-3 rounded-xl border border-ambar-claro bg-ambar-claro px-3 py-2 text-sm text-ambar">
                  <strong className="font-semibold">Atenção:</strong> esta
                  pessoa já ganhou{" "}
                  {sorteado.jaGanhou
                    .map((v) => `${v.promocao} em ${dataPtBr(v.data)}`)
                    .join("; ")}
                  .
                </div>
              ) : null}
              <p className="text-[11px] uppercase tracking-wide text-texto-rotulo">
                Ganhador sorteado
              </p>
              <p className="font-display text-xl font-bold text-texto-titulo">
                {sorteado.nome ?? "Ouvinte sem nome"}
              </p>
              <p className="text-sm text-texto-corpo">
                {[sorteado.telefoneMasc, sorteado.bairro]
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={confirmando}
                  className="botao bg-verde text-white hover:opacity-90 disabled:opacity-50"
                >
                  {confirmando ? "Confirmando..." : "Confirmar ganhador"}
                </button>
                <button
                  type="button"
                  onClick={sortear}
                  disabled={confirmando}
                  className="botao-secundario"
                >
                  Sortear novamente
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Ganhadores confirmados */}
        <div className="border-b border-borda-divisor px-6 py-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-texto-rotulo">
            Ganhadores confirmados ({ganhadores.length})
          </p>
          {ganhadores.length === 0 ? (
            <p className="text-sm text-texto-rotulo">
              Nenhum ganhador confirmado ainda.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {ganhadores.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-xl border border-verde-claro bg-verde-claro px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-texto-titulo">
                      {g.nome ?? "Ouvinte sem nome"}
                    </p>
                    <p className="text-xs text-texto-corpo">
                      {[g.telefoneMasc, g.bairro].filter(Boolean).join(" · ") ||
                        "-"}
                    </p>
                  </div>
                  <span className="text-xs tabular-nums text-texto-rotulo">
                    {dataPtBr(g.confirmadoEm)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Participantes */}
        <div className="flex-1 overflow-y-auto bg-fundo-claro px-4 py-4">
          {carregando ? (
            <p className="py-8 text-center text-sm text-texto-rotulo">
              Carregando participantes...
            </p>
          ) : participantes.length === 0 ? (
            <p className="py-8 text-center text-sm text-texto-rotulo">
              Nenhum participante no período selecionado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-texto-rotulo">
                  <tr className="border-b border-borda-divisor">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">Bairro/Zona</th>
                    <th className="py-2 pr-3">Cidade/UF</th>
                    <th className="py-2 pr-3">Participou</th>
                    <th className="py-2 pr-3">Digitou</th>
                    <th className="py-2 pr-3">Part.</th>
                  </tr>
                </thead>
                <tbody>
                  {participantes.map((p) => (
                    <tr
                      key={p.ouvinteId}
                      className="border-b border-[#F4F4F7] text-texto-titulo"
                    >
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5">
                          {p.nome ?? "Ouvinte sem nome"}
                          {p.jaGanhou.length > 0 ? (
                            <span
                              title="Já ganhou promoção antes"
                              className="rounded-full bg-ambar-claro px-1.5 py-0.5 text-[10px] text-ambar"
                            >
                              já ganhou
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-texto-corpo">
                        {p.telefoneMasc ?? "-"}
                      </td>
                      <td className="py-2 pr-3 text-texto-corpo">
                        {[p.bairro, p.zona].filter(Boolean).join(" / ") || "-"}
                      </td>
                      <td className="py-2 pr-3 text-texto-corpo">
                        {p.cidade
                          ? `${p.cidade}${p.estado ? "/" + p.estado : ""}`
                          : "-"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-texto-corpo">
                        {dataPtBr(p.primeiraEm)}
                      </td>
                      <td className="py-2 pr-3 text-texto-rotulo">
                        {p.variacaoExata || "-"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-texto-corpo">
                        {p.participacoes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
