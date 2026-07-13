# Map Viewport Critical Nuances
*SSTHeatmapLeaflet.jsx — hard-won lessons from the grey-bar / data-cutoff fixes*

---

## 1. Two different data north boundaries

| Layer | Data north | Why |
|---|---|---|
| SST / CHL / seacolor / composite | 39.00°N | VIIRS/CHL products stop at 39.00°N |
| Altimetry | **38.9375°N** | CMEMS 0.125° grid centroid, not the bbox edge |

The altimetry fetch bbox is `lat_max: 39.00`, but CMEMS returns **grid centroids** at 0.125° spacing. The northernmost centroid is `39.00 − 0.0625 = 38.9375°N`. The southernmost is `33.70 + 0.0625 = 33.8125°N`. There are **42 lat points**, not 43.

**Never assume the data fills the bbox.** Always read actual north/south from `gridToDataURL`'s returned `{north, south, east, west}`, which are computed from the actual grid points.

---

## 2. mercCenter is wrong for altimetry

`mercCenter` is the Mercator midpoint of the **region bounds** (33.70–39.50°N):

```
_mcN = ln(tan(π/4 + 39.50·π/360))
_mcS = ln(tan(π/4 + 33.70·π/360))
mercCenter.lat ≈ 36.60°N
```

The altimetry data range is 33.8125–38.9375°N. Its Mercator midpoint (`altMercCenter`) is:

```
aN = ln(tan(π/4 + 38.9375·π/360))
aS = ln(tan(π/4 + 33.8125·π/360))
altMercCenter.lat ≈ 36.38°N
```

The difference (~0.22°) is small but asymmetric: `mercCenter` sits **closer to data north than data south** in Mercator space (halfN ≈ 0.0517, halfS ≈ 0.0611). Centering the viewport at `mercCenter` with a fill zoom computed for the data height clips either the top or bottom.

**Rule:** for altimetry, always compute the viewport center from the actual data `(north, south)`, never from `regionBounds`.

---

## 3. Fill zoom must be computed from Mercator height, not geographic height

Leaflet tiles use Web Mercator. The fill zoom that makes height `mH` exactly fill a container of pixel height `ch` is:

```js
fz = log2((ch * 2π) / (256 * mH))
```

where `mH = mercY(north) − mercY(south)` and `mercY(lat) = ln(tan(π/4 + lat·π/360))`.

Take `max(fill_for_width, fill_for_height)` to ensure the viewport covers the data in both dimensions without grey bars.

---

## 4. The two blocking mechanisms

### `sstReadyRef` — blocks `applyFillZoom`

`applyFillZoom` runs at double-rAF, 300ms, 800ms, and 1800ms after mount. It uses `mercCenter` (region-biased) as the viewport center. Once data has rendered, `applyFillZoom` must not run again or it will shift the center and reveal a grey edge.

```js
const applyFillZoom = () => {
  if (sstReadyRef.current) return;   // ← guard
  ...
};
```

Set `sstReadyRef.current = true` **before** `setSstReady(true)` at every call site where data has finished loading (SST `.then()`, overlay `.then()`, velocity `.then()`).

### `userInteractedRef` — blocks the post-refit effect

The `useEffect([sstReady, mapReady])` fires 150ms after `sstReady` becomes true. It calls:

```js
map.setView(mercCenter, fill_for_39.50N)
```

This is correct for SST/CHL/composite (where `mercCenter` is appropriate), but **wrong for altimetry** — it shifts the center away from `altMercCenter` and clips data.

Block it by setting `userInteractedRef.current = true` in the altimetry overlay `.then()` **after** calling `map.setView(altMercCenter, fzAlt)`. The post-refit checks:

```js
if (!sstReady || !mapReady || !map || userInteractedRef.current) return;
```

⚠️ `userInteractedRef.current = true` does **not** affect `onVVResize` — that handler reads a local `userInteracted` variable, not the ref. iOS URL-bar show/hide still triggers a refit correctly.

---

## 5. CHL / seacolor / composite approach (different from altimetry)

These layers stop at the region's data north — e.g. 39.00°N for mid_atlantic CHL while the region bound is 39.50°N. Without tight bounds, the post-refit calls `setView(mercCenter, fill_for_region_north)` which zooms out past the data edge and shows a grey strip.

Fix: in the overlay `.then()`, before `setSstReady(true)`, use `north/south/east/west` from `gridToDataURL`'s result (actual data bounds — region-agnostic):

```js
map.setMaxBounds([[south, west], [north, east]]);  // actual data bounds, NOT hardcoded
map.setMinZoom(fill_for_data_height);
```

⚠️ **Never hardcode region coordinates here.** Using literal values like `[[33.70, -78.89], [39.00, -72.21]]` breaks any non-mid_atlantic region: when GA/SC data loads (center ~32.47°N), Leaflet enforces those mid_atlantic min-lat bounds and immediately pans the map north into mid_atlantic territory.

Both `setMaxBounds` and `setMinZoom` must use actual data bounds — NOT region bounds — for CHL/seacolor/composite. `mercCenter` is the Mercator midpoint of the region (39.5°N), not the data (39.0°N). Centering there at data-fill-zoom makes the viewport extend ~0.2° above data north — visible on portrait mobile as a strip of basemap. `setMaxBounds` on the data north clamps it.

⚠️ The post-sstReady refit (`useEffect([sstReady, mapReady])`) and the vv-resize refit (iOS URL-bar show/hide) both reset `maxBounds`. They must use `dataBoundsRef.current` (set in the overlay/SST `.then()`) rather than `llBounds`, or they will override the data-tight bounds with region-wide bounds 150ms after load and on every iOS URL bar toggle.

---

## 6. The overlay `.then()` flow (current state, commit b270a27)

```js
// dataBoundsRef = useRef(null)  — declared at component top level

// inside SST .then():
dataBoundsRef.current = { south, west, north, east };
map.setMaxBounds([[south, west], [north, east]]);   // data bounds (NOT llBounds)
map.setMinZoom(fill_for_data_height);

// inside overlay layer .then() callback:
// { dataURL, west, east, north, south } = gridToDataURL result — actual data bounds
if (activeDataLayer !== 'altimetry') {
  // CHL / seacolor / composite — data bounds for both maxBounds and minZoom
  dataBoundsRef.current = { south, west, north, east };
  map.setMaxBounds([[south, west], [north, east]]);  // data bounds, region-agnostic
  const fz = max(fill_for_width, fill_for_data_height);
  map.setMinZoom(fz);
} else {
  // Altimetry — position from actual data, block post-refit
  const aN = mercY(north), aS = mercY(south);   // from gridToDataURL result
  const mH = aN - aS, lR = east - west;
  const fzAlt = max(log2((cw*360)/(256*lR)), log2((ch*2π)/(256*mH)));
  const altMercCenter = invMercY((aN+aS)/2), lon=(west+east)/2;
  map.setView(altMercCenter, fzAlt, { animate: false });
  map.setMinZoom(fzAlt);
  map.setMaxBounds(llBounds); // region bounds — altMercCenter centers on data, not issue
  userInteractedRef.current = true;  // blocks post-refit
}
sstReadyRef.current = true;
setSstReady(true);

// inside vv-resize refit and post-sstReady refit:
const _db = dataBoundsRef.current;
map.setMinZoom(map.getZoom());
map.setMaxBounds(_db ? [[_db.south, _db.west], [_db.north, _db.east]] : llBounds);
```

---

## 7. Dropbox / JSX edit rule

Dropbox silently truncates large JSX files mid-write if edited via the Claude Edit tool (which writes through the mounted path). 

**Mandatory workflow for every edit to `SSTHeatmapLeaflet.jsx`:**

1. Use Python string-replace in bash (never the Edit tool directly)
2. Verify: `wc -l` must be ≥ 4500 lines; `tail -5` must show `}` / `export default`
3. If truncated: restore with `git show <last-good-sha>:src/components/SSTHeatmapLeaflet.jsx > ...`, then recommit

Current known-good line counts:
- `SSTHeatmapLeaflet.jsx` — 4514 lines
- `SSTLive.jsx` — ~1213 lines
- `MapControlPanel.jsx` — ~829 lines

---

## 8.5. Cross-region altimetry data cache (2026-07-13 incident)

This is a different bug class from sections 1-7 above -- those are all about
viewport *centering/zoom* math in `SSTHeatmapLeaflet.jsx` given correct data.
This one is about the data itself being wrong: **the wrong region's altimetry
grid rendering on top of the current region's map**, positioned using that
other region's own (much wider) geographic bounds.

**Symptom:** altimetry color renders with a hard rectangular cutoff well
outside the current region's configured bounds -- e.g. mid_atlantic (bounds
north 39.50) showing solid color up past Dover/Wilmington DE, a good degree
north of its real 38.94N data edge, cut off in a straight line rather than
fading out at the coast.

**Root cause:** `SSTLive.jsx`'s altimetry-discovery `useEffect` (the one that
probes the last 8 days of `altimetry_<date>_grid.json` files and picks the
latest) had an **empty dependency array (`[]`)**, so it only ever runs once
per page load. Its cache, `_altimetryCache` (a `useRef(new Map())`), was keyed
**only by date string** (e.g. `"20260712"`), not by region.

Neither `AppShell` nor `AppProvider` remounts when the active region changes
(no `key={region}` anywhere in `SSTLive.jsx`'s render of `<AppShell
region={userRegion}>`) -- see the `adding_a_new_region.md` Key Gotchas entry
"Map pans to the previous region on region change", which documented `key=
{region}` as the prescribed fix for this class of bug but it was never
actually applied to `AppShell`. Without a remount, switching regions in the
same browser tab (which happens constantly during manual multi-region
testing -- flipping `user_profiles.region` in Supabase, or toggling
`VITE_FORCE_REGION` on a preview branch) leaves every per-region `useEffect`
with an empty dependency array permanently stuck on whichever region was
active at first mount.

Concretely: view va_ri, let it cache `"20260712" -> {va_ri's wide SLA grid}`.
Switch to mid_atlantic in the same tab. The discovery effect never re-runs
(empty deps), so `_altimetryCache` still has `"20260712"` cached -- and it
gets reused for mid_atlantic under the same date key. That cached grid's own
`north/south/west/east` (computed by `gridToDataURL`, used directly as the
Leaflet `imageOverlay`'s bounding box) still reflects va_ri's much larger
extent, so the color raster renders stretched across geography well outside
mid_atlantic's real box -- looks exactly like a viewport bug, but the
viewport math is fine; the underlying data object is simply from the wrong
region.

**Fix (commit `b768948`):** track the last-fetched `ALTIMETRY_BASE_R` (the
region-scoped URL prefix, already derived from `regionConfig.dataPathSuffix`)
in a ref; add it to the discovery effect's dependency array so a region
change re-triggers discovery (after resetting `altimetryDates`/
`altimetryData` first); and scope every cache key as
`` `${ALTIMETRY_BASE_R}::${dateStr}` `` instead of bare `dateStr`, in both the
discovery effect and the "switch data when user changes date" effect.

**This is a latent bug pattern, not something specific to va_ri or to this
one effect.** Any other per-region data fetch in `SSTLive.jsx` that (a) has
an empty/incomplete `useEffect` dependency array and (b) caches results in a
plain `useRef` Map keyed only by date/id (not region) has the same exposure.
At minimum, `chlCompositeDates`, `seaColorCompositeDates`, `compositeDates`,
and `currentsData`'s fetch effects share the surface-level shape (a `useRef`
cache + a discovery effect) and haven't been individually audited for this
specific empty-deps issue -- check them if a similar "shows the wrong
region's data" report comes in for any other layer.

**The more durable fix, still not done:** actually apply `key={region}` (or
`key={regionKey}`) to `<AppShell region={userRegion}>` in `SSTLive.jsx`
(currently ~line 1312), which would force a full remount -- and reset every
ref/state in the whole component tree -- on any region change, rather than
patching each affected cache one at a time as they're discovered. Doing this
would obsolete the per-effect fix above and any future instance of the same
pattern, at the cost of every data layer doing a full cold-load on region
switch (acceptable, since region switches are rare in production -- one
account is normally pinned to one region via Supabase -- and only frequent
during manual multi-region testing).

## 8.6. Altimetry's maxBounds used the full region box, not real data bounds (2026-07-13 incident)

A second, distinct bug found the same day as section 8.5's cache issue -- easy to
confuse with it since the visible symptom looks similar (color past the region's
real edge), but the mechanism and fix are completely different.

**Symptom, precisely:** SST/CHL/SeaColor/composite/wind/currents all correctly stop
panning at the region's real data edge (e.g. mid_atlantic's SST/CHL stop right at
~39.00N, matching Ocean City MD). Altimetry loads matching that same correct edge
initially, **but the user can then pan further north on altimetry specifically**,
into a zone with no other layer showing anything -- and solid altimetry color fills
that zone rather than the expected blank basemap.

**Root cause:** in the overlay-build effect's altimetry branch,
```js
map.setMaxBounds(llBounds); // use region bounds so coast is pannable
```
used `llBounds` -- the full REGION bounds (e.g. 39.50N for mid_atlantic) -- instead
of the real altimetry data bounds (e.g. 38.94N) that `gridToDataURL` had just
computed a few lines above (`{ dataURL, west, east, north, south } = result;`,
already used correctly for the `L.imageOverlay`'s own bounds). The CHL/composite/
SeaColor branch a few lines earlier in the same effect already does this properly --
it sets `dataBoundsRef.current` with the real data `north` and calls `setMaxBounds`
with it. **Altimetry never set `dataBoundsRef.current` at all.** That mattered
beyond just the initial load: both refits that read `dataBoundsRef.current` (the
vv-resize refit around line ~2028, and the post-sstReady refit around line ~3103)
fall back to `llBounds` whenever it's null -- so on altimetry, every refit event
(not just the first paint) kept re-applying the loose, full-region bound.

This was **not** a timing race or a stale cache (that was section 8.5's bug) -- the
very first, primary `setMaxBounds` call for altimetry was simply wrong on every
single load, consistently, which is exactly why it was reproducible in a genuinely
fresh incognito session when 8.5's cache bug was not (that one required first
having viewed a different region in the same tab).

**Fix (commit `723b32d`):** populate `dataBoundsRef.current` from the real
altimetry data (`{ south, west, north, east }` -- all four edges, since altimetry's
grid is a full rectangle, unlike CHL/composite/SeaColor which only tighten north and
keep `regionBounds` for south/west/east because their ocean-only fetch may not reach
the region's inshore edge) and call `setMaxBounds` with that same tight box instead
of `llBounds`. Now altimetry's pan behavior matches every other layer, both on
initial load and on any later refit.

**Lesson for next time a "layer X lets you pan somewhere other layers don't"
report comes in:** check whether that layer's render effect sets
`dataBoundsRef.current` and calls `setMaxBounds` with the *real data* bounds it just
computed, or whether it takes a shortcut straight to `llBounds`/`regionBounds`.
Grepping for `setMaxBounds(llBounds)` across the file is the fastest way to find
every place still using the loose bound -- as of this fix there are three remaining
uses (the very first mount-time fit before any data has loaded, and the wind
layer, which is intentionally region-agnostic per its own code comment) -- don't
assume a new one you find is *also* intentional without checking why.

**This is a repeat regression, not a one-off -- full history from `git log`:**
1. 2026-06-11 (`673f579`, `9754a4c`, `c43d3aa`): altimetry's own maxBounds/minZoom
   was written correctly from the start, using `gridToDataURL`'s real data bounds.
2. 2026-07-01 (`614c8b8`, commit message "blurOverlay on imageOverlay path + llBounds
   for setMaxBounds"): altimetry's own branch was **deliberately changed** from real
   data bounds to `llBounds`, with the comment `// use region bounds so coast is
   pannable` -- this reads as an intentional design decision, not a bug, which is
   exactly why it survived unnoticed for so long.
3. 2026-07-07 (`b270a27`, "use data bounds for maxBounds — prevents north overshoot
   on mobile"): fixed the *identical* bug for CHL/composite/SeaColor (introduced
   `dataBoundsRef`, the pattern this section's fix now also uses for altimetry) --
   but the diff is explicitly gated `if (activeDataLayer !== 'altimetry')`, so this
   fix pass walled altimetry off and never touched it. From this point on, every
   other layer used the correct pattern and altimetry alone did not, but nothing
   flagged the inconsistency.
4. `docs/adding_a_new_region.md` then documented altimetry's `llBounds` usage as
   the correct, already-generalized behavior ("Confirmed generalized/parameterized
   ... `setMaxBounds` uses region bounds not data bounds") -- actively wrong
   guidance that any future session reading the doc before touching this code
   would have trusted instead of questioned.
5. 2026-07-13 (`723b32d`): fixed again, this time bringing altimetry in line with
   the `dataBoundsRef` pattern every other layer already uses. Both the doc's wrong
   description and its wrong Key Gotchas row were corrected in the same pass (not
   just supplemented), specifically to break this cycle.

**Why past attempts to catch this from documentation alone failed:** the code
carries a comment that sounds deliberate (`// use region bounds so coast is
pannable`), and the docs actively confirmed that reading as correct rather than
flagging it as a known bug pattern. A written incident report alone (like section
8.6 above, added after step 5) documents *that* it happened, but doesn't force a
check before the *next* altimetry-adjacent edit ships. **The actionable difference
this time:** before shipping any change that touches altimetry's render effect
(overlay build, refits, minZoom/maxBounds logic) in `SSTHeatmapLeaflet.jsx`, run
`grep -n "setMaxBounds" src/components/SSTHeatmapLeaflet.jsx` and confirm every
altimetry-branch call site sets `dataBoundsRef.current` from real data and passes
`[[south, west], [north, east]]` -- if you find `llBounds` on the altimetry branch,
that is the bug from this section, not a stylistic choice, regardless of any
comment nearby claiming otherwise. As of `723b32d` there are exactly three
legitimate remaining `setMaxBounds(llBounds)` call sites in the whole file: the
very first mount-time fit before any data has loaded, and the wind layer (both
intentionally region-agnostic) -- a fourth site, or one on the altimetry branch
specifically, is the regression.

## 8. Quick reference: what causes each failure mode

| Symptom | Root cause |
|---|---|
| Basemap strip at north on CHL/composite/seacolor | `setMaxBounds` uses region bounds (llBounds, north=39.5N) instead of data bounds (39.0N); mercCenter is offset from data center so viewport top overshoots data north. Fix: use `dataBoundsRef` in overlay `.then()` AND in post-refit/vv-resize refits |
| Same strip reappears after iOS URL-bar show/hide | vv-resize refit reset `maxBounds` to `llBounds`, overriding the data bounds the overlay `.then()` had set. Fix: use `dataBoundsRef.current` in the refit |
| Grey strip at north on CHL/composite initial load | No `setMinZoom` before `setSstReady` → post-refit zooms out past data north |
| Map jumps to wrong region after data loads | `setMaxBounds` uses hardcoded bounds for a different region → Leaflet pans map to enforce those bounds |
| Data cut off top AND bottom on altimetry | `mercCenter` used as viewport center; it's asymmetrically closer to data north → one edge always clipped |
| Grey strip at north on altimetry | Viewport center shifted north (e.g. post-refit ran, or `applyFillZoom` fired after load) |
| Data cut off only at bottom on altimetry | `halfH = min(halfN, halfS)` approach: halfN binds, viewport bottom > dataSouth |
| Grey strip above 38.94°N on altimetry | Used bbox north (39.00) instead of actual centroid north (38.9375) |
| Inspect touch never fires on mobile | `latSet=[]` from stale closure; `reduce()` on empty array fails silently — guard with `latSet.length > 0` |
| Altimetry color renders past the current region's real bounds, hard rectangular cutoff | `SSTLive.jsx` altimetry-discovery effect has empty deps `[]` + `_altimetryCache` keyed only by date, not region; no remount on region change reuses another region's wider cached grid | Scope the cache key and the effect's deps by `ALTIMETRY_BASE_R` (region path prefix) — see section 8.5 |
| Altimetry alone lets the user pan north (or any direction) past where every other data layer stops, even on a genuinely fresh session with no prior region ever viewed | Altimetry's `setMaxBounds` call used `llBounds` (full region bounds) instead of the real data bounds `gridToDataURL` had just computed; `dataBoundsRef.current` was never set for altimetry either, so later refits fell back to the same loose bound | Set `dataBoundsRef.current` from the real altimetry data and `setMaxBounds` to that box, not `llBounds` — see section 8.6 |
