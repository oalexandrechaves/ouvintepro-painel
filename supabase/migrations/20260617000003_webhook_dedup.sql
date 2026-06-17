-- OuvintePro - idempotencia do webhook da Z-API.
-- A Z-API as vezes entrega a mesma mensagem duas vezes; guardamos o messageId
-- ja processado pra ignorar a entrega duplicada (evita pular etapas).

create table if not exists public.webhook_dedup (
  message_id text primary key,
  created_at timestamptz default now()
);

-- Acesso so via service_role (Edge Function). Sem policy = anon/authenticated bloqueados.
alter table public.webhook_dedup enable row level security;
