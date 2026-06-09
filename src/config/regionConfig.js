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
    locations: [
      { label: "Bay Bridge Tunnel, VA", lat: 36.9082,            lon: -76.0918,           wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
      { label: "Beaufort Inlet, NC",    lat: 34.6937,            lon: -76.6663,           wreckRegion: "MoreheadNC",   noaaCoverage: true  },
      { label: "Hatteras Inlet, NC",    lat: 35.190505871104094, lon: -75.7554186087437,  wreckRegion: "HatterasNC",   noaaCoverage: true  },
      { label: "Ocean City Inlet, MD",  lat: 38.324,             lon: -75.0883,           wreckRegion: "OceanCityMD",  noaaCoverage: true  },
      { label: "Oregon Inlet, NC",      lat: 35.7792,            lon: -75.532,            wreckRegion: "HatterasNC",   noaaCoverage: true  },
      { label: "Poquoson, VA",          lat: 37.7629068,         lon: -75.7724311,        wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
      { label: "Virginia Beach, VA",    lat: 36.8516,            lon: -75.9792,           wreckRegion: "ChesapeakeMD", noaaCoverage: true  },
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