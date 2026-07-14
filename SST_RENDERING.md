# SST Rendering Pipeline — Frontend

This document describes how the Leaflet-based `SSTHeatmapLeaflet.jsx` (and its dev counterpart `SSTHeatmapLeaflet_chl_range.jsx`) renders SST, chlorophyll, and sea color data onto the CartoDB basemap. If you break rendering, read this before changing anything.

> **Architecture note:** The app was originally Mapbox-based (`TestSST.jsx`). It was migrated to Leaflet (`SSTHeatmapLeaflet.jsx`). Some notes in older git history refer to Mapbox-specific problems (`styledata`, `addSource`, `addLayer`) that no longer apply. The pipeline described here is the current Leaflet version.

---

## Problems that took a long time to solve — do not revisit

Every one of these was a dead end. They will feel plausible again if you're new to the code.

### 1. SST colors bleed onto land

**Symptom:** Ocean-colored blocks appear over Virginia, Maryland, eastern NC, Chesapeake Bay, Pamlico Sound.

**What doesn't work:**
- Relying on the source data (MUR, GOES Blended) to mark land as NaN. These are L4 SST products. They fill Chesapeake Bay, Rappahannock River, Pamlico Sound, and other inland water bodies with real water temperatures because those *are* water.
- A browser-side raster mask that pokes transparent holes in the canvas. Bilinear interpolation in the renderer then bleeds ocean color back across the transparent holes.
- Filtering CMEMS CHL/SeaColor rows using the MUR ocean mask (`mask==1`). MUR's open-ocean definition **includes Chesapeake Bay and Pamlico Sound**, so `mask==1` does NOT exclude estuaries. Do not add MUR mask filtering to `DailyChlorophyllandSeaColorRetrieval.py`.

**What works:**
Filter out inland points at **ingest time** using the prebaked Natural Earth coastline mask. The CSVs written to `DailySSTData/` contain only true-Atlantic-ocean points. The browser-side `waterMaskRef` mask provides a secondary check.

---

### 2. SST shifts northward relative to the coastline (Mercator bug)

**Symptom:** Outer Banks and mid-Atlantic coast appear to have SST painted north of where the coastline actually is. The offset grows with latitude.

**Cause:** Canvas painted in equirectangular pixel space (equal lat degrees per row). Leaflet renders image overlays in Web Mercator space. The canvas gets linearly stretched between the two corner points after Mercator projection, so rows near the top land too far north.

**Fix:** Paint the canvas in Mercator-Y space. For each canvas row `py`:

```js
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
const invMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

const mY = mercYNorth - (py / (CANVAS_H - 1)) * (mercYNorth - mercYSouth);
const lat = invMercY(mY);
```

This is in `gridToDataURL()`. **This applies to ALL three layers (SST, chlorophyll, sea color).** Do not add per-layer projection logic.

---

### 3. Hourly / GOES Comp buttons show "No data available"

**Cause:** `normalizeSSTResponse()` had a `firstGrid.length > 100` threshold that rejected small grids as malformed.

**Fix:** Threshold is now `> 0`. Any non-empty grid is accepted.

---

### 4. Sea color layer shifted north/south

**Symptom:** Sea color data appears shifted relative to coastline. SST and chlorophyll are correctly aligned.

**Cause:** Sea color (KD490) from CMEMS is a coarse ~0.17° grid (~1,280 rows). When passed directly to `gridToDataURL` on its own grid, the bilinear interpolation finds few valid neighbor quads near the data edges, causing `wsum < 0.25` transparency halos that look like a shift. More importantly: using the native coarse-grid bounds places the image at slightly different coordinates than the SST reference grid.

**Fix:** Pre-expand the sea color grid onto the SST reference grid (`latSet/lonSet`) using bilinear interpolation via `expandCoarseGrid()`. Then pass `latSet/lonSet` and the expanded grid to `gridToDataURL`. This guarantees the image bounds are identical to the SST layer. See the `expandCoarseGrid` function in `SSTHeatmapLeaflet.jsx`.

---

### 5. Chlorophyll layer shifted west relative to coastline

**Symptom:** The entire CHL data overlay appears shifted west when compared against SST or the basemap coastline. SST and sea color are correctly aligned. The shift is significant — data appears on land or in incorrect water bodies.

**Cause:** CHL from CMEMS Sentinel-3 OLCI 300m (`cmems_obs-oc_glo_bgc-plankton_nrt_l3-olci-300m_P1D`) uses a native ~0.011° grid. When rendered on its own native grid (`latSet2/lonSet2`), the image bounds (computed as `lonWest - lonStep/2` to `lonEast + lonStep/2`) end up at slightly different coordinates than the SST reference grid. Even though the CMEMS coordinate values in the JSON are correct (verified: lon -78.8861 to -72.2139), the image gets placed at misaligned bounds in Leaflet's `imageOverlay`.

**What doesn't work:**
- Modifying `gridToDataURL` bounds calculation — doc says "do not modify this function."
- Adding exclusion boxes for Chesapeake Bay / Pamlico Sound — the data is correctly positioned, the whole layer is just shifted.
- Filtering with the MUR ocean mask — MUR includes estuaries, this filters the wrong things.
- Adding a coordinate offset correction in Python — coordinates in the JSON are already correct.

**Fix:** Apply the same pattern as sea color — pre-expand CHL onto the SST reference grid using `expandCoarseGrid()`, then pass `latSet/lonSet` to `gridToDataURL`. This ensures CHL uses the same image bounds as SST.

In the overlay `useEffect`:

```js
const useRefGrid = activeDataLayer === "seacolor" || activeDataLayer === "chlorophyll";
const renderLatSet = useRefGrid ? latSet : latSet2;
const renderLonSet = useRefGrid ? lonSet : lonSet2;
const renderGrid   = useRefGrid ? expandCoarseGrid(latSet2, lonSet2, overlayGrid, latSet, lonSet) : overlayGrid;
```

Since CHL at ~0.011° is close to the SST grid at 0.01°, `expandCoarseGrid` produces nearly identical values — no quality loss. Cloud-covered cells (null in the CMEMS data) are excluded from interpolation; if no valid neighbor exists, the expanded cell is omitted and renders transparent.

---

## Layer architecture (Leaflet)

```
┌──────────────────────────────────────────┐
│ Leaflet markers / popups                 │ ← top
├──────────────────────────────────────────┤
│ Fish hotspot SVG overlays                │
├──────────────────────────────────────────┤
│ Bathymetry / wreck markers               │
├──────────────────────────────────────────┤
│ Isotherm / temp-break polylines          │
├──────────────────────────────────────────┤
│ CHL / SeaColor / Composite imageOverlay  │ ← overlayLayerRef
├──────────────────────────────────────────┤
│ SST imageOverlay                         │ ← sstOverlayRef
├──────────────────────────────────────────┤
│ Wind velocity (L.velocityLayer)          │
├──────────────────────────────────────────┤
│ Shaded Relief / Radar tile layer         │ ← bathyTileRef / radarTileRef (both pane z=362,
├──────────────────────────────────────────┤     mutually exclusive — see their sections below)
│ CartoDB tile layer                       │ ← bottom
└──────────────────────────────────────────┘
```

Leaflet image overlays sit above the tile layer automatically. SST is rendered first, then the CHL/SeaColor/Composite overlay on top. No z-index tricks needed.

**Shaded Relief (`showBathyRaster`):** A CloudFront-hosted raster tile layer rendered in a custom Leaflet pane (`bathyTilePane`, z=362 — above CartoDB/basemap, below all SST/CHL overlays). Controlled by `showBathyRaster` state. **When `showBathyRaster` is true, both the SST `useEffect` and the overlay `useEffect` clear their GL layer and active imageOverlay and return early** — the shaded relief replaces all SST/CHL/composite rendering. Switching `showBathyRaster` to false restores the previously active data layer. Do not add null-guard short-circuits that run before the `showBathyRaster` return-early check, or the overlay cleanup step will be skipped when toggling relief off.

SST must still be **ocean-only by the time it hits the canvas**. The basemap's land areas show through transparent pixels — so land-filtered SST is correct. The `waterMaskRef` ocean mask function is passed to `gridToDataURL` as `isOcean` to skip land pixels.

---

## The `gridToDataURL` function

Lives in `SSTHeatmapLeaflet.jsx`. Signature: `gridToDataURL(latSet, lonSet, grid, valMin, valMax, colorFn, isOcean, rangeMin, rangeMax, signal) → Promise<{dataURL, west, east, north, south}>`.

**`signal` is required.** Pass an `AbortSignal` from an `AbortController`; the function checks `signal.aborted` at every chunk boundary and resolves `null` if aborted. The calling `useEffect` must abort on cleanup:

```js
const _ac = new AbortController();
gridToDataURL(..., _ac.signal).then(result => {
  if (_ac.signal.aborted || !result) return;
  // use result
});
return () => { _ac.abort(); };
```

Without `AbortSignal`, every stale invocation of `gridToDataURL` (fired by rapid dep changes on mount) keeps its chunked pixel loop running and queues up MessageChannel tasks — burying the main thread for 20+ seconds. This was the root cause of the tab-freeze regression after chunking was added (commits `fd059643`, `0e8bfc31`, `4367d514`).

Contract:
- `latSet` descending (north → south), `lonSet` ascending (west → east).
- `grid` is a flat object keyed by `"${lat}_${lon}"` strings.
- `isOcean` is the frontend coastline mask function; checked per pixel. Pass `waterMaskRef.current`.
- Canvas is **fixed 512 × 400 pixels**. The pixel loop is chunked at 50 rows per chunk with a `MessageChannel` yield between chunks — keeps the browser responsive during large VIIRS bundles.
- Each canvas pixel resolves to a geographic lat/lon via inverse Mercator (problem 2 above).
- Each pixel value is **bilinearly interpolated** from the 4 surrounding source-grid cells.
- Missing or null neighbors drop out of the weighted sum (renormalized by `wsum`). If `wsum < 0.25`, pixel is transparent.
- Returns bounds expanded by half a grid cell on each side — aligns pixel centers with cell centers.
- Returns a `dataURL` as a blob URL (revoke these on cleanup via `blobUrlsRef.current`).
- **Do not modify this function to fix overlay alignment issues.** Alignment problems are solved upstream by `expandCoarseGrid` or by correcting arguments.

---

## Overlay `useEffect` — correct call pattern

```
SST layer:       gridToDataURL(latSet,  lonSet,  grid,             ...)  ← SST grid, direct
Chlorophyll:     gridToDataURL(latSet,  lonSet,  expandedCHL,      ...)  ← expanded onto SST grid
Sea color:       gridToDataURL(latSet,  lonSet,  expandedSeaColor, ...)  ← expanded onto SST grid
Composite:       gridToDataURL(latSet2, lonSet2, overlayGrid,      ...)  ← composite own grid, direct
```

Both CHL and SeaColor use `expandCoarseGrid(latSet2, lonSet2, overlayGrid, latSet, lonSet)` before calling `gridToDataURL`. The composite layer uses its own grid directly (it is already on the same resolution as SST).

The overlay bounds (`[[south, west], [north, east]]`) passed to `L.imageOverlay` always come from the `gridToDataURL` return value — never hardcoded.

---

## Water mask plumbing

Built once per map mount from a prebaked binary mask at `DailySSTData/ocean_mask.json` (falls back to Natural Earth 1:10m download if unavailable). Produces a `(lat, lon) => boolean` function: true = ocean.

Storage:
- `waterMaskRef` (`useRef`) — authoritative, survives re-renders.
- `waterMaskVersion` (`useState`, counter) — incrementing triggers dependent effects to re-run.
- `maskBuildStartedRef` — guards against building the mask more than once per mount.

SST and overlay effects both depend on `waterMaskVersion` and defer rendering if `waterMaskRef.current` is null.

---

## CHL and SeaColor data pipeline (Python → frontend)

### Retrieval

`DailyChlorophyllandSeaColorRetrieval.py` runs via GitHub Actions (`ChlorophyllandSeaColor.yml`). Fetches CMEMS `cmems_obs-oc_glo_bgc-plankton_nrt_l3-olci-300m_P1D` (Sentinel-3 OLCI, 300m) with `CMEMS_STRIDE = 4` (effective ~1.2km). Returns ~71,939 rows per day (all grid cells including cloud-covered nulls). Lon normalization: `lon - 360 if lon > 180 else lon` ensures lons are negative (-78.89 to -72.21). Coord range: `lat 33.7028–38.9972  lon -78.8861–-72.2139`.

**Quality gate (cloud-edge contamination):** After fetching, if `coverage_pct < 5.0 AND blue_water_fraction < 0.01`, the day is skipped and no file is written. This prevents writing files containing only cloud-edge noise with no real ocean signal.

### Bundler (`CHLSeaColorBundler.py`)

Runs after retrieval in the same workflow. Converts large sparse-row JSON files to compact flat-array bundles on the 0.02° fixed canonical grid (266 lats × 335 lons = 89,110 cells). Output in `SSTv2/Chlorophyll/Bundled/` and `SSTv2/SeaColor/Bundled/`.

**CHL native resolution:** ~0.011° (~71,939 rows, ~5MB raw). Bundle: ~450KB flat array (10× smaller).

**SeaColor native resolution:** ~0.1667° (~1,280 rows, ~87KB raw). Bundle: ~440KB flat array. **Do NOT flood-fill SC rows when binning** — `_bin_sc_rows` snaps each native row to the nearest 0.02° cell only. `expandCoarseGrid` in the frontend handles visual gap-filling for the coarse native grid. Prior flood-fill (±4 cells) was removed because it produced large-square rendering artifacts in the composite view.

**Composite:** `build_chl_composite()` / `build_sc_composite()` — newest-pixel-wins across `WINDOW_DAYS = 5` daily bundles. Writes both a canonical `chl_composite.json` and a dated snapshot `chl_composite_YYYY-MM-DD.json` each run. Dated snapshots kept for `COMPOSITE_KEEP_DAYS = 7` days then purged (canonical latest never deleted).

**Index files:** `chl_bundle_index.json` and `seacolor_bundle_index.json` include:
- `dates`: sorted list of available daily bundle dates
- `composite_dates`: sorted list of available dated composite snapshots
- `has_composite`, `composite_coverage_pct`

### Frontend loading

`fetchCHLBundle()` / `fetchSeaColorBundle()` (in `dataFetchers.js`): fetch the bundle index, then all daily bundle files in parallel. Falls back to legacy `fetchChlorophyll()` / `fetchSeaColor()` if the bundle index is unavailable. Propagates `composite_dates[]` from the index to SSTLive for the composite date navigator.

`fetchCHLComposite(dateStr?)` / `fetchSeaColorComposite(dateStr?)`: fetch `chl_composite_${dateStr}.json` if a dateStr is provided, else fall back to `chl_composite.json`. Returns `{ source, days: [day], is_composite: true }` where `day.builtDate` = `composite.generated` sliced to YYYY-MM-DD.

**Key variables in overlay `useEffect` (bundle path):**
- `day.grid` → array of `{lat, lon, chlorophyll}` or `{lat, lon, kd490}` objects (converted from flat array)
- `latSet2/lonSet2` → unique sorted lat/lon arrays from `day.grid` (the 0.02° canonical grid)
- `overlayGrid` → `{ "${lat}_${lon}": value }` keyed object
- `renderGrid` → result of `expandCoarseGrid(latSet2, lonSet2, overlayGrid, latSet, lonSet)` (on SST reference grid)

The rendering path through `expandCoarseGrid` → `gridToDataURL` is **identical** for both the legacy sparse-row format and the new flat-array bundle format. No changes to the rendering pipeline were needed.

---

## Auth and region access

The app uses Supabase for auth and subscriptions, not Base44 auth. Key files:
- `src/lib/supabase.js` — client singleton.
- `src/hooks/useAuth.js` — wraps Supabase session state.
- `src/hooks/useRegionAccess.js` — fetches `user_subscriptions`, creates free trial on first login.
- `src/components/auth/AuthGate.jsx` — shows login modal when no session; wraps children in `RegionAccessProvider`.

**Supabase tables:** `auth.users`, `public.user_subscriptions` (`user_id`, `tier`, `regions[]`, `trial_ends_at`), `public.regions`.

**Email confirmation redirect:** Supabase → Authentication → URL Configuration → Site URL must be `https://lintvetsstv2.base44.app`. If users get `localhost refused to connect` after clicking confirmation email, this setting was reset.

---

## Constants — must match across frontend, backend, ingest

```
NORTH = 39.00
SOUTH = 33.70
WEST  = -78.89
EAST  = -72.21
```

---

### 6. VIIRS hourly SST appears shifted ~50 miles west (non-uniform lonSet bug)

**Symptom:** VIIRS hourly SST overlay shows the Gulf Stream ~50 miles west of its actual location. Cloud Free (MUR) and HD Composite are correct. The shift appears on some hours but not others.

**Root cause:** `gridToDataURL` computed a canvas-wide average step:
```js
const lonStep = (lonEast - lonWest) / (lonSet.length - 1);
const lonFloat = (lon - lonWest) / lonStep;  // WRONG for non-uniform lonSet
const lonIdx0 = Math.floor(lonFloat);
```
This only works when `lonSet` is uniformly spaced. `heatmapData` in `SSTLive.jsx` builds `lonSet` as the distinct sorted longitudes with data (sparse, non-uniform). A VIIRS pass with coverage gaps (dense near coast → gap → dense offshore) has a non-uniform lonSet. The average step maps offshore lons to coastal bracket indices, rendering offshore data at the wrong (western) pixel positions. The canvas is then placed at the correct geographic bounds, so the net effect is a ~50 mile westward shift.

**Why some hours look correct:** Hours with dense uniform coverage have nearly-uniform lonSets, so average-step indexing is approximately right. Hours with a coast-gap-offshore structure (sparse, non-uniform) show the shift.

**Fix:** Replace average-step float-index with a cursor that walks `lonSet` in order as `px` increases:
```js
let lonCursor = 0;
for (let px = 0; px < CANVAS_W; px++) {
  const lon = lonWest + (px / (CANVAS_W - 1)) * lonRange;
  while (lonCursor < lonSet.length - 2 && lonSet[lonCursor + 1] <= lon) lonCursor++;
  const lonIdx0 = lonCursor;
  // gridLon0/gridLon1 are the actual bracket, guaranteed correct regardless of uniformity
}
```
Cursor advances monotonically (since lon increases left→right), O(n) per row, no average-step assumption. Same approach applied to `latCursor` for the lat dimension.

**Do not regress to average-step indexing.** The cursor approach is in commit `829d550`. Branch: `viirs-hourly-coord-investigation`.

---

### 7. VIIRS hourly solid-rectangle rendering artifacts (gapFillGrid on sparse grid)

**Symptom:** After the cursor fix (problem 6), large solid-color rectangles appear in the hourly overlay — orange/teal blocks in the sounds, over land, or over the shelf. These are NOT real data. Turning off bilinear interpolation does not change them.

**Root cause:** `gapFillGrid` (in `glSandwich.js`) is designed for the full canonical 266×335 uniform grid used by Cloud Free (MUR) and Composite. For hourly VIIRS it was being called with the sparse non-uniform `latSet`/`lonSet` from `heatmapData`. `gapFillGrid` builds a Cartesian product of those sparse arrays — e.g. 100 unique lats × 20 coastal lons = 2,000 cells. It BFS-floods from real data outward through the entire product grid. With `MAX_FILL_DIST=8` and `AXIS_D=22`, nearly the entire sparse Cartesian product qualifies as "inshore" or "within fill distance" and gets flood-filled with nearest-neighbor SST values. The result is a fully-filled rectangular grid at those sparse coordinates, which renders as solid-color blocks.

The GL rendering path calls `gapFillGrid` unconditionally for all SST sources when `useGl=true`:
```js
// WRONG — called for hourly VIIRS with sparse non-uniform latSet/lonSet:
const sstGrid = useGl ? gapFillGrid(latSet, lonSet, grid, mask, 1) : grid;
```

**Secondary fix (still valid):** The lat cursor in `gridToDataURL` also had an overshoot bug — descending latSet could advance past a gap and land on the next dense cluster, with `latFrac` clamped to 0 filling the gap region with the wrong bracket's data. The bracket-bounds check guards against this:
```js
if (lat > gridLat0 || lat < gridLat1) continue;  // overshoot guard
if (lon < gridLon0 || lon > gridLon1) continue;  // safety
```
Commit `cd6be6f`. This is correct to keep, but it was not the primary cause of the rectangles.

**Primary fix:** Skip `gapFillGrid` for hourly VIIRS. Pass the water mask directly to `gridToDataURL` instead:
```js
const isHourlyViirs = (dataSource === "VIIRS" || dataSource === "VIIRSSNPP");
const sstGrid = (useGl && !isHourlyViirs) ? gapFillGrid(latSet, lonSet, grid, mask, 1) : grid;
const sstIsOcean = (useGl && !isHourlyViirs) ? null : mask;
Promise.resolve(gridToDataURL(latSet, lonSet, sstGrid, ..., sstIsOcean, ...))
```
`gapFillGrid` continues to run for MUR (Cloud Free) and Composite, which use the full canonical grid. Commit `24503aa`.

**Attempted canonical grid approach (do not retry):** To restore inshore gap-fill for hourly, `bundleToDay` in `SSTLive.jsx` was modified to store `canonicalLatSet: [...bundle.latSet].reverse()` and `canonicalLonSet` (the full 266×335 fixed grid, north-first), and `heatmapData` was modified to return the canonical arrays for `dataSource === "VIIRS"`. The `!isHourlyViirs` guard was removed. Result: the full grid makes BFS correct (no more sparse Cartesian product), but `gapFillGrid`'s `inshore()` check treats Albemarle Sound and Pamlico Sound as enclosed water bodies (land on both sides within 22 cells) and floods them entirely from nearby ocean observations. Entire sounds rendered with ocean SST values — misleading and visually wrong. The canonical latSet/lonSet is kept in `bundleToDay` for potential future use, but the `!isHourlyViirs` guard on `gapFillGrid` is permanently retained.

---

### 8. CHL and Sea Color overlay edges are hard staircase walls

**Symptom:** At zoom levels 8–10, CHL and Sea Color overlays show very obvious rectangular block boundaries — hard opaque edges where the 4km satellite grid cells meet cloud/no-data areas. SST hourly looks much smoother by comparison.

**Root cause (resolution):** CHL and Sea Color (Kd490) are 4km L3 daily products — native grid spacing ~0.04°. VIIRS hourly SST is 0.75km stored at 0.02°. The 4km cells are simply larger and more visually obvious at higher zoom.

**Root cause (rendering):** The overlay `useEffect` was calling `solidify(dataURL)` unconditionally for all overlay types (CHL, Sea Color, Composite). `solidify` converts every pixel with alpha > 0 to alpha = 255 — it eliminates the partial-alpha wsum-based fade that `gridToDataURL` produces at data boundaries. This created a hard opaque staircase at every 4km cell edge rather than a natural gradient.

**Fix:** Replace `solidify` with `blurOverlay` for CHL and Sea Color:
```js
const isSoftOverlay = activeDataLayer === "chlorophyll" || activeDataLayer === "seacolor";
const imgUrl = isSoftOverlay ? await blurOverlay(dataURL, 4) : await solidify(dataURL);
```
`blurOverlay(blobUrl, radius)` is exported from `glSandwich.js`. It draws the image with `ctx.filter = 'blur(Npx)'` before `toBlob`. The underlying wsum-based alpha at cell boundaries stays soft (not solidified), and the blur feathers those boundaries visually.

Composite overlay keeps `solidify` — it has full-region coverage and needs crisp land-edge clipping where `gapFillGrid` fills land-adjacent cells.

**Source data note:** We verified the data is NOT being artificially downsampled. ERDDAP sources are fetched with `STRIDE=1` (native grid). CMEMS CHL is fetched at 300m with `CMEMS_STRIDE=4` (~1.2km effective). Kd490 (Sea Color) has no higher-resolution source for the Mid-Atlantic Bight — 4km multi-sensor is the best available. The 4km block size at high zoom is inherent to the satellite product.

---

### 9. Altimetry (SLA) — contour lines + raster color overlay

**Layer:** `activeDataLayer === "altimetry"` renders SLA (sea level anomaly) as both a raster color overlay **and** contour polylines on top.

**Data source:** `altimetry_latest_grid.json` from SSTv2 `DailySST/Altimetry/`. Shape: `{lats, lons, sla}` where `sla[i][j]` is the SLA value at `(lats[i], lons[j])`. Grid is CMEMS 0.125° resolution, 42 lat points (33.8125–38.9375°N), native grid centroids (not bbox edges).

**Raster rendering:** The overlay `useEffect` altimetry branch calls `gridToDataURL` with `colorFn = slaColor` and `ocMask = altimetryDeepMask` (clipped to open-ocean areas from `/openocean_mask.json`). Result is placed as a Leaflet `imageOverlay` (not GL). The `onSlaRange` callback is called with the auto-scaled p5/p95 percentile range to drive the legend.

**Raster color scheme (`SLA_STOPS`):** Rainbow ramp — deep blue → cyan → green → yellow → orange → deep red:
```js
[0.0,  [  0,   0, 200]]  // strong negative — deep blue
[0.2,  [  0, 190, 255]]  // moderate negative — cyan
[0.4,  [  0, 210, 120]]  // slight negative — cyan-green
[0.5,  [ 40, 200,  40]]  // zero anomaly — green
[0.6,  [230, 230,   0]]  // slight positive — yellow
[0.8,  [255, 110,   0]]  // moderate positive — orange
[1.0,  [200,   0,   0]]  // strong positive — deep red
```
`SLA_GRADIENT` in `SSTLive.jsx` must always use the same stops as `SLA_STOPS` so the legend bar matches the map.

**Contour lines:** `marchingSquares` + `buildField` draws contour polylines on top of the raster at 0.05m intervals. Contour color scheme: negative → blue (`#0018b0` to `#5090f0`), zero ± 0.025m → dark gray with white glow, positive → red (`#e87040` to `#a00000`).

**GL path exclusion:** `useGl` in the overlay effect is forced `false` for altimetry (`activeDataLayer !== "altimetry"`). Altimetry must always use the Leaflet `imageOverlay` path — never the GL raster source — because `solidify` and the GL sandwich ordering don't apply to the diverging SLA palette.

**GL bleed-through prevention:** When switching to altimetry, `removeSstImage(glLayerRef.current)` is called immediately after computing `useGl`. This clears any image previously placed in the `sst-img` GL raster source (from SST, CHL, or composite) so it doesn't show through beneath the altimetry `imageOverlay`.

**`gridToDataURL` gap threshold:** The lat/lon bracket gap check uses `> 0.2` (not the original `> 0.12`). The CMEMS altimetry grid step is exactly 0.125° — with the old `> 0.12` threshold every adjacent bracket pair exceeded the limit and the entire canvas remained transparent. The `> 0.2` threshold clears the 0.125° step while still catching VIIRS inter-cluster gaps (≥ 0.3°).

**No `expandCoarseGrid` needed:** Altimetry is passed to `gridToDataURL` directly on its native CMEMS grid — the 0.125° resolution is coarser than SST but uniform, so bilinear interpolation handles it correctly without pre-expansion.

**Mobile ALT icon:** `onClick` must call both `setMobilePanel("altimetry")` and `setActiveDataLayer("altimetry")`. Setting only `mobilePanel` leaves the active data layer unchanged and no data renders.

**leaflet-velocity currents:** `_build_velocity_json` in `fetch_ocean_dynamics.py` must include `"parameterCategory": 2` in both U and V headers, or leaflet-velocity won't recognize the components and will show "no data."

---

## Bathymetry / Static Layers (`StaticLayersRetrieval.py`)

### Data source
Depth contours come from the **NCEI Coastal Relief Model 2023 (CRM)** via OPeNDAP/netCDF4 at ~450m effective resolution (`_CRM_STRIDE = 15` arc-seconds). CRM is a 1 arc-second NOAA hydrographic survey dataset. It replaced the previous GEBCO/ERDDAP source in July 2026 — GEBCO produced a hairpin spike artifact in the 200-fathom contour near Cape Hatteras that CRM does not.

The previous source was GEBCO via NCEI ERDDAP with a `BATHY_SOURCES` fallback chain (GEBCO_2023 → GEBCO_2020 → ETOPO). Do not reintroduce ERDDAP/GEBCO for bathymetry.

**Key constants in `StaticLayersRetrieval.py`:**
```python
_CRM_BASE    = "https://www.ngdc.noaa.gov/thredds/dodsC/crm/cudem/"
_CRM_STRIDE  = 15   # 1 arc-sec × 15 = ~450 m effective resolution
_CRM_VOLUMES = [
    ("crm_vol1_2023.nc", 39.0, 46.0, -77.0, -65.0),  # NE Atlantic
    ("crm_vol2_2023.nc", 32.0, 39.0, -83.0, -68.0),  # SE Atlantic
    ("crm_vol3_2023.nc", 24.0, 32.0, -84.0, -76.0),  # FL / E Gulf
]
CONTOUR_DEPTHS_FT = [60, 120, 180, 300, 600, 1200, 1800, 3000, 6000]
SHELF_BREAK_FT    = 1200   # 200 fathoms — used for UI shelf break styling
```

**Controlling depth level detail:** `CONTOUR_DEPTHS_FT` is the complete list of contour depths generated. Add or remove values to change which contour lines appear on the map. Finer spacing at shallow depths (e.g. adding 30 ft, 90 ft) increases nearshore detail at the cost of more contour segments. After changing this list, delete the committed `bathymetry_contours*.json` files from the repo to force regeneration on the next workflow run.

**`SHELF_BREAK_FT`:** Marks the 200-fathom (1,200 ft) contour as the shelf break. The frontend uses this value for special styling (thicker or differently colored line) to highlight the shelf break edge.

### Workflow (`Static layers.yml`) — key requirements

- **`fetch-depth: 0`** (not `fetch-depth: 1`). A shallow clone causes "add/add" merge conflicts when the bot tries to push back because git cannot find the common ancestor. This was the root cause of the first failed CRM workflow run.
- **Cache-clear step:** `rm -f DailySST/bathymetry*.json DailySST/bathymetry_contours*.json DailySST/bathymetry_grid*.json` before running the script. Without this, the cached JSON files committed to the repo will always hit the `os.path.exists()` cache check and the script exits without fetching new data.
- **`git push origin HEAD`** (not `git pull --rebase`). The bot is the only committer on this branch; no rebase is needed.
- **Timeout: 120 minutes** — CRM OPeNDAP fetches can be slow over the public THREDDS server.
- **Two regions:** `python StaticLayersRetrieval.py` (mid_atlantic, default) and `REGION=ga_sc python StaticLayersRetrieval.py`.

### Branch status (as of July 2026)

`main` in `jlintvet/SSTv2` uses NCEI CRM 2023 via OPeNDAP (`StaticLayersRetrieval.py`). Hatteras contours confirmed clean. The `bathy-crm` and `Display-Test` branches have been deleted.

### Output files
- `bathymetry_contours.json` — GeoJSON LineStrings with `depth_ft` + `depth_fathoms` properties, Chaikin-smoothed
- `bathymetry_grid.json` — raw 2D depth grid for feature detection algorithms

---

## Shaded Relief (`BathyTileGenerator.py`) — Pro raster bathymetry

**Not the same feature as "Bathymetry" above.** "Bathymetry" (`showBathyLayer`, free) draws vector depth-contour lines from `bathymetry_contours.json`. **"Shaded Relief"** (`showBathyRaster`, Pro-gated) is a full-color raster tile overlay — a separate pipeline, separate hosting (S3/CloudFront, not the `SSTv2` GitHub repo), and a separate Leaflet layer entirely.

### Backend pipeline (`BathyTileGenerator.py`)

Runs standalone (not part of the daily SST/CHL workflows) — manually dispatched via `.github/workflows/bathy-tiles.yml`. Tiles are static imagery with no daily data to refresh, so this only needs to be re-run when the color ramp changes, the CRM source data updates, or a new region is added.

Pipeline, one region at a time (`process_region()`):
1. **Fetch** — `fetch_crm_region()` pulls elevation from NCEI CRM 2023 via OPeNDAP (same `CRM_VOLUMES` source and bounding boxes as `StaticLayersRetrieval.py`'s contour pipeline — three volumes: NE Atlantic / SE Atlantic / FL–E Gulf). Fetched in `LAT_CHUNK_DEG = 0.25`° lat chunks — the OPeNDAP server times out above ~5M cells, and a full `mid_atlantic` region at stride 2 is ~115M cells. Each chunk retries up to 3× with backoff.
   - `CRM_STRIDE` (env var, default `2` = ~60m; workflow default input is `1` = ~30m/max detail; `3` = ~90m for fast test runs).
   - Post-fetch: `_fill_ocean_gaps` (4-connected neighbor averaging, up to 5 passes — fixes checkerboard artifacts from CRM volume misalignment), then `_smooth_elevation` (Gaussian, `sigma=2.2` — softens blocky source-resolution artifacts).
   - `_fill_offshore_nodata` exists but is **disabled** — offshore NODATA is deliberately left transparent so the GL basemap shows through at the continental-shelf-edge data boundary, instead of being painted with a flat deep-water fallback color.
2. **VRT** — `write_vrt()` writes the elevation grid as raw float32 binary + a GDAL VRT sidecar (avoids needing GDAL's Python bindings — only the CLI tools are used).
3. **Hillshade + color-relief** (`gdaldem`) — `generate_hillshade` (`-z 2 -az 315 -alt 45`, light from NW) and `generate_color_relief` using the `COLOR_RAMP` nautical-chart palette (warm sand shallows → aqua shelf → mid blue → dark navy deep, **not black** — color stops keyed by elevation in meters, see the script).
4. **Blend + mask** (`blend_and_mask()`) — multiplies hillshade onto color-relief (`0.42 + hillshade*0.58` soft-multiply floor so shadows go near-black without crushing to pure black), then alpha-masks: ocean (`elev < 0`) → opaque, land → transparent. Processed in `STRIP_H = 500`-row strips to cap working memory (~250MB) since a full-resolution float32 array can exceed 7GB at stride 1.
5. **Tiling** (`gdal2tiles`) — `-z 5-11 -r lanczos --xyz` (standard XYZ tile scheme, matches Leaflet's default).
6. **Upload** — pushes every tile to `s3://sst-bathy-tiles/bathy/{region}/{z}/{x}/{y}.png` with `Cache-Control: max-age=86400`, then submits a CloudFront invalidation for `/bathy/{region}/*` if `CLOUDFRONT_DISTRIBUTION_ID` is set (GitHub secret). Without that secret, tiles are just cached for up to 24h with no invalidation.

CloudFront domain: `https://d3qy1jhzqojgwx.cloudfront.net`. Tile URL pattern: `/bathy/{region}/{z}/{x}/{y}.png`.

Regions (`REGION_CONFIGS`): `mid_atlantic` (33.70–39.00N, -78.89 to -72.21) and `ga_sc` (29.80–35.20N, -82.00 to -75.20) — identical bounding boxes to the contour pipeline's `_REGION_CONFIGS`.

### Workflow (`bathy-tiles.yml`)

- **Manual trigger only** (`workflow_dispatch`) — inputs `region` (`all` / `mid_atlantic` / `ga_sc`) and `crm_stride` (`1`/`2`/`3`). Not scheduled; tiles don't need daily regeneration.
- 240-minute timeout — OPeNDAP fetch + GDAL tiling at stride 1 for the full region can be slow.
- Installs `gdal-bin` via apt, plus `netCDF4 numpy Pillow boto3 scipy` via pip (scipy enables gap-fill/smoothing — the script degrades gracefully without it, just skips those steps and logs a warning).
- Requires `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets (S3 upload) and optionally `CLOUDFRONT_DISTRIBUTION_ID` (cache invalidation). AWS region `us-east-2`.
- `permissions: contents: read` — output goes to S3, not git, so there's no repo write-back step (unlike the daily SST/CHL/bathymetry-contour workflows).

### Frontend integration (`SSTHeatmapLeaflet.jsx`)

- **`BATHY_TILE_URL`** is built per-region in `SSTLive.jsx`: `` `https://d3qy1jhzqojgwx.cloudfront.net/bathy/${BATHY_TILE_REGION}/{z}/{x}/{y}.png?v=2` `` where `BATHY_TILE_REGION` is `regionConfig.dataPathSuffix || "mid_atlantic"` (GA/SC regions get `"ga_sc"`, everyone else falls back to `"mid_atlantic"`). The `?v=2` cache-bust was added to force mobile browsers to drop indefinitely-cached stale tiles from before the backend started setting `max-age=86400` on upload — bump this suffix again if a future re-render needs to bypass long-lived mobile caches.
- **State:** `showBathyRaster` (`useState(false)`, default off).
- **Pane:** `bathyTilePane`, created at map-init with `zIndex: 362` — above `sstDataPane` (350, non-GL SST/CHL raster) but below `bathyPane` (375, contour lines) and `overlayPane` (400, wind/currents). See the pane-stacking comment above the `map.createPane` calls in the map-init effect.
- **Tile layer `useEffect`** (deps: `mapReady`, `showBathyRaster`, `BATHY_TILE_URL`): tears down and recreates `bathyTileRef` on every toggle. `minZoom: 5, maxNativeZoom: 11, maxZoom: 18, opacity: 1` — Leaflet upscales past the native zoom-11 tiles instead of going blank at higher zoom. `interactive: false`, no attribution string.
- **Gating other layers:** when `showBathyRaster` is true it must fully replace SST/CHL/composite/seacolor rendering, not just sit on top of it. Both the SST `useEffect` and the overlay (CHL/composite/seacolor/altimetry) `useEffect` check `if (showBathyRaster || showRadarOverlay) { ...cleanup...; return; }` **before** their normal render path, clearing the GL layer / active `imageOverlay` first. Toggling `showBathyRaster` back off restores whatever `activeDataLayer` was already selected. See debug checklist item 18 below if the old layer bleeds through underneath.
- **Auto-disable on source select:** every source `onClick` in `MapControlPanel.jsx` (SST, Cloud Free, Hourly, HD Composite, Chlorophyll, Sea Color, Altimetry, Wind) calls `setShowBathyRaster(false); setShowRadarOverlay(false)`. This ensures selecting a source while Shaded Relief or Radar is active immediately dismisses it and renders the chosen data — no manual toggle-off required. Commit `fbc1612` (Shaded Relief), extended for Radar in `2b98d2d`.
- **Mutually exclusive with Radar** (see the Radar section below) — both are full basemap-replace Tools sharing the same `radarPane`/`bathyTilePane` z-level (362). Turning one on turns the other off, in both directions.

### Control panel UI

- **Desktop:** `MapControlPanel.jsx`, Tools section — Pro-gated (`ProGate`) `ToolBtn` labeled "Shaded Relief", `color="cyan"` (matches the standardized ToolBtn active color — not a distinct per-button color). Sits above the "Plan Trip" button. Help button (`hbtn("shadedrelief")`) alongside it.
- **Mobile:** in the mobile Tools drawer (`mobilePanel === "tools"`), paired in a 2-column grid with the "Bathymetry" button. `MobileProGate` wraps it; active state `bg-cyan-700`.
- **Help config:** `HELP_CONFIG.shadedrelief` — title "Shaded Relief", reuses the `/help/bathy.png` image (no dedicated image file), text explains the nautical color gradient + topographic shading vs. plain contour lines.
- **Both desktop and mobile buttons are Pro-gated** — free users see the dimmed button + upgrade prompt (`ProGate` / `MobileProGate`), same pattern as other Pro tools.

### History

- Introduced as a Pro overlay separated from the free contour "Bathymetry" toggle; tile zoom fixed (`maxNativeZoom` / `maxZoom` split so tiles upscale past zoom 11 instead of blanking).
- Opacity tuned from `0.85` to `1` (relief looked washed out at 0.85 against the basemap).
- Moved from the Overlays section to the Tools section in the control panel (both desktop and mobile) so it sits with other Pro rendering-mode toggles rather than additive overlays.
- `?v=2` cache-bust suffix added to `BATHY_TILE_URL` to clear indefinitely-cached stale tiles on mobile browsers, once the backend started sending a 24h `Cache-Control` header on upload.

---

## Radar (RainViewer) — Pro live weather overlay

Live Doppler radar. Same full-basemap-replace pattern as Shaded Relief above (they're mutually exclusive with each other), but the data comes from a live third-party API at request time — there is no backend pipeline, no `SSTv2`/S3 hosting, and no daily/hourly workflow. Free public API, no key required, global coverage — see `https://api.rainviewer.com/public/weather-maps.json`.

### Data source

RainViewer's `weather-maps.json` returns `host` + a `radar.past` array of ~13 frames covering the last 2 hours at a **fixed 10-minute interval** (confirmed against the live endpoint — not a request parameter, RainViewer's own radar mosaic only refreshes that often). A `nowcast` key exists in the schema but is empty on the public endpoint — no forecast/extrapolation frames are available through this API. Tile URL: `{host}{frame.path}/256/{z}/{x}/{y}/2/1_1.png` (`2` = RainViewer's only public color scheme, "Universal Blue" — blue for light/moderate rain, yellow→red for heavy; there is no alternate scheme to request). Max native zoom is 7 — tiles upscale (and look blocky) beyond that, softened client-side with a `blur(1.2px)` CSS filter on the whole pane.

### Frontend integration (`SSTHeatmapLeaflet.jsx`)

- **State:** `showRadarOverlay` (`useState(false)`), `radarFrames` (the fetched frame array), `radarFrameIndex`, `radarHost`, `radarPlaying`.
- **Pane:** `radarPane`, `zIndex: 362` — same level as `bathyTilePane` (they never render simultaneously). `style.filter = "blur(1.2px)"` set at creation.
- **Frame-list fetch `useEffect`** (deps: `showRadarOverlay`): fetches `weather-maps.json` on toggle-on, re-fetches every 10 minutes while active (matches RainViewer's refresh cadence). No region gating — available everywhere.
- **Tile-render `useEffect`** (deps: `mapReady`, `showRadarOverlay`, `radarHost`, `radarFrames`, `radarFrameIndex`): **crossfades** between frames instead of swapping instantly. The incoming `L.tileLayer` fades in (opacity 0 → 0.85) while the outgoing one fades out (→ 0) over 350ms, via a CSS `transition` set directly on each layer's `getContainer()` div (Leaflet's `setOpacity()` just writes `container.style.opacity` — the transition is what makes it animate). The opacity change is deferred one `requestAnimationFrame` after the transition property is set, otherwise the browser skips straight to the end state. Fast scrubbing snaps any still-fading layer out immediately via `radarFadeOutRef`/`radarFadeTimerRef` rather than letting tile layers pile up. This only smooths the *visual transition* between two real 10-minute frames — it does not add real intermediate data.
- **`RadarTimeSlider.jsx`** (new component, mirrors `WindTimeSlider.jsx`): play/pause + scrub bar rendered at the bottom of the map when `showRadarOverlay && radarFrames.length`. Stacks above the wind time slider if both happen to be active (`bottomOffset` prop). The native `<input type=range>` track needs explicit CSS (`.radar-range-slider` class, defined inline via a `<style>` tag in the component) — the unstyled default track is nearly invisible against the dark bar.
- **Gating other layers / auto-disable on source select:** identical mechanism to Shaded Relief — see that section above (`showBathyRaster || showRadarOverlay` bail-out, `setShowRadarOverlay(false)` in every source `onClick`).

### Control panel UI

- **Desktop only** (no mobile radar UI yet). `MapControlPanel.jsx`, Tools section — Pro-gated (`ProGate`) `ToolBtn` labeled "Radar", sits directly below "Shaded Relief". Help button (`hbtn("radar")`) alongside it.
- **Help config:** `HELP_CONFIG.radar` reuses no dedicated image (`/help/radar.png` doesn't exist — 404s silently, text-only popup).

### History / open items

- Started as a Mid-Atlantic-only proof of concept on branch `radar-overlay-poc`, shipped as an Overlays-section additive tint (0.65 opacity over SST) — replaced after Jon's feedback that tinting over SST data was unreadable. Moved to Tools as a full basemap-replace mode instead (`1dd1b30`).
- Region gate dropped and Pro-gating added together in `2b98d2d`, once the pattern was confirmed working.
- **Color scheme is a known limitation, deliberately left as-is (2026-07-13):** RainViewer's public API only offers "Universal Blue," which some users may read as snow/ice at light-to-moderate rain intensities. Switching to NOAA MRMS (nowCOAST) would fix this at the source (native NWS green/yellow/red convention, ~4min refresh instead of 10min) but requires moving from simple XYZ tiles to a WMS layer and building frame history manually (no equivalent to RainViewer's `weather-maps.json`). Not pursued yet — revisit if user confusion comes up in practice.
- **No forecast/nowcast** — not available from RainViewer's public API or from NOAA publicly. Not building a home-grown motion-vector nowcast; the existing NOAA marine-forecast text panel covers "what's coming."

---

## Wrecks / Bottom Features (`DailySST/wrecks.json`)

### Source
`DailySST/wrecks.json` is a **static GeoJSON FeatureCollection** (270 features as of July 2026) committed directly to `jlintvet/SSTv2`. It is the authoritative source — do not regenerate or overwrite it from any script.

Previous versions were generated from GPX files via `StaticLayersRetrieval.py` using fishingstatus.com data. Those GPX files no longer exist; all fishingstatus.com/GPX references have been removed from the file.

### Adding or editing features
Edit `DailySST/wrecks.json` directly. Each feature follows this structure:
```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "properties": {
    "name": "Feature Name",
    "symbol": "Rocks",
    "region": "HatterasNC",
    "depth_ft": 90,
    "year_sunk": 1943
  }
}
```

**Required properties:** `name`, `symbol` (`"Wreck"` or `"Rocks"`), `region`
**Optional properties:** `depth_ft` (number), `year_sunk` (number) — both shown in the hover popup if present

**Valid `region` values** (used for per-departure-location filtering and popup display):
- `"HatterasNC"` → "Hatteras, NC"
- `"MoreheadNC"` → "Morehead City, NC"
- `"ChesapeakeMD"` → "Chesapeake, MD"
- `"OceanCityMD"` → "Ocean City, MD"

### Frontend fetch
URL: `https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/wrecks.json`
Fetched once on first toggle of the Bottom Features tool (`showWrecks`). Filtered to `regionBounds` and by `loc.wreckRegion` (from the selected departure location).

### `_build_grid` — elevation-sign land mask + morphological opening

`_build_grid` uses two masking steps before gap-fill, both derived from the CRM data itself (no external polygon downloads). CRM uses the same sign convention as GEBCO: negative elevation = ocean depth, positive = above sea level (land).

**Step 1 — Elevation-sign land mask (`land[]` array)**

CRM rows with `depth_ft = None` (elevation ≥ 0) are land. A `land[i] = True` boolean array is built directly from the rows. These cells are permanently NaN and never touched by gap-fill. This replaces the previous NE 10m ocean polygon approach, which timed out (45+ min) because the Atlantic Ocean polygon has ~50K vertices and the PiP test is O(n_cells × n_vertices).

**Step 2 — Morphological opening (`_morphological_open_ocean`)**

GEBCO assigns real negative elevation to enclosed coastal water bodies (Bogue Sound, White Oak River, Pamlico Sound, etc.), so the GEBCO-sign mask alone passes them as ocean and `contourpy` draws contours there.

`_morphological_open_ocean` erodes the ocean mask by `radius=6` cells (~2.7 km at 450m resolution), then dilates back by the same amount. Any water body narrower than ~5.4 km is removed in the erode phase and not restored by dilation. The open ocean (large connected region) is fully restored. Uses BFS: O(n_cells), completes in < 1 second.

**Correct `_build_grid` order (enforced in code):**
1. Load GEBCO depths — land cells are NaN, sounds/bays also have depth values
2. Build `land[]` from GEBCO sign — pins land cells permanently
3. Run `_morphological_open_ocean(land, radius=6)` — identifies open ocean, excludes sounds/bays
4. Pin all non-open-ocean cells to NaN (land + enclosed waters)
5. 6-iteration gap-fill — only fills open-ocean data voids
6. `contourpy` traces contours — sees only confirmed open-ocean cells

**Do not revert this order.** The symptom of wrong order: depth contour lines over peninsulas, barrier islands, or mainland (Cedar Point NC, Emerald Isle), or contours inside sounds (Bogue Sound, White Oak River). The source data is correct — the bug is purely in masking order.

### Why the old NE 10m polygon approach was abandoned
1. **Performance:** The Atlantic Ocean NE polygon has ~50K vertices. `_point_in_ring` is O(n_vertices) per cell. 2M grid cells × 50K = ~100B comparisons in pure Python — 45+ minute hang.
2. **Bbox intersection bug:** The Atlantic polygon contains the entire region bbox but has no vertices inside the bbox. `_ring_intersects_bbox` (vertex-in-bbox check) returned False for it, so `ne_ocean.json` cached 0 rings and masking was silently skipped.
3. **Sounds not excluded:** NE ocean polygons include Bogue Sound and Pamlico Sound as ocean, so they passed the mask and still got contours.

The elevation-sign + morphological opening approach solves all three problems without external data. It works identically with CRM and with the previous GEBCO source — both use the same sign convention for land vs. ocean.

---

## If rendering breaks, check in this order

1. **CHL shifted west** → check that `expandCoarseGrid` is called for the chlorophyll branch and result passed with `latSet/lonSet` to `gridToDataURL` (problem 5). Both CHL and SeaColor should use this pattern.
2. **SeaColor shifted** → same as above — check `expandCoarseGrid` is being called for sea color branch (problem 4).
3. **SST or any layer shifts north/south** → check Mercator math is still in `gridToDataURL` (problem 2).
4. **CHL overlay blank / no data** → check `day.stats` exists; `min2=day.stats.min` will throw if stats is missing. Also check `expandCoarseGrid` result isn't empty (all nulls from full cloud cover).
5. **Mask not applying** → check `waterMaskRef.current` is not null before calling `gridToDataURL`.
6. **SeaColor composite shows large squares** → `_bin_sc_rows` in `CHLSeaColorBundler.py` must NOT flood-fill. Each native row bins to its nearest 0.02° cell only. If flood-fill (SPREAD loop) is re-added, double-expansion with `expandCoarseGrid` produces large-square artifacts. Regenerate bundle files after fixing the bundler.
7. **Hourly VIIRS shows solid-color rectangles** → check that `gapFillGrid` is NOT being called for `dataSource === "VIIRS"` or `"VIIRSSNPP"`. `gapFillGrid` requires the full canonical 266×335 grid; calling it on the sparse hourly lonSet×latSet floods the entire Cartesian product (problem 7). Also confirm bracket bounds check (`lat > gridLat0 || lat < gridLat1`) is present in `gridToDataURL` cursor loop. **Do not remove the `!isHourlyViirs` guard even if passing canonical latSet/lonSet** — `gapFillGrid`'s `inshore()` check floods Albemarle/Pamlico Sounds from nearby ocean data.
8. **Hourly VIIRS SST shifted west** → check that `gridToDataURL` uses cursor-based bracket finding (not average-step `lonFloat = (lon - lonWest) / lonStep`). See problem 6. Do not revert to average-step indexing.
9. **CHL or Sea Color overlay has hard staircase edges** → confirm overlay `useEffect` is calling `blurOverlay(dataURL, 4)` for CHL/SeaColor (not `solidify`). See problem 8. If `solidify` is restored for these layers, the wsum edge fade is negated and hard rectangular block walls return.
10. **Altimetry raster is all transparent (blank canvas)** → the `gridToDataURL` lat/lon bracket gap check threshold is too tight. CMEMS altimetry grid step is exactly 0.125°. The threshold must be `> 0.2` — if it is `> 0.12` (the original default), every adjacent bracket pair exceeds the limit and the entire canvas stays transparent. Do not lower the threshold below 0.2.
11. **Previous layer bleeds through beneath altimetry overlay** → confirm `removeSstImage(glLayerRef.current)` is called in the overlay effect immediately after computing `useGl` when `activeDataLayer === "altimetry"`. If missing, SST/CHL/composite data in the `sst-img` GL raster source remains visible underneath the Leaflet imageOverlay.
12. **Altimetry legend bar colors don't match the map** → `SLA_GRADIENT` in `SSTLive.jsx` and `SLA_STOPS` in `SSTHeatmapLeaflet.jsx` must use the same color stops. Update both together whenever the color scheme changes.
13. **Depth contours appear over land / peninsulas** → the elevation-sign land mask or morphological opening in `_build_grid` has been removed or reordered. Both must run before gap-fill. See Bathymetry section above. Delete `bathymetry_contours.json` and `bathymetry_contours_ga_sc.json` from the repo to force regeneration on next workflow run.
14. **Depth contours appear inside sounds / bays (Bogue Sound, White Oak River, etc.)** → `_morphological_open_ocean` has been removed or the radius reduced below ~4. CRM (like GEBCO) assigns real depth to enclosed water bodies, so the elevation-sign land mask alone is insufficient — morphological opening is required to exclude narrow water bodies. Radius=6 (~2.7 km) is the tuned value; lowering it below 4 may let sounds through, raising it above 8 may clip the nearshore 10-fathom contour.
15. **200-fathom contour has a hairpin spike near Cape Hatteras** → this was the root cause of the GEBCO → CRM migration. Do not revert to the GEBCO/ERDDAP source. If the spike reappears on CRM data, it is likely a CRM data artifact in that volume — try increasing `_CRM_STRIDE` slightly (e.g. 20) to smooth past the anomalous cell.
16. **Users get localhost error on email confirmation** → fix Supabase Site URL.
17. **Users land on upgrade screen after login** → check `user_subscriptions` table — row may not exist.
18. **Shaded relief or radar toggled on but SST/CHL still renders underneath** → the `showBathyRaster || showRadarOverlay` early-return in the SST or overlay `useEffect` is missing or mis-ordered. Both effects must check `if (showBathyRaster || showRadarOverlay) { /* cleanup + return */ }` before the main render path. Without it, the previous overlay lingers below the shaded relief/radar tile layer. **Also:** if either is active and the user selects a source and the source data doesn't appear, verify `setShowBathyRaster(false); setShowRadarOverlay(false)` is present in all 8 source `onClick` handlers in `MapControlPanel.jsx` — this was the original defect path (commit `fbc1612`, extended to radar in `2b98d2d`).
19. **Grey strip at north on CHL/composite/seacolor (especially portrait mobile)** → `setMaxBounds` in the overlay `.then()` or in the post-sstReady / vv-resize refit is using `llBounds` (region bounds, north=39.5°N) instead of actual data bounds. `dataBoundsRef.current` must be set to `{south, west, north, east}` from `gridToDataURL`'s result in every overlay `.then()` and in the SST `.then()`, and both refits must use `_db = dataBoundsRef.current` for `setMaxBounds`. See `docs/map_viewport_nuances.md` sections 5–6 for full pattern and commit b270a27.
20. **Tab freezes for 20+ seconds on load** → `gridToDataURL` was called without an `AbortSignal`, or the calling effect is not aborting the controller on cleanup. Stale invocations pile up MessageChannel tasks. Ensure every call passes `_ac.signal` and `return () => _ac.abort()` is in the effect cleanup. See the `gridToDataURL` section above.
21. **Radar tiles pile up / flicker during fast slider scrubbing** → `radarFadeOutRef`/`radarFadeTimerRef` aren't clearing a still-fading layer before a new frame change starts. Each run of the tile-render effect must snap out any in-flight fade immediately (not wait for its timeout) before starting a new crossfade. See the Radar section above.

---

## Mobile vs Desktop display architecture

### Desktop (`sm:` breakpoint and above)

- **Map** fills the full viewport. `SSTLive.jsx` renders `<SSTHeatmapLeaflet>` with `className="flex-1"`.
- **Control panel** — `MapControlPanel.jsx` — is an absolutely-positioned overlay at top-right of the map (`right:8, top:8, width:160px, zIndex:500`). Desktop-only: hidden with `hidden sm:flex` on the panel div.
- **Map header** (top-left strip) contains the layer legend, mode badges, and collapse button for the control panel.
- All buttons in MapControlPanel are `LayerBtn` or `ToolBtn` components (11px font, rounded-lg, border, padding). Each button is wrapped in a `flex gap-1 items-stretch` div that also contains a `?` help button.

### Mobile (below `sm:` breakpoint)

- **Map** fills the full viewport minus a fixed bottom toolbar.
- **Bottom toolbar** is a horizontal strip of icon buttons at the bottom of the screen. Tapping a button opens its sub-panel (slides up from the bottom inside `SSTHeatmapLeaflet.jsx`).
- Mobile sub-panels (`mobilePanel` state) handle: SST source/date selection, Chlorophyll dates, Loran grid, Bottom Features, GPS, Wind Overlay, Currents, Plan Trip, Altimetry, etc.
- Mobile VIIRS DateNav uses `activeViirsDay` — computed locally inside `SSTHeatmapLeaflet.jsx` as `viirsData?.days?.[viirsDateIndex] ?? null`. Do NOT rely on a prop named `activeViirsDay` — it is not threaded from `SSTLive.jsx`.
- **Loran help popup** on mobile uses `ReactDOM.createPortal` into `document.body` (centered modal), same pattern as desktop unified help modal.

### Mobile map shows grey bar at top on initial load (north overflow)

**Symptom:** On iOS Safari, initial page load shows the map panned too far north — a grey strip with no SST data is visible above the data boundary (~39°N). As soon as the user switches to a different SST source, the view corrects itself.

**Root cause:** `applyFillZoom` fires ~33ms after map creation (double `requestAnimationFrame`). At that moment the CSS layout may not have settled yet — `map.getSize().y` can return `0`. The `vpH` fallback (visual viewport height) is larger than the actual map container height, so `calcFillZoom` computes a slightly low zoom. The while-loop bounds guard corrects for the region bounds `± 0.05°` but this tolerance is too loose to catch the rendered overflow on a real device.

**Why switching sources "fixes" it:** The SST overlay `.then()` callback calls `map.setMaxBounds(...)` and `map.setMinZoom(newFillZoom)`. Leaflet's `setMaxBounds` internally calls `_panInsideMaxBounds()` immediately when the map is already loaded, snapping the view inside bounds. `setMinZoom` calls `setZoom(getZoom())` internally when `newZoom > currentZoom`, forcing a re-render. Both run on every source switch — so the view always corrects after loading.

**Fix:** A one-time `useEffect([sstReady, mapReady])` fires 150ms after the first layer renders (`sstReady` becomes `true`). **`sstReady` must be set by ALL layer paths** — both the SST imageOverlay `.then()` and the overlay layer `.then()` (composite / CHL / seacolor / altimetry). If only the SST path sets it, users with composite saved in localStorage will never trigger the refit. By that point the DOM layout is fully settled. It performs a full refit: `invalidateSize()` → `calcFillZoom` with correct container height → `setView(mercCenter, fz)` → while-loop bounds guard (tolerance 0.02°) → `setMinZoom` → `setMaxBounds`. Guarded by `userInteractedRef.current` so it never resets a panned user.

**`setMaxBounds` in the refit MUST use `dataBoundsRef.current`** (the actual loaded data bounds), not `llBounds` (region bounds). `llBounds` has `north=39.5°N` — using it here overrides the tighter `north=39.0°N` data bounds that the overlay `.then()` set, causing the viewport to allow panning 0.5° above data north. Same applies to the vv-resize refit (`onVVResize`). See `docs/map_viewport_nuances.md` sections 5–6 and commit b270a27.

```js
useEffect(() => {
  const map = mapRef.current;
  if (!sstReady || !mapReady || !map || userInteractedRef.current) return;
  const t = setTimeout(() => {
    if (userInteractedRef.current) return;
    try {
      map.invalidateSize();
      const sz = map.getSize();
      const vpH = window.visualViewport?.height || window.innerHeight || 0;
      const _cw = sz.x || 800, _ch = sz.y || vpH || 500;
      // ... calcFillZoom, setView(mercCenter, fz), while-loop guard, setMinZoom, setMaxBounds
    } catch(_) {}
  }, 150);
  return () => clearTimeout(t);
}, [sstReady, mapReady]);
```

**Critical detail — `mercCenter` vs geographic center:** The fill-zoom calculation uses Mercator extent. Centering on the geographic midpoint (36.35°N for bounds 33.7–39.5°N) overshoots the northern boundary. Use the Mercator midpoint ≈ 36.27°N (`mercCenter`) — computed as:
```js
const mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
const mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
const mercLat = (2*Math.atan(Math.exp((mN+mS)/2)) - Math.PI/2) * 180/Math.PI;
```

**`userInteractedRef` must be wired:** `userInteractedRef` (`useRef(false)`) was declared but never written to. The `markInteracted` callback must set `userInteractedRef.current = true` or the guard never activates and the refit will fire even after the user has panned.

---

### Critical mobile crash: "Set map center and zoom first"

`L.map()` is created without a center/zoom (to allow `fitBounds` to set initial view). If `setMapReady(true)` fires before `applyFillZoom` runs in `requestAnimationFrame`, all `mapReady`-dependent `useEffect`s call `map.getBounds()` / `map.project()` on an uninitialized map — crashing with Leaflet's `_checkIfLoaded` error.

**Fix:** Call `map.setView(llBounds.getCenter(), 5, { animate: false })` synchronously immediately after `L.tileLayer(...).addTo(map)` in the map init `useEffect`, before `setMapReady(true)`. The double-rAF `applyFillZoom` still runs to correct the zoom/bounds; the `setView` just ensures the map is in a valid state if any effect fires first.

```js
try { map.setView(llBounds.getCenter(), 5, { animate: false }); } catch(_) {}
```

---

## Wind velocity layer (L.velocityLayer)

- Added when `isWindMap` or `showWindOverlay` is active and `windData` is available.
- Renders a canvas on top of the map's overlay pane via `L.velocityLayer` (leaflet-velocity plugin).
- **Pointer events problem:** The velocity canvas sits above Leaflet's own canvas. With `preferCanvas: true`, wreck/bottom feature markers are drawn on Leaflet's canvas below the velocity canvas — click events are intercepted before reaching markers.
- **Fix:** After `velocityLayer.addTo(map)`, disable pointer events on the velocity canvas:
  ```js
  const vc = velocityLayer._canvasLayer?._canvas ?? velocityLayer._canvas ?? null;
  if (vc) vc.style.pointerEvents = 'none';
  ```
- The velocity field requires `"parameterCategory": 2` in both U and V JSON headers — see `_build_velocity_json` in `fetch_ocean_dynamics.py`.

---

## Control panel — ProGate and help popup system

### ProGate

`ProGate` (`src/components/ProGate.jsx`) wraps any child in a visual dimming overlay + PRO badge. For non-Pro users it intercepts all clicks and shows an upgrade prompt. `isPro` comes from `AppContext` → `useRegionAccess` → `user_subscriptions.tier`.

### Help popup system (? buttons)

Every main button in `MapControlPanel.jsx` has a `?` button alongside it. Implementation:

- Single state: `const [helpOpen, setHelpOpen] = useState(null)` — holds the key of the currently open help modal, or `null`.
- `hbtn(id)` inline helper renders the `?` button: clicking toggles `helpOpen` between `id` and `null`.
- `HELP_CONFIG` object maps button keys (e.g. `"sst"`, `"loran"`, `"windmap"`) to `{ title, image, text }`.
- Single `ReactDOM.createPortal` at the bottom of the JSX renders the modal into `document.body`, escaping the scrollable panel container so it centers on screen.
- **Images:** drop PNG files into `src/public/help/` named by key (e.g. `help/sst.png`). Files that 404 are hidden by the `onError` handler.
- **Loran text** is rendered as an inline JSX fragment rather than from `HELP_CONFIG.loran.text` (since it contains HTML entities and `<br/>`).

### Button layout pattern

```jsx
<div className="flex gap-1 items-stretch">
  <div className="flex-1"><LayerBtn ... /></div>
  {hbtn("key")}
</div>
```

For ProGate-wrapped buttons, the ProGate sits inside `flex-1` so the `?` is outside ProGate and accessible to all users:

```jsx
<div className="flex gap-1 items-start">
  <div className="flex-1">
    <ProGate isPro={isPro} label="...">
      <ToolBtn ... />
      {showSubControl && <SubControl />}
    </ProGate>
  </div>
  {hbtn("key")}
</div>
```

---

## Ocean currents overlay

- Rendered as a grid of arrowhead markers (SVG `divIcon` via `L.marker`) — one per grid point.
- Arrow color: **white** (`#ffffff`) with opacity scaled by current speed (`0.35 + 0.65 * norm`).
- Arrow rotates to match current direction (`dir_deg`).
- Grid is decimated by zoom level: `step = zoom >= 9 ? 1 : zoom >= 7 ? 2 : 3` (fewer arrows at low zoom).
- Data source: `fetch_ocean_dynamics.py` → `currents_latest.json` → `hours[0].grid[].{lat, lon, speed_ms, dir_deg}`.

---

## Composite SST (36h)

- Single JSON file: `VIIRS_COMPOSITE_URL`. Shape: `{ sst, latSet, lonSet, generated, date, pass_dates[] }`.
- `pass_dates` is the array of contributing VIIRS pass dates (typically 2–3 entries for a 36h window).
- Desktop DateNav appears when `compositeDates.length >= 1` (shows pass dates user can cycle through).
- Mobile DateNav same condition. Both prev/next arrows disabled if only 1 pass date.
- `compositeDateIndex` is initialized to `dates.length - 1` (most recent pass) on load.
- The composite renders directly via its own `latSet/lonSet` — no `expandCoarseGrid` needed.

---

## Play loop — date animation for all date-nav layers

All layers with a `DateNav` component support a play/pause animation loop. Added 2026-06-28. Covers: SST HD Composite, SST Hourly (VIIRS), SST Cloud Free (MUR), SST GOES Composite, CHL Daily, CHL HD Composite, Sea Color Daily, Sea Color HD Composite, and Altimetry.

### Play button

`DateNav` in `MapControlPanel.jsx` accepts two optional props: `onPlay` (callback) and `playing` (boolean). When `onPlay` is provided, a button renders to the right of the date arrows using plain ASCII — `>` when stopped, `||` when playing. No Unicode symbols, no emoji (CLAUDE.md design rules). Identical button on mobile in `SSTHeatmapLeaflet.jsx` mobile panels.

### Play state and interval

Three play states in `SSTLive.jsx`: `sstPlaying`, `chlPlaying`, `seaColorPlaying`. Each has a corresponding interval ref (`sstPlayRef`, `chlPlayRef`, `scPlayRef`). Interval fires every **1500ms**.

### Always-current ref pattern (stale-closure-safe)

SST has multiple sub-sources sharing one `sstPlaying` state — without care the `setInterval` callback captures stale state. Solution: assign an "always-current" ref on every render, call it from the interval:

```js
sstAdvanceFn.current = () => { /* reads current state */ };
sstPlayRef.current = setInterval(() => sstAdvanceFn.current(), 1500);
```

`chlAdvanceFn` and `scAdvanceFn` use the same pattern.

### Layer-specific advance logic

- **SST HD Composite:** check `activeDataLayer === "composite"` (NOT `dataSource`) — HD Composite sets `activeDataLayer` while `dataSource` stays as the SST sub-source. Wrap `compositeDateIndex` at end.
- **SST Hourly (VIIRS):** advance through `available_hours` on the current day first; roll to next day only when at the last hour. On day roll, set `viirsHour` to the first hour