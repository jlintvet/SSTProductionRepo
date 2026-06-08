// generateShareImage.js
// Creates a 400×320 SST crop image centered on a saved fishing location.
// Renders SST colors + bathymetry contours (same styles as the Leaflet map).

// ── Color pipeline (mirrors SSTLive.jsx) ────────────────────────────────────

function interpColor(t, stops) {
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lower = stops[i]; upper = stops[i + 1]; break;
    }
  }
  const lt = (upper[0] - lower[0]) === 0 ? 0 : (t - lower[0]) / (upper[0] - lower[0]);
  return [
    Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * lt),
    Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * lt),
    Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * lt),
  ];
}

const SST_STOPS = [
  [0,    [15,  40,  140]],
  [0.2,  [0,   130, 200]],
  [0.4,  [0,   200, 180]],
  [0.6,  [50,  210, 50] ],
  [0.75, [255, 220, 0]  ],
  [0.9,  [255, 120, 0]  ],
  [1,    [220, 30,  30] ],
];

function sstColor(val, min, max, rangeMin, rangeMax) {
  if (val == null || !Number.isFinite(val)) return null;
  const rMin = rangeMin ?? min;
  const rMax = rangeMax ?? max;
  return interpColor(Math.max(0, Math.min(1, (val - rMin) / (rMax - rMin))), SST_STOPS);
}

// ── Canvas constants ─────────────────────────────────────────────────────────

const CANVAS_W  = 400;
const CANVAS_H  = 320;
const LAT_SPAN  = 0.6;   // degrees: ±0.3 lat  (~20 nm N/S)
const LON_SPAN  = 0.8;   // degrees: ±0.4 lon  (~28 nm E/W at 40 °N)
// Background matches the cold end of the SST color scale so data gaps
// blend in as "cold water" rather than standing out as black artifacts.
const BG_R = 15, BG_G = 40, BG_B = 140;

// Bathymetry contour URL — same file the Leaflet map uses
const BATHY_CONTOURS_URL =
  "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry_contours.json";

// Module-level cache so we only fetch once per page session
let _bathyCache = null;

// ── Bathymetry style (mirrors SSTLive.jsx L.geoJSON style fn) ────────────────

function bathyStyle(depth_ft) {
  if (depth_ft >= 1200) return { color: "rgba(40,55,85,0.75)",  lineWidth: 1.4 };
  if (depth_ft >= 600)  return { color: "rgba(50,65,95,0.65)",  lineWidth: 1.1 };
  if (depth_ft >= 300)  return { color: "rgba(60,75,105,0.58)", lineWidth: 0.9 };
  if (depth_ft >= 100)  return { color: "rgba(70,85,115,0.50)", lineWidth: 0.8 };
  if (depth_ft >= 60)   return { color: "rgba(80,95,125,0.42)", lineWidth: 0.7 };
  return                       { color: "rgba(90,105,135,0.32)", lineWidth: 0.5 };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Render a 400×320 SST + bathymetry crop centered on a saved location.
 *
 * @param {object} opts
 * @param {number}   opts.lat        - Saved location latitude
 * @param {number}   opts.lon        - Saved location longitude
 * @param {number[]} opts.latSet     - Sorted lat grid (descending, from heatmapData)
 * @param {number[]} opts.lonSet     - Sorted lon grid (ascending, from heatmapData)
 * @param {object}   opts.grid       - SST lookup: grid[`${lat}_${lon}`] = sst
 * @param {number}   opts.sstMin     - Global SST minimum (for color scale)
 * @param {number}   opts.sstMax     - Global SST maximum (for color scale)
 * @param {number}  [opts.rangeMin]  - User range min (SSTRangeControl), or undefined
 * @param {number}  [opts.rangeMax]  - User range max (SSTRangeControl), or undefined
 * @param {string}  [opts.locationName] - Optional label drawn on image
 * @returns {Promise<Blob|null>}
 */
export async function generateShareImage({
  lat, lon,
  latSet, lonSet, grid,
  sstMin, sstMax,
  rangeMin, rangeMax,
  locationName,
}) {
  if (!latSet?.length || !lonSet?.length || !grid) return null;

  // ── Determine viewport, clamped to data extent ──────────────────────────
  const dataLatN = latSet[0];
  const dataLatS = latSet[latSet.length - 1];
  const dataLonW = lonSet[0];
  const dataLonE = lonSet[lonSet.length - 1];

  let vLatN = lat + LAT_SPAN / 2;
  let vLatS = lat - LAT_SPAN / 2;
  let vLonW = lon - LON_SPAN / 2;
  let vLonE = lon + LON_SPAN / 2;

  // Shift viewport if it overruns the data boundary, don't shrink it
  if (vLatN > dataLatN) { vLatN = dataLatN; vLatS = vLatN - LAT_SPAN; }
  if (vLatS < dataLatS) { vLatS = dataLatS; vLatN = vLatS + LAT_SPAN; }
  if (vLonW < dataLonW) { vLonW = dataLonW; vLonE = vLonW + LON_SPAN; }
  if (vLonE > dataLonE) { vLonE = dataLonE; vLonW = vLonE - LON_SPAN; }

  const latSpan = vLatN - vLatS;
  const lonSpan = vLonE - vLonW;

  const latStep = latSet.length > 1
    ? (latSet[0] - latSet[latSet.length - 1]) / (latSet.length - 1)
    : 0.05;
  const lonStep = lonSet.length > 1
    ? (lonSet[lonSet.length - 1] - lonSet[0]) / (lonSet.length - 1)
    : 0.05;

  // ── Helper: geographic coords → canvas pixel coords ─────────────────────
  const geoToPx = (geoLon, geoLat) => [
    ((geoLon - vLonW) / lonSpan) * (CANVAS_W - 1),
    ((vLatN  - geoLat) / latSpan) * (CANVAS_H - 1),
  ];

  // ── Create canvas & fill background ─────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const img = ctx.createImageData(CANVAS_W, CANVAS_H);
  const d   = img.data;

  // Initialize all pixels to dark-ocean background (fully opaque)
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = BG_R;
    d[i + 1] = BG_G;
    d[i + 2] = BG_B;
    d[i + 3] = 255;
  }

  // ── Bilinear interpolation render pass ───────────────────────────────────
  for (let py = 0; py < CANVAS_H; py++) {
    const pixLat  = vLatN - (py / (CANVAS_H - 1)) * latSpan;
    const latFloat = (latSet[0] - pixLat) / latStep;
    const latIdx0  = Math.max(0, Math.min(latSet.length - 2, Math.floor(latFloat)));
    const latFrac  = Math.max(0, Math.min(1, latFloat - latIdx0));
    const gLat0 = latSet[latIdx0];
    const gLat1 = latSet[latIdx0 + 1];

    for (let px = 0; px < CANVAS_W; px++) {
      const pixLon   = vLonW + (px / (CANVAS_W - 1)) * lonSpan;
      const lonFloat = (pixLon - lonSet[0]) / lonStep;
      const lonIdx0  = Math.max(0, Math.min(lonSet.length - 2, Math.floor(lonFloat)));
      const lonFrac  = Math.max(0, Math.min(1, lonFloat - lonIdx0));
      const gLon0 = lonSet[lonIdx0];
      const gLon1 = lonSet[lonIdx0 + 1];

      const vNW = grid[`${gLat0}_${gLon0}`];
      const vNE = grid[`${gLat0}_${gLon1}`];
      const vSW = grid[`${gLat1}_${gLon0}`];
      const vSE = grid[`${gLat1}_${gLon1}`];

      const wNW = (1 - latFrac) * (1 - lonFrac);
      const wNE = (1 - latFrac) * lonFrac;
      const wSW = latFrac       * (1 - lonFrac);
      const wSE = latFrac       * lonFrac;

      let sum = 0, wsum = 0;
      if (vNW != null && Number.isFinite(vNW)) { sum += vNW * wNW; wsum += wNW; }
      if (vNE != null && Number.isFinite(vNE)) { sum += vNE * wNE; wsum += wNE; }
      if (vSW != null && Number.isFinite(vSW)) { sum += vSW * wSW; wsum += wSW; }
      if (vSE != null && Number.isFinite(vSE)) { sum += vSE * wSE; wsum += wSE; }

      if (wsum < 0.1) continue;   // no nearby data → keep background color
      const val = sum / wsum;
      const rgb = sstColor(val, sstMin, sstMax, rangeMin, rangeMax);
      if (!rgb) continue;

      const idx   = (py * CANVAS_W + px) * 4;
      d[idx]     = rgb[0];
      d[idx + 1] = rgb[1];
      d[idx + 2] = rgb[2];
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  // ── Draw bathymetry contours ─────────────────────────────────────────────
  try {
    // Fetch once per session and cache
    if (!_bathyCache) {
      const res = await fetch(BATHY_CONTOURS_URL);
      if (res.ok) _bathyCache = await res.json();
    }

    if (_bathyCache?.features?.length) {
      // Widen the clip box slightly so lines don't abruptly end at the edge
      const PAD = 0.05; // degrees padding outside viewport for line drawing
      const clipW = vLonW - PAD, clipE = vLonE + PAD;
      const clipS = vLatS - PAD, clipN = vLatN + PAD;

      // ── Pass 1: draw contour lines ──────────────────────────────────────
      for (const feature of _bathyCache.features) {
        if (feature.geometry?.type !== "LineString") continue;
        const coords   = feature.geometry.coordinates; // [[lon, lat], ...]
        const depthFt  = feature.properties?.depth_ft ?? 0;
        const style    = bathyStyle(depthFt);

        // Check if any coordinate falls within the extended clip box
        const hasVisible = coords.some(
          ([lo, la]) => lo >= clipW && lo <= clipE && la >= clipS && la <= clipN
        );
        if (!hasVisible) continue;

        ctx.beginPath();
        ctx.strokeStyle = style.color;
        ctx.lineWidth   = style.lineWidth;
        ctx.lineJoin    = "round";
        ctx.lineCap     = "round";

        let penDown = false;
        for (const [glo, gla] of coords) {
          const [px, py] = geoToPx(glo, gla);
          if (!penDown) { ctx.moveTo(px, py); penDown = true; }
          else          { ctx.lineTo(px, py); }
        }
        ctx.stroke();
      }

      // ── Pass 2: draw depth labels ───────────────────────────────────────
      // For each depth level, find the longest run of consecutive coords
      // that lie INSIDE the actual viewport, then label the midpoint.
      const labeledDepths = new Set();

      // Sort features so shallower (more visible) depths get labeled first
      const sorted = [..._bathyCache.features].sort(
        (a, b) => (a.properties?.depth_ft ?? 0) - (b.properties?.depth_ft ?? 0)
      );

      for (const feature of sorted) {
        if (feature.geometry?.type !== "LineString") continue;
        const coords      = feature.geometry.coordinates;
        const depthFt     = feature.properties?.depth_ft   ?? 0;
        const depthFathoms = feature.properties?.depth_fathoms ?? Math.round(depthFt / 6);

        // Only one label per depth level
        if (labeledDepths.has(depthFt)) continue;

        // Find the longest run of points inside the actual viewport
        let bestRun = [], curRun = [];
        for (const [lo, la] of coords) {
          if (lo >= vLonW && lo <= vLonE && la >= vLatS && la <= vLatN) {
            curRun.push([lo, la]);
          } else {
            if (curRun.length > bestRun.length) bestRun = curRun;
            curRun = [];
          }
        }
        if (curRun.length > bestRun.length) bestRun = curRun;

        // Need at least 8 points in-view for a stable label placement
        if (bestRun.length < 8) continue;

        labeledDepths.add(depthFt);
        const mid = bestRun[Math.floor(bestRun.length / 2)];
        const [lx, ly] = geoToPx(mid[0], mid[1]);
        const label = `${depthFathoms} fa`;

        ctx.font         = "bold 10px -apple-system, sans-serif";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";

        // Subtle halo so the text is legible on both light and dark SST
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth   = 2.5;
        ctx.lineJoin    = "round";
        ctx.strokeText(label, lx, ly);

        ctx.fillStyle = "rgba(40,55,85,0.9)";
        ctx.fillText(label, lx, ly);
      }
    }
  } catch (e) {
    // Bathymetry fetch failed — continue without contours
    console.warn("generateShareImage: bathy unavailable", e);
  }

  // ── Compute SST at pin location for label ────────────────────────────────
  let pinSst = null;
  try {
    const lf  = (latSet[0] - lat) / latStep;
    const li  = Math.max(0, Math.min(latSet.length - 2, Math.floor(lf)));
    const lfr = Math.max(0, Math.min(1, lf - li));
    const lf2 = (lon - lonSet[0]) / lonStep;
    const li2 = Math.max(0, Math.min(lonSet.length - 2, Math.floor(lf2)));
    const lfr2 = Math.max(0, Math.min(1, lf2 - li2));
    const v00 = grid[`${latSet[li]}_${lonSet[li2]}`];
    const v01 = grid[`${latSet[li]}_${lonSet[li2+1]}`];
    const v10 = grid[`${latSet[li+1]}_${lonSet[li2]}`];
    const v11 = grid[`${latSet[li+1]}_${lonSet[li2+1]}`];
    let s = 0, w = 0;
    if (v00 != null && Number.isFinite(v00)) { s += v00*(1-lfr)*(1-lfr2); w += (1-lfr)*(1-lfr2); }
    if (v01 != null && Number.isFinite(v01)) { s += v01*(1-lfr)*lfr2;     w += (1-lfr)*lfr2; }
    if (v10 != null && Number.isFinite(v10)) { s += v10*lfr*(1-lfr2);     w += lfr*(1-lfr2); }
    if (v11 != null && Number.isFinite(v11)) { s += v11*lfr*lfr2;         w += lfr*lfr2; }
    if (w > 0.1) pinSst = s / w;
  } catch (_) { /* ignore */ }

  // ── Pin pixel coords ─────────────────────────────────────────────────────
  const [pinX, pinY] = geoToPx(lon, lat);
  const pX = Math.round(pinX);
  const pY = Math.round(pinY);

  // ── Draw pin marker on offscreen canvas (shadow contained) ───────────────
  const R = 11;
  const pinCanvas = document.createElement("canvas");
  pinCanvas.width  = CANVAS_W;
  pinCanvas.height = CANVAS_H;
  const pCtx = pinCanvas.getContext("2d");

  pCtx.save();
  pCtx.shadowColor   = "rgba(0,0,0,0.45)";
  pCtx.shadowBlur    = 4;
  pCtx.shadowOffsetX = 1;
  pCtx.shadowOffsetY = 2;

  // Teardrop tail
  pCtx.beginPath();
  pCtx.moveTo(pX - 5, pY + R - 2);
  pCtx.lineTo(pX,     pY + R + 11);
  pCtx.lineTo(pX + 5, pY + R - 2);
  pCtx.closePath();
  pCtx.fillStyle = "#ff5500";
  pCtx.fill();

  // Circle body
  pCtx.beginPath();
  pCtx.arc(pX, pY, R, 0, Math.PI * 2);
  pCtx.fillStyle = "#ff5500";
  pCtx.fill();
  pCtx.restore();

  // White border ring (no shadow)
  pCtx.beginPath();
  pCtx.arc(pX, pY, R, 0, Math.PI * 2);
  pCtx.strokeStyle = "#ffffff";
  pCtx.lineWidth   = 2.5;
  pCtx.stroke();

  // White center dot
  pCtx.beginPath();
  pCtx.arc(pX, pY, 3.5, 0, Math.PI * 2);
  pCtx.fillStyle = "#ffffff";
  pCtx.fill();

  ctx.drawImage(pinCanvas, 0, 0);

  // ── Temperature badge below pin ──────────────────────────────────────────
  if (pinSst != null) {
    const label  = `${pinSst.toFixed(1)}°F`;
    const badgeX = pX;
    const badgeY = pY + R + 18;

    ctx.font         = "bold 12px -apple-system, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    const tw = ctx.measureText(label).width;
    const bw = tw + 10, bh = 18, br = 5;
    const bx = badgeX - bw / 2, by = badgeY - bh / 2;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, badgeX, badgeY);
  }

  // ── Optional location name label (top-center) ─────────────────────────────
  if (locationName) {
    const maxChars = 28;
    const name = locationName.length > maxChars
      ? locationName.slice(0, maxChars - 1) + "…"
      : locationName;

    ctx.font         = "bold 13px -apple-system, sans-serif";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";

    const tw = ctx.measureText(name).width;
    const bw = tw + 14, bh = 22, br = 6;
    const bx = CANVAS_W / 2 - bw / 2, by = 10;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, CANVAS_W / 2, by + bh / 2);
  }

  // ── Color scale legend bar (bottom strip) ────────────────────────────────
  const barH = 10;
  const barW = CANVAS_W - 24;
  const barX = 12;
  const barY = CANVAS_H - barH - 10;
  const barR = 4;

  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  SST_STOPS.forEach(([pos, [r, g, b]]) => {
    grad.addColorStop(pos, `rgb(${r},${g},${b})`);
  });

  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, barR);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth   = 0.75;
  ctx.stroke();

  ctx.font         = "10px -apple-system, sans-serif";
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle    = "rgba(255,255,255,0.8)";
  ctx.fillText(`${(rangeMin ?? sstMin).toFixed(0)}°F`, barX, barY + barH + 2);

  ctx.textAlign = "right";
  ctx.fillText(`${(rangeMax ?? sstMax).toFixed(0)}°F`, barX + barW, barY + barH + 2);

  // ── Return blob ──────────────────────────────────────────────────────────
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), "image/png");
  });
}