-- LOCAL PREPARATION ONLY. Review schema/ACL/backup before any separate installation approval.
-- No users, invitations, PRO grants, payments, auth.users triggers or existing data are modified.
begin;
create table public.wb1_free_scan_usage (
  user_id uuid not null references public.wb1_profiles(player_id) on delete cascade,
  request_id uuid primary key,
  usage_day date not null default (now() at time zone 'UTC')::date,
  created_at timestamptz not null default now()
);
create index wb1_free_scan_usage_day on public.wb1_free_scan_usage(usage_day,user_id);
alter table public.wb1_free_scan_usage enable row level security;
revoke all on public.wb1_free_scan_usage from public,anon,authenticated;
grant select,insert on public.wb1_free_scan_usage to service_role;
-- A non-personal global counter survives account deletion, so deletion cannot reset cost limits.
create table public.wb1_free_scan_daily (
  usage_day date primary key,
  reserved integer not null check(reserved between 0 and 30)
);
alter table public.wb1_free_scan_daily enable row level security;
revoke all on public.wb1_free_scan_daily from public,anon,authenticated;
grant select on public.wb1_free_scan_daily to service_role;

-- Three personal FREE scans/account/day, max 30 FREE scans/day across the deployment.
-- Reservation is consumed before Vision, including failures. Never refund/retry automatically.
create function public.wb1_reserve_free_scan(p_user_id uuid,p_request_id uuid)
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

create table public.wb1_alliance_access_requests (
  id uuid not null unique default gen_random_uuid(),
  player_id uuid not null references public.wb1_profiles(player_id) on delete cascade,
  alliance_id uuid not null references public.wb1_alliances(id),
  nickname text not null check(length(nickname) between 1 and 80),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(player_id,alliance_id)
);
alter table public.wb1_alliance_access_requests enable row level security;
revoke all on public.wb1_alliance_access_requests from public,anon,authenticated;
grant select,insert,update on public.wb1_alliance_access_requests to service_role;

-- Private helper: canonical linkage + matching membership/role, or existing owner.
create function public.wb1_access_manager(p_user_id uuid,p_alliance_id uuid)
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

create function public.wb1_alliance_access_request(p_user_id uuid,p_action text)
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
  if p_action<>'request' then raise exception 'ALLIANCE_ACTION_INVALID'; end if;
  select state into s from public.wb1_profiles where player_id=p_user_id;
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

create function public.wb1_review_alliance_access(p_user_id uuid,p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare q public.wb1_alliance_access_requests; a public.wb1_alliances;
  s jsonb; member jsonb; position integer; n integer; target uuid; stamp timestamptz:=clock_timestamp();
begin
  if p_accept is null then raise exception 'ALLIANCE_ACTION_INVALID'; end if;
  -- Stable ordering: alliance -> request. Never trust a browser-supplied role/user/roster.
  select alliance_id into target from public.wb1_alliance_access_requests where id=p_request_id;
  if target is null then raise exception 'ALLIANCE_REQUEST_NOT_FOUND'; end if;
  select * into a from public.wb1_alliances where id=target for no key update;
  if not public.wb1_access_manager(p_user_id,target) then raise exception 'ALLIANCE_MANAGER_REQUIRED'; end if;
  select * into q from public.wb1_alliance_access_requests where id=p_request_id for update;
  if q.status='approved' then return jsonb_build_object('status','approved','already_reviewed',true); end if;
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
  if exists(select 1 from public.wb1_alliance_members where player_id=q.player_id and alliance_id<>a.id)
    then raise exception 'ALLIANCE_SWITCH_REVIEW_REQUIRED'; end if;
  member:=member||jsonb_build_object('player_id',q.player_id,'warboost_linked',true,
    'identity_basis','lastwar_nickname_server_alliance','identity_linked_at',stamp);
  stamp:=greatest(stamp,coalesce(a.roster_updated_at,stamp)+interval '1 millisecond');
  update public.wb1_alliances set roster=jsonb_set(a.roster,array[position::text],member),
    roster_updated_at=stamp,updated_at=stamp where id=a.id;
  insert into public.wb1_alliance_members(player_id,alliance_id,role,updated_at)
    values(q.player_id,a.id,member->>'role',stamp)
    on conflict(player_id) do update set alliance_id=excluded.alliance_id,role=excluded.role,updated_at=stamp;
  update public.wb1_alliance_access_requests set status='approved',reviewed_by=p_user_id,updated_at=stamp where id=q.id;
  return jsonb_build_object('status','approved','membership_granted',true);
end $$;

revoke all on function public.wb1_reserve_free_scan(uuid,uuid) from public,anon,authenticated;
revoke all on function public.wb1_access_manager(uuid,uuid) from public,anon,authenticated;
revoke all on function public.wb1_alliance_access_request(uuid,text) from public,anon,authenticated;
revoke all on function public.wb1_review_alliance_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.wb1_reserve_free_scan(uuid,uuid) to service_role;
grant execute on function public.wb1_alliance_access_request(uuid,text) to service_role;
grant execute on function public.wb1_review_alliance_access(uuid,uuid,boolean) to service_role;
commit;
