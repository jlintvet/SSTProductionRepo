// src/lib/coordinates.js
// Shared lat/lon display formatting for the whole app, driven by the
// user's Coordinate Format preference (Settings > Display Units):
//   'dd'  - Decimal Degrees      e.g. 36.8355°N
//   'dms' - Degrees Minutes Sec  e.g. 36°50'07.8"N
//   'ddm' - Degrees Decimal Min  e.g. 36°50.128'N   (default -- matches
//           the convention most marine GPS/chartplotters show)
//
// Every component that renders a coordinate should go through this file
// instead of hand-rolling toFixed()+degree-symbol strings, so format and
// precision stay consistent everywhere (map popups, saved locations,
// share text, etc).

export const DEFAULT_COORDINATE_FORMAT = "ddm";

export const COORDINATE_FORMAT_OPTIONS = [
  { value: "ddm", label: "DDM", example: "36°50.128'N" },
  { value: "dd",  label: "DD",  example: "36.8355°N" },
  { value: "dms", label: "DMS", example: "36°50'08\"N" },
];

function formatAxis(value, isLat, format) {
  if (value == null || isNaN(value)) return "--";
  const hemi = isLat ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E");
  const abs  = Math.abs(value);

  if (format === "dd") {
    return `${abs.toFixed(4)}°${hemi}`;
  }

  let deg     = Math.floor(abs);
  let minFull = (abs - deg) * 60;

  if (format === "dms") {
    let min = Math.floor(minFull);
    let sec = (minFull - min) * 60;
    sec = Math.round(sec * 10) / 10;
    if (sec >= 60) { sec -= 60; min += 1; }
    if (min >= 60) { min -= 60; deg += 1; }
    const secStr = sec.toFixed(1).padStart(4, "0");
    return `${deg}°${String(min).padStart(2, "0")}'${secStr}"${hemi}`;
  }

  // 'ddm' (default) -- degrees + decimal minutes
  minFull = Math.round(minFull * 1000) / 1000;
  if (minFull >= 60) { minFull -= 60; deg += 1; }
  return `${deg}°${minFull.toFixed(3)}'${hemi}`;
}

export function formatLat(lat, format = DEFAULT_COORDINATE_FORMAT) {
  return formatAxis(lat, true, format);
}

export function formatLon(lon, format = DEFAULT_COORDINATE_FORMAT) {
  return formatAxis(lon, false, format);
}

// separator defaults to a comma+space, matching most existing call sites
// ("36.8355°N, 75.9781°W"). Pass "  " (or "  ") for the
// no-comma map-popup style used elsewhere.
export function formatCoordinate(lat, lon, format = DEFAULT_COORDINATE_FORMAT, separator = ", ") {
  return `${formatLat(lat, format)}${separator}${formatLon(lon, format)}`;
}

// ── Parsing (for the coordinate-edit field) ─────────────────────────────────
// Accepts DD ("36.8355" / "-75.9781" / "36.8355N"), DDM ("36 50.130 N" /
// "36\u00b050.130'N"), or DMS ("36 50 07.8 N" / "36\u00b050'07.8\"N") regardless of
// which format is currently selected for display -- the token count (1/2/3
// numbers) determines how it's interpreted, so users can paste coordinates
// from a chart, another GPS unit, or a text from a buddy without having to
// match whatever format they happen to have display turned on.
function parseAxis(raw, isLat) {
  if (raw == null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  let hemSign = null;
  const hemMatch = str.match(/[NSEWnsew]/);
  if (hemMatch) {
    const letter = hemMatch[0].toUpperCase();
    if (isLat && letter !== "N" && letter !== "S") return null;
    if (!isLat && letter !== "E" && letter !== "W") return null;
    hemSign = (letter === "S" || letter === "W") ? -1 : 1;
  }

  const cleaned = str.replace(/[NSEWnsew]/g, " ").replace(/[°'",]/g, " ");
  const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return null;

  const nums = tokens.map(Number);
  if (nums.some(n => Number.isNaN(n))) return null;

  const firstRaw = nums[0];
  const d = Math.abs(nums[0]);
  const m = nums.length > 1 ? Math.abs(nums[1]) : 0;
  const s = nums.length > 2 ? Math.abs(nums[2]) : 0;
  if (m >= 60 || s >= 60) return null;

  let value = d + m / 60 + s / 3600;
  const sign = hemSign ?? (firstRaw < 0 ? -1 : 1);
  value *= sign;

  const maxAbs = isLat ? 90 : 180;
  if (Math.abs(value) > maxAbs + 1e-9) return null;

  return value;
}

export function parseLat(str) {
  return parseAxis(str, true);
}

export function parseLon(str) {
  return parseAxis(str, false);
}
