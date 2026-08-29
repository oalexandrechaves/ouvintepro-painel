-- v82: pedidos diversos (abraco, beijo, alo com nome de alguem, camiseta, premio,
-- musica, outro). Ate agora nao havia onde guardar isso. Espelha o padrao de
-- promocao_participacoes: RLS ligado e ZERO policies (so service_role/definer acessa;
-- o bot grava com service role e o painel le com service role). So registra quando o
-- cadastro estiver completo (regra aplicada no bot, nao no banco).
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  ouvinte_id uuid not null references public.ouvintes(id) on delete cascade,
  conversa_id uuid references public.conversas(id) on delete set null,
  tipo text not null,
  conteudo text,
  destinatario text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_pedidos_radio_criado on public.pedidos (radio_id, criado_em desc);
create index if not exists idx_pedidos_ouvinte on public.pedidos (ouvinte_id);
create index if not exists idx_pedidos_radio_tipo on public.pedidos (radio_id, tipo);

alter table public.pedidos enable row level security;
-- Sem policies de proposito: mesmo padrao de promocao_participacoes e das tabelas com PII.
-- ouvinte_id/conversa_id/radio_id em CASCADE: apagar ouvinte ficticio/teste limpa os pedidos.
