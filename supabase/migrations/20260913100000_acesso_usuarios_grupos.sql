-- USUARIOS E GRUPOS DE ACESSO DO PAINEL
--
-- Substitui o login unico por variavel de ambiente (PAINEL_USER/PAINEL_PASSWORD).
-- Depois desta migration o painel so entra com usuario desta tabela: o primeiro
-- administrador e criado a mao, pelo arquivo SEPARADO
-- supabase/manual/20260913_primeiro_administrador.sql, com a senha digitada no
-- SQL Editor e nunca no git.
--
-- O DESENHO, EM QUATRO REGRAS:
--  1. GRUPO DA PERMISSAO, PERFIL NAO. Cada grupo tem um nivel por modulo (sem
--     acesso, visualizacao, edicao, full). O perfil do usuario (Administrador,
--     Comercial...) e so o rotulo exibido e nunca libera nada.
--  2. A SENHA NAO SAI DO BANCO. As tabelas nao tem permissao para anon,
--     authenticated NEM service_role: o painel so fala com elas pelas funcoes
--     abaixo, que nunca devolvem senha_hash. O hash e bcrypt do pgcrypto.
--  3. A PERMISSAO E LIDA A CADA PEDIDO. A sessao do navegador carrega so o id do
--     usuario; nivel, grupo e status vem de acesso_sessao() toda vez. Desativar
--     um usuario vale no proximo clique dele.
--  4. SEMPRE EXISTE QUEM ADMINISTRE. Ninguem desativa o proprio usuario, troca o
--     proprio grupo ou tira o Full do Painel de Controle do proprio grupo (regra
--     das funcoes), e o banco recusa qualquer transacao que deixe o sistema sem
--     usuario ativo com Full no Painel de Controle (gatilho de restricao, vale
--     tambem para SQL digitado no editor).
--
-- NADA E APAGADO. Usuario sai por desativacao e grupo tambem; nenhuma funcao faz
-- DELETE e as chaves estrangeiras sao RESTRICT.
--
-- Banco compartilhado com outros produtos (CRM, Rokast, Otzar, Binah, e ja existe
-- public.users): por isso o prefixo acesso_ em tudo.
--
-- Erros de regra saem com SQLSTATE proprio (classe AC) e mensagem em portugues
-- pronta para a tela; o painel mostra a mensagem so quando o codigo e AC.
--   AC001 sistema ficaria sem administrador   AC002 desativar o proprio usuario
--   AC003 quem pede nao tem o nivel exigido   AC004 e-mail ou nome de grupo repetido
--   AC005 senha fora da regra                 AC006 dado invalido ou inexistente
--   AC007 senha atual incorreta               AC008 mexer no proprio grupo
--   AC009 redefinir a propria senha           AC010 e-mail nao muda

-- ============================================================================
-- TABELAS
-- ============================================================================

create table public.acesso_grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> '' and length(nome) <= 60),
  descricao text not null default '' check (length(descricao) <= 200),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index acesso_grupos_nome_unico
  on public.acesso_grupos (lower(btrim(nome)));

-- Os seis modulos e os quatro niveis tambem existem em lib/acesso/modelo.ts.
-- Quem acrescentar modulo mexe nos dois lugares; o check garante que o banco
-- nunca guarda um nome que o painel nao conhece.
create table public.acesso_grupo_modulos (
  grupo_id uuid not null references public.acesso_grupos (id) on delete restrict,
  modulo text not null check (modulo in (
    'visao_geral', 'atendimentos', 'ouvintes', 'comercial', 'promocoes',
    'painel_de_controle'
  )),
  nivel text not null check (nivel in ('sem_acesso', 'visualizacao', 'edicao', 'full')),
  primary key (grupo_id, modulo)
);

create table public.acesso_usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> '' and length(nome) <= 80),
  -- Guardado ja minusculo e sem espaco: o unique vale sem depender de quem grava.
  email text not null unique
    check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- So digitos (DDD + numero, com ou sem 55). A mascara e da tela.
  telefone text check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  perfil text not null check (perfil in ('Administrador', 'Comercial', 'Produção', 'Atendimento')),
  grupo_id uuid not null references public.acesso_grupos (id) on delete restrict,
  ativo boolean not null default true,
  senha_hash text not null check (senha_hash like '$2%'),
  -- Senha criada ou redefinida por administrador e temporaria: o usuario troca
  -- no primeiro acesso e ate la nao abre nenhuma tela.
  deve_trocar_senha boolean not null default true,
  -- Sessao emitida antes deste instante nao vale mais (troca e redefinicao de
  -- senha, desativacao). O token nao carrega nada alem do id e da hora de emissao.
  sessoes_validas_desde timestamptz not null default now(),
  tentativas_falhas integer not null default 0 check (tentativas_falhas >= 0),
  bloqueado_ate timestamptz,
  ultimo_acesso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index acesso_usuarios_grupo_id on public.acesso_usuarios (grupo_id);

comment on table public.acesso_usuarios is
  'Usuarios do painel AtendentePRO. Sem permissao direta para nenhum papel da API: acesso so pelas funcoes acesso_*.';
comment on table public.acesso_grupos is
  'Grupos de acesso do painel AtendentePRO. O grupo define o nivel em cada modulo; o perfil do usuario nao libera nada.';

-- RLS ligado e sem policy, como as demais tabelas do painel. E, alem disso, sem
-- GRANT: nem service_role le senha_hash direto pela API.
alter table public.acesso_grupos enable row level security;
alter table public.acesso_grupo_modulos enable row level security;
alter table public.acesso_usuarios enable row level security;

revoke all on table public.acesso_grupos, public.acesso_grupo_modulos, public.acesso_usuarios
  from public, anon, authenticated, service_role;

-- O e-mail e o login e nao muda (na tela aparece BLOQUEADO). Quem precisar de
-- outro e-mail ganha outro usuario.
create function public.acesso_email_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    raise exception 'O e-mail é o login e não pode ser alterado.' using errcode = 'AC010';
  end if;
  return new;
end;
$$;

create trigger acesso_usuarios_email_imutavel
  before update on public.acesso_usuarios
  for each row execute function public.acesso_email_imutavel();

-- ============================================================================
-- SEMPRE EXISTE QUEM ADMINISTRE
-- Conferido no fim de cada transacao que mexe em usuario, grupo ou nivel. Tabela
-- sem nenhum usuario passa (e o estado logo depois desta migration); a partir do
-- primeiro usuario, precisa haver ao menos um ativo, em grupo ativo, com Full no
-- Painel de Controle.
-- ============================================================================

create function public.acesso_garantir_administrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.acesso_usuarios)
     and not exists (
       select 1
       from public.acesso_usuarios u
       join public.acesso_grupos g on g.id = u.grupo_id and g.ativo
       join public.acesso_grupo_modulos m
         on m.grupo_id = g.id and m.modulo = 'painel_de_controle' and m.nivel = 'full'
       where u.ativo
     ) then
    raise exception 'O sistema precisa de pelo menos um usuário ativo com Full no Painel de Controle.'
      using errcode = 'AC001';
  end if;
  return null;
end;
$$;

create constraint trigger acesso_usuarios_administrador
  after insert or update or delete on public.acesso_usuarios
  deferrable initially deferred
  for each row execute function public.acesso_garantir_administrador();

create constraint trigger acesso_grupos_administrador
  after insert or update or delete on public.acesso_grupos
  deferrable initially deferred
  for each row execute function public.acesso_garantir_administrador();

create constraint trigger acesso_grupo_modulos_administrador
  after insert or update or delete on public.acesso_grupo_modulos
  deferrable initially deferred
  for each row execute function public.acesso_garantir_administrador();

-- ============================================================================
-- AUXILIARES INTERNAS (nenhum papel da API executa)
-- ============================================================================

create function public.acesso_nivel_ordem(p_nivel text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_nivel
    when 'visualizacao' then 1
    when 'edicao' then 2
    when 'full' then 3
    else 0
  end;
$$;

-- Nivel de cada um dos seis modulos. Usuario inativo ou grupo inativo: tudo
-- sem_acesso. Modulo sem linha no grupo: sem_acesso.
create function public.acesso_permissoes_de(p_usuario_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(
    mods.modulo,
    coalesce(
      (select m.nivel
       from public.acesso_usuarios u
       join public.acesso_grupos g on g.id = u.grupo_id and g.ativo
       join public.acesso_grupo_modulos m on m.grupo_id = g.id and m.modulo = mods.modulo
       where u.id = p_usuario_id and u.ativo),
      'sem_acesso'
    )
  )
  from unnest(array[
    'visao_geral', 'atendimentos', 'ouvintes', 'comercial', 'promocoes',
    'painel_de_controle'
  ]) as mods (modulo);
$$;

-- Segunda conferencia de quem pede, dentro do banco. O painel ja conferiu antes
-- de chamar; esta existe para que um erro no painel nao vire permissao.
create function public.acesso_exigir(p_ator uuid, p_modulo text, p_nivel text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ator is null
     or public.acesso_nivel_ordem(public.acesso_permissoes_de(p_ator) ->> p_modulo)
        < public.acesso_nivel_ordem(p_nivel) then
    raise exception 'Seu grupo de acesso não permite esta ação.' using errcode = 'AC003';
  end if;
end;
$$;

-- bcrypt conta so os primeiros 72 bytes: senha maior seria aceita "pela metade".
create function public.acesso_validar_senha(p_senha text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_senha is null or char_length(p_senha) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres.' using errcode = 'AC005';
  end if;
  if octet_length(p_senha) > 72 then
    raise exception 'A senha pode ter no máximo 72 caracteres.' using errcode = 'AC005';
  end if;
end;
$$;

-- ============================================================================
-- LOGIN E SESSAO
-- ============================================================================

-- Resultado: 'ok' | 'invalido' | 'inativo' | 'bloqueado'.
--  - e-mail inexistente e senha errada respondem igual ('invalido'), e o e-mail
--    inexistente tambem gasta um bcrypt, para o tempo de resposta nao entregar
--    quem existe;
--  - 'inativo' so sai com a senha CERTA: quem nao sabe a senha nao descobre nada;
--  - 5 senhas erradas seguidas bloqueiam o usuario por 15 minutos.
create function public.acesso_autenticar(p_email text, p_senha text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u public.acesso_usuarios%rowtype;
begin
  select * into u
  from public.acesso_usuarios
  where email = lower(btrim(coalesce(p_email, '')))
  for update;

  if not found then
    perform extensions.crypt(coalesce(p_senha, ''), extensions.gen_salt('bf', 10));
    return jsonb_build_object('resultado', 'invalido');
  end if;

  if u.bloqueado_ate is not null and u.bloqueado_ate > now() then
    return jsonb_build_object('resultado', 'bloqueado');
  end if;

  if u.senha_hash is distinct from extensions.crypt(coalesce(p_senha, ''), u.senha_hash) then
    if u.tentativas_falhas + 1 >= 5 then
      update public.acesso_usuarios
      set tentativas_falhas = 0, bloqueado_ate = now() + interval '15 minutes'
      where id = u.id;
      return jsonb_build_object('resultado', 'bloqueado');
    end if;
    update public.acesso_usuarios
    set tentativas_falhas = u.tentativas_falhas + 1
    where id = u.id;
    return jsonb_build_object('resultado', 'invalido');
  end if;

  if not u.ativo then
    return jsonb_build_object('resultado', 'inativo');
  end if;

  update public.acesso_usuarios
  set tentativas_falhas = 0, bloqueado_ate = null, ultimo_acesso_em = now()
  where id = u.id;

  return jsonb_build_object(
    'resultado', 'ok',
    'usuario_id', u.id,
    'deve_trocar_senha', u.deve_trocar_senha
  );
end;
$$;

-- O que o painel sabe do usuario a cada pedido. Nulo se o id nao existe.
-- validas_desde vai em segundos inteiros, a mesma unidade do "iat" do token.
create function public.acesso_sessao(p_usuario_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'nome', u.nome,
    'email', u.email,
    'perfil', u.perfil,
    'ativo', u.ativo,
    'deve_trocar_senha', u.deve_trocar_senha,
    'validas_desde', floor(extract(epoch from u.sessoes_validas_desde))::bigint,
    'grupo', jsonb_build_object('id', g.id, 'nome', g.nome, 'ativo', g.ativo),
    'permissoes', public.acesso_permissoes_de(u.id)
  )
  from public.acesso_usuarios u
  join public.acesso_grupos g on g.id = u.grupo_id
  where u.id = p_usuario_id;
$$;

-- Troca da propria senha (obrigatoria no primeiro acesso, ou por vontade).
-- Invalida as outras sessoes do usuario; o painel emite uma nova para quem trocou.
-- Devolve o novo validas_desde (segundos): o painel usa esse valor como "iat" do
-- token novo, e diferenca de relogio entre o servidor e o banco nao derruba quem
-- acabou de trocar.
create function public.acesso_trocar_senha(
  p_usuario_id uuid,
  p_senha_atual text,
  p_senha_nova text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u public.acesso_usuarios%rowtype;
  v_agora timestamptz := now();
begin
  select * into u from public.acesso_usuarios where id = p_usuario_id for update;
  if not found or not u.ativo then
    raise exception 'Usuário inexistente ou inativo.' using errcode = 'AC006';
  end if;
  if u.senha_hash is distinct from extensions.crypt(coalesce(p_senha_atual, ''), u.senha_hash) then
    raise exception 'A senha atual não confere.' using errcode = 'AC007';
  end if;
  perform public.acesso_validar_senha(p_senha_nova);
  if p_senha_nova = p_senha_atual then
    raise exception 'A nova senha precisa ser diferente da atual.' using errcode = 'AC005';
  end if;

  update public.acesso_usuarios
  set senha_hash = extensions.crypt(p_senha_nova, extensions.gen_salt('bf', 10)),
      deve_trocar_senha = false,
      sessoes_validas_desde = v_agora,
      atualizado_em = v_agora
  where id = u.id;

  return floor(extract(epoch from v_agora))::bigint;
end;
$$;

-- ============================================================================
-- GESTAO (Painel de Controle). Ler exige Visualizacao; mudar exige Full.
-- p_ator e o usuario da sessao, que o painel ja conferiu.
-- ============================================================================

create function public.acesso_listar_usuarios(p_ator uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.acesso_exigir(p_ator, 'painel_de_controle', 'visualizacao');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nome', u.nome,
      'email', u.email,
      'telefone', u.telefone,
      'perfil', u.perfil,
      'grupo_id', u.grupo_id,
      'grupo_nome', g.nome,
      'ativo', u.ativo,
      'deve_trocar_senha', u.deve_trocar_senha,
      'bloqueado', u.bloqueado_ate is not null and u.bloqueado_ate > now(),
      'ultimo_acesso_em', u.ultimo_acesso_em,
      'criado_em', u.criado_em
    ) order by lower(u.nome), u.id)
    from public.acesso_usuarios u
    join public.acesso_grupos g on g.id = u.grupo_id
  ), '[]'::jsonb);
end;
$$;

create function public.acesso_listar_grupos(p_ator uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.acesso_exigir(p_ator, 'painel_de_controle', 'visualizacao');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id,
      'nome', g.nome,
      'descricao', g.descricao,
      'ativo', g.ativo,
      'usuarios', (select count(*) from public.acesso_usuarios u where u.grupo_id = g.id),
      'usuarios_ativos', (select count(*) from public.acesso_usuarios u where u.grupo_id = g.id and u.ativo),
      'modulos', (
        select jsonb_object_agg(
          mods.modulo,
          coalesce(
            (select m.nivel from public.acesso_grupo_modulos m
             where m.grupo_id = g.id and m.modulo = mods.modulo),
            'sem_acesso'
          )
        )
        from unnest(array[
          'visao_geral', 'atendimentos', 'ouvintes', 'comercial', 'promocoes',
          'painel_de_controle'
        ]) as mods (modulo)
      )
    ) order by lower(g.nome), g.id)
    from public.acesso_grupos g
  ), '[]'::jsonb);
end;
$$;

create function public.acesso_criar_usuario(
  p_ator uuid,
  p_nome text,
  p_email text,
  p_telefone text,
  p_perfil text,
  p_grupo_id uuid,
  p_senha_temporaria text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.acesso_exigir(p_ator, 'painel_de_controle', 'full');
  perform public.acesso_validar_senha(p_senha_temporaria);
  if not exists (select 1 from public.acesso_grupos where id = p_grupo_id) then
    raise exception 'Grupo de acesso inexistente.' using errcode = 'AC006';
  end if;

  begin
    insert into public.acesso_usuarios (
      nome, email, telefone, perfil, grupo_id, senha_hash, deve_trocar_senha
    ) values (
      btrim(p_nome),
      lower(btrim(p_email)),
      nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), ''),
      p_perfil,
      p_grupo_id,
      extensions.crypt(p_senha_temporaria, extensions.gen_salt('bf', 10)),
      true
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Já existe um usuário com este e-mail.' using errcode = 'AC004';
    when check_violation then
      raise exception 'Confira nome, e-mail, telefone e perfil.' using errcode = 'AC006';
  end;

  return v_id;
end;
$$;

-- E-mail nao entra: nao muda. Senha nao entra: tem funcao propria.
create function public.acesso_atualizar_usuario(
  p_ator uuid,
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_perfil text,
  p_grupo_id uuid,
  p_ativo boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  u public.acesso_usuarios%rowtype;
begin
  perform public.acesso_exigir(p_ator, 'painel_de_controle', 'full');

  select * into u from public.acesso_usuarios where id = p_id for update;
  if not found then
    raise exception 'Usuário inexistente.' using errcode = 'AC006';
  end if;
  if p_ativo is null then
    raise exception 'Informe se o usuário fica ativo.' using errcode = 'AC006';
  end if;
  if p_id = p_ator and not p_ativo then
    raise exception 'Você não pode desativar o próprio usuário.' using errcode = 'AC002';
  end if;
  if p_id = p_ator and p_grupo_id is distinct from u.grupo_id then
    raise exception 'Você não pode trocar o próprio grupo de acesso. Peça a outro administrador.'
      using errcode = 'AC008';
  end if;
  if not exists (select 1 from public.acesso_grupos where id = p_grupo_id) then
    raise exception 'Grupo de acesso inexistente.' using errcode = 'AC006';
  end if;

  begin
    update public.acesso_usuarios
    set nome = btrim(p_nome),
        telefone = nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), ''),
        perfil = p_perfil,
        grupo_id = p_grupo_id,
        ativo = p_ativo,
        -- Desativado agora: as sessoes abertas caem na hora, sem esperar o token vencer.
        sessoes_validas_desde = case when u.ativo and not p_ativo then now() else u.sessoes_validas_desde end,
        atualizado_em = now()
    where id = p_id;
  exception
    when check_violation then
      raise exception 'Confira nome, telefone e perfil.' using errcode = 'AC006';
  end;
end;
$$;

-- Senha temporaria definida pelo administrador. O usuario troca no proximo
-- acesso, as sessoes abertas dele caem e o bloqueio por tentativas e zerado.
create function public.acesso_redefinir_senha(
  p_ator uuid,
  p_id uuid,
  p_senha_temporaria text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.acesso_exigir(p_ator, 'painel_de_controle', 'full');
  if p_id = p_ator then
    raise exception 'Para trocar a sua própria senha, use "Trocar senha".' using errcode = 'AC009';
  end if;
  perform public.acesso_validar_senha(p_senha_temporaria);

  update public.acesso_usuarios
  set senha_hash = extensions.crypt(p_senha_temporaria, extensions.gen_salt('bf', 10)),
      deve_trocar_senha = true,
      sessoes_validas_desde = now(),
      tentativas_falhas = 0,
      bloqueado_ate = null,
      atualizado_em = now()
  where id = p_id;
  if not found then
    raise exception 'Usuário inexistente.' using errcode = 'AC006';
  end if;
end;
$$;

-- Cria (p_id nulo) ou atualiza um grupo com o nivel dos SEIS modulos de uma vez.
-- p_modulos: {"visao_geral": "full", ...}, exatamente as seis chaves. Grava por
-- upsert: nenhuma linha de nivel e apagada.
create function public.acesso_salvar_grupo(
  p_ator uuid,
  p_id uuid,
  p_nome text,
  p_descricao text,
  p_ativo boolean,
  p_modulos jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
  v_modulos constant text[] := array[
    'visao_geral', 'atendimentos', 'ouvintes', 'comercial', 'promocoes',
    'painel_de_controle'
  ];
  v_grupo_do_ator uuid;
begin
  perform public.acesso_exigir(p_ator, 'painel_de_controle', 'full');

  if p_ativo is null then
    raise exception 'Informe se o grupo fica ativo.' using errcode = 'AC006';
  end if;
  if p_modulos is null or jsonb_typeof(p_modulos) <> 'object'
     or (select count(*) from jsonb_object_keys(p_modulos)) <> 6
     or exists (
       select 1 from unnest(v_modulos) as mods (modulo)
       where coalesce(p_modulos ->> mods.modulo, '') not in ('sem_acesso', 'visualizacao', 'edicao', 'full')
     ) then
    raise exception 'Informe um nível válido para cada um dos seis módulos.' using errcode = 'AC006';
  end if;

  select grupo_id into v_grupo_do_ator from public.acesso_usuarios where id = p_ator;
  if v_id is not null and v_id = v_grupo_do_ator then
    if not p_ativo then
      raise exception 'Você não pode desativar o grupo do seu próprio usuário.' using errcode = 'AC008';
    end if;
    if p_modulos ->> 'painel_de_controle' <> 'full' then
      raise exception 'Você não pode tirar o Full do Painel de Controle do seu próprio grupo.'
        using errcode = 'AC008';
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.acesso_grupos (nome, descricao, ativo)
      values (btrim(p_nome), btrim(coalesce(p_descricao, '')), p_ativo)
      returning id into v_id;
    else
      update public.acesso_grupos
      set nome = btrim(p_nome),
          descricao = btrim(coalesce(p_descricao, '')),
          ativo = p_ativo,
          atualizado_em = now()
      where id = v_id;
      if not found then
        raise exception 'Grupo de acesso inexistente.' using errcode = 'AC006';
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Já existe um grupo com este nome.' using errcode = 'AC004';
    when check_violation then
      raise exception 'Confira o nome (até 60 caracteres) e a descrição (até 200).' using errcode = 'AC006';
  end;

  insert into public.acesso_grupo_modulos (grupo_id, modulo, nivel)
  select v_id, mods.modulo, p_modulos ->> mods.modulo
  from unnest(v_modulos) as mods (modulo)
  on conflict (grupo_id, modulo) do update set nivel = excluded.nivel;

  return v_id;
end;
$$;

-- ============================================================================
-- PERMISSOES DE EXECUCAO
-- O Supabase da EXECUTE a anon e authenticated em toda funcao nova do schema
-- public. Aqui tudo e revogado; so service_role (o servidor do painel) executa
-- as funcoes de login, sessao e gestao. As auxiliares ninguem executa pela API.
-- ============================================================================

revoke all on function
  public.acesso_email_imutavel(),
  public.acesso_garantir_administrador(),
  public.acesso_nivel_ordem(text),
  public.acesso_permissoes_de(uuid),
  public.acesso_exigir(uuid, text, text),
  public.acesso_validar_senha(text),
  public.acesso_autenticar(text, text),
  public.acesso_sessao(uuid),
  public.acesso_trocar_senha(uuid, text, text),
  public.acesso_listar_usuarios(uuid),
  public.acesso_listar_grupos(uuid),
  public.acesso_criar_usuario(uuid, text, text, text, text, uuid, text),
  public.acesso_atualizar_usuario(uuid, uuid, text, text, text, uuid, boolean),
  public.acesso_redefinir_senha(uuid, uuid, text),
  public.acesso_salvar_grupo(uuid, uuid, text, text, boolean, jsonb)
from public, anon, authenticated, service_role;

grant execute on function
  public.acesso_autenticar(text, text),
  public.acesso_sessao(uuid),
  public.acesso_trocar_senha(uuid, text, text),
  public.acesso_listar_usuarios(uuid),
  public.acesso_listar_grupos(uuid),
  public.acesso_criar_usuario(uuid, text, text, text, text, uuid, text),
  public.acesso_atualizar_usuario(uuid, uuid, text, text, text, uuid, boolean),
  public.acesso_redefinir_senha(uuid, uuid, text),
  public.acesso_salvar_grupo(uuid, uuid, text, text, boolean, jsonb)
to service_role;

notify pgrst, 'reload schema';
