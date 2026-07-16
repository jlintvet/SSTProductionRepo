-- ambassador_applications table
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/upxerlzdgdbjkbjpuktn/sql

CREATE TABLE IF NOT EXISTS ambassador_applications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL,
  boat_name   text,
  location    text,
  phone       text,
  comments    text,
  created_at  timestamptz DEFAULT now()
);

-- Anyone can insert (public form), nobody can read except service role
ALTER TABLE ambassador_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert" ON ambassador_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only service role can SELECT (admin/dashboard only)
-- No SELECT policy = anon/authenticated get nothing back, service role bypasses RLS

-- ============================================================
-- Referral / Ambassador Program schema (separate from the
-- ambassador_applications table above, which backs the landing-page
-- "apply to be an ambassador" form). This section backs the actual
-- referral-code + payout system used once someone is approved.
-- ============================================================

-- ============================================================
-- Ambassador / Referral Program Schema
-- Run once in Supabase SQL editor (Dashboard → SQL Editor)
-- Safe to re-run — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================================

-- ── Add referral_code to user_profiles ──────────────────────
-- Each user gets a unique referral code they can share.
-- NOTE (2026-07-16): referred_by's type below (uuid + FK to auth.users) was
-- the original intent but turned out to be wrong for how every later piece
-- of code (redeem_referral_code, get_my_referrals, the admin panel) actually
-- uses it -- as the ambassador's plain-text referral code, not their user
-- id. Left as originally written here for history; the actual live column
-- is now `text` per the fix in ambassador-self-service.sql. Don't run this
-- ALTER against a fresh database without also running that file's fix
-- immediately after, or redemptions will fail with
-- "operator does not exist: uuid = text".
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referral_code      text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by        uuid REFERENCES auth.users ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ambassador_status  text NOT NULL DEFAULT 'none'
    CHECK (ambassador_status IN ('none', 'active', 'suspended'));

-- referral_code is set manually per-ambassador (via the admin panel) — no
-- auto-generated fallback. Every ambassador picks/gets assigned their own
-- vanity code (e.g. "captainjoethankyou").

-- ── ambassadors ─────────────────────────────────────────────
-- Tracks approved ambassadors and their cumulative stats.
CREATE TABLE IF NOT EXISTS ambassadors (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  referral_code       text        NOT NULL UNIQUE,
  status              text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'inactive')),
  total_referrals     int         NOT NULL DEFAULT 0,
  converted_referrals int         NOT NULL DEFAULT 0,  -- referrals that became paid subscribers
  total_commission_cents int      NOT NULL DEFAULT 0,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ambassadors_user
  ON ambassadors (user_id);
CREATE INDEX IF NOT EXISTS idx_ambassadors_code
  ON ambassadors (referral_code);

ALTER TABLE ambassadors ENABLE ROW LEVEL SECURITY;

-- Ambassadors can read their own row; service role manages writes
DROP POLICY IF EXISTS "amb_read_own" ON ambassadors;
CREATE POLICY "amb_read_own" ON ambassadors
  FOR SELECT USING (auth.uid() = user_id);

-- ── ambassador_referrals ─────────────────────────────────────
-- One row per signup that used a referral code.
CREATE TABLE IF NOT EXISTS ambassador_referrals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_user_id  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  referred_user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  referral_code       text        NOT NULL,
  status              text        NOT NULL DEFAULT 'signed_up'
    CHECK (status IN ('signed_up', 'trial', 'converted', 'churned')),
  signed_up_at        timestamptz NOT NULL DEFAULT now(),
  converted_at        timestamptz,           -- when they became a paid subscriber
  commission_cents    int         NOT NULL DEFAULT 0,
  commission_paid     bool        NOT NULL DEFAULT false,
  commission_paid_at  timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_ambassador
  ON ambassador_referrals (ambassador_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referred
  ON ambassador_referrals (referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON ambassador_referrals (referral_code);

ALTER TABLE ambassador_referrals ENABLE ROW LEVEL SECURITY;

-- Ambassadors can see their own referrals
DROP POLICY IF EXISTS "ref_read_own" ON ambassador_referrals;
CREATE POLICY "ref_read_own" ON ambassador_referrals
  FOR SELECT USING (auth.uid() = ambassador_user_id);

-- ── ambassador_payouts ───────────────────────────────────────
-- Tracks commission payment batches (manual or Stripe).
CREATE TABLE IF NOT EXISTS ambassador_payouts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_user_id  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount_cents        int         NOT NULL,
  method              text        NOT NULL DEFAULT 'manual'
    CHECK (method IN ('manual', 'stripe', 'venmo', 'paypal')),
  reference           text,       -- Stripe transfer ID, Venmo txn, etc.
  paid_at             timestamptz NOT NULL DEFAULT now(),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_ambassador
  ON ambassador_payouts (ambassador_user_id, paid_at DESC);

ALTER TABLE ambassador_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_read_own" ON ambassador_payouts;
CREATE POLICY "pay_read_own" ON ambassador_payouts
  FOR SELECT USING (auth.uid() = ambassador_user_id);

-- ── Helper: get ambassador dashboard stats ───────────────────
-- Usage: SELECT * FROM ambassador_stats WHERE ambassador_user_id = '<uuid>';
CREATE OR REPLACE VIEW ambassador_stats AS
SELECT
  a.user_id                                       AS ambassador_user_id,
  a.referral_code,
  a.status,
  a.total_referrals,
  a.converted_referrals,
  a.total_commission_cents,
  COALESCE(SUM(p.amount_cents), 0)::int           AS total_paid_cents,
  (a.total_commission_cents - COALESCE(SUM(p.amount_cents), 0))::int AS balance_cents,
  a.created_at
FROM ambassadors a
LEFT JOIN ambassador_payouts p ON p.ambassador_user_id = a.user_id
GROUP BY a.user_id, a.referral_code, a.status, a.total_referrals,
         a.converted_referrals, a.total_commission_cents, a.created_at;
