# Community Seed Content — Beta Bootstrapping Spec

**riploc | Mid-Atlantic Offshore Fishing Map**
*Status: Draft for review · Temporary beta feature · Author: working spec*

---

## 1. Purpose & Scope

During closed beta the community layer looks empty, which undercuts the perceived
value of Community Reports, Live Pins, the tipping system, and the leaderboard.

This spec defines a **temporary, clearly-labeled, fully-reversible seeding system**
that populates the community layer with **100 fictitious users**, a realistic but
**low** trickle of shared locations and live pins, and simulated tips — so the map
and leaderboard show life during beta. It is designed to be **deleted in one
operation** before public launch.

**This is seed/bootstrap content, not a permanent feature.** It exists only to make
the community surfaces non-empty while we acquire real users.

### In scope
- Create 100 fictitious `auth.users` + profiles, tracked in a registry table.
- Generate realistic offshore pins (`community_locations`) on an ongoing cadence.
- Generate simulated tips (`community_tips`) between seed users.
- A scheduled "top-up" job with a hard kill switch and end date.
- A one-command teardown.

### Out of scope
- Any real money movement (see §8).
- Any chat/feed/DM content (the app has none).
- Seeding real users' data or impersonating real people.

---

## 2. Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| D1 | Identity & cleanup | **Registry table** (`seed_users`) + real `auth.users` |
| D2 | Volume | **All 100 users eligible to post**, but **only 5–10 pins/day total** community-wide (each user therefore posts rarely — broad base, light activity) |
| D3 | Tips | **Records + null handles.** Tip button stays **visible** on seed pins. Seed users carry **null** Venmo/CashApp handles. |
| D4 | Duration | **Ongoing** scheduled job with **kill switch** + end date |
| D5 | Tip error state | **Universal graceful error** (§8): any pin whose owner has no handle for the chosen platform shows an error popup and opens no payment link — applies to seed pins **and** real handle-less users |

---

## 3. Data Model (as built) & Why Cleanup Is Easy

All community tables FK to `auth.users` with **`ON DELETE CASCADE`**:

```
community_locations.user_id          → auth.users  ON DELETE CASCADE
community_tips.tipper_user_id         → auth.users  ON DELETE CASCADE
community_tips.recipient_user_id      → auth.users  ON DELETE CASCADE
community_flags.reporter_id           → auth.users  ON DELETE CASCADE
user_points.user_id                   → auth.users  ON DELETE CASCADE
user_profiles.id                      → auth.users  (cascade)
```

**Implication:** deleting a seed `auth.users` row automatically removes *all* of that
user's pins, tips, points, flags, and profile. Teardown is therefore just "delete the
100 seed auth users." The registry table (D1) records exactly which 100 those are.

### Relevant columns
- **`community_locations`**: `user_id, display_name, type('live'|'report'), lat, lon,
  species text[], quantity jsonb, water_temp, notes, venmo_handle?, cashapp_handle?,
  points_awarded, expires_at, is_flagged(default false), tip_count, tip_total_cents,
  created_at`.
  > Note: the live schema (`community-schema.sql`) does not list `venmo_handle` /
  > `cashapp_handle` columns on `community_locations`, but the app writes them on insert.
  > **Action item:** confirm these columns exist (add them if not) before seeding, or
  > the insert will fail. See §11 Open Items.
- **`community_tips`**: `location_id, tipper_user_id, recipient_user_id, amount_cents,
  platform('venmo'|'cashapp'), created_at`.
- **`user_points`**: `user_id, total_points, report_count, live_count,
  tips_received_cents, updated_at`.

### How the app surfaces this content (drives the seeding rules)
1. **Map pins** (`SSTLive.jsx`): `select * where expires_at > now() AND is_flagged = false`.
   → Seed pins must have a **future `expires_at`** to appear. Live = 24h, Report = 7d.
2. **Leaderboard** (`LeaderboardModal.jsx`): aggregates **points from
   `community_locations`** (subject to the `cl_read` RLS policy =
   `expires_at > now() AND NOT is_flagged`) and **tips from `community_tips`**.
   → Because RLS hides expired pins, the leaderboard effectively reflects only the
   **last 24h–7d of activity**. Seed users must keep posting to stay ranked → this is
   why D4 (ongoing) is required.
3. **Access gate**: a viewer needs a post in the last 30 days **or** Pro. Real beta
   testers must still satisfy this themselves; seeding does not change their gate.

### RLS reality
Insert/update policies require `auth.uid() = user_id`. A normal client key cannot
insert rows on behalf of other users. **Seeding must run with the Supabase
`service_role` key**, which bypasses RLS. (See §9 — the key is a secret Jon provides;
it is never embedded in the app or shared in chat.)

---

## 4. Identity & Registry (D1)

### 4.1 Seed users
- Create **100** `auth.users` via the Supabase Admin API (`auth.admin.createUser`),
  `email_confirm: true`, random strong passwords (never reused, discarded after creation).
- Email pattern: `seed-<NNN>@seed.riploc.invalid` (reserved, non-deliverable TLD so the
  addresses can never receive mail or collide with real users).
- `app_metadata: { is_seed: true, seed_batch: "<ISO date>" }` — invisible to the app,
  queryable by admin, a redundant safety net for identification.
- One `user_profiles` row each: `display_name` = generated angler handle (see §5.1),
  plus `venmo_handle` / `cashapp_handle` (see §8).

### 4.2 Registry table (authoritative list)
```sql
CREATE TABLE seed_users (
  user_id     uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email       text NOT NULL,
  display_name text NOT NULL,
  batch       text NOT NULL,           -- e.g. '2026-06-18'
  active      bool NOT NULL DEFAULT true, -- is this user a "poster"?
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE seed_users ENABLE ROW LEVEL SECURITY;  -- no policies = service-role only
```
- The registry is the single source of truth for "who is fake."
- **All 100 are eligible posters/tippers** (D2). `active` stays for future tuning (e.g.
  temporarily benching a user) but defaults true for everyone. The cap is on
  **pins/day (5–10 total)**, not on how many users participate — so any of the 100 can
  appear as the author of a given day's posts, keeping the user base broad.
- RLS with **no policies** → invisible to all app clients, readable/writable only by the
  service role. (Even if read, it exposes nothing sensitive.)

### 4.3 Identification summary (3 redundant markers)
1. `seed_users` registry table (primary).
2. `auth.users.app_metadata.is_seed = true`.
3. `email LIKE '%@seed.riploc.invalid'`.

Any one is sufficient for teardown; all three agree.

---

## 5. Content Generation

### 5.1 Display names (angler handles)
Plausible, varied, no real-person names. Generated from pools, e.g.
`ReelTime_Capt`, `WahooWhisperer`, `OBX_Tightlines`, `CanyonRunner21`, `SaltLife_Mike`,
`MahiMagnet`, `OutcastSportfish`. Avoid anything resembling a real charter/business
name; screen the generated list against obvious collisions.

### 5.2 Geography (must be real water, plausible spots)
- Region bounds: lat **33.70–39.00**, lon **-78.89 to -72.21**.
- Pins must be **offshore ocean** only — never on land, in sounds, or in bays. Reuse the
  existing **`openocean_mask.json`** (already used for altimetry clipping) to validate
  every generated coordinate; reject any point the mask marks as non-open-water.
- Cluster around known structure for realism (shelf break, canyons): Norfolk, Washington,
  Poor Man's, Baltimore, Wilmington, and the Hatteras/area canyons, plus shelf lumps
  (e.g. the 100-fathom line). Add small jitter so pins don't stack.
- Bias toward the **20–100 fathom** band and canyon edges where pelagics are realistically
  reported.

### 5.3 Pin content
- **`type`**: ~70% `report`, ~30% `live` (live is rarer and time-sensitive).
- **`species`**: from the current Hot-Spots set — **Yellowfin, Mahi, Wahoo, Marlin** (use
  the same keys the app uses: `yellowfin, mahi, wahoo, blue_marlin`). 1–2 species per pin.
- **`quantity`**: small realistic counts per species (0–6; allow 0 occasionally now that
  the form supports it).
- **`water_temp`**: sample the **actual SST** at the pin's lat/lon from the current
  VIIRS/MUR data (so temps match the map). Fallback to a seasonal range (72–82°F summer)
  if no data.
- **`notes`**: short, varied, fisherman-voice, from templated pools, e.g.
  *"Weed line at the 30 fathom, marks stacked"*, *"Pulled 3 gaffers off a temp break"*,
  *"Slow pick, water was green inshore of the edge"*. ~50% of pins have notes.
- **`points_awarded`**: match the app's economy — **5000 for live, 1000 for report**.
- **`expires_at`**: `created_at + 24h` (live) / `+7d` (report).
- **`is_flagged`**: always `false`.
- **`created_at`**: spread across realistic hours (dawn/dusk weighting), not all at once.

---

## 6. Activity Simulation / Cadence (D2)

Target: **5–10 new pins per day community-wide**, authors drawn from **any of the 100
users** (deliberately light — this should read like an early, real beta, not a firehose).
With 100 eligible users and only ~7 pins/day, each user surfaces every couple of weeks on
average, which reads as a broad, lightly-active community.

- A **daily scheduled run** picks a random **5–10** pins for that day:
  - random users from the full 100 (light weighting so a few "regulars" recur more),
  - random spot + species + notes + SST temp,
  - timestamps jittered through the day (not all at run time).
- Because the run is once/day but pins should *appear* throughout the day, either:
  - **(a)** run the job a few times/day and post a couple each time, or
  - **(b)** insert with back-dated/forward `created_at` spread across the day.
  Recommended: **option (a)** — run 3×/day, 2–3 pins each, to keep "live" pins genuinely
  fresh and the leaderboard rolling.
- **Backfill on day one:** seed the prior ~5 days of `report` pins (still within their 7-day
  window) so the map/leaderboard aren't empty at launch of the program.
- **Expiry awareness:** no cleanup needed for expired pins (the app filters them and they
  age out naturally); the registry + cascade handle final teardown.

### Seeded volume sanity
- ~7 pins/day × 7-day report window ≈ **~40–50 visible report pins** at steady state,
  plus a handful of live pins at any moment. Light but clearly active.

---

## 7. Tips Simulation (D3)

Goal: leaderboard "tips received" and per-pin tip counts look real.

- After pins exist, the job inserts **`community_tips`** rows **from seed users to seed
  users**:
  - pick a recent seed pin, a *different* seed user as `tipper_user_id`, the pin owner as
    `recipient_user_id`,
  - `amount_cents` from a realistic small distribution (e.g. $1–$10, mode ~$3),
  - `platform` ∈ {venmo, cashapp},
  - increment the pin's `tip_count` / `tip_total_cents` (mirror the app's update),
  - increment recipient `user_points.tips_received_cents`.
- Volume: **light** — e.g. ~20–30% of report pins get 1 tip; a few get 2–3.
- **Leaderboard caveat (existing RLS):** `community_tips` `ct_read` only lets a viewer read
  tips where they are tipper or recipient. So a *real* beta user's leaderboard will show
  seed users' **points** (visible) but **not** seed-to-seed tip totals (filtered out by
  RLS). If we want tip totals visible on everyone's leaderboard, that requires a product
  change (e.g. a public aggregate). **Flagged as an open product question, not a seeding
  bug.** Seeding still makes per-pin tip badges and points populate.

---

## 8. Money Safety & the Graceful Tip-Error State (D5)

Inserting a `community_tips` row moves **no money** — it is only a record. Real money can
only move when a **real user taps "Tip"** and the app opens a `venmo://` / `cashapp` deep
link built from the **pin owner's handle**.

**Safeguard (universal — replaces any seed-specific hiding):** the tip button stays
**visible on every pin**, including seed pins (we *want* users to see the affordance). The
tip action first checks whether the pin owner has a handle for the chosen platform:

- **Has handle** → proceed exactly as today (record tip, open deep link).
- **No handle** (seed pins always have null handles; also real users who never set one)
  → **do not open any payment link and do not record a tip.** Show a graceful error modal:

  > "Sorry — there's an error preventing this tip from processing right now. We've
  > notified the admin and are working to resolve it."

**Why this is the right design**
- Seed pins (null handles) can **never** route a real user to a real payment account →
  **no real-money path, by construction** — without hiding anything.
- It simultaneously **fixes a real bug** for genuine users who haven't set a handle (today
  the deep link is malformed/`recipients=null`).
- The tip button stays visible everywhere, preserving the social-proof value.

**Implementation (frontend — `src/components/SSTHeatmapLeaflet.jsx` tip handler)**
- Gate before the deep link: `if (!pin[`${platform}_handle`]) { showTipErrorModal(); return; }`
  — *before* inserting the `community_tips` row or building the URL.
- Apply to **both** platforms (venmo + cashapp) and **all** tip entry points (desktop +
  mobile).
- **"Notify the admin":** seed pins would trigger this constantly, so the notification
  must be **lightweight and deduped** (e.g. a single log row / counter), **not** an email
  or alert per tap. Recommended: show the user message; log quietly. (Open item §11.)

This is a small, self-contained frontend change and is a **prerequisite** for shipping
seed pins with the tip button visible.

---

## 9. Execution Architecture

### 9.1 Components
- **`seed_create.(ts|py)`** — one-time: create 100 auth users + profiles + registry rows
  + (optional) day-one backfill of report pins.
- **`seed_tick.(ts|py)`** — recurring: post the day's 2–3 pins + a few tips. Idempotent,
  safe to re-run.
- **`seed_teardown.(ts|py)`** — delete all seed auth users (cascade) + drop registry rows.

### 9.2 Where it runs
- A **GitHub Action in `jlintvet/SSTv2`** (matches the existing data-job pattern), e.g.
  `.github/workflows/community-seed.yml`, on `schedule` (3×/day) **+** `workflow_dispatch`.
- Uses the **Supabase `service_role` key** stored as a **GitHub Actions secret**
  (`SUPABASE_SERVICE_ROLE_KEY`) + `SUPABASE_URL`. The key is **never** committed, never in
  the app bundle, never pasted in chat — Jon adds it to repo secrets.
- **Kill switch:** the workflow checks a flag before doing anything — either a repo
  variable `SEED_ENABLED=true/false`, or a `seed_config` row in the DB
  (`enabled bool, end_date date`). When disabled or past `end_date`, `seed_tick` exits
  immediately (no posts). This lets Jon stop seeding instantly without deleting data.

### 9.3 Config (single source)
```
SEED_ENABLED          = true
SEED_END_DATE         = 2026-09-01     # auto-stops posting after this
ACTIVE_USERS          = 40
PINS_PER_DAY_MIN/MAX  = 5 / 10
LIVE_FRACTION         = 0.30
TIP_FRACTION          = 0.25
```

---

## 10. Teardown / Removal

**One command** (run `seed_teardown`):
1. `select user_id from seed_users;`
2. `auth.admin.deleteUser(user_id)` for each → **cascades** away all pins, tips, points,
   flags, profiles.
3. `drop table seed_users;` (or keep it empty for audit).
4. Set `SEED_ENABLED=false` and disable/delete the workflow.

**Verification after teardown:**
- `select count(*) from community_locations where user_id in (<seed ids>)` → 0.
- `select count(*) from auth.users where email like '%@seed.riploc.invalid'` → 0.
- Leaderboard + map show only real users.

Because identification is triply-redundant (§4.3), teardown is verifiable and complete.

---

## 11. Risks, Ethics & Open Items

### Safeguards built in
- **Reversible & isolated:** every artifact is FK-cascaded to a tagged auth user and
  listed in a registry; nothing is entangled with real-user rows.
- **No real money path** once the §8 graceful tip-error state is in place (seed pins have
  null handles → tip always resolves to the error modal, never a payment link).
- **No real PII / no impersonation:** fully synthetic identities; screen handles for
  accidental real-name/business collisions.
- **No emails sent:** `@seed.riploc.invalid` is non-deliverable; no signup/notification
  emails fire.

### Honest-use notes (recommended guardrails)
- Treat seeded numbers as **non-metrics**: exclude seed users from any analytics, growth,
  or investor reporting (filter on the registry). Presenting seeded activity as real
  traction would be misleading.
- **Remove before public/GA launch** (the `end_date` + teardown enforce this).
- Keep the program internally documented so anyone on the team knows the community is
  partially seeded during beta.

### Open items (need a decision / verification before build)
1. **Schema check:** confirm `community_locations` has `venmo_handle` / `cashapp_handle`
   columns (app writes them; `community-schema.sql` doesn't declare them). Add if missing.
2. **§8 graceful tip-error (build):** implement the universal handle check + error modal
   in the tip handler (visible button, no payment link / no tip record when the owner has
   no handle). Prerequisite for seeding.
3. **Admin-notify mechanism:** decide what "we've notified the admin" does behind the
   scenes — recommended: quiet deduped log/counter, **not** a per-tap email/alert (seed
   pins will trigger it often).
4. **§7 leaderboard tips visibility:** decide whether seed-to-seed tip totals should be
   visible to all users (needs a product/RLS change) or whether populating points +
   per-pin tip badges is enough.
5. **Service-role access:** Jon provisions `SUPABASE_SERVICE_ROLE_KEY` as a GitHub secret.

---

## 12. Phased Plan

- **Phase 0 — Prereqs:** confirm open items §11 (schema, §8 guard, service-role secret).
- **Phase 1 — Identity:** `seed_create` → 100 users + profiles + `seed_users` registry +
  day-one report backfill. Verify they appear nowhere unexpected.
- **Phase 2 — Activity:** `seed_tick` workflow (3×/day) posting 5–10 pins/day + light tips,
  behind the kill switch.
- **Phase 3 — Monitor:** spot-check map density, leaderboard, and that no real-money path
  exists; tune `PINS_PER_DAY` / `TIP_FRACTION`.
- **Phase 4 — Teardown:** before GA, `seed_teardown` + verification queries.

## 13. Acceptance Criteria
- 100 seed users exist, all in `seed_users`, all tagged `is_seed`, all
  `@seed.riploc.invalid`; **all 100 are eligible authors**, but only **5–10 pins/day**
  are created community-wide.
- Map shows a light, believable spread of offshore pins (correct species, real water,
  matching SST temps); live pins pulse and expire in 24h.
- Leaderboard shows seed users ranked by points; per-pin tip badges populate.
- **Tip button is visible on seed pins**; tapping it shows the graceful error modal and
  opens **no** payment link and records **no** tip (seed pins have null handles). The same
  graceful state applies to any real user without a handle.
- A single teardown run removes 100% of seed artifacts, verified by the §10 queries.
