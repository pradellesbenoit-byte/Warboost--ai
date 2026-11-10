-- PREPARED ONLY. Explicit approval required; restores the known faulty trigger.
-- Not a data rollback. Does not replay profile former_members or delete any row.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare t record; b record;
begin
  lock table public.wb1_profiles in access exclusive mode;
  select * into b from wb1_migration_private.profile_roster_trigger_isolation where singleton;
  if not found then raise exception 'isolation_backup_missing'; end if;
  select tr.*,p.proowner,p.proacl,pg_get_triggerdef(tr.oid,true) as trigger_definition,
    pg_get_functiondef(p.oid) as function_definition into t
    from pg_catalog.pg_trigger tr join pg_catalog.pg_proc p on p.oid=tr.tgfoid
    where tr.tgrelid='public.wb1_profiles'::regclass
      and tr.tgname='wb1_capture_profile_roster_deletions_trg';
  if not found or t.oid<>b.trigger_oid or t.tgfoid<>b.function_oid
     or t.trigger_definition<>b.trigger_definition or t.function_definition<>b.function_definition
     or t.proowner<>b.function_owner or t.proacl::text is distinct from b.function_acl
     or b.original_enabled<>'O' then
    raise exception 'rollback_trigger_drift_review_required';
  end if;
  if b.restored_at is not null then
    if t.tgenabled<>'O' then raise exception 'rollback_state_drift_review_required'; end if;
    return;
  end if;
  if t.tgenabled<>'D' then raise exception 'rollback_trigger_not_isolated'; end if;
  alter table public.wb1_profiles enable trigger wb1_capture_profile_roster_deletions_trg;
  update wb1_migration_private.profile_roster_trigger_isolation
    set restored_at=clock_timestamp() where singleton;
end $$;
commit;
