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
  { label: "Hatteras Inlet, NC",    lat: 35.1905,      lon: -75.7554,      wreckRegion: "HatterasNC",   noaaCoverage: true },
  { label: "Ocean City Inlet, MD",  lat: 38.324,       lon: -75.0883,      wreckRegion: "ChesapeakeMD", noaaCoverage: true },
  { label: "Oregon Inlet, NC",      lat: 35.7792,      lon: -75.532,       wreckRegion: "HatterasNC",   noaaCoverage: true },
  { label: "Poquoson, VA",          lat: 37.7629068,   lon: -75.7724311,   wreckRegion: "ChesapeakeMD", noaaCoverage: true },
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
| `wave_height` | `"3 to 5 ft"` |
| `wave_commentary` | `"building to 6 ft"` |
| `primary_swell_direction` | `"SE"` |
| `primary_wave_height` | `"4 ft"` |
| `primary_wave_period` | `"8 seconds"` |
| `swell_components` | Array of `{ direction, height, period }` |
| `raw_text` | Full NOAA narrative text |

All JSON files are committed to the `jlintvet/NOAAPARSE` GitHub repository and served via `raw.githubusercontent.com`.

### `tidepull.py` — Tide Reference Script

Manual reference tool for pulling today's tide predictions from the NOAA CO-OPS API. **Not used in production** — tides are fetched live by `useMarineForecast.js` in the browser.

**Stations mapped:**

| Station ID | Name | Location |
|---|---|---|
| 8652659 | Oregon Inlet Bridge | Oregon Inlet, NC |
| 8654467 | USCG Station Hatteras | Hatteras Inlet, NC |
| 8656483 | Beaufort, Duke Marine Lab | Beaufort Inlet, NC |
| 8637689 | Gloucester Point, VA | Poquoson, VA |
| 8638863 | Cape Henry, VA | Bay Bridge Tunnel, VA / Virginia Beach, VA |
| 8570283 | Ocean City, MD | Ocean City Inlet, MD |

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

**NOAA_SOURCES mapping** (must match `regionConfig.js` labels exactly):

```js
const NOAA_SOURCES = {
  "Oregon Inlet, NC":      { forecastJsonUrl: "…/weather_data.json",          tideStation: "8652659" },
  "Hatteras Inlet, NC":    { forecastJsonUrl: "…/hatterasncnoaa.json",         tideStation: "8654467" },
  "Beaufort Inlet, NC":    { forecastJsonUrl: "…/beaufortinletnoaa.json",      tideStation: "8656483" },
  "Poquoson, VA":          { forecastJsonUrl: "…/poquosonnoaa.json",           tideStation: "8637689" },
  "Bay Bridge Tunnel, VA": { forecastJsonUrl: "…/baybridgetunnelnoaa.json",    tideStation: "8638863" },
  "Virginia Beach, VA":    { forecastJsonUrl: "…/virginiabeachnoaa.json",      tideStation: "8638863" },
  "Ocean City Inlet, MD":  { forecastJsonUrl: "…/oceancitynoaa.json",          tideStation: "8570283" },
};
```

---

## 3. Frontend Components

### Component tree

```
AppShell
├── WeatherDrawer          (desktop, hidden sm:block)
│   ├── ImmediateOutlook
│   │   └── ForecastCard × 3
│   └── ExtendedOutlook
│       └── ForecastCard × N
└── WeatherBottomSheet     (mobile, sm:hidden)
    ├── ImmediateOutlook
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
- Props: `forecasts`, `nwsForecast`, `tideData`, `sunData`, `forecastHourlyUrl`, `locationLabel`, `forecastTimestamp`

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
3. Run `scraper.py` — outputs 7 JSON files
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
