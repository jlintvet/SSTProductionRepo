# Community Admin — Specification

**File:** `admin/community_admin.html`
**Pattern:** Single self-contained HTML file, same dark theme as `bottom_features_admin.html`
**Auth:** On load, sign in with a Supabase email/password session and check `user.email` against a hardcoded `ADMIN_EMAILS` list (`jlintvet@gmail.com`, `jlintvet@butterpayments.com`). Not authorized → signed out immediately with an error. No further auth logic.
**Refresh:** Pins, Leaderboard and Tips tabs auto-refresh every 60s (single interval, gated on `activeTab`).

---

## Layout

Six tabs across the top: **Pins · Leaderboard · Tips · Zones · Seed · Prizes**

Stats bar always visible above tabs (global totals, not region-filtered):
- Total pins | Live (active) | Flagged | Tips today ($) | Tips all-time ($)

Topbar also has, left to right: a **Bathy on/off** toggle and an **SST on/off** toggle (both affect the Pins tab's map only), and a **Mid-Atl / GA/SC region toggle** — see below.

---

## Region Toggle (Mid-Atlantic / GA/SC)

Two buttons in the topbar (`regionBtnMA` / `regionBtnGS`) switch the whole tool between the two live regions. Selection persists in `localStorage` (`admin_region`) across reloads. Switching region:

- Re-centers the **Pins** map and **Zones** map to that region's bounds (`REGIONS[region].center/zoom` — Mid-Atlantic `[35.5,-75.5]` zoom 7, GA/SC `[32.4,-78.6]` zoom 7).
- Reloads the **bathy contour** overlay from the region's file (`bathymetry_contours.json` vs `bathymetry_contours_ga_sc.json`) and the **SST** overlay from the region's VIIRS composite (`DailySSTData/VIIRS/Bundled/viirs_composite.json` vs `.../ga_sc/viirs_composite.json`).
- **Filters the Pins tab** (both the list and the map markers) to only pins whose `lat/lon` fall inside the selected region's bounding box (`REGIONS[region].bounds`). Pins are stored in one shared `community_locations` table with no region column — this filter is purely a lat/lon bounds check done client-side in the admin tool, not a DB-level distinction.
- **Filters the Zones tab** (list + drawn circles) to zones tagged with the selected region (`seed_zones.region`), and any zone saved while a region is selected is stamped with that region.
- Any active overlay toggles (Bathy/SST on either map) are turned off and must be re-enabled after switching, so stale cached data for the old region is never shown silently.

This is an **admin-UI-only distinction** — `community_seed.py` still picks a zone to post to from all active `seed_zones` regardless of region, weighted by `weight`. Drawing zones in GA/SC waters is what actually causes seed pins to start appearing there; the region toggle just makes it possible to see/draw in the right water and to review each region's pins/zones without them mixing together in the same view.

---

## Tab 1 — Pins

### List (left panel, scrollable)
Each row shows: color dot (lime=live, blue=report), display name, species summary, time since posted, expiry countdown, flag badge if `is_flagged`.

Filters: type (all / live / report), status (all / flagged / expired), search by name.

### Map (center)
All pins plotted. Clicking a map marker selects it in the list and opens the edit panel.

### Edit panel (right)
Opens when a pin is selected. Fields:

| Field | Control |
|---|---|
| Display name | Text input |
| Type | Toggle — Live / Report |
| Species | Checkbox list + quantity inputs |
| Notes | Textarea |
| Created at | Datetime input |
| Expires at | Datetime input |
| Quick extend | Buttons: +24h / +7d / +30d |
| Photo | Upload / replace / remove (stored in the `share-images` bucket, `community/` path) |
| Flag | Toggle — Flagged / Clear |
| Tips | Inline per-tip list — edit amount or delete; re-syncs `tip_count`/`tip_total_cents` on the pin and `tips_received_cents` on the recipient |

Actions at bottom:
- **Save changes** — writes to `community_locations` via Supabase
- **Delete** — confirms, then verifies the row is actually gone (RLS can silently no-op); if blocked, logs the admin DELETE/UPDATE policy SQL to the console
- **Flag / Unflag** — toggles `is_flagged` immediately (separate from Save)

Switching type (live ↔ report) does not auto-adjust expiry — admin sets it manually.

---

## Tab 2 — Leaderboard

Single table, sortable columns:

| Rank | Display Name | Total Points | Reports | Live Pins | Tips Earned | Tip Count |
|---|---|---|---|---|---|---|

Data sources:
- Points + counts from `user_points`
- Tips earned: `SUM(amount_cents)` from `community_tips` grouped by `recipient_user_id`

Refresh button + auto-refresh indicator.

---

## Tab 3 — Tips

Three stacked sections, each collapsible:

### Per-pin totals
Table: pin display name, type, posted date, tip count, total tips ($). Sorted by total tips descending.

### Top-tipped anglers
Table: rank, display name, total received ($), tip count. Derived from `community_tips` joined to `user_profiles`.

### Recent tip feed (last 50)
Chronological list: tipper name → recipient name, amount, platform (Venmo/CashApp), timestamp.

---

## Tab 4 — Zones

Admin-drawn areas that control **where** seed pins are placed and **which species** appear there. See `community-seed-content-spec.md` and `community-seed-zones.sql` for the underlying design.

### Map (right)
Click anywhere on the map to set a draft zone's center; a circle preview (radius in nm) follows the `Radius` input live. Bathy overlay on by default; SST overlay optional (shared cache/toggle logic with the Pins tab's map).

### Form (left)
| Field | Control |
|---|---|
| Zone name | Text input (e.g. "Norfolk Canyon") |
| Radius (nm) | Number, 1-60 |
| Weight | Number, 1-20 — relative likelihood this zone is picked for a pin, not a hard cap |
| Species | Checkbox grid — species allowed to appear in this zone; falls back to all species if none checked |
| Center | Set by clicking the map — shown as lat/lon under the form |

**Save zone** inserts or updates a `seed_zones` row (stamped with the currently selected region, see Region Toggle above). **Clear** resets the draft without saving.

### List (below the form)
Every zone (filtered to the current region), showing name, active/off state, weight, species, radius, with **Edit** (loads it into the form and pans the map to it), **Enable/Disable** (toggles `active` without deleting), and **Del** (hard delete, confirms first).

### How zones feed the seeder
`community_seed.py`'s `load_zones()` fetches all **active** zones (regardless of region) and picks one per pin, weighted by `weight`, then places the pin at a random point inside that zone's circle using only the species allowed for that zone. If no active zones exist, the script falls back to a small built-in list of Mid-Atlantic canyon names/coordinates (`SPOTS`) — so GA/SC will get zero seed pins until at least one active zone is drawn there.

---

## Tab 5 — Seed

Reads and writes the single `seed_config` row directly — the kill switch and the pin volume/frequency knobs that used to be hardcoded workflow env vars / script defaults, editable here instead. See `community-seed-region-and-volume.sql` for the migration that added these columns and the RLS policy that makes this tab possible (`seed_config` previously had **no** policies at all — service-role only).

| Field | Column | Notes |
|---|---|---|
| Seeding enabled | `enabled` | Kill switch. `tick` exits immediately (no posts) when off. |
| End date | `end_date` | Required (NOT NULL). Posting auto-stops after this date regardless of `enabled`. |
| Pins per run — min/max | `pins_per_run_min` / `pins_per_run_max` | Per invocation of `tick`, which runs 3x/day (`community-seed.yml` cron) — daily total ≈ 3 × the midpoint of this range. |
| Live fraction | `live_fraction` | 0-1, chance a given pin is `live` instead of `report`. |
| Tip fraction | `tip_fraction` | 0-1, chance a `report` pin also gets a simulated tip. |
| Backfill days | `backfill_days` | Only used by the one-time `create` action, not `tick`. |

**Save** writes all fields in one `UPDATE ... WHERE id = 1` and bumps `updated_at`; the tab re-loads afterward to confirm what's actually stored. `community_seed.py` reads this row fresh on every `status`/`create`/`tick` invocation — changes here take effect on the next scheduled run with no workflow or code edit needed. Falls back to its own env-var defaults if a column somehow comes back null (e.g. migration not yet applied).

This tab is **region-agnostic** — one shared volume budget across both regions; see the Region Toggle note above on how zone weighting (not this tab) is what actually influences the mid_atlantic/ga_sc pin split.

---

## Tab 6 — Prizes

### File
`src/public/prizes.json` in `SSTProductionRepo` — served at `/prizes.json` via Vite's `publicDir`.

### JSON schema
```json
[
  {
    "month": "June 2026",
    "sponsor_name": "Nomad DTX 200",
    "sponsor_logo_url": "https://...",
    "prize_description": "$200 Tackle Gift Card",
    "prize_text": "Top angler for June earns bragging rights and gear.",
    "winner_name": "Jon L.",
    "winner_photo_url": "https://...",
    "awarded_at": "2026-06-30"
  }
]
```

Array ordered newest-first. Only the first entry is the "current" prize displayed in the app.

### Admin UI
**Current prize** — edit form at the top with all fields. "New month" button clears the form and prepends a new entry.

**Prize history** — list of past entries below with inline edit on click.

**Save / Commit** — same GitHub token + commit flow as `bottom_features_admin.html`. Reads current `prizes.json` SHA, puts updated file, commits to `SSTProductionRepo` main.

---

## Supabase Access

Uses the public anon key (same as frontend — already in the codebase). Reads and writes directly from the browser. All operations gated behind the auth guard.

Tables touched:
- `community_locations` — read, update, delete
- `community_tips` — read, update, delete (per-pin tips editor)
- `user_points` — read, update (re-synced when tips are edited/deleted)
- `user_profiles` — read only (display names)
- `seed_zones` — read, insert, update, delete (Zones tab) — RLS policy `admin_zones_all`
- `seed_config` — read, update (Seed tab) — RLS policy `admin_seed_config_all` (added by `community-seed-region-and-volume.sql`; previously this table had no policies at all and was service-role only)

---

## GitHub Commit (Prizes tab only)

```
GET  https://api.github.com/repos/jlintvet/SSTProductionRepo/contents/src/public/prizes.json
  → extract sha + decode current content
PUT  https://api.github.com/repos/jlintvet/SSTProductionRepo/contents/src/public/prizes.json
  → message: "admin: update prizes.json", content: btoa(JSON.stringify(...)), sha
```

Token entered in the header bar, same as existing admin tools.

---

## What the Frontend Needs (future work)

The prizes.json is ready to be consumed but the frontend currently does not display it. When ready to surface prizes in the app:
- Fetch `/prizes.json` on load
- Display current entry (index 0) in the Leaderboard modal or a dedicated "Monthly Prize" section
- Fields to show: sponsor name + logo, prize description, prize text, current winner if awarded
