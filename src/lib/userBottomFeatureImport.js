// src/lib/userBottomFeatureImport.js
// Client-side parsers for a user's personal bottom-feature list (Navionics
// data card / chartplotter / third-party exports), used by the "My
// Imported Spots" section in UserSettingsModal.jsx. Pure functions, no
// network calls -- everything here runs in the browser on the raw file
// text before anything touches Supabase.
//
// Common intermediate row shape produced by every parser:
//   { name, lat, lon, type, symbol, depth_ft, notes }
// `type` is one of 'wreck' | 'reef' | 'rock' | 'structure' | 'other'.
// `symbol` is 'Wreck' | 'Rocks' -- mirrors the two icon buckets the shared
// wrecks.json dataset already renders with, so a user's imported spot
// slots into the exact same map-marker code path.

export const MAX_ROWS_PER_UPLOAD = 2000;
export const MAX_TOTAL_ROWS_PER_USER = 5000;

// Loose bounding box covering every current app region (mid_atlantic,
// ga_sc, ne_fl, s_fl, va_ri) with margin -- not a precise filter, just a
// sanity check against wildly wrong coordinates (e.g. a transposed lat/lon
// or an export from the wrong hemisphere).
const LAT_MIN = 18, LAT_MAX = 46;
const LON_MIN = -85, LON_MAX = -65;

function coordsInBounds(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX;
}

// Maps a free-text symbol/icon/keyword string to our two-bucket type/symbol
// vocabulary. Used for GPX <sym> / Garmin gpxx:Symbol, and as a best-effort
// fallback for KML placemarks that have no dedicated symbol field.
function classify(raw) {
  const s = (raw || "").toLowerCase();
  if (/wreck/.test(s)) return { type: "wreck", symbol: "Wreck" };
  if (/reef/.test(s)) return { type: "reef", symbol: "Rocks" };
  if (/rock/.test(s)) return { type: "rock", symbol: "Rocks" };
  if (/structure|ledge|hole|obstruction/.test(s)) return { type: "structure", symbol: "Rocks" };
  return { type: "other", symbol: "Rocks" };
}

function cleanName(name, fallbackIndex) {
  const t = (name || "").trim();
  return t || `Imported spot ${fallbackIndex + 1}`;
}

function stripCdata(s) {
  if (s == null) return "";
  const m = String(s).match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (m ? m[1] : s).trim();
}

// ── GPX ──────────────────────────────────────────────────────────────────
// Standard GPX 1.1 <wpt lat lon><name/><desc/><sym/></wpt>, plus a
// best-effort check for Garmin's gpxx:WaypointExtension/gpxx:Symbol (real
// Navionics Boating app exports are Garmin-owned and likely to use it).
//
// Deliberately regex-based rather than DOMParser -- real-world exports
// from at least one common source (fishingstatus.com) have been observed
// missing the closing </wpt> tag on the last waypoint in the file (a
// truncated-output bug on their end, not ours), which makes the document
// malformed XML. A strict DOMParser().parseFromString() call fails (or
// silently mis-recovers) on the whole file for that one dangling tag, even
// though every other waypoint in the file is perfectly fine. Each waypoint
// here is instead bounded by the next "<wpt " occurrence (or end of file)
// rather than requiring a matching "</wpt>", so one malformed tag -- at
// the end or anywhere else -- can't take down the rest of a real import.
export function parseGPX(xmlText) {
  const rows = [];
  const errors = [];
  const wptOpenRe = /<wpt\b([^>]*)>/gi;
  const opens = [];
  let m;
  while ((m = wptOpenRe.exec(xmlText)) !== null) {
    opens.push({ attrs: m[1], start: m.index, contentStart: wptOpenRe.lastIndex });
  }
  if (opens.length === 0) {
    return { rows: [], errors: ["No waypoints found in this GPX file."] };
  }
  opens.forEach((wpt, i) => {
    const contentEnd = i + 1 < opens.length ? opens[i + 1].start : xmlText.length;
    // Trim a trailing </wpt> (and anything after it, e.g. </gpx>) if present
    // -- if it's missing (the truncation bug), just use the slice as-is.
    const content = xmlText.slice(wpt.contentStart, contentEnd).replace(/<\/wpt>[\s\S]*$/i, "");

    const latMatch = wpt.attrs.match(/\blat\s*=\s*"([^"]*)"/i);
    const lonMatch = wpt.attrs.match(/\blon\s*=\s*"([^"]*)"/i);
    const lat = latMatch ? parseFloat(latMatch[1]) : NaN;
    const lon = lonMatch ? parseFloat(lonMatch[1]) : NaN;
    if (!coordsInBounds(lat, lon)) { errors.push(`Row ${i + 1}: coordinates out of range or missing, skipped.`); return; }

    const nameMatch = content.match(/<name>([\s\S]*?)<\/name>/i);
    const descMatch = content.match(/<desc>([\s\S]*?)<\/desc>/i);
    const symMatch = content.match(/<sym>([\s\S]*?)<\/sym>/i) || content.match(/<gpxx:Symbol>([\s\S]*?)<\/gpxx:Symbol>/i);
    const depthMatch = content.match(/<depth>([\s\S]*?)<\/depth>/i) || content.match(/<ele>([\s\S]*?)<\/ele>/i);

    const name = stripCdata(nameMatch?.[1]);
    const desc = stripCdata(descMatch?.[1]);
    const sym = stripCdata(symMatch?.[1]);
    const { type, symbol } = classify(sym || desc);
    rows.push({
      name: cleanName(name, i),
      lat, lon, type, symbol,
      depth_ft: depthMatch ? (parseFloat(stripCdata(depthMatch[1])) || null) : null,
      notes: desc || null,
    });
  });
  if (rows.length === 0 && errors.length === 0) errors.push("No waypoints found in this GPX file.");
  return { rows, errors };
}

// ── KML ──────────────────────────────────────────────────────────────────
// Google Earth / Google My Maps export: <Placemark><name/><description/>
// <Point><coordinates>lon,lat[,alt]</coordinates></Point></Placemark>.
// No standard wreck/rock symbol vocabulary in KML, so type is guessed from
// the name/description text and always user-editable after import.
export function parseKML(xmlText) {
  const rows = [];
  const errors = [];
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("Malformed XML");
  } catch (e) {
    return { rows: [], errors: ["Couldn't parse this file as KML (invalid XML)."] };
  }
  const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
  placemarks.forEach((pm, i) => {
    const coordText = pm.getElementsByTagName("coordinates")[0]?.textContent?.trim();
    if (!coordText) { errors.push(`Placemark ${i + 1}: no coordinates, skipped.`); return; }
    const [lonStr, latStr] = coordText.split(",");
    const lat = parseFloat(latStr), lon = parseFloat(lonStr);
    if (!coordsInBounds(lat, lon)) { errors.push(`Placemark ${i + 1}: coordinates out of range, skipped.`); return; }
    const name = pm.getElementsByTagName("name")[0]?.textContent;
    const desc = pm.getElementsByTagName("description")[0]?.textContent || "";
    const { type, symbol } = classify(`${name || ""} ${desc}`);
    rows.push({
      name: cleanName(name, i),
      lat, lon, type, symbol,
      depth_ft: null,
      notes: desc.trim() || null,
    });
  });
  if (rows.length === 0 && errors.length === 0) errors.push("No placemarks found in this KML file.");
  return { rows, errors };
}

// ── CSV ──────────────────────────────────────────────────────────────────
// Flexible header matching (case-insensitive), required lat/lon columns.
// Handles quoted fields containing commas.
const HEADER_ALIASES = {
  name: ["name", "title", "label"],
  lat: ["lat", "latitude"],
  lon: ["lon", "lng", "long", "longitude"],
  type: ["type", "category"],
  depth_ft: ["depth_ft", "depth", "depthft"],
  notes: ["notes", "note", "desc", "description"],
};

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parseCSV(text) {
  const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ["File is empty."] };
  const headerCells = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const colIndex = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headerCells.findIndex(h => aliases.includes(h));
    if (idx !== -1) colIndex[field] = idx;
  }
  if (colIndex.lat === undefined || colIndex.lon === undefined) {
    return { rows: [], errors: ['CSV must have "lat"/"latitude" and "lon"/"longitude" columns.'] };
  }
  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const lat = parseFloat(cells[colIndex.lat]);
    const lon = parseFloat(cells[colIndex.lon]);
    if (!coordsInBounds(lat, lon)) { errors.push(`Row ${i + 1}: coordinates out of range, skipped.`); continue; }
    const rawType = colIndex.type !== undefined ? cells[colIndex.type] : "";
    const { type, symbol } = classify(rawType);
    rows.push({
      name: cleanName(colIndex.name !== undefined ? cells[colIndex.name] : null, i - 1),
      lat, lon, type, symbol,
      depth_ft: colIndex.depth_ft !== undefined ? (parseFloat(cells[colIndex.depth_ft]) || null) : null,
      notes: colIndex.notes !== undefined ? (cells[colIndex.notes] || null) : null,
    });
  }
  if (rows.length === 0 && errors.length === 0) errors.push("No data rows found in this CSV file.");
  return { rows, errors };
}

export const CSV_TEMPLATE = "name,lat,lon,type,depth_ft,notes\nExample Wreck,34.5,-76.3,wreck,90,Sample row - delete me\n";

// ── Shared: parse-by-extension, validation, dedup ───────────────────────

export function parseFileByName(fileName, text) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".gpx")) return parseGPX(text);
  if (lower.endsWith(".kml")) return parseKML(text);
  if (lower.endsWith(".csv")) return parseCSV(text);
  return { rows: [], errors: ["Unsupported file type - please upload a .gpx, .csv, or .kml file."] };
}

function rowKey(r) {
  return `${r.name.trim().toLowerCase()}_${r.lat.toFixed(4)}_${r.lon.toFixed(4)}`;
}

// De-dupes within one file, caps at MAX_ROWS_PER_UPLOAD, and optionally
// drops rows that already match an existing key (used for "add" mode so
// re-importing the same card twice doesn't double up).
export function finalizeRows(rows, { existingKeys = new Set() } = {}) {
  const seen = new Set();
  const kept = [];
  let duplicates = 0;
  let alreadyImported = 0;
  for (const r of rows) {
    const key = rowKey(r);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    if (existingKeys.has(key)) { alreadyImported++; continue; }
    kept.push(r);
    if (kept.length >= MAX_ROWS_PER_UPLOAD) break;
  }
  return {
    rows: kept,
    duplicates,
    alreadyImported,
    truncated: rows.length > MAX_ROWS_PER_UPLOAD,
  };
}

export { rowKey as computeRowKey };
