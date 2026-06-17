-- OuvintePro - interpretacao por IA (Gemini) nas etapas de musica.
-- Campos canonicos pra agrupar variacoes/erros de grafia na mesma estatistica.

-- Campos canonicos das musicas.
alter table public.musicas add column if not exists texto_original text;
alter table public.musicas add column if not exists artista text;
alter table public.musicas add column if not exists titulo text;

-- Nome canonico das radios concorrentes.
alter table public.radios_concorrentes add column if not exists nome_canonico text;

-- Contexto da conversa (fila de artistas pendentes de musica).
alter table public.conversas add column if not exists contexto jsonb;

-- ===================== Views (agrupam pelos campos canonicos) =====================
-- IMPORTANTE: manter os MESMOS nomes de coluna de saida (label, valor) pra nao quebrar o painel.

create or replace view public.painel_musicas_amadas as
  select
    coalesce(
      case
        when artista is not null and titulo is not null then artista || ' - ' || titulo
        when titulo is not null then titulo
        when artista is not null then artista
        else nome
      end,
      nome
    ) as label,
    count(*)::int as valor
  from public.musicas
  where sentimento = 'ama'
  group by 1
  order by valor desc
  limit 10;

create or replace view public.painel_musicas_rejeitadas as
  select
    coalesce(
      case
        when artista is not null and titulo is not null then artista || ' - ' || titulo
        when titulo is not null then titulo
        when artista is not null then artista
        else nome
      end,
      nome
    ) as label,
    count(*)::int as valor
  from public.musicas
  where sentimento = 'rejeita'
  group by 1
  order by valor desc
  limit 10;

create or replace view public.painel_radios_concorrentes as
  select coalesce(nome_canonico, nome_radio) as label, count(*)::int as valor
  from public.radios_concorrentes
  group by 1
  order by valor desc
  limit 10;

-- Opcional: ranking de artistas amados (ainda nao consumido no painel).
create or replace view public.painel_artistas_amados as
  select artista as label, count(*)::int as valor
  from public.musicas
  where sentimento = 'ama' and artista is not null
  group by artista
  order by valor desc
  limit 10;

grant select on public.painel_artistas_amados to anon, authenticated;
