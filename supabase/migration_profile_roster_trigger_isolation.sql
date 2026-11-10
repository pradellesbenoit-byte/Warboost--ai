-- PREPARED ONLY. Requires explicit approval and catalog preflight before execution.
-- Does not alter application grants, RLS, function privileges or any player rows.
-- Keep the exact deployed function/trigger intact; disable only its invocation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create schema if not exists wb1_migration_private;
do $$
begin
  if (select nspowner from pg_catalog.pg_namespace where nspname='wb1_migration_private')
      <> (select oid from pg_catalog.pg_roles where rolname=current_user) then
    raise exception 'migration_backup_schema_owner_mismatch';
  end if;
  -- Do not revoke privileges on an unrelated pre-existing schema's objects.
  if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='wb1_migration_private'
        and c.relname not in ('profile_roster_trigger_isolation','profile_roster_trigger_isolation_pkey'))
    or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='wb1_migration_private') then
    raise exception 'migration_backup_schema_not_exclusive';
  end if;
  if to_regclass('wb1_migration_private.profile_roster_trigger_isolation') is not null
     and coalesce(obj_description(to_regclass('wb1_migration_private.profile_roster_trigger_isolation')),
       '') <> 'WarBoost profile-roster trigger isolation backup v1' then
    raise exception 'migration_backup_object_mismatch';
  end if;
end $$;
revoke all on schema wb1_migration_private from public,anon,authenticated,service_role;
create table if not exists wb1_migration_private.profile_roster_trigger_isolation (
  singleton boolean primary key default true check(singleton),
  trigger_oid oid not null,
  function_oid oid not null,
  trigger_definition text not null,
  function_definition text not null,
  function_owner oid not null,
  function_acl text,
  original_enabled "char" not null,
  applied_at timestamptz not null,
  restored_at timestamptz
);
comment on table wb1_migration_private.profile_roster_trigger_isolation
  is 'WarBoost profile-roster trigger isolation backup v1';
alter table wb1_migration_private.profile_roster_trigger_isolation enable row level security;
revoke all on table wb1_migration_private.profile_roster_trigger_isolation from public,anon,authenticated,service_role;

do $$
declare t record; b record; state_column text;
begin
  -- Same lock as the following ALTER: capture and disable are atomic with writes.
  lock table public.wb1_profiles in access exclusive mode;
  select tr.*,p.prosecdef,p.proowner,p.proacl,p.proname,n.nspname,
    pg_get_triggerdef(tr.oid,true) as trigger_definition,
    pg_get_functiondef(p.oid) as function_definition
    into t
    from pg_catalog.pg_trigger tr join pg_catalog.pg_proc p on p.oid=tr.tgfoid
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where tr.tgrelid='public.wb1_profiles'::regclass
      and tr.tgname='wb1_capture_profile_roster_deletions_trg';
  if not found then raise exception 'expected_profile_roster_trigger_missing'; end if;
  select attnum::text into state_column from pg_catalog.pg_attribute
    where attrelid='public.wb1_profiles'::regclass and attname='state' and not attisdropped;
  if t.tgisinternal or t.prosecdef or t.nspname<>'public'
     or t.proname<>'wb1_capture_profile_roster_deletions' or t.tgtype<>23
     or t.tgattr::text is distinct from state_column then
    raise exception 'profile_roster_trigger_shape_changed_review_required';
  end if;
  -- The operator must review the ACTUAL full function before approving its hash.
  -- SET warboost.reviewed_profile_roster_function_sha256 = '<catalog audit hash>';
  if nullif(current_setting('warboost.reviewed_profile_roster_function_sha256',true),'')
     is distinct from encode(sha256(convert_to(t.function_definition,'UTF8')),'hex') then
    raise exception 'profile_roster_function_definition_review_required';
  end if;
  select * into b from wb1_migration_private.profile_roster_trigger_isolation where singleton;
  if found and b.restored_at is null then
    if t.oid<>b.trigger_oid or t.tgfoid<>b.function_oid or t.tgenabled<>'D'
       or t.trigger_definition<>b.trigger_definition or t.function_definition<>b.function_definition
       or t.proowner<>b.function_owner or t.proacl::text is distinct from b.function_acl then
      raise exception 'applied_trigger_drift_review_required';
    end if;
    return; -- Idempotent; never overwrites the original backup.
  end if;
  if t.tgenabled<>'O' then raise exception 'initial_trigger_not_normally_enabled_review_required'; end if;
  insert into wb1_migration_private.profile_roster_trigger_isolation values
    (true,t.oid,t.tgfoid,t.trigger_definition,t.function_definition,t.proowner,t.proacl::text,
      t.tgenabled,clock_timestamp(),null)
    on conflict(singleton) do update set
      trigger_oid=excluded.trigger_oid,function_oid=excluded.function_oid,
      trigger_definition=excluded.trigger_definition,function_definition=excluded.function_definition,
      function_owner=excluded.function_owner,function_acl=excluded.function_acl,
      original_enabled=excluded.original_enabled,applied_at=excluded.applied_at,restored_at=null;
  alter table public.wb1_profiles disable trigger wb1_capture_profile_roster_deletions_trg;
end $$;
commit;
