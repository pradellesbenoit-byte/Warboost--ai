-- WarBoost V2.5.24 — Support joueurs / ticketing
-- Safe/idempotent. Adds support tables and a private Storage bucket.
-- It never drops, truncates or deletes existing WarBoost player data.

create extension if not exists pgcrypto;

create table if not exists public.wb1_support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  player_id text not null,
  email text,
  nickname text,
  category text not null default 'other',
  subject text not null,
  description text not null,
  status text not null default 'received',
  app_version text,
  locale text,
  screen text,
  diagnostics jsonb not null default '{}'::jsonb,
  attachment_path text,
  attachment_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wb1_support_status_check check (status in ('received','in_progress','waiting_player','resolved')),
  constraint wb1_support_category_check check (category in ('login','scan','data','ai','alliance','bug','suggestion','other'))
);

create index if not exists wb1_support_tickets_player_time_idx
  on public.wb1_support_tickets(player_id, created_at desc);
create index if not exists wb1_support_tickets_status_time_idx
  on public.wb1_support_tickets(status, updated_at desc);

create table if not exists public.wb1_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.wb1_support_tickets(id) on delete cascade,
  author_kind text not null default 'player',
  author_player_id text,
  author_email text,
  body text not null,
  created_at timestamptz not null default now(),
  constraint wb1_support_author_kind_check check (author_kind in ('player','support'))
);
create index if not exists wb1_support_messages_ticket_time_idx
  on public.wb1_support_messages(ticket_id, created_at asc);

alter table public.wb1_support_tickets enable row level security;
alter table public.wb1_support_messages enable row level security;

-- Browser clients never access support tables directly. Access is mediated by /api/support.
revoke all privileges on table public.wb1_support_tickets from anon, authenticated, service_role;
revoke all privileges on table public.wb1_support_messages from anon, authenticated, service_role;
grant select, insert, update on table public.wb1_support_tickets to service_role;
grant select, insert on table public.wb1_support_messages to service_role;

-- Private bucket used only by the WarBoost support API with service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'warboost-support',
  'warboost-support',
  false,
  2097152,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=2097152,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

notify pgrst, 'reload schema';
