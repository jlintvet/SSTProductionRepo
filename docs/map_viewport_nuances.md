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
