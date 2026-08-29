-- WarBoost V2.5.3 — safe cloud schema/migration guard
-- Idempotent: safe to run more than once. It creates missing wb1_* tables and preserves existing rows.
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
create index if not exists wb1_snapshots_player_time_idx on public.wb1_snapshots(player_id,captured_at desc);
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
  primary key (alliance_id,player_id)
);

alter table public.wb1_profiles enable row level security;
alter table public.wb1_snapshots enable row level security;
alter table public.wb1_alliances enable row level security;
alter table public.wb1_alliance_members enable row level security;
grant select,insert,update on public.wb1_profiles to authenticated;
grant select,insert on public.wb1_snapshots to authenticated;
revoke select,insert,update,delete on public.wb1_profiles from anon;
revoke select,insert,update,delete on public.wb1_snapshots from anon;

drop policy if exists wb1_profiles_select_own on public.wb1_profiles;
create policy wb1_profiles_select_own on public.wb1_profiles for select to authenticated using (player_id=auth.uid()::text);
drop policy if exists wb1_profiles_insert_own on public.wb1_profiles;
create policy wb1_profiles_insert_own on public.wb1_profiles for insert to authenticated with check (player_id=auth.uid()::text);
drop policy if exists wb1_profiles_update_own on public.wb1_profiles;
create policy wb1_profiles_update_own on public.wb1_profiles for update to authenticated using (player_id=auth.uid()::text) with check (player_id=auth.uid()::text);
drop policy if exists wb1_snapshots_select_own on public.wb1_snapshots;
create policy wb1_snapshots_select_own on public.wb1_snapshots for select to authenticated using (player_id=auth.uid()::text);
drop policy if exists wb1_snapshots_insert_own on public.wb1_snapshots;
create policy wb1_snapshots_insert_own on public.wb1_snapshots for insert to authenticated with check (player_id=auth.uid()::text);
