# Adding a New Region — Step-by-Step Playbook

This document captures every change made to add a new region, using the **Northeast Florida** (`ne_fl`) rollout as the most recent worked example (added after `mid_atlantic` and `ga_sc`). Follow it in order when adding any new region. Replace `<NEW>` with your new region key (lowercase, underscore — e.g. `gulf_coast_fl`, `outer_banks_sc`) and fill in the bounds/ports accordingly.

**Rewritten in full after the `ne_fl` rollout, which caught this document badly out of date** — file names had changed, whole scripts had been added, and an entire third repo (the NOAA weather scraper) wasn't mentioned anywhere in the old version, resulting in a region that shipped with a silently broken marine forecast widget. If you're an agent reading this doc to implement a new region: verify every specific file/line reference below against the live repos before editing — treat this as a strong prior, not gospel, and update it again if you find it's drifted.

---

## Overview of the Three Repos

| Repo | Purpose |
|---|---|
| `jlintvet/SSTv2` | Python backend — fetches + bakes SST/CHL/altimetry/wind/bathymetry data via GitHub Actions |
| `jlintvet/SSTProductionRepo` | React/Vite frontend — consumes those files, handles auth + UI. Auto-deploys to Vercel on push to `main`. |
| `jlintvet/NOAAPARSE` | Small, separate Python repo — scrapes NOAA marine forecast zone text hourly into per-port JSON files that the frontend fetches directly. **Easy to forget entirely** — nothing in the other two repos points at it except a handful of raw GitHub URLs buried in one frontend hook file. |

All three are cloned with the same GitHub PAT (found in the Dropbox-mounted `SSTProductionRepo`'s git remote — `git remote -v`). Only `SSTProductionRepo` is normally checked out in the Dropbox folder; clone `SSTv2` and `NOAAPARSE` fresh into scratch space (e.g. `/tmp/`) — never edit through the Dropbox git working copy, its `.git` can have stale locks and Dropbox sync can silently truncate large writes.

Work backend first, weather-scraper second, frontend last, so data files and forecast JSON exist by the time the region is selectable in the UI.

---

## Part 1 — Backend (`SSTv2` repo)

### Step 1.1 — Add region to every Python script's `_REGION_CONFIGS`

Each script has its own dict near the top and reads `REGION = os.environ.get("REGION", "mid_atlantic")`. **The key names are not identical across files** — read each file's existing region entries before writing the new one; don't copy the shape from a different file.

**`sst_data_fetcher.py`** (MUR SST + GOES Composite + VIIRS passes)
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"north": 39.00, "south": 33.70, "west": -78.89, "east": -72.21, "subdir": ""},
    "ga_sc":        {"north": 35.20, "south": 29.80, "west": -82.00, "east": -75.20, "subdir": "ga_sc"},
    "<NEW>":        {"north": ...,   "south": ...,   "west": ...,    "east": ...,    "subdir": "<NEW>"},
}
```
Also update the module docstring's usage examples and the `_dpath()` helper's inline comment — cosmetic, but keeps the file's own documentation honest for the next person.

**`VIIRSHourlyBundler.py`**
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"subdir": "",      "bbox": {"lat_min": 33.70, "lat_max": 39.00, "lon_min": -78.89, "lon_max": -72.21}},
    "ga_sc":        {"subdir": "ga_sc", "bbox": {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20}},
    "<NEW>":        {"subdir": "<NEW>", "bbox": {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,    "lon_max": ...}},
}
```
> **Gotcha:** `_fill_col_gaps` has a comment about `ga_sc`'s lon grid starting at an integer origin (`-82.00`) causing vertical-banding artifacts. Check whether your region's `lon_min` lands on a similar boundary; if it carries the same fractional offset as `mid_atlantic` already does, it's unaffected and you only need a documentation comment update, not a logic change. Read the function rather than assuming — the fill pass usually already runs unconditionally for every region.

**`DailyChlorophyllandSeaColorRetrieval.py`** and **`CHLSeaColorBundler.py`** (same shape in both)
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"lat_min": 33.70, "lat_max": 39.00, "lon_min": -78.89, "lon_max": -72.21, "subdir": ""},
    "ga_sc":        {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20, "subdir": "ga_sc"},
    "<NEW>":        {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,   "lon_max": ...,   "subdir": "<NEW>"},
}
```
> **CHL/SeaColor URL path rule:** output lands at `Chlorophyll/<subdir>/Bundled/` — the subdir comes **before** `Bundled/`. This is normally handled generically once the region is in the dict.

**`StaticLayersRetrieval.py`** (bathymetry contours + grid + points)
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"lat_min": 33.70, "lat_max": 39.00, "lon_min": -78.89, "lon_max": -72.21, "suffix": ""},
    "ga_sc":        {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20, "suffix": "_ga_sc"},
    "<NEW>":        {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,   "lon_max": ...,   "suffix": "_<NEW>"},
}
```
Note the key is `suffix` here, not `subdir`, and carries a leading underscore. Writes `bathymetry_contours<suffix>.json`, `bathymetry_grid<suffix>.json`, `bathymetry<suffix>.json`.

**`fetch_ocean_dynamics.py`** (wind/currents/altimetry)
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"bbox": {...}, "subdir": ""},
    "ga_sc":        {"bbox": {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20}, "subdir": "ga_sc"},
    "<NEW>":        {"bbox": {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,    "lon_max": ...},    "subdir": "<NEW>"},
}
```

**`BathyTileGenerator.py`**
```python
REGION_CONFIGS = {
    "mid_atlantic": {"lat_min": ..., "lat_max": ..., "lon_min": ..., "lon_max": ...},
    "ga_sc":        {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20},
    "<NEW>":        {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,   "lon_max": ...},
}
```
Also supports `REGION=all` to run every region — no change needed, it iterates the dict.

**`Getwinddata.py`** — the exception. **No `_REGION_CONFIGS`.** One shared grid (`LAT_MIN, LAT_MAX, LAT_STEP` / `LON_MIN, LON_MAX, LON_STEP`) with margin covers every region at once. Check whether the new region's bounds fall inside the current grid; if not, widen only the edge that's exceeded (don't shrink the others), and update the explanatory comment above the constants to mention the new region. **Widening this grid grows the output payload faster than it grows the grid itself** — `va_ri`'s widening (61x41=2501 points -> 69x59=4071, 1.6x) pushed `WindData/wind_latest.json` past ~40 MB (168 hours x each point stored twice: once compactly in `velocityJSON`, once verbosely as a `{lat,lon,u,v,speed}` object in `hours[].grid`). The script pushes this file to GitHub via the Contents API's single-shot PUT, which rejects files past a practical size ceiling with `422 "file is too large to be processed"` — the whole hourly update then silently produces nothing. Fixed 2026-07-12 by switching the write to the Git Data API (blob/tree/commit/ref, GitHub's own recommended fix for this exact error) rather than trimming the payload, since `SSTHeatmapLeaflet.jsx` reads `hours[].grid` as literal `{lat,lon,speed}` objects (touch/inspect lookups, wind-map raster) and trimming it would need a synchronized frontend change. **If a future region widens this grid further, check the resulting payload size in the run log** — the Git Data API's ceiling is much higher, but not infinite.

### Step 1.2 — Update GitHub Actions workflows (`.github/workflows/`)

These are real `.github/workflows/*.yml` files — ignore any stray duplicate `.yml` files that may exist at a repo root or in a Dropbox mirror, those are not the ones GitHub Actions runs.

| Workflow | Trigger | What to add |
|---|---|---|
| `Daily SST.yml` | `schedule` cron, hourly | New region in `workflow_dispatch.inputs.region.options`, and in the `REGIONS="mid_atlantic ga_sc <NEW>"` string used by the run-step loop |
| `VIIRSHourlyBundler.yml` | `workflow_run` chained off `Daily SST.yml`, + safety-net cron | New `REGION="<NEW>" COMPOSITE_WINDOW_HOURS="72" python VIIRSHourlyBundler.py` line. 72h window suits lower-latitude/sparser-coverage regions; use 36h (matching mid_atlantic) if the new region has dense coverage. |
| `ChlorophyllandSeaColor.yml` | `schedule` cron, hourly | A retrieval + bundler step pair, `env: REGION: <NEW>`, same `CMEMS_USER`/`CMEMS_PASSWORD` secret references as the existing region's steps |
| `Static layers.yml` | `workflow_dispatch` only (manual) | One step: `REGION=<NEW> python StaticLayersRetrieval.py`. Trigger manually from the Actions tab after merging — static data, rarely re-run. |
| `Ocean_Mask.yml` | `workflow_dispatch` + `push` (paths-filtered on `bake_ocean_mask*.py`) | A step to run the new `bake_ocean_mask_<NEW>.py`, and add its output path to the commit step's `git add` list. **The `push` path-filter trigger is not fully reliable when the new script and this workflow file change in the same commit** — after pushing, verify `DailySSTData/<NEW>/ocean_mask.json` actually appears in the repo within a few minutes; if not, trigger the workflow manually. Its commit step already has a fetch+rebase+retry loop for push races. |
| `fetch-ocean-dynamics.yml` | `workflow_run` chained off VIIRS bundler | Regions run as parallel background processes (`&` + `wait $PID`) inside one step — add a fourth parallel invocation, extend the exit-status check, the prune-old-files loop, and the log-copy/commit lines. **Its commit step's push retry must use `git rebase -X ours` (fixed for `va_ri`, 2026-07-12), not a plain rebase** — the output files (currents/altimetry grids + per-region logs) are wholly regenerated every run, so a concurrent run of this same workflow racing on the same date produces a genuine content conflict, not just a stale base; a plain `git pull --rebase && git push` hard-fails in that case (`CONFLICT (content)` on the JSON files, exit code 1, that run's data silently dropped). |
| `Update wind data.yml` | `schedule` cron | Historically **no change needed** — it just runs `Getwinddata.py` once against the shared grid from Step 1.1. Confirm by grepping the file for `REGION`/the previous region's key rather than assuming, but don't add a region loop here if the underlying script doesn't need one. |
| `bathy-tiles.yml` | `workflow_dispatch` **only** — no schedule, no chaining, nothing else triggers it | Add the new region to `workflow_dispatch.inputs.region.options` (a plain dropdown list, easy to forget since `BathyTileGenerator.py`'s own `REGION_CONFIGS` dict — updated in Step 1.1 — can silently support a region the dropdown doesn't offer). **Adding the dropdown option does not generate anything** — someone with Actions dispatch access must then manually run the workflow selecting the new region. This is a completely separate output path from every other layer: raster XYZ tiles uploaded to an S3 bucket behind a CloudFront distribution (`https://d3qy1jhzqojgwx.cloudfront.net/bathy/<region>/{z}/{x}/{y}.png`), not a `raw.githubusercontent.com` JSON file — it's what powers the "Shaded Relief" map toggle, and is unrelated to `Static layers.yml`'s bathymetry contour/grid JSON. Job timeout is 4 hours; the dropdown's default `crm_stride` (`1` = max detail/slowest) is worth checking against whatever stride existing regions were baked at before accepting the default. |

### Step 1.3 — Create the ocean mask script for the new region

Copy the most recently added region's `bake_ocean_mask_<region>.py` verbatim, changing only:
```python
NORTH, SOUTH = <lat_max>, <lat_min>
WEST,  EAST  = <lon_min>, <lon_max>
OUT_PATH = "DailySSTData/<NEW>/ocean_mask.json"
```
This is a self-contained script — downloads Natural Earth 10m land polygons, classifies a grid via point-in-polygon, writes bitpacked JSON. It's a *different, simpler* mask than the frontend's `openocean_mask_<region>.json` (Part 2, Step 2.3) — don't conflate the two, and don't add sophistication (like morphological opening) that the reference script doesn't already have; matching the existing quality bar beats a one-off improvement that makes this region inconsistent.

### Step 1.4 — Check whether the new region reaches into a previously-untouched CRM volume

`StaticLayersRetrieval.py` and `BathyTileGenerator.py` both source raw bathymetry from three fixed NCEI CRM 2023 OPeNDAP volumes:
```
crm_vol1_2023.nc   39.0-46.0N   (NE Atlantic)
crm_vol2_2023.nc   32.0-39.0N   (SE Atlantic)
crm_vol3_2023.nc   24.0-32.0N   (FL / E Gulf)
```
Every region added before `va_ri` (`mid_atlantic`, `ga_sc`, `ne_fl`) happened to sit entirely inside `vol2`/`vol3` — `mid_atlantic`'s own north bound (39.00) lands exactly on the `vol1`/`vol2` seam without crossing it. **If your new region's bounds cross into a volume no prior region has ever fetched, that code path is untested in production**, regardless of how long the surrounding logic has been stable. This is exactly what happened with `va_ri` reaching into `vol1` for the first time: both scripts' per-volume dataset-open call had no retry (unlike the actual chunked z-data fetch, which already retries 3x in `BathyTileGenerator.py`), so a single transient OPeNDAP failure opening `vol1` was silently caught, logged as a warning, and skipped — the job still exited 0 and committed a file, just one missing ~2/3 of the region's data (see Step 1.4's feature-count check, and the Key Gotchas row below). Both scripts now retry the volume open 3x with backoff (fixed 2026-07-12) — if you hit a similar near-empty result for some other reason, check whether the retry logic is still in place before assuming the bounds themselves are the problem.

**A second, distinct bug surfaced once the retry fix above got the volume fetch itself working for `va_ri`: `StaticLayersRetrieval.py`'s contour output still collapsed to ~1 feature even with both volumes' data present.** Root cause: `crm_vol1_2023.nc` and `crm_vol2_2023.nc` are independently-produced OPeNDAP datasets with different native lon grid origins — confirmed via `va_ri`'s log ("Grid: 1021 lats x 3966 lons": 1928 vol1 lon-count + 2038 vol2 lon-count = 3966 exactly, i.e. zero lon-value overlap between the two volumes despite covering almost the same real-world longitude window). `_build_grid()` builds its axis from `sorted(set(...))` of the raw fetched floats, so merging two volumes with different native offsets doubles the effective column density — every row (belonging entirely to one volume, since vol1/vol2 sit in disjoint latitude bands) only has real data in its own volume's ~half of the combined columns, and the other half default to `land=True`, producing a checkerboard pattern. The radius=6 morphological open-ocean erosion (BFS distance-from-land) sees this fake land everywhere and erodes away nearly all real ocean (1,399,104 ocean cells down to 790 survivors, for `va_ri`). **`BathyTileGenerator.py` never had this bug** — it builds one fixed master grid from the region bbox + `res_deg` and places each volume's chunk via `round()`-based snapping (`_place_chunk`), never trusting raw unique values; its own code comments already name "checkerboard artefacts caused by grid misalignment between CRM volumes" as the reason its gap-fill pass exists. Fixed 2026-07-12 by snapping each fetched lat/lon onto the same canonical `res_deg`-multiple grid in `_fetch_bathymetry()` before rows are built, mirroring `BathyTileGenerator.py`'s approach. **Any future region whose bounds span two CRM volumes should specifically re-check the contour feature count and open-ocean cell count in the run log** (not just that the volume open/fetch succeeded) — a healthy run should retain the large majority of ocean cells as open-ocean, not collapse by 3+ orders of magnitude.

### Step 1.5 — Verify data files appear in SSTv2

After pushing (and, for `Static layers.yml` and possibly `Ocean_Mask.yml`, manually triggering), confirm these are committed to the repo:
```
DailySSTData/<NEW>/ocean_mask.json
DailySSTData/MUR/<NEW>/mur_YYYYMMDD.csv
DailySSTData/VIIRS/Passes/<NEW>/
DailySSTData/VIIRS/Bundled/<NEW>/viirs_index.json
Chlorophyll/<NEW>/Bundled/<date>/chl_bundle.json.gz
DailySST/Currents/<NEW>/currents_latest.json
DailySST/Altimetry/<NEW>/altimetry_latest_grid.json
bathymetry_contours_<NEW>.json / bathymetry_grid_<NEW>.json / bathymetry_<NEW>.json
```
SST/VIIRS/CHL/wind/currents/altimetry populate automatically within an hour or two of pushing (all cron- or workflow_run-chained). Bathymetry contours/grid JSON, the ocean mask, **and the Shaded Relief tiles** all need one-time manual triggers noted in the table above — tell the user explicitly which is which, don't assume they'll infer it. Shaded Relief in particular is easy to ship a region without noticing is missing: it fails as blank/transparent map tiles with no console error, not a visible broken layer, and was discovered missing for `ne_fl` well after the region had otherwise shipped and been in use.

**A file existing is not the same as a file having real data — check the size/feature count, not just presence.** `Static layers.yml` ran successfully for `va_ri` (exit 0, commit landed, `bathymetry_contours_va_ri.json` present in the repo) but the file had exactly **1** contour feature, versus 228 for `ne_fl` and 519 for `ga_sc` at the time they shipped — a near-total silent failure that "looked done." Root cause: `va_ri` was the first region whose bounds reach into `crm_vol1_2023.nc` (see the new Step 1.5 below); a transient OPeNDAP failure opening that volume was caught, logged as a warning, and skipped, leaving only a sliver of data from the southern volume. **After running `Static layers.yml` or `bathy-tiles.yml` for a new region, compare the new region's contour feature count (`python3 -c "import json; print(len(json.load(open('bathymetry_contours_<NEW>.json'))['features']))"`) against a neighboring region's — if it's an order of magnitude smaller, something silently failed, even though the workflow reported success.**

---

## Part 2 — Weather forecast (`jlintvet/NOAAPARSE` repo — do not skip)

This is a **separate small repo**, unrelated to SSTv2's data pipeline. It is the single most commonly-missed part of this playbook because nothing in SSTv2 or the frontend's `regionConfig.js` points at it directly — the only trace is a set of raw GitHub URLs inside one frontend hook. A past region shipped without this step and the marine weather widget silently showed "not available" for every port in the new region, with no error visible anywhere in normal testing.

The data flow:
```
NOAAPARSE/scraper.py (hourly cron, own workflow)
  → writes <port>_noaa.json into the NOAAPARSE repo root
  → src/hooks/useMarineForecast.js fetches it by raw URL
  → keyed by NOAA_SOURCES[location.label]  (exact string match against regionConfig.js's port label)
```

### Step 2.1 — Add scrapes to `NOAAPARSE/scraper.py`

Not parameterized by region — a flat list of `scrape_and_save(url, filename)` calls in `main()`. Add one per new port, grouped under a comment banner matching the existing per-region banners. Which base URL works depends on the NWS office, not a fixed rule:
- `forecast.weather.gov/MapClick.php?zoneid=XXX` — most nearshore/inshore zones
- `marine.weather.gov/MapClick.php?zoneid=XXX` — most 20-60nm offshore zones
- Some office-managed zones return 400/404 from either MapClick endpoint and need `scrape_and_save_latlon(lat, lon, filename)` instead — read that function's docstring, it explains when this applies

**Fetch the zone URL yourself and read the page's own "Zone Area Forecast for ..." heading before committing to it** — this confirms the office and coverage area match the port, faster and more reliably than trusting a web search result.

### Step 2.2 — Wire `src/hooks/useMarineForecast.js` (frontend)

Add an entry to the `NOAA_SOURCES` object for each new port, keyed by the **exact** location label used in `regionConfig.js` (punctuation included — this is a plain object-key lookup with no fuzzy matching, a mismatch fails silently):
```js
"Port Canaveral, FL": {
  forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/portcanaveralfl_noaa.json",
  tideStation:     "8721604",
  noaaZone:        { id: "AMZ572", description: "Volusia-Brevard County Line to Sebastian Inlet FL, 20-60nm" },
},
```
`tideStation` is a NOAA CO-OPS station ID fetched live at request time — no pre-scraping needed, just a correct ID. **If the new region reuses an existing port label from another region** (common at region boundaries), it automatically inherits the existing entry — don't duplicate it.

**But check what zone that existing entry actually points to before reusing it.** The same town can legitimately need two different zones depending on which side of it you're fishing — `va_ri`'s southern boundary port, Cape Charles VA, already existed in `mid_atlantic`'s `NOAA_SOURCES` pointing at a **bay-side** zone (`ANZ631`, Chesapeake Bay), because `mid_atlantic` cares about the bay. `va_ri`'s intended use for the same town was the **offshore** zone (`ANZ686`). Reusing the label as-is would have silently served bay-water forecast text to an offshore-fishing UI; giving it a new label would have created two near-identical ports with conflicting NOAA_SOURCES data under what looks like a typo. Resolution used for `va_ri`: drop the duplicate port from the new region entirely (it's covered by the existing region's pin) rather than forcing a label collision either way. Reuse only when the underlying zone is actually the same — Virginia Beach, VA and Ocean City Inlet, MD both reused cleanly because their existing `mid_atlantic` zones already matched what `va_ri` needed.

### Step 2.3 — Keep `regionConfig.js`'s `noaaZone` footnote in sync

`regionConfig.js`'s per-location `noaaZone: "AMZ572"` field is a **separate, independent copy** of the same fact, used only to render a UI footnote — nothing enforces it matches `NOAA_SOURCES`. Use the same zone ID in both when adding a port. This has already drifted apart once in production for an existing region (footnote showed one zone, the actual fetched/displayed forecast was for a different one) — if you're ever touching one of these two fields for an existing port, check the other still matches.

---

## Part 3 — Frontend (`SSTProductionRepo`)

Work on a new branch or directly on `main` per the project's usual flow (sole-developer, direct pushes). Use the CLAUDE.md patch-script workflow for large file changes; never edit through the Dropbox mount directly.

### Step 3.1 — Add region to `src/config/regionConfig.js`

```js
<NEW>: {
  label: "Display Name",
  bounds: { north: <lat_max>, south: <lat_min>, west: <lon_min>, east: <lon_max> },
  minZoom: 6,
  maxZoom: 11,
  defaultCenter: { lat: <center_lat>, lon: <center_lon> },
  defaultZoom: 7,
  defaultLocation: "<Default Port Name>",
  dataPathSuffix: "<NEW>",   // must match SSTv2's subdir/suffix exactly
  sstSeasonalDefaults: { summer: {min,max}, fall: {min,max}, winter: {min,max}, spring: {min,max} },
  locations: [
    { label: "Port Name", lat: ..., lon: ..., wreckRegion: "...", noaaCoverage: true, noaaZone: "..." },
    // ...
  ],
},
```
`dataPathSuffix` drives all SST/CHL/altimetry/wind data URL construction (`""` = mid_atlantic root paths, any non-empty value = subdir). `wreckRegion` is a soft-match filter key for a wrecks overlay — safe to invent a new value per port even before any wreck data is tagged with it; unmatched locations just show zero wreck features, no error. `sstSeasonalDefaults` anchors the SST color ramp; if you don't have real measured seasonal ranges yet, estimate from latitude relative to existing regions and say clearly in a code comment that it's a placeholder pending calibration.

`defaultCenter` should be the geographic midpoint of `bounds`, not an arbitrary port — every existing region follows this (e.g. `ne_fl`'s `{28.25, -79.06}` is exactly `((30.50+26.00)/2, (-81.97+-76.14)/2)`). For `defaultZoom`, existing regions (all roughly square-ish, ~5-7° on a side) use `7-7.5`; if the new region is unusually large or elongated (`va_ri` spans 4.25° of latitude but 8.49° of longitude — nearly 2:1, much wider than any prior region), a fill-zoom computed the same way will leave grey bars on the short axis unless you drop `defaultZoom` further (used `6.5` for `va_ri`) — sanity-check the map actually fills the viewport on load rather than trusting the same zoom value that worked for smaller regions.

### Step 3.2 — Add region everywhere else the region list is duplicated

There is **no single source of truth** beyond `regionConfig.js` — three more places, plus two admin tools, independently list regions:

- `src/pages/SSTLive.jsx` — `REGION_OPTIONS` array (signup dropdown)
- `src/components/auth/UserSettingsModal.jsx` — `REGION_PICKER_DATA` array (own `desc`/`bounds`/`bbox`/`ports` fields; `bbox` is `"west,south,east,north"`, feeds a live Mapbox Static Images URL — no pre-baked image needed)
- `src/pages/LandingPage.jsx` — a similarly-shaped but independently-typed `REGIONS` array inside the signup flow's `regionStep` (uses `mapUrl` instead of `bbox`, same live Mapbox URL approach)
- `admin/community_admin.html` — internal debug tool, plain HTML/JS outside `src/`. Has its own `REGIONS` object (`label`, `center`, `zoom`, `bounds`, `bathyUrl`, `viirsUrl` raw-GitHub URLs — note `viirsUrl`'s subdir goes **after** `Bundled/`, opposite of the CHL/SeaColor convention, because the two bundlers build output paths differently), a toolbar button per region, and `_ovBtn(...)` active-state wiring
- `admin/user_admin.html` — two `<select>` dropdowns (`#fRegion` filter, `#eRegion` edit) each need a new `<option>`

The selected region is stored in `user_metadata.region` at signup and `user_profiles.region` (plain `text` column, no enum/check constraint historically — confirm with a quick `.sql` grep before assuming this is still true) via pre-upsert.

### Step 3.3 — Generate and commit the altimetry open-ocean mask

`SSTHeatmapLeaflet.jsx`'s `openOceanRef` effect tries `/openocean_mask_<suffix>.json` first, falling back to the mid_atlantic default. Without a region-specific mask, altimetry renders using the wrong region's land/water boundary.

If you don't have the original GEBCO/GLOBE-stitching tooling used for some earlier regions, a validated fallback: the `global_land_mask` pip package (`pip install global-land-mask scipy numpy`) plus a 5×5 morphological opening. Output format:
```json
{ "bounds": {"n":..,"s":..,"e":..,"w":..}, "step": 0.02, "rows": N, "cols": M, "packed": "<base64 bitpacked, row-major, MSB-first, 1=open ocean>" }
```
**Known limitation of this fallback method:** it resolves land at roughly 1-2km, so narrow enclosed water bodies running close behind barrier islands (lagoons, sounds under a couple miles wide) often come out misclassified as open ocean — the barrier island separating them from the true ocean doesn't resolve at this grid density. Sanity-check a few known ocean/land/enclosed-water points before committing, and tell the user plainly if the region's geography includes this kind of feature — it's the same category of issue `ga_sc` needed a hand-stitched fix for (Pamlico/Core Sound).

Commit to `SSTProductionRepo/public/openocean_mask_<NEW>.json`.

### Step 3.4 — Verify these behaviors (usually no code changes needed)

Confirmed generalized/parameterized as of the last few region rollouts — check with a quick grep for the previous region's key before assuming, but don't add region-specific branches if the generic code already covers it:

- `src/lib/dataFetchers.js` — every fetch function takes `regionBounds`/`dataPathSuffix` params already
- `SSTHeatmapLeaflet.jsx` / `SSTHeatmapMapbox.jsx` — reads `dataPathSuffix`, tries the region mask then falls back; `setMaxBounds` uses region bounds not data bounds; VIIRS cache key includes region
- `src/hooks/useRegionAccess.js` — reads region from the Supabase profile dynamically

---

## Part 4 — Testing Checklist

Set `VITE_FORCE_REGION=<NEW>` on the branch preview Vercel URL to test without touching production user records.

**Data layers — verify each loads, no console 404s:**
- [ ] VIIRS SST (daily composite + hourly — check for vertical banding)
- [ ] MUR SST
- [ ] Chlorophyll / Sea Color (Kd490)
- [ ] GOES HD Composite
- [ ] Altimetry raster + contours (no data bleeding over land or enclosed water)
- [ ] Bathymetry contours
- [ ] Wind/currents

**Weather widget (the part most likely to be silently skipped):**
- [ ] Every port shows a marine forecast, not "not available"
- [ ] Tide chart renders for every port
- [ ] The zone footnote shown in the UI matches the zone actually being fetched (spot check `regionConfig.js` vs `useMarineForecast.js` for a couple of ports)

**Viewport / auth:** map centers correctly, no grey bars, `setMaxBounds` allows panning to full coast, sign-up stores the new region, login routes correctly.

---

## Part 5 — Updating an Existing Region's Boundaries (No New Region Key)

This is the lighter-weight variant: changing north/south/west/east for a region that already exists, not adding a new one. Worked example: `ne_fl`'s west bound moved from Cedar Hills, FL (`-81.75`) to Baldwin, FL (`-81.97`), and east extended 60nm further out (`-77.27` → `-76.14`, now 120nm total east of Walkers Cay).

### Step 5.1 — Compute the new bound value(s)

- If a bound is tied to a named place (a town, an inlet), look up that place's coordinate directly — that *is* the bound, not an offset from it. (Precedent: `ne_fl`'s north bound is Jacksonville's latitude, south is Ft Lauderdale's latitude, the original west was Cedar Hills' longitude.)
- If a bound is defined as "N miles further [direction]" from a named reference point (like `ne_fl`'s east bound, defined relative to Walkers Cay), convert nautical miles to degrees at that reference point's own latitude: `degrees_per_nm = 1 / (60 * cos(latitude_radians))`. Recompute from the original reference point rather than incrementing the previously-rounded stored value, to avoid compounding rounding drift.
- Only the bound(s) actually being moved change — leave the others untouched.

### Step 5.2 — Update every SSTv2 `_REGION_CONFIGS` dict (same 8 files as Part 1 Step 1.1)

Same files, same per-file key names (`sst_data_fetcher.py`, `VIIRSHourlyBundler.py`, `DailyChlorophyllandSeaColorRetrieval.py`, `CHLSeaColorBundler.py`, `StaticLayersRetrieval.py`, `fetch_ocean_dynamics.py`, `BathyTileGenerator.py`, `bake_ocean_mask_<region>.py`) — edit the existing region's values in place, no new dict entry. Also grep for the old bound values inside code *comments* — `VIIRSHourlyBundler.py`'s `_fill_col_gaps` docstring names the region's `lon_min` by value, `Getwinddata.py`'s header comment lists every region's span in prose — these drift silently since nothing reads them programmatically.

- **Check `Getwinddata.py`'s shared grid (`LAT_MIN`/`LAT_MAX`/`LON_MIN`/`LON_MAX`) still covers the new bounds.** Only widen it if a new bound actually exceeds the current grid edge — don't touch it otherwise. If you do widen it, the job's runtime grows with the extra grid points; check `timeout-minutes` in `Update wind data.yml` still leaves headroom (see Key Gotchas).
- No workflow YAML changes needed — no new region key means no new triggers; the existing scheduled/chained jobs already cover this region.

### Step 5.3 — Regenerate BOTH ocean masks — the step most likely to be skipped

Unlike adding a brand-new region (where a missing mask 404s and falls back — loud, if slow), **a stale mask after a boundary change doesn't 404. It loads successfully with the old bounds baked into its own `bounds` field**, and every pixel gets silently misclassified against the wrong extent. Nothing in the console flags this.

- Backend: `DailySSTData/<region>/ocean_mask.json`, produced by `bake_ocean_mask_<region>.py` via `Ocean_Mask.yml`. Update the script's `NORTH/SOUTH/WEST/EAST` (Step 5.2) and push — the `paths:`-filtered trigger fires reliably on a normal content change to that file (the unreliable case from Part 1 is specifically a same-commit *workflow-file* edit, not a plain script content change). **The job is slow** — baking and classifying all 3 regions in one job (checkout + setup + 3× Natural Earth download/classify) took roughly 30 minutes total in the last observed run. Don't assume a missing update after a couple of minutes means it failed; confirm by checking the file's own `bounds` field against what you just pushed. If the change needs to be live sooner than that, push the same `global_land_mask` fallback used below as an interim backend file too — CI's Natural Earth version overwrites it once the job completes.
- Frontend: `public/openocean_mask_<region>.json`, same `global_land_mask` fallback method as Part 3 Step 3.3, same new bounds. Re-run the sanity checks near the *moved* edge specifically (the new west/east town or offset point), not just the region's center.

### Step 5.4 — Update every place bounds are duplicated in the frontend (same locations as Part 3 Step 3.2)

`regionConfig.js`'s `bounds` object, plus **recompute `defaultCenter`** as the midpoint of the new bounds — don't leave it at the old center, it ends up off-center after an asymmetric bound change. Then `UserSettingsModal.jsx`'s `bounds` display string and `bbox`, `LandingPage.jsx`'s `bounds` string and `mapUrl`'s embedded bbox, and `admin/community_admin.html`'s `center`/`bounds`. All of these are copies of the same four numbers in different formats (`"N 30.5°  ·  S 26.0°  ·  W 81.97°  ·  E 76.14°"` vs `[-81.97,26.0,-76.14,30.5]` vs `{north, south, west, east}`) — grep the old bound values across `src/` and `admin/` after editing to confirm nothing was missed, the same way you'd verify a rename.

### Step 5.5 — What normally does NOT need to change

- No new region key anywhere, no new dropdown entries, no new NOAA scraper calls or `NOAA_SOURCES` ports — a boundary move alone doesn't add or remove departure ports. Sanity-check this assumption though if a bound moves past an existing port's location.
- `admin/user_admin.html` — its dropdowns list region keys, not bounds, so it's untouched.
- `wreckRegion` values and `sstSeasonalDefaults` — tied to ports/climate, not raw bounds.

---

## Key Gotchas — Learned Across Rollouts

| Bug | Root cause | Fix |
|---|---|---|
| Marine weather widget silently shows nothing for a whole new region | `NOAAPARSE` is a separate repo with no cross-reference from SSTv2 or `regionConfig.js`; adding a region without touching it is easy and produces no visible error | Always do Part 2 — grep `NOAAPARSE/scraper.py` and `useMarineForecast.js`'s `NOAA_SOURCES` for the new ports explicitly, don't assume "the region is done" after Parts 1 and 3 |
| `regionConfig.js`'s `noaaZone` footnote shows a different zone than the forecast actually displayed | It's an independent hand-maintained copy of the same fact as `NOAA_SOURCES`'s zone id, nothing keeps them in sync | Set both from the same source value when adding a port; spot-check both when editing either |
| An agent implements from `docs/adding_a_new_region.md` or `SST_DATA_PIPELINE.md` and misses files/repos that changed since those docs were last accurate | Docs go stale faster than they get updated; this doc itself has already needed a full rewrite once | Grep the live repos for the most recently added region's key before trusting any doc's specific file list — including this one |
| CHL/SeaColor 404 | URL path `Chlorophyll/Bundled/<region>/` instead of `Chlorophyll/<region>/Bundled/` | Subdir goes BEFORE `Bundled/` for CHL/SeaColor — but AFTER `Bundled/` for VIIRS (`VIIRS/Bundled/<region>/`), the two bundlers are not consistent with each other, don't assume one matches the other |
| Altimetry over land / in enclosed sounds or lagoons | Simple land/water classification at ~1-2km resolution doesn't resolve narrow barrier islands separating enclosed water from open ocean | Sanity-check specific known points before shipping a new region's `openocean_mask`; flag the limitation rather than silently shipping it |
| Viewport locked to altimetry data edge | `setMaxBounds` used data bounds instead of region bounds | Use region config bounds (`llBounds`) for `setMaxBounds` on all layers |
| Map pans to the previous region on region change | `selectedLocation` initialized once from the wrong region | `key={region}` on the relevant provider forces remount on region change |
| VIIRS vertical banding | Non-integer lon grid origin caused alignment drift for some regions | `_fill_col_gaps` in `VIIRSHourlyBundler.py` — check whether it's needed for a new region's specific `lon_min`, don't assume it always is or never is |
| `Ocean_Mask.yml`'s push-path trigger doesn't reliably fire when the new mask script and the workflow file itself change in the same commit | Path-filtered `push` triggers can be inconsistent across a self-modifying-workflow-file commit | Verify the output file actually appears in the repo after pushing; trigger `workflow_dispatch` manually if it doesn't within a few minutes |
| Git push rejected as non-fast-forward minutes after cloning | These repos get frequent automated commits (data pipeline runs, buoy fetches, hourly weather scrapes) | `git fetch origin main && git rebase origin/main` immediately before every push, even on a freshly-cloned scratch copy |
| A boundary-only update leaves a stale ocean mask that loads successfully but silently misaligns everything | The mask JSON's own `bounds` field drives the frontend's pixel math — a bound change makes the *value* wrong, not the *file* missing, so there's no 404 to flag it | After any boundary change, regenerate both ocean masks (Part 5, Step 5.3) and verify each file's own `bounds` field matches the new values before considering the change done |
| `Ocean_Mask.yml`'s job runs long (~30 min total for all 3 regions) | Each region's Natural Earth download + point-in-polygon classification takes several minutes on its own; the workflow bakes all regions sequentially in one job | Don't read "no update after a few minutes" as a failure; if it needs to be live sooner, push a `global_land_mask`-based interim file for the backend mask too (same method as the frontend fallback) — CI overwrites it once the job finishes |
| A GitHub Actions job that pushes its own output (`Ocean_Mask.yml`'s commit step) can lose a `git push` race against other automated workflows and fail silently with no output committed | No retry/rebase logic on the push step, combined with several other workflows (VIIRS bundler, hotspots, buoys, SST fetch) committing to `main` every few minutes | Add a fetch+rebase+retry loop around any workflow's self-committing push step, not just a one-off manual retry |
| `Update wind data.yml` exceeded its `timeout-minutes` after a region's bounds widened the shared wind grid | More grid points (Step 5.2's `Getwinddata.py` check) means more Open-Meteo batches, and the job had a tight fixed timeout | If you widen the shared wind grid for any region, re-check `timeout-minutes` in `Update wind data.yml` has headroom for the larger batch count, not just that the script logic is correct |
| Shaded Relief map layer missing for a region that otherwise shipped fine | `bathy-tiles.yml` (S3/CloudFront raster tile pipeline, `BathyTileGenerator.py`) is `workflow_dispatch`-only with its own region dropdown, entirely separate from every other layer's auto-running workflow — `ne_fl` had a correct `REGION_CONFIGS` entry in the script but was never in the workflow's dropdown, so it was never triggered and no tiles ever existed | Explicitly check `bathy-tiles.yml`'s dropdown includes the new region (Step 1.2) *and* confirm someone actually ran it — the script supporting a region and the workflow having run for that region are two independent facts |
| `Static layers.yml` ran, committed a file, exited 0 — but `bathymetry_contours_<NEW>.json` had ~1 feature instead of hundreds; contours only appeared over the fraction of the region shared with an existing region, nothing further out | The new region was the first to reach into a CRM OPeNDAP volume never fetched before (`crm_vol1_2023.nc`, 39-46N); the per-volume dataset-open call in `StaticLayersRetrieval.py`/`BathyTileGenerator.py` had no retry, so one transient failure silently skipped that whole volume with just a log warning | Fixed 2026-07-12: both scripts now retry the volume open 3x with backoff. More generally — a region crossing into any code path no prior region has exercised (a data-source volume boundary, an NWS office boundary, a latitude never handled before) is untested regardless of how stable the surrounding logic looks; verify output size/feature-count against a neighbor region (Step 1.5), don't just check the file exists |
| Both CRM volumes fetch successfully (per the run log) but `bathymetry_contours_<NEW>.json` still has ~1 feature and the log shows "Open-ocean mask" retaining only a few hundred cells out of a million+ ocean cells | `StaticLayersRetrieval.py`'s `_build_grid()` merges rows from multiple CRM volumes via `sorted(set(raw lat/lon floats))`; `crm_vol1_2023.nc`/`crm_vol2_2023.nc` have different native lon grid origins, so the merged axis is nearly the *sum* of each volume's own column count (not the union of a shared grid) — every row ends up populated in only ~half its columns, the other half defaulting to `land=True` in a checkerboard pattern that the radius=6 erosion reads as land almost everywhere | Fixed 2026-07-12: snap each fetched lat/lon onto a canonical `res_deg`-multiple grid in `_fetch_bathymetry()` before building rows (same approach `BathyTileGenerator.py`'s `_place_chunk` already used, which is why that script never had this bug). Only surfaces for a region spanning two CRM volumes — check the open-ocean cell count vs. total ocean cell count in the log, not just that the fetch itself succeeded |
| Wind overlay stops well short of a new region's far edge (e.g. va_ri's wind streaks cut off south of Long Island/Rhode Island) even though `Getwinddata.py`'s shared grid was correctly widened in code | `Update wind data.yml` runs hourly but `WindData/wind_latest.json` had not actually updated in 5+ hours — the wider grid raised the Open-Meteo batch count (51 -> 82 for `va_ri`), and the script aborted the *entire* run via `sys.exit(1)` if even one batch failed after retries, with no partial commit; a single transient failure anywhere in the longer chain silently discarded that hour's update | Fixed 2026-07-12: a failed batch now logs a warning and is skipped instead of aborting the run (same retry-then-degrade pattern as the CRM volume fetch). Compare the committed file's `generated_at`/`grid.nx`/`grid.ny` against what the current code should produce if wind coverage looks stale or too narrow — don't assume the file rebuilds correctly just because the workflow shows recent runs |
| Wind update workflow run completes all batches successfully but still fails, with `422 "file is too large to be processed"` in the log | The wider grid's payload (168 hours x more points, each stored both compactly in `velocityJSON` and verbosely in `hours[].grid`) exceeded the GitHub Contents API's practical size ceiling for a single inline-base64 PUT — this is a separate failure from the batch-abort issue above and can surface even after that fix, once the payload itself is simply too large | Fixed 2026-07-12: switched the GitHub write to the Git Data API (blob -> tree -> commit -> ref update), which handles much larger files; this was the fix GitHub's own error message recommended. Don't trim the JSON payload format instead without also updating `SSTHeatmapLeaflet.jsx`, which parses `hours[].grid` as literal `{lat,lon,speed}` objects |
| `fetch-ocean-dynamics.yml`'s commit step failed outright with `CONFLICT (content)` on the region's `altimetry_*_grid.json`/`currents_*.json` and its own log files, exit code 1, that run's data never committed | Plain `git pull --rebase origin HEAD && git push origin HEAD` with no retry; this workflow's output files are wholly regenerated every run, so when it raced a concurrent run of itself (or another workflow) that had already pushed different regenerated data for the same date, rebase hit a real content conflict it can't auto-resolve, not just a stale base | Fixed 2026-07-12: retry loop using `git rebase -X ours` (keep our freshly-fetched data on conflict) instead of a bare rebase, same shape as `Ocean_Mask.yml`'s existing retry loop but with the merge strategy needed for genuine content conflicts, not only non-fast-forward races |
| User reports the page hanging/slow (~30s) right after a brand-new region ships, "same as the last two regions" | Several overlays (bathymetry contours, bathymetry raster, wrecks, possibly altimetry/currents before their first successful run) don't yet have region-specific data for a region just added; each does a fetch-then-404-then-fallback-to-mid_atlantic chain, and with multiple overlays doing this at once the cumulative delay before everything resolves and the page settles can read as a stuck/hanging load | This is close to expected for the first hour(s) after a region ships, not usually a client-side bug — check whether the manual-trigger workflows (`Static layers.yml`, `bathy-tiles.yml`) have actually run yet (most common cause) before assuming a code regression; verify per Step 1.5's feature-count check as well, since a workflow that "ran" but produced a near-empty file causes the same symptom |
| Reused an existing region's port label (Step 2.2) for a port that's the same *town* but a different *use case* | The existing entry's zone doesn't necessarily match what the new region needs — e.g. a bay-side zone already assigned to that label for coverage of the bay, when the new region needs the offshore zone for the same town | Check what zone the existing `NOAA_SOURCES` entry actually points to before reusing a label; if it doesn't match, drop the duplicate port from the new region rather than creating a label collision (two entries can't share one label with different zones) |

---

## Data File Location Reference

```
SSTv2/DailySSTData/
  ocean_mask.json                            ← mid-atlantic inshore mask
  <NEW>/ocean_mask.json                      ← new region inshore mask
  MUR/mur_YYYYMMDD.csv                       ← mid-atlantic MUR
  MUR/<NEW>/mur_YYYYMMDD.csv                 ← new region MUR
  VIIRS/Passes/viirs_YYYYMMDD_HHMM.csv       ← mid-atlantic passes
  VIIRS/Passes/<NEW>/...                     ← new region passes
  VIIRS/Bundled/viirs_index.json             ← mid-atlantic bundle index
  VIIRS/Bundled/<NEW>/viirs_index.json       ← new region bundle index (subdir AFTER Bundled/)

SSTv2/Chlorophyll/
  Bundled/<date>/chl_bundle.json.gz          ← mid-atlantic CHL
  <NEW>/Bundled/<date>/chl_bundle.json.gz    ← new region CHL (subdir BEFORE Bundled/)

SSTv2/
  bathymetry_contours.json                   ← mid-atlantic bathy
  bathymetry_<NEW>.json / bathymetry_contours_<NEW>.json / bathymetry_grid_<NEW>.json

SSTv2/DailySST/
  Currents/<NEW>/currents_latest.json
  Altimetry/<NEW>/altimetry_latest_grid.json

NOAAPARSE/
  <port>_noaa.json                           ← one per port, all regions flat in repo root
```

## Frontend Files Modified

```
src/config/regionConfig.js                  ← add region entry (required)
src/pages/SSTLive.jsx                       ← REGION_OPTIONS (required)
src/components/auth/UserSettingsModal.jsx   ← REGION_PICKER_DATA (required)
src/pages/LandingPage.jsx                   ← REGIONS in regionStep (required)
admin/community_admin.html                  ← REGIONS object + button (required)
admin/user_admin.html                       ← 2 dropdown options (required)
public/openocean_mask_<NEW>.json            ← new file, generate + commit (required)
src/hooks/useMarineForecast.js              ← NOAA_SOURCES per new port (required — see Part 2)

src/lib/dataFetchers.js                     ← already parameterized, no changes needed
src/components/SSTHeatmapLeaflet.jsx        ← already generalized, no changes needed
```
