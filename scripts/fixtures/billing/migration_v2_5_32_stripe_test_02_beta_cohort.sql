-- MANUAL TEST DB only, after stripe_test_01 and the existing wb1_beta_invites migration.
-- Frozen cohort: existing auth accounts + invitations issued before the cutoff, still valid.
-- Re-running never reactivates revoked grants and never grants newly created accounts.
begin;
insert into public.warboost_pro_grants(user_id,grant_type,source)
select u.id,'beta','existing-invitation-cohort'
from auth.users u
join public.wb1_beta_invites i on lower(i.email)=lower(u.email)
cross join public.warboost_billing_policy p
where p.singleton and u.created_at<=p.beta_cohort_cutoff and i.invited_at<=p.beta_cohort_cutoff
  and i.status in ('pending','accepted') and (i.expires_at is null or i.expires_at>now())
  and (i.accepted_user_id is null or i.accepted_user_id=u.id::text)
on conflict(user_id) do nothing;

create or replace function public.warboost_claim_existing_beta_grant(p_user_id uuid,p_verified_legacy boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.warboost_pro_grants;
begin
  if exists(
    select 1 from auth.users u cross join warboost_billing_policy p
    where u.id=p_user_id and p.singleton and u.created_at<=p.beta_cohort_cutoff and (
      p_verified_legacy or exists(select 1 from wb1_beta_invites i where lower(i.email)=lower(u.email)
        and i.invited_at<=p.beta_cohort_cutoff and i.status in ('pending','accepted')
        and (i.accepted_user_id is null or i.accepted_user_id=u.id::text) and (i.expires_at is null or i.expires_at>now()))
    )
  ) then
    insert into warboost_pro_grants(user_id,grant_type,source) values(p_user_id,'beta',
      case when p_verified_legacy then 'verified-existing-legacy-beta' else 'existing-invitation-cohort' end) on conflict do nothing;
  end if;
  select * into g from warboost_pro_grants where user_id=p_user_id;
  if not found then return null; end if;
  return to_jsonb(g);
end $$;
revoke all on function public.warboost_claim_existing_beta_grant(uuid,boolean) from public,anon,authenticated;
grant execute on function public.warboost_claim_existing_beta_grant(uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;