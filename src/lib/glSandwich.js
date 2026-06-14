// glSandwich.js
// Windy-style GL vector basemap + raster "under labels" sandwich + exact
// basemap-coastline clip + inshore gap fill. Ported verbatim from the validated
// /maptest spike (branch map-upgrade-test). Production settings: light style,
// land mask ON, no zoom fade (opacity 1), gap fill ON with K=0.
//
// Falls back gracefully: createGlBasemap returns null when no token, so the
// caller keeps the old CartoDB + L.imageOverlay path.

import L from "leaflet";
import "mapbox-gl/dist/mapbox-gl.css";
import "mapbox-gl-leaflet";

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";
export const GL_STYLE = "mapbox/light-v11";

export function createGlBasemap(map, styleId = GL_STYLE) {
  if (!MAPBOX_TOKEN) return null;
  try {
    return L.mapboxGL({
      accessToken: MAPBOX_TOKEN,
      style: `mapbox://styles/${styleId}`,
      interactive: false,
    }).addTo(map);
  } catch (e) { console.warn("[glSandwich] GL basemap failed:", e); return null; }
}

export function getGlMap(glLayer) {
  try { return glLayer && glLayer.getMapboxMap ? glLayer.getMapboxMap() : null; } catch (_) { return null; }
}

// gridToDataURL bakes alpha=220 into pixels; rewrite >0 alpha to 255 so colors
// are fully opaque (no see-through).
export async function solidify(blobUrl) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = blobUrl; });
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 3; i < d.length; i += 4) { if (d[i] > 0) d[i] = 255; }
  ctx.putImageData(id, 0, 0);
  return new Promise((resolve) => c.toBlob((b) => resolve(URL.createObjectURL(b)), "image/png"));
}

// Inshore gap fill (display-only). Fills ONLY (a) inshore water -- a no-data
// cell with land on OPPOSITE sides within AXIS_D cells (sounds, bays, creeks
// behind the barrier islands), and (b) a K-cell shoreline connector. Open ocean
// and offshore cloud holes have no opposing land and are beyond K, so they are
// NEVER filled. Value = nearest valid SST (BFS over water), capped to
// MAX_FILL_DIST cells from real data. Then a 2-cell landward dilation so SST
// reaches past the coarse coastline (basemap-water mask clips to exact coast).
export function gapFillGrid(latSet, lonSet, grid, mask, K = 0) {
  const R = latSet.length, C = lonSet.length, N = R * C;
  const ix = (r, c) => r * C + c;
  const AXIS_D = 22, AXIS_MIN = 1, MAX_FILL_DIST = 8;
  const out = {};
  const vals = new Float32Array(N);
  const has = new Uint8Array(N);
  const land = new Uint8Array(N);
  for (let r = 0; r < R; r++) {
    const lat = latSet[r];
    for (let c = 0; c < C; c++) {
      const lon = lonSet[c], i = ix(r, c);
      const v = grid[`${lat}_${lon}`];
      if (v !== undefined && v !== null) { vals[i] = v; has[i] = 1; out[`${lat}_${lon}`] = v; }
      if (mask && !mask(lat, lon)) land[i] = 1;
    }
  }
  if (!mask) return out;

  const distLand = new Int32Array(N).fill(-1);
  let fr = [];
  for (let i = 0; i < N; i++) if (land[i]) { distLand[i] = 0; fr.push(i); }
  while (fr.length) {
    const nx = [];
    for (const i of fr) {
      const r = (i / C) | 0, c = i % C;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr; if (rr < 0 || rr >= R) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc; if (cc < 0 || cc >= C) continue;
          const j = ix(rr, cc);
          if (distLand[j] === -1) { distLand[j] = distLand[i] + 1; nx.push(j); }
        }
      }
    }
    fr = nx;
  }

  const srcVal = new Float32Array(N);
  const reached = new Uint8Array(N);
  const distData = new Int32Array(N).fill(-1);
  let q = [];
  for (let i = 0; i < N; i++) if (has[i]) { srcVal[i] = vals[i]; reached[i] = 1; distData[i] = 0; q.push(i); }
  while (q.length) {
    const nx = [];
    for (const i of q) {
      const r = (i / C) | 0, c = i % C;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr; if (rr < 0 || rr >= R) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc; if (cc < 0 || cc >= C) continue;
          const j = ix(rr, cc);
          if (land[j] || reached[j]) continue;
          srcVal[j] = srcVal[i]; reached[j] = 1; distData[j] = distData[i] + 1; nx.push(j);
        }
      }
    }
    q = nx;
  }

  const AX = [[[-1,0],[1,0]],[[0,1],[0,-1]],[[-1,1],[1,-1]],[[-1,-1],[1,1]]];
  const landIn = (r, c, dr, dc) => {
    for (let s = 1; s <= AXIS_D; s++) {
      const rr = r + dr * s, cc = c + dc * s;
      if (rr < 0 || rr >= R || cc < 0 || cc >= C) return false;
      if (land[ix(rr, cc)]) return true;
    }
    return false;
  };
  const inshore = (r, c) => {
    let n = 0;
    for (let a = 0; a < 4; a++) {
      const A = AX[a][0], B = AX[a][1];
      if (landIn(r, c, A[0], A[1]) && landIn(r, c, B[0], B[1])) { n++; if (n >= AXIS_MIN) return true; }
    }
    return false;
  };

  const value = new Float32Array(N);
  const valued = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (has[i]) { value[i] = vals[i]; valued[i] = 1; }
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const i = ix(r, c);
      if (has[i] || land[i] || !reached[i]) continue;
      if (distData[i] > MAX_FILL_DIST) continue;
      if (distLand[i] <= K || inshore(r, c)) {
        value[i] = srcVal[i]; valued[i] = 1;
        out[`${latSet[r]}_${lonSet[c]}`] = srcVal[i];
      }
    }
  }
  const DILATE = 2;
  let df = [];
  for (let i = 0; i < N; i++) if (valued[i]) df.push(i);
  for (let step = 0; step < DILATE && df.length; step++) {
    const nx = [];
    for (const i of df) {
      const r = (i / C) | 0, c = i % C;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = r + dr; if (rr < 0 || rr >= R) continue;
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc; if (cc < 0 || cc >= C) continue;
          const j = ix(rr, cc);
          if (valued[j] || !land[j]) continue;
          value[j] = value[i]; valued[j] = 1;
          out[`${latSet[rr]}_${lonSet[cc]}`] = value[i];
          nx.push(j);
        }
      }
    }
    df = nx;
  }
  return out;
}

// ---- basemap-water land mask: rasterize the basemap's own water polygons and
// draw land (exact Mapbox coastline) over the SST so SST shows only on water.
let landMaskUrl = null;
let lastMaskKey = "";
function maskKey(glMap) {
  const b = glMap.getBounds();
  return [b.getWest(), b.getEast(), b.getSouth(), b.getNorth()].map((v) => v.toFixed(5)).join("|");
}
export function updateLandMask(glMap) {
  try {
    if (!glMap || !glMap.getLayer("sst-img")) return;
    lastMaskKey = maskKey(glMap);
    const b = glMap.getBounds();
    const padX = (b.getEast() - b.getWest()) * 0.25;
    const padY = (b.getNorth() - b.getSouth()) * 0.25;
    const w = b.getWest() - padX, e = b.getEast() + padX;
    const s = Math.max(-85, b.getSouth() - padY), n = Math.min(85, b.getNorth() + padY);
    const W = 1024, H = 1024; // lighter raster -> faster zoom
    const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    const mN = mercY(n), mS = mercY(s);
    const px = (lon) => ((lon - w) / (e - w)) * W;
    const py = (lat) => ((mN - mercY(lat)) / (mN - mS)) * H;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    let landColor = "#f7f7f5";
    try {
      const bg = glMap.getStyle().layers.find((l) => l.type === "background");
      const c = glMap.getPaintProperty(bg.id, "background-color");
      if (typeof c === "string") landColor = c;
    } catch (_) {}
    ctx.fillStyle = landColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "destination-out";
    const waterIds = ["water", "water-shadow"].filter((id) => glMap.getLayer(id));
    const feats = glMap.queryRenderedFeatures({ layers: waterIds });
    for (const f of feats) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates]
        : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      for (const poly of polys) {
        ctx.beginPath();
        for (const ring of poly) {
          for (let i = 0; i < ring.length; i++) {
            const X = px(ring[i][0]), Y = py(ring[i][1]);
            if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
          }
          ctx.closePath();
        }
        ctx.fill();
      }
    }
    const coords = [[w, n], [e, n], [e, s], [w, s]];
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      try {
        const src = glMap.getSource("land-mask-src");
        if (!src) {
          glMap.addSource("land-mask-src", { type: "image", url, coordinates: coords });
          const layers = glMap.getStyle().layers;
          const si = layers.findIndex((l) => l.id === "sst-img");
          const beforeId = si >= 0 && si + 1 < layers.length ? layers[si + 1].id : undefined;
          glMap.addLayer({ id: "land-mask", type: "raster", source: "land-mask-src", paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } }, beforeId);
        } else {
          src.updateImage({ url, coordinates: coords });
        }
        glMap.triggerRepaint();
      } finally {
        if (landMaskUrl) { const old = landMaskUrl; setTimeout(() => URL.revokeObjectURL(old), 5000); }
        landMaskUrl = url;
      }
    }, "image/png");
  } catch (err) { console.error("[glSandwich] land mask failed:", err); }
}

// Insert or update the SST raster image source under the basemap labels.
export function upsertSstImage(glLayer, dataURL, west, east, north, south) {
  const glMap = getGlMap(glLayer);
  if (!glMap) return;
  const coords = [[west, north], [east, north], [east, south], [west, south]];
  const kick = () => {
    try { glLayer._update && glLayer._update(); } catch (_) {}
    try { glMap.triggerRepaint(); } catch (_) {}
  };
  const doIt = () => {
    const src = glMap.getSource("sst-img");
    if (src) {
      src.updateImage({ url: dataURL, coordinates: coords });
    } else {
      const layers = glMap.getStyle().layers;
      let wi = -1;
      layers.forEach((l, i) => { if (l.type === "fill" && /water/i.test(l.id)) wi = i; });
      let beforeId;
      if (wi >= 0 && wi + 1 < layers.length) beforeId = layers[wi + 1].id;
      else { const sym = layers.find((l) => l.type === "symbol"); beforeId = sym ? sym.id : undefined; }
      glMap.addSource("sst-img", { type: "image", url: dataURL, coordinates: coords });
      glMap.addLayer({ id: "sst-img", type: "raster", source: "sst-img", paint: { "raster-opacity": 1, "raster-fade-duration": 0, "raster-resampling": "linear" } }, beforeId);
    }
    glMap.once("idle", () => { updateLandMask(glMap); kick(); });
    let k = 0; const t = setInterval(() => { kick(); if (++k >= 10) clearInterval(t); }, 400);
    setTimeout(() => updateLandMask(glMap), 300);
  };
  if (glMap.isStyleLoaded()) doIt(); else glMap.once("idle", doIt);
}

export function removeSstImage(glLayer) {
  const glMap = getGlMap(glLayer);
  if (!glMap) return;
  try {
    if (glMap.getLayer("land-mask")) { glMap.removeLayer("land-mask"); glMap.removeSource("land-mask-src"); }
    if (glMap.getLayer("sst-img")) { glMap.removeLayer("sst-img"); glMap.removeSource("sst-img"); }
  } catch (_) {}
}

// Wire land-mask recompute when the map settles (basemap water changes per view).
export function installLandMaskRefresh(map, glLayer) {
  const glMap = getGlMap(glLayer);
  if (!map || !glMap) return;
  // Recompute only once per settle (idle = movement done + tiles loaded), and
  // only if the view actually changed -- keeps zoom/pan smooth.
  glMap.on("idle", () => { if (maskKey(glMap) !== lastMaskKey) updateLandMask(glMap); });
}
