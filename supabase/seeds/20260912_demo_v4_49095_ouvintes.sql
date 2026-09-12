-- ============================================================================
-- SEED DE DEMONSTRACAO v4: 49.095 ouvintes, Radio Liverpool
-- Telefones 5511990001144 .. 5511990050238
-- (o seed antigo ocupa 5511990000001..5511990001143 e NAO e tocado aqui)
--
-- >>> RODAR EM 19 TRANSACOES, NA ORDEM. Nao cole o arquivo inteiro. <<<
-- Cada PASSO tem begin/commit proprio. Selecione um passo, rode, espere o
-- "Success", e so entao passe ao proximo.
--
--   PASSO 0            indices por ouvinte (ANTES DE TUDO)
--   PASSO 1.1 a 1.10  ouvintes, 5.000 por lote ........ 49.095 linhas
--   PASSO 2.1 a 2.5   conversas, 10.000 por lote ...... 49.095 linhas
--   PASSO 3            radio concorrente ................ 18.166 linhas
--   PASSO 4            pedidos (DEPENDE DO PASSO 2) ...... 12.764 linhas
--   PASSO 5            promocoes ........................ 7.855 linhas
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
-- 4177, 4201, 4211, 4217, 4219, 4229, 4231, 4241 sao coprimos com 49095 = 3 x 5 x 1091,
-- entao "j < N" seleciona EXATAMENTE N linhas. random() so onde a quantidade nao
-- importa: nome, idade dentro da faixa, hora do dia.
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
create index if not exists idx_conversas_ouvinte on public.conversas (ouvinte_id);
create index if not exists idx_radios_concorrentes_ouvinte on public.radios_concorrentes (ouvinte_id);
create index if not exists idx_musicas_ouvinte on public.musicas (ouvinte_id);
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
-- ###########################################################################
begin;
insert into radios_concorrentes (radio_id, ouvinte_id, nome_radio, nome_canonico, criado_em)
select o.radio_id, o.id, r.nome, r.nome,
       o.primeiro_contato_em + (floor(random() * 72) || ' hours')::interval
from ouvintes o
join lateral (
  select (array['Nativa FM','Nativa FM','Nativa FM','Massa FM','Massa FM','Jovem Pan',
                'Band FM','Mundo Livre FM','Transamérica','Alpha FM','Alpha FM',
                'Kiss FM','105 FM'])[1 + floor(13 * random())::int] as nome
) r on true
where o.telefone between '5511990001144' and '5511990050238'
  and ((substring(o.telefone from 8)::int - 1143) * 4217) % 49095 < 18166;
commit;


-- ###########################################################################
-- PASSO 4: pedidos, exatamente 12.764 ouvintes. DEPENDE DO PASSO 2.
-- ###########################################################################
begin;
insert into pedidos (radio_id, ouvinte_id, conversa_id, tipo, conteudo, destinatario, criado_em)
select o.radio_id, o.id,
       cv.id,
       t.tipo,
       case t.tipo when 'musica' then 'Música pedida pelo ouvinte (demo)'
                   else 'Recado pedido pelo ouvinte (demo)' end,
       case when t.tipo in ('beijo','abraco','alo') then 'familiar (demo)' else null end,
       o.primeiro_contato_em + (floor(random() * 96) || ' hours')::interval
from ouvintes o
-- A conversa de cada ouvinte vem de UMA leitura com hash join, e nao de uma
-- subconsulta por pedido (que varria `conversas` inteira a cada linha).
left join (
  select distinct on (c.ouvinte_id) c.ouvinte_id, c.id
  from conversas c
  join ouvintes o2 on o2.id = c.ouvinte_id
  where o2.telefone between '5511990001144' and '5511990050238'
  order by c.ouvinte_id, c.iniciada_em
) cv on cv.ouvinte_id = o.id
join lateral (
  select (array['musica','musica','musica','beijo','abraco','alo','promocao'])[1 + floor(7 * random())::int] as tipo
) t on true
where o.telefone between '5511990001144' and '5511990050238'
  and ((substring(o.telefone from 8)::int - 1143) * 4219) % 49095 < 12764;
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
