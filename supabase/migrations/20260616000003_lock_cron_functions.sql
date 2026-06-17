-- As funcoes de manutencao do cron nao devem ser chamaveis pela API publica.
-- Rodam apenas via pg_cron (role postgres). Revoga execute de anon/authenticated.
revoke execute on function public.encerrar_conversas_inativas() from anon, authenticated, public;
revoke execute on function public.recalcular_idades() from anon, authenticated, public;
