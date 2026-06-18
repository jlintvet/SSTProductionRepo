-- ============================================================
-- Community admin access + public tip totals
-- Run once in the Supabase SQL editor.
--   1) Lets the admin emails read/edit/delete ALL community pins + tips
--      (the base RLS is owner-only, so admin edits of seed pins silently
--       no-op without these).
--   2) Exposes per-angler tip TOTALS to everyone (community_tips row RLS
--      only lets a viewer see their own tips, so leaderboards showed $0).
-- ============================================================

-- helper: admin emails (edit this list if it changes)
--   jlintvet@gmail.com, jlintvet@butterpayments.com

-- ── community_locations: admin full access (added alongside owner policies) ──
drop policy if exists "admin_cl_select" on community_locations;
create policy "admin_cl_select" on community_locations for select to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

drop policy if exists "admin_cl_update" on community_locations;
create policy "admin_cl_update" on community_locations for update to authenticated
  using  (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'))
  with check (true);

drop policy if exists "admin_cl_delete" on community_locations;
create policy "admin_cl_delete" on community_locations for delete to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

-- ── community_tips: admin full access (see all, modify, delete) ──────────────
drop policy if exists "admin_ct_select" on community_tips;
create policy "admin_ct_select" on community_tips for select to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

drop policy if exists "admin_ct_update" on community_tips;
create policy "admin_ct_update" on community_tips for update to authenticated
  using  (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'))
  with check (true);

drop policy if exists "admin_ct_delete" on community_tips;
create policy "admin_ct_delete" on community_tips for delete to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

-- ── Public per-angler tip totals (aggregate only — no individual tip rows) ──
-- SECURITY DEFINER so it bypasses the row-level RLS on community_tips and can
-- sum across all tips; returns only recipient + totals, so nothing private leaks.
create or replace function community_tip_totals(since timestamptz default null)
returns table (recipient_user_id uuid, total_cents bigint, tip_count bigint)
language sql
security definer
set search_path = public
as $$
  select recipient_user_id, sum(amount_cents)::bigint, count(*)::bigint
  from community_tips
  where since is null or created_at >= since
  group by recipient_user_id
$$;

grant execute on function community_tip_totals(timestamptz) to anon, authenticated;
