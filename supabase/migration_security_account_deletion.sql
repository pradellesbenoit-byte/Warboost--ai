-- PREPARED ONLY. NEVER run automatically. Review on an isolated database first.
-- Server service_role RPC only; p_user_id MUST come from requireUser, never a browser target.
begin;

create or replace function public.wb1_prepare_account_deletion(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare blocked boolean := false; found boolean; paths jsonb;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'account_not_found';
  end if;
  -- No Stripe calls or payment changes in this pass. Provider-linked cases go to support.
  if to_regclass('public.warboost_billing_accounts') is not null then
    execute 'select exists(select 1 from public.warboost_billing_accounts where user_id=$1 and stripe_customer_id is not null)' into found using p_user_id;
    blocked := blocked or found;
  end if;
  if to_regclass('public.warboost_subscriptions') is not null then
    execute 'select exists(select 1 from public.warboost_subscriptions where user_id=$1 and (stripe_customer_id is not null or stripe_subscription_id is not null))' into found using p_user_id;
    blocked := blocked or found;
  end if;
  select coalesce(jsonb_agg(attachment_path),'[]'::jsonb) into paths
    from public.wb1_support_tickets where player_id=p_user_id::text and attachment_path is not null;
  return jsonb_build_object('blocked',blocked,'attachments',paths);
end $$;

create or replace function public.wb1_delete_account_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare prepared jsonb;
begin
  -- Lock the identity to serialize guarded in-flight writes with account removal.
  perform 1 from auth.users where id=p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  prepared := public.wb1_prepare_account_deletion(p_user_id);
  if (prepared->>'blocked')::boolean then raise exception 'support_required'; end if;
  -- Actual Storage API deletion happens first. A concurrently-added attachment blocks completion.
  if exists(select 1 from storage.objects o join public.wb1_support_tickets t on t.attachment_path=o.name
    where t.player_id=p_user_id::text and o.bucket_id='warboost-support') then
    raise exception 'attachments_remaining';
  end if;
  delete from public.wb1_support_messages where author_player_id=p_user_id::text
    or ticket_id in(select id from public.wb1_support_tickets where player_id=p_user_id::text);
  delete from public.wb1_support_tickets where player_id=p_user_id::text;
  delete from public.wb1_snapshots where player_id=p_user_id::text;
  delete from public.wb1_profiles where player_id=p_user_id::text;
  delete from public.wb1_alliance_members where player_id=p_user_id::text;
  -- A game roster belongs to its alliance, not the WarBoost account. Keep gameplay entries/ranks;
  -- detach only this account's private link. Never elect a manager or delete an alliance.
  update public.wb1_alliances a set
    owner_player_id=case when owner_player_id=p_user_id::text then '' else owner_player_id end,
    roster=(select coalesce(jsonb_agg(case when r->>'player_id'=p_user_id::text
      then (r - 'player_id' - 'identity_linked_at') || '{"warboost_linked":false,"identity_basis":"account-deleted"}'::jsonb else r end order by ord),'[]'::jsonb)
      from jsonb_array_elements(a.roster) with ordinality as rows(r,ord)),
    roster_updated_at=now(),updated_at=now()
    where owner_player_id=p_user_id::text or exists(
      select 1 from jsonb_array_elements(a.roster) r where r->>'player_id'=p_user_id::text);
  if to_regclass('public.wb1_beta_invites') is not null then
    delete from public.wb1_beta_invites where accepted_user_id=p_user_id::text;
    update public.wb1_beta_invites set invited_by_user_id=null,invited_by_email=null where invited_by_user_id=p_user_id::text;
  end if;
  -- Supabase's auth FK cascades remove this user's sessions/identities and own beta grant.
  -- Provider-linked accounts were blocked above; other users' grants/invites/ranks are untouched.
  delete from auth.users where id=p_user_id;
  return jsonb_build_object('deleted',true);
end $$;

-- Prevent still-valid JWTs / in-flight writes from recreating orphaned personal data.
create or replace function public.wb1_require_existing_account()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare owner_id text;
begin
  owner_id := to_jsonb(new)->>tg_argv[0];
  if owner_id is null then return new; end if;
  perform 1 from auth.users where id::text=owner_id for key share;
  if not found then raise exception 'account_not_found'; end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['wb1_profiles','wb1_snapshots','wb1_alliance_members','wb1_support_tickets'] loop
    execute format('drop trigger if exists wb1_account_exists on public.%I',t);
    execute format('create trigger wb1_account_exists before insert or update on public.%I for each row execute function public.wb1_require_existing_account(''player_id'')',t);
  end loop;
end $$;
revoke all on function public.wb1_prepare_account_deletion(uuid),public.wb1_delete_account_data(uuid),public.wb1_require_existing_account() from public,anon,authenticated;
grant execute on function public.wb1_prepare_account_deletion(uuid),public.wb1_delete_account_data(uuid) to service_role;
notify pgrst,'reload schema';
commit;
