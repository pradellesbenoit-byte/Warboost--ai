-- Emergency OFF only. WarBoost-Test only; independently pin project_id in the SQL tool.
-- Never deletes/resets campaign or attempt history and never clears a busy lease.
begin;
set local lock_timeout='3s';
set local statement_timeout='4s';
do $$
begin
  if current_user <> 'postgres'
     or current_setting('warboost.approved_project_ref',true) is distinct from 'zaioadmbhqzeihkvdjsd'
  then raise exception 'vision_test_project_approval_required'; end if;
end $$;
update public.wb1_vision_test_campaign_v2 set enabled=false where singleton and enabled;
commit;
