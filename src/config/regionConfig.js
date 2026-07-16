// src/config/regionConfig.js
export const REGION_CONFIGS = {

  mid_atlantic: {
    label: "Mid-Atlantic",
    bounds: {
      north:  39.50,
      south:  33.70,
      west:  -78.84,
      east:  -72.21,
    },
    minZoom:       6,
    maxZoom:       11,
    defaultCenter: { lat: 35.7792, lon: -75.532 },
    defaultZoom:   7.5,
    defaultLocation: "Oregon Inlet, NC",
    dataPathSuffix: "",
    // Seasonal SST color range defaults (degrees F). Anchors the color ramp so
    // the same temperature always maps to the same hue regardless of daily data range.
    sstSeasonalDefaults: {
      summer: { min: 55, max: 85 }, // Jun-Sep: Gulf Stream 78-82, inshore 60-70
      fall:   { min: 52, max: 76 }, // Oct-Nov: cooling, offshore still warm
      winter: { min: 44, max: 65 }, // Dec-Feb: cold inshore, warmer offshore
      spring: { min: 50, max: 74 }, // Mar-May: gradual warming
    },
    locations: [
      { label: "Bay Bridge Tunnel, VA", lat: 36.9082,            lon: -76.0918,           wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
      { label: "Beaufort Inlet, NC",    lat: 34.6937,            lon: -76.6663,           wreckRegion: "MoreheadNC",   noaaCoverage: true  },
      { label: "Cape Charles, VA",      lat: 37.264139,          lon: -76.026920,         wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
      { label: "Hatteras Inlet, NC",    lat: 35.190505871104094, lon: -75.7554186087437,  wreckRegion: "HatterasNC",   noaaCoverage: true  },
      { label: "Horn Harbor, VA",       lat: 37.355565,          lon: -76.267948,         wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
      { label: "Ocean City Inlet, MD",  lat: 38.324,             lon: -75.0883,           wreckRegion: "OceanCityMD",  noaaCoverage: true  },
      { label: "Oregon Inlet, NC",      lat: 35.7792,            lon: -75.532,            wreckRegion: "HatterasNC",   noaaCoverage: true  },
      { label: "Poquoson, VA",          lat: 37.1788,            lon: -76.373,             wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
      { label: "Virginia Beach, VA",    lat: 36.8516,            lon: -75.9792,           wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
    ],
  },

  ga_sc: {
    label: "Georgia & South Carolina",
    bounds: {
      north:  35.20,  // northern limit: New Bern, NC
      south:  29.80,  // southern limit: St. Augustine, FL
      west:  -82.00,  // western limit:  Callahan, FL
      east:  -75.20,  // eastern limit:  ~65 nm east of Cape Lookout
    },
    minZoom:         6,
    maxZoom:         11,
    defaultCenter:   { lat: 32.50, lon: -78.60 },
    defaultZoom:     7,
    defaultLocation: "Charleston, SC",
    // Sub-path under SSTv2 repo where backend writes GA/SC data files.
    // e.g. DailySSTData/MUR/ga_sc/mur_YYYYMMDD.csv
    // Leave "" for mid_atlantic (uses root paths for backward compat).
    dataPathSuffix:  "ga_sc",
    // GA/SC runs 6-9 degF warmer than mid-Atlantic; Gulf Stream year-round.
    sstSeasonalDefaults: {
      summer: { min: 64, max: 88 }, // Jun-Sep: nearshore 78-84, Gulf Stream 84-88
      fall:   { min: 60, max: 82 }, // Oct-Nov: still warm offshore
      winter: { min: 52, max: 74 }, // Dec-Feb: mild winters, offshore 70+
      spring: { min: 58, max: 80 }, // Mar-May: Gulf Stream ~78
    },
    locations: [
      // noaaZone: zone used for offshore forecast; see docs/adding_a_new_region.md
      { label: "Beaufort Inlet, NC",     lat: 34.6937, lon: -76.6663, wreckRegion: "MoreheadNC",     noaaCoverage: true,  noaaZone: "AMZ186" },
      { label: "Beaufort, SC",           lat: 32.4316, lon: -80.6698, wreckRegion: "BeaufortSC",     noaaCoverage: true,  noaaZone: "AMZ372" },
      { label: "Carolina Beach, NC",     lat: 34.0370, lon: -77.8924, wreckRegion: "WilmingtonNC",   noaaCoverage: true,  noaaZone: "AMZ270" },
      { label: "Charleston, SC",         lat: 32.7765, lon: -79.9311, wreckRegion: "CharlestonSC",   noaaCoverage: true,  noaaZone: "AMZ370" },
      { label: "Darien, GA",             lat: 31.3704, lon: -81.4346, wreckRegion: "BrunswickGA",    noaaCoverage: true,  noaaZone: "AMZ374" },
      { label: "Fernandina Beach, FL",   lat: 30.6724, lon: -81.4628, wreckRegion: "FernandinaFL",   noaaCoverage: true,  noaaZone: "AMZ452" },
      { label: "Georgetown, SC",         lat: 33.3657, lon: -79.2842, wreckRegion: "GeorgetownSC",   noaaCoverage: true,  noaaZone: "AMZ276" },
      { label: "Hilton Head, SC",        lat: 32.1801, lon: -80.7482, wreckRegion: "HiltonHeadSC",   noaaCoverage: true,  noaaZone: "AMZ372" },
      { label: "Jekyll Island, GA",      lat: 31.0549, lon: -81.4166, wreckRegion: "BrunswickGA",    noaaCoverage: true,  noaaZone: "AMZ470" },
      { label: "Little River Inlet, SC", lat: 33.8645, lon: -78.5558, wreckRegion: "MyrtleBeachSC",  noaaCoverage: true,  noaaZone: "AMZ274" },
      { label: "Mayport, FL",            lat: 30.3966, lon: -81.4280, wreckRegion: "JacksonvilleFL", noaaCoverage: true,  noaaZone: "AMZ472" },
      { label: "Murrells Inlet, SC",     lat: 33.5526, lon: -79.0475, wreckRegion: "MyrtleBeachSC",  noaaCoverage: true,  noaaZone: "AMZ276" },
      { label: "Myrtle Beach, SC",       lat: 33.6891, lon: -78.8867, wreckRegion: "MyrtleBeachSC",  noaaCoverage: true,  noaaZone: "AMZ274" },
      { label: "Southport, NC",          lat: 33.9196, lon: -78.0144, wreckRegion: "WilmingtonNC",   noaaCoverage: true,  noaaZone: "AMZ272" },
      { label: "St. Augustine, FL",      lat: 29.8943, lon: -81.3126, wreckRegion: "StAugustineFL",  noaaCoverage: true,  noaaZone: "AMZ474" },
      { label: "St. Simons Island, GA",  lat: 31.1271, lon: -81.3912, wreckRegion: "BrunswickGA",    noaaCoverage: true,  noaaZone: "AMZ470" },
      { label: "Tybee Island, GA",       lat: 31.9988, lon: -80.8443, wreckRegion: "SavannahGA",     noaaCoverage: true,  noaaZone: "AMZ374" },
      { label: "Wrightsville Beach, NC", lat: 34.2115, lon: -77.7963, wreckRegion: "WilmingtonNC",   noaaCoverage: true,  noaaZone: "AMZ270" },
    ],
  },

  ne_fl: {
    label: "Northeast Florida",
    bounds: {
      north:  30.50,
      south:  26.00,
      west:  -81.97,
      east:  -76.14,
    },
    minZoom:         6,
    maxZoom:         11,
    defaultCenter:   { lat: 28.25, lon: -79.06 },
    defaultZoom:     7,
    defaultLocation: "Port Canaveral, FL",
    // Sub-path under SSTv2 repo where backend writes NE FL data files.
    // e.g. DailySSTData/MUR/ne_fl/mur_YYYYMMDD.csv
    // Leave "" for mid_atlantic (uses root paths for backward compat).
    dataPathSuffix:  "ne_fl",
    // South Florida runs warmer than ga_sc; these are best-guess estimates.
    sstSeasonalDefaults: {
      summer: { min: 72, max: 90 }, // Jun-Sep: nearshore 82-88, Gulf Stream close to shore
      fall:   { min: 68, max: 86 },
      winter: { min: 64, max: 82 }, // mild winters, Gulf Stream runs very close to shore south of Ft Pierce
      spring: { min: 68, max: 84 },
    },
    locations: [
      // noaaZone: zone used for offshore forecast; see docs/adding_a_new_region.md
      { label: "Mayport, FL",           lat: 30.3966, lon: -81.4280, wreckRegion: "JacksonvilleFL",   noaaCoverage: true, noaaZone: "AMZ472" },
      { label: "St. Augustine, FL",     lat: 29.8943, lon: -81.3126, wreckRegion: "StAugustineFL",     noaaCoverage: true, noaaZone: "AMZ474" },
      { label: "Ponce Inlet, FL",       lat: 29.0808, lon: -80.9284, wreckRegion: "PonceInletFL",      noaaCoverage: true, noaaZone: "AMZ570" },
      { label: "Port Canaveral, FL",    lat: 28.4158, lon: -80.5931, wreckRegion: "PortCanaveralFL",   noaaCoverage: true, noaaZone: "AMZ572" },
      { label: "Sebastian Inlet, FL",   lat: 27.8600, lon: -80.4483, wreckRegion: "SebastianInletFL",  noaaCoverage: true, noaaZone: "AMZ575" },
      { label: "Fort Pierce, FL",       lat: 27.4700, lon: -80.2883, wreckRegion: "FortPierceFL",      noaaCoverage: true, noaaZone: "AMZ575" },
      { label: "Stuart, FL",            lat: 27.1661, lon: -80.1567, wreckRegion: "StuartFL",          noaaCoverage: true, noaaZone: "AMZ575" },
      { label: "Lake Worth Inlet, FL",  lat: 26.7723, lon: -80.0373, wreckRegion: "LakeWorthFL",       noaaCoverage: true, noaaZone: "AMZ670" },
      { label: "Fort Lauderdale, FL",   lat: 26.0860, lon: -80.1160, wreckRegion: "FortLauderdaleFL",  noaaCoverage: true, noaaZone: "AMZ671" },
    ],
  },

  va_ri: {
    label: "Virginia to Rhode Island",
    bounds: {
      north:  41.51,
      south:  37.26,
      west:  -77.46,
      east:  -68.97,
    },
    minZoom:         6,
    maxZoom:         11,
    defaultCenter:   { lat: 39.39, lon: -73.22 },
    defaultZoom:     6.5,
    defaultLocation: "Montauk, NY",
    // Sub-path under SSTv2 repo where backend writes VA-RI data files.
    // e.g. DailySSTData/MUR/va_ri/mur_YYYYMMDD.csv
    // Leave "" for mid_atlantic (uses root paths for backward compat).
    dataPathSuffix:  "va_ri",
    // This region runs colder than mid_atlantic, especially in winter/spring
    // up toward Rhode Island Sound; these are best-guess estimates.
    sstSeasonalDefaults: {
      summer: { min: 55, max: 78 }, // Jun-Sep: nearshore up to high 70s, shelf water cooler than Gulf Stream regions
      fall:   { min: 46, max: 68 }, // Oct-Nov: rapid cooling north of Cape Cod latitudes
      winter: { min: 34, max: 50 }, // Dec-Feb: cold, near-freezing in shallow bays/sounds
      spring: { min: 40, max: 62 }, // Mar-May: slow warming
    },
    locations: [
      // noaaZone: zone used for offshore forecast; see docs/adding_a_new_region.md
      // Cape Charles, VA intentionally omitted — same physical port already
      // exists as "Cape Charles, VA" in mid_atlantic (bay-side, ANZ631); not
      // duplicated here to avoid a conflicting NOAA_SOURCES zone under one label.
      // Virginia Beach, VA intentionally omitted (removed 2026-07-12 per Jon).
      //
      // wreckRegion: every port below shares the single "VaToRI" region key.
      // Bottom features aren't tied to individual departure ports in this
      // region — every va_ri port shows the full VA-to-RI feature set rather
      // than a nearest-port subset. (Ocean City Inlet, MD previously reused
      // mid_atlantic's "OceanCityMD" wreck data specifically; it now uses
      // the shared va_ri pool like every other port here. Its NOAA_SOURCES
      // marine-forecast reuse via the matching label is unaffected.)
      { label: "Wachapreague, VA",           lat: 37.6078, lon: -75.6858, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ684" },
      { label: "Chincoteague, VA",           lat: 37.9317, lon: -75.3833, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ682" },
      { label: "Ocean City Inlet, MD",       lat: 38.3283, lon: -75.0917, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ485" },
      { label: "Indian River Inlet, DE",     lat: 38.6100, lon: -75.0700, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ485" },
      { label: "Cape May, NJ",               lat: 38.9683, lon: -74.9600, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ485" },
      { label: "Atlantic City, NJ",          lat: 39.3567, lon: -74.4181, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ482" },
      { label: "Barnegat Light, NJ",         lat: 39.7617, lon: -74.1117, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ481" },
      { label: "Manasquan, NJ",              lat: 40.1050, lon: -74.0550, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ480" },
      { label: "Sandy Hook, NJ",             lat: 40.4669, lon: -74.0094, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ385" },
      { label: "Freeport, NY",               lat: 40.5867, lon: -73.5783, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ385" },
      { label: "Captree, NY",                lat: 40.6267, lon: -73.2600, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ385" },
      { label: "Shinnecock Inlet, NY",       lat: 40.8367, lon: -72.4800, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ380" },
      { label: "Montauk, NY",                lat: 41.0483, lon: -71.9594, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ380" },
      { label: "Stonington, CT",             lat: 41.3350, lon: -71.9050, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ237" },
      { label: "Point Judith, RI",           lat: 41.3633, lon: -71.4900, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ283" },
      { label: "Newport, RI",                lat: 41.5043, lon: -71.3261, wreckRegion: "VaToRI", noaaCoverage: true, noaaZone: "ANZ283" },
    ],
  },

};

export const DEFAULT_REGION = "mid_atlantic";

export function getRegionConfig(regionKey) {
  return REGION_CONFIGS[regionKey] ?? REGION_CONFIGS[DEFAULT_REGION];
}

function getSeason(month) {
  if (month >= 6 && month <= 9)   return "summer";
  if (month >= 10 && month <= 11) return "fall";
  if (month === 12 || month <= 2) return "winter";
  return "spring";
}

/** Returns the seasonal SST color default for a region. Always {min,max} — never null. */
export function getSeasonalSstDefault(regionKey) {
  const cfg    = getRegionConfig(regionKey);
  const season = getSeason(new Date().getMonth() + 1);
  return cfg.sstSeasonalDefaults?.[season] ?? { min: 55, max: 85 };
}

export function getRegionBounds(regionConfig) {
  const b = regionConfig.bounds;
  return [[b.west, b.south], [b.east, b.north]];
}

export const getMapboxMaxBounds = getRegionBounds;
export const getRegionFitBounds = getRegionBounds;
export function getMinZoom(regionConfig) { return regionConfig.minZoom; }