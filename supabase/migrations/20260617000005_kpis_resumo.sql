-- OuvintePro - resumo de ouvintes pros KPIs do topo (agregado, sem PII, anon).
-- total = todos os registros; cadastrados = ouvintes que concluiram o fluxo.

create or replace view public.painel_ouvintes_resumo as
  select
    (select count(*) from public.ouvintes)::int as total,
    (select count(distinct ouvinte_id) from public.conversas where etapa = 'concluido')::int as cadastrados;

grant select on public.painel_ouvintes_resumo to anon, authenticated;
