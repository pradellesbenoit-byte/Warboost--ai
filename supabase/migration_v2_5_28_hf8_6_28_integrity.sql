-- WarBoost V2.5.28 HF8.6.28 — additive concurrency and Alliance integrity.
-- Apply only after migration_v2_5_28_hf7_alliance_scope.sql.
-- This migration is idempotent and never deletes, truncates, or rewrites existing rows.

create index if not exists wb1_profiles_player_updated_idx
  on public.wb1_profiles(player_id, updated_at);

create index if not exists wb1_alliances_id_updated_idx
  on public.wb1_alliances(id, updated_at);

create index if not exists wb1_alliance_members_identity_updated_idx
  on public.wb1_alliance_members(alliance_id, player_id, updated_at);

create or replace function public.wb1_create_alliance_atomic(
  p_tag text,
  p_name text,
  p_server_id text,
  p_invite_code text,
  p_owner_player_id text,
  p_roster jsonb default '[]'::jsonb,
  p_owner_role text default 'R5'
)
returns setof public.wb1_alliances
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created public.wb1_alliances;
  safe_role text;
begin
  safe_role := upper(coalesce(p_owner_role, 'R5'));
  if safe_role not in ('R4','R5') then
    raise exception using errcode = '22023', message = 'owner_role_must_be_r4_or_r5';
  end if;

  insert into public.wb1_alliances(
    tag, name, server_id, invite_code, owner_player_id,
    roster, roster_updated_at, updated_at
  )
  values (
    upper(btrim(p_tag)), nullif(btrim(p_name), ''), btrim(p_server_id),
    btrim(p_invite_code), p_owner_player_id,
    case when jsonb_typeof(p_roster) = 'array' then p_roster else '[]'::jsonb end,
    case when jsonb_typeof(p_roster) = 'array' and jsonb_array_length(p_roster) > 0 then now() else null end,
    now()
  )
  returning * into created;

  insert into public.wb1_alliance_members(alliance_id, player_id, role, updated_at)
  values (created.id, p_owner_player_id, safe_role, now());

  return next created;
end;
$$;

revoke all on function public.wb1_create_alliance_atomic(text,text,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.wb1_create_alliance_atomic(text,text,text,text,text,jsonb,text)
  to service_role;

notify pgrst, 'reload schema';