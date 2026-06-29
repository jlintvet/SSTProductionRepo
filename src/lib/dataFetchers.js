// src/lib/dataFetchers.js
// Direct browser fetch replacements for the Base44 serverless functions.
// All data lives in raw.githubusercontent.com/jlintvet/SSTv2.

// Mid-Atlantic fallback bounds (used when no regionBounds arg is passed).
const MA_BOUNDS = { north: 39.00, south: 33.70, west: -78.89, east: -72.21 };

function resolveBounds(regionBounds) {
  return regionBounds ?? MA_BOUNDS;
}

function cToF(c) { return parseFloat((c * 9 / 5 + 32).toFixed(4)); }

function recentDates(n = 14) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

function parseSSVCSV(text, bounds) {
  const { north, south, east, west } = bounds;
  const lines = text.trim().split('\n');
  const grid = [];
  for (let i = 1; i < lines.length; i++) {
    const [lat, lon, sst] = lines[i].split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lon) && !isNaN(sst) &&
        lat >= south && lat <= north && lon >= west && lon <= east) {
      grid.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)), sst: cToF(sst) });
    }
  }
  return grid;
}

function statsFromVals(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  return {
    min:  parseFloat(sorted[Math.floor(sorted.length * 0.02)].toFixed(2)),
    max:  parseFloat(sorted[Math.floor(sorted.length * 0.98)].toFixed(2)),
    mean: parseFloat((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2)),
  };
}

// ── VIIRS Daily SST ───────────────────────────────────────────────────────────
export async function fetchVIIRSSST(regionBounds = null, dataPathSuffix = "") {
  const { north, south, east, west } = resolveBounds(regionBounds);
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const BASE_URL = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/${subdir}`;
  const compactDates = recentDates(14);

  const headResults = await Promise.all(
    compactDates.map(async (compact) => {
      try {
        const res = await fetch(`${BASE_URL}viirs_${compact}.csv`, { method: 'HEAD' });
        return res.ok ? compact : null;
      } catch { return null; }
    })
  );
  const available = headResults.filter(Boolean).sort();
  if (!available.length) return { source: 'VIIRS', days: [] };

  const days = await Promise.all(
    available.map(async (compact) => {
      try {
        const res = await fetch(`${BASE_URL}viirs_${compact}.csv`);
        if (!res.ok) return null;
        const grid = parseSSVCSV(await res.text(), { north, south, east, west });
        if (!grid.length) return null;
        const date = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
        return { date, grid, stats: statsFromVals(grid.map(p => p.sst)) };
      } catch { return null; }
    })
  );
  return { source: 'VIIRS', days: days.filter(Boolean), generated_utc: new Date().toISOString() };
}

// ── GOES Composite SST ────────────────────────────────────────────────────────
export async function fetchGOESComposite(regionBounds = null, dataPathSuffix = "") {
  const { north, south, east, west } = resolveBounds(regionBounds);
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const BASE_URL = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/GOES/Composite/${subdir}`;
  const compactDates = recentDates(14);

  const headResults = await Promise.all(
    compactDates.map(async (compact) => {
      try {
        const res = await fetch(`${BASE_URL}goes_composite_${compact}.csv`, { method: 'HEAD' });
        return res.ok ? compact : null;
      } catch { return null; }
    })
  );
  const available = headResults.filter(Boolean).sort();
  if (!available.length) return { source: 'GOES_Composite', days: [] };

  const days = await Promise.all(
    available.map(async (compact) => {
      try {
        const res = await fetch(`${BASE_URL}goes_composite_${compact}.csv`);
        if (!res.ok) return null;
        const grid = parseSSVCSV(await res.text(), { north, south, east, west });
        if (!grid.length) return null;
        const date = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
        return { date, grid, stats: statsFromVals(grid.map(p => p.sst)) };
      } catch { return null; }
    })
  );
  return { source: 'GOES_Composite', days: days.filter(Boolean), generated_utc: new Date().toISOString() };
}

// ── MUR SST ───────────────────────────────────────────────────────────────────
export async function fetchMURSST(regionBounds = null, dataPathSuffix = "") {
  const { north, south, east, west } = resolveBounds(regionBounds);
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const BASE_URL = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/MUR/${subdir}`;
  const compactDates = recentDates(14);

  const headResults = await Promise.all(
    compactDates.map(async (compact) => {
      try {
        const res = await fetch(`${BASE_URL}mur_${compact}.csv`, { method: 'HEAD' });
        return res.ok ? compact : null;
      } catch { return null; }
    })
  );
  const available = headResults.filter(Boolean).sort();
  if (!available.length) return { source: 'MUR', days: [] };

  const days = await Promise.all(
    available.map(async (compact) => {
      try {
        const res = await fetch(`${BASE_URL}mur_${compact}.csv`);
        if (!res.ok) return null;
        const grid = parseSSVCSV(await res.text(), { north, south, east, west });
        if (!grid.length) return null;
        const date = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
        return { date, grid, stats: statsFromVals(grid.map(p => p.sst)) };
      } catch { return null; }
    })
  );
  return { source: 'MUR', days: days.filter(Boolean), generated_utc: new Date().toISOString() };
}

// ── Chlorophyll ───────────────────────────────────────────────────────────────
export async function fetchChlorophyll(regionBounds = null, dataPathSuffix = "") {
  const { north, south, east, west } = resolveBounds(regionBounds);
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const MANIFEST_URL = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/Chlorophyll/${subdir}chl_manifest.json`;
  const BASE_URL     = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/Chlorophyll/${subdir}`;

  const manifestRes = await fetch(MANIFEST_URL);
  if (!manifestRes.ok) throw new Error(`Manifest not found (${manifestRes.status})`);
  const manifest = await manifestRes.json();

  const sorted = [...(manifest.files || [])].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return { source: 'CHLOROPHYLL', days: [] };

  const dailyResults = await Promise.all(
    sorted.map(async (entry) => {
      try {
        const res = await fetch(`${BASE_URL}${entry.filename}`);
        if (!res.ok) return null;
        const data = await res.json();
        const rows = (data.rows || []).filter(r => r.lat != null && r.lon != null && r.chlorophyll != null);
        if (!rows.length) return null;

        const BIN = 0.02;
        const gridMap = {};
        for (const r of rows) {
          const latBin = Math.round(r.lat / BIN) * BIN;
          const lonBin = Math.round(r.lon / BIN) * BIN;
          const key = `${latBin},${lonBin}`;
          if (!gridMap[key]) gridMap[key] = { lat: latBin, lon: lonBin, values: [], color_class: r.color_class };
          gridMap[key].values.push(r.chlorophyll);
        }
        const grid = Object.values(gridMap).map(cell => ({
          lat: cell.lat, lon: cell.lon,
          chlorophyll: cell.values.reduce((a, b) => a + b, 0) / cell.values.length,
          color_class: cell.color_class,
        }));

        const vals = rows.map(r => r.chlorophyll);
        return {
          date: entry.date,
          grid,
          stats: {
            min:  parseFloat(Math.min(...vals).toFixed(4)),
            max:  parseFloat(Math.max(...vals).toFixed(4)),
            mean: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)),
          },
          ocean_count: rows.length,
        };
      } catch { return null; }
    })
  );

  const days = dailyResults.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  return {
    source: 'CHLOROPHYLL',
    days,
    available_dates: days.map(d => d.date),
    manifest_files: sorted.map(f => ({ date: f.date, filename: f.filename })),
    generated_utc: new Date().toISOString(),
  };
}

// ── Sea Color (Kd490) ─────────────────────────────────────────────────────────
export async function fetchSeaColor(regionBounds = null, dataPathSuffix = "") {
  const { north, south, east, west } = resolveBounds(regionBounds);
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const MANIFEST_URL = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/${subdir}seacolor_manifest.json`;
  const BASE_URL     = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/${subdir}`;

  const manifestRes = await fetch(MANIFEST_URL);
  if (!manifestRes.ok) throw new Error(`Manifest not found (${manifestRes.status})`);
  const manifest = await manifestRes.json();

  const sorted = [...(manifest.files || [])].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) return { source: 'SEACOLOR', days: [], available_dates: [] };

  const dailyResults = await Promise.all(
    sorted.map(async (entry) => {
      try {
        const res = await fetch(`${BASE_URL}${entry.filename}`);
        if (!res.ok) return null;
        const data = await res.json();
        const rows = (data.rows || []).filter(r => r.lat != null && r.lon != null && r.kd490 != null);
        if (!rows.length) return null;

        const BIN = 0.02;
        const gridMap = {};
        for (const r of rows) {
          const latBin = Math.round(r.lat / BIN) * BIN;
          const lonBin = Math.round(r.lon / BIN) * BIN;
          const key = `${latBin},${lonBin}`;
          if (!gridMap[key]) gridMap[key] = { lat: latBin, lon: lonBin, values: [] };
          gridMap[key].values.push(r.kd490);
        }
        const grid = Object.values(gridMap).map(cell => ({
          lat: cell.lat, lon: cell.lon,
          kd490: cell.values.reduce((a, b) => a + b, 0) / cell.values.length,
        }));

        const vals = rows.map(r => r.kd490);
        return {
          date: entry.date,
          grid,
          stats: {
            min:  parseFloat(Math.min(...vals).toFixed(4)),
            max:  parseFloat(Math.max(...vals).toFixed(4)),
            mean: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)),
          },
          ocean_count: rows.length,
        };
      } catch { return null; }
    })
  );

  const days = dailyResults.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  return {
    source: 'SEACOLOR',
    days,
    available_dates: days.map(d => d.date),
    manifest_files: sorted.map(f => ({ date: f.date, filename: f.filename })),
    generated_utc: new Date().toISOString(),
  };
}

// ── VIIRS Hourly Passes ───────────────────────────────────────────────────────
export async function fetchVIIRSHourly() {
  const BASE_URL     = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/Passes/";
  const MANIFEST_URL = "https://api.github.com/repos/jlintvet/SSTv2/contents/DailySSTData/VIIRS/Passes";

  const listRes = await fetch(MANIFEST_URL, { headers: { "Accept": "application/vnd.github+json" } });
  if (!listRes.ok) return { source: "VIIRS", days: [] };
  const filesRaw = await listRes.json();
  if (!Array.isArray(filesRaw)) return { source: "VIIRS", days: [], github_error: filesRaw?.message };

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 3);
  const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '');

  function parseFilename(name) {
    const m = name.match(/^viirs_(npp|n20|n21)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.csv$/);
    if (!m) return null;
    return {
      platform: m[1],
      date: `${m[2]}-${m[3]}-${m[4]}`,
      compactDate: `${m[2]}${m[3]}${m[4]}`,
      hour: parseInt(m[5], 10),
      filename: name,
    };
  }

  function parsePassCSV(text) {
    const { north: pN, south: pS, east: pE, west: pW } = MA_BOUNDS; // hourly always mid-atlantic
    const lines = text.trim().split('\n');
    const grid = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 3) continue;
      const lat = parseFloat(parts[0]), lon = parseFloat(parts[1]), sst = parseFloat(parts[2]);
      if (isNaN(lat) || isNaN(lon) || isNaN(sst)) continue;
      if (lat < pS || lat > pN || lon < pW || lon > pE) continue;
      grid.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)), sst: cToF(sst) });
    }
    return grid;
  }

  function statsFromGrid(grid) {
    const vals = grid.map(p => p.sst).sort((a, b) => a - b);
    if (!vals.length) return null;
    return {
      min:  parseFloat(vals[Math.floor(vals.length * 0.02)].toFixed(2)),
      max:  parseFloat(vals[Math.floor(vals.length * 0.98)].toFixed(2)),
      mean: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
    };
  }

  const byDate = new Map();
  for (const file of filesRaw) {
    if (!file.name?.endsWith('.csv')) continue;
    const parsed = parseFilename(file.name);
    if (!parsed || parsed.compactDate < cutoffStr) continue;
    if (!byDate.has(parsed.date)) byDate.set(parsed.date, new Map());
    const byHour = byDate.get(parsed.date);
    if (!byHour.has(parsed.hour)) byHour.set(parsed.hour, []);
    byHour.get(parsed.hour).push({ ...parsed, download_url: file.download_url });
  }

  if (!byDate.size) return { source: "VIIRS", days: [] };

  const days = [];
  for (const [date, byHour] of [...byDate.entries()].sort()) {
    const hours_cache = {};
    const available_hours = [];
    for (const [hour, candidates] of [...byHour.entries()].sort((a, b) => a[0] - b[0])) {
      const results = await Promise.all(
        candidates.map(async (c) => {
          try {
            const res = await fetch(c.download_url);
            return res.ok ? parsePassCSV(await res.text()) : [];
          } catch { return []; }
        })
      );
      const seen = new Set();
      const merged = [];
      for (const grid of results) {
        for (const pt of grid) {
          const key = `${pt.lat}_${pt.lon}`;
          if (!seen.has(key)) { seen.add(key); merged.push(pt); }
        }
      }
      if (!merged.length) continue;
      const stats = statsFromGrid(merged);
      if (!stats) continue;
      hours_cache[hour] = { grid: merged, stats };
      available_hours.push(hour);
    }
    if (!available_hours.length) continue;
    const seen = new Set();
    const dayGrid = [];
    for (const h of available_hours) {
      for (const pt of hours_cache[h].grid) {
        const key = `${pt.lat}_${pt.lon}`;
        if (!seen.has(key)) { seen.add(key); dayGrid.push(pt); }
      }
    }
    days.push({ date, available_hours, hours_cache, grid: dayGrid, stats: statsFromGrid(dayGrid) });
  }

  return { source: "VIIRS", days, generated_utc: new Date().toISOString() };
}

// ── CHL Bundle (flat-array format, pre-binned server-side) ────────────────────
const CHL_BUNDLE_BASE = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/Chlorophyll/Bundled/";
const SC_BUNDLE_BASE  = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/Bundled/";

function _bundleDayToCHLGrid(bundle) {
  const { date, latSet, lonSet, chl, min, max, coverage_pct } = bundle;
  const nLons = lonSet.length;
  const grid = [];
  for (let i = 0; i < latSet.length; i++) {
    for (let j = 0; j < nLons; j++) {
      const val = chl[i * nLons + j];
      if (val !== null && val !== undefined) {
        grid.push({ lat: latSet[i], lon: lonSet[j], chlorophyll: val });
      }
    }
  }
  const vals = grid.map(p => p.chlorophyll);
  return {
    date,
    grid,
    stats: {
      min: typeof min === 'number' ? min : (vals.length ? Math.min(...vals) : 0),
      max: typeof max === 'number' ? max : (vals.length ? Math.max(...vals) : 1),
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    },
    ocean_count: grid.length,
    coverage_pct,
  };
}

function _bundleDayToSCGrid(bundle) {
  const { date, latSet, lonSet, kd490, min, max, coverage_pct } = bundle;
  const nLons = lonSet.length;
  const grid = [];
  for (let i = 0; i < latSet.length; i++) {
    for (let j = 0; j < nLons; j++) {
      const val = kd490[i * nLons + j];
      if (val !== null && val !== undefined) {
        grid.push({ lat: latSet[i], lon: lonSet[j], kd490: val });
      }
    }
  }
  const vals = grid.map(p => p.kd490);
  return {
    date,
    grid,
    stats: {
      min: typeof min === 'number' ? min : (vals.length ? Math.min(...vals) : 0),
      max: typeof max === 'number' ? max : (vals.length ? Math.max(...vals) : 1),
      mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    },
    ocean_count: grid.length,
    coverage_pct,
  };
}

export async function fetchCHLBundle(regionBounds = null, dataPathSuffix = "") {
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const base = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/Chlorophyll/Bundled/${subdir}`;
  try {
    const idxRes = await fetch(`${base}chl_bundle_index.json`);
    if (!idxRes.ok) throw new Error(`Index HTTP ${idxRes.status}`);
    const idx = await idxRes.json();
    if (!idx.dates?.length) throw new Error('Empty bundle index');
    const days = await Promise.all(
      [...idx.dates].sort().map(async (date) => {
        try {
          const res = await fetch(`${base}chl_bundle_${date}.json`);
          if (!res.ok) return null;
          return _bundleDayToCHLGrid(await res.json());
        } catch { return null; }
      })
    );
    const validDays = days.filter(Boolean);
    if (!validDays.length) throw new Error('No valid bundle days');
    return { source: 'CHLOROPHYLL', days: validDays, has_composite: idx.has_composite ?? false, composite_dates: idx.composite_dates ?? [] };
  } catch (err) {
    console.warn('[fetchCHLBundle] falling back to legacy fetch:', err.message);
    return fetchChlorophyll(regionBounds, dataPathSuffix);
  }
}

export async function fetchCHLComposite(dateStr, regionBounds = null, dataPathSuffix = "") {
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const base = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/Chlorophyll/Bundled/${subdir}`;
  // If dateStr provided fetch that dated snapshot, else fall back to canonical latest
  const url = dateStr
    ? `${base}chl_composite_${dateStr}.json`
    : `${base}chl_composite.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CHL composite HTTP ${res.status}`);
  const composite = await res.json();
  const builtDate = composite.generated?.slice(0, 10) ?? dateStr ?? 'composite';
  const day = _bundleDayToCHLGrid({ ...composite, date: builtDate });
  day.isComposite = true;
  day.builtDate   = builtDate;
  return { source: 'CHLOROPHYLL', days: [day], is_composite: true };
}

export async function fetchSeaColorBundle(regionBounds = null, dataPathSuffix = "") {
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const base = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/Bundled/${subdir}`;
  try {
    const idxRes = await fetch(`${base}seacolor_bundle_index.json`);
    if (!idxRes.ok) throw new Error(`Index HTTP ${idxRes.status}`);
    const idx = await idxRes.json();
    if (!idx.dates?.length) throw new Error('Empty bundle index');
    const days = await Promise.all(
      [...idx.dates].sort().map(async (date) => {
        try {
          const res = await fetch(`${base}seacolor_bundle_${date}.json`);
          if (!res.ok) return null;
          return _bundleDayToSCGrid(await res.json());
        } catch { return null; }
      })
    );
    const validDays = days.filter(Boolean);
    if (!validDays.length) throw new Error('No valid bundle days');
    return { source: 'SEACOLOR', days: validDays, has_composite: idx.has_composite ?? false, composite_dates: idx.composite_dates ?? [] };
  } catch (err) {
    console.warn('[fetchSeaColorBundle] falling back to legacy fetch:', err.message);
    return fetchSeaColor(regionBounds, dataPathSuffix);
  }
}

export async function fetchSeaColorComposite(dateStr, regionBounds = null, dataPathSuffix = "") {
  const subdir = dataPathSuffix ? `${dataPathSuffix}/` : "";
  const base = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/Bundled/${subdir}`;
  const url = dateStr
    ? `${base}seacolor_composite_${dateStr}.json`
    : `${base}seacolor_composite.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SeaColor composite HTTP ${res.status}`);
  const composite = await res.json();
  const builtDate = composite.generated?.slice(0, 10) ?? dateStr ?? 'composite';
  const day = _bundleDayToSCGrid({ ...composite, date: builtDate });
  day.isComposite = true;
  day.builtDate   = builtDate;
  return { source: 'SEACOLOR', days: [day], is_composite: true };
}
