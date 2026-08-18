// src/data/pricingFeatures.js
//
// Single source of truth for the Standard/Pro feature-comparison bullets
// shown on BOTH pricing surfaces:
//   - src/pages/LandingPage.jsx  (marketing pricing card, links to signup)
//   - src/pages/UpgradePage.jsx  (the actual /upgrade Stripe checkout page,
//     with its own monthly/annual toggle and inline auth flow)
//
// Those two pages stay separate because they do genuinely different jobs
// (marketing card vs. live checkout flow), but the feature bullets
// themselves have no reason to ever differ between them -- they drifted
// out of sync in the past (missing bullets, reworded bullets, stale Pro
// perks) simply because they were maintained as two separate arrays.
// Edit the feature copy here, not in either page.

export const STANDARD_FEATURES = [
  "Sea Surface Temperature - daily, hourly & 36h HD composite",
  "Chlorophyll & sea color layers",
  "Altimetry (sea-level) data layer",
  "Bathymetry contours + canyon labels",
  "Wind map & NOAA marine forecast",
  "Weather buoy live observations",
  "Color gain & rendering controls",
  "Departure port planning",
  "Unlimited saved locations",
  "Community reports (contribute to access)",
];

export const PRO_FEATURES = [
  "Everything in Standard",
  "Ocean current particle overlay",
  "Sea level anomaly (altimetry) overlay",
  "Wind vector overlay (layered on other maps)",
  "Isotherm (temp break) overlay",
  "Loran-C grid, incl. phantom/X lines",
  "Doppler radar overlay",
  "Shaded relief bathymetry",
  "Fishing hotspot scoring map",
  "Wreck & bottom structure locations",
  "Bulk waypoint import (GPX/CSV/KML)",
  "Trip planner with fuel & ETA calc",
  "Route saving & sharing",
  "GPS tracking overlay",
  "90-day community access window",
];
