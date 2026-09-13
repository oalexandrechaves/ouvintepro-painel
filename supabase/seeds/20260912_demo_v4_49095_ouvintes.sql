-- ============================================================================
-- SEED DE DEMONSTRACAO v4: 49.095 ouvintes, Radio Liverpool
-- Telefones 5511990001144 .. 5511990050238
-- (o seed antigo ocupa 5511990000001..5511990001143 e NAO e tocado aqui)
--
-- >>> RODAR EM 20 TRANSACOES, NA ORDEM. Nao cole o arquivo inteiro. <<<
-- Cada PASSO tem begin/commit proprio. Selecione um passo, rode, espere o
-- "Success", e so entao passe ao proximo.
--
--   PASSO 0            indices por ouvinte (ANTES DE TUDO)
--   PASSO 1.1 a 1.10  ouvintes, 5.000 por lote ........ 49.095 linhas
--   PASSO 2.1 a 2.5   conversas, 10.000 por lote ...... 49.095 linhas
--   PASSO 3            radio concorrente ................ 18.166 linhas
--   PASSO 4            pedidos (DEPENDE DO PASSO 2) ...... 12.764 linhas
--   PASSO 5            promocoes ........................ 7.855 linhas
--   PASSO 5B           musicas ......................... 57.724 linhas
--   PASSO 6            CONFERENCIA (so leitura)
--
-- O guarda-corpo que aborta se o range ja estiver ocupado esta SO no 1.1: nos
-- lotes seguintes ele veria as linhas que os anteriores acabaram de inserir.
-- Se um lote falhar, a transacao dele desfaz sozinha. Rode o mesmo lote de novo;
-- nao pule para o seguinte.
--
-- GRAFIA: os textos seguem EXATAMENTE a grafia que ja existe no banco ("São
-- Paulo", "Capão Redondo", "Forró", "Transamérica"). Uma versao anterior deste
-- arquivo estava sem acento e criaria "Sao Paulo" e "São Paulo" como cidades
-- diferentes nos filtros.
--
-- COBERTURA: 27 bairros em 9 zonas, 1% a 2% da populacao de cada distrito
-- (Censo 2022, aproximado). Na regiao metropolitana, bairro e nao municipio.
--   Leste 17.966 · Sul 13.954 · Norte 6.729 · Oeste 3.272 · Centro 2.481
--   Guarulhos 2.418 · Osasco 888 · Santo André 539 · São Bernardo 848
--
-- LEIA ANTES DE ACHAR QUE O PAINEL QUEBROU
-- O KPI de cadastros NAO conta so linhas em `ouvintes`: a view
-- painel_ouvintes_resumo conta DISTINCT conversas.ouvinte_id com
-- etapa='concluido'. Por isso o PASSO 2 existe.
--
-- MARCA [DEMO] em consentimento_texto, com o mesmo texto do seed antigo. TODOS
-- tem consentimento; a incompletude vem de campo faltando (4.661 sem data de
-- nascimento, 18.657 sem numero da casa).
--
-- NENHUM NUMERO REDONDO, e nao e sorte: as quantidades NAO saem de random().
-- Cada subconjunto e uma PERMUTACAO (i * primo) % 49095. Os primos
-- 4177, 4201, 4211, 4217, 4219, 4229, 4231, 4241, 4253, 4259, 4261, 4273, 4283 e
-- 4289 sao coprimos com 49095 = 3 x 5 x 1091, entao "j < N" seleciona EXATAMENTE N
-- linhas. random() so onde a quantidade nao importa (nome, idade dentro da
-- faixa, hora do dia) e SEMPRE na lista do select, avaliado por linha. NUNCA dentro
-- de `join lateral (select ... random() ...)` sem referencia a linha de fora: o
-- Postgres avalia essa subconsulta uma vez so e repete o valor em todas as linhas.
--
-- ROLLBACK: no fim do arquivo.
-- ============================================================================


-- ###########################################################################
-- PASSO 0: INDICES POR OUVINTE. RODE ANTES DE TUDO.
-- `conversas`, `radios_concorrentes` e `musicas` nao tinham indice em
-- ouvinte_id. Sem ele, com 49 mil ouvintes: o passo 4 varre conversas inteira
-- por pedido; a tela Comercial varre radios_concorrentes inteira por ouvinte a
-- cada carregamento; e o rollback varre as tabelas filhas por ouvinte apagado.
-- Aditivo e idempotente. E a mesma migration versionada no repositorio:
-- supabase/migrations/20260912230000_indices_por_ouvinte.sql
-- ###########################################################################
begin;
create index if not exists idx_conversas_ouvinte_id on public.conversas (ouvinte_id);
create index if not exists idx_radios_concorrentes_ouvinte_id on public.radios_concorrentes (ouvinte_id);
create index if not exists idx_musicas_ouvinte_id on public.musicas (ouvinte_id);
commit;


-- ###########################################################################
-- PASSO 1.1 de 10: ouvintes 1 a 5.000
-- ###########################################################################
begin;
do $$ declare n int; begin
  select count(*) into n from ouvintes where telefone between '5511990001144' and '5511990050238';
  if n > 0 then raise exception 'Range ja tem % linha(s). Abortado.', n; end if;
end $$;
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(1, 5000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.2 de 10: ouvintes 5.001 a 10.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(5001, 10000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.3 de 10: ouvintes 10.001 a 15.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(10001, 15000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.4 de 10: ouvintes 15.001 a 20.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(15001, 20000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.5 de 10: ouvintes 20.001 a 25.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(20001, 25000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.6 de 10: ouvintes 25.001 a 30.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(25001, 30000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.7 de 10: ouvintes 30.001 a 35.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(30001, 35000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.8 de 10: ouvintes 35.001 a 40.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(35001, 40000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.9 de 10: ouvintes 40.001 a 45.000
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(40001, 45000) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 1.10 de 10: ouvintes 45.001 a 49.095
-- ###########################################################################
begin;
-- (guarda-corpo so no lote 1.1)
with cfg as (select 'c9d8a503-fbc3-4c31-85d8-ae2278bb9f67'::uuid as radio_id),
arr as (
  select
    array['Ana','Carlos','Fernanda','Roberto','Juliana','Marcos','Patrícia','Eduardo',
          'Camila','Rafael','Simone','Anderson','Vanessa','Thiago','Letícia','Bruno',
          'Aline','Rodrigo','Priscila','Gustavo','Daniela','Felipe','Renata','Marcelo',
          'Tatiane','Leandro','Cristiane','Diego','Sandra','Vinícius','Elaine','Wesley',
          'Josefa','Ronaldo','Luciana','Alexandre','Mônica','Fábio','Adriana','Sérgio'] as pnome,
    array['Silva','Santos','Oliveira','Souza','Pereira','Costa','Rodrigues','Almeida',
          'Nascimento','Lima','Araújo','Fernandes','Carvalho','Gomes','Martins','Rocha',
          'Ribeiro','Alves','Monteiro','Barbosa','Cardoso','Teixeira','Correia','Dias',
          'Moreira','Cavalcanti','Batista','Freitas','Pinto','Ramos','Macedo','Vieira'] as snome,
    array['Sertanejo','Sertanejo','Sertanejo','Sertanejo','Sertanejo Universitário',
          'Sertanejo Universitário','Sertanejo Raiz','Forró','Pagode','Agronejo',
          'Piseiro','Gospel','Rock'] as estilos,
    -- PROGRAMAS E LOCUTORES SAO FICTICIOS. Nao existe grade real da Liverpool no
    -- banco. TROCAR quando a radio informar a grade de verdade.
    array['Manhã Liverpool','Tarde Sertaneja','Vozes da Noite','Domingo no Rádio',
          'Locutor Gustavo','Locutora Adriana'] as programas,
    array['Sapopemba','Itaim Paulista','Cidade Tiradentes','Itaquera','Penha','Tatuapé','Mooca','Grajaú','Jardim Ângela','Capão Redondo','Ipiranga','Santo Amaro','Brasilândia','Santana','Tucuruvi','Pinheiros','Lapa','Butantã','Bela Vista','República','Sé','Pimentas','Vila Galvão','Presidente Altino','Km 18','Vila Assunção','Rudge Ramos'] as b_nome,
    array['Leste','Leste','Leste','Leste','Leste','Leste','Leste','Sul','Sul','Sul','Sul','Sul','Norte','Norte','Norte','Oeste','Oeste','Oeste','Centro','Centro','Centro','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo'] as b_zona,
    array['São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','São Paulo','Guarulhos','Guarulhos','Osasco','Osasco','Santo André','São Bernardo do Campo'] as b_cidade
),
base as (
  select i,
    '5511990' || lpad((1143 + i)::text, 6, '0') as telefone,
    case
      when i <=  4638 then  1   -- Sapopemba         Leste          4638
      when i <=  7730 then  2   -- Itaim Paulista    Leste          3092
      when i <= 10839 then  3   -- Cidade Tiradentes Leste          3109
      when i <= 13382 then  4   -- Itaquera          Leste          2543
      when i <= 15376 then  5   -- Penha             Leste          1994
      when i <= 16898 then  6   -- Tatuapé           Leste          1522
      when i <= 17966 then  7   -- Mooca             Leste          1068
      when i <= 22007 then  8   -- Grajaú            Sul            4041
      when i <= 25523 then  9   -- Jardim Ângela     Sul            3516
      when i <= 28990 then 10   -- Capão Redondo     Sul            3467
      when i <= 30832 then 11   -- Ipiranga          Sul            1842
      when i <= 31920 then 12   -- Santo Amaro       Sul            1088
      when i <= 35473 then 13   -- Brasilândia       Norte          3553
      when i <= 37386 then 14   -- Santana           Norte          1913
      when i <= 38649 then 15   -- Tucuruvi          Norte          1263
      when i <= 39852 then 16   -- Pinheiros         Oeste          1203
      when i <= 40875 then 17   -- Lapa              Oeste          1023
      when i <= 41921 then 18   -- Butantã           Oeste          1046
      when i <= 43109 then 19   -- Bela Vista        Centro         1188
      when i <= 43957 then 20   -- República         Centro          848
      when i <= 44402 then 21   -- Sé                Centro          445
      when i <= 46125 then 22   -- Pimentas          Guarulhos      1723
      when i <= 46820 then 23   -- Vila Galvão       Guarulhos       695
      when i <= 47234 then 24   -- Presidente Altino Osasco          414
      when i <= 47708 then 25   -- Km 18             Osasco          474
      when i <= 48247 then 26   -- Vila Assunção     Santo André     539
      when i <= 49095 then 27   -- Rudge Ramos       São Bernardo    848
    end as loc,
    ((i * 4177) % 49095) as j_faixa,
    ((i * 4201) % 49095) as j_data,
    ((i * 4211) % 49095) as j_numero,
    ((i * 4231) % 49095) as j_estilo,
    ((i * 4241) % 49095) as j_programa
  from generate_series(45001, 49095) i
),
perfil as (
  select b.*,
    case
      when b.j_faixa < 4661 then null   -- 4.661 sem data de nascimento
      when b.j_faixa <=  5148 then  1   --   488
      when b.j_faixa <=  6303 then  2   --  1155
      when b.j_faixa <=  9058 then  3   --  2755
      when b.j_faixa <= 13812 then  4   --  4754
      when b.j_faixa <= 20921 then  5   --  7109
      when b.j_faixa <= 28832 then  6   --  7911
      when b.j_faixa <= 35897 then  7   --  7065
      when b.j_faixa <= 41496 then  8   --  5599
      when b.j_faixa <= 45317 then  9   --  3821
      when b.j_faixa <= 47583 then 10   --  2266
      when b.j_faixa <= 49094 then 11   --  1511
    end as faixa
  from base b
),
comdata as (
  select p.*,
    case when p.faixa is null then null
         when p.faixa = 11 then (60 + floor(random() * 19))::int
         else (10 + (p.faixa - 1) * 5 + floor(random() * 5))::int end as idade,
    -- 10.801 nos ultimos 30 dias, os outros 38.294 espalhados no ano.
    case when p.j_data < 10801
         then now() - (floor(random() * 30) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
         else now() - (31 + floor(random() * 334) || ' days')::interval - (floor(random() * 24) || ' hours')::interval
    end as contato_em
  from perfil p
)
insert into ouvintes (
  radio_id, telefone, ddd, nome, bairro, zona, cidade, estado,
  data_nascimento, idade, faixa_etaria, participacoes,
  primeiro_contato_em, ultimo_contato_em,
  estilo_musical, programa_locutor, numero, consentimento_em, consentimento_texto)
select cfg.radio_id, c.telefone, '11',
  a.pnome[1 + floor(array_length(a.pnome,1) * random())::int] || ' ' ||
    a.snome[1 + floor(array_length(a.snome,1) * random())::int],
  a.b_nome[c.loc], a.b_zona[c.loc], a.b_cidade[c.loc], 'SP',
  case when c.idade is null then null
       else (current_date - (c.idade || ' years')::interval - (floor(random() * 360) || ' days')::interval)::date end,
  c.idade, c.faixa, 0,
  c.contato_em, c.contato_em + (floor(random() * 48) || ' hours')::interval,
  case when c.j_estilo >= 4418 then a.estilos[1 + floor(array_length(a.estilos,1) * random())::int] else null end,
  case when c.j_programa < 27493 then a.programas[1 + floor(array_length(a.programas,1) * random())::int] else null end,
  case when c.j_numero < 30438 then (10 + floor(random() * 1900))::int::text else null end,
  c.contato_em + interval '3 minutes',
  '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
from comdata c cross join cfg cross join arr a;
commit;


-- ###########################################################################
-- PASSO 2.1 de 5: conversas dos ouvintes 1 a 10.000
-- SEM ISTO O DASHBOARD NAO MEXE.
-- ###########################################################################
begin;
insert into conversas (radio_id, ouvinte_id, status, etapa, iniciada_em, ultima_atividade_em, encerrada_em, contexto)
select o.radio_id, o.id, 'encerrada', 'concluido',
       o.primeiro_contato_em, o.ultimo_contato_em, o.ultimo_contato_em,
       '{"flags": {"concluido": true}, "historico": []}'::jsonb
from ouvintes o
where o.telefone between '5511990001144' and '5511990011143';
commit;


-- ###########################################################################
-- PASSO 2.2 de 5: conversas dos ouvintes 10.001 a 20.000
-- SEM ISTO O DASHBOARD NAO MEXE.
-- ###########################################################################
begin;
insert into conversas (radio_id, ouvinte_id, status, etapa, iniciada_em, ultima_atividade_em, encerrada_em, contexto)
select o.radio_id, o.id, 'encerrada', 'concluido',
       o.primeiro_contato_em, o.ultimo_contato_em, o.ultimo_contato_em,
       '{"flags": {"concluido": true}, "historico": []}'::jsonb
from ouvintes o
where o.telefone between '5511990011144' and '5511990021143';
commit;


-- ###########################################################################
-- PASSO 2.3 de 5: conversas dos ouvintes 20.001 a 30.000
-- SEM ISTO O DASHBOARD NAO MEXE.
-- ###########################################################################
begin;
insert into conversas (radio_id, ouvinte_id, status, etapa, iniciada_em, ultima_atividade_em, encerrada_em, contexto)
select o.radio_id, o.id, 'encerrada', 'concluido',
       o.primeiro_contato_em, o.ultimo_contato_em, o.ultimo_contato_em,
       '{"flags": {"concluido": true}, "historico": []}'::jsonb
from ouvintes o
where o.telefone between '5511990021144' and '5511990031143';
commit;


-- ###########################################################################
-- PASSO 2.4 de 5: conversas dos ouvintes 30.001 a 40.000
-- SEM ISTO O DASHBOARD NAO MEXE.
-- ###########################################################################
begin;
insert into conversas (radio_id, ouvinte_id, status, etapa, iniciada_em, ultima_atividade_em, encerrada_em, contexto)
select o.radio_id, o.id, 'encerrada', 'concluido',
       o.primeiro_contato_em, o.ultimo_contato_em, o.ultimo_contato_em,
       '{"flags": {"concluido": true}, "historico": []}'::jsonb
from ouvintes o
where o.telefone between '5511990031144' and '5511990041143';
commit;


-- ###########################################################################
-- PASSO 2.5 de 5: conversas dos ouvintes 40.001 a 49.095
-- SEM ISTO O DASHBOARD NAO MEXE.
-- ###########################################################################
begin;
insert into conversas (radio_id, ouvinte_id, status, etapa, iniciada_em, ultima_atividade_em, encerrada_em, contexto)
select o.radio_id, o.id, 'encerrada', 'concluido',
       o.primeiro_contato_em, o.ultimo_contato_em, o.ultimo_contato_em,
       '{"flags": {"concluido": true}, "historico": []}'::jsonb
from ouvintes o
where o.telefone between '5511990041144' and '5511990050238';
commit;


-- ###########################################################################
-- PASSO 3: radio concorrente, exatamente 18.166 ouvintes (1 linha cada).
-- Deixa 30.929 que NAO ouvem outra radio (o destaque do Comercial).
-- nome_canonico casa EXATAMENTE com os valores ja existentes.
--
-- A RADIO TAMBEM SAI POR PERMUTACAO, NUNCA POR SORTEIO EM SUBCONSULTA.
-- A primeira versao deste passo sorteava com random() dentro de um
-- `join lateral (select ...)` sem referencia a linha de fora. O Postgres calcula
-- uma subconsulta assim UMA vez e repete o resultado: as 18.166 linhas sairam
-- todas "Alpha FM". Corrigido no banco por UPDATE em 13/09/2026
-- (supabase/seeds/20260913_correcao_seed_v4.sql); este passo ja nasce certo.
-- Cada ouvinte recebe a posicao k pela permutacao com o primo 4253, e a radio sai
-- da faixa em que k cai. A curva segue a proporcao real que ja existia na base:
--   Nativa FM 5.897 · Massa FM 2.853 · Jovem Pan 1.617 · Band FM 1.554
--   Mundo Livre FM 1.489 · Transamérica 1.363 · Alpha FM 1.173 · Kiss FM 1.141
--   105 FM 1.079
-- ###########################################################################
begin;
insert into radios_concorrentes (radio_id, ouvinte_id, nome_radio, nome_canonico, criado_em)
select s.radio_id, s.id, s.nome, s.nome,
       s.primeiro_contato_em + (floor(random() * 72) || ' hours')::interval
from (
  select o.radio_id, o.id, o.primeiro_contato_em,
         (array['Nativa FM','Massa FM','Jovem Pan','Band FM','Mundo Livre FM',
                'Transamérica','Alpha FM','Kiss FM','105 FM'])[
           case when p.k <= 5897 then 1 when p.k <= 8750 then 2 when p.k <= 10367 then 3
                when p.k <= 11921 then 4 when p.k <= 13410 then 5 when p.k <= 14773 then 6
                when p.k <= 15946 then 7 when p.k <= 17087 then 8 else 9 end] as nome
  from ouvintes o
  join (
    select id, row_number() over (order by ((substring(telefone from 8)::int - 1143) * 4253) % 49095) as k
    from ouvintes
    where telefone between '5511990001144' and '5511990050238'
      and ((substring(telefone from 8)::int - 1143) * 4217) % 49095 < 18166
  ) p on p.id = o.id
) s;
commit;


-- ###########################################################################
-- PASSO 4: pedidos, exatamente 12.764 ouvintes. DEPENDE DO PASSO 2.
--
-- SO O VOCABULARIO QUE O BOT GRAVA EM `pedidos`: beijo, alo, abraco, camiseta,
-- premio e outro. Musica NAO entra aqui: o bot manda pedido de musica para a
-- tabela `musicas` (PASSO 5B) e promocao para `promocao_participacoes`. A
-- primeira versao deste passo gravava "musica" em `pedidos`, e o sorteio em
-- `join lateral` saiu constante (12.764 linhas "musica"). Corrigido por UPDATE em
-- 13/09/2026. A demonstracao tem que ter o formato que a instancia da radio vai
-- produzir, senao o cliente ve na reuniao um dado que o sistema dele nunca gera.
--   beijo 3.917 · alo 3.281 · abraco 2.846 · outro 1.459 · camiseta 734 · premio 527
-- ###########################################################################
begin;
insert into pedidos (radio_id, ouvinte_id, conversa_id, tipo, conteudo, destinatario, criado_em)
select s.radio_id, s.id, s.conversa_id, s.tipo,
       case s.tipo
         when 'beijo' then 'Beijo para a família no ar (demo)'
         when 'alo' then 'Alô para a família no ar (demo)'
         when 'abraco' then 'Abraço para a família no ar (demo)'
         when 'camiseta' then 'Pedido de camiseta da rádio (demo)'
         when 'premio' then 'Pergunta sobre prêmio (demo)'
         else 'Recado livre do ouvinte (demo)' end,
       case when s.tipo in ('beijo','alo','abraco') then 'familiar (demo)' else null end,
       s.primeiro_contato_em + (floor(random() * 96) || ' hours')::interval
from (
  select o.radio_id, o.id, o.primeiro_contato_em, cv.id as conversa_id,
         (array['beijo','alo','abraco','outro','camiseta','premio'])[
           case when p.k <= 3917 then 1 when p.k <= 7198 then 2 when p.k <= 10044 then 3
                when p.k <= 11503 then 4 when p.k <= 12237 then 5 else 6 end] as tipo
  from ouvintes o
  join (
    select id, row_number() over (order by ((substring(telefone from 8)::int - 1143) * 4259) % 49095) as k
    from ouvintes
    where telefone between '5511990001144' and '5511990050238'
      and ((substring(telefone from 8)::int - 1143) * 4219) % 49095 < 12764
  ) p on p.id = o.id
  -- A conversa de cada ouvinte vem de UMA leitura com hash join, e nao de uma
  -- subconsulta por pedido (que varria `conversas` inteira a cada linha).
  left join (
    select distinct on (c.ouvinte_id) c.ouvinte_id, c.id
    from conversas c
    join ouvintes o2 on o2.id = c.ouvinte_id
    where o2.telefone between '5511990001144' and '5511990050238'
    order by c.ouvinte_id, c.iniciada_em
  ) cv on cv.ouvinte_id = o.id
) s;
commit;


-- ###########################################################################
-- PASSO 5: participacoes em promocao, exatamente 7.855 ouvintes.
-- ###########################################################################
begin;
insert into promocao_participacoes (radio_id, ouvinte_id, promocao_nome, criado_em)
select o.radio_id, o.id,
       (array['festajunina','vempralive','sextasertaneja','showdopeao'])[1 + floor(4 * random())::int],
       o.primeiro_contato_em + (floor(random() * 120) || ' hours')::interval
from ouvintes o
where o.telefone between '5511990001144' and '5511990050238'
  and ((substring(o.telefone from 8)::int - 1143) * 4229) % 49095 < 7855;
commit;


-- ###########################################################################
-- PASSO 5B: musicas. 57.724 linhas, uma ou duas por ouvinte.
--
-- O FORMATO E O QUE O BOT GRAVA HOJE (gravarMusica, na edge function):
--  - pedido de musica: sentimento "ama", titulo e artista, nome = titulo,
--    texto_original = "Titulo - Artista";
--  - pedido so de cantor ("qualquer uma do fulano"): "ama" so com artista;
--  - quem recusa pedir: sentimento "sem_preferencia", nome "Sem preferência",
--    sem titulo nem artista (nao conta como musica no painel);
--  - "rejeita" NAO entra: o bot atual nao grava rejeicao.
-- Todo ouvinte do seed tem conversa concluida, e o roteiro so conclui depois do
-- passo da musica; por isso TODOS tem exatamente uma linha de primeiro pedido.
--
--   primeiro pedido com titulo ..... 36.766
--   primeiro pedido so de cantor ...  5.947
--   sem preferencia ................  6.382   (soma 49.095, um por ouvinte)
--   pedido repetido depois .........  8.629   (sempre com titulo)
--   total ......................... 57.724 · 58 titulos · 40 artistas
--
-- QUANTIDADE EXATA POR MUSICA, SEM SORTEIO: cada forma e escolhida por
-- permutacao (primos 4261 e 4273) e cada linha recebe a posicao k (primos 4283
-- e 4289); a musica e a faixa do catalogo em que k cai. Catalogo real, perfil
-- sertanejo da base, curva decrescente: a mais pedida tem 9,7% dos pedidos com
-- titulo. Datas: primeiro pedido 4 a 11 minutos depois do primeiro contato (o
-- consentimento e aos 3); repetido de 1 a 44 dias depois, nunca no futuro e
-- nunca antes do primeiro contato.
-- ###########################################################################
begin;
with cat_tit(ordem, artista, titulo, qtd) as (
  values
    (1, 'Henrique & Juliano', 'Liberdade Provisória', 4419),
    (2, 'Marília Mendonça', 'Infiel', 2877),
    (3, 'Gusttavo Lima', 'Bloqueado', 2237),
    (4, 'Zé Neto & Cristiano', 'Notificação Preferida', 1871),
    (5, 'Jorge & Mateus', 'Propaganda', 1629),
    (6, 'Maiara & Maraisa', 'Medo Bobo', 1457),
    (7, 'Henrique & Juliano', 'Recaídas', 1323),
    (8, 'Marília Mendonça', 'Supera', 1218),
    (9, 'Simone Mendes', 'Erro Gostoso', 1132),
    (10, 'Luan Santana', 'Meteoro', 1059),
    (11, 'Gusttavo Lima', 'Termina Comigo Antes', 1001),
    (12, 'Matheus & Kauan', 'Que Sorte a Nossa', 947),
    (13, 'Chitãozinho & Xororó', 'Evidências', 901),
    (14, 'Zé Neto & Cristiano', 'Largado às Traças', 861),
    (15, 'Ana Castela', 'Nosso Quadro', 825),
    (16, 'Jorge & Mateus', 'Os Anjos Cantam', 792),
    (17, 'Marília Mendonça', 'Todo Mundo Vai Sofrer', 763),
    (18, 'Israel & Rodolffo', 'Batom de Cereja', 737),
    (19, 'Hugo & Guilherme', 'Mal Feito', 712),
    (20, 'Bruno & Marrone', 'Dormi na Praça', 689),
    (21, 'Maiara & Maraisa', '10%', 669),
    (22, 'Gusttavo Lima', 'Zé da Recaída', 651),
    (23, 'Zezé Di Camargo & Luciano', 'É o Amor', 633),
    (24, 'Henrique & Juliano', 'Até Você Voltar', 616),
    (25, 'Luan Santana', 'Acordando o Prédio', 601),
    (26, 'Wesley Safadão', 'Camarote', 586),
    (27, 'João Gomes', 'Meu Pedaço de Pecado', 573),
    (28, 'Barões da Pisadinha', 'Recairei', 559),
    (29, 'Leandro & Leonardo', 'Entre Tapas e Beijos', 549),
    (30, 'Gustavo Mioto', 'Anti-Amor', 537),
    (31, 'Victor & Leo', 'Borboletas', 526),
    (32, 'Lauana Prado', 'Cobaia', 516),
    (33, 'Felipe Araújo', 'Atrasadinha', 506),
    (34, 'Menos é Mais', 'Melhor Eu Ir', 497),
    (35, 'Guilherme & Benuto', 'Haja Colírio', 488),
    (36, 'Milionário & José Rico', 'Estrada da Vida', 479),
    (37, 'Ana Castela', 'Solteiro Forçado', 471),
    (38, 'Paula Fernandes', 'Pássaro de Fogo', 463),
    (39, 'César Menotti & Fabiano', 'Leilão', 456),
    (40, 'Chitãozinho & Xororó', 'Fio de Cabelo', 449),
    (41, 'Bruno & Marrone', 'Choram as Rosas', 442),
    (42, 'Cristiano Araújo', 'Caso Indefinido', 436),
    (43, 'Leandro & Leonardo', 'Pense em Mim', 429),
    (44, 'Jorge & Mateus', 'Sosseguei', 423),
    (45, 'Raça Negra', 'Cheia de Manias', 417),
    (46, 'Zezé Di Camargo & Luciano', 'No Dia em que Eu Saí de Casa', 412),
    (47, 'Fernando & Sorocaba', 'Paga Pau', 406),
    (48, 'Daniel', 'Adoro Amar Você', 401),
    (49, 'Victor & Leo', 'Deus e Eu no Sertão', 396),
    (50, 'Aline Barros', 'Ressuscita-me', 391),
    (51, 'Almir Sater', 'Tocando em Frente', 386),
    (52, 'Tião Carreiro & Pardinho', 'Rio de Lágrimas', 382),
    (53, 'Sérgio Reis', 'Menino da Porteira', 377),
    (54, 'Anderson Freire', 'Raridade', 373),
    (55, 'Paula Fernandes', 'Jeito de Mato', 368),
    (56, 'Legião Urbana', 'Tempo Perdido', 364),
    (57, 'Roberta Miranda', 'A Majestade, o Sabiá', 359),
    (58, 'Skank', 'Ainda Gosto Dela', 358)
),
cat_tit_lim as (
  select artista, titulo, sum(qtd) over (order by ordem) - qtd as de, sum(qtd) over (order by ordem) as ate
  from cat_tit
),
cat_art(ordem, artista, qtd) as (
  values
    (1, 'Henrique & Juliano', 984),
    (2, 'Marília Mendonça', 565),
    (3, 'Gusttavo Lima', 409),
    (4, 'Jorge & Mateus', 325),
    (5, 'Zé Neto & Cristiano', 271),
    (6, 'Maiara & Maraisa', 235),
    (7, 'Luan Santana', 207),
    (8, 'Chitãozinho & Xororó', 186),
    (9, 'Ana Castela', 169),
    (10, 'Simone Mendes', 157),
    (11, 'Bruno & Marrone', 144),
    (12, 'Zezé Di Camargo & Luciano', 135),
    (13, 'Leandro & Leonardo', 126),
    (14, 'Matheus & Kauan', 119),
    (15, 'Victor & Leo', 113),
    (16, 'Paula Fernandes', 107),
    (17, 'Israel & Rodolffo', 102),
    (18, 'Hugo & Guilherme', 97),
    (19, 'Wesley Safadão', 93),
    (20, 'João Gomes', 89),
    (21, 'Barões da Pisadinha', 87),
    (22, 'Gustavo Mioto', 83),
    (23, 'Lauana Prado', 79),
    (24, 'Felipe Araújo', 78),
    (25, 'Menos é Mais', 75),
    (26, 'Guilherme & Benuto', 73),
    (27, 'Milionário & José Rico', 69),
    (28, 'César Menotti & Fabiano', 68),
    (29, 'Cristiano Araújo', 67),
    (30, 'Raça Negra', 66),
    (31, 'Fernando & Sorocaba', 63),
    (32, 'Daniel', 62),
    (33, 'Aline Barros', 59),
    (34, 'Almir Sater', 59),
    (35, 'Tião Carreiro & Pardinho', 58),
    (36, 'Sérgio Reis', 56),
    (37, 'Anderson Freire', 55),
    (38, 'Legião Urbana', 54),
    (39, 'Roberta Miranda', 52),
    (40, 'Skank', 51)
),
cat_art_lim as (
  select artista, sum(qtd) over (order by ordem) - qtd as de, sum(qtd) over (order by ordem) as ate
  from cat_art
),
base as (
  select o.id as ouvinte_id, o.radio_id, o.primeiro_contato_em,
         substring(o.telefone from 8)::int - 1143 as i
  from ouvintes o
  where o.telefone between '5511990001144' and '5511990050238'
),
eventos as (
  select b.*,
         case when (b.i * 4261) % 49095 < 6382 then 'sem_pref'
              when (b.i * 4261) % 49095 < 12329 then 'so_cantor'
              else 'titulo' end as forma,
         false as repetido,
         (b.i * 4283) % 49095 as chave
  from base b
  union all
  select b.*, 'titulo', true, (b.i * 4289) % 49095
  from base b
  where (b.i * 4273) % 49095 < 8629
),
numerados as (
  select e.*, row_number() over (partition by e.forma order by e.chave, e.repetido) as k
  from eventos e
),
linhas as (
  select n.radio_id, n.ouvinte_id, n.forma, n.repetido,
    case n.forma when 'sem_pref' then 'Sem preferência' when 'so_cantor' then ca.artista else ct.titulo end as nome,
    case n.forma when 'sem_pref' then 'sem_preferencia' else 'ama' end as sentimento,
    case when n.repetido
         then greatest(n.primeiro_contato_em + interval '20 minutes',
                       least(now() - interval '1 minute',
                             n.primeiro_contato_em + ((1 + n.i % 44) || ' days')::interval + ((n.i % 13) || ' hours')::interval))
         else n.primeiro_contato_em + ((4 + n.i % 8) || ' minutes')::interval end as criado_em,
    case n.forma when 'sem_pref' then 'Sem preferência' when 'so_cantor' then ca.artista
         else ct.titulo || ' - ' || ct.artista end as texto_original,
    case n.forma when 'sem_pref' then null when 'so_cantor' then ca.artista else ct.artista end as artista,
    case n.forma when 'titulo' then ct.titulo else null end as titulo
  from numerados n
  left join cat_tit_lim ct on n.forma = 'titulo' and n.k > ct.de and n.k <= ct.ate
  left join cat_art_lim ca on n.forma = 'so_cantor' and n.k > ca.de and n.k <= ca.ate
)
insert into musicas (radio_id, ouvinte_id, nome, sentimento, criado_em, texto_original, artista, titulo)
select radio_id, ouvinte_id, nome, sentimento, criado_em, texto_original, artista, titulo
from linhas;
commit;


-- ###########################################################################
-- PASSO 6: CONFERENCIA (so leitura). A coluna `redondo` tem que estar toda em
-- false, e os valores tem que bater com os esperados ao lado.
-- ###########################################################################
with r as (
  select 'total de ouvintes' k, count(*) v from ouvintes where telefone between '5511990001144' and '5511990050238'
  union all select 'nos ultimos 30 dias', count(*) from ouvintes
   where telefone between '5511990001144' and '5511990050238' and primeiro_contato_em >= now() - interval '30 days'
  union all select 'com numero (endereco parcial)', count(*) from ouvintes
   where telefone between '5511990001144' and '5511990050238' and numero is not null
  union all select 'sem data de nascimento', count(*) from ouvintes
   where telefone between '5511990001144' and '5511990050238' and data_nascimento is null
  union all select 'conversas concluido', count(*) from conversas c join ouvintes o on o.id=c.ouvinte_id
   where o.telefone between '5511990001144' and '5511990050238' and c.etapa='concluido'
  union all select 'com radio concorrente', count(distinct rc.ouvinte_id) from radios_concorrentes rc
   join ouvintes o on o.id=rc.ouvinte_id where o.telefone between '5511990001144' and '5511990050238'
  union all select 'NAO ouvem outra radio', count(*) from ouvintes o
   where o.telefone between '5511990001144' and '5511990050238'
     and not exists (select 1 from radios_concorrentes rc where rc.ouvinte_id=o.id)
  union all select 'com pedido', count(distinct p.ouvinte_id) from pedidos p join ouvintes o on o.id=p.ouvinte_id
   where o.telefone between '5511990001144' and '5511990050238'
  union all select 'com promocao', count(distinct pp.ouvinte_id) from promocao_participacoes pp
   join ouvintes o on o.id=pp.ouvinte_id where o.telefone between '5511990001144' and '5511990050238'
  union all select 'zona: ' || zona, count(*) from ouvintes
   where telefone between '5511990001144' and '5511990050238' group by zona
  union all select 'bairro: ' || bairro, count(*) from ouvintes
   where telefone between '5511990001144' and '5511990050238' group by bairro
  union all select 'faixa ' || lpad(faixa_etaria::text,2,'0'), count(*) from ouvintes
   where telefone between '5511990001144' and '5511990050238' and faixa_etaria is not null group by faixa_etaria
)
select k as metrica, v as valor, (v % 10 = 0) as redondo from r order by 1;

-- Esperado: total 49.095 · ultimos 30 dias 10.801 (pode variar se o
-- seed for rodado em dias diferentes, porque "30 dias" anda com o relogio) ·
-- com numero 30.438 · sem data 4.661 · conversas 49.095 ·
-- com radio 18.166 · nao ouvem outra 30.929 · pedido 12.764 · promocao 7.855

-- DISTRIBUICAO, E NAO SO CONTAGEM. A conferencia da primeira versao olhava so
-- totais, e deixou passar 18.166 radios iguais e 12.764 pedidos iguais. Aqui cada
-- conjunto sorteado mostra quantos valores distintos tem e quantos em cada um.
select 'radio' conjunto, rc.nome_canonico valor, count(*) n
from radios_concorrentes rc join ouvintes o on o.id = rc.ouvinte_id
where o.telefone between '5511990001144' and '5511990050238' group by 2
union all select 'pedido', p.tipo, count(*)
from pedidos p join ouvintes o on o.id = p.ouvinte_id
where o.telefone between '5511990001144' and '5511990050238' group by 2
union all select 'promocao', pp.promocao_nome, count(*)
from promocao_participacoes pp join ouvintes o on o.id = pp.ouvinte_id
where o.telefone between '5511990001144' and '5511990050238' group by 2
union all select 'musica: forma', m.sentimento || case when m.titulo is null and m.artista is not null then ' (so cantor)' else '' end, count(*)
from musicas m join ouvintes o on o.id = m.ouvinte_id
where o.telefone between '5511990001144' and '5511990050238' group by 2
union all select 'estilo', estilo_musical, count(*) from ouvintes
where telefone between '5511990001144' and '5511990050238' group by 2
union all select 'programa', programa_locutor, count(*) from ouvintes
where telefone between '5511990001144' and '5511990050238' group by 2
order by 1, 3 desc;

-- Esperado: radio 9 valores (Nativa FM 5.897 ... 105 FM 1.079) · pedido 6 valores
-- (beijo 3.917 ... premio 527) · musica ama 51.342 (5.947 so cantor) e
-- sem_preferencia 6.382. Nenhum conjunto com um valor so.
select 'musica: titulos distintos' k, count(distinct m.titulo) v
from musicas m join ouvintes o on o.id = m.ouvinte_id
where o.telefone between '5511990001144' and '5511990050238'
union all select 'musica: artistas distintos', count(distinct m.artista)
from musicas m join ouvintes o on o.id = m.ouvinte_id
where o.telefone between '5511990001144' and '5511990050238'
union all select 'musica: maior titulo', max(n) from (
  select count(*) n from musicas m join ouvintes o on o.id = m.ouvinte_id
  where o.telefone between '5511990001144' and '5511990050238' and m.titulo is not null group by m.titulo) x;
-- Esperado: 58 · 40 · 4.419

-- Coerencias, todas tem que dar zero:
select 'faixa incoerente com a idade' k, count(*) v from ouvintes
 where telefone between '5511990001144' and '5511990050238' and idade is not null
   and faixa_etaria is distinct from least(11, greatest(1, (floor((idade - 10) / 5.0) + 1)::int))
union all select 'sem marca [DEMO]', count(*) from ouvintes
 where telefone between '5511990001144' and '5511990050238' and coalesce(consentimento_texto,'') not like '[DEMO]%'
union all select 'sem consentimento_em', count(*) from ouvintes
 where telefone between '5511990001144' and '5511990050238' and consentimento_em is null
union all select 'ouvinte sem conversa', count(*) from ouvintes o
 where o.telefone between '5511990001144' and '5511990050238'
   and not exists (select 1 from conversas c where c.ouvinte_id=o.id)
union all select 'cidade incoerente com a zona', count(*) from ouvintes
 where telefone between '5511990001144' and '5511990050238'
   and ((zona in ('Leste','Sul','Norte','Oeste','Centro') and cidade <> 'São Paulo')
     or (zona not in ('Leste','Sul','Norte','Oeste','Centro') and cidade = 'São Paulo'))
union all select 'grafia sem acento criada pelo seed', count(*) from ouvintes
 where telefone between '5511990001144' and '5511990050238'
   and (cidade in ('Sao Paulo','Santo Andre','Sao Bernardo do Campo')
     or zona in ('Santo Andre','Sao Bernardo')
     or bairro in ('Tatuape','Grajau','Capao Redondo','Jardim Angela','Brasilandia','Butanta','Republica','Se'));


-- ============================================================================
-- ROLLBACK. Apaga EXATAMENTE este lote e nada alem dele. O range comeca em
-- ...001144, entao o seed antigo, a Sara (5511960135811) e qualquer ouvinte real
-- ficam INTOCADOS. Cascade leva conversas, mensagens, musicas,
-- radios_concorrentes, pedidos, promocao_participacoes e promocao_ganhadores.
-- NAO leva `interpretacoes` nem `hotlinks` (ON DELETE SET NULL); este seed nao
-- cria nenhuma das duas. Com 49.095 ouvintes o delete pode dar timeout: nesse
-- caso troque o between por faixas de 10 mil telefones e rode uma por vez.
--
-- begin;
-- select count(*) as vai_apagar from ouvintes
--  where radio_id='c9d8a503-fbc3-4c31-85d8-ae2278bb9f67' and telefone between '5511990001144' and '5511990050238';   -- espera 49095
-- delete from ouvintes
--  where radio_id='c9d8a503-fbc3-4c31-85d8-ae2278bb9f67' and telefone between '5511990001144' and '5511990050238';
-- select count(*) as devem_sobrar_0 from ouvintes
--  where telefone between '5511990001144' and '5511990050238';                          -- espera 0
-- select count(*) as seed_antigo_1143 from ouvintes
--  where telefone between '5511990000001' and '5511990001143';           -- espera 1143
-- select count(*) as sara_intacta from ouvintes
--  where telefone='5511960135811';                                         -- espera 1
-- commit;
-- ============================================================================
