// GOES Composite SST — DailySSTData/GOES/Composite/goes_composite_YYYYMMDD.csv
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/GOES/Composite/";
const NORTH = 39.00, SOUTH = 33.70, WEST = -78.89, EAST = -72.21;

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

function cToF(c) { return parseFloat((c * 9 / 5 + 32).toFixed(4)); }

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const grid = [];
  for (let i = 1; i < lines.length; i++) {
    const [lat, lon, sst] = lines[i].split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lon) && !isNaN(sst) &&
        lat >= SOUTH && lat <= NORTH && lon >= WEST && lon <= EAST) {
      grid.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)), sst: cToF(sst) });
    }
  }
  return grid;
}

Deno.serve(async (req) => {
  try {
    const compactDates = recentDates(14);
    const headResults = await Promise.all(
      compactDates.map(async (compact) => {
        const res = await fetch(`${BASE_URL}goes_composite_${compact}.csv`, { method: 'HEAD' });
        return res.ok ? compact : null;
      })
    );
    const available = headResults.filter(Boolean).sort();

    if (!available.length) {
      return Response.json({ source: 'GOES_Composite', days: [] });
    }

    const days = await Promise.all(
      available.map(async (compact) => {
        const res = await fetch(`${BASE_URL}goes_composite_${compact}.csv`);
        if (!res.ok) return null;
        const grid = parseCSV(await res.text());
        if (!grid.length) return null;
        const vals = grid.map(p => p.sst).sort((a, b) => a - b);
        const p2  = vals[Math.floor(vals.length * 0.02)];
        const p98 = vals[Math.floor(vals.length * 0.98)];
        const date = `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
        return {
          date,
          grid,
          stats: {
            min: parseFloat(p2.toFixed(2)),
            max: parseFloat(p98.toFixed(2)),
            mean: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
          },
        };
      })
    );

    const validDays = days.filter(Boolean);
    return Response.json({ source: 'GOES_Composite', days: validDays, generated_utc: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});