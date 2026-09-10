-- WarBoost V2.5.28 HF8 — Commercial Readiness
-- Additive/idempotent. Preserves all existing subscriptions and player data.
-- Safe Launch remains the runtime default; this schema alone cannot enable payments.

create table if not exists public.warboost_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'free',
  status text not null default 'inactive',
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.warboost_subscriptions add column if not exists stripe_customer_id text;
alter table public.warboost_subscriptions add column if not exists stripe_subscription_id text;
alter table public.warboost_subscriptions add column if not exists stripe_price_id text;
alter table public.warboost_subscriptions add column if not exists plan text not null default 'free';
alter table public.warboost_subscriptions add column if not exists status text not null default 'inactive';
alter table public.warboost_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.warboost_subscriptions add column if not exists current_period_end timestamptz;
alter table public.warboost_subscriptions add column if not exists updated_at timestamptz not null default now();

create unique index if not exists warboost_subscriptions_customer_uidx
  on public.warboost_subscriptions(stripe_customer_id)
  where stripe_customer_id is not null;
create unique index if not exists warboost_subscriptions_subscription_uidx
  on public.warboost_subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table public.warboost_subscriptions enable row level security;
revoke all on public.warboost_subscriptions from anon;
revoke insert, update, delete on public.warboost_subscriptions from authenticated;
grant select on public.warboost_subscriptions to authenticated;
grant select, insert, update, delete on public.warboost_subscriptions to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='warboost_subscriptions' and policyname='users_read_own_subscription'
  ) then
    create policy users_read_own_subscription
      on public.warboost_subscriptions for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.warboost_billing_events (
  event_id text primary key,
  event_type text not null,
  processed boolean not null default false,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists warboost_billing_events_processed_idx
  on public.warboost_billing_events(processed, received_at desc);

alter table public.warboost_billing_events enable row level security;
revoke all on public.warboost_billing_events from anon, authenticated;
grant select, insert, update, delete on public.warboost_billing_events to service_role;

comment on table public.warboost_billing_events is
  'Server-only idempotency ledger for WarBoost commercial payment webhooks; never contains card details.';
