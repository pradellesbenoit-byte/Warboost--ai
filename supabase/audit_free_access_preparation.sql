-- LOCAL PROPOSAL ONLY. Run only with separate installation/audit approval on
-- the explicitly selected TEST project. No account/profile contents returned.
begin read only;
set local lock_timeout='2s';
set local statement_timeout='4s';
select public.wb1_assert_free_access_contract();
-- Successful completion validates the installed schema/ACL contract, not Auth,
-- actual Last War rank, email delivery, Android or backup restoration.
commit;
