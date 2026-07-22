"use client";

import { useEffect, useMemo, useState } from "react";
import { formatValue, somaSerie } from "@/lib/mockData";
import type { DisplayMode, SerieItem } from "@/lib/mockData";
import Ranking from "./Ranking";

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

interface PromocaoRow {
  label: string;
  participantes: number;
  participacoes: number;
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
  musicasAmadas: SerieItem[];
  musicasRejeitadas: SerieItem[];
  artistasAmados: SerieItem[];
  artistasRejeitados: SerieItem[];
  zonas: SerieItem[];
  faixaEtaria: SerieItem[];
  bairrosPorZona: Record<string, SerieItem[]>;
  bairrosGeral: SerieItem[];
  radios: SerieItem[];
  promocoes: PromocaoRow[];
  kpis: { cadastrados: number; novos: number; total: number };
  hotlink: { acessos: number; conversoes: number; taxa: number };
  ouvintes: OuvinteRow[];
}

const ZONAS = ["Norte", "Sul", "Leste", "Oeste", "Centro", "Outras"];

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

export default function PainelExtra({
  mode,
  periodoDe,
  periodoAte,
  onData,
}: {
  mode: DisplayMode;
  periodoDe: string | null;
  periodoAte: string | null;
  onData?: (d: Extra | null) => void;
}) {
  const [faixa, setFaixa] = useState("todas");
  const [zona, setZona] = useState("todas");
  const [data, setData] = useState<Extra | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [zonaAberta, setZonaAberta] = useState<string | null>(null);
  const [ouvinteAberto, setOuvinteAberto] = useState<OuvinteRow | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    // O periodo vem unificado do topo (Hoje/30 dias/Ano/Personalizado).
    const params: Record<string, string> = { faixa, zona };
    if (periodoDe) params.de = periodoDe;
    if (periodoAte) params.ate = periodoAte;
    const qs = new URLSearchParams(params).toString();
    fetch(`/api/painel?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ativo) {
          setData(d);
          onData?.(d);
        }
      })
      .catch(() => {
        if (ativo) {
          setData(null);
          onData?.(null);
        }
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [faixa, zona, periodoDe, periodoAte, onData]);

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

  const bairrosDaZona = zonaAberta ? data?.bairrosPorZona?.[zonaAberta] ?? [] : [];

  return (
    <section className="mt-10">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold">
            <span className="text-gradient">Explorar ouvintes</span>
          </h2>
          <p className="text-sm text-mist-400">
            Filtre por faixa etária e zona. Atualiza tudo na hora.
          </p>
        </div>
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
            options={[
              { value: "todas", label: "Todas as zonas" },
              ...ZONAS.map((z) => ({ value: z, label: z })),
            ]}
            label="Zona"
          />
        </div>
      </div>

      {carregando && !data ? (
        <div className="glass p-8 text-center text-sm text-mist-400">
          Carregando dados...
        </div>
      ) : !data?.configurado ? (
        <div className="glass p-8 text-center text-sm text-mist-400">
          Dados expandidos indisponíveis. Configure a SUPABASE_SERVICE_ROLE_KEY
          no servidor para ver a lista de ouvintes e os rankings filtráveis.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Rankings de musicas e artistas */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card titulo="Músicas preferidas">
              <RankingOuVazio serie={data.musicasAmadas} mode={mode} />
            </Card>
            <Card titulo="Músicas rejeitadas">
              <RankingOuVazio serie={data.musicasRejeitadas} mode={mode} />
            </Card>
            <Card titulo="Artistas preferidos">
              <RankingOuVazio serie={data.artistasAmados} mode={mode} />
            </Card>
            <Card titulo="Artistas rejeitados">
              <RankingOuVazio serie={data.artistasRejeitados} mode={mode} />
            </Card>
          </div>

          {/* Zonas com drill-down + bairros geral */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card titulo="Zonas (clique para ver bairros)">
              <ZonasClicaveis
                serie={data.zonas}
                mode={mode}
                aberta={zonaAberta}
                onSelect={(z) => setZonaAberta((a) => (a === z ? null : z))}
              />
            </Card>
            <Card
              titulo={zonaAberta ? `Bairros · ${zonaAberta}` : "Bairros da zona"}
            >
              {zonaAberta ? (
                <RankingOuVazio serie={bairrosDaZona} mode={mode} />
              ) : (
                <p className="text-sm text-mist-400">
                  Clique numa zona ao lado para ver os bairros dela.
                </p>
              )}
            </Card>
            <Card titulo="Bairros que mais participam">
              <RankingOuVazio serie={data.bairrosGeral} mode={mode} />
            </Card>
          </div>

          {/* Radios concorrentes + Promocoes */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card titulo="Rádios preferidas">
              <RankingOuVazio serie={data.radios} mode={mode} />
            </Card>
            <Card titulo="Promoções">
              <PromocoesLista promocoes={data.promocoes} />
            </Card>
          </div>

          {/* Lista de ouvintes */}
          <Card titulo={`Ouvintes (${data.ouvintes.length})`}>
            {data.ouvintes.length === 0 ? (
              <p className="text-sm text-mist-400">
                Nenhum ouvinte para os filtros selecionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-mist-400">
                    <tr className="border-b border-white/10">
                      <th className="py-2 pr-3">Nome</th>
                      <th className="py-2 pr-3">Bairro</th>
                      <th className="py-2 pr-3">Zona</th>
                      <th className="py-2 pr-3">Cidade/UF</th>
                      <th className="py-2 pr-3">Idade</th>
                      <th className="py-2 pr-3">Faixa</th>
                      <th className="py-2 pr-3">Cadastro</th>
                      <th className="py-2 pr-3">Part.</th>
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
            )}
          </Card>
        </div>
      )}

      {ouvinteAberto ? (
        <ModalOuvinte
          o={ouvinteAberto}
          onClose={() => setOuvinteAberto(null)}
        />
      ) : null}
    </section>
  );
}

function PromocoesLista({ promocoes }: { promocoes: PromocaoRow[] }) {
  if (!promocoes || promocoes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
        <span className="text-2xl">🎁</span>
        <p className="text-sm text-mist-300">Nenhuma promoção ativa ainda.</p>
        <p className="text-xs text-mist-400">
          As participações via <span className="text-neon-violet">#promo</span>{" "}
          aparecem aqui.
        </p>
      </div>
    );
  }
  const max = Math.max(1, ...promocoes.map((p) => p.participantes));
  return (
    <div className="flex flex-col gap-3">
      {promocoes.map((p) => (
        <div key={p.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-mist-100">{p.label}</span>
            <span className="font-display text-sm tabular-nums text-mist-50">
              {p.participantes}
              <span className="ml-1 text-xs text-mist-400">
                {p.participantes === 1 ? "participante" : "participantes"}
              </span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="bar-fill h-full"
              style={{ width: `${(p.participantes / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="glass p-6">
      <h3 className="mb-4 text-lg font-semibold">{titulo}</h3>
      {children}
    </div>
  );
}

function RankingOuVazio({ serie, mode }: { serie: SerieItem[]; mode: DisplayMode }) {
  if (!serie || serie.length === 0) {
    return <p className="text-sm text-mist-400">Sem dados ainda.</p>;
  }
  return <Ranking serie={serie} mode={mode} />;
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
    return <p className="text-sm text-mist-400">Sem dados ainda.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {serie.map((item) => (
        <button
          key={item.label}
          onClick={() => onSelect(item.label)}
          className={`flex flex-col gap-1.5 rounded-xl border px-3 py-2 text-left transition-colors ${
            aberta === item.label
              ? "border-neon-violet/50 bg-ink-850/70"
              : "border-white/5 bg-ink-850/40 hover:border-neon-violet/30"
          }`}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-mist-100">{item.label}</span>
            <span className="font-display text-sm tabular-nums text-mist-50">
              {formatValue(item.valor, total, mode)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
            <div
              className="bar-fill h-full"
              style={{ width: `${(item.valor / max) * 100}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

function LinhaOuvinte({
  o,
  onOpen,
}: {
  o: OuvinteRow;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-white/5 transition-colors hover:bg-ink-850/50"
    >
      <td className="py-2 pr-3 text-mist-50">
        <span className="inline-flex items-center gap-2">
          {o.nome ?? "-"}
          {o.temConversa ? (
            <span
              className="rounded-full bg-neon-cyan/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neon-cyan"
              title="Tem conversa registrada"
            >
              chat
            </span>
          ) : null}
        </span>
      </td>
      <td className="py-2 pr-3 text-mist-200">{o.bairro ?? "-"}</td>
      <td className="py-2 pr-3 text-mist-200">{o.zona ?? "-"}</td>
      <td className="py-2 pr-3 text-mist-200">
        {o.cidade ? `${o.cidade}${o.estado ? "/" + o.estado : ""}` : "-"}
      </td>
      <td className="py-2 pr-3 tabular-nums text-mist-200">{o.idade ?? "-"}</td>
      <td className="py-2 pr-3 text-mist-200">{o.faixa ?? "-"}</td>
      <td className="py-2 pr-3 tabular-nums text-mist-200">
        {dataPtBr(o.cadastroEm)}
      </td>
      <td className="py-2 pr-3 tabular-nums text-mist-200">{o.participacoes}</td>
    </tr>
  );
}

function ModalOuvinte({ o, onClose }: { o: OuvinteRow; onClose: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Carrega as mensagens SOB DEMANDA (so ao abrir), sempre por ouvinte_id.
  useEffect(() => {
    if (!o.temConversa) {
      setMensagens([]);
      return;
    }
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
  }, [o.id, o.temConversa]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecalho: dados do cadastro */}
        <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-mist-50">
              {o.nome ?? "Ouvinte sem nome"}
            </h3>
            {o.telefoneMasc ? (
              <p className="text-xs text-mist-400">{o.telefoneMasc}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-ink-900/60 px-2.5 py-1 text-sm text-mist-300 transition-colors hover:text-mist-50"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-white/10 px-6 py-4 text-sm">
          <Dado rotulo="Nascimento" valor={dataNascPtBr(o.dataNascimento)} />
          <Dado rotulo="Idade" valor={o.idade != null ? String(o.idade) : "-"} />
          <Dado rotulo="Faixa" valor={o.faixa ?? "-"} />
          <Dado
            rotulo="Cidade"
            valor={o.cidade ? `${o.cidade}${o.estado ? "/" + o.estado : ""}` : "-"}
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
        <div className="flex-1 overflow-y-auto bg-ink-950/40 px-4 py-4">
          {!o.temConversa ? (
            <p className="py-8 text-center text-sm text-mist-400">
              Sem conversa registrada.
            </p>
          ) : carregando || mensagens === null ? (
            <p className="py-8 text-center text-sm text-mist-400">
              Carregando conversa...
            </p>
          ) : mensagens.length === 0 ? (
            <p className="py-8 text-center text-sm text-mist-400">
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
      <span className="text-[11px] uppercase tracking-wide text-mist-400">
        {rotulo}
      </span>
      <span className="text-mist-100">{valor}</span>
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
            ? "rounded-tl-sm bg-ink-800 text-mist-100"
            : "rounded-tr-sm bg-neon-violet/25 text-mist-50"
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
      <span className="text-mist-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-1.5 text-sm text-mist-50 outline-none transition-colors focus:border-neon-violet/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-900">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
