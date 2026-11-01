-- comped-flag.sql -- applied to prod 2026-11-01 via Supabase migration
-- "add_comped_flag_and_protect_comped_tiers".
--
-- Bug: api/stripe-webhook.js set tier='standard' on customer.subscription.deleted
-- for whoever held the subscription, with no regard for admin-granted access.
-- Every signup gets a no-card 30-day Stripe trial, so comped Pro, ambassador and
-- referral users were silently demoted when it lapsed. create-trial-subscription
-- then created a fresh trial on the next login, repeating the cycle every 30 days.
--
-- Fix: comped flag (admin-only, guarded by protect_sensitive_profile_cols), the
-- webhook never changes tier for comped/ambassador/referral users, and the trial
-- endpoint only creates a trial for brand-new users.

alter table public.user_profiles add column if not exists comped boolean not null default false;

-- protect_sensitive_profile_cols(): added `NEW.comped IS DISTINCT FROM OLD.comped`
-- to the protected-column check so users cannot comp themselves.

-- generate_ambassador_code(): now only generates when NEW.referral_code IS NULL,
-- so re-promoting an ambassador keeps their existing code (and their referrals).

-- Data repair run the same day:
--   update user_profiles set tier='ambassador', comped=true
--     where ambassador_status='active' and tier<>'ambassador';          -- 5 users
--   update user_profiles set tier='referral'
--     where referred_by is not null and tier='standard' and referral_end > now(); -- 5 users
--   update user_profiles set comped=true where tier='ambassador';      -- 6 more

-- Second migration "guard_comped_tier_from_service_role" (same day): BEFORE UPDATE
-- trigger guard_comped_tier() keeps OLD.tier whenever a service_role write tries to
-- change tier on a comped/ambassador/referral user. Defense in depth so no future
-- server-side code path can repeat the demotion. Admin edits use the admin's JWT
-- and are unaffected.
