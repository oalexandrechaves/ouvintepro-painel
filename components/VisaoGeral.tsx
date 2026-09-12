"use client";

import { useEffect, useMemo, useState } from "react";
import type { VisaoGeral as Dados } from "@/lib/serverData";
import type { DisplayMode, SeletorPeriodo } from "@/lib/tipos";
import { numeroBr, variacaoPct } from "@/lib/tipos";
import { diaBr, rangeCustom, rangeDoPeriodo } from "@/lib/periodo";
import Cabecalho from "./Cabecalho";
import CountUp from "./CountUp";
import FiltroPeriodo from "./FiltroPeriodo";
import {
  Barras,
  Cartao,
  EsqueletoCartoes,
  EsqueletoLista,
  Etiqueta,
  ListaRanking,
  Secao,
} from "./ui";

// VISAO GERAL: seis secoes numeradas em sequencia de leitura. Cada uma responde
// a pergunta que a anterior levanta, e o peso visual cai da 01 para a 06.
//   01 quantos sao · 02 esta crescendo · 03 quem sao
//   04 onde estao  · 05 do que gostam  · 06 como se envolvem
export default function VisaoGeral({ inicial }: { inicial: Dados }) {
  const [sel, setSel] = useState<SeletorPeriodo>("30dias");
  const [customDe, setCustomDe] = useState<string | null>(null);
  const [customAte, setCustomAte] = useState<string | null>(null);
  const [modo, setModo] = useState<DisplayMode>("combinado");
  const [dados, setDados] = useState<Dados>(inicial);
  const [carregando, setCarregando] = useState(false);

  const { de, ate } = useMemo(
    () =>
      sel === "custom" ? rangeCustom(customDe, customAte) : rangeDoPeriodo(sel),
    [sel, customDe, customAte],
  );

  useEffect(() => {
    if (de === dados.de && ate === dados.ate) return;
    let ativo = true;
    setCarregando(true);
    fetch(`/api/visao-geral?de=${de}&ate=${ate}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Dados | null) => {
        if (ativo && d) setDados(d);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
    // dados.de/ate de proposito fora das dependencias: a resposta nao pode
    // disparar outra busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [de, ate]);

  return (
    <>
      <Cabecalho
        tela="Visão geral"
        subtitulo="Quantos são, como crescem, quem são e do que gostam os ouvintes da rádio."
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
          modo={modo}
          onModo={setModo}
          atualizadoEm={carregando ? null : dados.geradoEm}
        />
      </Cabecalho>

      <div className="max-w-[1240px] pt-8">
        {carregando ? (
          <Esqueleto />
        ) : !dados.configurado ? (
          <div className="cartao p-8 text-center text-sm text-texto-corpo">
            Não foi possível carregar os dados agora. Tente de novo em
            instantes.
          </div>
        ) : (
          <Conteudo dados={dados} modo={modo} />
        )}
      </div>
    </>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <EsqueletoCartoes />
      <div className="cartao mt-8 p-7">
        <div className="esqueleto h-3 w-[22%] rounded-md" />
        <div className="mt-6 flex h-[190px] items-end gap-1.5">
          {[
            46, 62, 38, 71, 55, 80, 49, 66, 42, 74, 58, 88, 51, 69, 45, 77, 60,
            84,
          ].map((h, i) => (
            <div
              key={i}
              className="esqueleto min-w-0 flex-1 rounded-t"
              style={{ height: `${h}%`, animationDelay: `${i * 30}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[18px]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="cartao p-[22px]">
            <EsqueletoLista />
          </div>
        ))}
      </div>
    </div>
  );
}

function Conteudo({ dados, modo }: { dados: Dados; modo: DisplayMode }) {
  const pctCompletos =
    dados.base > 0 ? Math.round((dados.completos / dados.base) * 100) : 0;
  const deltaBase = variacaoPct(dados.base, dados.baseInicio);
  const deltaNovos = dados.novos - dados.novosAnterior;
  const mediaDia = dados.dias > 0 ? Math.round(dados.novos / dados.dias) : 0;
  const nCompletos = dados.completosNoPeriodo;
  const baseSecoes =
    nCompletos === 1
      ? "entre o cadastro completo que chegou no período"
      : `entre os ${numeroBr(nCompletos)} cadastros completos que chegaram no período`;

  return (
    <div className="animate-fadeIn">
      {/* 01 QUANTOS SAO: tres numeros grandes, aninhados e so com consentimento */}
      <Secao numero="01" titulo="Quantos são" destaque>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          <div className="cartao cartao-interativo min-w-0 p-[26px]">
            <div className="text-[12.5px] text-texto-corpo">
              Ouvintes na base
            </div>
            <div className="text-gradient mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums sm:text-[56px]">
              <CountUp value={dados.base} duration={1100} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {deltaBase ? <Etiqueta tom="verde">{deltaBase}</Etiqueta> : null}
              <span className="text-[12.5px] text-texto-rotulo">
                {deltaBase
                  ? `desde ${diaBr(dados.de)}`
                  : "com consentimento dado"}
              </span>
            </div>
          </div>

          <div className="cartao cartao-interativo min-w-0 p-[26px]">
            <div className="text-[12.5px] text-texto-corpo">
              Cadastros completos
            </div>
            <div className="mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums sm:text-[56px]">
              <CountUp value={dados.completos} duration={1100} />
            </div>
            <div className="mt-3.5">
              <div className="h-1.5 overflow-hidden rounded bg-fundo-trilho">
                <BarraCheia pct={pctCompletos} />
              </div>
              <div className="mt-2 text-[12.5px] text-texto-rotulo">
                {pctCompletos}% da base com nome, nascimento, cidade e número
              </div>
            </div>
          </div>

          <div className="cartao cartao-interativo min-w-0 p-[26px] sm:col-span-2 lg:col-span-1">
            <div className="text-[12.5px] text-texto-corpo">
              Novos no período
            </div>
            <div className="mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-magenta tabular-nums sm:text-[56px]">
              <CountUp value={dados.novos} duration={1100} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Etiqueta tom={deltaNovos >= 0 ? "verde" : "magenta"}>
                {deltaNovos >= 0 ? "+" : "-"}
                {numeroBr(Math.abs(deltaNovos))}
              </Etiqueta>
              <span className="text-[12.5px] text-texto-rotulo">
                vs. período anterior · média de {numeroBr(mediaDia)} por dia
              </span>
            </div>
          </div>
        </div>
      </Secao>

      {/* 02 ESTA CRESCENDO */}
      <Secao numero="02" titulo="Está crescendo" destaque>
        <Grafico dados={dados} />
      </Secao>

      {/* 03 QUEM SAO */}
      <Secao
        numero="03"
        titulo="Quem são"
        descricao={`Faixa etária, ${baseSecoes}`}
      >
        <div className="cartao cartao-interativo p-[22px] sm:p-7">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Barras
              serie={dados.faixa.distribuicao}
              mode={modo}
              vazio="Nenhum cadastro completo neste período."
            />
            <div className="flex flex-col justify-center gap-[22px] border-t border-borda-divisor pt-6 md:border-l md:border-t-0 md:pl-8 md:pt-0">
              {dados.faixa.concentracao ? (
                <div>
                  <div className="text-[12.5px] text-texto-corpo">
                    Concentração
                  </div>
                  <div className="mt-1.5 font-display text-[30px] font-semibold tracking-[-0.02em] sm:text-[34px]">
                    {dados.faixa.concentracao.rotulo}
                  </div>
                  <div className="mt-1.5 text-[13px] text-texto-corpo">
                    {dados.faixa.concentracao.pct}% dos cadastros completos do
                    período.
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-texto-rotulo">
                  Poucas faixas com gente para apontar uma concentração.
                </div>
              )}
              <div className="flex flex-wrap gap-[30px]">
                <Mini
                  rotulo="Idade média"
                  valor={
                    dados.faixa.idadeMedia != null
                      ? `${dados.faixa.idadeMedia} anos`
                      : "—"
                  }
                />
                <Mini
                  rotulo="Faixa mais comum"
                  valor={dados.faixa.maisComum ?? "—"}
                />
              </div>
            </div>
          </div>
        </div>
      </Secao>

      {/* 04 ONDE ESTAO: do recorte maior para o menor */}
      <Secao numero="04" titulo="Onde estão" descricao="Zona, bairro e cidade">
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
          <Cartao titulo="Zonas">
            <Barras serie={dados.zonas} mode={modo} />
          </Cartao>
          <Cartao titulo="Bairros">
            <ListaRanking itens={dados.bairros} mode={modo} />
          </Cartao>
          <Cartao titulo="Cidades">
            <ListaRanking itens={dados.cidades} mode={modo} />
          </Cartao>
        </div>
      </Secao>

      {/* 05 DO QUE GOSTAM: do comportamento geral para o caso especifico */}
      <Secao
        numero="05"
        titulo="Do que gostam"
        descricao="Estilo, artista e música"
      >
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
          <Cartao titulo="Estilos musicais">
            <Barras serie={dados.estilos} mode={modo} />
          </Cartao>
          <Cartao titulo="Artistas mais pedidos">
            <ListaRanking itens={dados.artistas} mode={modo} />
          </Cartao>
          <Cartao titulo="Músicas mais pedidas">
            <ListaRanking itens={dados.musicas} mode={modo} />
          </Cartao>
        </div>
      </Secao>

      {/* 06 COMO SE ENVOLVEM */}
      <Secao numero="06" titulo="Como se envolvem">
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
          <Cartao titulo="Programas mais citados">
            <Barras
              serie={dados.programas}
              mode={modo}
              gradiente="barra-alerta"
            />
          </Cartao>

          <Cartao titulo="Participação em promoção">
            <div className="font-display text-[40px] font-semibold tracking-[-0.02em] tabular-nums">
              <CountUp value={dados.promocao.participantes} duration={1100} />
            </div>
            <div className="mt-1 text-[12.5px] text-texto-corpo">
              {dados.promocao.participantes === 1
                ? "ouvinte participou de ao menos uma no período"
                : "ouvintes participaram de ao menos uma no período"}
            </div>
            <div className="mt-4 h-[7px] overflow-hidden rounded bg-fundo-trilho">
              <BarraCheia
                pct={
                  dados.base > 0
                    ? Math.min(
                        100,
                        (dados.promocao.participantes / dados.base) * 100,
                      )
                    : 0
                }
                classe="barra-alerta"
              />
            </div>
            <div className="mt-2 text-xs text-texto-rotulo">
              {dados.base > 0
                ? `${((dados.promocao.participantes / dados.base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da base`
                : "—"}{" "}
              · {numeroBr(dados.promocao.promocoes)}{" "}
              {dados.promocao.promocoes === 1
                ? "promoção com participação"
                : "promoções com participação"}
            </div>
            {dados.promocao.maiorAdesao ? (
              <div className="mt-4 border-t border-[#F4F4F7] pt-3.5 text-[12.5px] text-texto-corpo">
                Maior adesão:{" "}
                <span className="font-medium text-texto-titulo">
                  {dados.promocao.maiorAdesao.label}
                </span>{" "}
                · {numeroBr(dados.promocao.maiorAdesao.participantes)}
              </div>
            ) : null}
          </Cartao>

          <Cartao
            titulo="Pedidos e recados"
            className="md:col-span-2 lg:col-span-1"
          >
            <div className="flex flex-wrap gap-[26px]">
              <div>
                <div className="font-display text-[34px] font-semibold tabular-nums">
                  {numeroBr(dados.pedidos.musica)}
                </div>
                <div className="mt-0.5 text-xs text-texto-rotulo">
                  pedidos de música
                </div>
              </div>
              <div>
                <div className="font-display text-[34px] font-semibold tabular-nums">
                  {numeroBr(dados.pedidos.recados)}
                </div>
                {/* "registrados", nunca "no ar": o banco sabe que o recado foi
                    anotado, nao sabe se foi ao ar. */}
                <div className="mt-0.5 text-xs text-texto-rotulo">
                  recados registrados
                </div>
              </div>
            </div>
            <div className="mt-[18px] flex flex-col gap-[9px] border-t border-[#F4F4F7] pt-3.5">
              {dados.pedidos.porTipo.map((t) => (
                <div
                  key={t.label}
                  className="flex justify-between text-[12.5px]"
                >
                  <span className="text-texto-corpo">{t.label}</span>
                  <span className="font-mono">{numeroBr(t.valor)}</span>
                </div>
              ))}
              <div className="flex justify-between text-[12.5px]">
                <span className="text-texto-corpo">
                  Ouvintes ativos nos últimos 7 dias
                </span>
                <span className="font-mono">
                  {numeroBr(dados.ativosSemana)}
                </span>
              </div>
            </div>
          </Cartao>
        </div>

        {/* ATRIBUICAO COMERCIAL fora do destaque. Um bloco que so mostra zero
            ensina a pessoa a ignorar aquela regiao da tela, e o habito contamina
            os vizinhos; por isso virou uma faixa discreta no fim. */}
        <div className="mt-8 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-xl border border-dashed border-[#DFDFE6] bg-fundo-claro px-[18px] py-3.5">
          <span className="rotulo-mono">Links rastreados</span>
          {dados.hotlink.acessos > 0 ? (
            <span className="text-[13px] text-texto-corpo">
              {numeroBr(dados.hotlink.acessos)} acessos ·{" "}
              {numeroBr(dados.hotlink.conversoes)} conversões ·{" "}
              {dados.hotlink.taxa.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              % de conversão no período
            </span>
          ) : (
            <span className="text-[13px] text-texto-corpo">
              Nenhum acesso por link rastreado neste período.
            </span>
          )}
        </div>
      </Secao>

      <footer className="mt-12 border-t border-borda-divisor pt-6 text-center text-xs text-texto-rotulo">
        Rádio Liverpool · AtendentePRO
      </footer>
    </div>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-texto-rotulo">{rotulo}</div>
      <div className="mt-[3px] font-display text-[22px] font-semibold">
        {valor}
      </div>
    </div>
  );
}

function BarraCheia({
  pct,
  classe = "barra-h",
}: {
  pct: number;
  classe?: string;
}) {
  const [cheio, setCheio] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setCheio(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={`${classe} h-full`}
      style={{
        width: cheio ? `${pct.toFixed(1)}%` : "0%",
        transitionDelay: "100ms",
      }}
    />
  );
}

function Grafico({ dados }: { dados: Dados }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [cheio, setCheio] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setCheio(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const pontos = dados.serie.pontos;
  const max = Math.max(1, ...pontos.map((p) => Math.max(p.atual, p.anterior)));
  const n = pontos.length;
  const gran = dados.serie.granularidade;
  const unidade = gran === "hora" ? "hora" : gran === "dia" ? "dia" : "semana";
  const titulo =
    gran === "hora"
      ? "Cadastros por hora"
      : gran === "dia"
        ? "Cadastros por dia"
        : "Cadastros por semana";
  const legendaPeriodo =
    gran === "hora"
      ? "Hoje comparado a ontem"
      : "Período atual comparado ao anterior de mesma duração";
  const eixo =
    n > 0
      ? [0, 0.25, 0.5, 0.75, 1].map(
          (f) => pontos[Math.round(f * (n - 1))]?.rotulo ?? "",
        )
      : [];
  const variacao = variacaoPct(dados.novos, dados.novosAnterior);
  const p = foco != null ? pontos[foco] : null;

  return (
    <div className="cartao cartao-interativo min-w-0 px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-[13.5px] font-medium">{titulo}</div>
          <div className="mt-[3px] text-[12.5px] text-texto-rotulo">
            {legendaPeriodo}
          </div>
        </div>
        <div className="flex items-center gap-[18px]">
          <span className="flex items-center gap-[7px] text-[12.5px] text-texto-corpo">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-magenta" />
            Período atual
          </span>
          <span className="flex items-center gap-[7px] text-[12.5px] text-texto-corpo">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#E6E6EC]" />
            Anterior
          </span>
        </div>
      </div>

      {n === 0 || dados.novos + dados.novosAnterior === 0 ? (
        <p className="py-16 text-center text-[13px] text-texto-rotulo">
          Nenhum cadastro neste período nem no anterior.
        </p>
      ) : (
        <>
          <div className="relative mt-[26px]">
            <div className="pointer-events-none absolute inset-x-0 bottom-0.5 top-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-px bg-[#F2F2F6]" />
              ))}
            </div>
            {p ? (
              <div
                className="pointer-events-none absolute -top-1.5 z-[5] whitespace-nowrap rounded-[10px] bg-texto-titulo px-3 py-2.5 text-white shadow-[0_8px_22px_rgba(20,22,26,0.22)]"
                style={{
                  left: `${((foco! + 0.5) / n) * 100}%`,
                  transform: `translateX(${foco! < n / 5 ? "-10%" : foco! > (4 * n) / 5 ? "-90%" : "-50%"})`,
                }}
              >
                <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#B9B9C4]">
                  {p.rotulo}
                </div>
                <div className="mt-1 text-[13px] font-medium">
                  {numeroBr(p.atual)} {p.atual === 1 ? "cadastro" : "cadastros"}
                </div>
                <div className="mt-0.5 text-[11.5px] text-[#A8A8B4]">
                  anterior {numeroBr(p.anterior)} ·{" "}
                  {p.atual - p.anterior >= 0 ? "+" : "-"}
                  {numeroBr(Math.abs(p.atual - p.anterior))}
                </div>
              </div>
            ) : null}
            <div
              className={`relative flex h-[190px] items-end border-b border-fundo-grupo pb-0.5 sm:h-[210px] ${n > 40 ? "gap-px" : "gap-1"}`}
              onMouseLeave={() => setFoco(null)}
            >
              {pontos.map((pt, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${pt.rotulo}: ${pt.atual} cadastros, anterior ${pt.anterior}`}
                  onMouseEnter={() => setFoco(i)}
                  onFocus={() => setFoco(i)}
                  onClick={() => setFoco((f) => (f === i ? null : i))}
                  className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center gap-0.5 rounded-sm"
                >
                  <span
                    className="min-w-0 max-w-[7px] flex-1 rounded-t-[3px] bg-[#E9E9EF]"
                    style={{
                      height: cheio
                        ? `${((pt.anterior / max) * 100).toFixed(1)}%`
                        : "0%",
                      transition: `height .8s cubic-bezier(.22,.8,.3,1) ${i * 18}ms`,
                    }}
                  />
                  <span
                    className="min-w-0 max-w-[7px] flex-1 rounded-t-[3px]"
                    style={{
                      background: "linear-gradient(180deg,#D81B60,#7C3AED)",
                      opacity: foco === null || foco === i ? 1 : 0.45,
                      height: cheio
                        ? `${((pt.atual / max) * 100).toFixed(1)}%`
                        : "0%",
                      transition: `height .8s cubic-bezier(.22,.8,.3,1) ${i * 18}ms, opacity .2s ease`,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2.5 flex justify-between font-mono text-[10.5px] text-texto-rotulo">
            {eixo.map((r, i) => (
              <span
                key={i}
                className={i === 1 || i === 3 ? "hidden sm:inline" : ""}
              >
                {r}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="mt-[22px] grid grid-cols-2 gap-x-8 gap-y-4 border-t border-borda-divisor pt-5 sm:flex sm:flex-wrap sm:gap-[34px]">
        <Mini rotulo="Total no período" valor={numeroBr(dados.novos)} />
        <div>
          <div className="text-xs text-texto-rotulo">Período anterior</div>
          <div className="mt-[3px] font-display text-[22px] font-semibold text-texto-corpo">
            {numeroBr(dados.novosAnterior)}
          </div>
        </div>
        <Mini
          rotulo={`Melhor ${unidade}`}
          valor={
            dados.serie.melhor
              ? `${dados.serie.melhor.rotulo} · ${numeroBr(dados.serie.melhor.valor)}`
              : "—"
          }
        />
        <div>
          <div className="text-xs text-texto-rotulo">Variação</div>
          <div
            className={`mt-[3px] font-display text-[22px] font-semibold ${
              variacao?.startsWith("-") ? "text-magenta" : "text-verde"
            }`}
          >
            {variacao ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
