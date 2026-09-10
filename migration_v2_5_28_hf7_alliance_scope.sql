-- WarBoost V2.5.28 HF7 — Server + Alliance Scoped Invitations
-- Additive/idempotent migration. It never drops, truncates or deletes user/alliance data.
-- Purpose:
--   * each WarBoost alliance space is scoped to an exact Last War server + alliance tag,
--   * the canonical Last War roster is held server-side for invitation admission checks,
--   * R5/R4 invitations can only admit an exact roster member from that same scope.

alter table public.wb1_alliances add column if not exists server_id text;
alter table public.wb1_alliances add column if not exists roster jsonb not null default '[]'::jsonb;
alter table public.wb1_alliances add column if not exists roster_updated_at timestamptz;

-- Backfill existing HF6 alliance spaces from the technical owner's already-consented
-- WarBoost profile. This does not use e-mail and does not create/delete members.
update public.wb1_alliances a
set server_id = nullif(regexp_replace(coalesce(p.state #>> '{player,server_id}',''),'[^0-9]','','g'),'')
from public.wb1_profiles p
where p.player_id = a.owner_player_id
  and (a.server_id is null or btrim(a.server_id) = '')
  and nullif(regexp_replace(coalesce(p.state #>> '{player,server_id}',''),'[^0-9]','','g'),'') is not null;

update public.wb1_alliances a
set roster = (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(m->>'name',''),
        'server_id', nullif(regexp_replace(coalesce(p.state #>> '{player,server_id}',''),'[^0-9]','','g'),''),
        'alliance_tag', upper(coalesce(a.tag,'')),
        'role', case when upper(coalesce(m->>'role','')) ~ '^R[1-5]$' then upper(m->>'role') else 'R1' end,
        'hq_level', m->'hq_level',
        'power_m', m->'power_m',
        'activity_events', case when jsonb_typeof(m->'activity_events') = 'array' then m->'activity_events' else '[]'::jsonb end,
        'updated_at', m->'updated_at'
      ) order by ord), '[]'::jsonb)
      from jsonb_array_elements(p.state #> '{alliance,members}') with ordinality as x(m,ord)
      where nullif(btrim(coalesce(m->>'name','')),'') is not null
    ),
    roster_updated_at = coalesce(p.updated_at, now())
from public.wb1_profiles p
where p.player_id = a.owner_player_id
  and (a.roster is null or jsonb_typeof(a.roster) <> 'array' or jsonb_array_length(a.roster) = 0)
  and jsonb_typeof(p.state #> '{alliance,members}') = 'array'
  and jsonb_array_length(p.state #> '{alliance,members}') > 0;

-- Prevent future duplicate spaces for the same exact server+tag when historical data
-- is already unambiguous. If old duplicates exist, APIs fail closed on that scope and
-- the migration remains deployable instead of deleting/merging data automatically.
do $$
begin
  if not exists (
    select 1 from public.wb1_alliances
    where server_id is not null and btrim(server_id) <> ''
    group by server_id, upper(tag)
    having count(*) > 1
  ) then
    create unique index if not exists wb1_alliances_server_tag_unique_idx
      on public.wb1_alliances(server_id, upper(tag))
      where server_id is not null and btrim(server_id) <> '';
  end if;
end $$;

revoke all privileges on table public.wb1_alliances from anon, authenticated;
grant select, insert, update on table public.wb1_alliances to service_role;
notify pgrst, 'reload schema';
