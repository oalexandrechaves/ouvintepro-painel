alter table ouvintes add column if not exists consentimento_em timestamptz;
alter table ouvintes add column if not exists consentimento_texto text;
