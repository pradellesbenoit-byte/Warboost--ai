-- TEST-only retry recovery: do not renew an expired subscription lease from
-- the payment-setup endpoint. The subscription endpoint owns the retry claim.
-- This is additive and does not change player data or Stripe LIVE behavior.
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
      if a.expires_at<=now() then return jsonb_build_object('state','invalid'); end if;
      if a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
      -- Read/reconcile the existing operation without stealing the lease.
      -- warboost_claim_test_subscription atomically claims the actual retry.
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

revoke all on function public.warboost_claim_test_payment_attempt(uuid,text,text) from public,anon,authenticated;
grant execute on function public.warboost_claim_test_payment_attempt(uuid,text,text) to service_role;
