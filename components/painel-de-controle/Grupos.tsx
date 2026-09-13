"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import Cabecalho from "@/components/Cabecalho";
import { ErroCarregamento, EsqueletoCartoes } from "@/components/ui";
import { buscarJson, enviarJson } from "@/lib/buscar";
import {
  MODULOS,
  NIVEIS,
  NOME_NIVEL,
  type Nivel,
  type Permissoes,
} from "@/lib/acesso/modelo";
import type { GrupoAcesso } from "@/lib/acesso/gestao";
import {
  COR_NIVEL,
  Campo,
  Interruptor,
  LegendaNiveis,
  Modal,
  NavPainel,
  SeloNivel,
  SeloStatus,
  falhaIncerta,
  mensagemDeGravacao,
} from "./comum";

// O QUE CADA NIVEL FAZ HOJE, MODULO A MODULO. Escrito na tela porque quatro
// niveis sugerem quatro comportamentos, e hoje nao e assim: onde nao ha acao de
// gravar, Edicao e Full abrem o mesmo que Visualizacao.
const O_QUE_FAZ: Record<(typeof MODULOS)[number]["chave"], string> = {
  visao_geral: "Só leitura. Edição e Full funcionam como Visualização.",
  atendimentos: "Tela ainda não construída. O nível fica guardado para quando ela chegar.",
  ouvintes: "Só leitura. Edição e Full funcionam como Visualização.",
  comercial: "Só leitura. Edição e Full funcionam como Visualização.",
  promocoes: "Visualização vê e sorteia. Edição também confirma ganhador. Full não acrescenta nada.",
  painel_de_controle: "Visualização e Edição só veem. Full cria e edita usuários e grupos.",
};

export default function Grupos({
  inicial,
  podeGerir,
  meuGrupoId,
}: {
  inicial: GrupoAcesso[] | null;
  podeGerir: boolean;
  meuGrupoId: string;
}) {
  const [grupos, setGrupos] = useState<GrupoAcesso[] | null>(inicial);
  const [erro, setErro] = useState(inicial === null);
  const [aberto, setAberto] = useState<GrupoAcesso | "novo" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const d = await buscarJson<{ grupos: GrupoAcesso[] }>("/api/acesso/grupos");
      setGrupos(d.grupos);
      setErro(false);
    } catch {
      setGrupos(null);
      setErro(true);
    }
  }, []);

  return (
    <>
      <Cabecalho
        tela="Grupos de acesso"
        pai={{ rotulo: "Painel de Controle", href: "/painel-de-controle" }}
        subtitulo="Cada grupo define o nível de acesso a cada módulo do AtendentePRO."
      />
      <div className="mt-7 flex flex-col gap-5">
        <NavPainel atual="grupos" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/painel-de-controle" className="text-[13px] text-texto-corpo hover:text-magenta">
            ← Voltar para o Painel de Controle
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <LegendaNiveis />
            {podeGerir ? (
              <button type="button" onClick={() => setAberto("novo")} className="botao-primario">
                + Novo grupo
              </button>
            ) : null}
          </div>
        </div>

        {!podeGerir ? (
          <p className="rounded-xl border border-borda-campo bg-fundo-claro px-4 py-3 text-[13px] text-texto-forte">
            Você vê os grupos, mas criar e editar exige Full no Painel de Controle.
          </p>
        ) : null}
        {aviso ? (
          <p role="status" className="animate-fadeIn rounded-xl bg-verde-claro px-4 py-3 text-[13px] text-verde">
            {aviso}
          </p>
        ) : null}

        <details className="cartao px-5 py-3.5 text-[13px] text-texto-forte">
          <summary className="cursor-pointer select-none font-medium text-texto-titulo">
            O que cada nível faz hoje
          </summary>
          <ul className="mt-3 space-y-1.5">
            {MODULOS.map((m) => (
              <li key={m.chave}>
                <span className="font-medium text-texto-titulo">{m.nome}:</span> {O_QUE_FAZ[m.chave]}
              </li>
            ))}
            <li className="pt-1 text-texto-corpo">
              Grupo inativo não abre nenhum módulo, qualquer que seja o nível. O perfil do usuário não libera nada.
            </li>
          </ul>
        </details>

        {erro ? (
          <ErroCarregamento texto="Não foi possível carregar os grupos." onTentar={recarregar} />
        ) : !grupos ? (
          <EsqueletoCartoes quantos={4} />
        ) : grupos.length === 0 ? (
          <p className="text-[13px] text-texto-corpo">Nenhum grupo cadastrado.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {grupos.map((g) => (
              <div key={g.id} className={`cartao flex flex-col p-5 ${g.ativo ? "" : "opacity-80"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-[18px] font-semibold">{g.nome}</div>
                    {g.descricao ? (
                      <div className="mt-0.5 text-[13px] text-texto-corpo">{g.descricao}</div>
                    ) : null}
                  </div>
                  <SeloStatus ativo={g.ativo} />
                </div>
                <div className="mt-3 font-mono text-[11.5px] text-texto-rotulo">
                  {g.usuarios} {g.usuarios === 1 ? "usuário" : "usuários"}
                  {g.usuarios !== g.usuariosAtivos ? ` · ${g.usuariosAtivos} ativos` : ""}
                  {g.id === meuGrupoId ? " · seu grupo" : ""}
                </div>
                <div className="mt-4 border-t border-borda-divisor pt-3">
                  <div className="rotulo-mono mb-2">Módulos</div>
                  <ul className="flex flex-col gap-1.5">
                    {MODULOS.map((m) => (
                      <li key={m.chave} className="flex items-center justify-between gap-3 text-[13.5px]">
                        <span className="text-texto-forte">{m.nome}</span>
                        <SeloNivel nivel={g.modulos[m.chave]} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-borda-divisor pt-4">
                  {podeGerir ? (
                    <button type="button" onClick={() => setAberto(g)} className="botao-secundario">
                      Editar grupo
                    </button>
                  ) : null}
                  <Link href={`/painel-de-controle?grupo=${g.id}`} className="botao-secundario">
                    Ver usuários
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {aberto ? (
        <ModalGrupo
          grupo={aberto === "novo" ? null : aberto}
          ehSeuGrupo={aberto !== "novo" && aberto.id === meuGrupoId}
          onFechar={() => setAberto(null)}
          onSalvo={async (texto) => {
            setAberto(null);
            setAviso(texto);
            await recarregar();
          }}
          onFalhaIncerta={recarregar}
        />
      ) : null}
    </>
  );
}

function ModalGrupo({
  grupo,
  ehSeuGrupo,
  onFechar,
  onSalvo,
  onFalhaIncerta,
}: {
  grupo: GrupoAcesso | null;
  ehSeuGrupo: boolean;
  onFechar: () => void;
  onSalvo: (texto: string) => void;
  onFalhaIncerta: () => void;
}) {
  const [nome, setNome] = useState(grupo?.nome ?? "");
  const [descricao, setDescricao] = useState(grupo?.descricao ?? "");
  const [ativo, setAtivo] = useState(grupo?.ativo ?? true);
  // Grupo novo nasce SEM ACESSO em tudo: quem cria escolhe o que liberar.
  const [modulos, setModulos] = useState<Permissoes>(
    grupo?.modulos ??
      (Object.fromEntries(MODULOS.map((m) => [m.chave, "sem_acesso"])) as Permissoes),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await enviarJson("/api/acesso/grupos", {
        method: "POST",
        body: { id: grupo?.id ?? null, nome, descricao, ativo, modulos },
      });
      onSalvo(`Grupo ${nome.trim()} salvo. Vale no próximo clique de quem está nele.`);
    } catch (e) {
      setErro(mensagemDeGravacao(e));
      if (falhaIncerta(e)) onFalhaIncerta();
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={grupo ? "Editar grupo" : "Novo grupo"}
      subtitulo={grupo ? `${grupo.usuarios} ${grupo.usuarios === 1 ? "usuário" : "usuários"} neste grupo` : undefined}
      onFechar={onFechar}
      rodape={
        <>
          <span />
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className="botao-secundario">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="botao-primario">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} className="campo" />
        </Campo>
        <Campo rotulo="Descrição">
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} className="campo" />
        </Campo>
        <Interruptor
          ligado={ativo}
          onMudar={setAtivo}
          desligado={ehSeuGrupo}
          titulo="Grupo ativo"
          texto={
            ehSeuGrupo
              ? "Você não pode desativar o grupo do seu próprio usuário."
              : "Grupo inativo não abre nenhum módulo para ninguém nele."
          }
        />
        <div>
          <div className="rotulo-mono mb-2">Nível por módulo</div>
          <div className="flex flex-col gap-2.5">
            {MODULOS.map((m) => {
              const travado = ehSeuGrupo && m.chave === "painel_de_controle";
              return (
                <div key={m.chave} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13.5px] text-texto-forte">{m.nome}</span>
                  <div role="radiogroup" aria-label={`Nível em ${m.nome}`} className="flex flex-wrap gap-1">
                    {NIVEIS.map((n: Nivel) => {
                      const marcado = modulos[m.chave] === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={marcado}
                          disabled={travado && n !== "full"}
                          onClick={() => setModulos((atual) => ({ ...atual, [m.chave]: n }))}
                          className={`rounded-md border px-2 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            marcado
                              ? `${COR_NIVEL[n]} font-semibold`
                              : "border-borda-campo bg-fundo-cartao text-texto-corpo hover:border-[#D0D0D8]"
                          }`}
                        >
                          {NOME_NIVEL[n]}
                        </button>
                      );
                    })}
                  </div>
                  {travado ? (
                    <span className="w-full text-[12px] text-texto-rotulo">
                      Você não pode tirar o Full do Painel de Controle do seu próprio grupo.
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {erro ? (
        <p role="alert" className="mt-4 text-[13px] text-magenta">{erro}</p>
      ) : null}
    </Modal>
  );
}
