# Seeds de demonstração

Estes arquivos **não são migrations** e ficam fora de `supabase/migrations/` de
propósito: nenhum `supabase db push` ou `db reset` pode aplicá-los por acidente.
São rodados à mão, no SQL Editor, na ordem descrita no cabeçalho de cada arquivo.

| arquivo | o quê | telefones |
|---|---|---|
| `20260912_demo_v4_49095_ouvintes.sql` | 49.095 ouvintes em 27 bairros e 9 zonas | `5511990001144` a `5511990050238` |
| `20260913_correcao_seed_v4.sql` | registro da correção de rádios, pedidos e músicas do v4 (já aplicada, não rodar) | mesmo intervalo |

## Nomes do IBGE para o gênero estimado

`nomes_genero_ibge_censo2010.csv.gz` tem os **100.787 primeiros nomes** do Censo
2010 com a frequência feminina e masculina de cada um (IBGE, versão consolidada do
Brasil.IO, dataset `genero-nomes`, licença CC BY-SA 4.0). É a carga da tabela
`public.nomes_genero_ibge`, criada pela migration
`20260913020000_genero_estimado.sql`.

**O que está carregado nesta instância (13/09/2026): os 11.997 nomes mais
frequentes, que cobrem 95,0% da população do Censo** (frequência mínima 578). A
carga foi feita pelo conector, que só aceita SQL digitado; carregar os 100.787
nomes por esse caminho custaria cerca de 1,3 MB de SQL, e o banco não tem extensão
HTTP para baixar o arquivo sozinho. Nome fora da tabela aparece como "não
encontrado" na tela, nunca num dos lados. Conferido depois da carga: 11.997
linhas, somas de frequência idênticas ao arquivo, 6.080 femininos, 4.984
masculinos e 933 ambíguos.

**Para carregar o arquivo inteiro** (instância nova ou esta), com `psql`:

```sql
create temp table carga (nome text, frequencia_feminina int, frequencia_masculina int);
\copy carga from program 'gunzip -c nomes_genero_ibge_censo2010.csv.gz' with (format csv, header true)
insert into public.nomes_genero_ibge select * from carga
on conflict (nome) do nothing;
```

Depois, conferir que a tabela tem 100.787 linhas.

**Conferência de seed olha distribuição, não só contagem.** A primeira versão do
v4 passou na conferência com 18.166 rádios iguais e 12.764 pedidos iguais, porque
só os totais foram checados. Todo conjunto sorteado precisa mostrar quantos
valores distintos tem e quantos em cada um.

**A demonstração tem o formato que o bot produz.** Esta instância é peça de venda,
e a instância da rádio nasce vazia. Se o seed gravar algo que o bot nunca grava
(música em `pedidos`, por exemplo), o cliente vê na reunião um dado que o sistema
dele não vai gerar.

O seed antigo (1.143 ouvintes, `5511990000001` a `5511990001143`) está na
migration `20260804000004_seed_demo_completo.sql`.

Todo registro de demonstração tem `consentimento_texto` começando com `[DEMO]`.
Cada arquivo traz o próprio rollback, que apaga só o seu intervalo de telefones.

**Pré-requisito do v4:** a migration `20260912230000_indices_por_ouvinte.sql`
(que também é o PASSO 0 do arquivo). Sem os índices, o seed, o painel e o
rollback varrem tabelas inteiras por ouvinte.
