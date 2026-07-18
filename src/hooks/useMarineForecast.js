// src/hooks/useMarineForecast.js
// Replaces all of the data-fetching logic that previously lived in the
// standalone NOAA app's Home.jsx. Three improvements over the original:
//
//   1. Parallelism. Promise.all where possible, drops first-load time
//      from ~5s to ~1s.
//
//   2. Caching. Switching between locations hits a 10-minute in-memory cache.
//
//   3. Suncalc instead of sunrise-sunset.org. Local computation, no flaky
//      external service. Output normalized to the existing shape.
//
// To add a new location:
//   1. Have the NOAAPARSE scraper.py produce a JSON file for it (commit + push)
//   2. Add an entry to NOAA_SOURCES below with that JSON's raw URL + tide station
//   3. Set noaaCoverage: true in regionConfig.js for that location
//
// Nearshore (0-20nm) vs offshore (20-60nm) toggle:
//   Locations can optionally have BOTH a nearshore and offshore NOAA zone.
//   Shape: { tideStation, offshore: { forecastJsonUrl, noaaZone }, nearshore?: {...} }
//   If a location has no meaningful offshore/nearshore split (Chesapeake Bay
//   zones, or any not-yet-migrated location), keep the legacy flat shape:
//   { forecastJsonUrl, tideStation, noaaZone } — resolveZoneSource() below
//   treats that as offshore-only and hasNearshore is false, so no toggle UI
//   renders for it. Always verify a new nearshore zone ID against live NWS
//   zone text (tgftp.nws.noaa.gov/data/forecasts/marine/coastal/...) — zone
//   spans/offices are not mirrored 1:1 between nearshore and offshore.
//
// API:
//   const { data, loading, error, isAvailable } = useMarineForecast(selectedLocation);
//   // data.forecastHourlyUrl — pass to fetchHourlyForecast() on day click
//
// On-demand hourly fetch (call from a component, not a hook):
//   import { fetchHourlyForecast } from "@/hooks/useMarineForecast";
//   const hours = await fetchHourlyForecast(data.forecastHourlyUrl, "2026-06-07");
//   // hours: array of { hour, temp, precip, wind, forecast } for that date

import { useCallback, useEffect, useState } from "react";
import moment from "moment";
import SunCalc from "suncalc";

// ─────────────────────────────────────────────────────────────────────────────
// Location → NOAA data source mapping
// ─────────────────────────────────────────────────────────────────────────────
// Keyed by the exact `label` string from regionConfig.locations.

const NOAA_SOURCES = {
  // ── mid_atlantic: open-ocean locations with nearshore (0-20nm) + offshore (20-60nm) ──
  "Oregon Inlet, NC": {
    tideStation: "8652659",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/weather_data.json",           noaaZone: { id: "AMZ180", description: "Currituck Beach Light to Oregon Inlet NC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/weather_data_nearshore.json", noaaZone: { id: "AMZ150", description: "S of Currituck Beach Light to Oregon Inlet NC, 0-20nm" } },
  },
  "Hatteras Inlet, NC": {
    tideStation: "8654467",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hatterasncnoaa.json",           noaaZone: { id: "AMZ184", description: "Cape Hatteras to Ocracoke Inlet NC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hatterasncnoaa_nearshore.json", noaaZone: { id: "AMZ154", description: "S of Cape Hatteras to Ocracoke Inlet NC, 0-20nm" } },
  },
  "Beaufort Inlet, NC": {
    tideStation: "8656483",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortinletnoaa.json",           noaaZone: { id: "AMZ186", description: "Ocracoke Inlet to Cape Lookout NC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortinletnoaa_nearshore.json", noaaZone: { id: "AMZ156", description: "S of Ocracoke Inlet to Cape Lookout NC, 0-20nm" } },
  },
  "Virginia Beach, VA": {
    tideStation: "8638863",   // Cape Henry, VA
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/virginiabeachnoaa.json",           noaaZone: { id: "ANZ686", description: "Cape Charles Light to VA-NC border, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/virginiabeachnoaa_nearshore.json", noaaZone: { id: "ANZ656", description: "Cape Charles Light to VA-NC border, 0-20nm" } },
  },
  "Ocean City Inlet, MD": {
    tideStation: "8570283",   // Ocean City, MD
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/oceancitynoaa.json",           noaaZone: { id: "ANZ485", description: "Cape May NJ to Fenwick Island DE, 20-60nm" } },
    // Note: nearshore ANZ650 is issued by a different WFO (KAKQ) than offshore ANZ485 (KPHI)
    // and starts where ANZ485 ends — not a mirrored span. See project plan doc.
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/oceancitynoaa_nearshore.json", noaaZone: { id: "ANZ650", description: "Fenwick Island DE to Chincoteague VA, 0-20nm" } },
  },

  // ── mid_atlantic: Chesapeake Bay locations — bay zone only, no offshore/nearshore split ──
  "Poquoson, VA": {
    tideStation: "8637689",   // Gloucester Point, VA
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/poquosonnoaa.json", noaaZone: { id: "ANZ632", description: "Chesapeake Bay, New Point Comfort to Little Creek VA" } },
  },
  "Bay Bridge Tunnel, VA": {
    tideStation: "8638863",   // Cape Henry, VA
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/baybridgetunnelnoaa.json", noaaZone: { id: "ANZ634", description: "Chesapeake Bay, Little Creek to Cape Henry VA incl. CBBT" } },
  },
  "Horn Harbor, VA": {
    tideStation: "8637689",   // Gloucester Point, VA
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hornharbornoaa.json", noaaZone: { id: "ANZ631", description: "Chesapeake Bay, Windmill Point to New Point Comfort VA" } },
  },
  "Cape Charles, VA": {
    tideStation: "8632200",   // Cape Charles, VA
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/capecharlesnoaa.json", noaaZone: { id: "ANZ631", description: "Chesapeake Bay, Windmill Point to New Point Comfort VA" } },
  },
    // ── GA/SC Region ───────────────────────────────────────────────────────────
  "Beaufort, SC":           { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortsc_noaa.json",         tideStation: "8670659",  noaaZone: { id: "AMZ382", description: "Edisto Beach SC to Savannah GA, 20-60nm" } },
  "Carolina Beach, NC":     { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/carolinabeachnc_noaa.json",     tideStation: "8658120",  noaaZone: { id: "AMZ280", description: "Surf City NC to Little River Inlet SC, 20-60nm" } },
  "Charleston, SC":         { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/charlestonsc_noaa.json",        tideStation: "8665530",  noaaZone: { id: "AMZ380", description: "S. Santee River to Edisto Beach SC, 20-60nm" } },
  "Darien, GA":             { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/darienga_noaa.json",            tideStation: "8670870",  noaaZone: { id: "AMZ384", description: "Savannah GA to Altamaha Sound GA, 20-60nm" } },
  "Fernandina Beach, FL":   { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fernandinafl_noaa.json",        tideStation: "8720197",  noaaZone: { id: "AMZ470", description: "Altamaha Sound GA to Fernandina Beach FL, 20-60nm" } },
  "Georgetown, SC":         { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/georgetownsc_noaa.json",        tideStation: "8665530",  noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
  "Hilton Head, SC":        { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hiltonheadsc_noaa.json",        tideStation: "8670659",  noaaZone: { id: "AMZ382", description: "Edisto Beach SC to Savannah GA, 20-60nm" } },
  "Jekyll Island, GA":      { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/jekyllga_noaa.json",            tideStation: "8679511",  noaaZone: { id: "AMZ470", description: "Altamaha Sound GA to Fernandina Beach FL, 20-60nm" } },
  "Little River Inlet, SC": { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/littleriversc_noaa.json",       tideStation: "8661070",  noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
  "Mayport, FL":            { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/mayportfl_noaa.json",           tideStation: "8720218",  noaaZone: { id: "AMZ472", description: "Fernandina Beach to St. Augustine FL, 20-60nm" } },
  "Murrells Inlet, SC":     { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/murrellsinletsc_noaa.json",     tideStation: "8661070",  noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
  "Myrtle Beach, SC":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/myrtlebeachsc_noaa.json",       tideStation: "8661070",  noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
  "Southport, NC":          { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/southportnc_noaa.json",         tideStation: "8659084",  noaaZone: { id: "AMZ280", description: "Surf City NC to Little River Inlet SC, 20-60nm" } },
  "St. Augustine, FL":      { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/staugustinefl_noaa.json",       tideStation: "8720587",  noaaZone: { id: "AMZ474", description: "St. Augustine to Flagler Beach FL, 20-60nm" } },
  "St. Simons Island, GA":  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stsimonsgaga_noaa.json",        tideStation: "8679511",  noaaZone: { id: "AMZ470", description: "Altamaha Sound GA to Fernandina Beach FL, 20-60nm" } },
  "Tybee Island, GA":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/tybeega_noaa.json",             tideStation: "8670870",  noaaZone: { id: "AMZ384", description: "Savannah GA to Altamaha Sound GA, 20-60nm" } },
  "Wrightsville Beach, NC": { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wrightsvillebeachnc_noaa.json", tideStation: "8658163",  noaaZone: { id: "AMZ280", description: "Surf City NC to Little River Inlet SC, 20-60nm" } },
    // ── Northeast Florida Region ─────────────────────────────────────────────
    // "Mayport, FL" and "St. Augustine, FL" reuse the ga_sc entries above (same
    // physical ports, same label strings) — only the 7 new ports need entries here.
  "Ponce Inlet, FL":        { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/ponceinletfl_noaa.json",         tideStation: "8721147",  noaaZone: { id: "AMZ570", description: "Flagler Beach to Volusia-Brevard County Line FL, 20-60nm" } },
  "Port Canaveral, FL":     { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/portcanaveralfl_noaa.json",      tideStation: "8721604",  noaaZone: { id: "AMZ572", description: "Volusia-Brevard County Line to Sebastian Inlet FL, 20-60nm" } },
  "Sebastian Inlet, FL":    { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/sebastianinletfl_noaa.json",     tideStation: "8722004",  noaaZone: { id: "AMZ575", description: "Sebastian Inlet to Jupiter Inlet FL, 20-60nm" } },
  "Fort Pierce, FL":        { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fortpiercefl_noaa.json",         tideStation: "8722212",  noaaZone: { id: "AMZ575", description: "Sebastian Inlet to Jupiter Inlet FL, 20-60nm" } },
  "Stuart, FL":              { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stuartfl_noaa.json",             tideStation: "8722357",  noaaZone: { id: "AMZ575", description: "Sebastian Inlet to Jupiter Inlet FL, 20-60nm" } },
  "Lake Worth Inlet, FL":   { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/lakeworthinletfl_noaa.json",     tideStation: "8722588",  noaaZone: { id: "AMZ670", description: "Jupiter Inlet to Deerfield Beach FL, 20-60nm" } },
  "Fort Lauderdale, FL":    { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fortlauderdalefl_noaa.json",     tideStation: "8722956",  noaaZone: { id: "AMZ671", description: "Deerfield Beach to Ocean Reef FL, 20-60nm" } },
    // ── Virginia to Rhode Island Region ──────────────────────────────────────
    // "Virginia Beach, VA" reuses the mid_atlantic entry above (same label,
    // same physical port/zone). "Ocean City Inlet, MD" also reuses the
    // mid_atlantic entry above (same label). Only the remaining 15 new ports
    // need entries here.
  "Wachapreague, VA":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wachapreagueva_noaa.json",     tideStation: "8631044", noaaZone: { id: "ANZ684", description: "Parramore Island VA to Cape Charles Light, 20-60nm" } },
  "Chincoteague, VA":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/chincoteagueva_noaa.json",     tideStation: "8630249", noaaZone: { id: "ANZ682", description: "Chincoteague VA to Parramore Island VA, 20-60nm" } },
  "Indian River Inlet, DE": { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/indianriverinletde_noaa.json", tideStation: "8557380", noaaZone: { id: "ANZ485", description: "Cape May NJ to Fenwick Island DE, 20-60nm" } },
  "Cape May, NJ":           { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/capemaynj_noaa.json",           tideStation: "8536110", noaaZone: { id: "ANZ485", description: "Cape May NJ to Fenwick Island DE, 20-60nm" } },
  "Atlantic City, NJ":      { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/atlanticcitynj_noaa.json",      tideStation: "8534720", noaaZone: { id: "ANZ482", description: "Little Egg Inlet NJ to Great Egg Inlet NJ, 20-60nm" } },
  "Barnegat Light, NJ":     { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/barnegatlightnj_noaa.json",     tideStation: "8533615", noaaZone: { id: "ANZ481", description: "Manasquan Inlet NJ to Little Egg Inlet NJ, 20-60nm" } },
  "Manasquan, NJ":          { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/manasquannj_noaa.json",         tideStation: "8532585", noaaZone: { id: "ANZ480", description: "Sandy Hook NJ to Manasquan Inlet NJ, 20-40nm" } },
  "Sandy Hook, NJ":         { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/sandyhooknj_noaa.json",         tideStation: "8531680", noaaZone: { id: "ANZ385", description: "Sandy Hook NJ to Fire Island Inlet NY, 20-60nm" } },
  "Freeport, NY":           { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/freeportny_noaa.json",          tideStation: "8516385", noaaZone: { id: "ANZ385", description: "Sandy Hook NJ to Fire Island Inlet NY, 20-60nm" } },
  "Captree, NY":            { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/captreeny_noaa.json",           tideStation: "8515186", noaaZone: { id: "ANZ385", description: "Sandy Hook NJ to Fire Island Inlet NY, 20-60nm" } },
  "Shinnecock Inlet, NY":   { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/shinnecockny_noaa.json",        tideStation: "8512354", noaaZone: { id: "ANZ380", description: "Moriches Inlet NY to Montauk Point NY, 20-60nm" } },
  "Montauk, NY":            { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/montaukny_noaa.json",          tideStation: "8510560", noaaZone: { id: "ANZ380", description: "Moriches Inlet NY to Montauk Point NY, 20-60nm" } },
  "Stonington, CT":         { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stoningtonct_noaa.json",        tideStation: "8458694", noaaZone: { id: "ANZ237", description: "Block Island Sound, bay waters (no 20-60nm offshore equivalent)" } },
  "Point Judith, RI":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/pointjudithri_noaa.json",       tideStation: "8455083", noaaZone: { id: "ANZ283", description: "Montauk NY to Martha's Vineyard, 25-60nm" } },
  "Newport, RI":            { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/newportri_noaa.json",          tideStation: "8452660", noaaZone: { id: "ANZ283", description: "Montauk NY to Martha's Vineyard, 25-60nm" } }

};

// ─────────────────────────────────────────────────────────────────────────────
// Nearshore/offshore zone resolution
// ─────────────────────────────────────────────────────────────────────────────
// Resolves which { forecastJsonUrl, noaaZone } to use for a given source entry
// and zoneMode. Handles both shapes: the new { offshore, nearshore? } shape
// and the legacy flat shape (forecastJsonUrl/noaaZone directly on source) used
// by locations not yet migrated to the toggle — those are always offshore-only.
function resolveZoneSource(source, zoneMode) {
  if (source.offshore) {
    return source[zoneMode] ?? source.offshore;
  }
  return source; // legacy flat entry
}

const ZONE_MODE_STORAGE_KEY = "sst_zoneMode";

function getStoredZoneMode() {
  if (typeof window === "undefined") return "offshore";
  try {
    return window.localStorage.getItem(ZONE_MODE_STORAGE_KEY) === "nearshore" ? "nearshore" : "offshore";
  } catch {
    return "offshore";
  }
}

function storeZoneMode(mode) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ZONE_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache. Keyed by `${locationLabel}::${zoneMode}`.
// ─────────────────────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Hourly cache: keyed by `${forecastHourlyUrl}::${date}`
const hourlyCache = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Individual fetch helpers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMarineForecast(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Marine forecast fetch failed: HTTP ${res.status}`);
  return res.json();
}

async function fetchTides(stationId) {
  const days = Array.from({ length: 7 }, (_, i) =>
    moment().add(i, "days").format("YYYY-MM-DD")
  );

  const results = await Promise.allSettled(
    days.map(async date => {
      const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
        `?station=${stationId}` +
        `&begin_date=${date}` +
        `&end_date=${date}` +
        `&product=predictions` +
        `&datum=mllw` +
        `&time_zone=lst_ldt` +
        `&interval=hilo` +
        `&units=english` +
        `&format=json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`tide HTTP ${res.status}`);
      const json = await res.json();
      const predictions = (json.predictions ?? []).map(p => ({
        t:    p.t,
        v:    parseFloat(p.v),
        type: p.type === "H" ? "High" : "Low",
      }));
      return [date, predictions];
    })
  );

  const tideMap = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const [date, predictions] = r.value;
      if (predictions.length) tideMap[date] = predictions;
    } else {
      console.warn(`[useMarineForecast] tide fetch failed for ${days[i]}:`, r.reason);
    }
  });
  return tideMap;
}

async function fetchNws(lat, lon) {
  const headers = { "Accept": "application/geo+json" };

  const pointsRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, { headers });
  if (!pointsRes.ok) throw new Error(`NWS points HTTP ${pointsRes.status}`);
  const pointsData = await pointsRes.json();

  const forecastUrl       = pointsData?.properties?.forecast;
  const forecastHourlyUrl = pointsData?.properties?.forecastHourly ?? null;
  if (!forecastUrl) throw new Error("NWS points response missing forecast URL");

  const forecastRes = await fetch(forecastUrl, { headers });
  if (!forecastRes.ok) throw new Error(`NWS forecast HTTP ${forecastRes.status}`);
  const forecastData = await forecastRes.json();

  const periods = forecastData?.properties?.periods ?? [];
  const map = {};
  for (const period of periods) {
    const date = period.startTime.split("T")[0];
    if (!map[date]) {
      map[date] = {
        high: null, low: null,
        dayForecast: null, nightForecast: null,
        dayPrecip: null, nightPrecip: null,
      };
    }
    if (period.isDaytime) {
      map[date].high = period.temperature;
      map[date].dayForecast = period.shortForecast;
      map[date].dayPrecip = period.probabilityOfPrecipitation?.value ?? null;
    } else {
      map[date].low = period.temperature;
      map[date].nightForecast = period.shortForecast;
      map[date].nightPrecip = period.probabilityOfPrecipitation?.value ?? null;
    }
  }
  return { map, forecastHourlyUrl };
}

// Active hazardous-weather alerts (Small Craft Advisory, Gale Warning, etc.)
// for a NOAA marine zone. Same live-fetch pattern as fetchTides/fetchNws
// (api.weather.gov) — not baked into the scraped JSON because alerts have
// precise onset/expires timestamps that change throughout the day, unlike
// the scraper's periodic snapshot.
async function fetchAlerts(zoneId) {
  if (!zoneId) return [];
  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active/zone/${zoneId}`,
      { headers: { "Accept": "application/geo+json" } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const features = json?.features ?? [];
    return features.map(f => {
      const p = f.properties ?? {};
      return {
        event:       p.event ?? null,
        headline:    p.headline ?? null,
        severity:    p.severity ?? null,
        onset:       p.onset ?? p.effective ?? null,
        expires:     p.expires ?? p.ends ?? null,
        description: p.description ?? null,
        instruction: p.instruction ?? null,
      };
    });
  } catch (e) {
    console.warn("[useMarineForecast] alerts fetch failed:", e);
    return [];
  }
}

function computeSun(lat, lon, numDays = 7) {
  const sunMap = {};
  for (let i = 0; i < numDays; i++) {
    const date = moment().add(i, "days").toDate();
    const dateKey = moment(date).format("YYYY-MM-DD");
    const times = SunCalc.getTimes(date, lat, lon);
    sunMap[dateKey] = {
      sunrise: times.sunrise.toISOString(),
      sunset:  times.sunset.toISOString(),
    };
  }
  return sunMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// On-demand hourly fetch — exported for use in components
// ─────────────────────────────────────────────────────────────────────────────
// Returns array of hour objects for the given date (YYYY-MM-DD):
//   { hour: "2 PM", temp: 78, precip: 20, wind: "10 mph SW", forecast: "Partly Cloudy" }
// Results are cached for the session — re-opening the same day is instant.

export async function fetchHourlyForecast(forecastHourlyUrl, date) {
  if (!forecastHourlyUrl) throw new Error("No hourly forecast URL available");

  const cacheKey = `${forecastHourlyUrl}::${date}`;
  if (hourlyCache.has(cacheKey)) return hourlyCache.get(cacheKey);

  const res = await fetch(forecastHourlyUrl, { headers: { "Accept": "application/geo+json" } });
  if (!res.ok) throw new Error(`NWS hourly HTTP ${res.status}`);
  const json = await res.json();

  const allPeriods = json?.properties?.periods ?? [];

  // Filter to the requested date and normalise each hour
  const hours = allPeriods
    .filter(p => p.startTime.startsWith(date))
    .map(p => {
      const d = new Date(p.startTime);
      const hr = d.getHours();
      const label = hr === 0 ? "12 AM" : hr < 12 ? `${hr} AM` : hr === 12 ? "12 PM" : `${hr - 12} PM`;
      return {
        hour:     label,
        temp:     p.temperature,                                    // °F
        precip:   p.probabilityOfPrecipitation?.value ?? 0,         // %
        wind:     `${p.windSpeed} ${p.windDirection}`,
        forecast: p.shortForecast,
        isDaytime: p.isDaytime,
      };
    });

  hourlyCache.set(cacheKey, hours);
  return hours;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregator
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAll(location, zoneMode) {
  const source = NOAA_SOURCES[location.label];
  if (!source) throw new Error(`No NOAA source for ${location.label}`);
  const zoneSource = resolveZoneSource(source, zoneMode);

  const sun = computeSun(location.lat, location.lon, 7);

  const [forecastResult, tidesResult, nwsResult, alertsResult] = await Promise.allSettled([
    fetchMarineForecast(zoneSource.forecastJsonUrl),
    fetchTides(source.tideStation),
    fetchNws(location.lat, location.lon),
    fetchAlerts(zoneSource.noaaZone?.id),
  ]);

  if (forecastResult.status === "rejected") {
    throw forecastResult.reason;
  }

  const nwsValue = nwsResult.status === "fulfilled" ? nwsResult.value : { map: {}, forecastHourlyUrl: null };

  return {
    forecast:           forecastResult.value,
    tides:              tidesResult.status === "fulfilled" ? tidesResult.value : {},
    nws:                nwsValue.map,
    forecastHourlyUrl:  nwsValue.forecastHourlyUrl,
    noaaZone:           zoneSource.noaaZone ?? null,
    alerts:             alertsResult.status === "fulfilled" ? alertsResult.value : [],
    sun,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useMarineForecast(selectedLocation) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const [zoneMode, setZoneModeState] = useState(getStoredZoneMode);

  const source = selectedLocation?.label ? NOAA_SOURCES[selectedLocation.label] : null;
  const isAvailable = !!source;
  const hasNearshore = !!source?.nearshore;
  // Locations without a nearshore option always show offshore, regardless of
  // the user's stored preference — the toggle is hidden but the preference
  // itself is untouched, so it's restored when they pick an open-ocean location again.
  const effectiveZoneMode = hasNearshore ? zoneMode : "offshore";

  const setZoneMode = useCallback((mode) => {
    setZoneModeState(mode);
    storeZoneMode(mode);
  }, []);

  useEffect(() => {
    if (!selectedLocation || !isAvailable) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const label = selectedLocation.label;
    const cacheKey = `${label}::${effectiveZoneMode}`;

    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setState({ data: cached.data, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    fetchAll(selectedLocation, effectiveZoneMode)
      .then(data => {
        if (cancelled) return;
        cache.set(cacheKey, { data, fetchedAt: Date.now() });
        setState({ data, loading: false, error: null });
      })
      .catch(error => {
        if (cancelled) return;
        console.error("[useMarineForecast] fetch failed:", error);
        setState({ data: null, loading: false, error });
      });

    return () => { cancelled = true; };
  }, [selectedLocation?.label, isAvailable, effectiveZoneMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, isAvailable, hasNearshore, zoneMode: effectiveZoneMode, setZoneMode };
}