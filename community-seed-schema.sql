-- ============================================================
-- Community Seed Content — schema additions
-- Temporary beta seeding (see community-seed-content-spec.md).
-- Run once in Supabase SQL editor BEFORE running the seed scripts.
-- ============================================================

-- 1) Safety: the app writes venmo_handle / cashapp_handle onto community_locations,
--    but the original community-schema.sql never declared them. Make sure they exist
--    (idempotent — no-op if already present). Seed pins will set these NULL.
ALTER TABLE community_locations
  ADD COLUMN IF NOT EXISTS venmo_handle   text,
  ADD COLUMN IF NOT EXISTS cashapp_handle text;

-- 2) Seed-user registry — the authoritative list of fictitious beta users.
--    Cleanup = delete these auth.users; everything else cascades (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS seed_users (
  user_id      uuid        PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email        text        NOT NULL,
  display_name text        NOT NULL,
  batch        text        NOT NULL,                 -- e.g. '2026-06-18'
  active       bool        NOT NULL DEFAULT true,    -- eligible poster (all true for now)
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS on, NO policies -> invisible to every app (anon/authenticated) client.
-- Only the service_role key (used by the seed scripts) can read/write it.
ALTER TABLE seed_users ENABLE ROW LEVEL SECURITY;

-- 3) Seed run config + kill switch (single row). The scheduled job reads this and
--    exits immediately when disabled or past end_date.
CREATE TABLE IF NOT EXISTS seed_config (
  id         int         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled    bool        NOT NULL DEFAULT true,
  end_date   date        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seed_config ENABLE ROW LEVEL SECURITY;   -- service_role only

-- Seed the config row (adjust end_date as needed):
INSERT INTO seed_config (id, enabled, end_date)
VALUES (1, true, DATE '2026-09-01')
ON CONFLICT (id) DO NOTHING;

-- ── Teardown (run to remove ALL seed content) ───────────────────────────────
--   Deleting the auth users cascades away pins, tips, points, flags, profiles.
--   (Run in the seed_teardown script via the Admin API, or manually:)
--
--   DELETE FROM auth.users WHERE id IN (SELECT user_id FROM seed_users);
--   DROP TABLE IF EXISTS seed_users;
--   DROP TABLE IF EXISTS seed_config;
