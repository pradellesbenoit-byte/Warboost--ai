-- TEST-only recovery for a deterministic Stripe subscription-create 400.
-- A new idempotency key is permitted only after the server records that exact
-- failure and later proves, through read-only Stripe reconciliation, that no
-- subscription, invoice, or PaymentIntent was created.
alter table public.warboost_test_payment_attempts
  add column if not exists subscription_create_key_version integer not null default 1,
  add column if not exists subscription_create_failure_version integer,
  add column if not exists subscription_create_failure_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.warboost_test_payment_attempts'::regclass
      and conname='warboost_test_payment_key_version_positive'
  ) then
    alter table public.warboost_test_payment_attempts
      add constraint warboost_test_payment_key_version_positive
      check (subscription_create_key_version >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.warboost_test_payment_attempts'::regclass
      and conname='warboost_test_payment_failure_pair'
  ) then
    alter table public.warboost_test_payment_attempts
      add constraint warboost_test_payment_failure_pair
      check (
        (subscription_create_failure_version is null and subscription_create_failure_at is null)
        or (
          subscription_create_failure_version = subscription_create_key_version
          and subscription_create_failure_at is not null
        )
      );
  end if;
end $$;

-- Claims for all subscription creates/retries are serialized per user. A
-- recorded 400 has a five-minute cooldown; after it, only a recovery token is
-- issued, never a write permission.
create or replace function public.warboost_claim_test_subscription_v2(
  p_user_id uuid,p_attempt_id uuid,p_setup_intent_id text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.setup_intent_id is distinct from p_setup_intent_id then
    return jsonb_build_object('state','invalid');
  end if;
  if a.state in ('payment_pending','complete') then
    return jsonb_build_object('state',a.state,'attempt_id',a.attempt_id,
      'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,
      'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id,
      'subscription_create_key_version',a.subscription_create_key_version);
  end if;
  if a.state='subscription_creating' then
    if a.lease_until is not null and a.lease_until>now() then
      return jsonb_build_object('state','busy');
    end if;
    if a.subscription_create_failure_version=a.subscription_create_key_version
       and a.subscription_create_failure_at is not null then
      if a.subscription_create_failure_at>now()-interval '5 minutes' then
        return jsonb_build_object('state','busy');
      end if;
      update warboost_test_payment_attempts set recovery_token=gen_random_uuid(),
        lease_until=now()+interval '180 seconds',updated_at=now()
        where user_id=p_user_id and attempt_id=p_attempt_id;
      select * into a from warboost_test_payment_attempts
        where user_id=p_user_id and attempt_id=p_attempt_id;
      return jsonb_build_object('state','recovery','attempt_id',a.attempt_id,
        'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,
        'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id,
        'recovery_token',a.recovery_token,
        'subscription_create_key_version',a.subscription_create_key_version);
    end if;
    if a.expires_at<=now() then
      if a.lease_until is null or a.lease_until>now()-interval '5 minutes' then
        return jsonb_build_object('state','busy');
      end if;
      update warboost_test_payment_attempts set recovery_token=gen_random_uuid(),
        lease_until=now()+interval '180 seconds',updated_at=now()
        where user_id=p_user_id and attempt_id=p_attempt_id;
      select * into a from warboost_test_payment_attempts
        where user_id=p_user_id and attempt_id=p_attempt_id;
      return jsonb_build_object('state','recovery','attempt_id',a.attempt_id,
        'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,
        'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id,
        'recovery_token',a.recovery_token,
        'subscription_create_key_version',a.subscription_create_key_version);
    end if;
    update warboost_test_payment_attempts set recovery_token=gen_random_uuid(),
      lease_until=now()+interval '60 seconds',updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id;
    select * into a from warboost_test_payment_attempts
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('state','retry','attempt_id',a.attempt_id,
      'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,
      'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id,
      'recovery_token',a.recovery_token,
      'subscription_create_key_version',a.subscription_create_key_version);
  end if;
  if a.expires_at<=now() then return jsonb_build_object('state','invalid'); end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')
    and not (s.status='incomplete' and s.stripe_subscription_id=a.subscription_id
      and a.state in ('subscription_creating','payment_pending'))) then
    return jsonb_build_object('state','blocked');
  end if;
  if a.state<>'setup_pending' then return jsonb_build_object('state','invalid'); end if;
  update warboost_test_payment_attempts set state='subscription_creating',
    lease_until=now()+interval '60 seconds',recovery_token=gen_random_uuid(),updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='setup_pending'
      and expires_at>now();
  if not found then return jsonb_build_object('state','invalid'); end if;
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('state','creating','attempt_id',a.attempt_id,
    'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,
    'recovery_token',a.recovery_token,
    'subscription_create_key_version',a.subscription_create_key_version);
end $$;

create or replace function public.warboost_authorize_test_subscription_create_v2(
  p_user_id uuid,p_attempt_id uuid,p_recovery_token uuid,p_key_version integer
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.state<>'subscription_creating'
     or a.recovery_token is distinct from p_recovery_token
     or a.subscription_create_key_version is distinct from p_key_version
     or a.lease_until is null or a.lease_until<=now() or a.expires_at<=now()
     or a.subscription_id is not null or a.payment_intent_id is not null
     or a.subscription_create_failure_version=a.subscription_create_key_version then
    return false;
  end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')) then
    return false;
  end if;
  return true;
end $$;

-- Called only after Stripe returned a 400 invalid_request_error for the
-- subscription-create POST. It records no provider text, ids, or user data.
create or replace function public.warboost_record_test_subscription_create_failure_v2(
  p_user_id uuid,p_attempt_id uuid,p_recovery_token uuid,p_key_version integer,
  p_http_status integer,p_error_type text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  if p_http_status is distinct from 400 or p_error_type is distinct from 'invalid_request_error'
     or p_key_version is null or p_key_version<1 then
    return jsonb_build_object('state','invalid_failure_evidence');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.state<>'subscription_creating'
     or a.recovery_token is distinct from p_recovery_token
     or a.subscription_create_key_version is distinct from p_key_version
     or a.lease_until is null or a.lease_until<=now() or a.expires_at<=now()
     or a.subscription_id is not null or a.payment_intent_id is not null then
    return jsonb_build_object('state','claim_lost');
  end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','other_subscription_exists');
  end if;
  update warboost_test_payment_attempts set
    subscription_create_failure_version=p_key_version,
    subscription_create_failure_at=now(),
    lease_until=now()+interval '5 minutes',
    recovery_token=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
      and recovery_token=p_recovery_token
      and subscription_create_key_version=p_key_version
      and subscription_id is null and payment_intent_id is null;
  if not found then return jsonb_build_object('state','claim_lost'); end if;
  return jsonb_build_object('state','failure_recorded','key_version',p_key_version,
    'retry_after_seconds',300);
end $$;

-- Persist and finish are fenced by the same lease token and key version that
-- authorized the Stripe request, preventing a stale request from winning.
create or replace function public.warboost_record_test_subscription_v2(
  p_user_id uuid,p_attempt_id uuid,p_subscription_id text,p_payment_intent_id text,
  p_recovery_token uuid,p_key_version integer
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  update warboost_test_payment_attempts set subscription_id=p_subscription_id,
    payment_intent_id=p_payment_intent_id,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
      and recovery_token=p_recovery_token and subscription_create_key_version=p_key_version
      and lease_until>now() and expires_at>now()
      and (subscription_id is null or subscription_id=p_subscription_id)
      and (payment_intent_id is null or payment_intent_id=p_payment_intent_id);
  if not found then return false; end if;
  return true;
end $$;

create or replace function public.warboost_finish_test_subscription_v2(
  p_user_id uuid,p_attempt_id uuid,p_subscription_id text,p_payment_intent_id text,
  p_recovery_token uuid,p_key_version integer
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  update warboost_test_payment_attempts set state='payment_pending',
    subscription_id=p_subscription_id,payment_intent_id=p_payment_intent_id,
    lease_until=null,recovery_token=null,subscription_create_failure_version=null,
    subscription_create_failure_at=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
      and recovery_token=p_recovery_token and subscription_create_key_version=p_key_version
      and lease_until>now() and expires_at>now()
      and (subscription_id is null or subscription_id=p_subscription_id)
      and (payment_intent_id is null or payment_intent_id=p_payment_intent_id);
  if not found then return false; end if;
  return true;
end $$;

create or replace function public.warboost_finish_test_subscription_recovery_v2(
  p_user_id uuid,p_attempt_id uuid,p_recovery_token uuid,p_key_version integer,
  p_country text,p_consent_version text,p_outcome text,
  p_subscription_id text default null,p_payment_intent_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts; next_version integer;
begin
  if p_country is null or p_country !~ '^[A-Z]{2}$' or p_consent_version is null or
     length(p_consent_version)=0 or length(p_consent_version)>80 or
     p_recovery_token is null or p_key_version is null or p_key_version<1 or
     p_outcome is null or p_outcome not in ('existing','absent') then
    return jsonb_build_object('state','invalid');
  end if;
  if p_outcome='existing' and
     (p_subscription_id is null or p_subscription_id !~ '^sub_[A-Za-z0-9_]+$' or
      p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$') then
    return jsonb_build_object('state','invalid');
  end if;
  if p_outcome='absent' and (p_subscription_id is not null or p_payment_intent_id is not null) then
    return jsonb_build_object('state','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.state<>'subscription_creating'
     or a.recovery_token is distinct from p_recovery_token
     or a.subscription_create_key_version is distinct from p_key_version
     or a.lease_until is null or a.lease_until<=now() then
    return jsonb_build_object('state','recovery_claim_lost');
  end if;
  if a.billing_country<>p_country or a.consent_version<>p_consent_version then
    return jsonb_build_object('state','country_or_consent_mismatch');
  end if;
  if p_outcome='existing' then
    if (a.subscription_id is not null and a.subscription_id<>p_subscription_id) or
       (a.payment_intent_id is not null and a.payment_intent_id<>p_payment_intent_id) then
      return jsonb_build_object('state','recorded_subscription_mismatch');
    end if;
    if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
      and s.status not in ('canceled','incomplete_expired','inactive','free')
      and s.stripe_subscription_id is distinct from p_subscription_id) then
      return jsonb_build_object('state','other_subscription_exists');
    end if;
    update warboost_test_payment_attempts set state='payment_pending',
      subscription_id=p_subscription_id,payment_intent_id=p_payment_intent_id,
      expires_at=now()+interval '35 minutes',lease_until=null,recovery_token=null,
      subscription_create_failure_version=null,subscription_create_failure_at=null,
      updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
        and recovery_token=p_recovery_token and subscription_create_key_version=p_key_version;
    if not found then return jsonb_build_object('state','recovery_claim_lost'); end if;
    return jsonb_build_object('state','payment_pending','attempt_id',p_attempt_id,
      'subscription_id',p_subscription_id,'payment_intent_id',p_payment_intent_id,
      'subscription_create_key_version',p_key_version);
  end if;
  if a.subscription_id is not null or a.payment_intent_id is not null then
    return jsonb_build_object('state','recorded_subscription_missing');
  end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','other_subscription_exists');
  end if;
  if a.subscription_create_failure_version=a.subscription_create_key_version
     and a.subscription_create_failure_at is not null then
    if a.subscription_create_failure_at>now()-interval '5 minutes' then
      return jsonb_build_object('state','failure_cooldown');
    end if;
    if p_key_version=2147483647 then
      return jsonb_build_object('state','key_version_exhausted');
    end if;
    next_version:=p_key_version+1;
  else
    next_version:=p_key_version;
  end if;
  update warboost_test_payment_attempts set state='setup_pending',
    subscription_create_key_version=next_version,
    subscription_create_failure_version=null,subscription_create_failure_at=null,
    expires_at=now()+interval '35 minutes',lease_until=null,recovery_token=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
      and recovery_token=p_recovery_token and subscription_create_key_version=p_key_version
      and subscription_id is null and payment_intent_id is null;
  if not found then return jsonb_build_object('state','recovery_claim_lost'); end if;
  return jsonb_build_object('state','setup_pending','attempt_id',p_attempt_id,
    'subscription_create_key_version',next_version,
    'idempotency_key_rotated',next_version<>p_key_version);
end $$;

do $$
begin
  revoke all on function public.warboost_claim_test_subscription_v2(uuid,uuid,text)
    from public,anon,authenticated;
  grant execute on function public.warboost_claim_test_subscription_v2(uuid,uuid,text)
    to service_role;
  revoke all on function public.warboost_authorize_test_subscription_create_v2(uuid,uuid,uuid,integer)
    from public,anon,authenticated;
  grant execute on function public.warboost_authorize_test_subscription_create_v2(uuid,uuid,uuid,integer)
    to service_role;
  revoke all on function public.warboost_record_test_subscription_create_failure_v2(uuid,uuid,uuid,integer,integer,text)
    from public,anon,authenticated;
  grant execute on function public.warboost_record_test_subscription_create_failure_v2(uuid,uuid,uuid,integer,integer,text)
    to service_role;
  revoke all on function public.warboost_record_test_subscription_v2(uuid,uuid,text,text,uuid,integer)
    from public,anon,authenticated;
  grant execute on function public.warboost_record_test_subscription_v2(uuid,uuid,text,text,uuid,integer)
    to service_role;
  revoke all on function public.warboost_finish_test_subscription_v2(uuid,uuid,text,text,uuid,integer)
    from public,anon,authenticated;
  grant execute on function public.warboost_finish_test_subscription_v2(uuid,uuid,text,text,uuid,integer)
    to service_role;
  revoke all on function public.warboost_finish_test_subscription_recovery_v2(uuid,uuid,uuid,integer,text,text,text,text,text)
    from public,anon,authenticated;
  grant execute on function public.warboost_finish_test_subscription_recovery_v2(uuid,uuid,uuid,integer,text,text,text,text,text)
    to service_role;
end $$;
