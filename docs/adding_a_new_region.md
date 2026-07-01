# Adding a New Region — Step-by-Step Playbook

This document captures every change made to add the **Georgia & South Carolina** (`ga_sc`) region as a replicable checklist. Follow it in order when adding any new region. Replace `<NEW>` with your new region key (e.g. `gulf_stream`, `new_england`) and fill in the bounds/ports accordingly.

---

## Overview of the Two Repos

| Repo | Purpose |
|---|---|
| `jlintvet/SSTv2` | Python backend — fetches + bakes all data files via GitHub Actions |
| `jlintvet/SSTProductionRepo` | React/Vite frontend — consumes those files, handles auth + UI |

Work the backend first so data files exist by the time frontend is wired up.

---

## Part 1 — Backend (`SSTv2` repo)

### Step 1.1 — Add region to every Python script's `_REGION_CONFIGS`

Each script has a `_REGION_CONFIGS` dict near the top and reads `REGION = os.environ.get("REGION", "mid_atlantic")`. Add your new region to every one:

**`sst_data_fetcher.py`** (MUR SST + GOES Composite + VIIRS passes)
```python
_REGION_CONFIGS = {
    "mid_atlantic": {
        "bbox":   {"lon_min": -78.89, "lon_max": -72.21, "lat_min": 33.70, "lat_max": 39.00},
        "subdir": "",          # root — backward compat
    },
    "ga_sc": {
        "bbox":   {"lon_min": -82.00, "lon_max": -75.20, "lat_min": 29.80, "lat_max": 35.20},
        "subdir": "ga_sc",
    },
    "<NEW>": {
        "bbox":   {"lon_min": ..., "lon_max": ..., "lat_min": ..., "lat_max": ...},
        "subdir": "<NEW>",
    },
}
```
`OUTPUT_DIR` automatically resolves to `DailySSTData/<subdir>/` (or root when subdir is `""`).

**`VIIRSHourlyBundler.py`**
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"bbox": {...}, "subdir": ""},
    "ga_sc":        {"bbox": {...}, "subdir": "ga_sc"},
    "<NEW>":        {"bbox": {...}, "subdir": "<NEW>"},
}
```
> **Gotcha:** If the new region has sparser VIIRS coverage (lower latitudes), set `COMPOSITE_WINDOW_HOURS=72` in the workflow (see Step 1.2). Also check whether `_fill_col_gaps` is needed — ga_sc required it because its lon grid starts at a non-integer origin causing vertical banding. See the function in `VIIRSHourlyBundler.py` for the fix.

**`DailyChlorophyllandSeaColorRetrieval.py`** and **`CHLSeaColorBundler.py`**
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"lat_min": 33.70, "lat_max": 39.00, "lon_min": -78.89, "lon_max": -72.21, "subdir": ""},
    "ga_sc":        {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20, "subdir": "ga_sc"},
    "<NEW>":        {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,   "lon_max": ...,   "subdir": "<NEW>"},
}
```
> **CHL/SeaColor URL path rule:** Files land at `Chlorophyll/<subdir>/Bundled/` — the subdir comes BEFORE `Bundled/`, not after. The frontend `dataFetchers.js` mirrors this. Getting this backwards was a bug in the ga_sc rollout.

**`StaticLayersRetrieval.py`** (bathymetry contours + grid + points)
```python
_REGION_CONFIGS = {
    "mid_atlantic": {"lat_min": 33.70, "lat_max": 39.00, "lon_min": -78.89, "lon_max": -72.21, "suffix": ""},
    "ga_sc":        {"lat_min": 29.80, "lat_max": 35.20, "lon_min": -82.00, "lon_max": -75.20, "suffix": "_ga_sc"},
    "<NEW>":        {"lat_min": ...,   "lat_max": ...,   "lon_min": ...,   "lon_max": ...,   "suffix": "_<NEW>"},
}
```
This writes `bathymetry_contours_<NEW>.json`, `bathymetry_grid_<NEW>.json`, and `bathymetry_<NEW>.json`.

---

### Step 1.2 — Update GitHub Actions workflows

**`.github/workflows/Daily SST.yml`**

Add the new region to the manual dispatch `options` list AND to the default `REGIONS` string in the run step:
```yaml
on:
  workflow_dispatch:
    inputs:
      region:
        options:
          - mid_atlantic
          - ga_sc
          - <NEW>       # add here
...
      REGIONS="mid_atlantic ga_sc <NEW>"   # add here
```

**`.github/workflows/VIIRSHourlyBundler.yml`**

Add a bundler invocation for the new region:
```yaml
- name: Bundle all regions
  run: |
    REGION="mid_atlantic" python VIIRSHourlyBundler.py
    REGION="ga_sc" COMPOSITE_WINDOW_HOURS="72" python VIIRSHourlyBundler.py
    REGION="<NEW>" COMPOSITE_WINDOW_HOURS="72" python VIIRSHourlyBundler.py
```
Adjust `COMPOSITE_WINDOW_HOURS` down to 36 if the region has dense coverage.

**`.github/workflows/ChlorophyllandSeaColor.yml`**

Add two steps (retrieval + bundler) for the new region, each with `REGION: <NEW>` env:
```yaml
- name: Run DailyChlorophyllandSeaColorRetrieval.py (<NEW>)
  env:
    REGION: <NEW>
    CMEMS_USER: ${{ secrets.CMEMS_USER }}
    CMEMS_PASSWORD: ${{ secrets.CMEMS_PASSWORD }}
    COPERNICUSMARINE_SERVICE_USERNAME: ${{ secrets.CMEMS_USER }}
    COPERNICUSMARINE_SERVICE_PASSWORD: ${{ secrets.CMEMS_PASSWORD }}
  run: python DailyChlorophyllandSeaColorRetrieval.py

- name: Run CHLSeaColorBundler.py (<NEW>)
  env:
    REGION: <NEW>
  run: python CHLSeaColorBundler.py
```

**`.github/workflows/Static layers.yml`**

Add a step:
```yaml
- name: Run StaticLayersRetrieval.py (<NEW>)
  run: REGION=<NEW> python StaticLayersRetrieval.py
```
Trigger this manually from the GitHub Actions UI after adding the step to generate the initial bathy files. They're static — only re-run if bounds change.

**`.github/workflows/Update wind data.yml`**

If the new region extends coverage beyond the current lat/lon grid, expand it in `Getwinddata.py`. For ga_sc we widened from `lat 33–40, lon -78.5 to -72.5` to `lat 29–40, lon -82.5 to -72.5`.

---

### Step 1.3 — Create the ocean mask script for the new region

Copy `bake_ocean_mask_ga_sc.py` → `bake_ocean_mask_<NEW>.py` and update bounds and output path:
```python
NORTH, SOUTH = <lat_max>, <lat_min>
WEST,  EAST  = <lon_min>, <lon_max>
OUT_PATH = "DailySSTData/<NEW>/ocean_mask.json"
```
Add it to **`.github/workflows/Ocean_Mask.yml`**:
```yaml
- name: Bake ocean mask (<NEW>)
  run: python bake_ocean_mask_<NEW>.py
- name: Commit generated files
  run: |
    git add DailySSTData/ocean_mask.json DailySSTData/ga_sc/ocean_mask.json DailySSTData/<NEW>/ocean_mask.json
    git commit -m "Update ocean masks" || echo "No changes"
    git push
```
Trigger this manually once to generate and commit the mask.

---

### Step 1.4 — Verify data files appear in SSTv2

After triggering the workflows, confirm these are committed to the repo:
```
DailySSTData/<NEW>/ocean_mask.json
DailySSTData/MUR/<NEW>/mur_YYYYMMDD.csv
DailySSTData/VIIRS/Passes/<NEW>/
DailySSTData/VIIRS/Bundled/<NEW>/viirs_index.json
Chlorophyll/<NEW>/Bundled/<date>/chl_bundle.json.gz
bathymetry_contours_<NEW>.json
bathymetry_grid_<NEW>.json
bathymetry_<NEW>.json
```

---

## Part 2 — Frontend (`SSTProductionRepo`)

Work on a new branch (e.g. `<NEW>-region`). Use the CLAUDE.md patch-script workflow for any large file changes.

### Step 2.1 — Add region to `src/config/regionConfig.js`

```js
<NEW>: {
  label: "Display Name",
  bounds: {
    north: <lat_max>,
    south: <lat_min>,
    west:  <lon_min>,
    east:  <lon_max>,
  },
  minZoom: 6,
  maxZoom: 11,
  defaultCenter: { lat: <center_lat>, lon: <center_lon> },
  defaultZoom: 7,
  defaultLocation: "<Default Port Name>",
  dataPathSuffix: "<NEW>",   // must match SSTv2 subdir exactly
  locations: [
    { label: "Port Name", lat: ..., lon: ..., wreckRegion: "...", noaaCoverage: false },
    // ...
  ],
},
```
`dataPathSuffix` drives all data URL construction. `""` = mid-atlantic (root paths). Any non-empty value = subdir under SSTv2 data paths.

---

### Step 2.2 — Add region to the signup form in `SSTLive.jsx`

```js
const REGION_OPTIONS = [
  { value: "mid_atlantic", label: "Mid-Atlantic (NC–NJ)" },
  { value: "ga_sc",        label: "Georgia & South Carolina" },
  { value: "<NEW>",        label: "<Display label>" },
];
```
The selected value is stored in `user_metadata.region` on sign-up and in `user_profiles.region` via pre-upsert.

---

### Step 2.3 — Generate and commit the altimetry open-ocean mask

The `openOceanRef` useEffect in `SSTHeatmapLeaflet.jsx` tries `/openocean_mask_${suffix}.json` first, then falls back to `/openocean_mask.json` (mid-atlantic only, lat 33.7–39.0°N). You must generate a region-specific mask and commit it to `public/`.

**Why it's needed:** Without it, `altimetryDeepMask` returns `true` (open ocean) for all out-of-bounds pixels → altimetry renders over land.

**How to generate `public/openocean_mask_<NEW>.json`:**

Use a Python script similar to `gen_ga_sc_openocean_mask_v2.py` (in the session outputs). The approach depends on region geography:

- **Region has large enclosed sounds/bays** (like NC's Pamlico/Core Sound, ~80km wide): Stitch the mid-atlantic GEBCO mask for overlapping latitudes + GLOBE `global_land_mask` for the rest, with a small 5×5 morphological opening. GLOBE data treats large sounds as ocean (they are water), and morphological opening can't remove features >0.26° wide.
- **Open coast only, no large enclosed sounds**: GLOBE `global_land_mask` + morphological opening alone is sufficient.

Output format:
```json
{
  "bounds": {"n": <lat_max>, "s": <lat_min>, "e": <lon_max>, "w": <lon_min>},
  "step": 0.02,
  "rows": <N>,
  "cols": <M>,
  "packed": "<base64 bitpacked grid>"
}
```
A `1` bit = open ocean (show altimetry). A `0` bit = excluded (land or enclosed water).

Sanity check before committing: verify a few known ocean points return 1 and known land/sound points return 0.

Commit to `SSTProductionRepo/public/openocean_mask_<NEW>.json`.

---

### Step 2.4 — Verify these behaviors in `SSTHeatmapLeaflet.jsx` (no code changes needed)

These were all generalized during ga_sc and work for any region with the right mask files in place:

**Ocean mask (SST/CHL/composite):** `waterMaskRef` loads from SSTv2 at `DailySSTData/<suffix>/ocean_mask.json`. Already region-aware.

**Altimetry open-ocean mask:** Tries `/openocean_mask_${suffix}.json` → fallback to `/openocean_mask.json`.

**`altimetryDeepMask` out-of-bounds:** Returns `true` (show data). Points outside mask bounds are open ocean.

**`ocMask` for altimetry raster:** `altimetryDeepMask` only — NOT combined with `waterMaskRef`. See Section 9 of `SST_RENDERING.md`. The combined mask is only for contour lines.

**`blurOverlay` on altimetry:** Applied to the Leaflet `imageOverlay` path to feather the 0.125° block edges and offshore data boundary.

**`setMaxBounds(llBounds)`:** All layers use region bounds, not data bounds. The data boundary is often offshore and must not lock the viewport away from the coast.

**Bathymetry:** `SSTLive.jsx` derives URLs from `dataPathSuffix` automatically. Falls back to mid-atlantic if files 404.

**VIIRS cache key:** Includes region — no stale cross-region cache issues.

---

### Step 2.5 — Check Supabase `user_profiles.region` column

If `region` is an enum or has a check constraint, add `<NEW>` to it. If it's plain `text` (current setup), no migration needed.

---

## Part 3 — Testing Checklist

Set `VITE_FORCE_REGION=<NEW>` on the branch preview Vercel URL to test without touching production user records.

**Data layers — verify each loads, no console 404s:**
- [ ] VIIRS SST (daily composite)
- [ ] VIIRS SST (hourly — check for vertical banding)
- [ ] MUR SST
- [ ] Chlorophyll
- [ ] Sea Color (Kd490)
- [ ] GOES HD Composite
- [ ] Altimetry raster + contours
- [ ] Bathymetry contours
- [ ] Wind/currents

**Rendering quality:**
- [ ] SST colors consistent with mid-atlantic (fixed 50–90°F scale)
- [ ] Altimetry: no data bleeding over land or into enclosed sounds
- [ ] Altimetry: edges softened (blurOverlay applied), not blocky
- [ ] Altimetry: can pan to the coastline (viewport not locked to data edge)
- [ ] CHL/SeaColor: edges feathered

**Viewport:**
- [ ] Map centers on the new region at correct zoom
- [ ] `setMaxBounds` allows panning to the full coast including inland areas
- [ ] No grey bars after data loads (minZoom from data bounds)

**Auth:**
- [ ] Sign-up with new region stores in `user_metadata.region`
- [ ] Login routes correctly to the new region

---

## Key Gotchas — Learned from ga_sc

| Bug | Root cause | Fix |
|---|---|---|
| CHL/SeaColor 404 | URL path `Chlorophyll/Bundled/ga_sc/` instead of `Chlorophyll/ga_sc/Bundled/` | Subdir goes BEFORE `Bundled/` in both bundler output path and JS fetch URL |
| Altimetry over land south of 33.7°N | `altimetryDeepMask` out-of-bounds returned `false` (land) | Out-of-bounds = open ocean → return `true` |
| Altimetry showed in Pamlico/Core Sound | GLOBE treats large sounds as water; morphological opening can't remove 80km+ features | Stitch mid-atlantic GEBCO mask for lat≥33.7°N; GLOBE for lat<33.7°N |
| Altimetry blocky + hard west edge | No `blurOverlay` on Leaflet imageOverlay path | `await blurOverlay(dataURL, 4)` before creating the imageOverlay |
| Viewport locked to altimetry data edge | `setMaxBounds` used data bounds, not region bounds | Use `llBounds` (region config bounds) for `setMaxBounds` on all layers |
| Map pans to mid-atlantic on region load | `selectedLocation` initialized once from wrong region | `key={region}` on `AppProvider` forces remount on region change |
| VIIRS vertical banding | Non-integer lon grid origin caused alignment drift | `_fill_col_gaps` in `VIIRSHourlyBundler.py` |
| Altimetry raster too restrictive | `ocMask` used `waterMask AND altimetryDeepMask` | Altimetry raster `ocMask = altimetryDeepMask` only; combined mask for contours only |

---

## Data File Location Reference

```
SSTv2/DailySSTData/
  ocean_mask.json                            ← mid-atlantic inshore mask
  <NEW>/ocean_mask.json                      ← new region inshore mask
  MUR/mur_YYYYMMDD.csv                       ← mid-atlantic MUR
  MUR/<NEW>/mur_YYYYMMDD.csv                 ← new region MUR
  VIIRS/Passes/viirs_YYYYMMDD_HHMM.csv      ← mid-atlantic passes
  VIIRS/Passes/<NEW>/...                     ← new region passes
  VIIRS/Bundled/viirs_index.json             ← mid-atlantic bundle index
  VIIRS/Bundled/<NEW>/viirs_index.json       ← new region bundle index

SSTv2/Chlorophyll/
  Bundled/<date>/chl_bundle.json.gz          ← mid-atlantic CHL
  <NEW>/Bundled/<date>/chl_bundle.json.gz    ← new region CHL

SSTv2/
  bathymetry_contours.json                   ← mid-atlantic bathy
  bathymetry_<NEW>.json                      ← new region bathy
  bathymetry_contours_<NEW>.json
  bathymetry_grid_<NEW>.json
```

## Frontend Files Modified

```
src/config/regionConfig.js           ← add region entry (required)
src/pages/SSTLive.jsx                ← add to REGION_OPTIONS (required)
public/openocean_mask_<NEW>.json     ← new file, generate + commit (required)

src/lib/dataFetchers.js              ← already parameterized, no changes needed
src/components/SSTHeatmapLeaflet.jsx ← already generalized, no changes needed
src/context/AppContext.jsx           ← already generalized, no changes needed
```

---

## GA/SC Region — NOAA Forecast Zone Reference

This table documents the NOAA marine zone assignments for every departure location in the `ga_sc` region. Use it for cross-checking and when adding new scraper entries.

**Zone source offices:**
- ILM = NWS Wilmington NC  |  CHS = NWS Charleston SC  |  JAX = NWS Jacksonville FL
- OPC = Ocean Prediction Center (manages ILM outer and most CHS outer zones via AMZ2xx/AMZ37x)

| Departure Location | NOAA Zone | Zone Description | Offshore Range | Tide Station | JSON File |
|---|---|---|---|---|---|
| Wrightsville Beach, NC | AMZ270 | Surf City to Cape Fear (ILM/OPC) | 20–40nm | 8658163 | wrightsvillebeachnc_noaa.json |
| Carolina Beach, NC | AMZ270 | Surf City to Cape Fear (ILM/OPC) | 20–40nm | 8658120 | carolinabeachnc_noaa.json |
| Southport, NC | AMZ272 | Cape Fear to Little River Inlet (ILM/OPC) | 20–40nm | 8659084 | southportnc_noaa.json |
| Little River Inlet, SC | AMZ274 | Little River Inlet to Murrells Inlet (ILM/OPC) | 20–40nm | 8661070 | littleriversc_noaa.json |
| Myrtle Beach, SC | AMZ274 | Little River Inlet to Murrells Inlet (ILM/OPC) | 20–40nm | 8661070 | myrtlebeachsc_noaa.json |
| Murrells Inlet, SC | AMZ276 | Murrells Inlet to South Santee River (ILM/OPC) | 20–40nm | 8661070 | murrellsinletsc_noaa.json |
| Georgetown, SC | AMZ276 | Murrells Inlet to South Santee River (ILM/OPC) | 20–40nm | 8665530 | georgetownsc_noaa.json |
| Charleston, SC | AMZ370 | South Santee River to Edisto Beach (CHS/OPC) | 20–40nm | 8665530 | charlestonsc_noaa.json |
| Beaufort, SC | AMZ372 | Edisto Beach to Savannah (CHS/OPC) | 20–40nm | 8670659 | beaufortsc_noaa.json |
| Hilton Head, SC | AMZ372 | Edisto Beach to Savannah (CHS/OPC) | 20–40nm | 8670659 | hiltonheadsc_noaa.json |
| Tybee Island, GA | AMZ374 | Savannah to Altamaha Sound (CHS-managed) | 20–60nm | 8670870 | tybeega_noaa.json |
| Darien, GA | AMZ374 | Savannah to Altamaha Sound (CHS-managed) | 20–60nm | 8670870 | darienga_noaa.json |
| St. Simons Island, GA | AMZ470 | Altamaha Sound to Fernandina Beach (JAX) | 20–60nm | 8679511 | stsimonsgaga_noaa.json |
| Jekyll Island, GA | AMZ470 | Altamaha Sound to Fernandina Beach (JAX) | 20–60nm | 8679511 | jekyllga_noaa.json |
| Fernandina Beach, FL | AMZ452 | Fernandina Beach to St. Augustine (JAX inner) | Out 20nm | 8720197 | fernandinafl_noaa.json |
| Mayport, FL | AMZ452 | Fernandina Beach to St. Augustine (JAX inner) | Out 20nm | 8720218 | mayportfl_noaa.json |
| St. Augustine, FL | AMZ454 | St. Augustine to Flagler Beach (JAX inner) | Out 20nm | 8720587 | staugustinefl_noaa.json |

> **FL note:** Fernandina Beach, Mayport, and St. Augustine use inshore (<20nm) JAX zones. The Gulf Stream runs closer to shore here so the inner zone is more relevant for day-trip anglers.
>
> **OPC zones (AMZ270–276, AMZ370–374):** These zones return 400 from `marine.weather.gov/MapClick.php?zoneid=AMZxxx` and 404 from `api.weather.gov/zones/forecast/`. Use `scrape_and_save_latlon(lat, lon, filename)` instead — pass an offshore coordinate ~30nm from the port (inside the zone) and `marine.weather.gov` auto-detects the correct zone. JAX zones (AMZ47x, AMZ45x) work normally via zone ID.
