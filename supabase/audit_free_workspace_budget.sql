-- Read-only administrator audit. No identities, emails, tokens or individual IP digests.
-- Checks TEXT actor/target/space keys and UUID scan request keys via both contracts.
begin read only;
set local statement_timeout='4s';
select public.wb1_assert_workspace_budget_contract();
select enabled,per_account,global_daily,per_ip,updated_at from public.wb1_free_budget_policy where singleton;
select usage_day,reserved from public.wb1_free_scan_daily order by usage_day desc limit 7;
select count(*) as independent_spaces from public.wb1_autonomous_spaces;
select status,count(*) from public.wb1_autonomous_members group by status;
rollback;
