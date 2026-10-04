-- Apply MANUALLY to an isolated Supabase TEST database after HF8 commercial readiness.
-- No startup migration, no Stripe call, no live activation, no alliance/rank changes.
begin;
alter table public.warboost_subscriptions add column if not exists livemode boolean;
alter table public.warboost_subscriptions add column if not exists stripe_product_id text;
alter table public.warboost_subscriptions add column if not exists provider_event_created bigint;
alter table public.warboost_subscriptions add column if not exists provider_event_id text;
alter table public.warboost_subscriptions enable row level security;
revoke all on public.warboost_subscriptions from public,anon,authenticated;
grant select on public.warboost_subscriptions to authenticated;
grant select,insert,update,delete on public.warboost_subscriptions to service_role;

create table if not exists public.warboost_billing_policy (
  singleton boolean primary key default true check(singleton),
  beta_cohort_cutoff timestamptz not null default now()
);
insert into public.warboost_billing_policy(singleton) values(true) on conflict do nothing;

create table if not exists public.warboost_pro_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  grant_type text not null check(grant_type='beta'),
  source text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.warboost_billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  reconcile_token uuid,
  reconcile_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.warboost_checkout_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nonce uuid not null default gen_random_uuid(),
  state text not null default 'creating' check(state in ('creating','open','expired')),
  session_id text unique,
  checkout_url text,
  expires_at timestamptz not null,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.warboost_billing_events (
  event_id text primary key,
  event_type text not null,
  processed boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.warboost_billing_events add column if not exists processing_status text not null default 'pending';
alter table public.warboost_billing_events add column if not exists customer_id text;
alter table public.warboost_billing_events add column if not exists subscription_id text;
alter table public.warboost_billing_events add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.warboost_billing_events add column if not exists provider_created bigint;
alter table public.warboost_billing_events add column if not exists processing_token uuid;
alter table public.warboost_billing_events add column if not exists lease_until timestamptz;
alter table public.warboost_billing_events add column if not exists attempts integer not null default 0;
alter table public.warboost_billing_events add column if not exists error_code text;
create index if not exists warboost_billing_events_retry_idx on public.warboost_billing_events(processing_status,lease_until);
comment on table public.warboost_billing_events is 'TEST-only server ledger: safe provider references and fixed error codes; no raw payload, email, card, address or secret.';

do $$
declare t text;
begin
  foreach t in array array['warboost_billing_policy','warboost_pro_grants','warboost_billing_accounts','warboost_checkout_attempts','warboost_billing_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.warboost_claim_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_checkout_attempts; c text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  insert into warboost_billing_accounts(user_id) values(p_user_id) on conflict do nothing;
  select stripe_customer_id into c from warboost_billing_accounts where user_id=p_user_id;
  if exists(select 1 from warboost_subscriptions where user_id=p_user_id and status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','blocked');
  end if;
  select * into a from warboost_checkout_attempts where user_id=p_user_id for update;
  if found and a.expires_at>now() then
    if a.state='open' then return jsonb_build_object('state','open','url',a.checkout_url); end if;
    if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
    -- Keep the nonce and expires_at after a network/DB failure: same Stripe idempotency key.
    update warboost_checkout_attempts set lease_until=now()+interval '60 seconds' where user_id=p_user_id;
  else
    insert into warboost_checkout_attempts(user_id,expires_at,lease_until)
      values(p_user_id,now()+interval '35 minutes',now()+interval '60 seconds')
      on conflict(user_id) do update set nonce=gen_random_uuid(),state='creating',session_id=null,checkout_url=null,
        expires_at=excluded.expires_at,lease_until=excluded.lease_until,created_at=now();
    select * into a from warboost_checkout_attempts where user_id=p_user_id;
  end if;
  return jsonb_build_object('state','creating','nonce',a.nonce,'expires_at',a.expires_at,'customer_id',c);
end $$;

create or replace function public.warboost_link_customer(p_user_id uuid,p_nonce uuid,p_customer_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from warboost_checkout_attempts where user_id=p_user_id and nonce=p_nonce and expires_at>now()) then raise exception 'CHECKOUT_LEASE_INVALID'; end if;
  update warboost_billing_accounts set stripe_customer_id=p_customer_id
    where user_id=p_user_id and (stripe_customer_id is null or stripe_customer_id=p_customer_id);
  if not found then raise exception 'CUSTOMER_LINK_CONFLICT'; end if;
  return true;
end $$;
create or replace function public.warboost_finish_checkout(p_user_id uuid,p_nonce uuid,p_session_id text,p_url text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_checkout_attempts set state='open',session_id=p_session_id,checkout_url=p_url,lease_until=null
    where user_id=p_user_id and nonce=p_nonce and expires_at>now();
  if not found then raise exception 'CHECKOUT_LEASE_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_begin_billing_event(p_event_id text,p_event_type text,p_created bigint,p_customer text,p_subscription text,p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.warboost_billing_events;
begin
  insert into warboost_billing_events(event_id,event_type,provider_created,customer_id,subscription_id)
    values(p_event_id,p_event_type,p_created,p_customer,p_subscription) on conflict do nothing;
  select * into e from warboost_billing_events where event_id=p_event_id for update;
  if e.processed then return jsonb_build_object('state','processed'); end if;
  if e.processing_status='processing' and e.lease_until>now() then return jsonb_build_object('state','busy'); end if;
  update warboost_billing_events set processing_status='processing',processing_token=p_token,
    lease_until=now()+interval '60 seconds',attempts=attempts+1,error_code=null,updated_at=now() where event_id=p_event_id;
  return jsonb_build_object('state','claimed');
end $$;
create or replace function public.warboost_end_billing_event(p_event_id text,p_token uuid,p_status text,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_status not in ('processed','ignored','failed') then raise exception 'INVALID_STATUS'; end if;
  update warboost_billing_events set processing_status=p_status,processed=(p_status in ('processed','ignored')),
    processed_at=case when p_status in ('processed','ignored') then now() else null end,
    error_code=left(p_error,80),lease_until=null,processing_token=null,updated_at=now()
    where event_id=p_event_id and processing_token=p_token;
  if not found then raise exception 'EVENT_LEASE_INVALID'; end if;
  return true;
end $$;
create or replace function public.warboost_lock_billing_account(p_user_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_billing_accounts set reconcile_token=p_token,reconcile_until=now()+interval '60 seconds'
    where user_id=p_user_id and (reconcile_until is null or reconcile_until<=now());
  return found;
end $$;
create or replace function public.warboost_unlock_billing_account(p_user_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_billing_accounts set reconcile_token=null,reconcile_until=null where user_id=p_user_id and reconcile_token=p_token;
  return found;
end $$;
create or replace function public.warboost_apply_billing_snapshot(
  p_user_id uuid,p_token uuid,p_event_id text,p_created bigint,p_customer text,p_subscription text,p_price text,p_product text,
  p_plan text,p_status text,p_cancel boolean,p_period_end timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.warboost_subscriptions;
begin
  perform 1 from warboost_billing_accounts where user_id=p_user_id and stripe_customer_id=p_customer
    and reconcile_token=p_token and reconcile_until>now() for update;
  if not found then raise exception 'ACCOUNT_LEASE_INVALID'; end if;
  select * into old from warboost_subscriptions where user_id=p_user_id for update;
  -- Never overwrite a live or unverified historical Stripe subscription.
  if found and old.stripe_subscription_id is not null and old.livemode is distinct from false then raise exception 'HISTORICAL_SUBSCRIPTION_RECONCILIATION_REQUIRED'; end if;
  if old.provider_event_created>p_created then return false; end if;
  -- An old canceled subscription cannot revoke its replacement.
  if old.stripe_subscription_id is distinct from p_subscription and old.status not in ('canceled','incomplete_expired','inactive','free')
    and old.stripe_subscription_id is not null then return false; end if;
  insert into warboost_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_product_id,
    plan,status,cancel_at_period_end,current_period_end,livemode,provider_event_created,provider_event_id,updated_at)
    values(p_user_id,p_customer,p_subscription,p_price,p_product,p_plan,p_status,p_cancel,p_period_end,false,p_created,p_event_id,now())
    on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
      stripe_price_id=excluded.stripe_price_id,stripe_product_id=excluded.stripe_product_id,plan=excluded.plan,status=excluded.status,
      cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,livemode=false,
      provider_event_created=excluded.provider_event_created,provider_event_id=excluded.provider_event_id,updated_at=now();
  update warboost_billing_events set user_id=p_user_id where event_id=p_event_id and processing_token=p_token;
  return true;
end $$;

-- PUBLIC has EXECUTE on new functions by default: remove it explicitly, including authenticated.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('warboost_claim_checkout','warboost_link_customer','warboost_finish_checkout',
    'warboost_begin_billing_event','warboost_end_billing_event','warboost_lock_billing_account','warboost_unlock_billing_account','warboost_apply_billing_snapshot')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;