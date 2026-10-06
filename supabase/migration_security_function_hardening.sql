-- PREPARED ONLY; not executed automatically. Run audit_security_rls.sql before/after in staging.
-- Explicit allowlist: unknown deployed functions MUST be reviewed, never blanket-revoked.
begin;
-- A fixed public search_path is safe only if browser roles cannot create shadow objects.
revoke create on schema public from public,anon,authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'wb1_create_alliance_atomic','wb1_lock_beta_signup_capacity','wb1_guard_beta_signup_capacity',
      'wb1_activate_beta_invitation','warboost_claim_existing_beta_grant','warboost_claim_checkout',
      'warboost_link_customer','warboost_finish_checkout','warboost_begin_billing_event',
      'warboost_end_billing_event','warboost_lock_billing_account','warboost_unlock_billing_account',
      'warboost_apply_billing_snapshot','wb1_prepare_account_deletion','wb1_delete_account_data',
      'wb1_require_existing_account']) loop
    execute format('alter function %s set search_path=pg_catalog,public,pg_temp',f.signature);
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
