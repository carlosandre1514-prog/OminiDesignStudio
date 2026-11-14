-- OmniDesign Studio — esquema de sincronização em nuvem (Supabase)
-- Execute no SQL Editor do seu projeto Supabase (ou via `supabase db push`). Pode ser executado mais de uma vez.
-- Cada usuário só enxerga e altera os próprios registros (Row Level Security).

-- 1) Registros sincronizados (projetos, assets, pastas e versões) --------------------------
create table if not exists public.omni_records (
  owner      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('project', 'asset', 'folder', 'version')),
  id         text        not null check (char_length(id) between 1 and 100),
  revision   integer     not null check (revision > 0),
  hash       text        not null check (hash ~ '^[0-9a-f]{64}$'),
  payload    jsonb,
  -- Registros grandes ficam no Storage (payloads/<sha256>.json) e a linha guarda só a referência.
  payload_ref text,
  deleted    boolean     not null default false,
  device     text        check (device is null or char_length(device) <= 100),
  updated_at timestamptz not null default now(),
  primary key (owner, kind, id),
  -- Limite de segurança: 25 MB por registro (o conteúdo binário dos assets vai para o Storage).
  constraint omni_records_payload_size check (payload is null or octet_length(payload::text) <= 26214400)
);

alter table public.omni_records drop constraint if exists omni_records_payload_ref_format;
alter table public.omni_records add constraint omni_records_payload_ref_format
  check (payload_ref is null or payload_ref ~ ('^' || owner::text || '/payloads/[0-9a-f]{64}\.json$'));

-- A chave primária (owner, kind, id) já atende as consultas por (owner, kind): sem índice extra.
drop index if exists public.omni_records_owner_kind_idx;

-- Concorrência otimista: toda atualização deve incrementar a revisão em exatamente 1.
-- Assim uma escrita baseada em uma revisão antiga nunca sobrescreve outra silenciosamente.
create or replace function public.omni_records_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner <> old.owner or new.kind <> old.kind or new.id <> old.id then
      raise exception 'omni_records: chave imutável' using errcode = '42501';
    end if;
    if new.revision <> old.revision + 1 then
      raise exception 'omni_records: conflito de revisão (esperado %, recebido %)', old.revision + 1, new.revision
        using errcode = '40001';
    end if;
  elsif tg_op = 'INSERT' then
    if new.revision <> 1 then
      raise exception 'omni_records: novos registros começam na revisão 1' using errcode = '40001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists omni_records_guard on public.omni_records;
create trigger omni_records_guard
  before insert or update on public.omni_records
  for each row execute function public.omni_records_guard();

alter table public.omni_records enable row level security;

drop policy if exists "omni_records_select_own" on public.omni_records;
drop policy if exists "omni_records_insert_own" on public.omni_records;
drop policy if exists "omni_records_update_own" on public.omni_records;
drop policy if exists "omni_records_delete_own" on public.omni_records;

create policy "omni_records_select_own" on public.omni_records
  for select to authenticated using (owner = (select auth.uid()));
create policy "omni_records_insert_own" on public.omni_records
  for insert to authenticated with check (owner = (select auth.uid()));
create policy "omni_records_update_own" on public.omni_records
  for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
-- Sem política de DELETE: exclusões viram "lápides" (deleted = true) para propagar entre dispositivos.

-- Privilégios mínimos: o Supabase concede ALL por padrão; o app só precisa de SELECT/INSERT/UPDATE.
revoke all on public.omni_records from anon, authenticated;
grant select, insert, update on public.omni_records to authenticated;

-- 2) Arquivos (Storage) ----------------------------------------------------------------------
-- Bucket privado, endereçado pelo SHA-256 do conteúdo:
--   <id do usuário>/blobs/<sha256>          (arquivos dos assets)
--   <id do usuário>/payloads/<sha256>.json  (registros grandes)
-- Conteúdo endereçado por hash é imutável: só criação e leitura pelo dono.
insert into storage.buckets (id, name, public)
values ('omni-assets', 'omni-assets', false)
on conflict (id) do nothing;

drop policy if exists "omni_assets_select_own" on storage.objects;
drop policy if exists "omni_assets_insert_own" on storage.objects;
drop policy if exists "omni_assets_update_own" on storage.objects;
drop policy if exists "omni_assets_delete_own" on storage.objects;

create policy "omni_assets_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'omni-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "omni_assets_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'omni-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^' || (select auth.uid())::text || '/(blobs/[0-9a-f]{64}|payloads/[0-9a-f]{64}\.json)$')
  );
