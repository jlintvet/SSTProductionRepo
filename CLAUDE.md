# CLAUDE.md — SST Fishing Map Project Rules

Read this file at the start of every session and before any multi-step task.

---

## 1. Architecture Rule — No Frontend Hacks for Backend Problems

**Never fix a backend data quality issue with a frontend workaround.** If data is wrong, corrupt, or missing, fix it at the source (Python backend, GitHub Actions workflow, data generation script). Do not add filters, transforms, or compensating logic in JSX/JS to paper over bad data.

Examples of what NOT to do:
- Filtering bad contour segments in the Leaflet renderer instead of fixing the contour generator
- Clamping or transforming data values in the frontend instead of fixing the pipeline that produces them
- Hardcoding fallback values in UI components to hide missing or incorrect backend output

If a backend fix is correct but a CDN or cache delay is preventing it from being visible, **wait** — do not add frontend workarounds as a stopgap.

---

## 2. Dropbox Truncation — CRITICAL

**The core problem:** The Dropbox mount (`/sessions/.../mnt/SST Development/`) is a cloud-synced folder. When Claude writes or copies a large file to it, Dropbox may not have fully synced before the next operation reads it back — resulting in silently truncated files. This has caused repeated Vercel build failures.

### Rules

**Never** use the `Write` tool or `cp` to push a modified file directly from the sandbox into the Dropbox mount as a way to create a final deliverable for git. The Dropbox copy is unreliable for large files.

**Always** follow this workflow for any source file change:

1. **Get a clean base from git** — never edit the Dropbox copy:
   ```bash
   git show <last-good-commit>:path/to/file.jsx > /tmp/file_base.jsx
   ```

2. **Apply changes via Python patch script** — write the script to `/sessions/.../mnt/outputs/`, run it there, write output to `/sessions/.../mnt/outputs/file_patched.jsx`. Always `assert` every substitution succeeds and verify line count + last 5 lines at the end.

3. **Copy patched file into the fresh git clone** — the clone lives at `/tmp/sst_fresh/` and is NOT in Dropbox:
   ```bash
   cp /sessions/.../mnt/outputs/file_patched.jsx /tmp/sst_fresh/src/...
   ```

4. **Commit and push from the clone:**
   ```bash
   cd /tmp/sst_fresh
   git add <files>
   git commit -m "..."
   git push origin main
   ```

5. **Copy back to Dropbox** after the commit is in git — this is **required**, not optional. The workspace must stay in sync with git so Jon can see and publish changes.
   ```bash
   cp /tmp/sst_fresh/src/path/to/file.jsx "/sessions/.../mnt/SST Development/src/path/to/file.jsx"
   ```
   Do this for every file changed in the commit. For SSTv2 files (e.g. `VIIRSHourlyBundler.py`), copy to the workspace root.

### Additional rules
- Always verify the patched file ends with `}` (or the correct closing token) before committing.
- When multiple files need changes in one commit, patch all of them first, then `git add` all at once.
- Use `assert OLD in text, "FAIL: <description>"` in every patch script. If an assertion fails, stop and investigate before writing any output.
- After every push, check the Vercel build result using `list_deployments` + `get_deployment_build_logs`. If the deployment is ERROR, fix the build failure and redeploy before doing any other work. Never leave a broken build unresolved.

---

## 2. Editing Existing Files

- **Read the file from Dropbox first** using the `Read` tool before any `Edit` call — the Read tool downloads the current cloud version. Never assume the in-context version is current.
- For small targeted changes (< 5 lines), use the `Edit` tool directly on the Dropbox path after reading.
- For large or structural changes (whole sections, multiple insertions), use the Python patch script workflow above.

---

## 3. Git Workflow

- The production repo is `jlintvet/SSTProductionRepo` (main branch). Vercel auto-deploys on push.
- The fresh clone at `/tmp/sst_fresh/` contains the GitHub token in the remote URL. Reuse it across shell calls rather than re-cloning.
- If `/tmp/sst_fresh/` is missing or stale, re-clone:
  ```bash
  TOKEN=<from existing remote or user>
  git clone https://$TOKEN@github.com/jlintvet/SSTProductionRepo.git /tmp/sst_fresh
  ```
- Always `git fetch origin main && git reset --hard origin/main` at the start of a session before making changes.
- Stale `.git/index.lock` in the Dropbox `.git/` folder cannot be removed — never run git commands against the Dropbox path. Always use `/tmp/sst_fresh/`.
- GitHub API (REST) returns 403 from the sandbox — use git clone/push only.

---

## 4. Deployment Flow + Vercel MCP

### How deployment actually works

**Deployment is fully automatic — Claude does not trigger it.**

```
Claude git push → GitHub (jlintvet/SSTProductionRepo main) → Vercel webhook → auto-deploy
```

As soon as `git push origin main` succeeds, Vercel picks it up via a GitHub webhook and deploys. No manual step needed. The Vercel MCP is **monitoring only** — it lets Claude check whether the build passed or failed. If the MCP is broken, deployment still works fine.

### Vercel MCP — build status check only

Claude uses `list_deployments` + `get_deployment_build_logs` to confirm a build is READY after pushing. If those return `403 Forbidden`, Claude cannot read build status but the deploy still ran.

- `projectId`: `prj_ZgzMKqQ1nFxoKS5nok4RRm2nCmYQ`
- `teamId`: `team_L2pjSs2qq2rZK00eIAypqE9i`

### Fixing a 403 from the Vercel MCP

The Vercel connector uses **OAuth** (not a manually pasted API token). Tokens created in vercel.com → Settings → Tokens are NOT used here.

To re-authenticate:
1. In Claude Cowork, click the **Directory** button in the sidebar (grid/apps icon).
2. Go to **Connectors → Vercel**.
3. Click the **lock/key icon** next to the Disconnect button to re-auth, OR click **Disconnect** then reconnect to trigger a fresh OAuth login.
4. No session restart needed — the connector updates immediately.

### If Vercel MCP is broken mid-session

Check the build directly at **vercel.com → SSTProductionRepo → Deployments**. Paste build log text into chat and Claude can diagnose from it.

---

## 4. Reference Docs — Read Before Related Work

| Topic | File |
|---|---|
| SST/CHL/VIIRS rendering pipeline, Leaflet layer architecture | `SST_RENDERING.md` |
| Viewport fill-zoom, grey-bar bugs, Mercator center math | `docs/map_viewport_nuances.md` |
| Weather forecast display, departure location selection | `docs/weather-and-location-display.md` |
| Community reports feature spec, UX flows, access rules | `community-reports-requirements.md` |
| Control panel sections, props, help system, button rules | `docs/map_control_panel.md` |

**Rule:** Before making changes to any of the following areas, read the corresponding doc:
- Anything touching `SSTHeatmapLeaflet.jsx` viewport, zoom, or overlay rendering → read `SST_RENDERING.md` and `docs/map_viewport_nuances.md`
- Anything touching community pins, access gates, leaderboard, tips → read `community-reports-requirements.md`
- Anything touching weather widget or departure location → read `docs/weather-and-location-display.md`
- Anything touching `MapControlPanel.jsx` → read `docs/map_control_panel.md`

---

## 5. NOAA Marine Forecast Zones

Most locations use **20-60nm offshore** zones only. Five mid_atlantic locations (see "Nearshore/offshore toggle" below) also have a paired **0-20nm nearshore** zone. Zone IDs and URLs are defined in two places:
- `src/hooks/useMarineForecast.js` → `NOAA_SOURCES[location]` (frontend footnote display) — either the legacy flat shape (`{ forecastJsonUrl, noaaZone }`, offshore-only) or the `{ offshore, nearshore? }` shape for locations with both
- `scraper.py` (NOAAPARSE repo) → `scrape_and_save(url, filename)` calls (backend data fetch)

Both must stay in sync. If adding a location or changing a zone, update both files.

**Never pattern-match a nearshore zone ID from its offshore counterpart.** Nearshore (0-20nm) and offshore (20-60nm) zones are not always the same coastline span or even the same WFO — e.g. Ocean City Inlet MD's offshore zone ANZ485 (Cape May NJ to Fenwick Island DE, issued by KPHI) pairs with nearshore ANZ650 (Fenwick Island DE to Chincoteague VA, issued by KAKQ), which starts where ANZ485 ends. Always verify a new nearshore zone against live NWS zone text (`tgftp.nws.noaa.gov/data/forecasts/marine/coastal/{am,an}/{zoneid}.txt`) before using it.

### Zone URL patterns
- **`forecast.weather.gov/MapClick.php?zoneid=XXX`** — used for all MHX (NC), ILM (NC/SC), CHS (SC/GA), and AKQ (VA) zones
- **`marine.weather.gov/MapClick.php?zoneid=XXX`** — used only for JAX (GA/FL) zones (AMZ470/472/474)

### Zone reference table (20-60nm offshore)

| Location(s) | Zone | Description | WFO | URL base |
|---|---|---|---|---|
| Oregon Inlet NC | AMZ180 | Currituck Beach Light to Oregon Inlet NC, 20-60nm | MHX | forecast.weather.gov |
| Hatteras Inlet NC | AMZ184 | Cape Hatteras to Ocracoke Inlet NC, 20-60nm | MHX | forecast.weather.gov |
| Beaufort Inlet NC | AMZ186 | Ocracoke Inlet to Cape Lookout NC, 20-60nm | MHX | forecast.weather.gov |
| Wrightsville Beach NC, Carolina Beach NC, Southport NC | AMZ280 | Surf City NC to Little River Inlet SC, 20-60nm | ILM | forecast.weather.gov |
| Little River Inlet SC, Myrtle Beach SC, Murrells Inlet SC, Georgetown SC | AMZ284 | Little River Inlet to S. Santee River SC, 20-60nm | ILM | forecast.weather.gov |
| Charleston SC | AMZ380 | S. Santee River to Edisto Beach SC, 20-60nm | CHS | forecast.weather.gov |
| Beaufort SC, Hilton Head SC | AMZ382 | Edisto Beach SC to Savannah GA, 20-60nm | CHS | forecast.weather.gov |
| Tybee Island GA, Darien GA | AMZ384 | Savannah GA to Altamaha Sound GA, 20-60nm | CHS | forecast.weather.gov |
| St. Simons Island GA, Jekyll Island GA, Fernandina Beach FL | AMZ470 | Altamaha Sound GA to Fernandina Beach FL, 20-60nm | JAX | marine.weather.gov |
| Mayport FL | AMZ472 | Fernandina Beach to St. Augustine FL, 20-60nm | JAX | marine.weather.gov |
| St. Augustine FL | AMZ474 | St. Augustine to Flagler Beach FL, 20-60nm | JAX | marine.weather.gov |
| Virginia Beach VA | ANZ686 | Cape Charles Light to VA-NC border, 20-60nm | AKQ | forecast.weather.gov |
| Ocean City Inlet MD | ANZ485 | Cape May NJ to Fenwick Island DE, 20-60nm | AKQ | forecast.weather.gov |

### Chesapeake Bay locations (use bay zones — no 20-60nm offshore equivalent)

| Location(s) | Zone | Description |
|---|---|---|
| Poquoson VA | ANZ632 | Chesapeake Bay, New Point Comfort to Little Creek VA |
| Bay Bridge Tunnel VA | ANZ634 | Chesapeake Bay, Little Creek to Cape Henry VA incl. CBBT |
| Horn Harbor VA, Cape Charles VA | ANZ631 | Chesapeake Bay, Windmill Point to New Point Comfort VA |

### Nearshore/offshore toggle (mid_atlantic pilot, shipped 2026-07-18)

Five open-ocean mid_atlantic locations have a paired 0-20nm nearshore zone in addition to their 20-60nm offshore zone above, letting the user switch between them in the weather panel (`NearshoreOffshoreToggle.jsx`, rendered in `ImmediateOutlook`). The user's last-chosen mode persists globally via `localStorage` (`sst_zoneMode`), not reset per location. The 4 Chesapeake Bay locations above have no offshore equivalent, so they're out of scope and show no toggle.

| Location(s) | Offshore (20-60nm) | Nearshore (0-20nm) | WFO (nearshore) |
|---|---|---|---|
| Oregon Inlet NC | AMZ180 | AMZ150 — S of Currituck Beach Light to Oregon Inlet NC, 0-20nm | MHX |
| Hatteras Inlet NC | AMZ184 | AMZ154 — S of Cape Hatteras to Ocracoke Inlet NC, 0-20nm | MHX |
| Beaufort Inlet NC | AMZ186 | AMZ156 — S of Ocracoke Inlet to Cape Lookout NC, 0-20nm | MHX |
| Virginia Beach VA | ANZ686 | ANZ656 — Cape Charles Light to VA-NC border, 0-20nm | AKQ |
| Ocean City Inlet MD | ANZ485 | ANZ650 — Fenwick Island DE to Chincoteague VA, 0-20nm | AKQ |

Not yet extended to ga_sc, ne_fl, or va_ri regions — each region's nearshore zones must be individually researched and verified (same method as above) before adding the toggle there.

### noaaZone footnote
The `noaaZone: { id, description }` field in `NOAA_SOURCES` flows through `useMarineForecast` → `WeatherDrawer`/`WeatherBottomSheet` → `ImmediateOutlook`/`ExtendedOutlook` → `ForecastCard`, where it renders as a small footnote below the NOAA Narrative collapsible. All locations must have this field — `null` suppresses the footnote.

---

## 5. Design Rules

- **No emojis or decorative icons in UI code.** Do not use emoji characters or icon components (e.g. Trophy, medal emojis, decorative symbols) in JSX. Use clean text, numbers, and color to convey meaning. Functional icons (X close button, chevrons) are acceptable.

---

## 6. Architecture Quick Reference

- **Frontend:** React/Vite, Base44 scaffold, Tailwind, Leaflet. Main page: `src/pages/SSTLive.jsx`. Map component: `src/components/SSTHeatmapLeaflet.jsx`.
- **Auth + DB:** Supabase (auth, RLS, realtime). Client at `src/lib/supabase.js`.
- **Data:** Python backend on GitHub Actions writes JSON to `jlintvet/SSTv2` repo. Frontend fetches raw URLs from that repo.
- **Deploy:** Vercel auto-deploys `jlintvet/SSTProductionRepo` main branch.
- **Sole developer:** Jon — no PRs, direct pushes to main only.
- **isPro check:** `tier === "pro" || tier === "trial"` from `useRegionAccess` hook.

---

## 7. Community Feature Rules

- DB column is `is_flagged` (not `flagged`) on `community_locations`.
- Access gate: post within 30 days OR isPro → `hasAccess: true`.
- Pin types: `live` (5000 pts, 24h expiry) and `report` (1000 pts, 7d expiry).
- When `onPostCommunityReport` is called **without** lat/lon (from control panel), enter `communityPinDrop` mode — show banner, crosshair cursor, intercept next map click