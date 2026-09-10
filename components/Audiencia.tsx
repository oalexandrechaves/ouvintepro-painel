"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Audiencia as AudienciaData,
  AudienciaFiltros,
} from "@/lib/serverData";
import BarList from "./BarList";
import CountUp from "./CountUp";
import DocumentoCampanha from "./DocumentoCampanha";

const FILTROS_VAZIOS: AudienciaFiltros = {
  cidade: null,
  bairro: null,
  zona: null,
  faixa: null,
  estilo: null,
  programa: null,
  radio: null,
  comPedido: false,
  comPromocao: false,
  incluirDemo: true,
};

function Select({
  label,
  valor,
  opcoes,
  onChange,
}: {
  label: string;
  valor: string | null;
  opcoes: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-mist-400">
        {label}
      </span>
      <select
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-lg border border-white/10 bg-ink-850/60 px-3 py-2 text-sm text-mist-50 outline-none focus:border-neon-violet/50"
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Audiencia({ inicial }: { inicial: AudienciaData }) {
  const [filtros, setFiltros] = useState<AudienciaFiltros>(FILTROS_VAZIOS);
  const [dados, setDados] = useState<AudienciaData>(inicial);
  const [carregando, setCarregando] = useState(false);
  const [custo, setCusto] = useState("1,00");
  const [docAberto, setDocAberto] = useState(false);

  // As OPCOES vem da carga inicial, do universo inteiro. Se viessem do resultado
  // filtrado, escolher um bairro apagaria os outros e o comercial ficaria preso
  // no primeiro filtro que clicou.
  const opcoes = inicial.opcoes;

  const set = <K extends keyof AudienciaFiltros>(
    k: K,
    v: AudienciaFiltros[K],
  ) => setFiltros((f) => ({ ...f, [k]: v }));

  const buscar = useCallback(async (f: AudienciaFiltros) => {
    const p = new URLSearchParams();
    if (f.cidade) p.set("cidade", f.cidade);
    if (f.bairro) p.set("bairro", f.bairro);
    if (f.zona) p.set("zona", f.zona);
    if (f.faixa) p.set("faixa", String(f.faixa));
    if (f.estilo) p.set("estilo", f.estilo);
    if (f.programa) p.set("programa", f.programa);
    if (f.radio) p.set("radio", f.radio);
    if (f.comPedido) p.set("comPedido", "1");
    if (f.comPromocao) p.set("comPromocao", "1");
    if (!f.incluirDemo) p.set("incluirDemo", "0");
    setCarregando(true);
    try {
      const res = await fetch(`/api/audiencia?${p.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) setDados(await res.json());
    } catch {
      /* mantem o resultado anterior na tela em vez de zerar o numero */
    } finally {
      setCarregando(false);
    }
  }, []);

  // Debounce curto: o comercial troca varios filtros seguidos na frente do
  // cliente, e uma requisicao por clique deixaria o numero piscando.
  const chave = JSON.stringify(filtros);
  useEffect(() => {
    const t = setTimeout(
      () => buscar(JSON.parse(chave) as AudienciaFiltros),
      180,
    );
    return () => clearTimeout(t);
  }, [chave, buscar]);

  const custoNum = useMemo(() => {
    const n = Number(custo.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [custo]);

  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const custoTotal = dados.comEndereco * custoNum;
  const custoPorAlcancado =
    dados.comEndereco > 0 ? custoTotal / dados.comEndereco : 0;

  const filtrosAtivos =
    Boolean(
      filtros.cidade ||
      filtros.bairro ||
      filtros.zona ||
      filtros.faixa ||
      filtros.estilo ||
      filtros.programa ||
      filtros.radio,
    ) ||
    filtros.comPedido ||
    filtros.comPromocao;

  const regiaoLabel = filtros.bairro ?? filtros.zona ?? filtros.cidade ?? null;

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-4xl font-black italic tracking-tight sm:text-5xl">
          <span className="text-mist-50">Audi</span>
          <span className="text-gradient">ência</span>
        </h1>
        <p className="text-sm text-mist-300">
          Prove alcance segmentado para o anunciante.
        </p>
      </header>

      {!dados.configurado ? (
        <div className="glass mt-8 p-8 text-center text-sm text-mist-400">
          Fonte de dados não configurada no servidor.
        </div>
      ) : null}

      {/* DESTAQUE: o filtro de radio concorrente e o argumento comercial mais
          forte, porque e audiencia que o anunciante NAO alcanca pela outra
          radio. Por isso vem antes dos demais e com o numero por extenso. */}
      <section className="glass mt-8 flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-widest text-neon-cyan">
            Argumento de venda
          </span>
          <h2 className="font-display text-lg text-mist-50">
            Ouvintes que também escutam a concorrência
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Rádio concorrente"
            valor={filtros.radio ?? null}
            opcoes={opcoes.radios}
            onChange={(v) => set("radio", v)}
          />
          <div className="flex items-end">
            {filtros.radio ? (
              <p className="text-sm text-mist-100">
                <span className="font-display text-2xl text-mist-50">
                  {dados.total.toLocaleString("pt-BR")}
                </span>{" "}
                ouvintes{" "}
                {regiaoLabel && regiaoLabel !== filtros.radio
                  ? `em ${regiaoLabel} `
                  : ""}
                que também ouvem a {filtros.radio}.
              </p>
            ) : (
              <p className="text-sm text-mist-400">
                Escolha uma rádio para montar a frase de venda.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Demais filtros */}
      <section className="glass mt-6 flex flex-col gap-5 p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Cidade"
            valor={filtros.cidade ?? null}
            opcoes={opcoes.cidades}
            onChange={(v) => set("cidade", v)}
          />
          <Select
            label="Bairro"
            valor={filtros.bairro ?? null}
            opcoes={opcoes.bairros}
            onChange={(v) => set("bairro", v)}
          />
          <Select
            label="Zona"
            valor={filtros.zona ?? null}
            opcoes={opcoes.zonas}
            onChange={(v) => set("zona", v)}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-mist-400">
              Faixa etária
            </span>
            <select
              value={filtros.faixa ?? ""}
              onChange={(e) =>
                set("faixa", e.target.value ? Number(e.target.value) : null)
              }
              className="rounded-lg border border-white/10 bg-ink-850/60 px-3 py-2 text-sm text-mist-50 outline-none focus:border-neon-violet/50"
            >
              <option value="">Todas</option>
              {opcoes.faixas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <Select
            label="Estilo musical"
            valor={filtros.estilo ?? null}
            opcoes={opcoes.estilos}
            onChange={(v) => set("estilo", v)}
          />
          <Select
            label="Programa ou locutor"
            valor={filtros.programa ?? null}
            opcoes={opcoes.programas}
            onChange={(v) => set("programa", v)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-white/5 pt-4">
          <label className="flex items-center gap-2 text-sm text-mist-100">
            <input
              type="checkbox"
              checked={filtros.comPedido ?? false}
              onChange={(e) => set("comPedido", e.target.checked)}
              className="h-4 w-4 accent-[#A855F7]"
            />
            Já fez pedido
          </label>
          <label className="flex items-center gap-2 text-sm text-mist-100">
            <input
              type="checkbox"
              checked={filtros.comPromocao ?? false}
              onChange={(e) => set("comPromocao", e.target.checked)}
              className="h-4 w-4 accent-[#A855F7]"
            />
            Já participou de promoção
          </label>
          <label className="flex items-center gap-2 text-sm text-mist-100">
            <input
              type="checkbox"
              checked={filtros.incluirDemo ?? true}
              onChange={(e) => set("incluirDemo", e.target.checked)}
              className="h-4 w-4 accent-[#22D3EE]"
            />
            Incluir dados de demonstração
          </label>
          {filtrosAtivos ? (
            <button
              onClick={() =>
                setFiltros({
                  ...FILTROS_VAZIOS,
                  incluirDemo: filtros.incluirDemo,
                })
              }
              className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-xs text-mist-300 hover:text-mist-50"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </section>

      {/* OS DOIS NUMEROS. Separados de proposito: prometer 340 cartas e
          conseguir mandar 210 e o erro que esta tela existe para evitar. */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="glass flex flex-col gap-1 p-6">
          <span className="text-[11px] uppercase tracking-widest text-mist-400">
            Ouvintes no filtro
          </span>
          <span className="font-display text-4xl text-mist-50">
            <CountUp value={dados.total} />
          </span>
          <span className="text-xs text-mist-400">
            Somente quem deu consentimento.
            {dados.demoNoTotal > 0
              ? ` Inclui ${dados.demoNoTotal.toLocaleString("pt-BR")} de demonstração.`
              : ""}
          </span>
        </div>
        <div className="glass flex flex-col gap-1 p-6">
          <span className="text-[11px] uppercase tracking-widest text-mist-400">
            Com bairro e número
          </span>
          <span className="font-display text-4xl text-mist-50">
            <CountUp value={dados.comEndereco} />
          </span>
          <span className="text-xs text-neon-gold">
            Falta o logradouro para postagem: o cadastro guarda bairro e número,
            não a rua nem o CEP.
          </span>
        </div>
      </section>

      {/* Quebra de perfil */}
      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          { t: "Faixa etária", s: dados.distFaixa },
          { t: "Estilos mais comuns", s: dados.distEstilo },
          { t: "Programas mais citados", s: dados.distPrograma },
        ].map((b) => (
          <div key={b.t} className="glass flex flex-col gap-4 p-6">
            <h3 className="font-display text-base text-mist-50">{b.t}</h3>
            {b.s.length ? (
              <BarList serie={b.s} mode="numero" />
            ) : (
              <p className="text-xs text-mist-400">
                Sem dados para este filtro.
              </p>
            )}
          </div>
        ))}
      </section>

      {/* Simulador */}
      <section className="glass mt-6 flex flex-col gap-4 p-6">
        <h3 className="font-display text-base text-mist-50">
          Simulador de mala direta
        </h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-mist-400">
              Custo por correspondência
            </span>
            <input
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              inputMode="decimal"
              className="rounded-lg border border-white/10 bg-ink-850/60 px-3 py-2 text-sm text-mist-50 outline-none focus:border-neon-violet/50"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-mist-400">
              Correspondências possíveis
            </span>
            <span className="font-display text-2xl text-mist-50">
              {dados.comEndereco.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-mist-400">
              Custo total
            </span>
            <span className="font-display text-2xl text-mist-50">
              {brl(custoTotal)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-mist-400">
              Custo por pessoa alcançada
            </span>
            <span className="font-display text-2xl text-mist-50">
              {brl(custoPorAlcancado)}
            </span>
          </div>
        </div>
        <button
          onClick={() => setDocAberto(true)}
          className="self-start rounded-xl bg-gradient-to-r from-neon-pink to-neon-violet px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-neon-violet/20"
        >
          Gerar peça da campanha
        </button>
      </section>

      {/* Lista mascarada */}
      <section className="glass mt-6 flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base text-mist-50">
            Ouvintes deste público
          </h3>
          <span className="text-xs text-mist-400">
            {carregando
              ? "atualizando..."
              : `mostrando ${dados.lista.length} de ${dados.total.toLocaleString("pt-BR")}`}
          </span>
        </div>

        {/* A NOTA FICA ACIMA DA LISTA, e nao em rodape: ela protege a radio e e
            argumento de venda, entao precisa ser lida junto com os dados. */}
        <p className="rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 px-4 py-3 text-xs leading-relaxed text-mist-100">
          Os dados completos ficam com a Rádio Liverpool. Aqui aparecem apenas
          primeiro nome, região, faixa etária e telefone parcial. A entrega da
          campanha é feita pela própria rádio: o anunciante não recebe a base.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-mist-400">
                <th className="py-2 pr-4 font-medium">Nome</th>
                <th className="py-2 pr-4 font-medium">Bairro</th>
                <th className="py-2 pr-4 font-medium">Cidade</th>
                <th className="py-2 pr-4 font-medium">Faixa</th>
                <th className="py-2 pr-4 font-medium">Telefone</th>
                <th className="py-2 font-medium">Endereço</th>
              </tr>
            </thead>
            <tbody>
              {dados.lista.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-white/5 text-mist-100"
                >
                  <td className="py-2 pr-4">{o.primeiroNome ?? "—"}</td>
                  <td className="py-2 pr-4">{o.bairro ?? "—"}</td>
                  <td className="py-2 pr-4">{o.cidade ?? "—"}</td>
                  <td className="py-2 pr-4">{o.faixa ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums text-mist-300">
                    {o.telefoneMasc ?? "—"}
                  </td>
                  <td className="py-2">
                    {o.temEndereco ? (
                      <span className="rounded-full bg-neon-lime/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neon-lime">
                        parcial
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist-400">
                        sem
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!dados.lista.length ? (
          <p className="py-4 text-center text-sm text-mist-400">
            Nenhum ouvinte com consentimento bate com este filtro.
          </p>
        ) : null}
        {dados.total > dados.lista.length ? (
          <p className="text-[11px] text-mist-400">
            A lista mostra no máximo {dados.listaTruncadaEm} pessoas. O total
            acima conta o público inteiro.
          </p>
        ) : null}
      </section>

      {docAberto ? (
        <DocumentoCampanha
          bairro={regiaoLabel}
          totalPublico={dados.total}
          onFechar={() => setDocAberto(false)}
        />
      ) : null}

      <footer className="mt-10 border-t border-white/5 pt-6 text-center text-xs text-mist-400">
        Rádio Liverpool · powered by OuvintePro · Dados e Conexão na Rádio
      </footer>
    </>
  );
}
