-- Safe shutdown, NOT deletion/reset of counters. TEST admin approval required.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $$ begin
  if current_user<>'postgres' or current_setting('warboost.approved_project_ref',true)
     is distinct from 'zaioadmbhqzeihkvdjsd'
  then raise exception 'vision_test_project_approval_required'; end if;
end $$;
lock table public.wb1_vision_test_campaign in exclusive mode;
update public.wb1_vision_test_campaign set enabled=false;
-- Keep finish available for an already-running request; no automatic reset,
-- DROP, deletion, second campaign or expired-lease takeover is authorized.
commit;
