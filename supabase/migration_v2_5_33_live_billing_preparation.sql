-- LIVE billing preparation only. Apply manually after review to an isolated
-- staging database; this migration is never run by application startup.
-- It is additive and does not alter existing subscriptions, profiles or players.
begin;

alter table public.warboost_billing_accounts
  add column if not exists stripe_live_customer_id text;
create unique index if not exists warboost_billing_accounts_live_customer_uidx
  on public.warboost_billing_accounts(stripe_live_customer_id)
  where stripe_live_customer_id is not null;

create table if not exists public.warboost_live_checkout_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nonce uuid not null default gen_random_uuid(),
  state text not null default 'creating' check(state in ('creating','open','expired')),
  session_id text unique,
  checkout_url text,
  expires_at timestamptz not null,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.warboost_live_commercial_consents (
  consent_event_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_version text not null,
  terms_url text not null,
  privacy_url text not null,
  billing_country text not null check(billing_country ~ '^[A-Z]{2}$'),
  accepted_at timestamptz not null default now()
);

-- Upgrade an already-created draft ledger without discarding any consent rows.
-- Repeated executions are safe; each historical row receives its own event ID.
drop trigger if exists warboost_live_consents_append_only
  on public.warboost_live_commercial_consents;
alter table public.warboost_live_commercial_consents
  add column if not exists consent_event_id uuid;
update public.warboost_live_commercial_consents
  set consent_event_id=gen_random_uuid()
  where consent_event_id is null;
alter table public.warboost_live_commercial_consents
  alter column consent_event_id set default gen_random_uuid(),
  alter column consent_event_id set not null;
alter table public.warboost_live_commercial_consents
  drop constraint if exists warboost_live_commercial_consents_pkey;
alter table public.warboost_live_commercial_consents
  add constraint warboost_live_commercial_consents_pkey primary key(consent_event_id);

create table if not exists public.warboost_live_billing_events (
  event_id text primary key,
  event_type text not null,
  provider_created bigint not null,
  customer_id text,
  subscription_id text,
  user_id uuid references auth.users(id) on delete set null,
  processed boolean not null default false,
  processing_status text not null default 'pending'
    check(processing_status in ('pending','processing','processed','ignored','failed')),
  processing_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists warboost_live_billing_events_retry_idx
  on public.warboost_live_billing_events(processing_status,lease_until);
comment on table public.warboost_live_commercial_consents is
  'Append-only LIVE consent evidence. Updates/deletes are refused; account deletion cascades for privacy.';
comment on table public.warboost_live_billing_events is
  'LIVE-only event idempotency ledger. No event payload, email, card data, address or secret.';

do $$
declare t text;
begin
  foreach t in array array[
    'warboost_live_checkout_attempts',
    'warboost_live_commercial_consents',
    'warboost_live_billing_events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.warboost_live_reject_consent_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  -- Preserve the existing account-deletion cascade while refusing direct mutation.
  if tg_op='DELETE' and pg_trigger_depth()>1 then return old; end if;
  raise exception 'LIVE_CONSENT_APPEND_ONLY';
end $$;
create trigger warboost_live_consents_append_only
  before update or delete on public.warboost_live_commercial_consents
  for each row execute function public.warboost_live_reject_consent_mutation();

drop function if exists public.warboost_live_record_commercial_consent(uuid,text,text,text,text);
create or replace function public.warboost_live_record_commercial_consent(
  p_consent_event_id uuid,p_user_id uuid,p_consent_version text,p_terms_url text,
  p_privacy_url text,p_billing_country text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_consent_event_id is null or p_user_id is null or
     p_consent_version is null or length(p_consent_version)>80 or
     p_terms_url !~ '^https://' or p_privacy_url !~ '^https://' or
     p_billing_country !~ '^[A-Z]{2}$' then
    raise exception 'INVALID_COMMERCIAL_CONSENT';
  end if;
  insert into warboost_live_commercial_consents(
    consent_event_id,user_id,consent_version,terms_url,privacy_url,billing_country)
    values(p_consent_event_id,p_user_id,p_consent_version,p_terms_url,p_privacy_url,p_billing_country);
  return p_consent_event_id;
end $$;

-- Both mode-specific leases share the same per-user lock and exclude each
-- other's pending/open session, preventing concurrent TEST and LIVE sessions.
create or replace function public.warboost_claim_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_checkout_attempts; c text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  if exists(select 1 from warboost_live_checkout_attempts where user_id=p_user_id
    and expires_at>now() and (state='open' or lease_until>now())) then
    return jsonb_build_object('state','busy');
  end if;
  insert into warboost_billing_accounts(user_id) values(p_user_id) on conflict do nothing;
  select stripe_customer_id into c from warboost_billing_accounts where user_id=p_user_id;
  if exists(select 1 from warboost_subscriptions where user_id=p_user_id and
    status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','blocked');
  end if;
  select * into a from warboost_checkout_attempts where user_id=p_user_id for update;
  if found and a.expires_at>now() then
    if a.state='open' then return jsonb_build_object('state','open','url',a.checkout_url); end if;
    if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
    update warboost_checkout_attempts set lease_until=now()+interval '60 seconds' where user_id=p_user_id;
  else
    insert into warboost_checkout_attempts(user_id,expires_at,lease_until)
      values(p_user_id,now()+interval '35 minutes',now()+interval '60 seconds')
      on conflict(user_id) do update set nonce=gen_random_uuid(),state='creating',session_id=null,
        checkout_url=null,expires_at=excluded.expires_at,lease_until=excluded.lease_until,created_at=now();
    select * into a from warboost_checkout_attempts where user_id=p_user_id;
  end if;
  return jsonb_build_object('state','creating','nonce',a.nonce,'expires_at',a.expires_at,'customer_id',c);
end $$;

create or replace function public.warboost_live_claim_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_live_checkout_attempts; c text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  if exists(select 1 from warboost_checkout_attempts where user_id=p_user_id
    and expires_at>now() and (state='open' or lease_until>now())) then
    return jsonb_build_object('state','busy');
  end if;
  insert into warboost_billing_accounts(user_id) values(p_user_id) on conflict do nothing;
  select stripe_live_customer_id into c from warboost_billing_accounts where user_id=p_user_id;
  if exists(select 1 from warboost_subscriptions where user_id=p_user_id and
    status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','blocked');
  end if;
  select * into a from warboost_live_checkout_attempts where user_id=p_user_id for update;
  if found and a.expires_at>now() then
    if a.state='open' then return jsonb_build_object('state','open','url',a.checkout_url); end if;
    if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
    update warboost_live_checkout_attempts set lease_until=now()+interval '60 seconds'
      where user_id=p_user_id;
  else
    insert into warboost_live_checkout_attempts(user_id,expires_at,lease_until)
      values(p_user_id,now()+interval '35 minutes',now()+interval '60 seconds')
      on conflict(user_id) do update set nonce=gen_random_uuid(),state='creating',
        session_id=null,checkout_url=null,expires_at=excluded.expires_at,
        lease_until=excluded.lease_until,created_at=now();
    select * into a from warboost_live_checkout_attempts where user_id=p_user_id;
  end if;
  return jsonb_build_object('state','creating','nonce',a.nonce,'expires_at',a.expires_at,'customer_id',c);
end $$;

create or replace function public.warboost_live_link_customer(p_user_id uuid,p_nonce uuid,p_customer_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from warboost_live_checkout_attempts
    where user_id=p_user_id and nonce=p_nonce and expires_at>now()) then
    raise exception 'LIVE_CHECKOUT_LEASE_INVALID';
  end if;
  update warboost_billing_accounts set stripe_live_customer_id=p_customer_id
    where user_id=p_user_id and (stripe_live_customer_id is null or stripe_live_customer_id=p_customer_id);
  if not found then raise exception 'LIVE_CUSTOMER_LINK_CONFLICT'; end if;
  return true;
end $$;

create or replace function public.warboost_live_finish_checkout(
  p_user_id uuid,p_nonce uuid,p_session_id text,p_url text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_live_checkout_attempts set state='open',session_id=p_session_id,
    checkout_url=p_url,lease_until=null
    where user_id=p_user_id and nonce=p_nonce and expires_at>now();
  if not found then raise exception 'LIVE_CHECKOUT_LEASE_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_live_begin_billing_event(
  p_event_id text,p_event_type text,p_created bigint,p_customer text,p_subscription text,p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.warboost_live_billing_events;
begin
  insert into warboost_live_billing_events(event_id,event_type,provider_created,customer_id,subscription_id)
    values(p_event_id,p_event_type,p_created,p_customer,p_subscription) on conflict do nothing;
  select * into e from warboost_live_billing_events where event_id=p_event_id for update;
  if e.processed then return jsonb_build_object('state','processed'); end if;
  if e.processing_status='processing' and e.lease_until>now()
    then return jsonb_build_object('state','busy'); end if;
  update warboost_live_billing_events set processing_status='processing',
    processing_token=p_token,lease_until=now()+interval '60 seconds',
    attempts=attempts+1,error_code=null,updated_at=now() where event_id=p_event_id;
  return jsonb_build_object('state','claimed');
end $$;

create or replace function public.warboost_live_end_billing_event(
  p_event_id text,p_token uuid,p_status text,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_status not in ('processed','ignored','failed') then raise exception 'INVALID_STATUS'; end if;
  update warboost_live_billing_events set processing_status=p_status,
    processed=(p_status in ('processed','ignored')),
    processed_at=case when p_status in ('processed','ignored') then now() else null end,
    error_code=left(p_error,80),lease_until=null,processing_token=null,updated_at=now()
    where event_id=p_event_id and processing_token=p_token;
  if not found then raise exception 'LIVE_EVENT_LEASE_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_live_apply_billing_snapshot(
  p_user_id uuid,p_token uuid,p_event_id text,p_created bigint,p_customer text,
  p_subscription text,p_price text,p_product text,p_plan text,p_status text,
  p_cancel boolean,p_period_end timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.warboost_subscriptions;
begin
  perform 1 from warboost_billing_accounts where user_id=p_user_id
    and stripe_live_customer_id=p_customer and reconcile_token=p_token
    and reconcile_until>now() for update;
  if not found then raise exception 'LIVE_ACCOUNT_LEASE_INVALID'; end if;
  select * into old from warboost_subscriptions where user_id=p_user_id for update;
  if found and old.stripe_subscription_id is not null and old.livemode is distinct from true
    and old.status not in ('canceled','incomplete_expired','inactive','free') then
    raise exception 'BILLING_MODE_CONFLICT';
  end if;
  if old.provider_event_created>p_created then return false; end if;
  if old.stripe_subscription_id is distinct from p_subscription and
     old.stripe_subscription_id is not null and
     old.status not in ('canceled','incomplete_expired','inactive','free') then return false; end if;
  insert into warboost_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,
    stripe_price_id,stripe_product_id,plan,status,cancel_at_period_end,current_period_end,
    livemode,provider_event_created,provider_event_id,updated_at)
    values(p_user_id,p_customer,p_subscription,p_price,p_product,p_plan,p_status,
      p_cancel,p_period_end,true,p_created,p_event_id,now())
    on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,
      stripe_subscription_id=excluded.stripe_subscription_id,stripe_price_id=excluded.stripe_price_id,
      stripe_product_id=excluded.stripe_product_id,plan=excluded.plan,status=excluded.status,
      cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,
      livemode=true,provider_event_created=excluded.provider_event_created,
      provider_event_id=excluded.provider_event_id,updated_at=now();
  update warboost_live_billing_events set user_id=p_user_id
    where event_id=p_event_id and processing_token=p_token;
  return true;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'warboost_live_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;

commit;
