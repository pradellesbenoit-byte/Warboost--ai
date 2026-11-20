-- TEST-only recovery for expired subscription-creation attempts.
-- All Stripe reconciliation is performed read-only by the authenticated server.
-- This migration never grants client access and never changes player data or LIVE billing.
alter table public.warboost_test_payment_attempts
  add column if not exists recovery_token uuid;

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
      if a.billing_country<>p_country or a.consent_version<>p_consent_version then
        return jsonb_build_object('state','country_or_consent_mismatch');
      end if;
      if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
      -- Keep a five-minute cool-off after an expired lease before recovering an
      -- expired attempt, so a timed-out API invocation cannot race the retry.
      if a.expires_at<=now() and
         (a.lease_until is null or a.lease_until>now()-interval '5 minutes') then
        return jsonb_build_object('state','busy');
      end if;
      update warboost_test_payment_attempts set recovery_token=gen_random_uuid(),
        lease_until=now()+interval '180 seconds',updated_at=now()
        where user_id=p_user_id;
      select * into a from warboost_test_payment_attempts where user_id=p_user_id;
      return jsonb_build_object('state','subscription_retry','attempt_id',a.attempt_id,
        'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id,
        'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id,
        'recovery_token',a.recovery_token);
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
    update warboost_test_payment_attempts set lease_until=now()+interval '60 seconds',
      recovery_token=null,updated_at=now() where user_id=p_user_id;
    return jsonb_build_object('state','creating','attempt_id',a.attempt_id,
      'customer_id',a.stripe_customer_id,'setup_intent_id',a.setup_intent_id);
  end if;
  if exists(select 1 from warboost_checkout_attempts where user_id=p_user_id and expires_at>now()) then
    return jsonb_build_object('state','checkout_exists');
  end if;
  if exists(select 1 from warboost_subscriptions where user_id=p_user_id
    and status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','blocked');
  end if;
  insert into warboost_test_payment_attempts(user_id,attempt_id,state,billing_country,consent_version,consented_at,
    stripe_customer_id,setup_intent_id,subscription_id,payment_intent_id,lease_until,expires_at,created_at,updated_at,recovery_token)
  values(p_user_id,gen_random_uuid(),'creating',p_country,p_consent_version,now(),
    null,null,null,null,now()+interval '60 seconds',now()+interval '35 minutes',now(),now(),null)
  on conflict(user_id) do update set attempt_id=excluded.attempt_id,state='creating',
    billing_country=excluded.billing_country,consent_version=excluded.consent_version,consented_at=now(),
    stripe_customer_id=null,setup_intent_id=null,subscription_id=null,payment_intent_id=null,
    lease_until=excluded.lease_until,expires_at=excluded.expires_at,created_at=now(),updated_at=now(),
    recovery_token=null;
  select * into a from warboost_test_payment_attempts where user_id=p_user_id;
  return jsonb_build_object('state','creating','attempt_id',a.attempt_id,'expires_at',a.expires_at);
end $$;

create or replace function public.warboost_claim_test_subscription(
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
    return jsonb_build_object('state',a.state,'attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
      'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id,'payment_intent_id',a.payment_intent_id);
  end if;
  if a.state='subscription_creating' then
    if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
    if a.expires_at<=now() then
      if a.lease_until is null or a.lease_until>now()-interval '5 minutes' then
        return jsonb_build_object('state','busy');
      end if;
      update warboost_test_payment_attempts set recovery_token=gen_random_uuid(),
        lease_until=now()+interval '180 seconds',updated_at=now()
        where user_id=p_user_id and attempt_id=p_attempt_id;
      select * into a from warboost_test_payment_attempts where user_id=p_user_id;
      return jsonb_build_object('state','recovery','attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
        'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id,
        'payment_intent_id',a.payment_intent_id,'recovery_token',a.recovery_token);
    end if;
    update warboost_test_payment_attempts set lease_until=now()+interval '60 seconds',
      recovery_token=gen_random_uuid(),updated_at=now() where user_id=p_user_id and attempt_id=p_attempt_id;
    select * into a from warboost_test_payment_attempts where user_id=p_user_id;
    return jsonb_build_object('state','retry','attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
      'setup_intent_id',a.setup_intent_id,'subscription_id',a.subscription_id,'recovery_token',a.recovery_token);
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
  select * into a from warboost_test_payment_attempts where user_id=p_user_id;
  return jsonb_build_object('state','creating','attempt_id',a.attempt_id,'customer_id',a.stripe_customer_id,
    'setup_intent_id',a.setup_intent_id,'recovery_token',a.recovery_token);
end $$;

create or replace function public.warboost_authorize_test_subscription_create(
  p_user_id uuid,p_attempt_id uuid,p_recovery_token uuid
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,17));
  select * into a from warboost_test_payment_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.state<>'subscription_creating' or a.recovery_token is distinct from p_recovery_token
     or a.lease_until<=now() or a.expires_at<=now() or a.subscription_id is not null then
    return false;
  end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')) then
    return false;
  end if;
  return true;
end $$;

-- Called only after complete, read-only Stripe verification in the TEST API.
-- The token and lease fence concurrent/replayed recovery requests.
create or replace function public.warboost_finish_test_subscription_recovery(
  p_user_id uuid,p_attempt_id uuid,p_recovery_token uuid,p_country text,p_consent_version text,
  p_outcome text,p_subscription_id text default null,p_payment_intent_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.warboost_test_payment_attempts;
begin
  if p_country is null or p_country !~ '^[A-Z]{2}$' or p_consent_version is null or
     length(p_consent_version)=0 or length(p_consent_version)>80 or
     p_recovery_token is null or p_outcome not in ('existing','absent') then
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
  if not found or a.state<>'subscription_creating' or a.recovery_token is distinct from p_recovery_token
     or a.lease_until<=now() then
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
      expires_at=now()+interval '35 minutes',lease_until=null,recovery_token=null,updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
        and recovery_token=p_recovery_token;
    if not found then return jsonb_build_object('state','recovery_claim_lost'); end if;
    return jsonb_build_object('state','payment_pending','attempt_id',p_attempt_id,
      'subscription_id',p_subscription_id,'payment_intent_id',p_payment_intent_id);
  end if;

  if a.subscription_id is not null or a.payment_intent_id is not null then
    return jsonb_build_object('state','recorded_subscription_missing');
  end if;
  if exists(select 1 from warboost_subscriptions s where s.user_id=p_user_id
    and s.status not in ('canceled','incomplete_expired','inactive','free')) then
    return jsonb_build_object('state','other_subscription_exists');
  end if;
  update warboost_test_payment_attempts set state='setup_pending',
    expires_at=now()+interval '35 minutes',lease_until=null,recovery_token=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id and state='subscription_creating'
      and recovery_token=p_recovery_token and subscription_id is null and payment_intent_id is null;
  if not found then return jsonb_build_object('state','recovery_claim_lost'); end if;
  return jsonb_build_object('state','setup_pending','attempt_id',p_attempt_id);
end $$;

do $$
begin
  revoke all on function public.warboost_claim_test_payment_attempt(uuid,text,text) from public,anon,authenticated;
  grant execute on function public.warboost_claim_test_payment_attempt(uuid,text,text) to service_role;
  revoke all on function public.warboost_claim_test_subscription(uuid,uuid,text) from public,anon,authenticated;
  grant execute on function public.warboost_claim_test_subscription(uuid,uuid,text) to service_role;
  revoke all on function public.warboost_authorize_test_subscription_create(uuid,uuid,uuid) from public,anon,authenticated;
  grant execute on function public.warboost_authorize_test_subscription_create(uuid,uuid,uuid) to service_role;
  revoke all on function public.warboost_finish_test_subscription_recovery(uuid,uuid,uuid,text,text,text,text,text)
    from public,anon,authenticated;
  grant execute on function public.warboost_finish_test_subscription_recovery(uuid,uuid,uuid,text,text,text,text,text)
    to service_role;
end $$;
