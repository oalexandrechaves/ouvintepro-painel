-- OuvintePro / Rede Nativa - roteiro Adriana: novos campos, nome canonico da radio
-- e cidades da Grande Sao Paulo (entram como "regiao" no lugar de "Outras").

alter table public.ouvintes add column if not exists estilo_musical text;
alter table public.ouvintes add column if not exists programa_locutor text;

update public.radios set nome = 'Nativa FM' where ativo = true;

create table if not exists public.cidades_grande_sp (
  nome text primary key,
  nome_normalizado text not null
);

alter table public.cidades_grande_sp enable row level security;

insert into public.cidades_grande_sp (nome, nome_normalizado)
select n,
  lower(translate(n,
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
    'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'))
from (values
  ('Arujá'),('Barueri'),('Biritiba-Mirim'),('Caieiras'),('Cajamar'),
  ('Carapicuíba'),('Cotia'),('Diadema'),('Embu das Artes'),('Embu-Guaçu'),
  ('Ferraz de Vasconcelos'),('Francisco Morato'),('Franco da Rocha'),('Guararema'),
  ('Guarulhos'),('Itapecerica da Serra'),('Itapevi'),('Itaquaquecetuba'),('Jandira'),
  ('Juquitiba'),('Mairiporã'),('Mauá'),('Mogi das Cruzes'),('Osasco'),
  ('Pirapora do Bom Jesus'),('Poá'),('Ribeirão Pires'),('Rio Grande da Serra'),
  ('Salesópolis'),('Santa Isabel'),('Santana de Parnaíba'),('Santo André'),
  ('São Bernardo do Campo'),('São Caetano do Sul'),('Suzano'),('Taboão da Serra'),
  ('Vargem Grande Paulista')
) as t(n)
on conflict (nome) do nothing;
