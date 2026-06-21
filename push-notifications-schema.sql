-- ============================================================
-- Push Notifications Schema — nearby Live Pin alerts
-- Run once in Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================
-- One row per subscribed device (a user can have several: phone + laptop,
-- etc). Anchored to a lat/lon + radius the user sets when enabling push
-- (defaults to their currently selected departure location) rather than
-- live GPS, since GPS isn't available when the browser/app is closed and
-- push must still work then.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint      text        PRIMARY KEY,
  user_id       uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  p256dh        text        NOT NULL,
  auth_key      text        NOT NULL,
  lat           float8      NOT NULL,
  lon           float8      NOT NULL,
  radius_miles  float8      NOT NULL DEFAULT 25,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ps_select" ON push_subscriptions;
DROP POLICY IF EXISTS "ps_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "ps_update" ON push_subscriptions;
DROP POLICY IF EXISTS "ps_delete" ON push_subscriptions;

-- Users can only see/manage their own subscription rows. The
-- notify-nearby-live-pins edge function uses the service-role key, which
-- bypasses RLS entirely, so it can still read every row to find nearby
-- subscribers.
CREATE POLICY "ps_select"
  ON push_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ps_insert"
  ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ps_update"
  ON push_subscriptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ps_delete"
  ON push_subscriptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- Manual setup after running this SQL (cannot be done via git push):
--
-- 1. Generate a VAPID keypair (already generated for you — see chat).
-- 2. Set Edge Function secrets:
--      npx supabase secrets set VAPID_PUBLIC_KEY=<public key> --project-ref upxerlzdgdbjkbjpuktn
--      npx supabase secrets set VAPID_PRIVATE_KEY=<private key> --project-ref upxerlzdgdbjkbjpuktn
--      npx supabase secrets set VAPID_SUBJECT=mailto:jlintvet@riploc.com --project-ref upxerlzdgdbjkbjpuktn
-- 3. Deploy the edge function:
--      npx supabase functions deploy notify-nearby-live-pins --project-ref upxerlzdgdbjkbjpuktn
-- 4. In the Supabase dashboard: Database → Webhooks → Create a new webhook
--      Table: community_locations · Event: Insert
--      Type: Supabase Edge Functions · Function: notify-nearby-live-pins
--    (The function itself checks record.type === 'live' and no-ops for
--    report inserts, so no extra webhook filter condition is required.)
-- 5. In Vercel project settings, add env var:
--      VITE_SUPABASE_ANON_KEY is already set; additionally add
--      VITE_VAPID_PUBLIC_KEY=<public key>
--    then redeploy so the frontend bundle picks it up.
-- ============================================================
