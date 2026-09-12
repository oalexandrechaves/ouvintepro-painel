-- INDICES POR OUVINTE NAS TABELAS FILHAS, ANTES DO SEED DE 49 MIL OUVINTES.
--
-- `conversas`, `radios_concorrentes` e `musicas` tem chave estrangeira para
-- ouvintes(id), mas nenhum indice em ouvinte_id. Com ~1.100 ouvintes isso passava
-- despercebido. Com o seed, tres coisas quebram:
--
--  1. O PAINEL. O PostgREST monta os embeds (radios_concorrentes(...),
--     musicas(...)) como subconsulta correlacionada por ouvinte. Sem indice, cada
--     ouvinte varre a tabela filha inteira: a tela Comercial leria 50 mil
--     ouvintes x 18 mil radios, na ordem de 1 bilhao de comparacoes por
--     carregamento. Conferido com EXPLAIN em 12/09/2026: "Seq Scan on
--     radios_concorrentes ... Filter: (ouvinte_id = o.id)" dentro do SubPlan.
--  2. O PASSO 4 DO SEED, que busca a conversa de cada pedido. O plano mostrava
--     "Seq Scan on conversas ... Filter: (ouvinte_id = o.id)" por linha.
--  3. O ROLLBACK. `delete from ouvintes` apaga em cascata, e o Postgres procura
--     as linhas filhas de cada ouvinte apagado. Sem indice, varredura por ouvinte.
--
-- Aditivo e idempotente: so cria o que nao existe, nao altera dado nenhum, e as
-- tabelas sao pequenas hoje, entao a criacao e instantanea. `mensagens` ja tem
-- indice por conversa_id (mensagens_conversa_idx) e nao entra aqui.
--
-- Banco compartilhado com outros produtos: estes indices so tocam tabelas do
-- OuvintePro.

create index if not exists idx_conversas_ouvinte
  on public.conversas (ouvinte_id);

create index if not exists idx_radios_concorrentes_ouvinte
  on public.radios_concorrentes (ouvinte_id);

create index if not exists idx_musicas_ouvinte
  on public.musicas (ouvinte_id);
