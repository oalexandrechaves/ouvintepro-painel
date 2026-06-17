-- OuvintePro - agendamentos via pg_cron

create extension if not exists pg_cron;

-- Funcao: encerra conversas inativas ha mais de 15 minutos.
create or replace function public.encerrar_conversas_inativas()
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversas
  set status = 'encerrada', encerrada_em = now()
  where status = 'aberta'
    and ultima_atividade_em < now() - interval '15 minutes';
$$;

-- Funcao: recalcula idade e faixa etaria a partir da data de nascimento.
create or replace function public.recalcular_idades()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ouvintes o
  set
    idade = date_part('year', age(o.data_nascimento))::int,
    faixa_etaria = (
      select f.id from public.faixas_etarias f
      where date_part('year', age(o.data_nascimento))::int >= f.idade_min
        and (f.idade_max is null or date_part('year', age(o.data_nascimento))::int <= f.idade_max)
      limit 1
    )
  where o.data_nascimento is not null;
$$;

-- A cada 5 minutos: fecha conversas paradas.
select cron.schedule(
  'ouvintepro-encerrar-conversas',
  '*/5 * * * *',
  $$ select public.encerrar_conversas_inativas(); $$
);

-- Diario a meia-noite: recalcula idade/faixa (aniversariantes).
select cron.schedule(
  'ouvintepro-recalcular-idades',
  '0 0 * * *',
  $$ select public.recalcular_idades(); $$
);
