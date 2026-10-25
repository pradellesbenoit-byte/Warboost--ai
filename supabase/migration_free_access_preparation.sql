-- LOCAL PREPARATION ONLY. Review schema/ACL/backup before any separate installation approval.
-- No users, invitations, PRO grants, payments, auth.users triggers or existing data are modified.
begin;
set local lock_timeout='2s';
set local statement_timeout='4s';
select pg_advisory_xact_lock(hashtextextended('warboost-free-access-schema-v1',0));
-- Existing managed schema is a prerequisite, never a conversion target.
-- Player/account keys are TEXT; only alliance/request/reservation IDs are UUID.
create or replace function public.wb1_assert_free_base_contract()
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare expected record;
begin
  for expected in select * from (values
    ('wb1_profiles','player_id','text'),('wb1_profiles','state','jsonb'),
    ('wb1_alliance_members','player_id','text'),('wb1_alliance_members','alliance_id','uuid'),
    ('wb1_alliance_members','role','text'),('wb1_alliance_members','updated_at','timestamp with time zone'),
    ('wb1_alliances','id','uuid'),('wb1_alliances','owner_player_id','text'),
    ('wb1_alliances','tag','text'),('wb1_alliances','server_id','text'),('wb1_alliances','roster','jsonb'),
    ('wb1_alliances','roster_updated_at','timestamp with time zone'),('wb1_alliances','updated_at','timestamp with time zone')
  ) v(tbl,col,typ) loop
    if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||expected.tbl)
      and attname=expected.col and not attisdropped and format_type(atttypid,atttypmod)=expected.typ)
      then raise exception 'FREE_BASE_COLUMN_CONTRACT'; end if;
  end loop;
  for expected in select * from (values
    ('wb1_profiles','PRIMARY KEY (player_id)'),
    ('wb1_alliances','PRIMARY KEY (id)'),
    ('wb1_alliance_members','PRIMARY KEY (alliance_id, player_id)')
  ) v(tbl,definition) loop
    if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||expected.tbl)
      and contype='p' and convalidated and pg_get_constraintdef(oid)=expected.definition)
      then raise exception 'FREE_BASE_KEY_CONTRACT'; end if;
  end loop;
  if exists(select 1 from pg_class where oid in ('public.wb1_profiles'::regclass,
    'public.wb1_alliances'::regclass,'public.wb1_alliance_members'::regclass) and not relrowsecurity)
    then raise exception 'FREE_BASE_RLS_CONTRACT'; end if;
end $$;
revoke all on function public.wb1_assert_free_base_contract() from public,anon,authenticated,service_role;
select public.wb1_assert_free_base_contract();
create table if not exists public.wb1_free_scan_usage (
  user_id text not null references public.wb1_profiles(player_id) on delete cascade,
  request_id uuid primary key,
  usage_day date not null default (now() at time zone 'UTC')::date,
  created_at timestamptz not null default now()
);
create index if not exists wb1_free_scan_usage_day on public.wb1_free_scan_usage(usage_day,user_id);
alter table public.wb1_free_scan_usage enable row level security;
revoke all on public.wb1_free_scan_usage from public,anon,authenticated;
grant select,insert on public.wb1_free_scan_usage to service_role;
-- A non-personal global counter survives account deletion, so deletion cannot reset cost limits.
create table if not exists public.wb1_free_scan_daily (
  usage_day date primary key,
  reserved integer not null check(reserved between 0 and 30)
);
alter table public.wb1_free_scan_daily enable row level security;
revoke all on public.wb1_free_scan_daily from public,anon,authenticated;
grant select on public.wb1_free_scan_daily to service_role;

-- Three personal FREE scans/account/day, max 30 FREE scans/day across the deployment.
-- Reservation is consumed before Vision, including failures. Never refund/retry automatically.
create or replace function public.wb1_reserve_free_scan(p_user_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare d date:=(now() at time zone 'UTC')::date;
begin
  if p_user_id is null or p_request_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('warboost-free-scan:'||d::text,0));
  if exists(select 1 from public.wb1_free_scan_usage where request_id=p_request_id)
    then raise exception 'SCAN_REQUEST_ALREADY_USED'; end if;
  if coalesce((select reserved from public.wb1_free_scan_daily where usage_day=d),0)>=30
     or (select count(*) from public.wb1_free_scan_usage where usage_day=d and user_id=p_user_id)>=3
    then return jsonb_build_object('reserved',false); end if;
  insert into public.wb1_free_scan_usage(user_id,request_id,usage_day) values(p_user_id,p_request_id,d);
  insert into public.wb1_free_scan_daily(usage_day,reserved) values(d,1)
    on conflict(usage_day) do update set reserved=wb1_free_scan_daily.reserved+1;
  return jsonb_build_object('reserved',true);
end $$;

create table if not exists public.wb1_alliance_access_requests (
  id uuid not null unique default gen_random_uuid(),
  player_id text not null references public.wb1_profiles(player_id) on delete cascade,
  alliance_id uuid not null references public.wb1_alliances(id),
  nickname text not null check(length(nickname) between 1 and 80),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(player_id,alliance_id)
);
alter table public.wb1_alliance_access_requests enable row level security;
revoke all on public.wb1_alliance_access_requests from public,anon,authenticated;
grant select,insert,update on public.wb1_alliance_access_requests to service_role;

-- Private helper: canonical linkage + matching membership/role, or existing owner.
create or replace function public.wb1_access_manager(p_user_id text,p_alliance_id uuid)
returns boolean language sql security definer set search_path=pg_catalog
as $$
  select exists(
    select 1 from public.wb1_alliances a where a.id=p_alliance_id and (
      a.owner_player_id=p_user_id or exists(
        select 1 from public.wb1_alliance_members m,
          jsonb_array_elements(coalesce(a.roster,'[]'::jsonb)) r
        where m.player_id=p_user_id and m.alliance_id=a.id and m.role in ('R4','R5')
          and r->>'player_id'=p_user_id::text and r->>'warboost_linked'='true'
          and r->>'role'=m.role and coalesce(r->>'__warboost_type','')<>'roster_removal_tombstone'
          and coalesce(r->>'status','active') not in ('removed','left','former','inactive')
          and r->>'identity_basis' in ('lastwar_nickname_server_alliance','legacy_private_link_preserved')
      )
    )
  );
$$;

create or replace function public.wb1_alliance_access_request(p_user_id text,p_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare s jsonb; requested_server text; requested_tag text; nickname text; target uuid; n integer; result jsonb;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action='mine' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'updated_at',updated_at)),'[]'::jsonb)
      into result from public.wb1_alliance_access_requests where player_id=p_user_id;
    return jsonb_build_object('requests',result);
  end if;
  if p_action='list' then
    select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'nickname',q.nickname,'status',q.status)),'[]'::jsonb)
      into result from public.wb1_alliance_access_requests q
      where q.status='pending' and public.wb1_access_manager(p_user_id,q.alliance_id);
    return jsonb_build_object('requests',result);
  end if;
  if p_action is distinct from 'request' then raise exception 'ALLIANCE_ACTION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wb-access-user:'||p_user_id::text,0));
  select state into s from public.wb1_profiles where player_id=p_user_id for share;
  requested_server:=s#>>'{player,server_id}'; requested_tag:=upper(btrim(s#>>'{alliance,tag}'));
  nickname:=btrim(s#>>'{player,name}');
  if coalesce(requested_server,'')!~'^[0-9]{1,20}$' or coalesce(requested_tag,'')='' or coalesce(nickname,'')=''
    then raise exception 'ALLIANCE_IDENTITY_REQUIRED'; end if;
  select count(*),min(a.id::text)::uuid into n,target from public.wb1_alliances a
    where a.server_id=requested_server and upper(btrim(a.tag))=requested_tag;
  if n=0 then raise exception 'ALLIANCE_MANAGER_VERIFICATION_REQUIRED'; end if;
  if n<>1 then raise exception 'ALLIANCE_SCOPE_AMBIGUOUS'; end if;
  if exists(select 1 from public.wb1_alliance_members where player_id=p_user_id and alliance_id<>target)
    then raise exception 'ALLIANCE_SWITCH_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.wb1_alliance_access_requests where player_id=p_user_id and alliance_id=target and status='approved')
    and not exists(select 1 from public.wb1_alliance_members where player_id=p_user_id and alliance_id=target)
    then raise exception 'ALLIANCE_REJOIN_REVIEW_REQUIRED'; end if;
  insert into public.wb1_alliance_access_requests(player_id,alliance_id,nickname)
    values(p_user_id,target,nickname)
    on conflict(player_id,alliance_id) do update
      set nickname=excluded.nickname, status='pending', reviewed_by=null, updated_at=now()
      where wb1_alliance_access_requests.status='rejected'
        and wb1_alliance_access_requests.updated_at < now()-interval '1 day';
  select jsonb_build_object('id',id,'status',status) into result
    from public.wb1_alliance_access_requests where player_id=p_user_id and alliance_id=target;
  return jsonb_build_object('request',result,'membership_granted',false);
end $$;

create or replace function public.wb1_review_alliance_access(p_user_id text,p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare q public.wb1_alliance_access_requests; a public.wb1_alliances;
  s jsonb; member jsonb; position integer; n integer; target uuid; applicant text; stamp timestamptz:=clock_timestamp();
begin
  if p_accept is null then raise exception 'ALLIANCE_ACTION_INVALID'; end if;
  -- Stable ordering: alliance -> request. Never trust a browser-supplied role/user/roster.
  select alliance_id,player_id into target,applicant from public.wb1_alliance_access_requests where id=p_request_id;
  if target is null then raise exception 'ALLIANCE_REQUEST_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wb-access-user:'||applicant::text,0));
  -- The real membership PK is (alliance_id,player_id), NOT a global player key.
  -- Serialize the check and insert against ALL membership writers; do not add
  -- a global unique constraint or move an existing membership to another scope.
  lock table public.wb1_alliance_members in share row exclusive mode;
  select * into a from public.wb1_alliances where id=target for no key update;
  if not public.wb1_access_manager(p_user_id,target) then raise exception 'ALLIANCE_MANAGER_REQUIRED'; end if;
  select * into q from public.wb1_alliance_access_requests where id=p_request_id for update;
  if exists(select 1 from public.wb1_alliance_members where player_id=q.player_id and alliance_id<>a.id)
    then raise exception 'ALLIANCE_SWITCH_REVIEW_REQUIRED'; end if;
  if q.status='approved' then
    if not exists(select 1 from public.wb1_alliance_members m,jsonb_array_elements(a.roster) r
      where m.player_id=q.player_id and m.alliance_id=a.id and r->>'player_id'=q.player_id::text
        and r->>'warboost_linked'='true' and r->>'role'=m.role
        and coalesce(r->>'__warboost_type','')<>'roster_removal_tombstone'
        and coalesce(r->>'status','active') not in ('removed','left','former','inactive'))
      then raise exception 'ALLIANCE_REJOIN_REVIEW_REQUIRED'; end if;
    return jsonb_build_object('status','approved','already_reviewed',true);
  end if;
  if q.status<>'pending' then raise exception 'ALLIANCE_REQUEST_NOT_PENDING'; end if;
  if not p_accept then
    update public.wb1_alliance_access_requests set status='rejected',reviewed_by=p_user_id,updated_at=stamp where id=q.id;
    return jsonb_build_object('status','rejected');
  end if;
  select state into s from public.wb1_profiles where player_id=q.player_id for share;
  if s#>>'{player,server_id}' is distinct from a.server_id
    or upper(btrim(s#>>'{alliance,tag}')) is distinct from upper(btrim(a.tag))
    or lower(btrim(s#>>'{player,name}')) is distinct from lower(q.nickname)
    then raise exception 'ALLIANCE_REQUEST_IDENTITY_CHANGED'; end if;
  select count(*),min((ordinality-1)::integer) into n,position
    from jsonb_array_elements(coalesce(a.roster,'[]'::jsonb)) with ordinality
    where lower(btrim(value->>'name'))=lower(q.nickname)
      and value->>'server_id'=a.server_id and upper(value->>'alliance_tag')=upper(a.tag)
      and coalesce(value->>'__warboost_type','')<>'roster_removal_tombstone'
      and coalesce(value->>'status','active') not in ('removed','left','former','inactive');
  if n<>1 then raise exception 'ALLIANCE_CANONICAL_IDENTITY_REQUIRED'; end if;
  member:=a.roster->position;
  if coalesce(member->>'role','') not in ('R1','R2','R3','R4','R5') then raise exception 'ALLIANCE_RANK_CONFIRMATION_REQUIRED'; end if;
  if coalesce(member->>'player_id','') not in ('',q.player_id::text)
    then raise exception 'ALLIANCE_IDENTITY_ALREADY_LINKED'; end if;
  if exists(select 1 from jsonb_array_elements(a.roster) r where r->>'player_id'=q.player_id::text and r is distinct from member)
    then raise exception 'ALLIANCE_IDENTITY_AMBIGUOUS'; end if;
  member:=member||jsonb_build_object('player_id',q.player_id,'warboost_linked',true,
    'identity_basis','lastwar_nickname_server_alliance','identity_linked_at',stamp);
  stamp:=greatest(stamp,coalesce(a.roster_updated_at,stamp)+interval '1 millisecond');
  update public.wb1_alliances set roster=jsonb_set(a.roster,array[position::text],member),
    roster_updated_at=stamp,updated_at=stamp where id=a.id;
  insert into public.wb1_alliance_members(player_id,alliance_id,role,updated_at)
    values(q.player_id,a.id,member->>'role',stamp)
    on conflict(alliance_id,player_id) do update set role=excluded.role,updated_at=stamp;
  update public.wb1_alliance_access_requests set status='approved',reviewed_by=p_user_id,updated_at=stamp where id=q.id;
  return jsonb_build_object('status','approved','membership_granted',true);
end $$;

-- A founder workspace is NOT a canonical alliance. No wb1_alliances owner,
-- membership, verified R4/R5 role or account linkage is created by this feature.
-- Multiple founders may prepare independent drafts for the same unclaimed scope;
-- the first declarant cannot reserve or seize that scope.
create table if not exists public.wb1_alliance_founder_spaces (
  founder_id text primary key references public.wb1_profiles(player_id) on delete cascade,
  server_id text not null check(server_id ~ '^[0-9]{1,20}$'),
  alliance_tag text not null check(length(alliance_tag) between 1 and 24),
  status text not null default 'provisional' check(status='provisional'),
  roster_draft jsonb not null default '[]' check(jsonb_typeof(roster_draft)='array' and jsonb_array_length(roster_draft)<=100),
  revision integer not null default 0 check(revision>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wb1_alliance_founder_spaces enable row level security;
create or replace function public.wb1_founder_space(p_user_id text,p_action text,p_roster jsonb default null,p_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare s jsonb; v_server text; v_tag text; existing_count integer; draft public.wb1_alliance_founder_spaces;
  r jsonb; item_count integer; name_count integer;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action not in ('create','mine','save_draft') or p_action is null then raise exception 'ALLIANCE_ACTION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wb-autonomous-spaces-v1',0));
  perform pg_advisory_xact_lock(hashtextextended('wb-access-user:'||p_user_id::text,0));
  select state into s from public.wb1_profiles where player_id=p_user_id for share;
  v_server:=s#>>'{player,server_id}'; v_tag:=upper(btrim(s#>>'{alliance,tag}'));
  if coalesce(v_server,'')!~'^[0-9]{1,20}$' or coalesce(v_tag,'')='' or length(v_tag)>24
    or coalesce(btrim(s#>>'{player,name}'),'')='' then raise exception 'ALLIANCE_IDENTITY_REQUIRED'; end if;
  select count(*) into existing_count from public.wb1_alliances a where a.server_id=v_server and upper(btrim(a.tag))=v_tag;
  if existing_count>1 then raise exception 'ALLIANCE_SCOPE_AMBIGUOUS'; end if;
  if existing_count=1 then
    return jsonb_build_object('existing',true,'request_membership',true,'provisional',false);
  end if;
  if exists(select 1 from public.wb1_alliance_members where player_id=p_user_id)
    or exists(select 1 from public.wb1_alliances where owner_player_id=p_user_id)
    then raise exception 'ALLIANCE_SWITCH_REVIEW_REQUIRED'; end if;
  if p_action='create' then
    insert into public.wb1_alliance_founder_spaces(founder_id,server_id,alliance_tag)
      values(p_user_id,v_server,v_tag) on conflict(founder_id) do nothing;
  end if;
  select * into draft from public.wb1_alliance_founder_spaces where founder_id=p_user_id for update;
  if not found then raise exception 'ALLIANCE_DRAFT_NOT_FOUND'; end if;
  if draft.server_id is distinct from v_server or draft.alliance_tag is distinct from v_tag
    then raise exception 'ALLIANCE_DRAFT_IDENTITY_CHANGED'; end if;
  if p_action='save_draft' then
    if p_revision is null or p_revision<>draft.revision then raise exception 'ALLIANCE_DRAFT_CONFLICT'; end if;
    if jsonb_typeof(p_roster) is distinct from 'array' then raise exception 'ALLIANCE_DRAFT_INVALID'; end if;
    if jsonb_array_length(p_roster)>100 then raise exception 'ALLIANCE_DRAFT_LIMIT'; end if;
    for r in select value from jsonb_array_elements(p_roster) loop
      if jsonb_typeof(r)<>'object' or jsonb_typeof(r->'name') is distinct from 'string'
        or length(btrim(r->>'name')) not between 1 and 80
        or exists(select 1 from jsonb_object_keys(r) k where k not in ('name','declared_game_role'))
        or (r ? 'declared_game_role' and r->'declared_game_role'<>'null'::jsonb
          and (jsonb_typeof(r->'declared_game_role')<>'string' or r->>'declared_game_role' not in ('R1','R2','R3','R4','R5')))
        then raise exception 'ALLIANCE_DRAFT_INVALID'; end if;
    end loop;
    select count(*),count(distinct lower(btrim(value->>'name'))) into item_count,name_count from jsonb_array_elements(p_roster);
    if item_count<>name_count then raise exception 'ALLIANCE_DRAFT_DUPLICATE'; end if;
    update public.wb1_alliance_founder_spaces set roster_draft=p_roster,revision=revision+1,updated_at=clock_timestamp()
      where founder_id=p_user_id returning * into draft;
  end if;
  return jsonb_build_object('provisional',true,'game_role_verified',false,'membership_granted',false,
    'server_id',draft.server_id,'alliance_tag',draft.alliance_tag,'roster_draft',draft.roster_draft,'revision',draft.revision);
end $$;

-- Fail closed on schema collisions. Re-running never truncates a table or resets
-- counters, requests, founders or drafts; unexpected shapes roll back all changes.
create or replace function public.wb1_assert_free_access_contract()
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare t text; f regprocedure; expected record;
begin
  perform public.wb1_assert_free_base_contract();
  -- Reject stale UUID overloads rather than leaving an unintended privileged API.
  if exists(select 1 from pg_proc where pronamespace='public'::regnamespace
    and proname in ('wb1_reserve_free_scan','wb1_access_manager','wb1_alliance_access_request',
      'wb1_review_alliance_access','wb1_founder_space') group by proname having count(*)<>1)
    then raise exception 'FREE_ACCESS_OVERLOAD_CONTRACT'; end if;
  for expected in select * from (values
    ('wb1_free_scan_usage','user_id','text'),('wb1_free_scan_usage','request_id','uuid'),
    ('wb1_free_scan_usage','usage_day','date'),('wb1_free_scan_usage','created_at','timestamp with time zone'),
    ('wb1_free_scan_daily','usage_day','date'),('wb1_free_scan_daily','reserved','integer'),
    ('wb1_alliance_access_requests','id','uuid'),('wb1_alliance_access_requests','player_id','text'),
    ('wb1_alliance_access_requests','alliance_id','uuid'),('wb1_alliance_access_requests','nickname','text'),
    ('wb1_alliance_access_requests','status','text'),('wb1_alliance_access_requests','reviewed_by','text'),
    ('wb1_alliance_access_requests','created_at','timestamp with time zone'),('wb1_alliance_access_requests','updated_at','timestamp with time zone'),
    ('wb1_alliance_founder_spaces','founder_id','text'),('wb1_alliance_founder_spaces','server_id','text'),
    ('wb1_alliance_founder_spaces','alliance_tag','text'),('wb1_alliance_founder_spaces','status','text'),
    ('wb1_alliance_founder_spaces','roster_draft','jsonb'),('wb1_alliance_founder_spaces','revision','integer'),
    ('wb1_alliance_founder_spaces','created_at','timestamp with time zone'),('wb1_alliance_founder_spaces','updated_at','timestamp with time zone')
  ) v(tbl,col,typ) loop
    if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||expected.tbl)
      and attname=expected.col and not attisdropped and format_type(atttypid,atttypmod)=expected.typ)
      then raise exception 'FREE_ACCESS_SCHEMA_CONTRACT'; end if;
  end loop;
  foreach t in array array['wb1_free_scan_usage','wb1_free_scan_daily','wb1_alliance_access_requests','wb1_alliance_founder_spaces'] loop
    if not exists(select 1 from pg_class c where c.oid=to_regclass('public.'||t) and c.relkind='r' and c.relrowsecurity
      and c.relowner=(select proowner from pg_proc where oid='public.wb1_assert_free_access_contract()'::regprocedure))
      or exists(select 1 from pg_policy where polrelid=to_regclass('public.'||t))
      or not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||t) and contype='p')
      or has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('service_role','public.'||t,'SELECT,INSERT,UPDATE,DELETE')
      or exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||t) and attnum>0 and not attisdropped
        and not attnotnull and not(t='wb1_alliance_access_requests' and attname='reviewed_by'))
      or (select count(*) from pg_attribute where attrelid=to_regclass('public.'||t) and attnum>0 and not attisdropped)
        <>(case t when 'wb1_free_scan_usage' then 4 when 'wb1_free_scan_daily' then 2 else 8 end)
      or (select count(*) from pg_constraint where conrelid=to_regclass('public.'||t) and contype='c' and convalidated)
        <>(case t when 'wb1_free_scan_usage' then 0 when 'wb1_free_scan_daily' then 1 when 'wb1_alliance_access_requests' then 2 else 5 end)
      then raise exception 'FREE_ACCESS_TABLE_CONTRACT'; end if;
  end loop;
  for expected in select * from (values
    ('wb1_free_scan_usage','PRIMARY KEY (request_id)'),
    ('wb1_free_scan_daily','PRIMARY KEY (usage_day)'),
    ('wb1_alliance_access_requests','PRIMARY KEY (player_id, alliance_id)'),
    ('wb1_alliance_access_requests','UNIQUE (id)'),
    ('wb1_alliance_founder_spaces','PRIMARY KEY (founder_id)'),
    ('wb1_free_scan_usage','FOREIGN KEY (user_id) REFERENCES public.wb1_profiles(player_id) ON DELETE CASCADE'),
    ('wb1_alliance_access_requests','FOREIGN KEY (player_id) REFERENCES public.wb1_profiles(player_id) ON DELETE CASCADE'),
    ('wb1_alliance_access_requests','FOREIGN KEY (alliance_id) REFERENCES public.wb1_alliances(id)'),
    ('wb1_alliance_founder_spaces','FOREIGN KEY (founder_id) REFERENCES public.wb1_profiles(player_id) ON DELETE CASCADE')
  ) v(tbl,definition) loop
    if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||expected.tbl)
      and convalidated and pg_get_constraintdef(oid)=expected.definition)
      then raise exception 'FREE_ACCESS_CONSTRAINT_CONTRACT'; end if;
  end loop;
  foreach f in array array[
    'public.wb1_reserve_free_scan(text,uuid)'::regprocedure,
    'public.wb1_access_manager(text,uuid)'::regprocedure,
    'public.wb1_alliance_access_request(text,text)'::regprocedure,
    'public.wb1_review_alliance_access(text,uuid,boolean)'::regprocedure,
    'public.wb1_founder_space(text,text,jsonb,integer)'::regprocedure,
    'public.wb1_assert_free_base_contract()'::regprocedure,
    'public.wb1_assert_free_access_contract()'::regprocedure] loop
    if not exists(select 1 from pg_proc p where p.oid=f and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']
      and p.proowner=(select proowner from pg_proc where oid='public.wb1_assert_free_access_contract()'::regprocedure))
      or has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')
      then raise exception 'FREE_ACCESS_FUNCTION_CONTRACT'; end if;
    if has_function_privilege('service_role',f,'EXECUTE') is distinct from
      (f not in ('public.wb1_access_manager(text,uuid)'::regprocedure,'public.wb1_assert_free_base_contract()'::regprocedure))
      then raise exception 'FREE_ACCESS_SERVICE_CONTRACT'; end if;
  end loop;
end $$;
revoke all on public.wb1_free_scan_usage,public.wb1_free_scan_daily,public.wb1_alliance_access_requests,public.wb1_alliance_founder_spaces from public,anon,authenticated,service_role;
revoke all on function public.wb1_reserve_free_scan(text,uuid) from public,anon,authenticated;
revoke all on function public.wb1_access_manager(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.wb1_alliance_access_request(text,text) from public,anon,authenticated;
revoke all on function public.wb1_review_alliance_access(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.wb1_founder_space(text,text,jsonb,integer) from public,anon,authenticated;
revoke all on function public.wb1_assert_free_access_contract() from public,anon,authenticated;
grant execute on function public.wb1_reserve_free_scan(text,uuid) to service_role;
grant execute on function public.wb1_alliance_access_request(text,text) to service_role;
grant execute on function public.wb1_review_alliance_access(text,uuid,boolean) to service_role;
grant execute on function public.wb1_founder_space(text,text,jsonb,integer) to service_role;
grant execute on function public.wb1_assert_free_access_contract() to service_role;
select public.wb1_assert_free_access_contract();
commit;
