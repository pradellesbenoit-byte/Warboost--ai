-- WarBoost support ticket identity context.
-- Adds optional player profile fields used only to handle support requests.
-- Safe and additive: existing tickets and access policies remain unchanged.

alter table if exists public.wb1_support_tickets
  add column if not exists server_id text,
  add column if not exists alliance_name text,
  add column if not exists alliance_tag text;

notify pgrst, 'reload schema';