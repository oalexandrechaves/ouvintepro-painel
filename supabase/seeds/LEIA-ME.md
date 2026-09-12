# Seeds de demonstração

Estes arquivos **não são migrations** e ficam fora de `supabase/migrations/` de
propósito: nenhum `supabase db push` ou `db reset` pode aplicá-los por acidente.
São rodados à mão, no SQL Editor, na ordem descrita no cabeçalho de cada arquivo.

| arquivo | o quê | telefones |
|---|---|---|
| `20260912_demo_v4_49095_ouvintes.sql` | 49.095 ouvintes em 27 bairros e 9 zonas | `5511990001144` a `5511990050238` |

O seed antigo (1.143 ouvintes, `5511990000001` a `5511990001143`) está na
migration `20260804000004_seed_demo_completo.sql`.

Todo registro de demonstração tem `consentimento_texto` começando com `[DEMO]`.
Cada arquivo traz o próprio rollback, que apaga só o seu intervalo de telefones.

**Pré-requisito do v4:** a migration `20260912230000_indices_por_ouvinte.sql`
(que também é o PASSO 0 do arquivo). Sem os índices, o seed, o painel e o
rollback varrem tabelas inteiras por ouvinte.
