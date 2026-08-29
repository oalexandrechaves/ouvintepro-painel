-- v82: seed dos ficticios para manter a demo coerente quando a regua de cadastro
-- completo passa a exigir numero + consentimento. Sem isso, as views que contam so
-- completos iriam a zero e a demo morreria.
--
-- Escopo estrito: SO os ficticios do range reservado 5511990000001..5511990001143
-- QUE JA TEM NOME (1042 linhas). Os 101 sem nome ficam incompletos DE PROPOSITO
-- (viram os dados do funil de abandono). Os 3 reais (Luciana, Jones, Marcelo) estao
-- FORA do range e NAO sao tocados: ficam incompletos, que e o comportamento correto.
-- Todos os UPDATE filtram por range + nome not null + campo is null (idempotente,
-- nunca sobrescreve dado existente nem toca em reais).

-- Numero plausivel de casa: distribuicao enviesada para baixo (maioria abaixo de ~1500,
-- poucos altos), via power(random(), 2.5). random() inline em SET e avaliado por linha,
-- entao em massa nao colapsa (nao ha subquery lateral correlacionada por baixa cardinalidade).
update public.ouvintes
set numero = (floor(power(random(), 2.5) * 3997) + 1)::int::text
where telefone between '5511990000001' and '5511990001143'
  and nome is not null
  and numero is null;

-- Consentimento dos ficticios: marca a PROVA com um marcador INEQUIVOCO e FILTRAVEL
-- ('[DEMO]%'), para nunca confundir dado ficticio com consentimento real quando alguem
-- olhar a tabela meses depois. Data do consentimento = primeiro_contato_em (coerente com
-- o momento em que o cadastro teria acontecido).
update public.ouvintes
set consentimento_em = primeiro_contato_em,
    consentimento_texto = '[DEMO] dado ficticio de demonstracao, nao houve consentimento real'
where telefone between '5511990000001' and '5511990001143'
  and nome is not null
  and consentimento_em is null;
