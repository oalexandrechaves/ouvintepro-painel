"use client";

import { useCallback, useMemo, useState } from "react";
import Cabecalho from "@/components/Cabecalho";
import { ErroCarregamento, EsqueletoLista } from "@/components/ui";
import { buscarJson, enviarJson } from "@/lib/buscar";
import { NOME_NIVEL, PERFIS, type Nivel } from "@/lib/acesso/modelo";
import type { GrupoAcesso, UsuarioAcesso } from "@/lib/acesso/gestao";
import {
  Campo,
  Interruptor,
  Modal,
  NavPainel,
  SeloStatus,
  dataBr,
  falhaIncerta,
  mensagemDeGravacao,
  telefoneBr,
} from "./comum";

export type DadosUsuarios = { usuarios: UsuarioAcesso[]; grupos: GrupoAcesso[] };

type Aberto =
  | { tipo: "novo" }
  | { tipo: "editar"; usuario: UsuarioAcesso }
  | { tipo: "senha"; usuario: UsuarioAcesso }
  | null;

function inicial(nome: string): string {
  return (nome.trim()[0] ?? "?").toUpperCase();
}

export default function Usuarios({
  inicial: dadosIniciais,
  podeGerir,
  meuNivel,
  meuId,
  grupoInicial,
}: {
  inicial: DadosUsuarios | null;
  podeGerir: boolean;
  meuNivel: Nivel;
  meuId: string;
  grupoInicial: string | null;
}) {
  const [dados, setDados] = useState<DadosUsuarios | null>(dadosIniciais);
  const [erro, setErro] = useState(dadosIniciais === null);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [perfil, setPerfil] = useState("");
  const [grupo, setGrupo] = useState(grupoInicial ?? "");
  const [aberto, setAberto] = useState<Aberto>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [u, g] = await Promise.all([
        buscarJson<{ usuarios: UsuarioAcesso[] }>("/api/acesso/usuarios"),
        buscarJson<{ grupos: GrupoAcesso[] }>("/api/acesso/grupos"),
      ]);
      setDados({ usuarios: u.usuarios, grupos: g.grupos });
      setErro(false);
    } catch {
      // Falha tira a lista da tela: lista velha pareceria a atual.
      setDados(null);
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  const filtrados = useMemo(() => {
    if (!dados) return [];
    const t = busca.trim().toLowerCase();
    return dados.usuarios.filter(
      (u) =>
        (!t || u.nome.toLowerCase().includes(t) || u.email.includes(t)) &&
        (!perfil || u.perfil === perfil) &&
        (!grupo || u.grupoId === grupo),
    );
  }, [dados, busca, perfil, grupo]);

  const grupoFiltrado = dados?.grupos.find((g) => g.id === grupo) ?? null;
  const ativos = filtrados.filter((u) => u.ativo).length;
  const temFiltro = Boolean(busca.trim() || perfil || grupo);

  return (
    <>
      <Cabecalho
        tela="Painel de Controle"
        subtitulo="Usuários do sistema e seus grupos de acesso."
      />
      <div className="mt-7 flex flex-col gap-5">
        <NavPainel atual="usuarios" />

        {!podeGerir ? (
          <p className="rounded-xl border border-borda-campo bg-fundo-claro px-4 py-3 text-[13px] text-texto-forte">
            Seu grupo tem {NOME_NIVEL[meuNivel]} no Painel de Controle: você vê
            usuários e grupos, mas criar, editar e redefinir senha exige Full.
          </p>
        ) : null}
        {aviso ? (
          <p role="status" className="animate-fadeIn rounded-xl bg-verde-claro px-4 py-3 text-[13px] text-verde">
            {aviso}
          </p>
        ) : null}

        {erro ? (
          <ErroCarregamento
            texto="Não foi possível carregar os usuários."
            onTentar={recarregar}
          />
        ) : !dados ? (
          <EsqueletoLista />
        ) : (
          <div className="cartao overflow-hidden">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-borda-divisor px-5 py-4">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou e-mail"
                aria-label="Buscar por nome ou e-mail"
                className="campo max-w-[280px] flex-1"
              />
              <select
                value={perfil}
                onChange={(e) => setPerfil(e.target.value)}
                aria-label="Perfil"
                className="campo w-auto"
              >
                <option value="">Todos os perfis</option>
                {PERFIS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <select
                value={grupo}
                onChange={(e) => setGrupo(e.target.value)}
                aria-label="Grupo de acesso"
                className="campo w-auto"
              >
                <option value="">Todos os grupos</option>
                {dados.grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.nome}</option>
                ))}
              </select>
              <div className="flex-1" />
              {podeGerir ? (
                <button
                  type="button"
                  onClick={() => setAberto({ tipo: "novo" })}
                  disabled={dados.grupos.length === 0}
                  className="botao-primario"
                >
                  + Novo usuário
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr className="rotulo-mono border-b border-borda-divisor">
                    <th className="px-5 py-3 font-normal">Usuário</th>
                    <th className="px-3 py-3 font-normal">Perfil</th>
                    <th className="px-3 py-3 font-normal">Status</th>
                    <th className="px-3 py-3 font-normal">Criado em</th>
                    <th className="px-5 py-3 text-right font-normal">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((u) => (
                    <tr key={u.id} className="border-b border-borda-divisor last:border-0 hover:bg-fundo-hover">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-magenta-claro text-[14px] font-bold text-magenta">
                            {inicial(u.nome)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[14px] font-medium">
                              {u.nome}
                              {u.id === meuId ? (
                                <span className="ml-1.5 text-[12px] font-normal text-texto-rotulo">(você)</span>
                              ) : null}
                            </div>
                            <div className="truncate text-[12.5px] text-texto-corpo">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[13px] text-texto-forte">{u.perfil}</div>
                        <div className="text-[12px] text-texto-rotulo">{u.grupoNome}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <SeloStatus ativo={u.ativo} />
                          {u.deveTrocarSenha ? (
                            <span className="rounded-full bg-ambar-claro px-2.5 py-0.5 text-[12px] text-ambar" title="Entrou com senha temporária e ainda não criou a própria">
                              Senha temporária
                            </span>
                          ) : null}
                          {u.bloqueado ? (
                            <span className="rounded-full bg-magenta-claro px-2.5 py-0.5 text-[12px] text-magenta-escuro" title="Cinco senhas erradas seguidas. Libera sozinho em 15 minutos, ou ao redefinir a senha.">
                              Bloqueado
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-texto-corpo">{dataBr(u.criadoEm)}</td>
                      <td className="px-5 py-3">
                        {podeGerir ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              title="Editar"
                              aria-label={`Editar ${u.nome}`}
                              onClick={() => setAberto({ tipo: "editar", usuario: u })}
                              className="h-8 w-8 rounded-lg border border-borda-campo text-[13px] text-texto-corpo hover:border-magenta hover:text-magenta"
                            >
                              ✎
                            </button>
                            {u.id !== meuId ? (
                              <button
                                type="button"
                                title="Redefinir senha"
                                aria-label={`Redefinir senha de ${u.nome}`}
                                onClick={() => setAberto({ tipo: "senha", usuario: u })}
                                className="h-8 w-8 rounded-lg border border-borda-campo text-[13px] text-texto-corpo hover:border-violeta hover:text-violeta"
                              >
                                ⚿
                              </button>
                            ) : (
                              <span className="h-8 w-8" />
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtrados.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <div className="text-[15px] font-medium">Nenhum usuário encontrado</div>
                <div className="text-[13px] text-texto-corpo">
                  {temFiltro
                    ? "Nada corresponde à busca atual. Ajuste o termo ou limpe o filtro."
                    : "Ainda não há usuários."}
                </div>
                {temFiltro ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBusca("");
                      setPerfil("");
                      setGrupo("");
                    }}
                    className="botao-secundario mt-2"
                  >
                    Limpar busca
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda-divisor px-5 py-3 font-mono text-[11.5px] text-texto-rotulo">
              <span>
                {filtrados.length} {filtrados.length === 1 ? "usuário" : "usuários"} · {ativos}{" "}
                {ativos === 1 ? "ativo" : "ativos"}
                {grupoFiltrado ? ` · grupo ${grupoFiltrado.nome}` : ""}
                {temFiltro ? ` (de ${dados.usuarios.length} no total)` : ""}
              </span>
              {carregando ? <span>Atualizando...</span> : null}
            </div>
          </div>
        )}
      </div>

      {aberto && dados && (aberto.tipo === "novo" || aberto.tipo === "editar") ? (
        <ModalUsuario
          usuario={aberto.tipo === "editar" ? aberto.usuario : null}
          grupos={dados.grupos}
          ehVoce={aberto.tipo === "editar" && aberto.usuario.id === meuId}
          onFechar={() => setAberto(null)}
          onRedefinir={(u) => setAberto({ tipo: "senha", usuario: u })}
          onSalvo={async (texto) => {
            setAberto(null);
            setAviso(texto);
            await recarregar();
          }}
          onFalhaIncerta={recarregar}
        />
      ) : null}
      {aberto && aberto.tipo === "senha" ? (
        <ModalSenha
          usuario={aberto.usuario}
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

function ModalUsuario({
  usuario,
  grupos,
  ehVoce,
  onFechar,
  onRedefinir,
  onSalvo,
  onFalhaIncerta,
}: {
  usuario: UsuarioAcesso | null;
  grupos: GrupoAcesso[];
  ehVoce: boolean;
  onFechar: () => void;
  onRedefinir: (u: UsuarioAcesso) => void;
  onSalvo: (texto: string) => void;
  onFalhaIncerta: () => void;
}) {
  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [telefone, setTelefone] = useState(telefoneBr(usuario?.telefone ?? null));
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [perfil, setPerfil] = useState(usuario?.perfil ?? "");
  const [grupoId, setGrupoId] = useState(usuario?.grupoId ?? "");
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const grupoEscolhido = grupos.find((g) => g.id === grupoId);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      if (usuario) {
        await enviarJson("/api/acesso/usuarios", {
          method: "PATCH",
          body: { id: usuario.id, nome, telefone, perfil, grupoId, ativo },
        });
        onSalvo(`${nome.trim()} salvo.`);
      } else {
        await enviarJson("/api/acesso/usuarios", {
          method: "POST",
          body: { nome, email, telefone, perfil, grupoId, senha },
        });
        onSalvo(
          `${nome.trim()} criado. Passe a senha temporária para a pessoa: ela troca no primeiro acesso.`,
        );
      }
    } catch (e) {
      setErro(mensagemDeGravacao(e));
      if (falhaIncerta(e)) onFalhaIncerta();
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={usuario ? "Editar usuário" : "Novo usuário"}
      subtitulo={usuario?.email}
      onFechar={onFechar}
      rodape={
        <>
          {usuario && !ehVoce ? (
            <button type="button" onClick={() => onRedefinir(usuario)} className="botao-secundario">
              Redefinir senha
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className="botao-secundario">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="botao-primario">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className="campo" />
        </Campo>
        <Campo rotulo="Telefone">
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(11) 99999-9999" className="campo" />
        </Campo>
        <div className="sm:col-span-2">
          {usuario ? (
            <Campo rotulo="E-mail (login)" nota="O e-mail é o login e não muda. Para outro e-mail, crie outro usuário.">
              <div className="flex items-center justify-between rounded-[9px] border border-borda-campo bg-fundo-trilho px-3 py-2 text-sm text-texto-corpo">
                <span className="truncate">{usuario.email}</span>
                <span className="font-mono text-[10px] tracking-[0.08em] text-texto-rotulo">BLOQUEADO</span>
              </div>
            </Campo>
          ) : (
            <Campo rotulo="E-mail (login)" nota="Não muda depois de criado.">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="campo" />
            </Campo>
          )}
        </div>
        <Campo rotulo="Perfil" nota="Só o rótulo. Quem libera tela é o grupo.">
          <select value={perfil} onChange={(e) => setPerfil(e.target.value)} className="campo">
            <option value="" disabled>Escolha</option>
            {PERFIS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Campo>
        <Campo
          rotulo="Grupo de acesso"
          nota={
            ehVoce
              ? "Você não pode trocar o próprio grupo."
              : grupoEscolhido && !grupoEscolhido.ativo
                ? "Grupo inativo: quem está nele não abre nenhum módulo."
                : undefined
          }
        >
          <select value={grupoId} onChange={(e) => setGrupoId(e.target.value)} disabled={ehVoce} className="campo disabled:bg-fundo-trilho">
            <option value="" disabled>Escolha</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.nome}{g.ativo ? "" : " (inativo)"}</option>
            ))}
          </select>
        </Campo>
        {usuario ? (
          <div className="sm:col-span-2">
            <Interruptor
              ligado={ativo}
              onMudar={setAtivo}
              desligado={ehVoce}
              titulo="Usuário ativo"
              texto={ehVoce ? "Você não pode desativar o próprio usuário." : "Inativo não consegue entrar no sistema."}
            />
          </div>
        ) : (
          <div className="sm:col-span-2">
            <Campo rotulo="Senha temporária" nota="Pelo menos 8 caracteres. A pessoa cria a própria senha no primeiro acesso.">
              <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" className="campo font-mono" />
            </Campo>
          </div>
        )}
      </div>
      {erro ? (
        <p role="alert" className="mt-4 text-[13px] text-magenta">{erro}</p>
      ) : null}
    </Modal>
  );
}

function ModalSenha({
  usuario,
  onFechar,
  onSalvo,
  onFalhaIncerta,
}: {
  usuario: UsuarioAcesso;
  onFechar: () => void;
  onSalvo: (texto: string) => void;
  onFalhaIncerta: () => void;
}) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      await enviarJson("/api/acesso/usuarios/senha", {
        method: "POST",
        body: { id: usuario.id, senha },
      });
      onSalvo(`Senha de ${usuario.nome} redefinida. Passe a senha temporária para a pessoa.`);
    } catch (e) {
      setErro(mensagemDeGravacao(e));
      if (falhaIncerta(e)) onFalhaIncerta();
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo="Redefinir senha"
      subtitulo={`${usuario.nome} · ${usuario.email}`}
      onFechar={onFechar}
      rodape={
        <>
          <span />
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className="botao-secundario">Cancelar</button>
            <button type="button" onClick={salvar} disabled={salvando} className="botao-primario">
              {salvando ? "Redefinindo..." : "Redefinir senha"}
            </button>
          </div>
        </>
      }
    >
      <Campo rotulo="Senha temporária" nota="Pelo menos 8 caracteres.">
        <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" className="campo font-mono" />
      </Campo>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-texto-corpo">
        <li>A pessoa troca esta senha no próximo acesso, antes de abrir qualquer tela.</li>
        <li>As sessões abertas dela caem agora, em todos os aparelhos.</li>
        <li>Se estava bloqueada por tentativas erradas, fica desbloqueada.</li>
      </ul>
      {erro ? (
        <p role="alert" className="mt-4 text-[13px] text-magenta">{erro}</p>
      ) : null}
    </Modal>
  );
}
