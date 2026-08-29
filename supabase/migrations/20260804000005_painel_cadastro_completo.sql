-- v82: metricas passam a contar SO cadastros completos. A regua vira uma funcao unica,
-- reutilizada por todas as views/RPCs, e tambem espelhada no TypeScript (serverData.ts),
-- porque o painel rico calcula rankings/KPIs em TS a partir de ouvintes.
--
-- Regua de completo: nome + data_nascimento + cidade + numero + consentimento
-- (consentimento_em not null), MAIS bairro e zona quando a cidade for Sao Paulo capital.
-- Fora da capital, bairro/zona nao sao coletados (o bot so pergunta bairro na capital),
-- entao nao entram na regua para nao tornar "completo" impossivel no interior/Grande SP.
create or replace function public.ouvinte_completo(o public.ouvintes)
returns boolean
language sql
stable
as $$
  select o.nome is not null
     and o.data_nascimento is not null
     and o.cidade is not null
     and o.numero is not null
     and o.consentimento_em is not null
     and (
       lower(btrim(o.cidade)) not in ('sao paulo', 'são paulo')
       or (o.bairro is not null and o.zona is not null)
     );
$$;

-- Resumo: total continua BRUTO (todos os registros, unica visao de quanta gente
-- encostou no bot e a que da sentido ao funil). cadastrados = so completos.
create or replace view public.painel_ouvintes_resumo as
select
  (select count(*) from public.ouvintes)::integer as total,
  (select count(*) from public.ouvintes o where public.ouvinte_completo(o))::integer as cadastrados;

-- Zonas: so completos.
create or replace view public.painel_zonas as
select o.zona as label,
       count(*)::integer as valor
from public.ouvintes o
where o.zona is not null
  and public.ouvinte_completo(o)
group by o.zona
order by count(*) desc;

-- Faixa etaria: so completos.
create or replace view public.painel_faixa_etaria as
select f.label,
       count(o.id)::integer as valor
from public.faixas_etarias f
  left join public.ouvintes o
    on o.faixa_etaria = f.id
   and public.ouvinte_completo(o)
group by f.id, f.label
having count(o.id) > 0
order by f.id;

-- Musicas amadas: ranking so das musicas de ouvintes com cadastro completo.
-- sentimento='ama' ja exclui as linhas "Sem preferencia" (que usam sentimento proprio).
create or replace view public.painel_musicas_amadas as
select coalesce(
         case
           when m.artista is not null and m.titulo is not null then m.artista || ' - ' || m.titulo
           when m.titulo is not null then m.titulo
           when m.artista is not null then m.artista
           else m.nome
         end, m.nome) as label,
       count(*)::integer as valor
from public.musicas m
  join public.ouvintes o
    on o.id = m.ouvinte_id
   and public.ouvinte_completo(o)
where m.sentimento = 'ama'
group by coalesce(
         case
           when m.artista is not null and m.titulo is not null then m.artista || ' - ' || m.titulo
           when m.titulo is not null then m.titulo
           when m.artista is not null then m.artista
           else m.nome
         end, m.nome)
order by count(*) desc
limit 10;

-- KPIs: ouvintes_total continua BRUTO; novos_periodo passa a contar so completos.
-- conversas_hoje/hotlink mantidos. Assinatura preservada (queries.ts usa novos_periodo).
create or replace function public.painel_kpis(p_periodo text default 'ano')
returns table(ouvintes_total bigint, novos_periodo bigint, conversas_hoje bigint, hotlink_acessos bigint, hotlink_conversao numeric)
language sql
security definer
set search_path to 'public'
as $function$
  select
    (select count(*) from public.ouvintes),
    (select count(*) from public.ouvintes o
      where public.ouvinte_completo(o)
        and o.primeiro_contato_em >= case
          when p_periodo = 'hoje' then date_trunc('day', now())
          when p_periodo = '30dias' then now() - interval '30 days'
          else date_trunc('year', now()) end),
    (select count(*) from public.conversas c where c.iniciada_em >= date_trunc('day', now())),
    (select count(*) from public.hotlink_cliques),
    0::numeric;
$function$;

-- Serie de cadastros: passa a contar so completos por bucket de tempo.
create or replace function public.painel_cadastros_serie(p_periodo text default 'ano')
returns table(rotulo text, cadastros integer)
language sql
security definer
set search_path to 'public'
as $function$
  select
    case p_periodo
      when 'hoje' then to_char(d, 'HH24') || 'h'
      when '30dias' then to_char(d, 'DD/MM')
      else (array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[extract(month from d)::int]
    end as rotulo,
    count(o.id)::int as cadastros
  from generate_series(
    case p_periodo when 'hoje' then date_trunc('day', now())
      when '30dias' then date_trunc('day', now()) - interval '29 days'
      else date_trunc('year', now()) end,
    case p_periodo when 'hoje' then date_trunc('day', now()) + interval '23 hours'
      when '30dias' then date_trunc('day', now())
      else date_trunc('year', now()) + interval '11 months' end,
    case p_periodo when 'hoje' then interval '1 hour'
      when '30dias' then interval '1 day' else interval '1 month' end
  ) as d
  left join public.ouvintes o on
    public.ouvinte_completo(o) and
    case p_periodo when 'hoje' then date_trunc('hour', o.primeiro_contato_em) = d
      when '30dias' then date_trunc('day', o.primeiro_contato_em) = d
      else date_trunc('month', o.primeiro_contato_em) = d end
  group by d order by d;
$function$;
