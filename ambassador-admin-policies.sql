-- ============================================================
-- Ambassador Admin — admin read/write on ambassador tables
-- Run once in the Supabase SQL editor, after ambassador-schema.sql.
-- Mirrors user-admin-policies.sql: base RLS on ambassadors /
-- ambassador_referrals only lets an ambassador see their own rows
-- (auth.uid() = user_id). The admin page signs in as Jon, whose
-- auth.uid() is HIS OWN user id, not the ambassador's — so without
-- these policies the admin page can't see other ambassadors' data.
-- ============================================================

-- Admin emails can read every ambassador row (stats, status, code).
drop policy if exists "amb_admin_read" on ambassadors;
create policy "amb_admin_read" on ambassadors for select to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

-- Admin emails can update ambassador status / notes / code from the admin panel.
drop policy if exists "amb_admin_update" on ambassadors;
create policy "amb_admin_update" on ambassadors for update to authenticated
  using      (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'))
  with check (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

-- Admin emails can create a new ambassador record from the admin panel
-- (e.g. when setting a user's tier to "ambassador" for the first time).
drop policy if exists "amb_admin_insert" on ambassadors;
create policy "amb_admin_insert" on ambassadors for insert to authenticated
  with check (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

-- Admin emails can read every referral row, so the admin panel can list
-- which users are tied to a given ambassador.
drop policy if exists "ref_admin_read" on ambassador_referrals;
create policy "ref_admin_read" on ambassador_referrals for select to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));
