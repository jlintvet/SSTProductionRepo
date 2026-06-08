// VIIRS SST — DailySSTData/VIIRS/Passes/viirs_{platform}_{YYYYMMDD_HHMM}.csv
// Returns multi-pass per-day data shaped for the UI hours_cache pattern. v2

const BASE_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/Passes/";
const MANIFEST_URL = "https://api.github.com/repos/jlintvet/SSTv2/contents/DailySSTData/VIIRS/Passes";

const NORTH = 39.00, SOUTH = 33.70, WEST = -78.89, EAST = -72.21;

function cToF(c) {
  return parseFloat((c * 9 / 5 + 32).toFixed(4));
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const grid = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    const sst = parseFloat(parts[2]);
    if (isNaN(lat) || isNaN(lon) || isNaN(sst)) continue;
    if (lat < SOUTH || lat > NORTH || lon < WEST || lon > EAST) continue;
    grid.push({
      lat: parseFloat(lat.toFixed(4)),
      lon: parseFloat(lon.toFixed(4)),
      sst: cToF(sst),
    });
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

// Parse filename like viirs_npp_20260422_0610.csv
// Returns { date: "2026-04-22", hour: 6, minuteLabel: "0610" } or null
function parseFilename(name) {
  const m = name.match(/^viirs_(npp|n20|n21)_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})\.csv$/);
  if (!m) return null;
  return {
    platform:    m[1],
    date:        `${m[2]}-${m[3]}-${m[4]}`,
    compactDate: `${m[2]}${m[3]}${m[4]}`,
    hour:        parseInt(m[5], 10),
    minute:      parseInt(m[6], 10),
    minuteLabel: `${m[5]}${m[6]}`,
    filename:    name,
  };
}

Deno.serve(async (req) => {
  try {
    // ── 1. Get file listing from GitHub API ──────────────────────────────
    const listRes = await fetch(MANIFEST_URL, {
      headers: { "Accept": "application/vnd.github+json" }
    });

    if (!listRes.ok) {
      const body = await listRes.text();
      return Response.json({ 
        source: "VIIRS", 
        days: [], 
        debug: `GitHub API ${listRes.status}: ${body.slice(0, 300)}` 
      });
    }

    const filesRaw = await listRes.json();
    // GitHub may return a rate-limit object or a message object instead of an array
    if (!Array.isArray(filesRaw)) {
      const msg = filesRaw?.message ?? JSON.stringify(filesRaw);
      return Response.json({ source: "VIIRS", days: [], github_error: msg });
    }
    const files = filesRaw;

    // ── 2. Parse filenames and group by date → hour ──────────────────────
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 3);
    const cutoffStr = cutoff.toISOString().slice(0, 10).replace(/-/g, '');

    const byDate = new Map();

    for (const file of files) {
      if (!file.name?.endsWith('.csv')) continue;
      const parsed = parseFilename(file.name);
      if (!parsed) continue;
      if (parsed.compactDate < cutoffStr) continue;

      if (!byDate.has(parsed.date)) byDate.set(parsed.date, new Map());
      const byHour = byDate.get(parsed.date);

      if (!byHour.has(parsed.hour)) byHour.set(parsed.hour, []);
      byHour.get(parsed.hour).push({ ...parsed, download_url: file.download_url });
    }

    if (!byDate.size) {
      return Response.json({ source: "VIIRS", days: [] });
    }

    // ── 3. For each date, fetch the best granule per hour ────────────────
    const days = [];

    for (const [date, byHour] of [...byDate.entries()].sort()) {
      const hours_cache = {};
      const available_hours = [];

      for (const [hour, candidates] of [...byHour.entries()].sort((a, b) => a[0] - b[0])) {
        const results = await Promise.all(
          candidates.map(async (c) => {
            try {
              const res = await fetch(c.download_url);
              if (!res.ok) return [];
              return parseCSV(await res.text());
            } catch {
              return [];
            }
          })
        );

        // Merge grids from all platforms for this hour, deduplicate by lat/lon
        const seen = new Set();
        const merged = [];
        for (const grid of results) {
          for (const pt of grid) {
            const key = `${pt.lat}_${pt.lon}`;
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(pt);
            }
          }
        }

        if (!merged.length) continue;

        const stats = statsFromGrid(merged);
        if (!stats) continue;

        hours_cache[hour] = { grid: merged, stats };
        available_hours.push(hour);
      }

      if (!available_hours.length) continue;

      // Build the day-level grid as a union of all hours
      const seen = new Set();
      const dayGrid = [];
      for (const h of available_hours) {
        for (const pt of hours_cache[h].grid) {
          const key = `${pt.lat}_${pt.lon}`;
          if (!seen.has(key)) { seen.add(key); dayGrid.push(pt); }
        }
      }

      days.push({
        date,
        available_hours,
        hours_cache,
        grid: dayGrid,
        stats: statsFromGrid(dayGrid),
      });
    }

    return Response.json({
      source: "VIIRS",
      days,
      generated_utc: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});