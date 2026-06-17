-- OuvintePro - encurta a janela de encerramento de conversas para 5 minutos,
-- casando com a janela de sessao da Edge Function (recoleta apos 5 min de silencio).

create or replace function public.encerrar_conversas_inativas()
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversas
  set status = 'encerrada', encerrada_em = now()
  where status = 'aberta'
    and ultima_atividade_em < now() - interval '5 minutes';
$$;

-- Mantem o lock: so o pg_cron (role postgres) chama, nunca a API publica.
revoke execute on function public.encerrar_conversas_inativas() from anon, authenticated, public;
