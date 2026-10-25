-- PREPARATION ONLY. Install AFTER migration_free_access_preparation.sql,
-- only after separate approval. No canonical alliance, role, PRO or auth user edits.
begin;
set local lock_timeout='2s';
set local statement_timeout='4s';
select pg_advisory_xact_lock(hashtextextended('warboost-free-access-schema-v1',0));
select public.wb1_assert_free_access_contract();

-- Database-owned operational policy: no client/service-role mutation permission.
-- Conservative initial cap, adjustable by an administrator without deploying code.
alter table public.wb1_free_scan_daily drop constraint if exists wb1_free_scan_daily_reserved_check;
alter table public.wb1_free_scan_daily add constraint wb1_free_scan_daily_reserved_check check(reserved>=0);
create table if not exists public.wb1_free_budget_policy(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true,
 per_account integer not null default 3 check(per_account between 0 and 100),
 global_daily integer not null default 30 check(global_daily between 0 and 100000),
 per_ip integer not null default 10 check(per_ip between 0 and 1000),
 updated_at timestamptz not null default now()
);
insert into public.wb1_free_budget_policy(singleton) values(true) on conflict do nothing;
create table if not exists public.wb1_free_scan_ip_daily(
 usage_day date not null, ip_digest text not null check(ip_digest ~ '^[a-f0-9]{64}$'),
 reserved integer not null check(reserved>=0), primary key(usage_day,ip_digest)
);
alter table public.wb1_free_budget_policy enable row level security;
alter table public.wb1_free_scan_ip_daily enable row level security;
revoke all on public.wb1_free_budget_policy,public.wb1_free_scan_ip_daily from public,anon,authenticated,service_role;

-- Keep the old signature FAIL CLOSED; only the new IP-aware backend may spend FREE.
create or replace function public.wb1_reserve_free_scan(p_user_id text,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select jsonb_build_object('reserved',false,'reason','BUDGET_BACKEND_UPGRADE_REQUIRED') $$;
create or replace function public.wb1_reserve_free_scan_v2(p_user_id text,p_request_id uuid,p_ip_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare d date:=(now() at time zone 'UTC')::date; policy public.wb1_free_budget_policy;
begin
 if p_user_id is null or p_request_id is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_ip_digest is null or p_ip_digest !~ '^[a-f0-9]{64}$' then raise exception 'TRUSTED_IP_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('warboost-free-scan:'||d::text,0));
 select * into policy from public.wb1_free_budget_policy where singleton for share;
 if not found or not policy.enabled then return jsonb_build_object('reserved',false,'reason','FREE_BUDGET_DISABLED'); end if;
 if exists(select 1 from public.wb1_free_scan_usage where request_id=p_request_id)
   then raise exception 'SCAN_REQUEST_ALREADY_USED'; end if;
 if coalesce((select reserved from public.wb1_free_scan_daily where usage_day=d),0)>=policy.global_daily
 then return jsonb_build_object('reserved',false,'reason','FREE_GLOBAL_BUDGET_REACHED'); end if;
 if (select count(*) from public.wb1_free_scan_usage where usage_day=d and user_id=p_user_id)>=policy.per_account
 then return jsonb_build_object('reserved',false,'reason','FREE_ACCOUNT_LIMIT_REACHED'); end if;
 if coalesce((select reserved from public.wb1_free_scan_ip_daily where usage_day=d and ip_digest=p_ip_digest),0)>=policy.per_ip
 then return jsonb_build_object('reserved',false,'reason','FREE_NETWORK_LIMIT_REACHED'); end if;
 insert into public.wb1_free_scan_usage(user_id,request_id,usage_day) values(p_user_id,p_request_id,d);
 insert into public.wb1_free_scan_daily values(d,1) on conflict(usage_day) do update set reserved=wb1_free_scan_daily.reserved+1;
 insert into public.wb1_free_scan_ip_daily values(d,p_ip_digest,1) on conflict(usage_day,ip_digest)
   do update set reserved=wb1_free_scan_ip_daily.reserved+1;
 return jsonb_build_object('reserved',true);
end $$;

-- Separate WarBoost governance. Never confers game rank, canonical manager
-- predicates, PRO, canonical membership or access to legacy alliance data.
create table if not exists public.wb1_autonomous_spaces(
 owner_id text primary key references public.wb1_alliance_founder_spaces(founder_id),
 server_id text not null, alliance_tag text not null,
 created_at timestamptz not null default now(),
 unique(server_id,alliance_tag)
);
create table if not exists public.wb1_autonomous_members(
 space_id text not null references public.wb1_autonomous_spaces(owner_id),
 player_id text primary key references public.wb1_profiles(player_id) on delete cascade,
 nickname text not null, status text not null check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
alter table public.wb1_autonomous_spaces enable row level security;
alter table public.wb1_autonomous_members enable row level security;
revoke all on public.wb1_autonomous_spaces,public.wb1_autonomous_members from public,anon,authenticated,service_role;

create or replace function public.wb1_workspace_access(p_user_id text,p_action text,p_target text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
#variable_conflict use_variable
declare s jsonb; v_server text; v_tag text; v_name text; owner_id text;
 draft public.wb1_alliance_founder_spaces; m public.wb1_autonomous_members; result jsonb;
begin
 if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_action is null or p_action not in ('open_space','request_space','list_space','approve_space','reject_space','view_space')
 then raise exception 'WORKSPACE_ACTION_INVALID'; end if;
 -- Shared bounded lock: serializes ownership, acceptance and roster edits.
 perform pg_advisory_xact_lock(hashtextextended('wb-autonomous-spaces-v1',0));
 select state into s from public.wb1_profiles where player_id=p_user_id for share;
 v_server:=s#>>'{player,server_id}'; v_tag:=upper(btrim(s#>>'{alliance,tag}')); v_name:=btrim(s#>>'{player,name}');
 if coalesce(v_server,'') !~ '^[0-9]{1,20}$' or coalesce(v_tag,'')='' or length(v_tag)>24
 or coalesce(v_name,'')='' then raise exception 'ALLIANCE_IDENTITY_REQUIRED'; end if;
 -- Cannot seize or shadow a legacy/canonical space, even if created since publication.
 lock table public.wb1_alliances in share mode;
 if exists(select 1 from public.wb1_alliances where server_id=v_server and upper(btrim(tag))=v_tag)
 then raise exception 'EXISTING_CANONICAL_SPACE_USE_MEMBERSHIP_REQUEST'; end if;
 select a.owner_id into owner_id from public.wb1_autonomous_spaces a where server_id=v_server and alliance_tag=v_tag;
 if p_action='open_space' then
   if exists(select 1 from public.wb1_alliance_members where player_id=p_user_id)
     or exists(select 1 from public.wb1_alliances where owner_player_id=p_user_id)
     then raise exception 'WORKSPACE_SWITCH_REVIEW_REQUIRED'; end if;
   if owner_id is not null and owner_id<>p_user_id then raise exception 'WORKSPACE_EXISTS_REQUEST_MEMBERSHIP'; end if;
   if exists(select 1 from public.wb1_autonomous_members where player_id=p_user_id and space_id<>p_user_id and status<>'rejected')
     then raise exception 'WORKSPACE_SWITCH_REVIEW_REQUIRED'; end if;
   select * into draft from public.wb1_alliance_founder_spaces where founder_id=p_user_id for update;
   if not found or draft.server_id<>v_server or draft.alliance_tag<>v_tag then raise exception 'ALLIANCE_DRAFT_IDENTITY_CHANGED'; end if;
   insert into public.wb1_autonomous_spaces(owner_id,server_id,alliance_tag) values(p_user_id,v_server,v_tag)
     on conflict on constraint wb1_autonomous_spaces_pkey do nothing;
   owner_id:=p_user_id;
 end if;
 if owner_id is null then raise exception 'WORKSPACE_NOT_FOUND'; end if;
 select * into draft from public.wb1_alliance_founder_spaces where founder_id=owner_id for share;
 if draft.server_id<>v_server or draft.alliance_tag<>v_tag then raise exception 'WORKSPACE_IDENTITY_CHANGED'; end if;
 if p_action='request_space' then
   if exists(select 1 from public.wb1_alliance_members where player_id=p_user_id)
      or exists(select 1 from public.wb1_autonomous_spaces where wb1_autonomous_spaces.owner_id=p_user_id and p_user_id<>owner_id)
     then raise exception 'WORKSPACE_SWITCH_REVIEW_REQUIRED'; end if;
   if (select count(*) from public.wb1_autonomous_members where space_id=owner_id)>=100
      and not exists(select 1 from public.wb1_autonomous_members where player_id=p_user_id)
     then raise exception 'WORKSPACE_REQUEST_LIMIT'; end if;
   insert into public.wb1_autonomous_members(space_id,player_id,nickname,status)
     values(owner_id,p_user_id,v_name,'pending') on conflict(player_id) do nothing;
   select * into m from public.wb1_autonomous_members where player_id=p_user_id;
   if m.space_id<>owner_id or m.nickname<>v_name then raise exception 'WORKSPACE_IDENTITY_CHANGED'; end if;
   return jsonb_build_object('status',m.status,'game_role_verified',false);
 end if;
 if p_action in ('list_space','approve_space','reject_space','open_space') then
   if owner_id<>p_user_id then raise exception 'WORKSPACE_OWNER_REQUIRED'; end if;
   if p_action in ('approve_space','reject_space') then
     select * into m from public.wb1_autonomous_members where player_id=p_target and space_id=owner_id for update;
     if not found then raise exception 'WORKSPACE_REQUEST_NOT_FOUND'; end if;
     select state into s from public.wb1_profiles where player_id=m.player_id for share;
     if s#>>'{player,server_id}' is distinct from v_server
       or upper(btrim(s#>>'{alliance,tag}')) is distinct from v_tag
       or btrim(s#>>'{player,name}') is distinct from m.nickname then raise exception 'WORKSPACE_IDENTITY_CHANGED'; end if;
     if p_action='approve_space' and
       (select count(*) from jsonb_array_elements(draft.roster_draft) r where lower(btrim(r->>'name'))=lower(m.nickname))<>1
       then raise exception 'WORKSPACE_ROSTER_IDENTITY_REQUIRED'; end if;
     if p_action='approve_space' and exists(select 1 from public.wb1_autonomous_members
       where space_id=owner_id and player_id<>m.player_id and status='approved' and lower(nickname)=lower(m.nickname))
       then raise exception 'WORKSPACE_IDENTITY_ALREADY_LINKED'; end if;
     update public.wb1_autonomous_members set status=case when p_action='approve_space' then 'approved' else 'rejected' end,
       reviewed_at=clock_timestamp() where player_id=m.player_id;
   end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',player_id,'nickname',nickname,'status',status)),'[]') into result
     from public.wb1_autonomous_members where space_id=owner_id;
   return jsonb_build_object('requests',result,'warboost_owner',true,'game_role_verified',false);
 end if;
 select * into m from public.wb1_autonomous_members where player_id=p_user_id and space_id=owner_id;
 if owner_id<>p_user_id and (m.status is distinct from 'approved' or m.nickname is distinct from v_name
   or (select count(*) from jsonb_array_elements(draft.roster_draft) r where lower(btrim(r->>'name'))=lower(m.nickname))<>1)
 then raise exception 'WORKSPACE_APPROVAL_REQUIRED'; end if;
 return jsonb_build_object('roster_draft',draft.roster_draft,'game_role_verified',false,'warboost_owner',owner_id=p_user_id);
end $$;

-- A roster edit cannot silently detach an accepted account. Owner must explicitly
-- reject/revoke that membership first. Trigger only on our own private draft table.
create or replace function public.wb1_workspace_roster_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('wb-autonomous-spaces-v1',0));
 if exists(select 1 from public.wb1_autonomous_members m where m.space_id=new.founder_id and m.status='approved'
   and (select count(*) from jsonb_array_elements(new.roster_draft) r where lower(btrim(r->>'name'))=lower(m.nickname))<>1)
 then raise exception 'WORKSPACE_ACCEPTED_MEMBER_REVIEW_REQUIRED'; end if;
 return new;
end $$;
-- Take the same lock before the row lock in the old founder RPC (patched in source).
create or replace trigger wb1_workspace_roster_guard_trg before update of roster_draft on public.wb1_alliance_founder_spaces
for each row execute function public.wb1_workspace_roster_guard();

revoke all on function public.wb1_reserve_free_scan_v2(text,uuid,text),public.wb1_workspace_access(text,text,text),
 public.wb1_workspace_roster_guard() from public,anon,authenticated;
grant execute on function public.wb1_reserve_free_scan_v2(text,uuid,text),public.wb1_workspace_access(text,text,text) to service_role;
revoke all on function public.wb1_workspace_roster_guard() from service_role;

create or replace function public.wb1_assert_workspace_budget_contract()
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare t text; p regprocedure; expected_owner oid; expected record;
begin
 perform public.wb1_assert_free_access_contract();
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace
   and proname in ('wb1_workspace_access','wb1_reserve_free_scan_v2') group by proname having count(*)<>1)
 then raise exception 'WORKSPACE_OVERLOAD_CONTRACT'; end if;
 select relowner into expected_owner from pg_class where oid='public.wb1_alliance_founder_spaces'::regclass;
 foreach t in array array['wb1_free_budget_policy','wb1_free_scan_ip_daily','wb1_autonomous_spaces','wb1_autonomous_members'] loop
   if not exists(select 1 from pg_class c where c.oid=('public.'||t)::regclass
     and c.relrowsecurity and c.relowner=expected_owner)
     or exists(select 1 from pg_policy where polrelid=('public.'||t)::regclass)
     or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
       where c.oid=('public.'||t)::regclass and x.grantee<>expected_owner)
     then raise exception 'WORKSPACE_TABLE_CONTRACT'; end if;
 end loop;
 for expected in select * from (values
   ('wb1_free_budget_policy','singleton','boolean'),('wb1_free_budget_policy','enabled','boolean'),
   ('wb1_free_budget_policy','per_account','integer'),('wb1_free_budget_policy','global_daily','integer'),
   ('wb1_free_budget_policy','per_ip','integer'),('wb1_free_budget_policy','updated_at','timestamp with time zone'),
   ('wb1_free_scan_ip_daily','usage_day','date'),('wb1_free_scan_ip_daily','ip_digest','text'),('wb1_free_scan_ip_daily','reserved','integer'),
   ('wb1_autonomous_spaces','owner_id','text'),('wb1_autonomous_spaces','server_id','text'),
   ('wb1_autonomous_spaces','alliance_tag','text'),('wb1_autonomous_spaces','created_at','timestamp with time zone'),
   ('wb1_autonomous_members','space_id','text'),('wb1_autonomous_members','player_id','text'),
   ('wb1_autonomous_members','nickname','text'),('wb1_autonomous_members','status','text'),
   ('wb1_autonomous_members','created_at','timestamp with time zone'),('wb1_autonomous_members','reviewed_at','timestamp with time zone')
 ) v(tbl,col,typ) loop
   if not exists(select 1 from pg_attribute where attrelid=('public.'||expected.tbl)::regclass
     and attname=expected.col and not attisdropped and format_type(atttypid,atttypmod)=expected.typ
     and (attnotnull or expected.col='reviewed_at'))
   then raise exception 'WORKSPACE_COLUMN_CONTRACT'; end if;
 end loop;
 for expected in select * from (values
   ('wb1_free_budget_policy','PRIMARY KEY (singleton)'),
   ('wb1_free_scan_ip_daily','PRIMARY KEY (usage_day, ip_digest)'),
   ('wb1_autonomous_spaces','PRIMARY KEY (owner_id)'),
   ('wb1_autonomous_spaces','UNIQUE (server_id, alliance_tag)'),
   ('wb1_autonomous_spaces','FOREIGN KEY (owner_id) REFERENCES public.wb1_alliance_founder_spaces(founder_id)'),
   ('wb1_autonomous_members','PRIMARY KEY (player_id)'),
   ('wb1_autonomous_members','FOREIGN KEY (space_id) REFERENCES public.wb1_autonomous_spaces(owner_id)'),
   ('wb1_autonomous_members','FOREIGN KEY (player_id) REFERENCES public.wb1_profiles(player_id) ON DELETE CASCADE')
 ) v(tbl,def) loop
   if not exists(select 1 from pg_constraint where conrelid=('public.'||expected.tbl)::regclass and convalidated
     and pg_get_constraintdef(oid)=expected.def) then raise exception 'WORKSPACE_CONSTRAINT_CONTRACT'; end if;
 end loop;
 foreach p in array array['public.wb1_workspace_access(text,text,text)'::regprocedure,
   'public.wb1_reserve_free_scan_v2(text,uuid,text)'::regprocedure,
   'public.wb1_workspace_roster_guard()'::regprocedure,
   'public.wb1_assert_workspace_budget_contract()'::regprocedure] loop
   if not exists(select 1 from pg_proc where oid=p and prosecdef and proowner=expected_owner and proconfig @> array['search_path=pg_catalog'])
     or has_function_privilege('anon',p,'EXECUTE') or has_function_privilege('authenticated',p,'EXECUTE')
     then raise exception 'WORKSPACE_FUNCTION_CONTRACT'; end if;
 end loop;
 if not has_function_privilege('service_role','public.wb1_workspace_access(text,text,text)','EXECUTE')
   or not has_function_privilege('service_role','public.wb1_reserve_free_scan_v2(text,uuid,text)','EXECUTE')
   or has_function_privilege('service_role','public.wb1_workspace_roster_guard()','EXECUTE')
   or has_function_privilege('service_role','public.wb1_assert_workspace_budget_contract()','EXECUTE')
 then raise exception 'WORKSPACE_SERVICE_ACL_CONTRACT'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.wb1_alliance_founder_spaces'::regclass
   and tgname='wb1_workspace_roster_guard_trg' and tgenabled='O' and tgfoid='public.wb1_workspace_roster_guard()'::regprocedure)
 then raise exception 'WORKSPACE_TRIGGER_CONTRACT'; end if;
end $$;
revoke all on function public.wb1_assert_workspace_budget_contract() from public,anon,authenticated,service_role;
select public.wb1_assert_workspace_budget_contract();
commit;
