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
//
// On-demand tide curve fetch (for the tide detail popup):
//   import { fetchTideCurve, getMoonPhase } from "@/hooks/useMarineForecast";
//   const points = await fetchTideCurve(data.tideStation, "2026-06-07");
//   // points: array of { t: Date, v: number } — 6-minute-interval water level
//   const moon = getMoonPhase(new Date());
//   // moon: { fraction, illumination, waxing }

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
  "Beaufort, SC": {
    tideStation: "8667999",   // corrected 2026-07-18: prior ID did not exist in NOAA's system
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortsc_noaa.json", noaaZone: { id: "AMZ382", description: "Edisto Beach SC to Savannah GA, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/beaufortsc_noaa_nearshore.json", noaaZone: { id: "AMZ362", description: "Edisto Beach SC to Savannah GA, 0-20nm" } },
  },
  "Carolina Beach, NC": {
    tideStation: "8658120",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/carolinabeachnc_noaa.json", noaaZone: { id: "AMZ280", description: "Surf City NC to Little River Inlet SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/carolinabeachnc_noaa_nearshore.json", noaaZone: { id: "AMZ250", description: "Surf City to Cape Fear NC, 0-20nm" } },
  },
  "Charleston, SC": {
    tideStation: "8665530",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/charlestonsc_noaa.json", noaaZone: { id: "AMZ380", description: "S. Santee River to Edisto Beach SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/charlestonsc_noaa_nearshore.json", noaaZone: { id: "AMZ360", description: "S. Santee River to Edisto Beach SC, 0-20nm" } },
  },
  "Darien, GA": {
    tideStation: "8670870",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/darienga_noaa.json", noaaZone: { id: "AMZ384", description: "Savannah GA to Altamaha Sound GA, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/darienga_noaa_nearshore.json", noaaZone: { id: "AMZ364", description: "Savannah GA to Altamaha Sound GA, 0-20nm" } },
  },
  "Fernandina Beach, FL": {
    tideStation: "8720030",   // corrected 2026-07-18: prior ID did not exist in NOAA's system
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fernandinafl_noaa.json", noaaZone: { id: "AMZ470", description: "Altamaha Sound GA to Fernandina Beach FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fernandinafl_noaa_nearshore.json", noaaZone: { id: "AMZ450", description: "Altamaha Sound GA to Fernandina Beach FL, 0-20nm" } },
  },
  "Georgetown, SC": {
    tideStation: "8665530",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/georgetownsc_noaa.json", noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/georgetownsc_noaa_nearshore.json", noaaZone: { id: "AMZ256", description: "Murrells Inlet to S. Santee River SC, 0-20nm" } },
  },
  "Hilton Head, SC": {
    tideStation: "8667999",   // corrected 2026-07-18: prior ID did not exist in NOAA's system
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hiltonheadsc_noaa.json", noaaZone: { id: "AMZ382", description: "Edisto Beach SC to Savannah GA, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/hiltonheadsc_noaa_nearshore.json", noaaZone: { id: "AMZ362", description: "Edisto Beach SC to Savannah GA, 0-20nm" } },
  },
  "Jekyll Island, GA": {
    tideStation: "8679511",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/jekyllga_noaa.json", noaaZone: { id: "AMZ470", description: "Altamaha Sound GA to Fernandina Beach FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/jekyllga_noaa_nearshore.json", noaaZone: { id: "AMZ450", description: "Altamaha Sound GA to Fernandina Beach FL, 0-20nm" } },
  },
  "Little River Inlet, SC": {
    tideStation: "8661070",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/littleriversc_noaa.json", noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/littleriversc_noaa_nearshore.json", noaaZone: { id: "AMZ254", description: "Little River Inlet to Murrells Inlet SC, 0-20nm" } },
  },
  "Mayport, FL": {
    tideStation: "8720218",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/mayportfl_noaa.json", noaaZone: { id: "AMZ472", description: "Fernandina Beach to St. Augustine FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/mayportfl_noaa_nearshore.json", noaaZone: { id: "AMZ452", description: "Fernandina Beach to St. Augustine FL, 0-20nm" } },
  },
  "Murrells Inlet, SC": {
    tideStation: "8661070",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/murrellsinletsc_noaa.json", noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/murrellsinletsc_noaa_nearshore.json", noaaZone: { id: "AMZ256", description: "Murrells Inlet to S. Santee River SC, 0-20nm" } },
  },
  "Myrtle Beach, SC": {
    tideStation: "8661070",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/myrtlebeachsc_noaa.json", noaaZone: { id: "AMZ284", description: "Little River Inlet to S. Santee River SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/myrtlebeachsc_noaa_nearshore.json", noaaZone: { id: "AMZ254", description: "Little River Inlet to Murrells Inlet SC, 0-20nm" } },
  },
  "Southport, NC": {
    tideStation: "8659084",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/southportnc_noaa.json", noaaZone: { id: "AMZ280", description: "Surf City NC to Little River Inlet SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/southportnc_noaa_nearshore.json", noaaZone: { id: "AMZ252", description: "Cape Fear to Little River Inlet SC, 0-20nm" } },
  },
  "St. Augustine, FL": {
    tideStation: "8720587",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/staugustinefl_noaa.json", noaaZone: { id: "AMZ474", description: "St. Augustine to Flagler Beach FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/staugustinefl_noaa_nearshore.json", noaaZone: { id: "AMZ454", description: "St. Augustine to Flagler Beach FL, 0-20nm" } },
  },
  "St. Simons Island, GA": {
    tideStation: "8679511",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stsimonsgaga_noaa.json", noaaZone: { id: "AMZ470", description: "Altamaha Sound GA to Fernandina Beach FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stsimonsgaga_noaa_nearshore.json", noaaZone: { id: "AMZ450", description: "Altamaha Sound GA to Fernandina Beach FL, 0-20nm" } },
  },
  "Tybee Island, GA": {
    tideStation: "8670870",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/tybeega_noaa.json", noaaZone: { id: "AMZ384", description: "Savannah GA to Altamaha Sound GA, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/tybeega_noaa_nearshore.json", noaaZone: { id: "AMZ364", description: "Savannah GA to Altamaha Sound GA, 0-20nm" } },
  },
  "Wrightsville Beach, NC": {
    tideStation: "8658163",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wrightsvillebeachnc_noaa.json", noaaZone: { id: "AMZ280", description: "Surf City NC to Little River Inlet SC, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wrightsvillebeachnc_noaa_nearshore.json", noaaZone: { id: "AMZ250", description: "Surf City to Cape Fear NC, 0-20nm" } },
  },
    // ── Northeast Florida Region ─────────────────────────────────────────────
    // "Mayport, FL" and "St. Augustine, FL" reuse the ga_sc entries above (same
    // physical ports, same label strings) — only the 7 new ports need entries here.
  "Ponce Inlet, FL": {
    tideStation: "8721147",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/ponceinletfl_noaa.json", noaaZone: { id: "AMZ570", description: "Flagler Beach to Volusia-Brevard County Line FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/ponceinletfl_noaa_nearshore.json", noaaZone: { id: "AMZ550", description: "Flagler Beach to Volusia-Brevard County Line FL, 0-20nm" } },
  },
  "Port Canaveral, FL": {
    tideStation: "8721604",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/portcanaveralfl_noaa.json", noaaZone: { id: "AMZ572", description: "Volusia-Brevard County Line to Sebastian Inlet FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/portcanaveralfl_noaa_nearshore.json", noaaZone: { id: "AMZ552", description: "Volusia-Brevard County Line to Sebastian Inlet FL, 0-20nm" } },
  },
  "Sebastian Inlet, FL": {
    tideStation: "8722004",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/sebastianinletfl_noaa.json", noaaZone: { id: "AMZ575", description: "Sebastian Inlet to Jupiter Inlet FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/sebastianinletfl_noaa_nearshore.json", noaaZone: { id: "AMZ555", description: "Sebastian Inlet to Jupiter Inlet FL, 0-20nm" } },
  },
  "Fort Pierce, FL": {
    tideStation: "8722212",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fortpiercefl_noaa.json", noaaZone: { id: "AMZ575", description: "Sebastian Inlet to Jupiter Inlet FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fortpiercefl_noaa_nearshore.json", noaaZone: { id: "AMZ555", description: "Sebastian Inlet to Jupiter Inlet FL, 0-20nm" } },
  },
  "Stuart, FL": {
    tideStation: "8722357",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stuartfl_noaa.json", noaaZone: { id: "AMZ575", description: "Sebastian Inlet to Jupiter Inlet FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stuartfl_noaa_nearshore.json", noaaZone: { id: "AMZ555", description: "Sebastian Inlet to Jupiter Inlet FL, 0-20nm" } },
  },
  "Lake Worth Inlet, FL": {
    tideStation: "8722588",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/lakeworthinletfl_noaa.json", noaaZone: { id: "AMZ670", description: "Jupiter Inlet to Deerfield Beach FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/lakeworthinletfl_noaa_nearshore.json", noaaZone: { id: "AMZ650", description: "Jupiter Inlet to Deerfield Beach FL, 0-20nm" } },
  },
  "Fort Lauderdale, FL": {
    tideStation: "8722956",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fortlauderdalefl_noaa.json", noaaZone: { id: "AMZ671", description: "Deerfield Beach to Ocean Reef FL, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/fortlauderdalefl_noaa_nearshore.json", noaaZone: { id: "AMZ651", description: "Deerfield Beach to Ocean Reef FL, 0-20nm" } },
  },
    // ── Southern Florida Region ──────────────────────────────────────────────
    // "Fort Pierce, FL", "Stuart, FL", "Lake Worth Inlet, FL", and
    // "Fort Lauderdale, FL" reuse the ne_fl entries above (same labels, same
    // physical ports/zones). Only the 7 new ports below need entries here.
    // Offshore only (20-60nm) -- no nearshore/offshore toggle for this region
    // yet; all 5 new zone IDs (AMZ671 reused, GMZ072/073/074/676/876)
    // verified live against marine.weather.gov 2026-07-19, not pattern-matched.
  "Miami, FL": {
    tideStation: "8723178",   // Miami Beach, Government Cut, FL
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/miamifl_noaa.json", noaaZone: { id: "AMZ671", description: "Deerfield Beach to Ocean Reef FL, 20-60nm" } },
  },
  "Islamorada, FL": {
    tideStation: "8723797",   // Whale Harbor Channel, Windley Key, FL
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/islamoradafl_noaa.json", noaaZone: { id: "GMZ072", description: "Straits of Florida from Ocean Reef to Craig Key, 20-60nm" } },
  },
  "Marathon, FL": {
    tideStation: "8723970",   // Vaca Key, Florida Bay, FL
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/marathonfl_noaa.json", noaaZone: { id: "GMZ073", description: "Straits of Florida from Craig Key to west end of Seven Mile Bridge, 20-60nm" } },
  },
  "Key West, FL": {
    tideStation: "8724580",   // Key West, FL
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/keywestfl_noaa.json", noaaZone: { id: "GMZ074", description: "Straits of Florida from west end of Seven Mile Bridge to south of Halfmoon Shoal, 20-60nm" } },
  },
  "Naples, FL": {
    tideStation: "8725110",   // Naples, FL
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/naplesfl_noaa.json", noaaZone: { id: "GMZ676", description: "Waters from Chokoloskee to Bonita Beach FL, 20-60nm" } },
  },
  "Marco Island, FL": {
    tideStation: "8724967",   // Marco Island, Caxambas Pass, FL
    // Same zone as Naples -- both fall in MFL's Gulf-side GMZ676 strip.
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/marcoislandfl_noaa.json", noaaZone: { id: "GMZ676", description: "Waters from Chokoloskee to Bonita Beach FL, 20-60nm" } },
  },
  "Fort Myers Beach, FL": {
    tideStation: "8725366",   // Matanzas Pass, Estero Island, FL
    offshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/ftmyersbeachfl_noaa.json", noaaZone: { id: "GMZ876", description: "Waters from Bonita Beach to Englewood FL, 20-60nm" } },
  },
    // ── Virginia to Rhode Island Region ──────────────────────────────────────
    // "Virginia Beach, VA" reuses the mid_atlantic entry above (same label,
    // same physical port/zone). "Ocean City Inlet, MD" also reuses the
    // mid_atlantic entry above (same label). Only the remaining 15 new ports
    // need entries here. Stonington, CT is bay-only (no offshore/nearshore split).
  "Wachapreague, VA": {
    tideStation: "8631044",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wachapreagueva_noaa.json", noaaZone: { id: "ANZ684", description: "Parramore Island VA to Cape Charles Light, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/wachapreagueva_noaa_nearshore.json", noaaZone: { id: "ANZ654", description: "Parramore Island to Cape Charles Light VA, 0-20nm" } },
  },
  "Chincoteague, VA": {
    tideStation: "8630249",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/chincoteagueva_noaa.json", noaaZone: { id: "ANZ682", description: "Chincoteague VA to Parramore Island VA, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/chincoteagueva_noaa_nearshore.json", noaaZone: { id: "ANZ652", description: "Chincoteague to Parramore Island VA, 0-20nm" } },
  },
  "Indian River Inlet, DE": {
    tideStation: "8557380",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/indianriverinletde_noaa.json", noaaZone: { id: "ANZ485", description: "Cape May NJ to Fenwick Island DE, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/indianriverinletde_noaa_nearshore.json", noaaZone: { id: "ANZ455", description: "Cape Henlopen to Fenwick Island DE, 0-20nm" } },
  },
  "Cape May, NJ": {
    tideStation: "8536110",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/capemaynj_noaa.json", noaaZone: { id: "ANZ485", description: "Cape May NJ to Fenwick Island DE, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/capemaynj_noaa_nearshore.json", noaaZone: { id: "ANZ454", description: "Cape May NJ to Cape Henlopen DE, 0-20nm" } },
  },
  "Atlantic City, NJ": {
    tideStation: "8534720",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/atlanticcitynj_noaa.json", noaaZone: { id: "ANZ482", description: "Little Egg Inlet NJ to Great Egg Inlet NJ, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/atlanticcitynj_noaa_nearshore.json", noaaZone: { id: "ANZ452", description: "Little Egg Inlet to Great Egg Inlet NJ, 0-20nm" } },
  },
  "Barnegat Light, NJ": {
    tideStation: "8533615",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/barnegatlightnj_noaa.json", noaaZone: { id: "ANZ481", description: "Manasquan Inlet NJ to Little Egg Inlet NJ, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/barnegatlightnj_noaa_nearshore.json", noaaZone: { id: "ANZ451", description: "Manasquan Inlet to Little Egg Inlet NJ, 0-20nm" } },
  },
  "Manasquan, NJ": {
    tideStation: "8532585",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/manasquannj_noaa.json", noaaZone: { id: "ANZ480", description: "Sandy Hook NJ to Manasquan Inlet NJ, 20-40nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/manasquannj_noaa_nearshore.json", noaaZone: { id: "ANZ450", description: "Sandy Hook to Manasquan Inlet NJ, 0-20nm" } },
  },
  "Sandy Hook, NJ": {
    tideStation: "8531680",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/sandyhooknj_noaa.json", noaaZone: { id: "ANZ385", description: "Sandy Hook NJ to Fire Island Inlet NY, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/sandyhooknj_noaa_nearshore.json", noaaZone: { id: "ANZ355", description: "Sandy Hook NJ to Fire Island Inlet NY, 0-20nm" } },
  },
  "Freeport, NY": {
    tideStation: "8516385",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/freeportny_noaa.json", noaaZone: { id: "ANZ385", description: "Sandy Hook NJ to Fire Island Inlet NY, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/freeportny_noaa_nearshore.json", noaaZone: { id: "ANZ355", description: "Sandy Hook NJ to Fire Island Inlet NY, 0-20nm" } },
  },
  "Captree, NY": {
    tideStation: "8515186",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/captreeny_noaa.json", noaaZone: { id: "ANZ385", description: "Sandy Hook NJ to Fire Island Inlet NY, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/captreeny_noaa_nearshore.json", noaaZone: { id: "ANZ355", description: "Sandy Hook NJ to Fire Island Inlet NY, 0-20nm" } },
  },
  "Shinnecock Inlet, NY": {
    tideStation: "8512354",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/shinnecockny_noaa.json", noaaZone: { id: "ANZ380", description: "Moriches Inlet NY to Montauk Point NY, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/shinnecockny_noaa_nearshore.json", noaaZone: { id: "ANZ350", description: "Moriches Inlet NY to Montauk Point NY, 0-20nm" } },
  },
  "Montauk, NY": {
    tideStation: "8510560",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/montaukny_noaa.json", noaaZone: { id: "ANZ380", description: "Moriches Inlet NY to Montauk Point NY, 20-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/montaukny_noaa_nearshore.json", noaaZone: { id: "ANZ350", description: "Moriches Inlet NY to Montauk Point NY, 0-20nm" } },
  },
  "Stonington, CT": {
    tideStation: "8458694",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/stoningtonct_noaa.json", noaaZone: { id: "ANZ237", description: "Block Island Sound, bay waters (no 20-60nm offshore equivalent)" } },
    // bay-only zone, no 20-60nm offshore equivalent — no nearshore toggle
  },
  "Point Judith, RI": {
    tideStation: "8455083",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/pointjudithri_noaa.json", noaaZone: { id: "ANZ283", description: "Montauk NY to Martha's Vineyard, 25-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/pointjudithri_noaa_nearshore.json", noaaZone: { id: "ANZ256", description: "Montauk NY to Martha's Vineyard, 0-20nm" } },
  },
  "Newport, RI": {
    tideStation: "8452660",
    offshore:  { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/newportri_noaa.json", noaaZone: { id: "ANZ283", description: "Montauk NY to Martha's Vineyard, 25-60nm" } },
    nearshore: { forecastJsonUrl: "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/newportri_noaa_nearshore.json", noaaZone: { id: "ANZ256", description: "Montauk NY to Martha's Vineyard, 0-20nm" } },
  },

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

// Tide curve cache: keyed by `${stationId}::${date}` — 6-minute-interval
// water-level points for the tide detail popup chart.
const tideCurveCache = new Map();

// Tide backup: a rolling 60-day window of hi/lo predictions for every
// departure-location tide station, computed independently of NOAA's live
// predictions/datagetter service (see tide_predictions_backup.py in the
// NOAAPARSE repo). Used only for dates the live NOAA call didn't return --
// added after a 2026-07-17/18 outage where NOAA's predictions endpoint
// returned no data for every station/date/datum for ~24 hours, leaving
// every location's tide panel showing "N/A". Fetched once per session and
// cached module-wide -- it's one combined file for all stations, and it
// only changes monthly, so there's no benefit to re-fetching per location.
const TIDE_BACKUP_URL = "https://raw.githubusercontent.com/jlintvet/NOAAPARSE/main/tide_predictions_backup.json";
let tideBackupPromise = null;

function fetchTideBackup() {
  if (!tideBackupPromise) {
    tideBackupPromise = fetch(TIDE_BACKUP_URL)
      .then(res => {
        if (!res.ok) throw new Error(`tide backup HTTP ${res.status}`);
        return res.json();
      })
      .catch(err => {
        console.warn("[useMarineForecast] tide backup fetch failed:", err);
        return null;
      });
  }
  return tideBackupPromise;
}

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

  // Fall back to the precomputed backup for any date the live call didn't
  // give us. Backup predictions are computed locally from NOAA's harmonic
  // constituents, not the predictions/datagetter service, so they stay
  // available through exactly the kind of outage that motivated this.
  const missingDays = days.filter(d => !tideMap[d] || !tideMap[d].length);
  if (missingDays.length) {
    const backup = await fetchTideBackup();
    const stationBackup = backup?.stations?.[stationId];
    if (stationBackup) {
      missingDays.forEach(date => {
        if (stationBackup[date]?.length) {
          tideMap[date] = stationBackup[date];
        }
      });
    }
  }

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
        // `ends` is the forecast hazard's actual end time (matches the headline,
        // e.g. "...until July 19 at 8:00AM EDT"). `expires` is unrelated — it's
        // when this alert *message* rolls off the active-alerts feed (often a
        // much earlier, unrelated technical timestamp) and was wrongly
        // preferred here, producing a bogus "until" time. Prefer `ends`; only
        // fall back to `expires` for open-ended hazards with no defined end.
        expires:     p.ends ?? p.expires ?? null,
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
// On-demand tide curve fetch — exported for use in the tide detail popup
// ─────────────────────────────────────────────────────────────────────────────
// Returns a full-resolution (6-minute-interval) water-level curve for a single
// day, used to draw a smooth tide chart. This is deliberately NOT fetched as
// part of fetchAll()/fetchTides() above — those only need hi/lo turn points
// for the compact forecast-card summary, and pulling 6-min data for 7 days
// across every station on every location load would be wasteful. Instead this
// is called lazily, the same way fetchHourlyForecast() is, when a user opens
// the popup for a specific day.

export async function fetchTideCurve(stationId, date) {
  if (!stationId) throw new Error("No tide station available");

  const cacheKey = `${stationId}::${date}`;
  if (tideCurveCache.has(cacheKey)) return tideCurveCache.get(cacheKey);

  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
    `?station=${stationId}` +
    `&begin_date=${date}` +
    `&end_date=${date}` +
    `&product=predictions` +
    `&datum=mllw` +
    `&time_zone=lst_ldt` +
    `&interval=6` +
    `&units=english` +
    `&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`tide curve HTTP ${res.status}`);
  const json = await res.json();

  const points = (json.predictions ?? []).map(p => ({
    t: new Date(p.t.replace(" ", "T")),
    v: parseFloat(p.v),
  }));

  tideCurveCache.set(cacheKey, points);
  return points;
}

// ─────────────────────────────────────────────────────────────────────────────
// Moon phase — computed locally via SunCalc (already a dependency for sun
// times), no separate API call needed.
// ─────────────────────────────────────────────────────────────────────────────
// Returns { fraction, illumination, waxing }:
//   fraction    — 0 = new moon, 0.5 = full moon, 1 = new moon again
//   illumination — 0-1 fraction of the disk lit (what "7%" in the reference
//                  design means)
//   waxing      — true if the illuminated fraction is increasing

export function getMoonPhase(date) {
  const { phase, fraction } = SunCalc.getMoonIllumination(date);
  return {
    fraction,
    illumination: fraction,
    waxing: phase < 0.5,
  };
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
    tideStation:        source.tideStation ?? null,
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