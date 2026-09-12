"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Audiencia as Dados, AudienciaFiltros } from "@/lib/serverData";
import { numeroBr } from "@/lib/tipos";
import Cabecalho from "./Cabecalho";
import CountUp from "./CountUp";
import DocumentoCampanha from "./DocumentoCampanha";
import { Barras, Cartao, EstadoVazioGrande } from "./ui";

// COMERCIAL (antes Audiencia): publico segmentado para a equipe comercial provar
// alcance ao anunciante. Esta tela vai para a frente de um TERCEIRO, e isso
// decide o que ela mostra:
//  - so quem deu consentimento, primeiro nome e telefone mascarado;
//  - comparacao com radio concorrente NAO aparece (dupla leitura: sugere ao
//    anunciante que vale anunciar na outra radio). O argumento e exclusividade.
//  - sem exportacao de lista: o anunciante nao leva a base.

const FILTROS_VAZIOS: AudienciaFiltros = {
  cidade: null,
  bairro: null,
  zona: null,
  faixa: null,
  estilo: null,
  programa: null,
  comPedido: false,
  comPromocao: false,
  incluirDemo: true,
};

type Dim = "cidade" | "zona" | "bairro" | "faixa" | "estilo" | "programa";
const NOME_DIM: Record<Dim, string> = {
  cidade: "Cidade",
  zona: "Zona",
  bairro: "Bairro",
  faixa: "Faixa etária",
  estilo: "Estilo",
  programa: "Programa",
};

function Select({
  label,
  valor,
  opcoes,
  onChange,
  todos = "Todos",
}: {
  label: string;
  valor: string | null;
  opcoes: { valor: string; rotulo: string }[];
  onChange: (v: string | null) => void;
  todos?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-[9px]">
      <span className="rotulo-mono">{label}</span>
      <select
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="campo truncate"
      >
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Comercial({ inicial }: { inicial: Dados }) {
  const [filtros, setFiltros] = useState<AudienciaFiltros>(FILTROS_VAZIOS);
  const [dados, setDados] = useState<Dados>(inicial);
  const [chaveResposta, setChaveResposta] = useState(
    JSON.stringify(FILTROS_VAZIOS),
  );
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [custo, setCusto] = useState("1,00");
  const [docAberto, setDocAberto] = useState(false);

  // AS OPCOES VEM DA RESPOSTA ATUAL, NAO DA CARGA INICIAL. Na versao anterior
  // elas eram lidas da carga inicial e nunca mudavam, entao nem o interruptor de
  // demonstracao nem filtro nenhum chegavam as listas. O servidor calcula cada
  // lista respeitando todos os outros filtros menos ela mesma (cascata).
  const opcoes = dados.opcoes;

  const set = <K extends keyof AudienciaFiltros>(
    k: K,
    v: AudienciaFiltros[K],
  ) => {
    setAviso(null);
    setFiltros((f) => ({ ...f, [k]: v }));
  };

  const buscar = useCallback(async (f: AudienciaFiltros, chave: string) => {
    const p = new URLSearchParams();
    if (f.cidade) p.set("cidade", f.cidade);
    if (f.bairro) p.set("bairro", f.bairro);
    if (f.zona) p.set("zona", f.zona);
    if (f.faixa) p.set("faixa", String(f.faixa));
    if (f.estilo) p.set("estilo", f.estilo);
    if (f.programa) p.set("programa", f.programa);
    if (f.comPedido) p.set("comPedido", "1");
    if (f.comPromocao) p.set("comPromocao", "1");
    if (!f.incluirDemo) p.set("incluirDemo", "0");
    setCarregando(true);
    try {
      const res = await fetch(`/api/comercial?${p.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        setDados(await res.json());
        setChaveResposta(chave);
      }
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
    if (chave === chaveResposta) return;
    const t = setTimeout(
      () => buscar(JSON.parse(chave) as AudienciaFiltros, chave),
      180,
    );
    return () => clearTimeout(t);
    // chaveResposta fora de proposito: a resposta nao dispara nova busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, buscar]);

  // CASCATA, LADO DO CLIENTE: escolhido o Tatuape, trocar a cidade para
  // Guarulhos deixa o bairro escolhido sem existir no novo recorte. Em vez de
  // mostrar zero na frente do cliente, o filtro que ficou orfao sai sozinho, com
  // aviso. So reconcilia quando a resposta e da combinacao de filtros atual,
  // senao uma resposta atrasada limparia um filtro que acabou de ser escolhido.
  useEffect(() => {
    if (chaveResposta !== JSON.stringify(filtros)) return;
    const orfaos: Dim[] = [];
    const tem = (lista: string[], v: string | null | undefined) =>
      !v || lista.includes(v);
    if (!tem(opcoes.cidades, filtros.cidade)) orfaos.push("cidade");
    if (!tem(opcoes.zonas, filtros.zona)) orfaos.push("zona");
    if (!tem(opcoes.bairros, filtros.bairro)) orfaos.push("bairro");
    if (!tem(opcoes.estilos, filtros.estilo)) orfaos.push("estilo");
    if (!tem(opcoes.programas, filtros.programa)) orfaos.push("programa");
    if (filtros.faixa && !opcoes.faixas.some((x) => x.id === filtros.faixa))
      orfaos.push("faixa");
    if (!orfaos.length) return;
    const valores = orfaos.map((d) =>
      d === "faixa"
        ? `${NOME_DIM[d]} escolhida`
        : `${NOME_DIM[d]} ${String(filtros[d])}`,
    );
    setAviso(
      `${valores.join(", ")} não existe no recorte atual e saiu do filtro.`,
    );
    setFiltros((f) => {
      const novo = { ...f };
      for (const d of orfaos) novo[d] = null;
      return novo;
    });
  }, [dados, chaveResposta, filtros, opcoes]);

  const custoNum = useMemo(() => {
    const n = Number(custo.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [custo]);
  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const pctExclusivo =
    dados.total > 0 ? Math.round((dados.exclusivos / dados.total) * 100) : 0;
  const custoTotal = dados.comEndereco * custoNum;
  const custoPorAlcancado =
    dados.comEndereco > 0 ? custoTotal / dados.comEndereco : 0;

  const ativos = [
    filtros.cidade,
    filtros.zona,
    filtros.bairro,
    filtros.faixa,
    filtros.estilo,
    filtros.programa,
    filtros.comPedido || null,
    filtros.comPromocao || null,
  ].filter(Boolean).length;

  const regiaoLabel = filtros.bairro ?? filtros.zona ?? filtros.cidade ?? null;
  const lista = (xs: string[]) => xs.map((x) => ({ valor: x, rotulo: x }));

  return (
    <>
      <Cabecalho
        tela="Comercial"
        subtitulo="Público e alcance para montar proposta de anunciante."
      />

      <div className="max-w-[1240px] pt-8">
        {!dados.configurado ? (
          <div className="cartao mb-6 p-8 text-center text-sm text-texto-corpo">
            Não foi possível carregar os dados agora. Tente de novo em
            instantes.
          </div>
        ) : null}

        {/* RECORTE DO PUBLICO */}
        <div className="cartao px-5 py-[22px] sm:px-[26px]">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="text-[13px] font-medium">Recorte do público</div>
            <div className="text-[12.5px] text-texto-rotulo">
              Cada filtro recalcula o alcance abaixo e só oferece o que existe
              no recorte
            </div>
          </div>
          <div className="mt-[18px] grid min-w-0 grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {/* Do recorte maior para o menor: cidade, zona, bairro. */}
            <Select
              label="Cidade"
              valor={filtros.cidade ?? null}
              opcoes={lista(opcoes.cidades)}
              onChange={(v) => set("cidade", v)}
              todos="Todas"
            />
            <Select
              label="Zona"
              valor={filtros.zona ?? null}
              opcoes={lista(opcoes.zonas)}
              onChange={(v) => set("zona", v)}
              todos="Todas"
            />
            <Select
              label="Bairro"
              valor={filtros.bairro ?? null}
              opcoes={lista(opcoes.bairros)}
              onChange={(v) => set("bairro", v)}
            />
            <Select
              label="Faixa etária"
              valor={filtros.faixa ? String(filtros.faixa) : null}
              opcoes={opcoes.faixas.map((f) => ({
                valor: String(f.id),
                rotulo: f.label,
              }))}
              onChange={(v) => set("faixa", v ? Number(v) : null)}
              todos="Todas"
            />
            <Select
              label="Estilo musical"
              valor={filtros.estilo ?? null}
              opcoes={lista(opcoes.estilos)}
              onChange={(v) => set("estilo", v)}
            />
            <Select
              label="Programa ou locutor"
              valor={filtros.programa ?? null}
              opcoes={lista(opcoes.programas)}
              onChange={(v) => set("programa", v)}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-borda-divisor pt-4">
            <Caixa
              checked={filtros.comPedido ?? false}
              onChange={(v) => set("comPedido", v)}
              rotulo="Já fez pedido"
            />
            <Caixa
              checked={filtros.comPromocao ?? false}
              onChange={(v) => set("comPromocao", v)}
              rotulo="Já participou de promoção"
            />
            <Caixa
              checked={filtros.incluirDemo ?? true}
              onChange={(v) => set("incluirDemo", v)}
              rotulo="Incluir dados de demonstração"
            />
            <div className="flex items-center gap-3 sm:ml-auto">
              <span className="text-[12.5px] text-texto-corpo">
                {ativos === 0
                  ? "Nenhum filtro ativo"
                  : ativos === 1
                    ? "1 filtro ativo"
                    : `${ativos} filtros ativos`}
              </span>
              {ativos > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setAviso(null);
                    setFiltros({
                      ...FILTROS_VAZIOS,
                      incluirDemo: filtros.incluirDemo,
                    });
                  }}
                  className="text-[12.5px] text-[#C2185B] hover:text-[#8E1043]"
                >
                  Limpar
                </button>
              ) : null}
            </div>
          </div>
          {aviso ? (
            <p
              role="status"
              className="mt-3 animate-fadeIn rounded-lg bg-ambar-claro px-3 py-2 text-[12.5px] text-ambar"
            >
              {aviso}
            </p>
          ) : null}
        </div>

        {/* NUMEROS DO RECORTE */}
        <div
          className={`mt-[26px] grid grid-cols-1 gap-[18px] transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${carregando ? "opacity-60" : ""}`}
        >
          <div className="cartao cartao-interativo min-w-0 p-[26px]">
            <div className="text-[12.5px] text-texto-corpo">
              Alcance do recorte
            </div>
            <div className="text-gradient mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums sm:text-[52px]">
              <CountUp value={dados.total} duration={900} />
            </div>
            <div className="mt-2.5 text-[12.5px] text-texto-rotulo">
              Somente quem deu consentimento.
              {dados.demoNoTotal > 0
                ? ` Inclui ${numeroBr(dados.demoNoTotal)} de demonstração.`
                : ""}
            </div>
          </div>
          <div className="cartao cartao-interativo min-w-0 p-[26px]">
            <div className="text-[12.5px] text-texto-corpo">
              Com bairro e número
            </div>
            <div className="mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] tabular-nums sm:text-[52px]">
              <CountUp value={dados.comEndereco} duration={900} />
            </div>
            {/* A RESSALVA FICA JUNTO DO NUMERO. `ouvintes` nao guarda logradouro nem
                CEP; chamar isto de endereco utilizavel faria o comercial prometer
                carta que os Correios nao entregam. */}
            <div className="mt-2.5 text-[12.5px] text-ambar">
              Falta o logradouro para postagem: o cadastro guarda bairro e
              número, não a rua nem o CEP.
            </div>
          </div>
          <div className="cartao cartao-interativo min-w-0 p-[26px] sm:col-span-2 lg:col-span-1">
            <div className="text-[12.5px] text-texto-corpo">
              Não ouvem outra rádio
            </div>
            <div className="mt-2.5 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-magenta tabular-nums sm:text-[52px]">
              <CountUp value={dados.exclusivos} duration={900} />
            </div>
            <div className="mt-2.5 text-[12.5px] text-texto-rotulo">
              {pctExclusivo}% do recorte
            </div>
          </div>
        </div>

        <div className="mt-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* ARGUMENTO DE VENDA: EXCLUSIVIDADE. A comparacao com a concorrencia
              saiu de proposito e nao volta nesta tela. */}
          <div className="cartao cartao-interativo min-w-0 px-5 py-6 sm:px-[26px]">
            <div className="mb-1.5 text-[13px] font-medium">
              Argumento de venda
            </div>
            <div className="mb-[18px] text-[12.5px] text-texto-rotulo">
              Público que o anunciante só alcança pela Rádio Liverpool
            </div>
            <div className="rounded-[11px] border border-borda-divisor bg-fundo-claro p-[18px] text-[15px] leading-relaxed text-[#2A2D34]">
              <span className="font-display text-[28px] font-semibold text-texto-titulo">
                {numeroBr(dados.total)}
              </span>{" "}
              {dados.total === 1 ? "ouvinte" : "ouvintes"}
              {regiaoLabel ? ` em ${regiaoLabel}` : ""},{" "}
              <span className="text-gradient font-display text-[28px] font-semibold">
                {numeroBr(dados.exclusivos)}
              </span>{" "}
              {dados.exclusivos === 1 ? "dele" : "deles"} não{" "}
              {dados.exclusivos === 1 ? "ouve" : "ouvem"} nenhuma outra rádio.
            </div>
            <div className="mt-3 text-xs text-texto-rotulo">
              {pctExclusivo}% do recorte. Essas pessoas o anunciante só alcança
              aqui.
            </div>
          </div>

          <Cartao titulo="Composição do recorte: faixa etária">
            <Barras
              serie={dados.distFaixa}
              mode="combinado"
              vazio="Sem dados para este recorte."
            />
          </Cartao>
        </div>

        <div className="mt-[18px] grid grid-cols-1 gap-[18px] md:grid-cols-2">
          <Cartao titulo="Estilos mais comuns">
            <Barras
              serie={dados.distEstilo}
              mode="numero"
              vazio="Sem dados para este recorte."
            />
          </Cartao>
          <Cartao titulo="Programas mais citados">
            <Barras
              serie={dados.distPrograma}
              mode="numero"
              gradiente="barra-alerta"
              vazio="Sem dados para este recorte."
            />
          </Cartao>
        </div>

        {/* SIMULADOR DE MALA DIRETA */}
        <div className="cartao mt-[18px] px-5 py-6 sm:px-[26px]">
          <div className="text-[13px] font-medium">
            Simulador de mala direta
          </div>
          <div className="mt-[18px] grid min-w-0 grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex min-w-0 flex-col gap-[9px]">
              <span className="rotulo-mono">Custo por correspondência</span>
              <input
                value={custo}
                onChange={(e) => setCusto(e.target.value)}
                inputMode="decimal"
                className="campo"
              />
            </label>
            <Numero
              rotulo="Correspondências possíveis"
              valor={numeroBr(dados.comEndereco)}
            />
            <Numero rotulo="Custo total" valor={brl(custoTotal)} />
            <Numero
              rotulo="Custo por pessoa alcançada"
              valor={brl(custoPorAlcancado)}
            />
          </div>
          <button
            type="button"
            onClick={() => setDocAberto(true)}
            className="botao-primario mt-5"
          >
            Gerar peça da campanha
          </button>
        </div>

        {/* LISTA MASCARADA */}
        <div className="cartao mt-[18px] overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda-divisor px-5 py-[18px] sm:px-6">
            <div className="text-[13px] font-medium">
              Ouvintes deste público
            </div>
            <span className="text-xs text-texto-rotulo">
              {carregando
                ? "atualizando..."
                : `mostrando ${dados.lista.length} de ${numeroBr(dados.total)}`}
            </span>
          </div>

          {/* A NOTA FICA ACIMA DA LISTA, e nao em rodape: ela protege a radio e e
              argumento de venda, entao precisa ser lida junto com os dados. */}
          <p className="mx-5 mt-4 rounded-[11px] border border-violeta-claro bg-[#F7F3FF] px-4 py-3 text-xs leading-relaxed text-violeta-escuro sm:mx-6">
            Os dados completos ficam com a Rádio Liverpool. Aqui aparecem apenas
            primeiro nome, região, faixa etária e telefone parcial. A entrega da
            campanha é feita pela própria rádio: o anunciante não recebe a base.
          </p>

          {dados.lista.length === 0 ? (
            <EstadoVazioGrande
              titulo="Nenhum ouvinte neste recorte"
              texto="Nenhum ouvinte com consentimento bate com estes filtros. Afrouxe algum ou limpe o recorte."
            />
          ) : (
            <>
              {/* CARTOES ABAIXO DE sm, TABELA DE sm PARA CIMA. Em 390px a tabela so
                  mostrava Nome, Bairro e Cidade e escondia o telefone, que e a
                  prova de que sao pessoas reais. Nos cartoes ele vem na primeira
                  linha, ao lado do nome. */}
              <ul className="flex flex-col gap-2 px-5 py-4 sm:hidden">
                {dados.lista.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-col gap-1.5 rounded-xl border border-borda-divisor bg-fundo-claro px-3.5 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">
                        {o.primeiroNome ?? "—"}
                      </span>
                      <span className="shrink-0 font-mono text-[13px] font-medium tabular-nums text-texto-titulo">
                        {o.telefoneMasc ?? "—"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-corpo">
                      <span className="truncate">{o.bairro ?? "—"}</span>
                      <span className="text-texto-off">·</span>
                      <span className="truncate">{o.cidade ?? "—"}</span>
                      <span className="text-texto-off">·</span>
                      <span>{o.faixa ?? "—"}</span>
                      <SeloEndereco tem={o.temEndereco} />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="rotulo-mono border-b border-borda-divisor bg-fundo-claro">
                      <th className="px-6 py-3 font-normal">Nome</th>
                      <th className="py-3 pr-4 font-normal">Bairro</th>
                      <th className="py-3 pr-4 font-normal">Cidade</th>
                      <th className="py-3 pr-4 font-normal">Faixa</th>
                      <th className="py-3 pr-4 font-normal">Telefone</th>
                      <th className="py-3 pr-6 font-normal">Endereço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.lista.map((o) => (
                      <tr
                        key={o.id}
                        className="border-b border-[#F4F4F7] transition-colors hover:bg-[#FBFAFC]"
                      >
                        <td className="px-6 py-3 font-medium">
                          {o.primeiroNome ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-texto-forte">
                          {o.bairro ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-texto-forte">
                          {o.cidade ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-texto-forte">
                          {o.faixa ?? "—"}
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs tabular-nums text-texto-corpo">
                          {o.telefoneMasc ?? "—"}
                        </td>
                        <td className="py-3 pr-6">
                          <SeloEndereco tem={o.temEndereco} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dados.total > dados.lista.length ? (
                <p className="px-5 pb-4 text-[11.5px] text-texto-rotulo sm:px-6 sm:pt-3">
                  A lista mostra no máximo {dados.listaTruncadaEm} pessoas. O
                  alcance acima conta o recorte inteiro.
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer className="mt-12 border-t border-borda-divisor pt-6 text-center text-xs text-texto-rotulo">
          Rádio Liverpool · AtendentePRO
        </footer>
      </div>

      {docAberto ? (
        <DocumentoCampanha
          bairro={regiaoLabel}
          totalPublico={dados.total}
          onFechar={() => setDocAberto(false)}
        />
      ) : null}
    </>
  );
}

function Caixa({
  checked,
  onChange,
  rotulo,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-texto-forte">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#D81B60]"
      />
      {rotulo}
    </label>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-[9px]">
      <span className="rotulo-mono">{rotulo}</span>
      <span className="truncate font-display text-2xl font-semibold tabular-nums">
        {valor}
      </span>
    </div>
  );
}

function SeloEndereco({ tem }: { tem: boolean }) {
  return tem ? (
    <span className="rounded-md bg-verde-claro px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-verde">
      parcial
    </span>
  ) : (
    <span className="rounded-md bg-fundo-trilho px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-texto-rotulo">
      sem
    </span>
  );
}
