-- Read-only, TEST only, under an explicitly project-pinned admin connector.
select c.relname,c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_table_access,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as user_table_access,
  has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service_direct_access
from pg_catalog.pg_class c where c.oid in
('public.wb1_vision_test_campaign'::regclass,'public.wb1_vision_test_attempt'::regclass);
select p.prosecdef,p.proconfig,pg_catalog.pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as user_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_catalog.pg_proc p where p.oid='public.wb1_vision_test_control(text,uuid,text,uuid,text,boolean)'::regprocedure;
select count(*) as campaigns,coalesce(sum(used),0) as attempts,
  count(*) filter(where enabled) as enabled,count(*) filter(where busy_request is not null) as busy
from public.wb1_vision_test_campaign;
select count(*) as attempts,count(*) filter(where outcome='reserved') as unresolved
from public.wb1_vision_test_attempt;
