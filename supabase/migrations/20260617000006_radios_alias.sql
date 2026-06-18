-- OuvintePro - canonizacao deterministica (e gratuita) das radios de SP.
-- alias_normalizado: minusculo, sem acento, espacos colapsados (igual ao helper normaliza()).

create table if not exists public.radios_alias (
  alias_normalizado text primary key,
  nome_canonico text not null
);

-- So o edge function (service role) le; sem policy = anon/authenticated bloqueados.
alter table public.radios_alias enable row level security;

insert into public.radios_alias (alias_normalizado, nome_canonico) values
  ('band','Band FM'),('band fm','Band FM'),('bandfm','Band FM'),('radio band','Band FM'),
  ('jovem pan','Jovem Pan FM'),('jovem pan fm','Jovem Pan FM'),('jp','Jovem Pan FM'),('jp fm','Jovem Pan FM'),
  ('transamerica','Transamerica'),('trans america','Transamerica'),('radio transamerica','Transamerica'),
  ('mix','Mix FM'),('mix fm','Mix FM'),
  ('massa','Massa FM'),('massa fm','Massa FM'),
  ('antena 1','Antena 1'),('antena um','Antena 1'),
  ('alpha','Alpha FM'),('alpha fm','Alpha FM'),('alfa fm','Alpha FM'),
  ('kiss','Kiss FM'),('kiss fm','Kiss FM'),
  ('105','105 FM'),('105 fm','105 FM'),('cento e cinco','105 FM'),
  ('nova brasil','Nova Brasil FM'),('nova brasil fm','Nova Brasil FM'),
  ('energia','Energia 97'),('energia 97','Energia 97'),('97 fm','Energia 97'),
  ('metropolitana','Metropolitana FM'),('metropolitan','Metropolitana FM'),('metropolitana fm','Metropolitana FM'),
  ('89','89 FM'),('89 fm','89 FM'),('a radio rock','89 FM'),
  ('educadora','Educadora FM'),('educadora fm','Educadora FM'),
  ('gazeta','Gazeta FM'),('gazeta fm','Gazeta FM')
on conflict (alias_normalizado) do update set nome_canonico = excluded.nome_canonico;
