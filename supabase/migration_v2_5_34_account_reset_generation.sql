-- Apply manually to an isolated Supabase TEST project first.
-- This migration preserves existing rows, auth accounts, consent, language preferences,
-- alliance membership, and shared alliance rosters. It does not execute a reset.
begin;

create table if not exists public.warboost_account_reset_generations (
  player_id text primary key,
  generation bigint not null default 0 check (generation >= 0),
  updated_at timestamptz not null default now()
);
alter table public.warboost_account_reset_generations enable row level security;
revoke all on public.warboost_account_reset_generations from public, anon, authenticated;
grant select, insert, update, delete on public.warboost_account_reset_generations to service_role;

insert into public.warboost_account_reset_generations(player_id, generation)
select player_id, 0 from public.wb1_profiles
union
select player_id, 0 from public.wb1_snapshots
on conflict (player_id) do nothing;

alter table public.wb1_profiles
  add column if not exists reset_generation bigint not null default 0;
alter table public.wb1_snapshots
  add column if not exists reset_generation bigint not null default 0;

create or replace function public.wb1_get_own_reset_generation()
returns bigint
language sql
stable
security definer
set search_path=pg_catalog
as $$
  select coalesce((
    select generation from public.warboost_account_reset_generations
    where player_id=auth.uid()::text
  ), 0::bigint);
$$;
revoke all on function public.wb1_get_own_reset_generation() from public, anon, authenticated, service_role;
grant execute on function public.wb1_get_own_reset_generation() to authenticated, service_role;

create or replace function public.wb1_enforce_reset_generation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare current_generation bigint;
begin
  insert into public.warboost_account_reset_generations(player_id, generation)
  values (new.player_id, 0)
  on conflict (player_id) do nothing;

  select generation into current_generation
  from public.warboost_account_reset_generations
  where player_id=new.player_id
  for share;

  if new.reset_generation is distinct from current_generation then
    raise exception 'reset_required'
      using errcode='40001', detail='The account reset generation changed.';
  end if;
  return new;
end;
$$;
revoke all on function public.wb1_enforce_reset_generation() from public, anon, authenticated, service_role;
grant execute on function public.wb1_enforce_reset_generation() to service_role;

drop trigger if exists wb1_profiles_reset_generation on public.wb1_profiles;
create trigger wb1_profiles_reset_generation
before insert or update on public.wb1_profiles
for each row execute function public.wb1_enforce_reset_generation();
drop trigger if exists wb1_snapshots_reset_generation on public.wb1_snapshots;
create trigger wb1_snapshots_reset_generation
before insert or update on public.wb1_snapshots
for each row execute function public.wb1_enforce_reset_generation();

create or replace function public.wb1_advance_account_reset_generation(p_player_id text)
returns bigint
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare next_generation bigint;
begin
  if nullif(trim(p_player_id), '') is null then
    raise exception 'player_id_required' using errcode='22023';
  end if;
  insert into public.warboost_account_reset_generations(player_id, generation)
  values (p_player_id, 0)
  on conflict (player_id) do nothing;

  update public.warboost_account_reset_generations
  set generation=generation+1, updated_at=now()
  where player_id=p_player_id
  returning generation into next_generation;

  -- Only the selected player's game profile and snapshots are reset.
  -- Auth, consent, language, alliance membership, and shared roster rows are untouched.
  delete from public.wb1_snapshots where player_id=p_player_id;
  delete from public.wb1_profiles where player_id=p_player_id;
  return next_generation;
end;
$$;
revoke all on function public.wb1_advance_account_reset_generation(text) from public, anon, authenticated, service_role;
grant execute on function public.wb1_advance_account_reset_generation(text) to service_role;

commit;
