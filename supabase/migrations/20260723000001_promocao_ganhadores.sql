-- Registro dos ganhadores de sorteios de promocao (PII: liga ao ouvinte).
-- RLS no mesmo padrao das outras tabelas com PII: RLS ativo, sem policies para
-- anon/authenticated. O painel le via service role; o bot nao usa esta tabela.
create table if not exists public.promocao_ganhadores (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  ouvinte_id uuid not null references public.ouvintes(id) on delete cascade,
  promocao_nome text not null,
  variacao_digitada text,
  sorteado_em timestamptz not null default now(),
  confirmado_em timestamptz not null default now()
);

create index if not exists promocao_ganhadores_radio_ouvinte_idx
  on public.promocao_ganhadores (radio_id, ouvinte_id);
create index if not exists promocao_ganhadores_radio_promo_idx
  on public.promocao_ganhadores (radio_id, promocao_nome);

alter table public.promocao_ganhadores enable row level security;
revoke all on public.promocao_ganhadores from anon, authenticated;
