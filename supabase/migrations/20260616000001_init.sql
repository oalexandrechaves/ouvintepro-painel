-- OuvintePro - schema inicial (multi-tenant por radio_id, RLS ativo)
-- Aditivo: nao altera o painel existente. PII protegida, painel le so agregados.

create extension if not exists pgcrypto;

-- ===================== TABELAS =====================

create table if not exists public.radios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  frequencia text,
  zapi_instance_id text unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.ouvintes (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  telefone text not null,
  ddd text,
  nome text,
  bairro text,
  zona text,
  cidade text,
  estado text,
  data_nascimento date,
  idade int,
  faixa_etaria int,
  participacoes int not null default 0,
  primeiro_contato_em timestamptz not null default now(),
  ultimo_contato_em timestamptz not null default now(),
  unique (radio_id, telefone)
);

create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  ouvinte_id uuid not null references public.ouvintes(id) on delete cascade,
  status text not null default 'aberta',
  etapa text not null default 'inicio',
  iniciada_em timestamptz not null default now(),
  ultima_atividade_em timestamptz not null default now(),
  encerrada_em timestamptz
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  radio_id uuid not null references public.radios(id) on delete cascade,
  direcao text not null,
  tipo text not null default 'texto',
  conteudo text,
  audio_url text,
  criado_em timestamptz not null default now()
);

create table if not exists public.musicas (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  ouvinte_id uuid not null references public.ouvintes(id) on delete cascade,
  nome text not null,
  sentimento text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.radios_concorrentes (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  ouvinte_id uuid not null references public.ouvintes(id) on delete cascade,
  nome_radio text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.bairros_zonas (
  id uuid primary key default gen_random_uuid(),
  bairro text not null,
  zona text not null
);
create unique index if not exists bairros_zonas_bairro_lower_idx
  on public.bairros_zonas (lower(bairro));

create table if not exists public.faixas_etarias (
  id int primary key,
  label text not null,
  idade_min int not null,
  idade_max int
);

create table if not exists public.hotlinks (
  id uuid primary key default gen_random_uuid(),
  radio_id uuid not null references public.radios(id) on delete cascade,
  ouvinte_id uuid references public.ouvintes(id) on delete set null,
  anunciante text,
  produto text,
  destino_url text not null,
  slug text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists public.hotlink_cliques (
  id uuid primary key default gen_random_uuid(),
  hotlink_id uuid not null references public.hotlinks(id) on delete cascade,
  criado_em timestamptz not null default now(),
  user_agent text
);

create index if not exists ouvintes_radio_idx on public.ouvintes (radio_id);
create index if not exists conversas_status_idx on public.conversas (status, ultima_atividade_em);
create index if not exists mensagens_conversa_idx on public.mensagens (conversa_id);
create index if not exists musicas_radio_idx on public.musicas (radio_id, sentimento);

-- ===================== SEEDS =====================

insert into public.faixas_etarias (id, label, idade_min, idade_max) values
  (1, '10 a 14', 10, 14),
  (2, '15 a 19', 15, 19),
  (3, '20 a 24', 20, 24),
  (4, '25 a 29', 25, 29),
  (5, '30 a 34', 30, 34),
  (6, '35 a 39', 35, 39),
  (7, '40 a 44', 40, 44),
  (8, '45 a 49', 45, 49),
  (9, '50 a 54', 50, 54),
  (10, '55 a 59', 55, 59),
  (11, '60 ou mais', 60, null)
on conflict (id) do nothing;

-- Bairros de Sao Paulo mapeados por zona (lista inicial, facil de expandir).
-- Bairro nao encontrado vira zona 'Outras' (tratado na Edge Function).
insert into public.bairros_zonas (bairro, zona) values
  ('Moema', 'Zona Sul'), ('Vila Mariana', 'Zona Sul'), ('Saude', 'Zona Sul'),
  ('Jabaquara', 'Zona Sul'), ('Santo Amaro', 'Zona Sul'), ('Campo Belo', 'Zona Sul'),
  ('Brooklin', 'Zona Sul'), ('Itaim Bibi', 'Zona Sul'), ('Morumbi', 'Zona Sul'),
  ('Capao Redondo', 'Zona Sul'), ('Cidade Ademar', 'Zona Sul'), ('Interlagos', 'Zona Sul'),
  ('Grajau', 'Zona Sul'), ('Cidade Dutra', 'Zona Sul'), ('Socorro', 'Zona Sul'),
  ('Santana', 'Zona Norte'), ('Tucuruvi', 'Zona Norte'), ('Tremembe', 'Zona Norte'),
  ('Casa Verde', 'Zona Norte'), ('Vila Maria', 'Zona Norte'), ('Vila Guilherme', 'Zona Norte'),
  ('Freguesia do O', 'Zona Norte'), ('Brasilandia', 'Zona Norte'), ('Mandaqui', 'Zona Norte'),
  ('Jacana', 'Zona Norte'), ('Vila Medeiros', 'Zona Norte'), ('Limao', 'Zona Norte'),
  ('Tatuape', 'Zona Leste'), ('Mooca', 'Zona Leste'), ('Penha', 'Zona Leste'),
  ('Itaquera', 'Zona Leste'), ('Sao Mateus', 'Zona Leste'), ('Itaim Paulista', 'Zona Leste'),
  ('Guaianases', 'Zona Leste'), ('Cidade Tiradentes', 'Zona Leste'), ('Sao Miguel Paulista', 'Zona Leste'),
  ('Ermelino Matarazzo', 'Zona Leste'), ('Vila Prudente', 'Zona Leste'), ('Sapopemba', 'Zona Leste'),
  ('Aricanduva', 'Zona Leste'), ('Carrao', 'Zona Leste'), ('Vila Formosa', 'Zona Leste'),
  ('Belem', 'Zona Leste'), ('Artur Alvim', 'Zona Leste'), ('Cangaiba', 'Zona Leste'),
  ('Pinheiros', 'Zona Oeste'), ('Perdizes', 'Zona Oeste'), ('Lapa', 'Zona Oeste'),
  ('Butanta', 'Zona Oeste'), ('Vila Leopoldina', 'Zona Oeste'), ('Jaguare', 'Zona Oeste'),
  ('Rio Pequeno', 'Zona Oeste'), ('Raposo Tavares', 'Zona Oeste'), ('Vila Sonia', 'Zona Oeste'),
  ('Pompeia', 'Zona Oeste'), ('Alto de Pinheiros', 'Zona Oeste'), ('Barra Funda', 'Zona Oeste'),
  ('Se', 'Centro'), ('Republica', 'Centro'), ('Bela Vista', 'Centro'),
  ('Consolacao', 'Centro'), ('Santa Cecilia', 'Centro'), ('Liberdade', 'Centro'),
  ('Bom Retiro', 'Centro'), ('Bras', 'Centro'), ('Cambuci', 'Centro'),
  ('Higienopolis', 'Centro'), ('Pari', 'Centro'),
  ('Parelheiros', 'Periferia'), ('Marsilac', 'Periferia')
on conflict (lower(bairro)) do nothing;

-- Radio modelo. zapi_instance_id NAO e segredo (o token sim, fica nos secrets).
-- TODO: ajustar zapi_instance_id para o instance id real da Z-API antes do teste real.
insert into public.radios (nome, frequencia, zapi_instance_id, ativo) values
  ('Radio Cidade FM', '102,7', 'INSTANCE_ID_PLACEHOLDER', true)
on conflict (zapi_instance_id) do nothing;

-- Hotlink de exemplo para teste do redirect.
insert into public.hotlinks (radio_id, anunciante, produto, destino_url, slug)
select r.id, 'Anunciante Exemplo', 'Promo Cidade', 'https://www.example.com/promo', 'promo-cidade'
from public.radios r
where r.zapi_instance_id = 'INSTANCE_ID_PLACEHOLDER'
on conflict (slug) do nothing;

-- ===================== RLS =====================
alter table public.radios enable row level security;
alter table public.ouvintes enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
alter table public.musicas enable row level security;
alter table public.radios_concorrentes enable row level security;
alter table public.bairros_zonas enable row level security;
alter table public.faixas_etarias enable row level security;
alter table public.hotlinks enable row level security;
alter table public.hotlink_cliques enable row level security;

-- Sem policies para anon/authenticated nas tabelas: PII fica protegida.
-- A Edge Function usa service_role (bypassa RLS). O painel le apenas as views/RPC abaixo.
-- TODO: policies por auth/tenant na fase multi-tenant.
revoke all on public.ouvintes from anon, authenticated;
revoke all on public.mensagens from anon, authenticated;
revoke all on public.conversas from anon, authenticated;
revoke all on public.musicas from anon, authenticated;
revoke all on public.radios_concorrentes from anon, authenticated;
revoke all on public.hotlinks from anon, authenticated;
revoke all on public.hotlink_cliques from anon, authenticated;
revoke all on public.radios from anon, authenticated;

-- ===================== VIEWS AGREGADAS (somente leitura) =====================
-- Views pertencem ao owner (postgres) e nao usam security_invoker,
-- entao expoem apenas o agregado sem vazar PII das tabelas base.

create or replace view public.painel_zonas as
  select zona as label, count(*)::int as valor
  from public.ouvintes
  where zona is not null
  group by zona
  order by valor desc;

create or replace view public.painel_faixa_etaria as
  select f.label as label, count(o.id)::int as valor
  from public.faixas_etarias f
  left join public.ouvintes o on o.faixa_etaria = f.id
  group by f.id, f.label
  having count(o.id) > 0
  order by f.id;

create or replace view public.painel_bairros as
  select bairro as label, count(*)::int as valor
  from public.ouvintes
  where bairro is not null
  group by bairro
  order by valor desc
  limit 10;

create or replace view public.painel_musicas_amadas as
  select nome as label, count(*)::int as valor
  from public.musicas
  where sentimento = 'ama'
  group by nome
  order by valor desc
  limit 10;

create or replace view public.painel_musicas_rejeitadas as
  select nome as label, count(*)::int as valor
  from public.musicas
  where sentimento = 'rejeita'
  group by nome
  order by valor desc
  limit 10;

create or replace view public.painel_radios_concorrentes as
  select nome_radio as label, count(*)::int as valor
  from public.radios_concorrentes
  group by nome_radio
  order by valor desc
  limit 10;

create or replace view public.painel_hotlink as
  select
    (select count(*) from public.hotlink_cliques)::int as acessos,
    0::int as conversoes,
    0::numeric as taxa;
-- TODO: modelar evento de conversao do hotlink na fase comercial.

-- ===================== RPC (period-parametrizado) =====================

create or replace function public.painel_kpis(p_periodo text default 'ano')
returns table (
  ouvintes_total bigint,
  novos_periodo bigint,
  conversas_hoje bigint,
  hotlink_acessos bigint,
  hotlink_conversao numeric
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.ouvintes),
    (select count(*) from public.ouvintes o
       where o.primeiro_contato_em >= case
         when p_periodo = 'hoje' then date_trunc('day', now())
         when p_periodo = '30dias' then now() - interval '30 days'
         else date_trunc('year', now())
       end),
    (select count(*) from public.conversas c
       where c.iniciada_em >= date_trunc('day', now())),
    (select count(*) from public.hotlink_cliques),
    0::numeric;
$$;

create or replace function public.painel_cadastros_serie(p_periodo text default 'ano')
returns table (rotulo text, cadastros int)
language sql
security definer
set search_path = public
as $$
  select
    case p_periodo
      when 'hoje' then to_char(d, 'HH24') || 'h'
      when '30dias' then to_char(d, 'DD/MM')
      else (array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'])[extract(month from d)::int]
    end as rotulo,
    count(o.id)::int as cadastros
  from generate_series(
    case p_periodo
      when 'hoje' then date_trunc('day', now())
      when '30dias' then date_trunc('day', now()) - interval '29 days'
      else date_trunc('year', now())
    end,
    case p_periodo
      when 'hoje' then date_trunc('day', now()) + interval '23 hours'
      when '30dias' then date_trunc('day', now())
      else date_trunc('year', now()) + interval '11 months'
    end,
    case p_periodo
      when 'hoje' then interval '1 hour'
      when '30dias' then interval '1 day'
      else interval '1 month'
    end
  ) as d
  left join public.ouvintes o on
    case p_periodo
      when 'hoje' then date_trunc('hour', o.primeiro_contato_em) = d
      when '30dias' then date_trunc('day', o.primeiro_contato_em) = d
      else date_trunc('month', o.primeiro_contato_em) = d
    end
  group by d
  order by d;
$$;

-- Registra um clique de hotlink e devolve o destino. Nao grava IP nem PII.
create or replace function public.registrar_clique(p_slug text, p_user_agent text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_destino text;
begin
  select id, destino_url into v_id, v_destino
  from public.hotlinks where slug = p_slug;
  if v_id is null then
    return null;
  end if;
  insert into public.hotlink_cliques (hotlink_id, user_agent)
  values (v_id, p_user_agent);
  return v_destino;
end;
$$;

-- Grants: somente as views/RPC de agregado ficam acessiveis ao painel (anon).
grant select on public.painel_zonas to anon, authenticated;
grant select on public.painel_faixa_etaria to anon, authenticated;
grant select on public.painel_bairros to anon, authenticated;
grant select on public.painel_musicas_amadas to anon, authenticated;
grant select on public.painel_musicas_rejeitadas to anon, authenticated;
grant select on public.painel_radios_concorrentes to anon, authenticated;
grant select on public.painel_hotlink to anon, authenticated;
grant execute on function public.painel_kpis(text) to anon, authenticated;
grant execute on function public.painel_cadastros_serie(text) to anon, authenticated;
grant execute on function public.registrar_clique(text, text) to anon, authenticated;
