-- ============================================================
-- Community Seed — GA/SC region tagging + admin-editable volume knobs
-- Run once in the Supabase SQL editor (after community-seed-schema.sql
-- and community-seed-zones.sql have already been applied).
-- ============================================================

-- 1) Tag zones by region so the admin tool can filter the Zones map/list
--    per region (mid_atlantic vs ga_sc). Existing zones default to
--    mid_atlantic (all zones drawn so far were mid_atlantic waters).
--    This does NOT change how community_seed.py picks a zone to post to —
--    it still picks from all active zones regardless of region, weighted
--    by `weight`. Region here is purely an admin-UI filter for drawing/
--    viewing zones on the correct map.
ALTER TABLE seed_zones
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'mid_atlantic';

-- 2) Make pin volume/frequency knobs admin-editable instead of only being
--    GitHub Actions workflow env vars / script defaults. community_seed.py
--    reads these from seed_config now (falling back to its env-var
--    defaults if a column is somehow null).
ALTER TABLE seed_config
  ADD COLUMN IF NOT EXISTS pins_per_run_min int   NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS pins_per_run_max int   NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS live_fraction    float8 NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS tip_fraction     float8 NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS backfill_days    int    NOT NULL DEFAULT 5;

-- 3) seed_config currently has RLS enabled with NO policies at all (by
--    design — service_role only, per community-seed-schema.sql). That
--    means the admin HTML tool (which authenticates as a normal admin
--    user, not service_role) cannot read or update it. Add the same
--    admin-email policy already used on seed_zones so the new Seed tab
--    in community_admin.html can view/edit the kill switch + volume knobs.
DROP POLICY IF EXISTS "admin_seed_config_all" ON seed_config;
CREATE POLICY "admin_seed_config_all" ON seed_config FOR ALL TO authenticated
  USING      (auth.jwt() ->> 'email' IN ('jlintvet@gmail.com','jlintvet@butterpayments.com'))
  WITH CHECK (auth.jwt() ->> 'email' IN ('jlintvet@gmail.com','jlintvet@butterpayments.com'));
