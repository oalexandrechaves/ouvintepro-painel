-- v82: numero da casa. TEXT porque existe "123A", "s/n", "45 fundos".
-- Sem complemento (apartamento/bloco): decisao de produto. Perguntado para todas as
-- cidades, logo apos a confirmacao do bairro/CEP, e entra na regua de cadastro completo.
alter table public.ouvintes add column if not exists numero text;
