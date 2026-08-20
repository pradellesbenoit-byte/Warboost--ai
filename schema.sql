-- WarBoost V1 Core — nouvelle base indépendante des tables V20.x
-- À exécuter dans un projet Supabase dédié ou dans le projet actuel avec le préfixe wb1_.

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

-- V1 utilise les routes serveur WarBoost avec la service-role key.
-- Aucune clé service-role ne doit être envoyée au navigateur.
