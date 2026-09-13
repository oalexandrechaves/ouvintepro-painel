-- GENERO ESTIMADO PELO PRIMEIRO NOME. ESTIMATIVA, NUNCA DADO DECLARADO.
--
-- O bot nao pergunta genero. A tela Comercial filtra por masculino e feminino
-- deduzindo pelo primeiro nome, com a frequencia de cada nome por sexo no Censo
-- 2010 do IBGE (versao consolidada pelo Brasil.IO, dataset genero-nomes).
--
-- POR QUE TABELA NO BANCO, E NAO API NEM LISTA NO CODIGO:
--  - a API do IBGE em tempo real mandaria nome de ouvinte para terceiro;
--  - lista embutida no codigo seria pequena, sem frequencia e sem como auditar.
-- Aqui nenhum nome sai do banco e nada e gravado em `ouvintes`: a funcao calcula
-- na leitura, como coluna calculada do PostgREST (`genero_estimado`).
--
-- OS CORTES (aprovados em 12/09/2026):
--  - um sexo com 90% ou mais das ocorrencias do nome classifica ('feminino' ou
--    'masculino');
--  - entre 10% e 90% e 'ambiguo' (Darci, Juraci, Ariel...);
--  - nome que nao esta na tabela e 'nao_encontrado'.
-- Ambiguo e nao encontrado NUNCA sao empurrados para um lado: a tela mostra
-- quantos ficaram sem classificacao.
--
-- DADOS. A tabela nasce vazia aqui; a carga e separada (ver
-- supabase/seeds/LEIA-ME.md). O arquivo completo, 100.787 nomes, fica versionado em
-- supabase/seeds/nomes_genero_ibge_censo2010.csv.gz. Licenca do Brasil.IO: CC BY-SA 4.0.
--
-- Banco compartilhado com outros produtos: nomes com prefixo proprio e RLS ligado
-- sem policies (so service_role le), o mesmo padrao das tabelas do painel.

create table if not exists public.nomes_genero_ibge (
  -- Primeiro nome no formato do IBGE: maiusculas, sem acento, so letras A-Z.
  nome text primary key check (nome ~ '^[A-Z]+$'),
  frequencia_feminina integer not null default 0 check (frequencia_feminina >= 0),
  frequencia_masculina integer not null default 0 check (frequencia_masculina >= 0),
  check (frequencia_feminina + frequencia_masculina > 0)
);

alter table public.nomes_genero_ibge enable row level security;

comment on table public.nomes_genero_ibge is
  'Frequencia de primeiro nome por sexo, Censo 2010 (IBGE via Brasil.IO, CC BY-SA 4.0). Base do genero ESTIMADO do painel.';

-- Primeiro nome no formato da tabela: primeira palavra, sem acento, maiusculas,
-- so letras. "Mônica Souza" -> "MONICA". Nome composto com hifen vira uma palavra
-- que o IBGE nao tem, e cai em nao_encontrado: nunca num lado por palpite.
create or replace function public.primeiro_nome_ibge(nome text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      upper(translate(
        split_part(btrim(coalesce(nome, '')), ' ', 1),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
        'aaaaaaeeeeiiiiooooouuuucnyAAAAAAEEEEIIIIOOOOOUUUUCNY'
      )),
      '[^A-Z]', '', 'g'
    ),
    ''
  );
$$;

-- 'feminino' | 'masculino' | 'ambiguo' | 'nao_encontrado'. Nunca nulo: quem le
-- nao precisa lembrar de tratar null como "sem classificacao".
create or replace function public.genero_estimado(o public.ouvintes)
returns text
language sql
stable
as $$
  select case
    when n.nome is null then 'nao_encontrado'
    when n.frequencia_feminina::bigint * 10
         >= (n.frequencia_feminina::bigint + n.frequencia_masculina) * 9 then 'feminino'
    when n.frequencia_masculina::bigint * 10
         >= (n.frequencia_feminina::bigint + n.frequencia_masculina) * 9 then 'masculino'
    else 'ambiguo'
  end
  from (select 1) as um
  left join public.nomes_genero_ibge n
    on n.nome = public.primeiro_nome_ibge(o.nome);
$$;
