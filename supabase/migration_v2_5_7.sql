-- WarBoost V2.5.7 — Alliance Invite & Membership Reliability
-- Safe/idempotent migration. It never drops, truncates or deletes player/alliance data.
-- Goal: a WarBoost account belongs to at most one cloud alliance at a time.
-- If historical duplicate memberships exist, the migration stops instead of deleting data.

do $$
begin
  if exists (
    select 1
    from public.wb1_alliance_members
    group by player_id
    having count(*) > 1
  ) then
    raise exception 'WarBoost V2.5.7: duplicate alliance memberships detected; resolve explicitly before applying the unique membership guard';
  end if;
end $$;

create unique index if not exists wb1_alliance_members_player_unique_idx
  on public.wb1_alliance_members(player_id);

-- Keep the V2.5.4 least-privilege model intact.
revoke all privileges on table public.wb1_alliances from anon, authenticated;
revoke all privileges on table public.wb1_alliance_members from anon, authenticated;
grant select, insert, update on table public.wb1_alliances to service_role;
grant select, insert, update on table public.wb1_alliance_members to service_role;

notify pgrst, 'reload schema';
