// generateRouteShareImage.js
// Creates a 400×240 SST route preview image showing the route polyline
// and numbered waypoint markers rendered on the SST heatmap + bathy contours.
// Mirror of generateShareImage.js but for multi-waypoint routes.

// ── Color pipeline (mirrors generateShareImage.js) ───────────────────────────

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

const CANVAS_W  = 400;
const CANVAS_H  = 240;
const BG_R = 15, BG_G = 40, BG_B = 140;

const BATHY_CONTOURS_URL =
  "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry_contours.json";

let _bathyCache = null;

function bathyStyle(depth_ft) {
  if (depth_ft >= 1200) return { color: "rgba(40,55,85,0.75)",  lineWidth: 1.4 };
  if (depth_ft >= 600)  return { color: "rgba(50,65,95,0.65)",  lineWidth: 1.1 };
  if (depth_ft >= 300)  return { color: "rgba(60,75,105,0.58)", lineWidth: 0.9 };
  if (depth_ft >= 100)  return { color: "rgba(70,85,115,0.50)", lineWidth: 0.8 };
  if (depth_ft >= 60)   return { color: "rgba(80,95,125,0.42)", lineWidth: 0.7 };
  return                       { color: "rgba(90,105,135,0.32)", lineWidth: 0.5 };
}

/**
 * Render a 400×240 SST + route image.
 *
 * @param {object} opts
 * @param {Array}    opts.waypoints  - [{lat, lng, label}, ...]
 * @param {number[]} opts.latSet     - Sorted lat grid (descending)
 * @param {number[]} opts.lonSet     - Sorted lon grid (ascending)
 * @param {object}   opts.grid       - grid[`${lat}_${lon}`] = sst
 * @param {number}   opts.sstMin
 * @param {number}   opts.sstMax
 * @param {number}  [opts.rangeMin]
 * @param {number}  [opts.rangeMax]
 * @param {string}  [opts.routeName]
 * @returns {Promise<Blob|null>}
 */
export async function generateRouteShareImage({
  waypoints,
  latSet, lonSet, grid,
  sstMin, sstMax,
  rangeMin, rangeMax,
  routeName,
}) {
  if (!latSet?.length || !lonSet?.length || !grid) return null;
  if (!waypoints?.length) return null;

  const wLats = waypoints.map(w => parseFloat(w.lat));
  const wLons = waypoints.map(w => parseFloat(w.lng));

  const wLatMax = Math.max(...wLats);
  const wLatMin = Math.min(...wLats);
  const wLonMax = Math.max(...wLons);
  const wLonMin = Math.min(...wLons);

  // Ensure a minimum span so single-waypoint or tight routes aren't zoomed in too far
  const latSpanRaw = Math.max(wLatMax - wLatMin, 0.25);
  const lonSpanRaw = Math.max(wLonMax - wLonMin, 0.35);

  // Add 25% padding around the route bounds
  const PAD = 0.25;
  const latPad = latSpanRaw * PAD;
  const lonPad = lonSpanRaw * PAD;

  let vLatN = wLatMax + latPad;
  let vLatS = wLatMin - latPad;
  let vLonW = wLonMin - lonPad;
  let vLonE = wLonMax + lonPad;

  // Clamp to data bounds
  const dataLatN = latSet[0];
  const dataLatS = latSet[latSet.length - 1];
  const dataLonW = lonSet[0];
  const dataLonE = lonSet[lonSet.length - 1];
  vLatN = Math.min(vLatN, dataLatN);
  vLatS = Math.max(vLatS, dataLatS);
  vLonW = Math.max(vLonW, dataLonW);
  vLonE = Math.min(vLonE, dataLonE);

  // Ensure positive span after clamping
  if (vLatN <= vLatS) vLatN = vLatS + 0.1;
  if (vLonE <= vLonW) vLonE = vLonW + 0.1;

  const latSpan = vLatN - vLatS;
  const lonSpan = vLonE - vLonW;

  const latStep = latSet.length > 1
    ? (latSet[0] - latSet[latSet.length - 1]) / (latSet.length - 1)
    : 0.05;
  const lonStep = lonSet.length > 1
    ? (lonSet[lonSet.length - 1] - lonSet[0]) / (lonSet.length - 1)
    : 0.05;

  const geoToPx = (geoLon, geoLat) => [
    ((geoLon - vLonW) / lonSpan) * (CANVAS_W - 1),
    ((vLatN  - geoLat) / latSpan) * (CANVAS_H - 1),
  ];

  // ── Canvas ───────────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  const img = ctx.createImageData(CANVAS_W, CANVAS_H);
  const d   = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = BG_R; d[i+1] = BG_G; d[i+2] = BG_B; d[i+3] = 255;
  }

  // ── SST bilinear interpolation ───────────────────────────────────────────
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

      if (wsum < 0.1) continue;
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

  // ── Bathymetry contours ──────────────────────────────────────────────────
  try {
    if (!_bathyCache) {
      const res = await fetch(BATHY_CONTOURS_URL);
      if (res.ok) _bathyCache = await res.json();
    }

    if (_bathyCache?.features?.length) {
      const PAD2 = 0.05;
      const clipW = vLonW - PAD2, clipE = vLonE + PAD2;
      const clipS = vLatS - PAD2, clipN = vLatN + PAD2;

      for (const feature of _bathyCache.features) {
        if (feature.geometry?.type !== "LineString") continue;
        const coords  = feature.geometry.coordinates;
        const depthFt = feature.properties?.depth_ft ?? 0;
        const style   = bathyStyle(depthFt);

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
    }
  } catch (e) {
    console.warn("generateRouteShareImage: bathy unavailable", e);
  }

  // ── Route polyline ───────────────────────────────────────────────────────
  if (waypoints.length >= 2) {
    const points = waypoints.map(w => geoToPx(parseFloat(w.lng), parseFloat(w.lat)));

    // Shadow
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth   = 4;
    ctx.lineJoin    = "round";
    ctx.lineCap     = "round";
    ctx.setLineDash([]);
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();

    // Cyan route line
    ctx.beginPath();
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = "round";
    ctx.lineCap     = "round";
    ctx.setLineDash([6, 4]);
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Waypoint markers ─────────────────────────────────────────────────────
  waypoints.forEach((w, i) => {
    const [px, py] = geoToPx(parseFloat(w.lng), parseFloat(w.lat));
    const R = 9;

    // Shadow
    const mc = document.createElement("canvas");
    mc.width = CANVAS_W; mc.height = CANVAS_H;
    const mctx = mc.getContext("2d");
    mctx.save();
    mctx.shadowColor   = "rgba(0,0,0,0.4)";
    mctx.shadowBlur    = 3;
    mctx.shadowOffsetY = 1;
    mctx.beginPath();
    mctx.arc(px, py, R, 0, Math.PI * 2);
    mctx.fillStyle = i === 0 ? "#f97316" : "#06b6d4";
    mctx.fill();
    mctx.restore();

    // White border
    mctx.beginPath();
    mctx.arc(px, py, R, 0, Math.PI * 2);
    mctx.strokeStyle = "#ffffff";
    mctx.lineWidth   = 2;
    mctx.stroke();

    // Number
    mctx.font         = `bold ${R < 9 ? 8 : 9}px -apple-system, sans-serif`;
    mctx.textAlign    = "center";
    mctx.textBaseline = "middle";
    mctx.fillStyle    = "#ffffff";
    mctx.fillText(String(i + 1), px, py);

    ctx.drawImage(mc, 0, 0);
  });

  // ── Route name label (top strip) ─────────────────────────────────────────
  if (routeName) {
    const maxChars = 30;
    const name = routeName.length > maxChars
      ? routeName.slice(0, maxChars - 1) + "…"
      : routeName;

    ctx.font         = "bold 12px -apple-system, sans-serif";
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";

    const tw = ctx.measureText(name).width;
    const bw = tw + 12, bh = 20, br = 5;
    const bx = 8, by = 8;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, br);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(name, bx + 6, by + bh / 2);
  }

  // ── Color scale legend bar ────────────────────────────────────────────────
  const barH = 8;
  const barW = CANVAS_W - 24;
  const barX = 12;
  const barY = CANVAS_H - barH - 8;
  const barR = 3;

  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  SST_STOPS.forEach(([pos, [r, g, b]]) => {
    grad.addColorStop(pos, `rgb(${r},${g},${b})`);
  });

  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, barR);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth   = 0.75;
  ctx.stroke();

  ctx.font         = "9px -apple-system, sans-serif";
  ctx.textAlign    = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle    = "rgba(255,255,255,0.75)";
  ctx.fillText(`${(rangeMin ?? sstMin).toFixed(0)}°F`, barX, barY + barH + 2);
  ctx.textAlign = "right";
  ctx.fillText(`${(rangeMax ?? sstMax).toFixed(0)}°F`, barX + barW, barY + barH + 2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), "image/png");
  });
}
