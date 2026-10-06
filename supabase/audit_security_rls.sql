-- READ ONLY. Capture and review results on the authorized target; no policies created here.
-- Functions exposed or with unset search_path, including functions not present in the repository.
select n.nspname,p.proname,p.oid::regprocedure signature,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by p.proname;

-- RLS/no-policy is intentional for server-only tables, not itself a reason to allow users.
select c.relname,c.relrowsecurity,
  (select count(*) from pg_policy p where p.polrelid=c.oid) policy_count,
  case when c.relname in ('wb1_profiles','wb1_snapshots','warboost_subscriptions')
    then 'own-user policies required: compare migration definitions'
    when c.relname in ('wb1_alliances','wb1_alliance_members','wb1_support_tickets','wb1_support_messages',
      'wb1_beta_invites','wb1_beta_signup_policy','warboost_billing_policy','warboost_pro_grants',
      'warboost_billing_accounts','warboost_checkout_attempts','warboost_billing_events')
    then 'service-role-only: no browser policy expected; verify table grants'
    else 'UNCLASSIFIED: manual owner review required' end expected_access,
  has_table_privilege('anon',c.oid,'SELECT') anon_read,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_read
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by c.relname;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' order by tablename,policyname;
