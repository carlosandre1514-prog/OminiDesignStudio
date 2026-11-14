-- Assertions for the sync schema (run after the stubs and the migration).
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.omni_records (kind, id, revision, hash, payload)
  values ('project', 'prj_1', 1, repeat('a', 64), '{"meta":{"name":"A"}}');
do $$ begin assert (select owner from public.omni_records where id = 'prj_1') = '00000000-0000-0000-0000-00000000000a', 'owner default'; end $$;
-- conditional update (expected revision 1 -> 2) succeeds
update public.omni_records set revision = 2, hash = repeat('b', 64) where kind = 'project' and id = 'prj_1' and revision = 1;
-- stale update matches no row (client sees a conflict)
do $$ declare n int; begin
  update public.omni_records set revision = 2 where kind = 'project' and id = 'prj_1' and revision = 1;
  get diagnostics n = row_count; assert n = 0, 'stale update must not apply';
end $$;
-- skipping revisions is rejected by the trigger
do $$ begin
  begin
    update public.omni_records set revision = 9 where id = 'prj_1';
    raise exception 'should have failed';
  exception when serialization_failure then null; end;
end $$;
-- new records must start at revision 1; hashes must be sha-256 hex
do $$ begin
  begin
    insert into public.omni_records (kind, id, revision, hash) values ('folder', 'f', 5, repeat('a', 64));
    raise exception 'should have failed';
  exception when serialization_failure then null; end;
  begin
    insert into public.omni_records (kind, id, revision, hash) values ('folder', 'f', 1, 'xyz');
    raise exception 'should have failed';
  exception when check_violation then null; end;
end $$;
-- payload_ref must point to the owner's payload folder
do $$ begin
  begin
    insert into public.omni_records (kind, id, revision, hash, payload_ref) values ('project', 'big', 1, repeat('a', 64), '00000000-0000-0000-0000-00000000000b/payloads/' || repeat('a', 64) || '.json');
    raise exception 'should have failed';
  exception when check_violation then null; end;
end $$;
insert into public.omni_records (kind, id, revision, hash, payload_ref) values ('project', 'big', 1, repeat('a', 64), '00000000-0000-0000-0000-00000000000a/payloads/' || repeat('a', 64) || '.json');
-- hard deletes are not allowed (tombstones only)
do $$ begin
  begin
    delete from public.omni_records where id = 'prj_1';
    raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
end $$;
-- inserting a record for another user is rejected by RLS
do $$ begin
  begin
    insert into public.omni_records (owner, kind, id, revision, hash) values ('00000000-0000-0000-0000-00000000000b', 'project', 'x', 1, repeat('c', 64));
    raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
end $$;
-- storage: own folder with a valid content-addressed name ok; anything else rejected
insert into storage.objects (bucket_id, name) values ('omni-assets', '00000000-0000-0000-0000-00000000000a/blobs/' || repeat('d', 64));
insert into storage.objects (bucket_id, name) values ('omni-assets', '00000000-0000-0000-0000-00000000000a/payloads/' || repeat('e', 64) || '.json');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('omni-assets', '00000000-0000-0000-0000-00000000000b/blobs/' || repeat('d', 64));
    raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('omni-assets', '00000000-0000-0000-0000-00000000000a/outro/arquivo.exe');
    raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
end $$;
-- stored files cannot be overwritten or deleted by clients (immutable, content-addressed)
do $$ declare n int; begin
  update storage.objects set name = name where bucket_id = 'omni-assets';
  get diagnostics n = row_count; assert n = 0, 'objects must not be updatable';
  delete from storage.objects where bucket_id = 'omni-assets';
  get diagnostics n = row_count; assert n = 0, 'objects must not be deletable';
end $$;

-- user B sees nothing of user A and cannot change it
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin assert (select count(*) from public.omni_records) = 0, 'B must not see A records'; end $$;
do $$ declare n int; begin
  update public.omni_records set revision = 3 where id = 'prj_1';
  get diagnostics n = row_count; assert n = 0, 'B must not update A records';
end $$;
do $$ begin assert (select count(*) from storage.objects) = 0, 'B must not see A files'; end $$;

-- anonymous role has no access at all
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.omni_records;
    raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert not has_table_privilege('authenticated', 'public.omni_records', 'TRUNCATE'), 'no truncate';
  assert not has_table_privilege('authenticated', 'public.omni_records', 'DELETE'), 'no delete';
end $$;
select 'RLS OK' as result;
