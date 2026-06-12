# Community Feature Reference

This document covers the full community reports and tipping system — architecture, data model, UX flows, and known implementation decisions.

---

## 1. Overview

The community feature lets anglers share fishing reports and live locations directly on the SST map. Other users can see pins, read reports, and tip the poster via Venmo or Cash App.

**Access rule:** A user can view community pins if they posted within the last 30 days **or** they are on a Pro/Trial subscription (`tier === "pro" || tier === "trial"`).

---

## 2. Database Tables

### `community_locations`

The primary table. One row per posted pin.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK → auth.users |
| `display_name` | text | Poster's display name at post time |
| `type` | text | `"live"` or `"report"` |
| `lat` | float | |
| `lon` | float | |
| `species` | text[] | Array of species keys (e.g. `["yellowfin", "mahi"]`) |
| `quantity` | jsonb | `{ "yellowfin": 3, "mahi": 1 }` |
| `water_temp` | float | SST at pin location at post time (°F) |
| `notes` | text | Optional free-text |
| `venmo_handle` | text | Copied from user_profiles at post time |
| `cashapp_handle` | text | Copied from user_profiles at post time |
| `points_awarded` | int | 5000 for live, 1000 for report |
| `expires_at` | timestamptz | 24h for live, 7d for report |
| `is_flagged` | boolean | Moderation flag (column name is `is_flagged`, not `flagged`) |
| `tip_count` | int | Running count of tips received |
| `tip_total_cents` | int | Running total of tips in cents |
| `created_at` | timestamptz | |

### `community_tips`

One row per tip transaction attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `location_id` | uuid | FK → community_locations |
| `tipper_user_id` | uuid | Who sent |
| `recipient_user_id` | uuid | Who received |
| `amount_cents` | int | |
| `platform` | text | `"venmo"` or `"cashapp"` |
| `created_at` | timestamptz | |

### `user_profiles`

Stores subscription info and community payment handles.

Relevant columns: `id`, `email` (NOT NULL), `region` (NOT NULL), `tier`, `display_name`, `venmo_handle`, `cashapp_handle`.

**Important:** `email` and `region` are NOT NULL. Always use `.update()` (not `.upsert()`) when writing handles from the Settings modal — the row already exists for every signed-in user.

### `user_points`

Lifetime point totals per user.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | |
| `total_points` | int | |
| `report_count` | int | |
| `live_count` | int | |

---

## 3. Pin Types

| | Live Pin | Report Pin |
|---|---|---|
| **Color** | Lime green `#84cc16` | Neon blue `#00d4ff` |
| **Dot size** | 12px with 24px pulsing ring | 12px |
| **Pulse** | White/light grey expanding ring | None |
| **Points** | 5,000 | 1,000 |
| **Expiry** | 24 hours | 7 days |
| **Intent** | Active on-water location | Post-trip catch report |

---

## 4. Posting a Pin

**Component:** `src/components/CommunityReportForm.jsx`

### From the control panel (no coordinates yet)
When `onPostCommunityReport` is called without lat/lon, the map enters `communityPinDrop` mode:
- Crosshair cursor appears on map
- Banner: "Click the map to place your pin"
- Next map click captures lat/lon and opens `CommunityReportForm`

### From a map click with coordinates
`CommunityReportForm` opens directly with the clicked lat/lon pre-filled.

### Form flow
1. User selects pin type (Post-Trip Report or Live Location)
2. Selects one or more species and quantities
3. Optionally adds notes
4. On submit:
   - Reads `venmo_handle` and `cashapp_handle` from `user_profiles` and embeds them in the `community_locations` row
   - Resolves `display_name` from `user_profiles`, falls back to email prefix
   - Inserts into `community_locations`
   - Upserts into `user_points` (read-then-update, no RPC)
   - Calls `onPosted(newLocation)` to add the pin to the map immediately without reload

---

## 5. Viewing Pins on the Map

**Component:** `src/components/SSTHeatmapLeaflet.jsx`

Community pins are rendered as Leaflet `L.divIcon` markers. The layer is controlled by `showCommunityLayer` state (default `true`).

### COM toggle button
Available in two places, both lime-green when active:
- **Desktop collapsed column** — after the Saved (bookmark) button
- **Mobile right rail** — between Bookmark and Plan Trip

Clicking toggles all community pins on/off without affecting any other map layers.

### Pin card popup
Clicking a pin opens a card showing:
- Poster name, time posted, water temp
- Species list with quantities
- Notes (if any)
- "Thanks / Tip" button

The card renders at `zIndex: 9500` to float above the SST temperature legend and other overlays.

---

## 6. Tipping

**Component:** `TipFlow` (inline function component in `SSTHeatmapLeaflet.jsx`, ~line 240)

### Flow
1. User clicks "Thanks / Tip" on a pin card
2. `communityTipModal` state is set to `{ pin }`
3. `TipFlow` renders as a `createPortal` fixed modal on `document.body` at `z-[9600]` — above all map layers
4. User picks amount ($20 / $50 / $100 / Other) and chooses Venmo or Cash App
5. On confirm:
   - Inserts a row in `community_tips`
   - Increments `tip_count` and `tip_total_cents` on `community_locations`
   - Opens the payment app

### Payment deep links

Both platforms use a two-step approach to avoid popup blockers and handle desktop fallback:

```js
window.open(webLink, "_blank");   // opens web fallback synchronously (not blocked)
window.location.href = deepLink;  // attempts to launch app
```

If the app is installed (mobile), it launches and the web tab sits in the background. If the app is not installed (desktop), the deep link fails silently and the web tab is already open.

**Venmo:**
- App: `venmo://paycharge?txn=pay&recipients=@handle&amount=20&note=riploc%20report%20tip`
- Web: `https://venmo.com/u/{handle}` (leading `@` is stripped for the URL)

**Cash App:**
- App: `cashapp://cash.app/$handle`
- Web: `https://cash.app/$handle`
- Handle is normalized to always include the `$` prefix

### If no handles are set
TipFlow shows: "This angler hasn't set up a payment handle yet."

---

## 7. User Profile / Payment Handle Setup

**Component:** `src/components/auth/UserSettingsModal.jsx`

A "Community Profile" section in the Settings modal exposes three fields:
- Display name (shown on pins)
- Venmo handle (e.g. `@jon-lintvet`)
- Cash App handle (e.g. `$jonlintvet`)

On save, these are written with `.update().eq("id", userId)` — NOT upsert — because `user_profiles` has NOT NULL constraints on `email` and `region` that would cause an insert to fail.

Handles are **embedded into `community_locations` at post time** (not looked up dynamically). This means:
- If a user updates their handle, old pins still show the old handle
- To receive tips on old pins, the user must re-post

---

## 8. Leaderboard

**Component:** `src/components/LeaderboardModal.jsx`

Ranks users by `total_points` from `user_points`. Points are:
- 5,000 per live pin posted
- 1,000 per report pin posted

Top 3 shown with colored rank numbers (gold/silver/bronze). No emoji or trophy icons per design rules.

---

## 9. Design Rules

- No emojis or decorative icons in UI code (per CLAUDE.md §5)
- Functional icons (X close, chevrons) are acceptable
- Use clean text, numbers, and color to convey meaning

---

## 10. Known Limitations

- **Handle updates don't backfill old pins.** Handles are stamped at post time.
- **Tip recording is best-effort.** The DB insert runs before launching the payment app. If the insert fails, the app still opens. Tips in the payment app are not verified — `community_tips` tracks intent, not confirmed payments.
- **Expiry is not enforced by the frontend.** Expired pins remain visible until removed server-side. The `expires_at` column is set but not filtered client-side.
- **`default_departure` column** does not exist in `user_profiles`. The query for it was removed from `AppContext.jsx` (June 2026).
