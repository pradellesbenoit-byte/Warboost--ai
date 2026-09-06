-- WarBoost V2.5.26 — Beta Invitation Manager
-- Safe/idempotent migration. Adds a server-side beta invite registry.
-- It never drops, truncates, deletes, or rewrites existing player/support data.

create extension if not exists pgcrypto;

create table if not exists public.wb1_beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending',
  note text,
  invited_by_user_id text,
  invited_by_email text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_user_id text,
  revoked_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint wb1_beta_invites_status_check check (status in ('pending','accepted','revoked')),
  constraint wb1_beta_invites_email_lower_check check (email = lower(email))
);

create index if not exists wb1_beta_invites_status_time_idx
  on public.wb1_beta_invites(status, updated_at desc);
create index if not exists wb1_beta_invites_accepted_user_idx
  on public.wb1_beta_invites(accepted_user_id)
  where accepted_user_id is not null;

alter table public.wb1_beta_invites enable row level security;

-- Browser clients never access beta invitations directly.
-- All access is mediated by WarBoost server routes using service_role.
revoke all privileges on table public.wb1_beta_invites from anon, authenticated, service_role;
grant select, insert, update on table public.wb1_beta_invites to service_role;

notify pgrst, 'reload schema';
