const MANIFEST_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/seacolor_manifest.json";
const BASE_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/SSTv2/SeaColor/";

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { date } = body;

    const manifestRes = await fetch(MANIFEST_URL);
    if (!manifestRes.ok) return Response.json({ error: `Manifest not found (${manifestRes.status})` }, { status: 502 });
    const manifest = await manifestRes.json();

    const files = manifest.files || [];
    const sorted = [...files].sort((a, b) => b.date.localeCompare(a.date));
    const filesToFetch = date ? sorted.filter(f => f.date === date) : sorted;

    if (!filesToFetch.length) return Response.json({ error: 'No sea color data available yet', available_dates: [], days: [] }, { status: 200 });

    const dailyResults = await Promise.all(
      filesToFetch.map(async (entry) => {
        const res = await fetch(`${BASE_URL}${entry.filename}`);
        if (!res.ok) return null;
        const data = await res.json();

        const rows = (data.rows || []).filter(r => r.lat != null && r.lon != null && r.kd490 != null);
        if (!rows.length) return null;

        const vals = rows.map(r => r.kd490);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;

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
          lat: cell.lat,
          lon: cell.lon,
          kd490: cell.values.reduce((a, b) => a + b, 0) / cell.values.length,
        }));

        return {
          date: entry.date,
          grid,
          stats: {
            min: parseFloat(min.toFixed(4)),
            max: parseFloat(max.toFixed(4)),
            mean: parseFloat(mean.toFixed(4)),
          },
          ocean_count: rows.length,
        };
      })
    );

    const days = dailyResults.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

    return Response.json({
      source: 'SEACOLOR',
      days,
      available_dates: days.map(d => d.date),
      manifest_files: sorted.map(f => ({ date: f.date, filename: f.filename })),
      generated_utc: new Date().toISOString(),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});