-- PREPARATION ONLY. Additive, WarBoost-Test only. Never install on production.
-- This creates empty v2 objects; it does NOT create/enable a campaign.
-- The SQL admin connector must pin project_id independently of this GUC.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$
begin
  if current_user <> 'postgres'
     or current_setting('warboost.approved_project_ref',true) is distinct from 'zaioadmbhqzeihkvdjsd'
  then raise exception 'vision_test_project_approval_required'; end if;
end $$;

create table if not exists public.wb1_vision_test_campaign_v2 (
  singleton boolean primary key default true check(singleton),
  campaign_id uuid not null unique,
  tester_digest text not null check(tester_digest ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default false,
  expires_at timestamptz not null,
  used integer not null default 0 check(used between 0 and 1),
  busy_request uuid,
  project_ref text not null default 'zaioadmbhqzeihkvdjsd'
    check(project_ref='zaioadmbhqzeihkvdjsd')
);

create table if not exists public.wb1_vision_test_attempt_v2 (
  request_id uuid primary key,
  campaign_id uuid not null references public.wb1_vision_test_campaign_v2(campaign_id),
  scan_type text not null check(scan_type='squad1'),
  outcome text not null default 'reserved' check(outcome in ('reserved','returned','failed')),
  created_at timestamptz not null default clock_timestamp(),
  unique(campaign_id)
);

alter table public.wb1_vision_test_campaign_v2 enable row level security;
alter table public.wb1_vision_test_attempt_v2 enable row level security;
revoke all on public.wb1_vision_test_campaign_v2,public.wb1_vision_test_attempt_v2
  from public,anon,authenticated,service_role;

create or replace function public.wb1_vision_test_control_v2(
  p_action text,p_campaign_v2 uuid,p_tester_digest text,p_request uuid,
  p_scan_type text,p_success boolean default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
set lock_timeout='2s'
set statement_timeout='4s'
as $$
declare c public.wb1_vision_test_campaign_v2%rowtype; changed integer;
begin
  if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then
    raise exception 'vision_test_service_role_required';
  end if;
  if p_request is null or p_scan_type is distinct from 'squad1' then
    raise exception 'vision_test_contract_required';
  end if;
  select * into c from public.wb1_vision_test_campaign_v2 where singleton for update;
  if not found or c.project_ref <> 'zaioadmbhqzeihkvdjsd'
     or c.campaign_id is distinct from p_campaign_v2
     or c.tester_digest is distinct from p_tester_digest
  then raise exception 'vision_test_contract_required'; end if;

  if p_action='reserve' then
    if not c.enabled or c.expires_at<=clock_timestamp() or c.used>=1
       or c.busy_request is not null
       or exists(select 1 from public.wb1_vision_test_attempt_v2 where campaign_id=c.campaign_id)
    then return jsonb_build_object('reserved',false); end if;
    insert into public.wb1_vision_test_attempt_v2(request_id,campaign_id,scan_type)
      values(p_request,p_campaign_v2,'squad1');
    update public.wb1_vision_test_campaign_v2
      set used=1,busy_request=p_request where singleton;
    return jsonb_build_object('reserved',true,'request_id',p_request);
  elsif p_action='finish' then
    if p_success is null then raise exception 'vision_test_outcome_required'; end if;
    if exists(select 1 from public.wb1_vision_test_attempt_v2
      where request_id=p_request and campaign_id=p_campaign_v2 and scan_type='squad1'
        and outcome in ('returned','failed'))
    then return jsonb_build_object('finished',true); end if;
    if c.busy_request is distinct from p_request then raise exception 'vision_test_lease_mismatch'; end if;
    update public.wb1_vision_test_attempt_v2
      set outcome=case when p_success then 'returned' else 'failed' end
      where request_id=p_request and campaign_id=p_campaign_v2
        and scan_type='squad1' and outcome='reserved';
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'vision_test_attempt_mismatch'; end if;
    -- Failed/uncertain provider delivery permanently consumes the sole attempt.
    -- Success releases only the in-flight lock; used remains 1.
    if p_success then
      update public.wb1_vision_test_campaign_v2 set busy_request=null where singleton;
    end if;
    return jsonb_build_object('finished',true);
  end if;
  raise exception 'vision_test_action_forbidden';
end $$;

alter function public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean) owner to postgres;
revoke all on function public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)
  to service_role;

-- Assert that an older partial/manual object cannot be silently treated as v2.
do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.wb1_vision_test_campaign_v2'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.wb1_vision_test_attempt_v2'::regclass)
     or (select pg_get_userbyid(proowner) from pg_proc
         where oid='public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)'::regprocedure) <> 'postgres'
  then raise exception 'vision_test_v2_contract_mismatch'; end if;
end $$;
commit;
