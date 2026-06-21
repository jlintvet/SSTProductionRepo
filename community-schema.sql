-- ============================================================
-- Community Reports Schema
-- Run once in Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Add display name + tip handles to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS display_name   text,
  ADD COLUMN IF NOT EXISTS venmo_handle   text,
  ADD COLUMN IF NOT EXISTS cashapp_handle text;

-- ── community_locations ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_locations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  display_name    text        NOT NULL DEFAULT 'Angler',
  type            text        NOT NULL CHECK (type IN ('live', 'report')),
  lat             float8      NOT NULL,
  lon             float8      NOT NULL,
  species         text[]      NOT NULL DEFAULT '{}',
  quantity        jsonb       NOT NULL DEFAULT '{}',
  water_temp      float4,
  notes           text,
  image_url       text,
  points_awarded  int         NOT NULL DEFAULT 0,
  tip_count       int         NOT NULL DEFAULT 0,
  tip_total_cents int         NOT NULL DEFAULT 0,
  thank_count     int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  is_flagged      bool        NOT NULL DEFAULT false
);

-- 2026-06-21: photo attachment on community reports/live pins
ALTER TABLE community_locations
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE INDEX IF NOT EXISTS idx_community_locations_expires
  ON community_locations (expires_at);
CREATE INDEX IF NOT EXISTS idx_community_locations_user
  ON community_locations (user_id, created_at DESC);

ALTER TABLE community_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cl_read"   ON community_locations;
DROP POLICY IF EXISTS "cl_insert" ON community_locations;
DROP POLICY IF EXISTS "cl_update" ON community_locations;

CREATE POLICY "cl_read"
  ON community_locations FOR SELECT TO authenticated
  USING (expires_at > now() AND NOT is_flagged);

CREATE POLICY "cl_insert"
  ON community_locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cl_update"
  ON community_locations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ── community_tips ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_tips (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       uuid        NOT NULL REFERENCES community_locations ON DELETE CASCADE,
  tipper_user_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recipient_user_id uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount_cents      int         NOT NULL,
  platform          text        NOT NULL CHECK (platform IN ('venmo', 'cashapp')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE community_tips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ct_insert" ON community_tips;
DROP POLICY IF EXISTS "ct_read"   ON community_tips;

CREATE POLICY "ct_insert"
  ON community_tips FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = tipper_user_id);

CREATE POLICY "ct_read"
  ON community_tips FOR SELECT TO authenticated
  USING (auth.uid() = tipper_user_id OR auth.uid() = recipient_user_id);

-- ── community_flags ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_flags (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  uuid        NOT NULL REFERENCES community_locations ON DELETE CASCADE,
  reporter_id  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, reporter_id)
);

ALTER TABLE community_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cf_insert" ON community_flags;

CREATE POLICY "cf_insert"
  ON community_flags FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- ── user_points ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_points (
  user_id             uuid    PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  total_points        bigint  NOT NULL DEFAULT 0,
  report_count        int     NOT NULL DEFAULT 0,
  live_count          int     NOT NULL DEFAULT 0,
  tips_received_cents bigint  NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "up_read"   ON user_points;
DROP POLICY IF EXISTS "up_write"  ON user_points;

-- Anyone authenticated can read (for leaderboard)
CREATE POLICY "up_read"
  ON user_points FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "up_write"
  ON user_points FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
