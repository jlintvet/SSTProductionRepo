-- ============================================================
-- Ambassador self-service: set your own referral code, see who
-- redeemed it (past and present codes).
-- Run once in Supabase SQL editor (Dashboard -> SQL Editor).
--
-- IMPORTANT CONTEXT (learned by reading the live redeem_referral_code
-- function, which only exists in Supabase, not in this repo):
--   - The real source of truth is user_profiles (tier, referral_code,
--     referred_by, ambassador_status), matched case-insensitively.
--   - referred_by stores the CODE STRING at time of redemption, NOT a
--     uuid -- despite ambassador-schema.sql declaring it
--     `uuid REFERENCES auth.users`. That original type was never actually
--     fixed in prod until 2026-07-16 (this comment previously claimed it
--     already had been -- it hadn't; the column really was uuid, and
--     stayed uuid, until the ALTER below was actually run). It went
--     undetected because referred_by had zero non-null rows until the
--     first real redemption attempt, which failed outright with
--     "operator does not exist: uuid = text" on redeem_referral_code's
--     WHERE referred_by = v_ambassador_code check -- get_my_referrals'
--     lower(p.referred_by) call has the identical latent bug and would
--     have failed the same way the first time anyone had a referral to
--     list. See the ALTER statements below, which actually perform the
--     fix this comment used to just assert had happened.
--   - The ambassadors / ambassador_referrals tables from
--     ambassador-schema.sql are NOT read by redeem_referral_code and
--     currently have zero rows in production. They are effectively
--     dead schema. This migration does not use them; user_profiles is
--     the only table involved.
--   - redeem_referral_code caps each code at 6 redemptions and does
--     NOT currently check ambassador_status, so the "Ambassador
--     status" dropdown in the admin panel has had no real effect.
--     This migration fixes that (see redeem_referral_code below).
-- ============================================================

-- ── History of past codes ─────────────────────────────────────
-- Lets "who used my code" keep showing people who redeemed a code the
-- ambassador has since changed away from.
CREATE TABLE IF NOT EXISTS ambassador_code_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  code        text        NOT NULL,
  replaced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_amb_code_history_user
  ON ambassador_code_history (user_id);

ALTER TABLE ambassador_code_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "amb_code_history_read_own" ON ambassador_code_history;
CREATE POLICY "amb_code_history_read_own" ON ambassador_code_history
  FOR SELECT USING (auth.uid() = user_id);
-- No direct insert/update policy for regular users: writes only happen
-- via set_my_referral_code (SECURITY DEFINER) below.

-- ── Backfill: ambassadors created before this migration default to
-- 'none' (the column's original default) even though they're live
-- ambassadors today. Treat existing ambassadors as active so this
-- migration doesn't silently break their already-shared codes.
UPDATE user_profiles
SET ambassador_status = 'active'
WHERE tier = 'ambassador' AND ambassador_status = 'none';

-- ── Fix referred_by column type: uuid -> text ───────────────────
-- ambassador-schema.sql originally created referred_by as
-- `uuid REFERENCES auth.users ON DELETE SET NULL`, but every function
-- below (and the admin panel) has always treated it as the ambassador's
-- plain-text referral code, not a uuid. This went undetected because
-- referred_by had zero non-null rows in production until the first real
-- redemption attempt (2026-07-16), which failed with "operator does not
-- exist: uuid = text" on redeem_referral_code's own WHERE clause. Guarded
-- so it's a safe no-op if the column has already been fixed (or created
-- correctly to begin with).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
      AND column_name = 'referred_by' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_referred_by_fkey;
    ALTER TABLE public.user_profiles ALTER COLUMN referred_by TYPE text USING referred_by::text;
  END IF;
END $$;

-- ── set_my_referral_code(p_code) ───────────────────────────────
-- Ambassador sets/changes their own code. Validates format, checks
-- uniqueness, and logs the outgoing code to history so past referrals
-- don't disappear from get_my_referrals() below.
CREATE OR REPLACE FUNCTION public.set_my_referral_code(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id   uuid := auth.uid();
  v_caller_tier text;
  v_old_code    text;
  v_new_code    text := lower(trim(p_code));
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tier, referral_code INTO v_caller_tier, v_old_code
  FROM public.user_profiles WHERE id = v_caller_id;

  IF v_caller_tier IS DISTINCT FROM 'ambassador' THEN
    RAISE EXCEPTION 'Only ambassadors can set a referral code';
  END IF;

  IF v_new_code !~ '^[a-z0-9]{4,30}$' THEN
    RAISE EXCEPTION 'Code must be 4-30 lowercase letters/numbers, no spaces or symbols';
  END IF;

  IF v_old_code IS NOT NULL AND v_old_code <> v_new_code THEN
    INSERT INTO public.ambassador_code_history (user_id, code) VALUES (v_caller_id, v_old_code);
  END IF;

  BEGIN
    UPDATE public.user_profiles SET referral_code = v_new_code WHERE id = v_caller_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That code is already taken -- try another.';
  END;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_my_referral_code(text) TO authenticated;

-- ── get_my_referrals() ──────────────────────────────────────────
-- Ambassador's view of who redeemed their code, current or past.
-- Only exposes rows tied to the CALLING user (auth.uid()) -- never
-- takes a client-supplied ambassador id.
CREATE OR REPLACE FUNCTION public.get_my_referrals()
RETURNS TABLE (
  display_name text,
  email text,
  tier text,
  subscription_status text,
  created_at timestamptz,
  referral_end timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.display_name, p.email, p.tier, p.subscription_status, p.created_at, p.referral_end
  FROM public.user_profiles p
  WHERE lower(p.referred_by) IN (
    SELECT lower(referral_code) FROM public.user_profiles WHERE id = v_caller_id AND referral_code IS NOT NULL
    UNION
    SELECT lower(code) FROM public.ambassador_code_history WHERE user_id = v_caller_id
  )
  ORDER BY p.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_referrals() TO authenticated;

-- ── redeem_referral_code: now also honors ambassador_status ─────
-- Previously a suspended/inactive ambassador's code kept working
-- because this check didn't exist. Everything else is unchanged from
-- the live function (see comment at top of file).
CREATE OR REPLACE FUNCTION public.redeem_referral_code(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ambassador_id uuid;
  v_ambassador_code text;
  v_ambassador_status text;
  v_redemption_count int;
  v_caller_id uuid := auth.uid();
  v_caller_tier text;
  v_already_referred text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tier, referred_by INTO v_caller_tier, v_already_referred
  FROM public.user_profiles WHERE id = v_caller_id;

  IF v_already_referred IS NOT NULL THEN
    RAISE EXCEPTION 'You have already redeemed a referral code';
  END IF;

  IF v_caller_tier IN ('pro', 'ambassador') THEN
    RAISE EXCEPTION 'You already have full access';
  END IF;

  -- Lock the ambassador row to serialize concurrent redemptions of the same code
  SELECT id, referral_code, ambassador_status INTO v_ambassador_id, v_ambassador_code, v_ambassador_status
  FROM public.user_profiles
  WHERE lower(referral_code) = lower(p_code) AND tier = 'ambassador'
  FOR UPDATE;

  IF v_ambassador_id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code';
  END IF;

  IF v_ambassador_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'This referral code is not currently active';
  END IF;

  IF v_ambassador_id = v_caller_id THEN
    RAISE EXCEPTION 'You cannot redeem your own referral code';
  END IF;

  SELECT count(*) INTO v_redemption_count
  FROM public.user_profiles
  WHERE referred_by = v_ambassador_code;

  IF v_redemption_count >= 6 THEN
    RAISE EXCEPTION 'This referral code has reached its limit of 6 redemptions';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'on', true);

  UPDATE public.user_profiles
  SET tier = 'referral',
      referred_by = v_ambassador_code,
      referral_end = now() + interval '365 days'
  WHERE id = v_caller_id;
END;
$$;
