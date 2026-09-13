-- PRIMEIRO ADMINISTRADOR DO PAINEL. RODAR UMA VEZ, NO SQL EDITOR, A MAO.
--
-- NAO E MIGRATION e fica fora de supabase/migrations de proposito: tem senha, e
-- senha nao vai para o git. Pre-requisito: a migration
-- 20260913100000_acesso_usuarios_grupos.sql ja rodada.
--
-- COMO USAR
--  1. Copie este arquivo para o SQL Editor do Supabase (projeto egqfkhxrxdgpjhjwvkgm).
--  2. Troque SO as tres linhas marcadas com <<< (nome, e-mail, senha temporaria).
--     NAO salve a versao preenchida em lugar nenhum.
--  3. Rode. A conferencia do fim precisa mostrar 1 usuario, ativo, com Full nos
--     seis modulos e deve_trocar_senha = true.
--  4. Entre no painel com o e-mail e a senha temporaria. O painel pede uma senha
--     nova antes de abrir qualquer tela: a senha digitada aqui fica no historico
--     do SQL Editor, e por isso ela so vale para esse primeiro acesso.
--
-- O QUE CRIA
--  - grupo "Direção", ativo, com Full nos seis modulos;
--  - o usuario, perfil Administrador, nesse grupo.
--
-- TRAVAS
--  - recusa rodar se ja existir qualquer usuario (nao cria administrador por
--    cima de um sistema que ja tem dono; o segundo em diante e criado pela tela);
--  - recusa se as tres linhas nao foram trocadas, ou se a senha tem menos de 8
--    caracteres;
--  - tudo dentro de um bloco so: se qualquer passo falhar, nada fica gravado.

do $$
declare
  v_nome  text := 'NOME DO ADMINISTRADOR';        -- <<< nome completo
  v_email text := 'email@exemplo.com.br';         -- <<< e-mail, que vira o login
  v_senha text := 'SENHA-TEMPORARIA';             -- <<< senha temporaria, 8+ caracteres
  v_grupo uuid;
begin
  if exists (select 1 from public.acesso_usuarios) then
    raise exception 'Já existe usuário cadastrado. O próximo administrador é criado pela tela Painel de Controle.';
  end if;
  if v_nome = 'NOME DO ADMINISTRADOR' or v_email = 'email@exemplo.com.br' or v_senha = 'SENHA-TEMPORARIA' then
    raise exception 'Troque nome, e-mail e senha nas três linhas marcadas antes de rodar.';
  end if;

  perform public.acesso_validar_senha(v_senha);

  insert into public.acesso_grupos (nome, descricao, ativo)
  values ('Direção', 'Acesso completo ao sistema e ao painel de controle.', true)
  returning id into v_grupo;

  insert into public.acesso_grupo_modulos (grupo_id, modulo, nivel)
  select v_grupo, m, 'full'
  from unnest(array[
    'visao_geral', 'atendimentos', 'ouvintes', 'comercial', 'promocoes',
    'painel_de_controle'
  ]) as m;

  insert into public.acesso_usuarios (nome, email, perfil, grupo_id, senha_hash, deve_trocar_senha)
  values (
    btrim(v_nome),
    lower(btrim(v_email)),
    'Administrador',
    v_grupo,
    extensions.crypt(v_senha, extensions.gen_salt('bf', 10)),
    true
  );
end;
$$;

-- CONFERENCIA (nao mostra o hash).
select
  u.nome,
  u.email,
  u.perfil,
  u.ativo,
  u.deve_trocar_senha,
  g.nome as grupo,
  g.ativo as grupo_ativo,
  (select string_agg(m.modulo || '=' || m.nivel, ', ' order by m.modulo)
   from public.acesso_grupo_modulos m where m.grupo_id = g.id) as niveis,
  (select count(*) from public.acesso_usuarios) as total_usuarios
from public.acesso_usuarios u
join public.acesso_grupos g on g.id = u.grupo_id;
