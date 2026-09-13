-- ============================================================================
-- CORRECAO DO SEED v4, aplicada em 13/09/2026 pelo conector. SO REGISTRO.
-- Nao rode de novo: o banco ja esta corrigido, e o arquivo
-- 20260912_demo_v4_49095_ouvintes.sql ja nasce certo para quem rodar do zero.
--
-- O QUE ESTAVA ERRADO. Os passos 3 e 4 sorteavam com random() dentro de
-- `join lateral (select ...)` sem referencia a linha de fora. O Postgres avalia
-- uma subconsulta assim UMA vez e repete o valor:
--   - 18.166 radios concorrentes, todas "Alpha FM";
--   - 12.764 pedidos, todos do tipo "musica", que o bot nem grava em `pedidos`.
-- A conferencia da epoca so olhava totais, e os totais estavam certos.
--
-- COMO FOI CORRIGIDO. So UPDATE sobre as linhas que ja existiam, nenhum DELETE.
-- Os totais e os ouvintes que tem radio e pedido ficam iguais; muda a variedade.
-- Linhas reais (fora do range de telefones da demonstracao) nao foram tocadas.
-- ============================================================================


-- 1. RADIO CONCORRENTE: curva proporcional a que ja existia na base real.
--    Nativa FM 5.897 · Massa FM 2.853 · Jovem Pan 1.617 · Band FM 1.554
--    Mundo Livre FM 1.489 · Transamérica 1.363 · Alpha FM 1.173 · Kiss FM 1.141
--    105 FM 1.079
with alvo as (
  select rc.id,
         row_number() over (order by ((substring(o.telefone from 8)::int - 1143) * 4253) % 49095) k
  from radios_concorrentes rc
  join ouvintes o on o.id = rc.ouvinte_id
  where o.telefone between '5511990001144' and '5511990050238'
),
novo as (
  select id, (array['Nativa FM','Massa FM','Jovem Pan','Band FM','Mundo Livre FM',
                    'Transamérica','Alpha FM','Kiss FM','105 FM'])[
           case when k <= 5897 then 1 when k <= 8750 then 2 when k <= 10367 then 3
                when k <= 11921 then 4 when k <= 13410 then 5 when k <= 14773 then 6
                when k <= 15946 then 7 when k <= 17087 then 8 else 9 end] nome
  from alvo
)
update radios_concorrentes rc
set nome_radio = novo.nome, nome_canonico = novo.nome
from novo
where rc.id = novo.id;


-- 2. PEDIDOS: so o vocabulario que o bot grava em `pedidos`.
--    beijo 3.917 · alo 3.281 · abraco 2.846 · outro 1.459 · camiseta 734 · premio 527
with alvo as (
  select p.id,
         row_number() over (order by ((substring(o.telefone from 8)::int - 1143) * 4259) % 49095) k
  from pedidos p
  join ouvintes o on o.id = p.ouvinte_id
  where o.telefone between '5511990001144' and '5511990050238'
),
novo as (
  select id, (array['beijo','alo','abraco','outro','camiseta','premio'])[
           case when k <= 3917 then 1 when k <= 7198 then 2 when k <= 10044 then 3
                when k <= 11503 then 4 when k <= 12237 then 5 else 6 end] tipo
  from alvo
)
update pedidos p
set tipo = novo.tipo,
    conteudo = case novo.tipo
      when 'beijo' then 'Beijo para a família no ar (demo)'
      when 'alo' then 'Alô para a família no ar (demo)'
      when 'abraco' then 'Abraço para a família no ar (demo)'
      when 'camiseta' then 'Pedido de camiseta da rádio (demo)'
      when 'premio' then 'Pergunta sobre prêmio (demo)'
      else 'Recado livre do ouvinte (demo)' end,
    destinatario = case when novo.tipo in ('beijo','alo','abraco') then 'familiar (demo)' else null end
from novo
where p.id = novo.id;


-- 3. MUSICAS: o seed v4 nao criava nenhuma, e a Visao geral mostrava "9 pedidos
--    de musica" com 50 mil ouvintes. E o PASSO 5B do arquivo do seed, rodado
--    uma vez sobre o banco (INSERT so no range da demonstracao).


-- CONFERENCIA DA CORRECAO (so leitura). Distribuicao, nao so contagem.
select case when o.telefone between '5511990001144' and '5511990050238' then 'demo' else 'real' end grupo,
       'radio' conjunto, rc.nome_canonico valor, count(*) n
from radios_concorrentes rc join ouvintes o on o.id = rc.ouvinte_id group by 1, 3
union all
select case when o.telefone between '5511990001144' and '5511990050238' then 'demo' else 'real' end,
       'pedido', p.tipo, count(*)
from pedidos p join ouvintes o on o.id = p.ouvinte_id group by 1, 3
order by 1, 2, 4 desc;
-- Resultado em 13/09/2026: demo com 9 radios e 6 tipos, exatamente as
-- quantidades acima; real identico ao de antes (Nativa FM 186, Massa FM 90,
-- ... e os 3 pedidos "outro").
