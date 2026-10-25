-- PREPARATION ONLY. WarBoost-Test only; never install on production.
-- The GUC is operator approval, NOT independent project identity evidence.
-- The SQL admin connector must additionally pin project_id on the server.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$
begin
  if current_user <> 'postgres'
     or current_setting('warboost.approved_project_ref',true) is distinct from 'zaioadmbhqzeihkvdjsd'
  then raise exception 'vision_test_project_approval_required'; end if;
end $$;
create table if not exists public.wb1_vision_test_campaign (
  singleton boolean primary key default true check(singleton),
  campaign_id uuid not null unique,
  tester_digest text not null check(tester_digest ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default false,
  expires_at timestamptz not null,
  used integer not null default 0 check(used between 0 and 4),
  busy_request uuid,
  project_ref text not null default 'zaioadmbhqzeihkvdjsd'
    check(project_ref='zaioadmbhqzeihkvdjsd')
);
create table if not exists public.wb1_vision_test_attempt (
  request_id uuid primary key,
  campaign_id uuid not null references public.wb1_vision_test_campaign(campaign_id),
  scan_type text not null check(scan_type in ('squad1','drone','technology','exclusive')),
  outcome text not null default 'reserved' check(outcome in ('reserved','returned','failed')),
  created_at timestamptz not null default clock_timestamp(),
  unique(campaign_id,scan_type)
);
alter table public.wb1_vision_test_campaign enable row level security;
alter table public.wb1_vision_test_attempt enable row level security;
revoke all on public.wb1_vision_test_campaign,public.wb1_vision_test_attempt from public,anon,authenticated,service_role;
-- No test account IDs, images, prompts, provider output, credentials or emails.
create or replace function public.wb1_vision_test_control(
  p_action text,p_campaign uuid,p_tester_digest text,p_request uuid,
  p_scan_type text,p_success boolean default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
set lock_timeout='2s'
set statement_timeout='4s'
as $$
declare c public.wb1_vision_test_campaign%rowtype; changed integer;
begin
  -- A single row serializes all workers, accounts and instances.
  select * into c from public.wb1_vision_test_campaign where singleton for update;
  if not found or c.project_ref <> 'zaioadmbhqzeihkvdjsd'
     or c.campaign_id is distinct from p_campaign
     or c.tester_digest is distinct from p_tester_digest
     or p_request is null
     or p_scan_type is null or p_scan_type not in ('squad1','drone','technology','exclusive')
  then raise exception 'vision_test_contract_required'; end if;
  if p_action='reserve' then
    if not c.enabled or c.expires_at<=clock_timestamp() or c.used>=4 or c.busy_request is not null
       or exists(select 1 from public.wb1_vision_test_attempt where campaign_id=c.campaign_id and scan_type=p_scan_type)
    then return jsonb_build_object('reserved',false); end if;
    insert into public.wb1_vision_test_attempt(request_id,campaign_id,scan_type) values(p_request,p_campaign,p_scan_type);
    update public.wb1_vision_test_campaign set used=used+1,busy_request=p_request where singleton;
    return jsonb_build_object('reserved',true,'request_id',p_request);
  elsif p_action='finish' then
    -- OFF/expiry never prevent completion. They never refund the attempt.
    if p_success is null then raise exception 'vision_test_outcome_required'; end if;
    if exists(select 1 from public.wb1_vision_test_attempt
      where request_id=p_request and campaign_id=p_campaign and scan_type=p_scan_type
      and outcome in ('returned','failed'))
    then return jsonb_build_object('finished',true); end if;
    if c.busy_request is distinct from p_request then raise exception 'vision_test_lease_mismatch'; end if;
    update public.wb1_vision_test_attempt set outcome=case when p_success then 'returned' else 'failed' end
      where request_id=p_request and campaign_id=p_campaign and scan_type=p_scan_type and outcome='reserved';
    get diagnostics changed=row_count;
    if changed<>1 then raise exception 'vision_test_attempt_mismatch'; end if;
    -- Unknown provider delivery may still be running. An error permanently
    -- poisons the lease; only a separately reviewed manual recovery can help.
    if p_success then
      update public.wb1_vision_test_campaign set busy_request=null where singleton;
    end if;
    return jsonb_build_object('finished',true);
  end if;
  raise exception 'vision_test_action_forbidden';
end $$;
alter function public.wb1_vision_test_control(text,uuid,text,uuid,text,boolean) owner to postgres;
revoke all on function public.wb1_vision_test_control(text,uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.wb1_vision_test_control(text,uuid,text,uuid,text,boolean) to service_role;
-- Deliberately EMPTY and OFF. Installation cannot start a campaign.
commit;
