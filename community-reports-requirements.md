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

### Photo (implemented 2026-06-21)
- One optional photo per Live pin or Report, uploaded via the existing `share-images`
  storage bucket (same upload pattern as the Help & Report Issues form).
- 8 MB cap, validated client-side before upload.
- Stored as `image_url` on the `community_locations` row (nullable).
- Displayed in the pin detail popup card on the map, and manageable (replace/remove)
  from the admin panel (`admin/community_admin.html`).

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

---

## 6. Tipping (Venmo / CashApp / Zelle deep link)

No payment processing in-app. Tips go peer-to-peer via the user's preferred payment app. The riploc app records tip intent for tracking and leaderboards.

### Author Setup
- In their profile, authors optionally enter one or more handles:
  - **Venmo** username (e.g. `@captainmike`)
  - **CashApp** $cashtag (e.g. `$captainmike`)
- No PII collected or displayed. Venmo/CashApp handles are chosen by the user and are already public on those platforms.
- At least one handle must be set for the Tip button to appear on their reports.

### Tipper Flow
1. User taps **Tip** on a report card.
2. App shows a tip amount input (suggested: $3 / $5 / $10 / custom) and the available payment apps for that author.
3. User enters amount and selects platform.
4. App **records the tip intent** in `community_tips` (tipper, recipient, location, amount, platform, timestamp).
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
image_url       text             -- optional photo, added 2026-06-21 (share-images bucket)
tip_count       int default 0
tip_total       float8 default 0
thank_count     int default 0
created_at      timestamptz default now()
expires_at      timestamptz      -- now() + 7d for BOTH live and report (changed 2026-06-21;
                                  -- live pins additionally render with pulsing styling for
                                  -- the first 48h only, computed from created_at -- see Sec. 2a)
is_flagged      bool default false
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
