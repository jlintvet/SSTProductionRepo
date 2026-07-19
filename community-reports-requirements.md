# Community Fishing Reports — Feature Requirements & UX Design
**riploc | Mid-Atlantic Offshore Fishing Map**
*Drafted: 2026-06-11*

---

## 1. Feature Overview

Community Reports gives registered users a private, reciprocal layer on the map where anglers share real fishing results. Access is earned by contributing — or held by Pro subscribers. A tipping system (Venmo/CashApp) and a points system create economic and social incentives to post accurate, timely reports.

**Available to all registered users — free and Pro.**

**Design philosophy:** Low friction to submit, high value to receive, transparent access rules, and zero forum noise. This is a map feature, not a feed.

---

## 2. Location Types

### 2a. Live Pin
- Created **during** an active trip to signal "I'm on fish here right now."
- Placement: one-tap auto-snap to user's current GPS, or manual drag to adjust.
- **As implemented (changed 2026-06-21):** persists **7 days** like a Report,
  but only renders with the pulsing live styling for the **first 48 hours**
  (up from an original 24h). After 48h it automatically reverts to the
  same styling/badge as a Report pin for the remainder of its 7-day life —
  it never just disappears the way the original 24h-expiry design did.
  `type` in the database stays `'live'` permanently as a record of how the
  pin was created; the "is it still pulsing" state is computed client-side
  from `created_at`, not stored.
- Optional photo attachment (see Section 4).
- Counts toward the 30-day contribution window.
- Visual: pulsing green beacon for 48h, then flat cyan dot identical to a Report.

### 2b. Report Pin
- Created **after** a trip ends as a permanent record.
- Contains full catch detail (see Section 4).
- **Expires: 7 days** after creation (auto-removed from map).
- Optional photo attachment (see Section 4).
- Counts toward the 30-day contribution window.
- Visual: flat cyan dot (not currently color-coded by species — see Section 8 note).

---

## 3. Access / Reciprocity System

### The Rule
A user can view community pins if **either** condition is met:
1. They have posted at least one Live or Report location in the **last 30 days**, **OR**
2. They have an active **Pro subscription**

Pro subscribers always have access regardless of contribution history. This rewards Pro loyalty and gives a clear subscription benefit.

### Access States

| State | Who | UI Behavior |
|---|---|---|
| **Active — contributed** | Posted within last 30 days (any tier) | Full pin visibility. Count of active reports shown. |
| **Active — Pro** | Pro subscriber, regardless of posting history | Full pin visibility. No contribution required. |
| **Warning** | Free user, 21–30 days since last post | Banner: *"Your access expires in X days — post your next trip to keep it."* |
| **Expired** | Free user, >30 days, no recent post | **Zero pins shown.** Message: *"Post a recent catch to unlock community reports — or upgrade to Pro for permanent access."* |
| **New user** | Never posted (free) | **Zero pins shown.** CTA: *"Post your first catch to see where others are fishing."* |

### Key Principle
The location is the valuable asset — no pin positions are revealed to users without access. The access message appears only in the layer toggle UI, never on the map.

---

## 4. Report Data Model

### Required Fields
| Field | Input | Notes |
|---|---|---|
| **Location** | Auto-pulled from map tap | Lat/lon + nearest bathymetry depth auto-appended |
| **Type** | Toggle: Live / Report | Determines expiry |
| **Trip date** | Native date picker, next to the Type toggle (added 2026-07-19) | Defaults to today, capped at today (no future dates). See Section 20. |
| **Species** | Multi-select dropdown | See species list below |
| **Quantity** | Stepper per species selected | e.g., "3 Yellowfin, 1 Mahi" |

### Recommended Optional Fields
| Field | Input |
|---|---|
| **Water temp** | Auto-pulled from SST layer at that pin location |
| **Water color** | Dropdown: Blue / Blue-green / Green / Murky |
| **Bait / technique** | Dropdown: Trolling / Chunking / Jigging / Live bait + free text |
| **Notes** | Free text, 280 char max |

### Species Dropdown
Yellowfin tuna · Blackfin tuna · Bluefin tuna · Mahi-mahi · White marlin · Blue marlin · Wahoo · Cobia · Grouper · Rockfish · Seabass · Tilefish · Flounder · Other

*(Cobia through Other added 2026-06-21.)*

> **UX note:** Pre-select species based on the fishing hotspot layer's predictions for that location if available. User confirms or changes.

### Photos (implemented 2026-06-21, extended to up to 10 on 2026-07-18)
- Up to 10 optional photos per Live pin or Report, uploaded via the existing `share-images`
  storage bucket (same upload pattern as the Help & Report Issues form).
- 8 MB cap per photo, validated client-side before upload (unchanged from the original 1-photo
  version — a deliberate call not to lower it just because the count went up).
- Stored as `image_urls` (`text[]`) on the `community_locations` row — see Section 19. The
  original single `image_url` column is left in place, unused, rather than dropped.
- Displayed in the pin detail popup card on the map (single photo = full-width hero image; 2+
  = horizontal thumbnail strip), clicking any photo opens a full-screen lightbox with prev/next
  through the set (Section 19). Manageable (add/remove any individual photo) from the admin panel
  (`admin/community_admin.html`).
- Storage cleanup: a daily scheduled job deletes the underlying storage objects once a pin
  expires — see Section 19, this didn't exist before 2026-07-18 and photos from expired pins
  accumulated in the bucket forever.

---

## 5. Pin Card (What Viewers See)

When a user taps an active community pin, a bottom sheet / popup shows:

```
[Species icon]  Yellowfin + Mahi          [Live | Report badge]
Posted by: @captainmike  ·  4 hours ago

📍 38.2°N, 74.1°W  ·  95ft bottom
🌡 73°F  ·  Water: Blue-green
🎣 Chunking, 3 Yellowfin, 1 Mahi
📝 "Found them on the temp break, SW corner of the 100 hole"

[👍 Thank]   [$  Tip $5]   [🚩 Flag]
```

- **Thank**: Free, one-tap acknowledgment (like a like). Visible count.
- **Tip**: Opens Stripe payment sheet. Suggested amounts: $3 / $5 / $10 / Custom.
- **Flag**: Reports bad/fake report for manual review.

**Anonymous posts (implemented 2026-07-18 — see Section 18):** if the poster chose to post
anonymously, "Posted by:" shows **"Anonymous Contributor"** instead of their real name — everything
else on the card (species, notes, photo, temp, Tip button) is unchanged. Jon can always see the
real identity in the admin panel; other users cannot.

**Backdated trip date (implemented 2026-07-19 — see Section 20):** the "posted X ago" line only
ever reflects `created_at` (when the post hit the database). If the poster picked a trip date
other than today, an amber **"· Trip: Jul 15"** badge appears right after it, in both the sidebar
list row and the pin popup. No badge for the common case (same-day post) — nothing changes for
most reports.

**Delete (implemented 2026-07-19 — see Section 20):** a pin's creator sees a trash icon next to
the popup's close (×) button, visible only to them — nobody else, including other logged-in users
viewing the same pin, sees it.

---

## 6. Tipping (Venmo / CashApp / Zelle deep link)

No payment processing in-app. Tips go peer-to-peer via the user's preferred payment app. The riploc app records tip intent for tracking and leaderboards.

### Author Setup
- In their profile, authors optionally enter one or more handles:
  - **Venmo** username (e.g. `@captainmike`)
  - **CashApp** $cashtag (e.g. `$captainmike`)
- No PII collected or displayed. Venmo/CashApp handles are chosen by the user and are already public on those platforms.
- At least one handle must be set for the Tip button to appear on their reports.
- **Anonymous posts still show the handle.** Posting anonymously (Section 18) hides the poster's
  display name, not their payment handle — the handle was already treated as non-PII above, and
  hiding it too would break tipping entirely (a captain going anonymous still wants tips). This
  was an explicit trade-off Jon confirmed rather than building a heavier in-app payment mediation
  layer.

### Tipper Flow
1. User taps **Tip** on a report card.
2. App shows a tip amount input (suggested: $3 / $5 / $10 / custom) and the available payment apps for that author.
3. User enters amount and selects platform.
4. App **records the tip intent** in `community_tips` (tipper, recipient, location, amount, platform, timestamp) — as of 2026-07-18 this goes through the `record_community_tip` RPC rather than a direct client insert, so the client never needs the poster's real `user_id` (see Section 18).
5. App opens the deep link — payment app launches with amount and recipient pre-filled where supported:
   - Venmo: `venmo://paycharge?txn=pay&recipients=USERNAME&amount=5&note=riploc`
   - CashApp: `cashapp://cash.app/$USERNAME` (amount filled in app)
   - Zelle: not supported.
6. Author receives in-app notification: *"@user sent you a $5 tip on your yellowfin report!"*

### Important Note
The app records tip intent at step 4 — it cannot verify the payment was completed in the external app. This is trust-based, appropriate for a fishing community. Leaderboard data reflects logged intent.

### Tracking & Analytics (Supabase)

**`community_tips` table**
```sql
id                uuid primary key
location_id       uuid references community_locations
tipper_user_id    uuid references auth.users
recipient_user_id uuid references auth.users
amount            float4          -- dollar amount entered in-app
platform          text            -- 'venmo' | 'cashapp'
created_at        timestamptz default now()
```

**Leaderboard queries**
```sql
-- Top tippers (by total dollars logged)
SELECT tipper_user_id, sum(amount) as total_tipped
FROM community_tips GROUP BY tipper_user_id ORDER BY total_tipped DESC;

-- Top tip recipients (most appreciated reporters)
SELECT recipient_user_id, sum(amount) as total_received, count(*) as tip_count
FROM community_tips GROUP BY recipient_user_id ORDER BY total_received DESC;

-- Top location posters (most active contributors)
SELECT user_id, count(*) as reports_posted
FROM community_locations GROUP BY user_id ORDER BY reports_posted DESC;
```

**In-app leaderboard surfaces — visible to ALL registered users (no contribution gate):**
- Single **"Top Users"** leaderboard, ranked by lifetime points earned
- Each row: rank · username · lifetime points · tips received · reports posted
- This gives non-contributors a clear picture of who the active community members are and what good participation looks like — a passive incentive to join
- Filterable by: this month / all time

*Placement: see Section 16.*

---

## 7. Points System

Users earn points for posting community locations. Points are a social currency displayed on their profile and the leaderboard — no cash value.

| Action | Points |
|---|---|
| Post a **Report** (after trip) | **1,000 pts** |
| Post a **Live** location (while on the water) | **5,000 pts** |

Live locations are worth 5× more because they are harder to post (requires being offshore, time-sensitive) and more valuable to the community (actionable right now).

### Points Storage
- Add `points` column to the user profile table (or a dedicated `user_points` table if point history is needed).
- Points are awarded server-side (Supabase Edge Function or RLS trigger) when a `community_locations` row is inserted — not client-side, to prevent manipulation.

### Points Display
- Shown on user profile: **total lifetime points**
- Shown on leaderboard alongside tips: rank · username · lifetime points · tips received · reports posted
- Points do not expire. They are a permanent record of contribution.

### Future Uses (not in MVP)
- Points thresholds could unlock cosmetic profile badges (e.g., "100K point angler")
- Could factor into leaderboard ranking alongside tips

---

## 8. Trip-End Prompt (Smart Report Nudge)

Since GPS tracking already exists in the app:

1. **Detect offshore session**: User's GPS moves more than ~2 miles from coastline and stays there for ≥1 hour.
2. **Detect return**: User returns within 1 mile of the coastline / port area.
3. **Trigger prompt** (30 min after returning, or when app is re-opened):
   > *"Looks like you just got off the water! 🎣 Share your trip to keep access to community reports — takes under a minute."*
   - CTA: **Share Report** | **Skip**
   - If skipped, suppress prompt for 4 hours (don't be annoying).
4. If user had an active Live pin during the trip, prompt upgrades it: *"Convert your live pin to a full report?"* — prefills all location data.

---

## 8. Map UI / Visual Design

### Layer Toggle
- Community Reports is a toggleable layer in the existing map control panel (alongside SST, currents, etc.).
- Toggle label: **"Community Reports"** with a count badge: e.g., `Community Reports (12)`.
- When toggled on and user is in expired/locked state, show the access wall UI inline.

### Pin Styling
| Type | Visual | Color |
|---|---|---|
| Live, first 48h | Pulsing beacon with outer ring animation | Lime/green (`#84cc16`) |
| Live, after 48h | Flat dot, identical to Report | Cyan (`#00d4ff`) |
| Report (any species) | Flat dot | Cyan (`#00d4ff`) |
| Expired user | No pins rendered at all | — |

**Note:** the original per-species color/icon scheme above (blue for tuna, purple
sword for billfish, etc.) was never implemented as written — all Report pins,
and Live pins past their 48h window, currently render as a single flat cyan
dot regardless of species. Species is still shown in the pin's detail popup
card, just not color-coded on the map itself. Revisit if this distinction
becomes valuable (e.g. once the hotspot-scoring species filter ships).

### Cluster Behavior
- At low zoom, nearby pins cluster with a count badge.
- Expanding cluster shows individual pins.
- Do not mix community pins with existing wreck/hotspot markers in clusters.

---

## 9. Database Schema (Supabase)

### `community_locations`
```sql
id              uuid primary key
user_id         uuid references auth.users
type            text check (type in ('live', 'report'))
lat             float8
lon             float8
species         text[]           -- array e.g. ['yellowfin', 'mahi']
quantity        jsonb            -- e.g. {"yellowfin": 3, "mahi": 1}
water_temp      float4           -- auto-populated from SST at creation
water_color     text
technique       text
notes           text
image_url       text             -- optional photo, added 2026-06-21 (share-images bucket).
                                  -- Left in place unused as of 2026-07-18 -- see image_urls below.
image_urls      text[] default '{}'  -- added 2026-07-18, replaces image_url, up to 10 (CHECK
                                      -- constraint), see Section 19
tip_count       int default 0
tip_total       float8 default 0
thank_count     int default 0
created_at      timestamptz default now()
expires_at      timestamptz      -- now() + 7d for BOTH live and report (changed 2026-06-21;
                                  -- live pins additionally render with pulsing styling for
                                  -- the first 48h only, computed from created_at -- see Sec. 2a)
is_flagged      bool default false
is_anonymous    bool default false  -- added 2026-07-18, see Section 18
trip_date       date not null default current_date  -- added 2026-07-19, see Section 20
```

**Note (2026-07-18):** `water_color` and `technique` above were never actually implemented as
real columns — they were part of the original schema sketch but the shipped form (Section 4)
never wrote to them. The real column is `tip_total_cents` (integer), not `tip_total` (float8) as
sketched above; there's also a `points_awarded` column (integer) recording per-post points at
insert time. Treat this block as historical intent, not current truth — see `community-schema.sql`
in the repo for what's actually live.

### `community_locations_public` (view, added 2026-07-18 — see Sections 18 & 19)
```sql
-- The map reads pins from THIS view, not the raw table above. Masks
-- display_name to "Anonymous Contributor" for is_anonymous rows and drops
-- user_id entirely for every row (not just anonymous ones — the client
-- never legitimately needs it; see Section 18 for why). Exposes image_urls
-- (array), not the legacy single image_url column -- see Section 19.
-- trip_date and is_own added 2026-07-19 (Section 20) -- trip_date was
-- originally missed from this explicit column list when the column was
-- added, so backdated posts silently showed "Just now" on the map for a
-- window until this was caught and fixed. is_own is computed server-side
-- per requesting user (auth.uid() = user_id) so a viewer can tell which
-- pins are their own without user_id itself ever reaching the client.
CREATE VIEW community_locations_public
WITH (security_invoker = true) AS
SELECT
  id, type, lat, lon, species, quantity, water_temp, notes, image_urls,
  points_awarded, tip_count, tip_total_cents, thank_count, created_at, expires_at,
  is_flagged, is_anonymous,
  CASE WHEN is_anonymous THEN 'Anonymous Contributor' ELSE display_name END AS display_name,
  venmo_handle, cashapp_handle, trip_date,
  (user_id = auth.uid()) AS is_own
FROM community_locations
WHERE is_flagged = false AND expires_at > now();
```

### `community_tips`
```sql
id                    uuid primary key
location_id           uuid references community_locations
tipper_user_id        uuid references auth.users
recipient_user_id     uuid references auth.users
amount_cents          int              -- logged at tip intent, peer-to-peer via Venmo/CashApp
platform          text check (platform in ('venmo', 'cashapp'))
created_at            timestamptz default now()
```

### `record_community_tip` (RPC, added 2026-07-18 — see Section 18)
```sql
-- All tips go through this RPC now, not a direct community_tips insert.
-- Resolves recipient_user_id server-side from location_id (the client
-- doesn't have user_id -- see community_locations_public above) and
-- increments tip_count/tip_total_cents, fixing a pre-existing bug where
-- that counter update ran as the tipper and was silently RLS-blocked
-- (cl_update requires auth.uid() = user_id, which a tipper never is).
CREATE OR REPLACE FUNCTION record_community_tip(
  p_location_id uuid, p_amount_cents integer, p_platform text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_recipient uuid;
BEGIN
  SELECT user_id INTO v_recipient FROM community_locations WHERE id = p_location_id;
  IF v_recipient IS NULL THEN RAISE EXCEPTION 'location not found'; END IF;
  INSERT INTO community_tips (location_id, tipper_user_id, recipient_user_id, amount_cents, platform)
  VALUES (p_location_id, auth.uid(), v_recipient, p_amount_cents, p_platform);
  UPDATE community_locations
  SET tip_count = tip_count + 1, tip_total_cents = tip_total_cents + p_amount_cents
  WHERE id = p_location_id;
END;
$$;
```

### `community_flags`
```sql
id           uuid primary key
location_id  uuid references community_locations
reporter_id  uuid references auth.users
reason       text
created_at   timestamptz default now()
```

### Access Check (Row-Level Security / query)
```sql
-- User can view community_locations if:
-- 1. They have a row in community_locations created within last 30 days, AND
-- 2. The location's expires_at > now()
SELECT EXISTS (
  SELECT 1 FROM community_locations
  WHERE user_id = auth.uid()
  AND created_at > now() - interval '30 days'
) AS has_access;
```

---

## 10. User Profile Additions

Each user profile should surface:
- **Reports submitted** (total, last 30 days)
- **Thanks received** (total)
- **Tips received** (total $, lifetime)
- **Streak**: consecutive months with at least one report
- **Stripe Connect status**: Connected / Not connected (with setup CTA if tips received but no account)

---

## 11. Notifications

| Event | Notification | Status |
|---|---|---|
| **Live pin nearby** | "{name} just dropped a live pin — {species}" | **Implemented 2026-06-21** — see Section 17 |
| Trip end detected | "You just got off the water — share your trip!" | Not built |
| Access expiring | "Your community access expires in 5 days — share a trip to keep it." | Not built |
| Access expired | "You no longer have access to community reports. Post your latest trip to unlock." | Not built |
| Tip received | "@user tipped you $5 on your yellowfin report" | Not built |
| Thank received | "@user thanked you for your report" | Not built |
| Report flagged (for author) | "Your report was flagged for review and temporarily hidden." | Not built |

---

## 12. Moderation (MVP)

- **Flag button** on every community pin card (authenticated users only).
- After **3 unique flags**, pin is auto-hidden pending review.
- Jon reviews flagged pins via Supabase dashboard query on `community_flags`.
- Dismiss flag (restore pin) or delete pin + notify author.
- Future: GPS verification that user was actually offshore when report was created (compare report creation coords to reported pin location).

---

## 13. Leaderboard Placement

The app is a single-page map with a collapsible `MapControlPanel` containing sections: Data layer / Tools / Overlays. No separate nav exists.

**Recommended approach: new "Community" section in MapControlPanel**

Add a **Community** section (collapsible, same pattern as existing sections) containing:
- Toggle to show/hide community pins layer on map
- Access status indicator (active / X days remaining / locked)
- **"Top Users" button** — opens a full-screen modal overlay

**Top Users modal**
- Full-screen overlay (same style as existing modals in the app)
- Ranked table: Rank · Username · Reports posted · Lifetime tips received
- Filter tabs: **This Month** / **All Time**
- Visible to all registered users — no contribution gate
- A "Post a Report" CTA at the bottom for users who haven't contributed

This keeps all community functionality in one logical place in the existing UI pattern with zero new navigation.

---

## 14. Subscription / Access Tier

- **Community Reports is available to all registered users — free and Pro.**
- Access gate: post a catch within 30 days **OR** hold an active Pro subscription.
- Pro subscribers never lose access due to inactivity — their subscription is sufficient.
- Free users must stay active (post within 30 days) to maintain access.
- Points, tips, leaderboard, and posting are identical for both tiers — no feature disparity beyond the access gate.

---

## 15. Build Phases

### Phase 1 — Core (MVP)
- [ ] Supabase schema: `community_locations`, `community_tips`, `community_flags`
- [ ] Report creation UI: bottom sheet with species/quantity input, triggered from map long-press
- [ ] Live pin creation: one-tap from map, GPS snap
- [ ] Map layer: community pins with 7-day filter, type-based icons
- [ ] Pin card: view detail, Thank button, Flag button
- [ ] Access gate: 30-day check, countdown UI for lapsed users

### Phase 2 — Tips
- [ ] Stripe Connect setup for authors
- [ ] Tip flow (payment sheet, suggested amounts)
- [ ] Tip notifications
- [ ] Author payout dashboard

### Phase 3 — Smart Nudge + Polish
- [ ] Trip-end detection + report prompt
- [ ] Live-to-report conversion flow
- [ ] Auto-populate water temp from SST layer at pin location
- [ ] User profile: tips/thanks stats, streak
- [x] **Push notifications for nearby Live pins** (2026-06-21 — see Section 17; not
      access-expiry/tips/thanks as originally scoped here, those remain undone)
- [x] Photo attachment on Live pins/Reports (2026-06-21 — not originally in this phase list)
- [x] Expanded species list (2026-06-21 — not originally in this phase list)
- [x] Live pin 48h pulse-then-revert instead of 24h hard expiry (2026-06-21)
- [x] Anonymous posting toggle, account default + per-post override (2026-07-18 — see Section 18;
      not originally in this phase list)

---

## 16. Key UX Principles

1. **Submission takes < 60 seconds.** Every extra field is a reason not to submit.
2. **The map is the UX.** No separate feed or forum — all reports are points on the existing map.
3. **Transparency over punishment.** The access wall shows users exactly what they're missing and exactly what to do to get it back.
4. **Economic incentive is real but secondary.** Tips reward quality, but the primary incentive is reciprocal access. Most anglers will share to stay in the network.
5. **Live pins are ephemeral and exciting.** The pulsing animation should make them feel like a live radar blip — something special happening right now.
6. **Never mislead on location.** If GPS verification shows a pin was placed far from where the user actually was offshore, flag it automatically. Accuracy is the product.

---

## 17. Push Notifications — Nearby Live Pins (Implemented 2026-06-21/22)

Real Web Push notifications when another angler drops a **Live** pin within a
user-configured radius. Built and debugged over several rounds — documented
in full here since multiple non-obvious platform limitations and bugs were
involved.

### Scope decisions
- **Live pins only.** Post-Trip Reports don't trigger a notification — a
  report posted hours/days ago about fish history isn't time-sensitive enough
  to push to someone's phone.
- **Settings location: User Settings modal, not the map control panel.**
  Originally built into `MapControlPanel`'s Community section, then moved —
  this is an account-level preference, not a map-layer toggle.
- **Two anchor modes**, user-selectable:
  1. **Departure location** (default) — anchored to whatever port the user
     has selected. Works even when the browser/app is fully closed, since it
     doesn't depend on live device GPS. Auto-updates if the user changes
     their departure location later (no need to re-toggle notifications).
  2. **Live GPS** (opt-in checkbox, only meaningful while GPS tracking is
     on) — anchors to the live boat position instead, for the "notify me
     about live pins near where I'm actually fishing right now" case.
     Throttled to re-sync at most every 2 minutes (or sooner if moved >1mi)
     to avoid hammering the database on every GPS tick. Falls back to the
     departure-location anchor the instant GPS tracking is turned off, so a
     stale position from hours ago never lingers as the anchor.
- **Radius**: user-configurable, 1–250 miles, default 25.

### Platform limitation: iOS Safari
iOS Safari does not expose the Push API (`ServiceWorker`/`PushManager`) in a
regular browser tab at all — **only** inside a site that's been added to the
Home Screen ("Add to Home Screen" in the Share menu), and only on iOS 16.4+.
This is an Apple platform restriction with no workaround at the web-platform
level. The Notifications section in User Settings always renders (it used to
hide itself entirely when unsupported, which looked like the setting was
broken/missing — fixed 2026-06-22): it shows the real controls when the Push
API is available, or step-by-step "Add to Home Screen" instructions
otherwise.

### Architecture
- **`push_subscriptions` table** (`push-notifications-schema.sql`): one row
  per subscribed device — `endpoint` (PK), `user_id`, `p256dh`/`auth_key`
  (Web Push subscription keys), `lat`/`lon` (current anchor), `radius_miles`,
  `use_gps` (bool), timestamps. RLS: users manage only their own rows; the
  edge function reads all rows via the service-role key (bypasses RLS).
- **`src/public/sw.js`** — service worker. Handles the `push` event (shows
  the OS notification) and, as of 2026-06-22, also `postMessage`s every open
  tab so the map can refresh community pins immediately instead of waiting
  on the periodic poll. Handles `notificationclick` to focus/open the app.
- **`src/lib/pushNotifications.js`** — subscribe/unsubscribe/update helpers
  (`enablePushNotifications`, `disablePushNotifications`,
  `updatePushPreferences`, `getExistingSubscription`).
- **`src/hooks/usePushNotifications.js`** — all state/handlers/sync-effect
  logic as a standalone hook (originally lived inside `SSTHeatmapLeaflet.jsx`,
  extracted so `UserSettingsModal` — a sibling of the map, not nested under
  it — could call it directly via `useAppContext()`).
- **`gpsActive`/`boatPosition`** were lifted from `SSTLive.jsx` local state
  into `AppContext` so the Settings modal (which isn't nested under the map)
  can read live GPS position. `SSTLive.jsx` still owns the actual
  `navigator.geolocation.watchPosition()` call; it just writes through the
  context setters now.
- **`supabase/functions/notify-nearby-live-pins`** — Supabase Edge Function,
  triggered by a **Database Webhook** (Dashboard → Database → Webhooks:
  table `community_locations`, event `Insert`, type Supabase Edge Function).
  On every insert: skips non-`live` rows, fetches all `push_subscriptions`,
  computes Haversine distance from the new pin to each subscription's
  anchor, excludes the poster's own subscriptions, sends via `web-push`
  (npm, used from Deno via the `npm:` specifier) to everything within radius,
  and prunes subscriptions that come back 404/410 (uninstalled/revoked).
  Logs every branch explicitly (cold-start secret check, invocation receipt,
  per-subscription distance decision, final targeted/sent counts) — an
  earlier version only logged on the catch-all error path, which made
  "webhook never fires" and "webhook fires and works perfectly" produce
  identical (empty-looking) logs.
- **VAPID keypair**: generated once, public key baked into the frontend via
  `VITE_VAPID_PUBLIC_KEY` (Vercel env var), private key + subject stored as
  Edge Function secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`).
- **Map auto-refresh**: `community_locations` was previously fetched once
  per session with no polling — a new pin from another user never appeared
  until the whole app was closed and reopened. Now polls every 20s while the
  tab is visible (paused while backgrounded, to save battery on the water),
  refetches immediately on regaining foreground, and — as of 2026-06-22 —
  refetches instantly the moment a push notification's service-worker
  message arrives, rather than waiting on the poll.

### Manual deployment steps (none of this ships via `git push`)
1. Run `push-notifications-schema.sql` in the Supabase SQL editor.
2. Set the three `VAPID_*` secrets on the Edge Function.
3. Deploy `notify-nearby-live-pins` (CLI, or paste into the dashboard's
   function editor — the dashboard editor has mangled multi-line comments
   on at least one occasion; a comment-free/no-TypeScript-annotations
   version is kept ready for that path).
4. Create the Database Webhook (Database → Webhooks) pointing at the
   deployed function.
5. Add `VITE_VAPID_PUBLIC_KEY` to Vercel env vars and redeploy.

### Bugs found and fixed during build (kept for institutional memory)
1. **CSP `worker-src` only allowed `blob:`, not `'self'`** — blocked the
   service worker from registering at all (added for Mapbox GL's internal
   workers; same-origin SW registration needs `'self'` too).
2. **`userId` race in `SSTLive.jsx`/`AppContext.jsx`** — both had their own
   `supabase.auth.getUser()` call with no `.catch()`/retry. A transient
   rejection (`AbortError: Lock broken by another request, steal option` —
   supabase-js's auth lock under multi-tab/rapid-reload contention) left
   `userId` stuck at `null` for the rest of the session with zero visible
   error, silently breaking every `userId`-gated feature — including the
   push subscribe call (sent `user_id: null`, which RLS correctly rejected
   with an opaque "violates row-level security policy" message that gave no
   hint the real cause was an empty id) and the Settings modal itself
   (`UserMenu`'s `{showSettings && userId && <UserSettingsModal/>}` guard
   silently never rendering). Fixed with a one-time retry after 1.5s on both
   call sites.
3. **Radius/use-GPS preferences silently reverted to defaults after
   reload** — the restore-on-mount effect set `pushEnabled` and
   `pushRadius`/`pushUseGps` as separate sequential `setState` calls;
   `pushEnabled` flipped `true` before the DB-restored values landed, so the
   auto-sync effect (keyed on `pushEnabled`) fired once with the *default*
   25mi/GPS-off, overwriting the real saved values back to default in the
   database moments after a successful save. Fixed by restoring values
   before enabling (same callback, batched by React 18) plus a guard ref.
4. **Radius `<input>` couldn't be cleared to retype** — clamping
   (`parseInt(...) || 1`) ran on every keystroke including an empty string,
   so the controlled value snapped back to "1" the instant the field was
   cleared. Fixed by buffering input as free text, clamping only on
   blur/Enter.
5. **GPS toggle showed "on" even when location permission was denied** —
   `toggleGps()` called `setGpsActive(true)` unconditionally right after
   starting `watchPosition()`, regardless of success. On `PERMISSION_DENIED`
   the only symptom was a `console.warn` nobody sees — the button stayed
   "on," `boatPosition` never populated, and the live-GPS anchor silently
   fell back to the departure-location point with `use_gps: true` still
   stored (misleading: looked like the GPS *feature* was broken, when
   really location access had just never been granted). Fixed by alerting
   specifically on `PERMISSION_DENIED` and un-toggling GPS back off.

---

## 18. Anonymous Posting (Implemented 2026-07-18)

Lets a user hide their identity on a community report/live pin while still earning leaderboard
credit and receiving tips. Motivation: commercial charter captains post real, valuable catch
reports but don't want their identity publicly linked to a specific spot/catch. Full design
writeup: `community-reports-anonymous-posting-plan.md`.

### Scope decisions
- **Toggle scope: account-level default + per-post override.** A "Post reports anonymously by
  default" toggle lives in User Settings → Community Profile
  (`user_profiles.post_anonymously_default`). The report form's own "Post anonymously" checkbox
  is pre-filled from that default each time but is independently editable per post — a captain
  who defaults to anonymous can un-check it for one report, and vice versa. Only the per-post
  checkbox value is written to `community_locations.is_anonymous`; the account default itself is
  never silently changed by a one-off override.
- **Leaderboard credit: still counts under the real name.** Anonymous posts earn points and
  contribute to the poster's leaderboard total exactly as normal — `LeaderboardModal.jsx`
  deliberately queries the raw `community_locations` table (not the masking view below) as an
  authenticated user, so real names keep showing there. Only the map pin card hides identity; the
  leaderboard never reveals *which* specific report was posted anonymously.
- **Tip handle stays visible.** See the "Anonymous posts still show the handle" note in Section 6
  — hiding the handle too would require real in-app payment processing (Stripe Connect), which is
  a separate, larger project already tracked as unbuilt "Phase 2" work above.
- **Admin always sees the real identity.** `admin/community_admin.html` queries the raw
  `community_locations` table directly, unaffected by any of this — an "anonymous" badge is shown
  next to the pin's real name in the list and edit panel so it's visually obvious which posts are
  masked for the public, but the real `display_name`/`user_id` are always visible to Jon.

### Architecture: the core problem this had to solve
Before this feature, `fetchCommunityLocations()` in `SSTLive.jsx` did `select("*")` on
`community_locations` and shipped the **entire row** — including `user_id`, `display_name`,
`venmo_handle`, `cashapp_handle` — to every logged-in browser tab; the pin card just picked which
fields to *display*. That's fine when nothing is private, but hiding `display_name` only in the
React component would still leave the real `user_id` and name sitting in the network response,
visible to anyone who opens devtools. Per this doc's parent `CLAUDE.md` architecture rule (fix
data problems at the source, not with a frontend workaround), this needed a server-side masking
layer, not a client-side hide.

- **`community_locations_public` view** (schema in Section 9) — the map now reads from this view
  instead of the raw table. It replaces `display_name` with `"Anonymous Contributor"` for
  `is_anonymous` rows and drops `user_id` **entirely, for every row** (not just anonymous ones —
  the client never had a legitimate reason to hold another user's raw `user_id`, so this closes a
  small privacy gap for non-anonymous posts too, for free).
- **`record_community_tip` RPC** (schema in Section 9) — since the client no longer has
  `user_id`, tipping can't insert into `community_tips` with `recipient_user_id: pin.user_id`
  client-side anymore. This `SECURITY DEFINER` RPC resolves the real recipient server-side from
  `location_id` instead. One code path for anonymous and non-anonymous posts, no branching.
- **Bug fixed as a byproduct:** the old client-side tip flow also did a separate
  `community_locations.update({ tip_count, tip_total_cents })` call as the *tipper* — but the
  `cl_update` RLS policy only allows `auth.uid() = user_id`, and the tipper is never the row
  owner, so that update was silently matching zero rows on every tip (Supabase JS doesn't throw
  on a zero-row RLS-filtered update). Pin tip counters had likely never actually incremented in
  production. Folding the increment into `record_community_tip` (which bypasses RLS via
  `SECURITY DEFINER`) fixes this as a side effect of routing tips through it for this feature.
- **`notify-tip-missing-handle` edge function updated (v4):** this function — fired when a tipper
  hits a pin with no payment handle set — previously took `recipient_user_id` straight from the
  client. Once the client stopped receiving `user_id` for any pin, that field would always be
  missing. Redeployed to resolve `recipient_user_id` server-side from `location_id` via its
  existing service-role lookup instead — a security improvement independent of this feature, since
  a client could previously have asserted an arbitrary `recipient_user_id` in that payload.

### Known minor side effect (not fixed)
The "Save Location" bookmark feature (saving a community pin into your own private
`saved_locations`) used to write `pin.user_id` into a `source_user_id` metadata column. Since the
client no longer receives `user_id` for any community pin, this column is now always `null` for
new community-sourced saves — anonymous or not. Low-stakes (that row is private to the saving
user and nothing currently reads the field back out), but it's a real scope-creep side effect of
dropping `user_id` for all rows rather than only anonymous ones. Flagging for awareness only.

### Files changed
`src/components/CommunityReportForm.jsx` (checkbox), `src/pages/SSTLive.jsx` (public view read),
`src/components/SSTHeatmapLeaflet.jsx` (`TipFlow` → RPC), `src/components/auth/UserSettingsModal.jsx`
(account default toggle), `admin/community_admin.html` (anonymous badge). Supabase migration and
the `notify-tip-missing-handle` redeploy were applied directly against the live project, not
repo-tracked — same pattern as this app's other backend changes (see Section 17's push
notification architecture for precedent). Jon confirmed working in prod same day.

---

## 19. Multi-Photo, Lightbox, Notes Fix, Photo Cleanup (Implemented 2026-07-18)

Bundled fix + two feature requests from the same conversation, same day as Section 18.

### Bug fixed: notes hard-truncated with no way to read the rest
The pin card rendered notes with Tailwind's `line-clamp-2` — anything past 2 lines was silently
cut off, no "read more," no visual cue there was more text. Removed entirely; the card already
measures its own height dynamically (see the two 2026-07 mobile-mispositioning fixes), so it just
grows to fit the full note now.

### Click-to-enlarge
No lightbox pattern existed anywhere in the app. New full-screen overlay in
`SSTHeatmapLeaflet.jsx` (`imageLightbox` state): click any pin photo, image opens at full size on
a dark backdrop with a close button; prev/next arrows and a position counter (`2 / 5`) appear
whenever the pin has more than one photo.

### Photos: 1 → up to 10 per pin
- **Schema**: `community_locations.image_urls text[] default '{}'` replaces the single
  `image_url` column (left in place, unused — not dropped, to avoid a destructive migration on a
  solo-dev app with no staging environment). Backfilled from existing `image_url` on migration.
  `CHECK (array_length(image_urls,1) IS NULL OR array_length(image_urls,1) <= 10)` enforces the
  cap server-side, not just in the UI.
- **Per-photo cap unchanged at 8MB** — a deliberate call (see scoping discussion) not to shrink
  the cap just because the count went up; a worst-case pin is now up to ~80MB across 10 photos,
  accepted as reasonable for phone photos.
- **`CommunityReportForm.jsx`**: file input takes multiple files (`<input type="file" multiple>`),
  thumbnail grid with individual per-photo remove before posting, uploads sequentially (not
  parallel — 10 concurrent uploads of full-size phone photos on a boat's connection was judged a
  bad idea) to the existing `share-images` bucket, same path convention as before.
- **Pin card display**: a single photo keeps the original full-width "hero" treatment
  (`object-contain`, so portrait photos aren't center-cropped); 2+ photos render as a horizontal
  scrollable thumbnail strip instead, since the 252px-wide card can't show more than one full-size
  image. Either way, clicking opens the lightbox above.
- **Admin (`admin/community_admin.html`)**: edit panel's Photo field became a full gallery —
  add multiple photos at once (up to the remaining slots under 10), remove any individual photo.
  Removing a photo now also deletes the underlying storage object, which the old single-image
  `removePinImage()` never did (it only nulled the DB column, leaving the file orphaned in
  `share-images` forever). Full per-image management was an explicit scope decision over a
  simpler view-only/remove-all gallery.

### Storage cleanup (new — closes a gap this feature made worse)
Nothing had ever deleted a pin's photo(s) from the `share-images` bucket once the pin expired —
`community_locations` rows past `expires_at` just stop being queried, their storage objects sit
there forever. Going from 1 photo/pin to up to 10 made that unbounded growth meaningfully worse,
so a cleanup job was added as part of this change (an explicit scope decision — the alternative
was shipping the 10-photo feature and leaving the gap for later):
- **`cleanup-expired-community-photos`** edge function (`verify_jwt: false` — not user-facing,
  pg_cron has no JWT to present). Scans `community_locations` rows past `expires_at` still holding
  `image_urls`, deletes the underlying storage objects (parsed from the public URLs), clears
  `image_urls` so the row isn't reprocessed. Batched at 500 rows/run, oldest-`expires_at`-first so
  a backlog makes steady progress across daily runs rather than re-scanning the same rows.
- **Auth**: a shared-secret header (`x-cron-secret`) checked against a `CRON_SECRET` function
  secret, since there's no MCP tool that can set Edge Function secrets programmatically — **this
  requires a one-time manual step**: paste the generated secret value into Supabase Dashboard →
  Edge Functions → `cleanup-expired-community-photos` → Secrets as `CRON_SECRET`. Until that's
  done, the daily cron call gets a harmless 401 and nothing is cleaned up.
- **Schedule**: `pg_cron` (newly enabled on this project) + `pg_net`, daily at 09:17 UTC (off the
  hour to avoid herd effects), calling the function via `net.http_post`. The secret value is
  stored in plaintext inside the `cron.job` SQL definition (`cron.job` table, readable only via
  elevated DB access, not exposed to any client) — a pragmatic call for a solo-dev app rather than
  the more involved Supabase Vault indirection.

### Files changed
`src/components/CommunityReportForm.jsx`, `src/components/SSTHeatmapLeaflet.jsx`,
`admin/community_admin.html` — one commit. Supabase migration (`community_multi_image_support`),
the new `cleanup-expired-community-photos` edge function, and the `pg_cron` schedule
(`community_photo_cleanup_cron`) were applied directly against the live project, not repo-tracked.

---

## 20. Trip Date + Self-Delete (Implemented 2026-07-19)

Two separate requests from the same conversation, bundled here since both touch
`community_locations_public` and shipped together.

### Trip date — problem being solved
Jon: reports were being posted well after the trip actually happened, but the map only ever
showed `created_at` (the posting timestamp) — a report about a catch from days ago read
identically to a fresh one ("2h ago"), with no way for a viewer to tell stale intel from current.

- **`CommunityReportForm.jsx`**: native `<input type="date">` next to the Live Pin / Post-Trip
  Report toggle (Section 4). Defaults to today, computed in the poster's **local** time (not
  `toISOString()`, which is UTC and can read as yesterday late in the evening) and capped at today
  via the `max` attribute — a trip can't be dated in the future.
- **Schema**: `community_locations.trip_date date not null default current_date` (migration
  `add_trip_date_to_community_locations`). Default backfills every pre-existing row as same-day,
  no explicit backfill statement needed.
- **Display**: `SSTHeatmapLeaflet.jsx` compares `trip_date` to the local calendar date of
  `created_at`; when they differ (a genuinely backdated post), an amber "· Trip: Jul 15" badge
  renders next to the existing time-since-posted text, in both the sidebar list row and the pin
  popup (Section 5). Same-day posts — the common case — show no badge, so this adds no visual
  noise to normal usage.
- **Bug caught same day**: `trip_date` was added to the raw table but not to
  `community_locations_public`'s explicit column list (the view the map actually reads — see
  Section 18 for why that view exists). Every backdated post kept showing "Just now" until this
  was noticed and the view updated to include it (Section 9). Lesson for future columns: adding a
  column to `community_locations` is not sufficient by itself if the frontend reads the `_public`
  view — both need updating together.

### Self-delete — problem being solved
Jon: "users need to be able to remove/delete a report they created. The delete/trash option should
only be available to the user that created the report when viewing the pin."

- **The blocker**: `community_locations_public` drops `user_id` for every row (Section 18's
  privacy design), so the client had no way to know which pins the current viewer actually owned.
- **Fix**: added `is_own` to the view — `(user_id = auth.uid())`, evaluated per requesting user.
  Each viewer's own query sees `is_own = true` only on their own rows; nobody else's identity is
  ever exposed, preserving the Section 18 guarantee.
- **UI**: pin popup shows a trash icon next to the close (×) button, only when `pin.is_own`.
  Confirms via `window.confirm` before deleting (same pattern as the existing "delete all saved
  locations/routes" confirms elsewhere in the app).
- **Delete = soft delete, not a hard `DELETE`**: sets `expires_at` to `now()`. Deliberately reuses
  the existing self-serve `cl_update` RLS policy (`auth.uid() = user_id`) instead of adding a new
  DELETE policy, disappears from every read instantly via the existing `cl_read` expiry filter, and
  lets the Section 19 `cleanup-expired-community-photos` cron job pick up and remove any attached
  photos on its normal daily schedule — exactly like a naturally-expired pin. A hard `DELETE` would
  skip that cron path and leak the photos in storage forever, since the cleanup job only ever scans
  for rows past `expires_at`, not deleted rows (which wouldn't exist to scan).

### Unrelated bug fixed in the same pass
While building the trip-date UI, a pre-existing cursor bug got fixed: hovering a wreck/bottom-
feature marker while in report-posting or route-planning mode left the map cursor stuck on a
"grab" hand icon after moving off, instead of returning to the active crosshair. Root cause: the
wreck marker's `mouseout` handler only knew how to restore the Inspect-tool's crosshair
(`interactionMode === "crosshair"`), with no awareness that `communityPinDrop` (report posting)
and `tripMode` (route planning) each set their own crosshair independently. Not a
`community_locations` schema/UX change, just noted here since it was found and fixed while working
this section — see `SSTHeatmapLeaflet.jsx` git history for the fix itself.

### Files changed
`src/components/CommunityReportForm.jsx`, `src/components/SSTHeatmapLeaflet.jsx`,
`src/pages/SSTLive.jsx` (`onCommunityDeleted` wiring) — two commits (trip date; then self-delete +
cursor fix). Three Supabase migrations applied directly against the live project, not
repo-tracked: `add_trip_date_to_community_locations`,
`add_trip_date_to_community_locations_public_view`, `add_is_own_to_community_locations_public_view`.
Jon confirmed all working in prod same day.
