-- Additive, isolated LIVE billing ledger. This migration is prepared for review;
-- it is never applied to a production Supabase database by application code.
begin;

create table if not exists public.warboost_live_billing_accounts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  processing_token uuid,
  processing_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.warboost_live_subscriptions(
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  stripe_product_id text,
  plan text not null default 'free' check(plan in ('free','pro')),
  status text not null default 'inactive',
  livemode boolean not null default true check(livemode=true),
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  provider_event_created bigint not null default 0,
  provider_event_id text,
  updated_at timestamptz not null default now()
);
create table if not exists public.warboost_live_checkout_attempts(
  user_id uuid primary key references auth.users(id) on delete cascade,
  nonce uuid not null,
  state text not null check(state in ('creating','open','complete','expired')),
  stripe_customer_id text,
  stripe_session_id text unique,
  checkout_url text,
  lease_until timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.warboost_live_billing_consents(
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  price_id text not null,
  terms_url text not null,
  privacy_url text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,version,price_id)
);
create table if not exists public.warboost_live_billing_events(
  event_id text primary key,
  event_type text not null,
  event_created bigint not null,
  customer_id text,
  subscription_id text,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'processing' check(status in ('processing','processed','ignored','failed')),
  processing_token uuid not null,
  lease_until timestamptz not null,
  error_code text,
  updated_at timestamptz not null default now()
);

alter table public.warboost_live_billing_accounts enable row level security;
alter table public.warboost_live_subscriptions enable row level security;
alter table public.warboost_live_checkout_attempts enable row level security;
alter table public.warboost_live_billing_consents enable row level security;
alter table public.warboost_live_billing_events enable row level security;
revoke all on public.warboost_live_billing_accounts,public.warboost_live_subscriptions,
  public.warboost_live_checkout_attempts,public.warboost_live_billing_consents,
  public.warboost_live_billing_events from public,anon,authenticated;
grant select,insert,update,delete on public.warboost_live_billing_accounts,
  public.warboost_live_subscriptions,public.warboost_live_checkout_attempts,
  public.warboost_live_billing_consents,public.warboost_live_billing_events to service_role;

create or replace function public.warboost_live_record_consent(
  p_user_id uuid,p_version text,p_price text,p_terms text,p_privacy text
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_version<>'2026-11-pro-live-managed-payments-v1' or p_price<>'price_1UZcYaGfZaFP6KvgypF2VKY9'
    or p_terms<>'https://warboost.fr/legal.html' or p_privacy<>'https://warboost.fr/privacy.html' then
    raise exception 'LIVE_CONSENT_INVALID';
  end if;
  insert into public.warboost_live_billing_consents(user_id,version,price_id,terms_url,privacy_url)
    values(p_user_id,p_version,p_price,p_terms,p_privacy)
    on conflict(user_id,version,price_id) do update set created_at=now(),terms_url=excluded.terms_url,privacy_url=excluded.privacy_url;
  return true;
end $$;

create or replace function public.warboost_live_claim_checkout(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a public.warboost_live_checkout_attempts; s public.warboost_live_subscriptions; n uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into s from public.warboost_live_subscriptions where user_id=p_user_id for update;
  if found and s.plan='pro' and s.status not in ('canceled','incomplete_expired','inactive','free') then
    return jsonb_build_object('state','blocked');
  end if;
  select * into a from public.warboost_live_checkout_attempts where user_id=p_user_id for update;
  if found and a.state='open' and a.checkout_url is not null and a.expires_at>now() then
    return jsonb_build_object('state','open','url',a.checkout_url,'customer_id',a.stripe_customer_id,'expires_at',a.expires_at);
  end if;
  if found and a.state='creating' and a.lease_until>now() then return jsonb_build_object('state','busy'); end if;
  insert into public.warboost_live_billing_accounts(user_id) values(p_user_id) on conflict(user_id) do nothing;
  insert into public.warboost_live_checkout_attempts(user_id,nonce,state,stripe_customer_id,stripe_session_id,checkout_url,lease_until,expires_at)
  values(p_user_id,n,'creating',null,null,null,now()+interval '2 minutes',now()+interval '30 minutes')
  on conflict(user_id) do update set nonce=excluded.nonce,state='creating',stripe_session_id=null,checkout_url=null,
    lease_until=excluded.lease_until,expires_at=excluded.expires_at,updated_at=now()
  returning * into a;
  select * into s from public.warboost_live_subscriptions where user_id=p_user_id;
  return jsonb_build_object('state','creating','nonce',a.nonce,'customer_id',
    (select stripe_customer_id from public.warboost_live_billing_accounts where user_id=p_user_id),'expires_at',a.expires_at);
end $$;

create or replace function public.warboost_live_link_customer(p_user_id uuid,p_nonce uuid,p_customer_id text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not exists(select 1 from public.warboost_live_checkout_attempts where user_id=p_user_id and nonce=p_nonce and state='creating' and lease_until>now()) then return false; end if;
  if exists(select 1 from public.warboost_live_billing_accounts where stripe_customer_id=p_customer_id and user_id<>p_user_id) then return false; end if;
  update public.warboost_live_billing_accounts set stripe_customer_id=p_customer_id,updated_at=now() where user_id=p_user_id;
  update public.warboost_live_checkout_attempts set stripe_customer_id=p_customer_id,updated_at=now() where user_id=p_user_id and nonce=p_nonce;
  return found;
end $$;

create or replace function public.warboost_live_finish_checkout(p_user_id uuid,p_nonce uuid,p_session_id text,p_url text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.warboost_live_checkout_attempts set state='open',stripe_session_id=p_session_id,checkout_url=p_url,lease_until=null,updated_at=now()
    where user_id=p_user_id and nonce=p_nonce and state='creating' and lease_until>now();
  return found;
end $$;

create or replace function public.warboost_live_begin_billing_event(
  p_event_id text,p_event_type text,p_created bigint,p_customer text,p_subscription text,p_token uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare e public.warboost_live_billing_events;
begin
  insert into public.warboost_live_billing_events(event_id,event_type,event_created,customer_id,subscription_id,processing_token,lease_until)
    values(p_event_id,p_event_type,p_created,p_customer,p_subscription,p_token,now()+interval '2 minutes')
    on conflict(event_id) do nothing;
  if found then return jsonb_build_object('state','claimed'); end if;
  select * into e from public.warboost_live_billing_events where event_id=p_event_id for update;
  if e.status='processed' then return jsonb_build_object('state','processed'); end if;
  if e.status='processing' and e.lease_until>now() then return jsonb_build_object('state','busy'); end if;
  update public.warboost_live_billing_events set status='processing',processing_token=p_token,lease_until=now()+interval '2 minutes',
    event_type=p_event_type,event_created=p_created,customer_id=p_customer,subscription_id=p_subscription,error_code=null,updated_at=now()
    where event_id=p_event_id;
  return jsonb_build_object('state','claimed');
end $$;

create or replace function public.warboost_live_lock_billing_account(p_user_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.warboost_live_billing_accounts set processing_token=p_token,processing_until=now()+interval '2 minutes',updated_at=now()
    where user_id=p_user_id and (processing_until is null or processing_until<=now() or processing_token=p_token);
  return found;
end $$;

create or replace function public.warboost_live_apply_billing_snapshot(
  p_user_id uuid,p_token uuid,p_event_id text,p_created bigint,p_customer text,p_subscription text,
  p_price text,p_product text,p_plan text,p_status text,p_cancel boolean,p_period_end timestamptz
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare old public.warboost_live_subscriptions;
begin
  if p_plan not in ('free','pro') or p_status not in ('active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused','unknown') then return false; end if;
  if not exists(select 1 from public.warboost_live_billing_accounts where user_id=p_user_id and stripe_customer_id=p_customer
    and processing_token=p_token and processing_until>now()) then return false; end if;
  if p_plan='pro' and (p_price<>'price_1UZcYaGfZaFP6KvgypF2VKY9' or p_product<>'prod_VaoAeQc4DQLtEG' or p_status<>'active') then return false; end if;
  select * into old from public.warboost_live_subscriptions where user_id=p_user_id for update;
  if found and old.stripe_subscription_id<>p_subscription and old.status not in ('canceled','incomplete_expired','inactive','free') then return false; end if;
  if found and old.stripe_subscription_id=p_subscription and old.provider_event_created>p_created then return false; end if;
  insert into public.warboost_live_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,stripe_product_id,
    plan,status,livemode,cancel_at_period_end,current_period_end,provider_event_created,provider_event_id,updated_at)
  values(p_user_id,p_customer,p_subscription,p_price,p_product,p_plan,p_status,true,p_cancel,p_period_end,p_created,p_event_id,now())
  on conflict(user_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,
    stripe_price_id=excluded.stripe_price_id,stripe_product_id=excluded.stripe_product_id,plan=excluded.plan,status=excluded.status,
    livemode=true,cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,
    provider_event_created=excluded.provider_event_created,provider_event_id=excluded.provider_event_id,updated_at=now();
  return true;
end $$;

create or replace function public.warboost_live_end_billing_event(p_event_id text,p_token uuid,p_status text,p_error text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.warboost_live_billing_events set status=p_status,error_code=left(p_error,80),lease_until=case when p_status='processing' then lease_until else now() end,updated_at=now()
    where event_id=p_event_id and processing_token=p_token and p_status in ('processed','ignored','failed');
  return found;
end $$;

create or replace function public.warboost_live_unlock_billing_account(p_user_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.warboost_live_billing_accounts set processing_token=null,processing_until=null,updated_at=now()
    where user_id=p_user_id and processing_token=p_token;
  return found;
end $$;

revoke all on function public.warboost_live_record_consent(uuid,text,text,text,text),
  public.warboost_live_claim_checkout(uuid),public.warboost_live_link_customer(uuid,uuid,text),
  public.warboost_live_finish_checkout(uuid,uuid,text,text),
  public.warboost_live_begin_billing_event(text,text,bigint,text,text,uuid),
  public.warboost_live_lock_billing_account(uuid,uuid),
  public.warboost_live_apply_billing_snapshot(uuid,uuid,text,bigint,text,text,text,text,text,text,boolean,timestamptz),
  public.warboost_live_end_billing_event(text,uuid,text,text),
  public.warboost_live_unlock_billing_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.warboost_live_record_consent(uuid,text,text,text,text),
  public.warboost_live_claim_checkout(uuid),public.warboost_live_link_customer(uuid,uuid,text),
  public.warboost_live_finish_checkout(uuid,uuid,text,text),
  public.warboost_live_begin_billing_event(text,text,bigint,text,text,uuid),
  public.warboost_live_lock_billing_account(uuid,uuid),
  public.warboost_live_apply_billing_snapshot(uuid,uuid,text,bigint,text,text,text,text,text,text,boolean,timestamptz),
  public.warboost_live_end_billing_event(text,uuid,text,text),
  public.warboost_live_unlock_billing_account(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
