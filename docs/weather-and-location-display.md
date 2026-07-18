# Weather & Location Selection — Display Architecture

This document covers the marine weather forecast system and departure location selection feature: how data flows from NOAA sources through backend scripts to the React UI components.

---

## Table of Contents

1. [Location Selection](#1-location-selection)
2. [Weather Data Pipeline](#2-weather-data-pipeline)
3. [Frontend Components](#3-frontend-components)
4. [Hourly Forecast Popup](#4-hourly-forecast-popup)
5. [GitHub Actions Automation](#5-github-actions-automation)
6. [Adding a New Location](#6-adding-a-new-location)

---

## 1. Location Selection

### Config — `src/config/regionConfig.js`

All selectable departure locations are defined here. Each entry drives the NOAA scraper mapping, the forecast hook, and the distance/bearing calculations on the map.

```js
locations: [
  { label: "Bay Bridge Tunnel, VA", lat: 36.9082,      lon: -76.0918,      wreckRegion: "ChesapeakeMD", noaaCoverage: true },
  { label: "Beaufort Inlet, NC",    lat: 34.6937,      lon: -76.6663,      wreckRegion: "MoreheadNC",   noaaCoverage: true },
  { label: "Cape Charles, VA",      lat: 37.264139,    lon: -76.026920,    wreckRegion: "ChesapeakeMD", noaaCoverage: true },
  { label: "Hatteras Inlet, NC",    lat: 35.1905,      lon: -75.7554,      wreckRegion: "HatterasNC",   noaaCoverage: true },
  { label: "Horn Harbor, VA",       lat: 37.355565,    lon: -76.267948,    wreckRegion: "ChesapeakeMD", noaaCoverage: true },
  { label: "Ocean City Inlet, MD",  lat: 38.324,       lon: -75.0883,      wreckRegion: "OceanCityMD",  noaaCoverage: true },
  { label: "Oregon Inlet, NC",      lat: 35.7792,      lon: -75.532,       wreckRegion: "HatterasNC",   noaaCoverage: true },
  { label: "Poquoson, VA",          lat: 37.1788,      lon: -76.373,       wreckRegion: "ChesapeakeMD", noaaCoverage: true },
  { label: "Virginia Beach, VA",    lat: 36.8516,      lon: -75.9792,      wreckRegion: "ChesapeakeMD", noaaCoverage: true },
]
```

**Key fields:**

| Field | Purpose |
|---|---|
| `label` | Must match exactly the key in `NOAA_SOURCES` in `useMarineForecast.js` |
| `lat` / `lon` | Used for NWS API calls, sun calculation, distance/bearing from map pins |
| `noaaCoverage` | When `true`, the weather panel shows forecast data for this location |
| `wreckRegion` | Controls which wrecks/bottom features are displayed on the map |

Locations are listed alphabetically. The `defaultLocation` for the region is `"Oregon Inlet, NC"`.

### State management

`selectedLocation` is held in `AppContext`. The `LocationPicker` component (Base44) lets the user switch locations; the choice persists in context and drives both the map marker and the weather drawer.

---

## 2. Weather Data Pipeline

### Overview

```
NOAA NWS HTML pages  →  scraper.py  →  JSON files  →  GitHub repo
NOAA CO-OPS API      →  tidepull.py (manual/reference only)
NWS API (live)       →  useMarineForecast.js (browser fetch)
SunCalc (local)      →  useMarineForecast.js (no network)
```

### `scraper.py` — Marine Forecast Scraper

Scrapes the NOAA NWS detailed marine forecast HTML pages and saves structured JSON for each location. Run manually or via GitHub Actions.

**Locations and output files:**

| Location | NWS URL | Output file |
|---|---|---|
| Oregon Inlet, NC | `forecast.weather.gov` (MHX point) | `weather_data.json` |
| Hatteras Inlet, NC | `forecast.weather.gov` (MHX point) | `hatterasncnoaa.json` |
| Beaufort Inlet, NC | `forecast.weather.gov` (MHX point) | `beaufortinletnoaa.json` |
| Virginia Beach, VA | `forecast.weather.gov` (AKQ point) | `virginiabeachnoaa.json` |
| Poquoson, VA | `forecast.weather.gov?zoneid=ANZ632` | `poquosonnoaa.json` |
| Bay Bridge Tunnel, VA | `forecast.weather.gov?zoneid=ANZ634` | `baybridgetunnelnoaa.json` |
| Ocean City Inlet, MD | `forecast.weather.gov?zoneid=ANZ485` | `oceancitynoaa.json` |
| Horn Harbor, VA | `forecast.weather.gov?zoneid=ANZ631` | `hornharbornoaa.json` |
| Cape Charles, VA | `forecast.weather.gov?zoneid=ANZ631` | `capecharlesnoaa.json` |

**Two URL patterns used:**
- Point-based: `?x=…&y=…&site=mhx` — used for NC locations and Virginia Beach
- Zone-based: `?zoneid=ANZ632` — used for Chesapeake Bay / mid-Atlantic zone locations

**Parsed fields per forecast period:**

| Field | Example |
|---|---|
| `period` | `"Thu 6/12"` |
| `wind_direction` | `"SW"` |
| `wind_speed` | `"10 to 15 kt"` |
| `wind_gusts` | `"Gusts up to 25 kt"` |
| `wind_commentary` | `"becoming NW"` |
| `wave_height` | `"3 to 5 ft"` or `"1 foot"` |
| `wave_commentary` | `"building to 6 ft"` |
| `primary_swell_direction` | `"SE"` |
| `primary_wave_height` | `"4 ft"` |
| `primary_wave_period` | `"8 seconds"` |
| `swell_components` | Array of `{ direction, height, period }` |
| `raw_text` | Full NOAA narrative text |

**Wave height parsing note:** The `_HEIGHT` regex in `scraper.py` matches all three NOAA unit forms: `ft`, `feet`, and `foot` (singular). NOAA writes "Waves 1 foot." (singular) when height is exactly 1 — without the `foot` alternative the field is silently dropped. Do not remove `foot` from the alternation.

All JSON files are committed to the `jlintvet/NOAAPARSE` GitHub repository and served via `raw.githubusercontent.com`.

### `tidepull.py` — Tide Reference Script

Manual reference tool for pulling today's tide predictions from the NOAA CO-OPS API. **Not used in production** — tides are fetched live by `useMarineForecast.js` in the browser.

**Stations mapped:**

| Station ID | Name | Location |
|---|---|---|
| 8652659 | Oregon Inlet Bridge | Oregon Inlet, NC |
| 8654467 | USCG Station Hatteras | Hatteras Inlet, NC |
| 8656483 | Beaufort, Duke Marine Lab | Beaufort Inlet, NC |
| 8637689 | Gloucester Point, VA | Poquoson, VA / Horn Harbor, VA |
| 8638863 | Cape Henry, VA | Bay Bridge Tunnel, VA / Virginia Beach, VA |
| 8570283 | Ocean City, MD | Ocean City Inlet, MD |
| 8632200 | Cape Charles, VA | Cape Charles, VA |

### `src/hooks/useMarineForecast.js` — Data Hook

Called by `WeatherDrawer` and `WeatherBottomSheet`. Fetches all weather data in parallel on location change, caches results for 10 minutes.

**What it fetches:**

| Data | Source | Method |
|---|---|---|
| Marine forecast (wind, seas, swell) | GitHub raw JSON (from scraper.py) | `fetchMarineForecast()` |
| Tide predictions (7 days) | NOAA CO-OPS API, live | `fetchTides()` |
| Air temp, conditions, precip % | NWS API (`api.weather.gov`), live | `fetchNws()` |
| Hourly forecast URL | NWS points response property | Stored in `data.forecastHourlyUrl` |
| Sunrise / sunset | SunCalc library, local computation | `computeSun()` |

**Returned data shape:**

```js
{
  forecast:          { timestamp, forecasts: [...] },  // from scraper JSON
  tides:             { "2026-06-12": [{ t, v, type }] },
  nws:               { "2026-06-12": { high, low, dayForecast, nightForecast, dayPrecip, nightPrecip } },
  forecastHourlyUrl: "https://api.weather.gov/gridpoints/.../forecast/hourly",
  sun:               { "2026-06-12": { sunrise, sunset } },
}
```

**Caching:**
- Main data: 10-minute in-memory cache keyed by location label
- Hourly data: session-persistent cache keyed by `url::date` — re-opening the same day popup is instant

**NOAA_SOURCES mapping** (must match `regionConfig.js` labels exactly). Two shapes are used:

- **Legacy flat shape** (offshore-only — most locations): `{ forecastJsonUrl, tideStation, noaaZone }`
- **Nearshore/offshore shape** (5 mid_atlantic open-ocean locations — see section 6a): `{ tideStation, offshore: { forecastJsonUrl, noaaZone }, nearshore?: { forecastJsonUrl, noaaZone } }`

```js
const NOAA_SOURCES = {
  // Open-ocean mid_atlantic locations — nearshore/offshore toggle shape
  "Oregon Inlet, NC": {
    tideStation: "8652659",
    offshore:  { forecastJsonUrl: "…/weather_data.json",           noaaZone: { id: "AMZ180", description: "…, 20-60nm" } },
    nearshore: { forecastJsonUrl: "…/weather_data_nearshore.json", noaaZone: { id: "AMZ150", description: "…, 0-20nm" } },
  },
  // ...Hatteras Inlet, Beaufort Inlet, Virginia Beach, Ocean City Inlet follow the same shape

  // Chesapeake Bay locations — legacy flat shape, no nearshore/offshore split
  "Poquoson, VA":          { forecastJsonUrl: "…/poquosonnoaa.json",           tideStation: "8637689", noaaZone: { id: "ANZ632", description: "…" } },
  "Bay Bridge Tunnel, VA": { forecastJsonUrl: "…/baybridgetunnelnoaa.json",    tideStation: "8638863", noaaZone: { id: "ANZ634", description: "…" } },
  "Horn Harbor, VA":       { forecastJsonUrl: "…/hornharbornoaa.json",         tideStation: "8637689", noaaZone: { id: "ANZ631", description: "…" } },
  "Cape Charles, VA":      { forecastJsonUrl: "…/capecharlesnoaa.json",        tideStation: "8632200", noaaZone: { id: "ANZ631", description: "…" } },
};
```

`resolveZoneSource(source, zoneMode)` in `useMarineForecast.js` normalizes both shapes: if `source.offshore` exists it picks `source[zoneMode] ?? source.offshore`; otherwise it treats the flat entry as offshore-only. `hasNearshore` is simply `!!source?.nearshore`.

---

## 3. Frontend Components

### Component tree

```
AppShell
├── WeatherDrawer          (desktop, hidden sm:block)
│   ├── ImmediateOutlook
│   │   ├── NearshoreOffshoreToggle  (only if location has a nearshore zone)
│   │   └── ForecastCard × 3
│   └── ExtendedOutlook
│       └── ForecastCard × N
└── WeatherBottomSheet     (mobile, sm:hidden)
    ├── ImmediateOutlook
    │   ├── NearshoreOffshoreToggle  (only if location has a nearshore zone)
    │   └── ForecastCard × 3
    └── ExtendedOutlook
        └── ForecastCard × N
```

### `WeatherDrawer.jsx` — Desktop Panel

Three visual states controlled by `AppContext.weatherPanel`:

| State | Width | Behavior |
|---|---|---|
| `expanded` | 380px | Full forecast panel with scrollable body |
| `collapsed` | 52px | Vertical rail: icon, temp, wind, wave height at a glance |
| `hidden` | 0 | Panel removed; map uses freed space |

### `WeatherBottomSheet.jsx` — Mobile Panel

Three snap points driven by the same `weatherPanel` state:

| State | Height | Behavior |
|---|---|---|
| `hidden` | 56px peek | Single-line summary bar only |
| `collapsed` | 50vh | Immediate Outlook visible |
| `expanded` | 90vh | Both outlooks visible, Extended Outlook reachable |

Tapping the peek bar goes directly to `expanded` (90vh). Implemented with pointer-event dragging and CSS transitions — no animation library.

### `ImmediateOutlook.jsx`

- Renders the first 3 forecast periods (today, tonight, tomorrow)
- Collapsible, defaults open
- Includes a `(?)` help popover listing all data sources with URLs
- Renders `NearshoreOffshoreToggle` above the first `ForecastCard` when `hasNearshore` is true (see section 6a) — hidden entirely for locations without a nearshore zone
- Props: `forecasts`, `nwsForecast`, `tideData`, `sunData`, `forecastHourlyUrl`, `locationLabel`, `forecastTimestamp`, `noaaZone`, `hasNearshore`, `zoneMode`, `onZoneModeChange`

### `ExtendedOutlook.jsx`

- Renders forecast periods 4 and beyond
- Collapsible, defaults closed
- Props: same as ImmediateOutlook

### `ForecastCard.jsx`

One card per forecast period. Sections displayed:

| Section | Data source |
|---|---|
| NWS weather block (sky, temp, precip) | `data.nws` from NWS API |
| Wind (direction, speed, gusts, trend) | `data.forecast` from scraper JSON |
| Waves (height, commentary) | `data.forecast` from scraper JSON |
| Swell components | `data.forecast` from scraper JSON |
| Tides (high/low times and heights) | `data.tides` from CO-OPS API |
| Sunrise / sunset | `data.sun` from SunCalc |
| NOAA Narrative (collapsible) | `data.forecast.raw_text` from scraper JSON |

The NWS weather block is tappable — clicking it opens the **Hourly Forecast popup** (see section 4).

Period label normalization: `"Rest Of Today"` → `"Rest of Today"` applied at render time.

---

## 4. Hourly Forecast Popup

Triggered by tapping the light-blue NWS weather block on any `ForecastCard`.

### Data flow

1. `ForecastCard` receives `forecastHourlyUrl` prop (stored in `data.forecastHourlyUrl` from the hook)
2. On tap, `HourlyWeatherPopup` mounts and calls `fetchHourlyForecast(url, date)`
3. `fetchHourlyForecast` (exported from `useMarineForecast.js`) fetches the NWS hourly endpoint and filters to the clicked date
4. Results cached in module-level `hourlyCache` keyed by `url::date` — instant re-open

### Display

- Renders as a fixed `ReactDOM.createPortal` overlay (escapes card overflow clipping)
- **Horizontal scrolling strip** — one column per hour
- Each hour card shows: time · weather emoji · temperature (color-coded) · rain % (only shown if > 0, 💧 prefix) · wind speed + direction
- Night hours use a slightly darker background
- Backdrop click or × button closes

### Temperature color scale

| Range | Color |
|---|---|
| < 50°F | Blue `#3b82f6` |
| 50–59°F | Cyan `#06b6d4` |
| 60–69°F | Green `#10b981` |
| 70–77°F | Amber `#f59e0b` |
| 78–87°F | Red `#ef4444` |
| ≥ 88°F | Deep red `#dc2626` |

---

## 5. GitHub Actions Automation

### NOAA Scraper Workflow (in `jlintvet/NOAAPARSE` repo)

Runs `scraper.py` on a schedule and commits updated JSON files to the repo. The frontend always fetches from `raw.githubusercontent.com/jlintvet/NOAAPARSE/main/`.

**Trigger:** Scheduled (cron) + manual dispatch

**Steps:**
1. Checkout NOAAPARSE repo
2. Install `requests`, `beautifulsoup4`
3. Run `scraper.py` — outputs 92 JSON files (one per location/zone `scrape_and_save()` call, including a nearshore file for every location with a nearshore/offshore toggle — see §6a)
4. Commit and push changed files

### `fishing-hotspot-analysis.yml` (in `jlintvet/SSTv2` repo)

Runs `FishingHotspotAnalyzer.py` after the VIIRS bundler workflow completes.

**Trigger:** `workflow_run` on "VIIRS Hourly Bundler" success, or manual dispatch

**Inputs (manual):**

| Input | Description |
|---|---|
| `date` | Analysis date (YYYY-MM-DD), defaults to today |
| `species` | Single species key, or blank for all |
| `skip_chl` | Skip CHL/Kd490 data (for offline testing) |

**Output:** `DailySST/fishing_hotspots_{date}.json` — retained for 7 days, older files pruned automatically.

---

## 6a. Nearshore/Offshore Toggle (shipped 2026-07-18, all 4 regions)

Every open-ocean location across all 4 regions (mid_atlantic, ga_sc, ne_fl, va_ri) lets the user switch between a 0-20nm nearshore forecast and the 20-60nm offshore forecast. Bay-only locations have no offshore equivalent and are out of scope: the 4 Chesapeake Bay locations (mid_atlantic) and Stonington, CT (va_ri) — see `CLAUDE.md` §5 for the full zone reference tables.

**Data:** every open-ocean location has a second scraped JSON file (`*_nearshore.json`) from a second `scrape_and_save()` call in `scraper.py`, hitting a distinct NOAA zone ID. Nearshore and offshore zones are not always the same coastline span or WFO, and an offshore zone doesn't always map 1:1 to one nearshore zone — always verify a new zone against live NWS zone text before wiring it up (see `CLAUDE.md` §5). Two patterns worth knowing before extending this further:
- **One offshore zone splitting into two nearshore zones**, with different locations in the same offshore zone landing on different nearshore zones depending on where they sit within that span (e.g. ga_sc's AMZ284 → AMZ254 north / AMZ256 south).
- **Two locations sharing one offshore zone but getting different nearshore zones** from the same WFO (va_ri's Cape May NJ and Indian River Inlet DE both use offshore ANZ485 but split into nearshore ANZ454 and ANZ455 respectively).

**Hook (`useMarineForecast.js`):**
- `resolveZoneSource(source, zoneMode)` picks `source.offshore` or `source.nearshore` (falling back to `offshore` if `nearshore` doesn't exist), or returns the entry as-is for legacy flat-shape sources (now only the 4 Chesapeake Bay locations and Stonington, CT).
- `zoneMode` (`"offshore" | "nearshore"`) is hook-local state, initialized from `localStorage["sst_zoneMode"]` and updated via the hook's `setZoneMode`. It persists across locations and sessions — **not** reset when switching locations.
- For locations without a nearshore zone, `effectiveZoneMode` is forced to `"offshore"` regardless of the stored preference; the stored preference itself is left untouched.
- Cache key is `${locationLabel}::${effectiveZoneMode}`, so switching modes doesn't stale into the other zone's cached data.
- Hook returns `hasNearshore`, `zoneMode`, `setZoneMode` alongside the existing `data`/`loading`/`error`/`isAvailable`.

**UI (`NearshoreOffshoreToggle.jsx`):** a small segmented control ("Nearshore · 0-20nm" / "Offshore · 20-60nm"), rendered by `ImmediateOutlook` only when `hasNearshore` is true, full-width to match the `ForecastCard` below it. No emojis/icons, per `CLAUDE.md` design rules. The `noaaZone` footnote on `ForecastCard` automatically reflects whichever zone is active since it just reads `data.noaaZone`.

**Hazard alerts:** `useMarineForecast.js` also live-fetches active NWS alerts (Small Craft Advisory, Gale Warning, etc.) per zone via `fetchAlerts(zoneId)` hitting `api.weather.gov/alerts/active/zone/{zoneId}`, exposed as `data.alerts`. `ForecastCard` matches each alert's onset/end window against the card's date and renders a banner. Note the CAP field priority: use `ends` (the actual forecast hazard end time, matches the human-authored headline) over `expires` (when the alert message rolls off the active feed — a different, often earlier, technical timestamp) — this was a real bug caught in production.

---

## 6. Adding a New Location

To add a new departure/weather location, update **four places**:

### Step 1 — `scraper.py`

Add a `scrape_and_save()` call in `main()`:

```python
# Zone-based (Chesapeake / mid-Atlantic inland zones):
scrape_and_save(
    "https://forecast.weather.gov/MapClick.php?zoneid=ANZ6XX",
    'newlocationnoaa.json'
)

# Point-based (offshore / coastal):
scrape_and_save(
    "https://forecast.weather.gov/MapClick.php?x=…&y=…&site=mhx",
    'newlocationnoaa.json'
)
```

Commit and push to `jlintvet/NOAAPARSE`. The scraper workflow will populate the JSON on next run.

### Step 2 — `src/hooks/useMarineForecast.js`

Add an entry to `NOAA_SOURCES` (label must match `regionConfig.js` exactly):

```js
"New Location, ST": {
  forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/newlocationnoaa.json",
  tideStation:     "XXXXXXX",  // NOAA CO-OPS station ID
},
```

### Step 3 — `src/config/regionConfig.js`

Add to the `locations` array in alphabetical order:

```js
{ label: "New Location, ST", lat: XX.XXXX, lon: -XX.XXXX, wreckRegion: "ChesapeakeMD", noaaCoverage: true },
```

### Step 4 — `tidepull.py` (optional — reference tool only)

Add the station to the `stations` dict:

```python
"XXXXXXX": "Station Name, ST",
```

### Step 5 — NOAA scraper workflow

No changes needed — the workflow runs `scraper.py` as-is and will pick up the new location automatically on next scheduled run. Trigger manually from GitHub Actions if you need the JSON immediately.