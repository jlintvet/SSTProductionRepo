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
    locations: [
      // noaaZone: zone used for offshore forecast; see docs/adding_a_new_region.md
      { label: "Beaufort, SC",           lat: 32.4316, lon: -80.6698, wreckRegion: "BeaufortSC",     noaaCoverage: true,  noaaZone: "AMZ372" },
      { label: "Carolina Beach, NC",     lat: 34.0370, lon: -77.8924, wreckRegion: "WilmingtonNC",   noaaCoverage: true,  noaaZone: "AMZ270" },
      { label: "Charleston, SC",         lat: 32.7765, lon: -79.9311, wreckRegion: "CharlestonSC",   noaaCoverage: true,  noaaZone: "AMZ370" },
      { label: "Darien, GA",             lat: 31.3704, lon: -81.4346, wreckRegion: "BrunswickGA",    noaaCoverage: true,  noaaZone: "AMZ374" },
      { label: "Fernandina Beach, FL",   lat: 30.6724, lon: -81.4628, wreckRegion: "FernandinaFL",   noaaCoverage: true,  noaaZone: "AMZ452" },
      { label: "Georgetown, SC",         lat: 33.3657, lon: -79.2842, wreckRegion: "GeorgetownSC",   noaaCoverage: true,  noaaZone: "AMZ276" },
      { label: "Hilton Head, SC",        lat: 32.1801, lon: -80.7482, wreckRegion: "HiltonHeadSC",   noaaCoverage: true,  noaaZone: "AMZ372" },
      { label: "Jekyll Island, GA",      lat: 31.0549, lon: -81.4166, wreckRegion: "BrunswickGA",    noaaCoverage: true,  noaaZone: "AMZ470" },
      { label: "Little River Inlet, SC", lat: 33.8645, lon: -78.5558, wreckRegion: "MyrtleBeachSC",  noaaCoverage: true,  noaaZone: "AMZ274" },
      { label: "Mayport, FL",            lat: 30.3966, lon: -81.4280, wreckRegion: "JacksonvilleFL", noaaCoverage: true,  noaaZone: "AMZ452" },
      { label: "Murrells Inlet, SC",     lat: 33.5526, lon: -79.0475, wreckRegion: "MyrtleBeachSC",  noaaCoverage: true,  noaaZone: "AMZ276" },
      { label: "Myrtle Beach, SC",       lat: 33.6891, lon: -78.8867, wreckRegion: "MyrtleBeachSC",  noaaCoverage: true,  noaaZone: "AMZ274" },
      { label: "Southport, NC",          lat: 33.9196, lon: -78.0144, wreckRegion: "WilmingtonNC",   noaaCoverage: true,  noaaZone: "AMZ272" },
      { label: "St. Augustine, FL",      lat: 29.8943, lon: -81.3126, wreckRegion: "StAugustineFL",  noaaCoverage: true,  noaaZone: "AMZ454" },
      { label: "St. Simons Island, GA",  lat: 31.1271, lon: -81.3912, wreckRegion: "BrunswickGA",    noaaCoverage: true,  noaaZone: "AMZ470" },
      { label: "Tybee Island, GA",       lat: 31.9988, lon: -80.8443, wreckRegion: "SavannahGA",     noaaCoverage: true,  noaaZone: "AMZ374" },
      { label: "Wrightsville Beach, NC", lat: 34.2115, lon: -77.7963, wreckRegion: "WilmingtonNC",   noaaCoverage: true,  noaaZone: "AMZ270" },
    ],
  },

};

export const DEFAULT_REGION = "mid_atlantic";

export function getRegionConfig(regionKey) {
  return REGION_CONFIGS[regionKey] ?? REGION_CONFIGS[DEFAULT_REGION];
}

export function getRegionBounds(regionConfig) {
  const b = regionConfig.bounds;
  return [[b.west, b.south], [b.east, b.north]];
}

export const getMapboxMaxBounds = getRegionBounds;
export const getRegionFitBounds = getRegionBounds;
export function getMinZoom(regionConfig) { return regionConfig.minZoom; }