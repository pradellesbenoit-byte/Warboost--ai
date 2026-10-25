-- Synthetic values only. Reproduces the observed legacy key types/constraints,
-- not a dump or a claim to model every Supabase policy/default/managed object.
create table public.wb1_profiles(
 player_id text primary key, state jsonb, updated_at timestamptz default now()
);
create table public.wb1_alliances(
 id uuid primary key, tag text, server_id text, owner_player_id text,
 roster jsonb, roster_updated_at timestamptz, updated_at timestamptz default now()
);
create table public.wb1_alliance_members(
 player_id text not null, alliance_id uuid not null, role text,
 updated_at timestamptz default now(), primary key(alliance_id,player_id)
);
-- Deliberately NO UNIQUE(player_id): the migrations must not assume or add it.
alter table public.wb1_profiles owner to policy_owner;
alter table public.wb1_alliances owner to policy_owner;
alter table public.wb1_alliance_members owner to policy_owner;
alter table public.wb1_profiles enable row level security;
alter table public.wb1_alliances enable row level security;
alter table public.wb1_alliance_members enable row level security;
