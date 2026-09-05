-- WarBoost V2.5.7 — Cloud, Alliance & Membership Reliability
-- Safe/idempotent migration. It never drops/truncates/deletes player data.
-- Goals:
--   1) preserve/create the wb1_* cloud schema,
--   2) restore the exact server-side privileges required by WarBoost APIs,
--   3) keep browser/user access scoped to the authenticated player's own profile/snapshots,
--   4) remove accidental broad table privileges from public roles.

create extension if not exists pgcrypto;

create table if not exists public.wb1_profiles (
  player_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wb1_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  state jsonb not null,
  source text not null default 'warboost',
  captured_at timestamptz not null default now()
);
create index if not exists wb1_snapshots_player_time_idx
  on public.wb1_snapshots(player_id, captured_at desc);

create table if not exists public.wb1_alliances (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  name text,
  invite_code text not null unique,
  owner_player_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.wb1_alliance_members (
  alliance_id uuid not null references public.wb1_alliances(id) on delete cascade,
  player_id text not null,
  role text not null default 'R1',
  updated_at timestamptz not null default now(),
  primary key (alliance_id, player_id)
);
create unique index if not exists wb1_alliance_members_player_unique_idx
  on public.wb1_alliance_members(player_id);

alter table public.wb1_profiles enable row level security;
alter table public.wb1_snapshots enable row level security;
alter table public.wb1_alliances enable row level security;
alter table public.wb1_alliance_members enable row level security;

-- Reset inherited/default table ACLs on the WarBoost V1 cloud tables, then re-grant
-- only what the application needs. service_role still bypasses RLS, but PostgREST
-- also requires table-level GRANTs; this is the V2.5.4 production reliability fix.
revoke all privileges on table public.wb1_profiles from anon, authenticated, service_role;
revoke all privileges on table public.wb1_snapshots from anon, authenticated, service_role;
revoke all privileges on table public.wb1_alliances from anon, authenticated, service_role;
revoke all privileges on table public.wb1_alliance_members from anon, authenticated, service_role;

-- Player session access: own profile/snapshots only, enforced by RLS below.
grant select, insert, update on table public.wb1_profiles to authenticated;
grant select, insert on table public.wb1_snapshots to authenticated;

-- WarBoost serverless API access: minimum privileges used by lib/supabase.js.
grant select, insert, update on table public.wb1_profiles to service_role;
grant select, insert on table public.wb1_snapshots to service_role;
grant select, insert, update on table public.wb1_alliances to service_role;
grant select, insert, update on table public.wb1_alliance_members to service_role;

-- Explicitly keep anonymous users away from all wb1_* data.
revoke all privileges on table public.wb1_profiles from anon;
revoke all privileges on table public.wb1_snapshots from anon;
revoke all privileges on table public.wb1_alliances from anon;
revoke all privileges on table public.wb1_alliance_members from anon;

-- Browser clients never access alliance tables directly in V2.5.4; all alliance
-- mutations/read aggregation are authorization-checked by WarBoost serverless APIs.
revoke all privileges on table public.wb1_alliances from authenticated;
revoke all privileges on table public.wb1_alliance_members from authenticated;

-- Optimized user-scoped RLS policies. Recreating policies changes no stored rows.
drop policy if exists wb1_profiles_select_own on public.wb1_profiles;
create policy wb1_profiles_select_own on public.wb1_profiles
  for select to authenticated
  using (player_id = (select auth.uid())::text);

drop policy if exists wb1_profiles_insert_own on public.wb1_profiles;
create policy wb1_profiles_insert_own on public.wb1_profiles
  for insert to authenticated
  with check (player_id = (select auth.uid())::text);

drop policy if exists wb1_profiles_update_own on public.wb1_profiles;
create policy wb1_profiles_update_own on public.wb1_profiles
  for update to authenticated
  using (player_id = (select auth.uid())::text)
  with check (player_id = (select auth.uid())::text);

drop policy if exists wb1_snapshots_select_own on public.wb1_snapshots;
create policy wb1_snapshots_select_own on public.wb1_snapshots
  for select to authenticated
  using (player_id = (select auth.uid())::text);

drop policy if exists wb1_snapshots_insert_own on public.wb1_snapshots;
create policy wb1_snapshots_insert_own on public.wb1_snapshots
  for insert to authenticated
  with check (player_id = (select auth.uid())::text);

-- Refresh PostgREST schema metadata after ACL/policy changes.
notify pgrst, 'reload schema';

-- === V2.5.24 Support joueurs ===
create table if not exists public.wb1_support_tickets (
  id uuid primary key default gen_random_uuid(), ticket_no text not null unique, player_id text not null,
  email text, nickname text, category text not null default 'other', subject text not null, description text not null,
  status text not null default 'received', app_version text, locale text, screen text,
  diagnostics jsonb not null default '{}'::jsonb, attachment_path text, attachment_name text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint wb1_support_status_check check (status in ('received','in_progress','waiting_player','resolved')),
  constraint wb1_support_category_check check (category in ('login','scan','data','ai','alliance','bug','suggestion','other'))
);
create index if not exists wb1_support_tickets_player_time_idx on public.wb1_support_tickets(player_id, created_at desc);
create index if not exists wb1_support_tickets_status_time_idx on public.wb1_support_tickets(status, updated_at desc);
create table if not exists public.wb1_support_messages (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.wb1_support_tickets(id) on delete cascade,
  author_kind text not null default 'player', author_player_id text, author_email text, body text not null,
  created_at timestamptz not null default now(), constraint wb1_support_author_kind_check check (author_kind in ('player','support'))
);
create index if not exists wb1_support_messages_ticket_time_idx on public.wb1_support_messages(ticket_id, created_at asc);
alter table public.wb1_support_tickets enable row level security;
alter table public.wb1_support_messages enable row level security;
revoke all privileges on table public.wb1_support_tickets from anon, authenticated, service_role;
revoke all privileges on table public.wb1_support_messages from anon, authenticated, service_role;
grant select, insert, update on table public.wb1_support_tickets to service_role;
grant select, insert on table public.wb1_support_messages to service_role;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('warboost-support','warboost-support',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
notify pgrst, 'reload schema';
