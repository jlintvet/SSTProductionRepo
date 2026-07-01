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
// API:
//   const { data, loading, error, isAvailable } = useMarineForecast(selectedLocation);
//   // data.forecastHourlyUrl — pass to fetchHourlyForecast() on day click
//
// On-demand hourly fetch (call from a component, not a hook):
//   import { fetchHourlyForecast } from "@/hooks/useMarineForecast";
//   const hours = await fetchHourlyForecast(data.forecastHourlyUrl, "2026-06-07");
//   // hours: array of { hour, temp, precip, wind, forecast } for that date

import { useEffect, useState } from "react";
import moment from "moment";
import SunCalc from "suncalc";

// ─────────────────────────────────────────────────────────────────────────────
// Location → NOAA data source mapping
// ─────────────────────────────────────────────────────────────────────────────
// Keyed by the exact `label` string from regionConfig.locations.

const NOAA_SOURCES = {
  "Oregon Inlet, NC": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/weather_data.json",
    tideStation:     "8652659",
  },
  "Hatteras Inlet, NC": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hatterasncnoaa.json",
    tideStation:     "8654467",
  },
  "Beaufort Inlet, NC": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortinletnoaa.json",
    tideStation:     "8656483",
  },
  "Poquoson, VA": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/poquosonnoaa.json",
    tideStation:     "8637689",   // Gloucester Point, VA
  },
  "Bay Bridge Tunnel, VA": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/baybridgetunnelnoaa.json",
    tideStation:     "8638863",   // Cape Henry, VA
  },
  "Virginia Beach, VA": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/virginiabeachnoaa.json",
    tideStation:     "8638863",   // Cape Henry, VA
  },
  "Ocean City Inlet, MD": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/oceancitynoaa.json",
    tideStation:     "8570283",   // Ocean City, MD
  },
  "Horn Harbor, VA": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hornharbornoaa.json",
    tideStation:     "8637689",   // Gloucester Point, VA
  },
  "Cape Charles, VA": {
    forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/capecharlesnoaa.json",
    tideStation:     "8632200",   // Cape Charles, VA
  },
    // ── GA/SC Region ───────────────────────────────────────────────────────────
  "Beaufort, SC":           { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortsc_noaa.json",         tideStation: "8670659" },  // Beaufort, SC — AMZ372 20-40nm
  "Carolina Beach, NC":     { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/carolinabeachnc_noaa.json",     tideStation: "8658120" },  // Carolina Beach, NC — AMZ270 20-40nm
  "Charleston, SC":         { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/charlestonsc_noaa.json",        tideStation: "8665530" },  // Charleston, SC — AMZ370 20-40nm
  "Darien, GA":             { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/darienga_noaa.json",            tideStation: "8670870" },  // Darien, GA — AMZ374 20-60nm
  "Fernandina Beach, FL":   { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fernandinafl_noaa.json",        tideStation: "8720197" },  // Fernandina Beach, FL — AMZ452 out 20nm
  "Georgetown, SC":         { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/georgetownsc_noaa.json",        tideStation: "8665530" },  // Georgetown, SC — AMZ276 20-40nm
  "Hilton Head, SC":        { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hiltonheadsc_noaa.json",        tideStation: "8670659" },  // Hilton Head, SC — AMZ372 20-40nm
  "Jekyll Island, GA":      { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/jekyllga_noaa.json",            tideStation: "8679511" },  // Jekyll Island, GA — AMZ470 20-60nm
  "Little River Inlet, SC": { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/littleriversc_noaa.json",       tideStation: "8661070" },  // Little River Inlet, SC — AMZ274 20-40nm
  "Mayport, FL":            { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/mayportfl_noaa.json",           tideStation: "8720218" },  // Mayport, FL — AMZ452 out 20nm
  "Murrells Inlet, SC":     { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/murrellsinletsc_noaa.json",     tideStation: "8661070" },  // Murrells Inlet, SC — AMZ276 20-40nm
  "Myrtle Beach, SC":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/myrtlebeachsc_noaa.json",       tideStation: "8661070" },  // Myrtle Beach, SC — AMZ274 20-40nm
  "Southport, NC":          { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/southportnc_noaa.json",         tideStation: "8659084" },  // Southport, NC — AMZ272 20-40nm
  "St. Augustine, FL":      { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/staugustinefl_noaa.json",       tideStation: "8720587" },  // St. Augustine, FL — AMZ454 out 20nm
  "St. Simons Island, GA":  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stsimonsgaga_noaa.json",        tideStation: "8679511" },  // St. Simons Island, GA — AMZ470 20-60nm
  "Tybee Island, GA":       { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/tybeega_noaa.json",             tideStation: "8670870" },  // Tybee Island, GA — AMZ374 20-60nm
  "Wrightsville Beach, NC": { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wrightsvillebeachnc_noaa.json", tideStation: "8658163" },  // Wrightsville Beach, NC — AMZ270 20-40nm

};

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache. Keyed by location label.
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
async function fetchAll(location) {
  const source = NOAA_SOURCES[location.label];
  if (!source) throw new Error(`No NOAA source for ${location.label}`);

  const sun = computeSun(location.lat, location.lon, 7);

  const [forecastResult, tidesResult, nwsResult] = await Promise.allSettled([
    fetchMarineForecast(source.forecastJsonUrl),
    fetchTides(source.tideStation),
    fetchNws(location.lat, location.lon),
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
    sun,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useMarineForecast(selectedLocation) {
  const [state, setState] = useState({ data: null, loading: false, error: null });

  const isAvailable = !!(selectedLocation?.label && NOAA_SOURCES[selectedLocation.label]);

  useEffect(() => {
    if (!selectedLocation || !isAvailable) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const label = selectedLocation.label;

    const cached = cache.get(label);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setState({ data: cached.data, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    fetchAll(selectedLocation)
      .then(data => {
        if (cancelled) return;
        cache.set(label, { data, fetchedAt: Date.now() });
        setState({ data, loading: false, error: null });
      })
      .catch(error => {
        if (cancelled) return;
        console.error("[useMarineForecast] fetch failed:", error);
        setState({ data: null, loading: false, error });
      });

    return () => { cancelled = true; };
  }, [selectedLocation?.label, isAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, isAvailable };
}