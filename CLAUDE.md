# OuvintePro - guia do projeto

Painel + backend de captacao de ouvintes por WhatsApp. "Dados e Conexao na Radio".

## Stack
- Next.js 14 (App Router) + Tailwind CSS 3 + recharts + TypeScript. NAO usar Next 15 nem Tailwind v4.
- Supabase: Postgres (RLS), Edge Function `whatsapp-webhook` (Deno), pg_cron.
- Z-API (WhatsApp) -> webhook "ao receber" -> Edge Function.
- Gemini (`gemini-2.5-flash-lite`) interpreta as respostas de musica.

## Estrutura
- `app/` painel (login em `/login`, hotlink publico em `/r/[slug]`), `components/`, `lib/` (auth, supabase, queries, mockData de fallback).
- `middleware.ts` protege tudo menos `/login`, `/api/login`, `/api/logout`, `/r/...` e estaticos.
- `supabase/migrations/` schema versionado; `supabase/functions/whatsapp-webhook/index.ts` o bot.

## Secrets / env (NUNCA no codigo nem no git)
- Painel (.env.local + Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PAINEL_USER`, `PAINEL_PASSWORD`, `SESSION_SECRET`.
- Edge Function (secrets do Supabase): `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`, `GEMINI_API_KEY`. `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` sao injetados automaticamente.
- `sendText` PRECISA enviar o header `Client-Token` (lendo `ZAPI_CLIENT_TOKEN`). Nao remover.

## Convencoes
- Textos em pt-BR, acentuacao correta, SEM travessoes.
- Mudancas no schema sempre via migration versionada (nunca SQL solto).
- IA so recebe texto de musica/artista/radio. NUNCA nome, telefone, bairro ou data de nascimento. Se o Gemini falhar, degrada pro fallback de texto cru sem travar.
- Views do painel devem manter os nomes de coluna de saida (`label`, `valor`) pra nao quebrar o front.

## Fluxo de entrega (OBRIGATORIO)
Toda alteracao tem que ser versionada no GitHub. Deploy no Supabase (Edge Function/migration) ou na Vercel NAO substitui o commit.
1. `git remote -v` (remote: github.com/oalexandrechaves/ouvintepro-painel).
2. `git add -A && git commit && git push origin main`.
3. `git log origin/main..HEAD` tem que sair VAZIO.
Nenhuma mudanca pode ficar so no deploy sem estar no repo.
