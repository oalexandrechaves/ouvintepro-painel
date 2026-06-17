"use client";

import { useEffect, useMemo, useState } from "react";
import { formatValue, somaSerie } from "@/lib/mockData";
import type { DisplayMode, SerieItem } from "@/lib/mockData";
import Ranking from "./Ranking";

interface OuvinteRow {
  id: string;
  nome: string | null;
  bairro: string | null;
  zona: string | null;
  cidade: string | null;
  estado: string | null;
  idade: number | null;
  faixa: string | null;
  cadastroEm: string | null;
  participacoes: number;
  ama: string[];
  rejeita: string[];
  radios: string[];
}

interface Extra {
  configurado: boolean;
  faixas: { id: number; label: string }[];
  musicasAmadas: SerieItem[];
  musicasRejeitadas: SerieItem[];
  artistasAmados: SerieItem[];
  artistasRejeitados: SerieItem[];
  zonas: SerieItem[];
  bairrosPorZona: Record<string, SerieItem[]>;
  bairrosGeral: SerieItem[];
  radios: SerieItem[];
  ouvintes: OuvinteRow[];
}

const ZONAS = ["Norte", "Sul", "Leste", "Oeste", "Centro", "Outras"];

function dataPtBr(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

export default function PainelExtra({ mode }: { mode: DisplayMode }) {
  const [faixa, setFaixa] = useState("todas");
  const [zona, setZona] = useState("todas");
  const [data, setData] = useState<Extra | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [zonaAberta, setZonaAberta] = useState<string | null>(null);
  const [linhaAberta, setLinhaAberta] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const qs = new URLSearchParams({ faixa, zona }).toString();
    fetch(`/api/painel?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (ativo) setData(d);
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
  }, [faixa, zona]);

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
            <Card titulo="Músicas mais amadas">
              <RankingOuVazio serie={data.musicasAmadas} mode={mode} />
            </Card>
            <Card titulo="Músicas mais rejeitadas">
              <RankingOuVazio serie={data.musicasRejeitadas} mode={mode} />
            </Card>
            <Card titulo="Artistas mais amados">
              <RankingOuVazio serie={data.artistasAmados} mode={mode} />
            </Card>
            <Card titulo="Artistas mais rejeitados">
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
            <Card titulo="Bairros mais presentes (geral)">
              <RankingOuVazio serie={data.bairrosGeral} mode={mode} />
            </Card>
          </div>

          {/* Radios concorrentes */}
          <Card titulo="Rádios que costumam ouvir">
            <RankingOuVazio serie={data.radios} mode={mode} />
          </Card>

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
                      <FragmentRow
                        key={o.id}
                        o={o}
                        aberto={linhaAberta === o.id}
                        onToggle={() =>
                          setLinhaAberta((a) => (a === o.id ? null : o.id))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </section>
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

function FragmentRow({
  o,
  aberto,
  onToggle,
}: {
  o: OuvinteRow;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-white/5 transition-colors hover:bg-ink-850/50"
      >
        <td className="py-2 pr-3 text-mist-50">{o.nome ?? "-"}</td>
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
      {aberto ? (
        <tr className="border-b border-white/5 bg-ink-900/40">
          <td colSpan={8} className="px-3 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Detalhe titulo="Ama" cor="text-neon-lime" itens={o.ama} />
              <Detalhe titulo="Não gosta" cor="text-neon-pink" itens={o.rejeita} />
              <Detalhe titulo="Outras rádios" cor="text-neon-cyan" itens={o.radios} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Detalhe({
  titulo,
  cor,
  itens,
}: {
  titulo: string;
  cor: string;
  itens: string[];
}) {
  return (
    <div>
      <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${cor}`}>
        {titulo}
      </p>
      {itens.length === 0 ? (
        <p className="text-sm text-mist-400">-</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm text-mist-100">
          {itens.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
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
