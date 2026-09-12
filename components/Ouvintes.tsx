"use client";

import { useEffect, useMemo, useState } from "react";
import { formatValue, somaSerie } from "@/lib/tipos";
import type { DisplayMode, SeletorPeriodo, SerieItem } from "@/lib/tipos";
import { rangeCustom, rangeDoPeriodo } from "@/lib/periodo";
import Cabecalho from "./Cabecalho";
import FiltroPeriodo from "./FiltroPeriodo";
import { Barras, Cartao, EsqueletoLista } from "./ui";

// OUVINTES: a tela interna da base. E o antigo "Explorar ouvintes", que vivia
// dentro do dashboard e virou tela propria no redesign. Funcionalidade em uso
// nao some num redesign: lista, ficha do ouvinte com a conversa, rankings de
// musicas e artistas preferidos e rejeitados, funil de abandono e as radios
// que o ouvinte tambem escuta.
// RADIOS CONCORRENTES aparecem SO AQUI. Esta tela e interna; na Visao geral e na
// tela Comercial, que podem ir para a frente de um anunciante, a concorrencia
// nao aparece.

interface OuvinteRow {
  id: string;
  nome: string | null;
  telefoneMasc: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  idade: number | null;
  dataNascimento: string | null;
  faixa: string | null;
  estiloMusical: string | null;
  cadastroEm: string | null;
  participacoes: number;
  ama: string[];
  rejeita: string[];
  radios: string[];
  promocoes: string[];
  temConversa: boolean;
}

interface Mensagem {
  id: string;
  direcao: "recebida" | "enviada";
  tipo: string | null;
  conteudo: string | null;
  criadoEm: string | null;
}

interface Extra {
  configurado: boolean;
  faixas: { id: number; label: string }[];
  zonasDisponiveis: string[];
  musicasAmadas: SerieItem[];
  musicasRejeitadas: SerieItem[];
  artistasAmados: SerieItem[];
  artistasRejeitados: SerieItem[];
  zonas: SerieItem[];
  bairrosPorZona: Record<string, SerieItem[]>;
  bairrosGeral: SerieItem[];
  radios: SerieItem[];
  pedidosDiversos: SerieItem[];
  funilAbandono: SerieItem[];
  ouvintes: OuvinteRow[];
  totalOuvintes: number;
}

function dataPtBr(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  // Sempre no fuso de Brasilia (sem horario de verao, offset fixo -03:00).
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Data de nascimento vem como YYYY-MM-DD (date puro): formata sem fuso pra nao pular dia.
function dataNascPtBr(iso: string | null): string {
  if (!iso) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "-";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function horaPtBr(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Ouvintes() {
  const [sel, setSel] = useState<SeletorPeriodo>("30dias");
  const [customDe, setCustomDe] = useState<string | null>(null);
  const [customAte, setCustomAte] = useState<string | null>(null);
  const [mode, setMode] = useState<DisplayMode>("numero");
  const [faixa, setFaixa] = useState("todas");
  const [zona, setZona] = useState("todas");
  const [data, setData] = useState<Extra | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [zonaAberta, setZonaAberta] = useState<string | null>(null);
  const [ouvinteAberto, setOuvinteAberto] = useState<OuvinteRow | null>(null);

  const { de, ate } = useMemo(
    () =>
      sel === "custom" ? rangeCustom(customDe, customAte) : rangeDoPeriodo(sel),
    [sel, customDe, customAte],
  );

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const qs = new URLSearchParams({ faixa, zona, de, ate }).toString();
    fetch(`/api/painel?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ativo) {
          setData(d);
          setAtualizadoEm(new Date().toISOString());
        }
      })
      .catch(() => {
        if (ativo) setData(null);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [faixa, zona, de, ate]);

  const faixasOpts = useMemo(
    () => [
      { value: "todas", label: "Todas as faixas" },
      ...(data?.faixas ?? []).map((f) => ({
        value: String(f.id),
        label: f.label,
      })),
    ],
    [data?.faixas],
  );
  // Zonas que EXISTEM na base no periodo, e nao uma lista fixa: com cidades da
  // regiao metropolitana, Guarulhos e Osasco tambem sao zona.
  const zonasOpts = useMemo(() => {
    const lista = new Set(data?.zonasDisponiveis ?? []);
    if (zona !== "todas") lista.add(zona);
    return [
      { value: "todas", label: "Todas as zonas" },
      ...Array.from(lista).map((z) => ({ value: z, label: z })),
    ];
  }, [data?.zonasDisponiveis, zona]);

  const bairrosDaZona = zonaAberta
    ? (data?.bairrosPorZona?.[zonaAberta] ?? [])
    : [];

  return (
    <>
      <Cabecalho
        tela="Ouvintes"
        subtitulo="A base inteira, com a ficha e a conversa de cada ouvinte. Tela interna."
      >
        <div className="flex flex-col gap-3">
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
            modo={mode}
            onModo={setMode}
            atualizadoEm={carregando ? null : atualizadoEm}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={faixa}
              onChange={setFaixa}
              options={faixasOpts}
              label="Faixa"
            />
            <Select
              value={zona}
              onChange={setZona}
              options={zonasOpts}
              label="Zona"
            />
          </div>
        </div>
      </Cabecalho>

      <div className="max-w-[1240px] pt-8">
        {carregando && !data ? (
          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cartao p-[22px]">
                <EsqueletoLista />
              </div>
            ))}
          </div>
        ) : !data?.configurado ? (
          <div className="cartao p-8 text-center text-sm text-texto-corpo">
            Não foi possível carregar os dados agora. Tente de novo em
            instantes.
          </div>
        ) : (
          <div
            className={`flex flex-col gap-[18px] transition-opacity ${carregando ? "opacity-60" : ""}`}
          >
            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
              <Cartao titulo="Músicas preferidas">
                <Barras serie={data.musicasAmadas} mode={mode} />
              </Cartao>
              <Cartao titulo="Músicas rejeitadas">
                <Barras serie={data.musicasRejeitadas} mode={mode} />
              </Cartao>
              <Cartao titulo="Artistas preferidos">
                <Barras serie={data.artistasAmados} mode={mode} />
              </Cartao>
              <Cartao titulo="Artistas rejeitados">
                <Barras serie={data.artistasRejeitados} mode={mode} />
              </Cartao>
            </div>

            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
              <Cartao titulo="Zonas (toque para ver bairros)">
                <ZonasClicaveis
                  serie={data.zonas}
                  mode={mode}
                  aberta={zonaAberta}
                  onSelect={(z) => setZonaAberta((a) => (a === z ? null : z))}
                />
              </Cartao>
              <Cartao
                titulo={
                  zonaAberta ? `Bairros · ${zonaAberta}` : "Bairros da zona"
                }
              >
                {zonaAberta ? (
                  <Barras serie={bairrosDaZona} mode={mode} />
                ) : (
                  <p className="text-[13px] text-texto-rotulo">
                    Toque numa zona para ver os bairros dela.
                  </p>
                )}
              </Cartao>
              <Cartao titulo="Bairros que mais participam">
                <Barras serie={data.bairrosGeral} mode={mode} />
              </Cartao>
            </div>

            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3">
              <Cartao titulo="Rádios que também ouvem">
                <Barras serie={data.radios} mode={mode} />
              </Cartao>
              <Cartao titulo="Pedidos (abraço, beijo, alô...)">
                <Barras serie={data.pedidosDiversos} mode={mode} />
              </Cartao>
              <Cartao titulo="Funil de abandono (cadastros incompletos)">
                <Barras
                  serie={data.funilAbandono}
                  mode="numero"
                  gradiente="barra-alerta"
                />
              </Cartao>
            </div>

            <Cartao
              titulo={`Ouvintes no período (${data.totalOuvintes.toLocaleString("pt-BR")})`}
            >
              {data.ouvintes.length === 0 ? (
                <p className="text-[13px] text-texto-rotulo">
                  Nenhum ouvinte para os filtros selecionados.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="rotulo-mono">
                        <tr className="border-b border-borda-divisor">
                          <th className="py-2 pr-3 font-normal">Nome</th>
                          <th className="py-2 pr-3 font-normal">Bairro</th>
                          <th className="py-2 pr-3 font-normal">Zona</th>
                          <th className="py-2 pr-3 font-normal">Cidade/UF</th>
                          <th className="py-2 pr-3 font-normal">Idade</th>
                          <th className="py-2 pr-3 font-normal">Faixa</th>
                          <th className="py-2 pr-3 font-normal">Cadastro</th>
                          <th className="py-2 pr-3 font-normal">Part.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ouvintes.map((o) => (
                          <LinhaOuvinte
                            key={o.id}
                            o={o}
                            onOpen={() => setOuvinteAberto(o)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.totalOuvintes > data.ouvintes.length ? (
                    <p className="mt-3 text-xs text-texto-rotulo">
                      Mostrando os{" "}
                      {data.ouvintes.length.toLocaleString("pt-BR")} cadastros
                      mais recentes. Os rankings acima contam todos os{" "}
                      {data.totalOuvintes.toLocaleString("pt-BR")}; use os
                      filtros para chegar a um ouvinte específico.
                    </p>
                  ) : null}
                </>
              )}
            </Cartao>
          </div>
        )}
      </div>

      {ouvinteAberto ? (
        <ModalOuvinte
          o={ouvinteAberto}
          onClose={() => setOuvinteAberto(null)}
        />
      ) : null}
    </>
  );
}

function ZonasClicaveis({
  serie,
  mode,
  aberta,
  onSelect,
}: {
  serie: SerieItem[];
  mode: DisplayMode;
  aberta: string | null;
  onSelect: (z: string) => void;
}) {
  const total = somaSerie(serie);
  const max = Math.max(1, ...serie.map((s) => s.valor));
  if (serie.length === 0) {
    return <p className="text-sm text-texto-rotulo">Sem dados ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {serie.map((item) => (
        <button
          key={item.label}
          onClick={() => onSelect(item.label)}
          className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2 text-left transition-colors ${
            aberta === item.label
              ? "border-magenta bg-magenta-claro"
              : "border-borda-divisor bg-fundo-claro hover:border-borda-hover"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-texto-titulo">{item.label}</span>
            <span className="font-display text-sm tabular-nums text-texto-titulo">
              {formatValue(item.valor, total, mode)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-fundo-trilho">
            <div
              className="barra-h h-full"
              style={{ width: `${(item.valor / max) * 100}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function LinhaOuvinte({ o, onOpen }: { o: OuvinteRow; onOpen: () => void }) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-[#F4F4F7] transition-colors hover:bg-fundo-hover"
    >
      <td className="py-2 pr-3 text-texto-titulo">
        <span className="inline-flex items-center gap-2">
          {o.nome ?? "-"}
          {o.temConversa ? (
            <span
              className="rounded-full bg-violeta-claro px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violeta-escuro"
              title="Tem conversa registrada"
            >
              chat
            </span>
          ) : null}
        </span>
      </td>
      <td className="py-2 pr-3 text-texto-forte">{o.bairro ?? "-"}</td>
      <td className="py-2 pr-3 text-texto-forte">{o.zona ?? "-"}</td>
      <td className="py-2 pr-3 text-texto-forte">
        {o.cidade ? `${o.cidade}${o.estado ? "/" + o.estado : ""}` : "-"}
      </td>
      <td className="py-2 pr-3 tabular-nums text-texto-forte">
        {o.idade ?? "-"}
      </td>
      <td className="py-2 pr-3 text-texto-forte">{o.faixa ?? "-"}</td>
      <td className="py-2 pr-3 tabular-nums text-texto-forte">
        {dataPtBr(o.cadastroEm)}
      </td>
      <td className="py-2 pr-3 tabular-nums text-texto-forte">
        {o.participacoes}
      </td>
    </tr>
  );
}

function ModalOuvinte({ o, onClose }: { o: OuvinteRow; onClose: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Carrega as mensagens SOB DEMANDA (so ao abrir), sempre por ouvinte_id.
  // Sempre consulta a API: o campo temConversa vindo do painel pode ser um
  // falso-negativo (ouvintes com varias conversas), entao a fonte da verdade
  // e sempre a resposta de /api/conversa.
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    fetch(`/api/conversa?ouvinte=${encodeURIComponent(o.id)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { mensagens: [] }))
      .then((d) => {
        if (ativo) setMensagens((d?.mensagens ?? []) as Mensagem[]);
      })
      .catch(() => {
        if (ativo) setMensagens([]);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [o.id]);

  // Fecha com Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const musicaPedida = o.ama[0] ?? null;
  const outraRadio = o.radios[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-[rgba(20,22,26,0.32)] p-4 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] animate-pop rounded-[18px] border border-borda-cartao bg-fundo-cartao shadow-modal w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecalho: dados do cadastro */}
        <div className="flex items-start justify-between border-b border-borda-divisor px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-texto-titulo">
              {o.nome ?? "Ouvinte sem nome"}
            </h3>
            {o.telefoneMasc ? (
              <p className="text-xs text-texto-rotulo">{o.telefoneMasc}</p>
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

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-borda-divisor px-6 py-4 text-sm">
          <Dado rotulo="Nascimento" valor={dataNascPtBr(o.dataNascimento)} />
          <Dado
            rotulo="Idade"
            valor={o.idade != null ? String(o.idade) : "-"}
          />
          <Dado rotulo="Faixa" valor={o.faixa ?? "-"} />
          <Dado
            rotulo="Cidade"
            valor={
              o.cidade ? `${o.cidade}${o.estado ? "/" + o.estado : ""}` : "-"
            }
          />
          <Dado rotulo="Bairro" valor={o.bairro ?? "-"} />
          <Dado rotulo="Zona" valor={o.zona ?? "-"} />
          <Dado rotulo="Estilo musical" valor={o.estiloMusical ?? "-"} />
          <Dado rotulo="Música pedida" valor={musicaPedida ?? "-"} />
          <Dado rotulo="Outra rádio" valor={outraRadio ?? "-"} />
          <Dado rotulo="Participações" valor={String(o.participacoes)} />
          <Dado rotulo="Cadastro" valor={dataPtBr(o.cadastroEm)} />
          {o.promocoes.length > 0 ? (
            <Dado rotulo="Promoções" valor={o.promocoes.join(", ")} />
          ) : null}
        </div>

        {/* Historico da conversa */}
        <div className="flex-1 overflow-y-auto bg-fundo-claro px-4 py-4">
          {carregando || mensagens === null ? (
            <p className="py-8 text-center text-sm text-texto-rotulo">
              Carregando conversa...
            </p>
          ) : mensagens.length === 0 ? (
            <p className="py-8 text-center text-sm text-texto-rotulo">
              Sem conversa registrada.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {mensagens.map((m) => (
                <Bolha key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-texto-rotulo">
        {rotulo}
      </span>
      <span className="text-texto-titulo">{valor}</span>
    </div>
  );
}

function Bolha({ m }: { m: Mensagem }) {
  const doOuvinte = m.direcao === "recebida";
  const conteudo = m.conteudo ?? (m.tipo === "audio" ? "🎤 áudio" : "-");
  return (
    <div className={`flex ${doOuvinte ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
          doOuvinte
            ? "rounded-tl-sm bg-fundo-trilho text-texto-titulo"
            : "rounded-tr-sm bg-magenta-claro text-texto-titulo"
        }`}
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
          {doOuvinte ? "Ouvinte" : "Adriana"}
        </p>
        <p className="whitespace-pre-wrap break-words">
          {m.tipo === "audio" && m.conteudo ? `🎤 ${conteudo}` : conteudo}
        </p>
        <p className="mt-1 text-right text-[10px] tabular-nums opacity-60">
          {horaPtBr(m.criadoEm)}
        </p>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-texto-rotulo">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="campo w-auto py-1.5"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
