-- TEST-only two-step card collection and subscription attempt ledger.
-- Does not alter player data and does not activate Stripe LIVE.
create table if not exists public.warboost_test_payment_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attempt_id uuid not null default gen_random_uuid(),
  state text not null check(state in
    ('creating','setup_pending','subscription_creating','payment_pending','complete','canceled')),
  billing_country text not null check(billing_country ~ '^[A-Z]{2}$'),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  stripe_customer_id text,
  setup_intent_id text unique,
  subscription_id text unique,
  payment_intent_id text,
  lease_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.warboost_test_payment_attempts enable row level security;
revoke all on public.warboost_test_payment_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.warboost_test_payment_attempts to service_role;

create or replace function public.warboost_claim_test_payment_attempt(
  p_user_id uuid,p_country text,p_consent_version text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  if p_country is null or p_country !~ '^[A-Z]{2}$' or p_consent_version is null or
    length(p_consent_version)=0 or length(p_consent_version)>80 then
    raise exception 'TEST_PAYMENT_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts where user_id=p_user_id for update;
  if found then
    if a.state in ('payment_pending','complete') then
      return jsonb_build_object('state',a.state,'attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
        'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id);
    end if;
    if a.state='subscription_creating' then
      if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
      update warboost_test_payment_attempts set lease_until=now()+interval '60 seconds',updated_at=now()
        where user_id=p_user_id;
      return jsonb_build_object('state','subscription_retry','attempt_id',a.attempt_id,
        'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id);
    end if;
  end if;
  if found and a.state in ('creating','setup_pending') and a.expires_at>now() then
    if a.billing_country<>p_country or a.consent_version<>p_consent_version then
      return jsonb_build_object('state','country_or_consent_mismatch');
    end if;
    if a.state='setup_pending' then
      return jsonb_build_object('state',a.state,'attempt_id',a.attempt_id,
        'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id);
    end if;
    if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
    update warboost_test_payment_attempts set lease_until=now()+interval '60 seconds',updated_at=now()
      where user_id=p_user_id;
    return jsonb_build_object('state','creating','attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
      'setup_intent_id',a.setup_intent_id);
  end if;
  if exists(select 1 from warboost_checkout_attempts where user_id=p_user_id and expires_at>now()) then
    return jsonb_build_object('state','checkout_exists');
  end if;
  if exists(select 1 from warboost_subscriptions where user_id=p_user_id
    and status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','blocked');
  end if;
  insert into warboost_test_payment_attempts(user_id,attempt_id,state,billing_country,consent_version,consented_at,
    stripe_customer_id,setup_intent_id,subscription_id,payment_intent_id,lease_until,expires_at,created_at,updated_at)
  values(p_user_id,gen_random_uuid(),'creating',p_country,p_consent_version,now(),
    null,null,null,null,now()+interval '60 seconds',now()+interval '35 minutes',now(),now())
  on conflict(user_id) do update set attempt_id=excluded.attempt_id,state='creating',
    billing_country=excluded.billing_country,consent_version=excluded.consent_version,consented_at=now(),
    stripe_customer_id=null,setup_intent_id=null,subscription_id=null,payment_intent_id=null,
    lease_until=excluded.lease_until,expires_at=excluded.expires_at,created_at=now(),updated_at=now();
  select * into a from warboost_test_payment_attempts where user_id=p_user_id;
  return jsonb_build_object('state','creating','attempt_id',a.attempt_id,'expires_at',a.expires_at);
end $$;

create or replace function public.warboost_link_test_payment_customer(
  p_user_id uuid,p_attempt_id uuid,p_customer_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  if not exists(select 1 from warboost_test_payment_attempts where user_id=p_user_id
    and attempt_id=p_attempt_id and state='creating' and expires_at>now()) then
    raise exception 'TEST_PAYMENT_ATTEMPT_INVALID';
  end if;
  insert into warboost_billing_accounts(user_id,stripe_customer_id) values(p_user_id,p_customer_id)
    on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id
      where warboost_billing_accounts.stripe_customer_id is null
        or warboost_billing_accounts.stripe_customer_id=excluded.stripe_customer_id;
  if not found then raise exception 'TEST_PAYMENT_CUSTOMER_CONFLICT'; end if;
  update warboost_test_payment_attempts set stripe_customer_id=p_customer_id,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='creating';
  if not found then raise exception 'TEST_PAYMENT_ATTEMPT_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_finish_test_payment_setup(
  p_user_id uuid,p_attempt_id uuid,p_customer_id text,p_setup_intent_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_test_payment_attempts set state='setup_pending',stripe_customer_id=p_customer_id,
    setup_intent_id=p_setup_intent_id,lease_until=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and expires_at>now()
      and state in ('creating','setup_pending')
      and (stripe_customer_id is null or stripe_customer_id=p_customer_id)
      and (setup_intent_id is null or setup_intent_id=p_setup_intent_id);
  if not found then raise exception 'TEST_PAYMENT_ATTEMPT_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_claim_test_subscription(
  p_user_id uuid,p_attempt_id uuid,p_setup_intent_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.expires_at<=now() or a.setup_intent_id is distinct from p_setup_intent_id then
    return jsonb_build_object('state','invalid');
  end if;
  if a.state in ('payment_pending','complete') then
    return jsonb_build_object('state',a.state,'attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
      'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id);
  end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')
    and not (s.status='incomplete' and s.stripe_subscription_id=a.subscription_id
      and a.state in ('subscription_creating','payment_pending'))) then
    return jsonb_build_object('state','blocked');
  end if;
  if a.state='subscription_creating' then
    if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
    update warboost_test_payment_attempts set lease_until=now()+interval '60 seconds',updated_at=now()
      where user_id=p_user_id;
    return jsonb_build_object('state','retry','attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
      'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id);
  end if;
  if a.state<>'setup_pending' then return jsonb_build_object('state','invalid'); end if;
  update warboost_test_payment_attempts set state='subscription_creating',lease_until=now()+interval '60 seconds',updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('state','creating','attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
    'setup_intent_id',a.setup_intent_id);
end $$;

create or replace function public.warboost_record_test_subscription(
  p_user_id uuid,p_attempt_id uuid,p_subscription_id text,p_payment_intent_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_test_payment_attempts set subscription_id=p_subscription_id,
    payment_intent_id=p_payment_intent_id,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
      and expires_at>now() and (subscription_id is null or subscription_id=p_subscription_id)
      and (payment_intent_id is null or payment_intent_id=p_payment_intent_id);
  if not found then raise exception 'TEST_PAYMENT_ATTEMPT_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_finish_test_subscription(
  p_user_id uuid,p_attempt_id uuid,p_subscription_id text,p_payment_intent_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_test_payment_attempts set state='payment_pending',subscription_id=p_subscription_id,
    payment_intent_id=p_payment_intent_id,lease_until=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state in ('subscription_creating','payment_pending')
      and expires_at>now() and (subscription_id is null or subscription_id=p_subscription_id)
      and (payment_intent_id is null or payment_intent_id=p_payment_intent_id);
  if not found then raise exception 'TEST_PAYMENT_ATTEMPT_INVALID'; end if;
  return true;
end $$;

create or replace function public.warboost_cancel_test_payment_attempt(
  p_user_id uuid,p_attempt_id uuid,p_subscription_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_test_payment_attempts set state='canceled',lease_until=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and subscription_id=p_subscription_id
      and state='payment_pending';
  if not found then raise exception 'TEST_PAYMENT_ATTEMPT_NOT_CANCELABLE'; end if;
  return true;
end $$;

create or replace function public.warboost_abort_test_subscription(
  p_user_id uuid,p_attempt_id uuid,p_subscription_id text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update warboost_test_payment_attempts set state='canceled',subscription_id=p_subscription_id,
    lease_until=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating';
  if not found then raise exception 'TEST_PAYMENT_ATTEMPT_INVALID'; end if;
  return true;
end $$;

-- Block overlap with the hosted Checkout route using the same per-user lock.
create or replace function public.warboost_claim_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_checkout_attempts; c text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  if exists(select 1 from warboost_test_payment_attempts where user_id=p_user_id
    and state not in ('canceled','complete') and
      (expires_at>now() or state in ('subscription_creating','payment_pending'))) then
    return jsonb_build_object('state','test_payment_in_progress');
  end if;
  insert into warboost_billing_accounts(user_id) values(p_user_id) on conflict do nothing;
  select stripe_customer_id into c from warboost_billing_accounts where user_id=p_user_id;
  if exists(select 1 from warboost_subscriptions where user_id=p_user_id
    and status not in ('canceled','incomplete_expired','inactive','free')) then
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
      on conflict(user_id) do update set nonce=gen_random_uuid(),state='creating',session_id=null,checkout_url=null,
        expires_at=excluded.expires_at,lease_until=excluded.lease_until,created_at=now();
    select * into a from warboost_checkout_attempts where user_id=p_user_id;
  end if;
  return jsonb_build_object('state','creating','nonce',a.nonce,'expires_at',a.expires_at,'customer_id',c);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'warboost_claim_test_payment_attempt(uuid,text,text)',
    'warboost_link_test_payment_customer(uuid,uuid,text)',
    'warboost_finish_test_payment_setup(uuid,uuid,text,text)',
    'warboost_claim_test_subscription(uuid,uuid,text)',
    'warboost_record_test_subscription(uuid,uuid,text,text)',
    'warboost_finish_test_subscription(uuid,uuid,text,text)',
    'warboost_cancel_test_payment_attempt(uuid,uuid,text)',
    'warboost_abort_test_subscription(uuid,uuid,text)',
    'warboost_claim_checkout(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public,anon,authenticated',f);
    execute format('grant execute on function public.%s to service_role',f);
  end loop;
end $$;
