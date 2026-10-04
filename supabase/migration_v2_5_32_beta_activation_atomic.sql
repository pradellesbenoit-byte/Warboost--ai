-- MANUAL application only. After migration_v2_5_26_beta_invites.sql.
-- No existing invitation, grant, profile or alliance is rewritten.
begin;
create table if not exists public.wb1_beta_signup_policy (
  singleton boolean primary key default true check(singleton),
  code_source text not null default 'beta-code-hf8.6.5' check(code_source='beta-code-hf8.6.5'),
  max_users integer not null default 25 check(max_users=25),
  accept_until timestamptz not null default '2026-10-31T23:59:59Z'
);
insert into public.wb1_beta_signup_policy(singleton) values(true) on conflict do nothing;
alter table public.wb1_beta_signup_policy enable row level security;
revoke all on public.wb1_beta_signup_policy from public,anon,authenticated;
grant select on public.wb1_beta_signup_policy to service_role;

-- Statement-level locking runs before row locks (avoids inversion with the RPC).
create or replace function public.wb1_lock_beta_signup_capacity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from wb1_beta_signup_policy where singleton for update;
  return null;
end $$;
revoke all on function public.wb1_lock_beta_signup_capacity() from public,anon,authenticated;
drop trigger if exists wb1_beta_signup_capacity_lock on public.wb1_beta_invites;
create trigger wb1_beta_signup_capacity_lock before insert or update or delete on public.wb1_beta_invites
  for each statement execute function public.wb1_lock_beta_signup_capacity();

-- Every writer, including admin restoration, must acquire the same capacity lock.
create or replace function public.wb1_guard_beta_signup_capacity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.wb1_beta_signup_policy; old_counted boolean; new_counted boolean; used integer;
begin
  select * into strict p from wb1_beta_signup_policy where singleton for update;
  if TG_OP='DELETE' then return OLD; end if;
  old_counted := TG_OP='UPDATE' and OLD.invited_by_user_id=p.code_source and OLD.status in ('pending','accepted');
  new_counted := NEW.invited_by_user_id=p.code_source and NEW.status in ('pending','accepted');
  if new_counted and not coalesce(old_counted,false) then
    select count(*) into used from wb1_beta_invites
      where invited_by_user_id=p.code_source and status in ('pending','accepted');
    if used>=p.max_users then raise exception using errcode='P0001',message='BETA_CODE_FULL'; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.wb1_guard_beta_signup_capacity() from public,anon,authenticated;
drop trigger if exists wb1_beta_signup_capacity on public.wb1_beta_invites;
create trigger wb1_beta_signup_capacity before insert or update or delete on public.wb1_beta_invites
  for each row execute function public.wb1_guard_beta_signup_capacity();

create or replace function public.wb1_activate_beta_invitation(p_user_id uuid,p_code_verified boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.wb1_beta_signup_policy; invite public.wb1_beta_invites;
  account_email text; used integer; stamp timestamptz;
begin
  select * into strict p from wb1_beta_signup_policy where singleton for update;
  stamp:=clock_timestamp();
  -- Identity comes from auth.users, never a browser email or nickname.
  select lower(trim(email)) into account_email from auth.users where id=p_user_id for share;
  if account_email is null or account_email='' then
    return jsonb_build_object('ok',false,'error','BETA_ACCESS_EMAIL_REQUIRED');
  end if;
  -- Stable ownership survives an authenticated email change; revocation cannot be bypassed that way.
  select * into invite from wb1_beta_invites where accepted_user_id=p_user_id::text
    order by case when status='revoked' then 0 when status='accepted' then 1 else 2 end,invited_at,id limit 1 for update;
  if not found then
    select * into invite from wb1_beta_invites where email=account_email for update;
  end if;
  if invite.id is not null then
    if invite.accepted_user_id is not null and invite.accepted_user_id<>p_user_id::text then
      return jsonb_build_object('ok',false,'error','BETA_INVITE_OWNER_MISMATCH');
    end if;
    if invite.status='revoked' then return jsonb_build_object('ok',false,'error','BETA_ACCESS_REVOKED'); end if;
    if invite.expires_at is not null and invite.expires_at<=stamp then
      return jsonb_build_object('ok',false,'error','BETA_INVITE_EXPIRED');
    end if;
    if invite.status in ('pending','accepted') then
      update wb1_beta_invites set status='accepted',accepted_user_id=p_user_id::text,
        accepted_at=coalesce(accepted_at,stamp),updated_at=stamp where id=invite.id;
      return jsonb_build_object('ok',true,'allowed',true,'already_allowed',true);
    end if;
    return jsonb_build_object('ok',false,'error','BETA_INVITE_REQUIRED');
  end if;
  if stamp>p.accept_until then return jsonb_build_object('ok',false,'error','BETA_CODE_EXPIRED'); end if;
  if p_code_verified is not true then return jsonb_build_object('ok',false,'error','BETA_CODE_INVALID'); end if;
  select count(*) into used from wb1_beta_invites where invited_by_user_id=p.code_source and status in ('pending','accepted');
  if used>=p.max_users then return jsonb_build_object('ok',false,'error','BETA_CODE_FULL'); end if;
  insert into wb1_beta_invites(email,status,note,invited_by_user_id,invited_at,accepted_at,accepted_user_id,updated_at)
    values(account_email,'accepted','Accès par code bêta privé HF8.6.5',p.code_source,stamp,stamp,p_user_id::text,stamp);
  return jsonb_build_object('ok',true,'allowed',true,'already_allowed',false,'remaining',p.max_users-used-1);
end $$;
revoke all on function public.wb1_activate_beta_invitation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.wb1_activate_beta_invitation(uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;