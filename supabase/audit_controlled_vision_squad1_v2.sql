-- Read-only audit for the optional one-attempt WarBoost-Test ledger.
-- Run only against explicitly selected WarBoost-Test. Does not reveal campaign IDs/digests.
select
  (select count(*) from public.wb1_vision_test_campaign_v2) as campaign_rows,
  (select count(*) from public.wb1_vision_test_attempt_v2) as attempt_rows,
  (select coalesce(bool_and(not enabled),true) from public.wb1_vision_test_campaign_v2) as all_disabled,
  (select coalesce(bool_and(used between 0 and 1),true) from public.wb1_vision_test_campaign_v2) as counts_valid,
  (select relrowsecurity from pg_class where oid='public.wb1_vision_test_campaign_v2'::regclass) as campaign_rls,
  (select relrowsecurity from pg_class where oid='public.wb1_vision_test_attempt_v2'::regclass) as attempt_rls,
  (select has_function_privilege('service_role',
    'public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)','EXECUTE')) as service_can_execute,
  (select has_function_privilege('anon',
    'public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)','EXECUTE')) as anon_can_execute,
  (select has_function_privilege('authenticated',
    'public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)','EXECUTE')) as authenticated_can_execute,
  (select bool_or(has_table_privilege(r,'public.wb1_vision_test_campaign_v2','SELECT')
     or has_table_privilege(r,'public.wb1_vision_test_campaign_v2','INSERT')
     or has_table_privilege(r,'public.wb1_vision_test_campaign_v2','UPDATE')
     or has_table_privilege(r,'public.wb1_vision_test_campaign_v2','DELETE'))
   from unnest(array['anon','authenticated','service_role']) as roles(r)) as any_direct_campaign_access,
  (select pg_get_userbyid(proowner)='postgres' and prosecdef and
          proconfig @> array['search_path=pg_catalog','lock_timeout=2s','statement_timeout=4s']
   from pg_proc where oid='public.wb1_vision_test_control_v2(text,uuid,text,uuid,text,boolean)'::regprocedure) as rpc_contract;
