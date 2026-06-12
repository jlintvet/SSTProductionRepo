// MAP DISPLAY UPGRADE SPIKE — branch map-upgrade-test only. Not linked from app nav.
// Validates the Windy-style layer sandwich: basemap water UNDER the SST raster,
// land detail (roads, labels, boundaries) rendered ON TOP — using a Mapbox GL
// vector basemap hosted inside the existing Leaflet stack via mapbox-gl-leaflet.
//
// URL params:
//   ?token=pk.xxx   Mapbox public token (else VITE_MAPBOX_TOKEN env, else input UI)
//   ?style=...      optional mapbox style id (default mapbox/light-v11)
import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "mapbox-gl-leaflet";
import { gridToDataURL } from "@/components/SSTHeatmapLeaflet";

const COMPOSITE_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/Bundled/viirs_composite.json";
const OCEAN_MASK_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/ocean_mask.json";
const CARTO_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
// Fade band in LEAFLET zoom units. GL zoom = Leaflet zoom - 1.
const FADE_START_LZ = 10.0;
const FADE_END_LZ = 12.0;
const SST_OPACITY = 1.0;

async function loadMask() {
  try {
    const res = await fetch(OCEAN_MASK_URL);
    if (!res.ok) return null;
    const { bounds, step, rows, cols, packed } = await res.json();
    const bin = atob(packed);
    const bits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
    return (lat, lon) => {
      const ri = Math.round((bounds.n - lat) / step);
      const ci = Math.round((lon - bounds.w) / step);
      if (ri < 0 || ri >= rows || ci < 0 || ci >= cols) return false;
      const idx = ri * cols + ci;
      return (bits[idx >> 3] & (0x80 >> (idx & 7))) !== 0;
    };
  } catch { return null; }
}

// NOTE: zoom-interpolate expressions on raster-opacity render invisible under
// mapbox-gl-leaflet (verified in spike). Fade is driven from JS with plain numbers.
// gridToDataURL bakes alpha=220 into pixels; rewrite to 255 for solid colors.
async function solidify(blobUrl) {
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

// Land mask rasterized from the basemap's own rendered water polygons.
// Same geometry as the tiles -> exact coastline alignment. Canvas fill is
// ~instant vs turf boolean ops (which froze the page on complex coasts).
function updateLandMask(glMap) {
  try {
    if (!glMap.getLayer("sst-img")) return;
    const b = glMap.getBounds();
    const padX = (b.getEast() - b.getWest()) * 0.15;
    const padY = (b.getNorth() - b.getSouth()) * 0.15;
    const w = b.getWest() - padX, e = b.getEast() + padX;
    const s = Math.max(-85, b.getSouth() - padY), n = Math.min(85, b.getNorth() + padY);
    const W = 2048, H = 2048;
    const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    const mN = mercY(n), mS = mercY(s);
    const px = (lon) => ((lon - w) / (e - w)) * W;
    const py = (lat) => ((mN - mercY(lat)) / (mN - mS)) * H;
    if (!window.__landCanvas) window.__landCanvas = document.createElement("canvas");
    const canvas = window.__landCanvas;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    let landColor = "#f7f7f5";
    try {
      const bg = glMap.getStyle().layers.find((l) => l.type === "background");
      const c = glMap.getPaintProperty(bg.id, "background-color");
      if (typeof c === "string") landColor = c;
    } catch (_) {}
    ctx.globalCompositeOperation = "source-over";
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
    ctx.globalCompositeOperation = "source-over";
    const coords = [[w, n], [e, n], [e, s], [w, s]];
    const src = glMap.getSource("land-mask-src");
    if (!src) {
      glMap.addSource("land-mask-src", { type: "canvas", canvas, coordinates: coords, animate: false });
      const layers = glMap.getStyle().layers;
      const si = layers.findIndex((l) => l.id === "sst-img");
      const beforeId = si >= 0 && si + 1 < layers.length ? layers[si + 1].id : undefined;
      glMap.addLayer({ id: "land-mask", type: "raster", source: "land-mask-src", paint: { "raster-fade-duration": 0 } }, beforeId);
      console.log("[SPIKE] canvas land-mask inserted before", beforeId, "| water feats:", feats.length);
    } else {
      src.setCoordinates(coords);
      try { src.play(); requestAnimationFrame(() => { try { src.pause(); } catch (_) {} }); } catch (_) {}
    }
    glMap.triggerRepaint();
  } catch (err) { console.error("[SPIKE] land mask failed:", err); }
}

function opacityFor(leafletZoom, fadeOn) {
  if (!fadeOn) return SST_OPACITY;
  if (leafletZoom <= FADE_START_LZ) return SST_OPACITY;
  if (leafletZoom >= FADE_END_LZ) return 0;
  return SST_OPACITY * (1 - (leafletZoom - FADE_START_LZ) / (FADE_END_LZ - FADE_START_LZ));
}

export default function MapTest() {
  const params = new URLSearchParams(window.location.search);
  const initialToken =
    params.get("token") ||
    sessionStorage.getItem("mb_token") ||
    import.meta.env.VITE_MAPBOX_TOKEN ||
    "";
  const styleId = params.get("style") || "mapbox/light-v11";

  const [token, setToken] = useState(initialToken);
  const [tokenInput, setTokenInput] = useState("");
  const [status, setStatus] = useState("loading data…");
  const [zoomLabel, setZoomLabel] = useState("");
  const [sstMode, setSstMode] = useState("sandwich"); // sandwich | top | off
  const [basemap, setBasemap] = useState("vector");   // vector | carto
  const [fade, setFade] = useState(false);

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const glLayerRef = useRef(null);
  const cartoLayerRef = useRef(null);
  const topOverlayRef = useRef(null);
  const dataRef = useRef(null); // { url, west,east,north,south }
  const fadeRef = useRef(fade);
  fadeRef.current = fade;

  // ── map + data init (once token known) ─────────────────────────────────────
  useEffect(() => {
    if (!token || mapRef.current) return;
    sessionStorage.setItem("mb_token", token);

    const map = L.map(mapEl.current, {
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    });
    map.setView([36.3, -75.5], 7);
    mapRef.current = map;

    const onZoom = () => {
      const lz = map.getZoom();
      setZoomLabel(`Leaflet z ${lz.toFixed(2)}  |  GL z ${(lz - 1).toFixed(2)}`);
    };
    const onZoomFade = () => {
      const glMap = glLayerRef.current?.getMapboxMap?.();
      if (glMap && glMap.getLayer && glMap.getLayer("sst-img")) {
        glMap.setPaintProperty("sst-img", "raster-opacity", opacityFor(map.getZoom(), fadeRef.current));
        try { glMap.triggerRepaint(); } catch (_) {}
      }
    };
    map.on("zoomend zoom move", onZoom);
    map.on("zoom zoomend", onZoomFade);
    onZoom();

    // demo Leaflet markers — proves existing Leaflet overlays still sit on top
    L.circleMarker([35.25, -75.0], { radius: 7, color: "#dc2626", weight: 2, fillOpacity: 0.6 })
      .addTo(map).bindPopup("Demo wreck marker (Leaflet pane above GL canvas)");
    L.circleMarker([36.0, -74.5], { radius: 7, color: "#7c3aed", weight: 2, fillOpacity: 0.6 })
      .addTo(map).bindPopup("Demo community pin");

    (async () => {
      try {
        const [cd, mask] = await Promise.all([
          fetch(COMPOSITE_URL).then((r) => r.json()),
          loadMask(),
        ]);
        const latSet = [...cd.latSet].sort((a, b) => b - a);
        const lonSet = [...cd.lonSet].sort((a, b) => a - b);
        const nLons = cd.lonSet.length;
        const grid = {};
        const vals = [];
        cd.sst.forEach((v, idx) => {
          if (v === null || v === undefined) return;
          const li = Math.floor(idx / nLons), lo = idx % nLons;
          if (li < cd.latSet.length) {
            grid[`${cd.latSet[li]}_${cd.lonSet[lo]}`] = v;
            vals.push(v);
          }
        });
        vals.sort((a, b) => a - b);
        const mn = vals[Math.floor(vals.length * 0.02)];
        const mx = vals[Math.floor(vals.length * 0.98)];
        const res = await gridToDataURL(latSet, lonSet, grid, mn, mx, null, mask);
        if (!res) { setStatus("render failed"); return; }
        res.dataURL = await solidify(res.dataURL);
        dataRef.current = res;

        // hard pan/zoom clamp to the SST data bounds
        const b = L.latLngBounds([[res.south, res.west], [res.north, res.east]]);
        const fz = map.getBoundsZoom(b, true);
        map.setMinZoom(fz);
        map.setMaxBounds(b);
        map.setView(b.getCenter(), fz, { animate: false });

        setStatus(`composite ${cd.date || ""} · ${mn.toFixed(1)}–${mx.toFixed(1)}°F · fill z ${fz.toFixed(2)}`);
        applyLayers();
      } catch (e) {
        console.error(e);
        setStatus("data load failed: " + e.message);
      }
    })();

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── layer application ───────────────────────────────────────────────────────
  function removeGlSst() {
    const glMap = glLayerRef.current?.getMapboxMap?.();
    if (glMap && glMap.getLayer && glMap.getLayer("sst-img")) {
      glMap.removeLayer("sst-img");
      glMap.removeSource("sst-img");
      if (glMap.getLayer("land-mask")) { glMap.removeLayer("land-mask"); glMap.removeSource("land-mask-src"); }
    }
  }

  function insertGlSst() {
    const glMap = glLayerRef.current?.getMapboxMap?.();
    const d = dataRef.current;
    if (!glMap || !d) return;
    const doInsert = () => {
      if (glMap.getLayer("sst-img")) return;
      const layers = glMap.getStyle().layers;
      let beforeId = null;
      let wi = -1;
      layers.forEach((l, i) => { if (l.type === "fill" && /water/i.test(l.id)) wi = i; });
      if (wi >= 0 && wi + 1 < layers.length) beforeId = layers[wi + 1].id;
      else { const sym = layers.find((l) => l.type === "symbol"); beforeId = sym ? sym.id : undefined; }
      glMap.addSource("sst-img", {
        type: "image",
        url: d.dataURL,
        coordinates: [
          [d.west, d.north], [d.east, d.north],
          [d.east, d.south], [d.west, d.south],
        ],
      });
      glMap.addLayer(
        {
          id: "sst-img", type: "raster", source: "sst-img",
          paint: {
            "raster-opacity": opacityFor(mapRef.current ? mapRef.current.getZoom() : 7, fadeRef.current),
            "raster-fade-duration": 0,
            "raster-resampling": "linear",
          },
        },
        beforeId
      );
      window.__glMap = glMap;
      glMap.on("error", (e) => console.error("[SPIKE GL ERROR]", e?.error?.message || e));
      // mapbox-gl-leaflet only repaints on Leaflet move events — kick the render
      // loop so the freshly loaded image source actually draws.
      // Force the plugin's move-sync path (jumpTo + full re-render). Plain
      // triggerRepaint from page timers does not flush the new image layer.
      const kick = () => {
        try { glLayerRef.current && glLayerRef.current._update(); } catch (_) {}
        try { glMap.triggerRepaint(); } catch (_) {}
      };
      glMap.on("data", (e) => { if (e.sourceId === "sst-img" && e.isSourceLoaded) kick(); });
      glMap.once("idle", kick);
      let kicks = 0;
      const kickTimer = setInterval(() => { kick(); if (++kicks >= 20) clearInterval(kickTimer); }, 500);
      console.log("[SPIKE] SST inserted before layer:", beforeId);
      const refreshLand = () => setTimeout(() => updateLandMask(glMap), 350);
      glMap.once("idle", () => updateLandMask(glMap));
      if (mapRef.current) mapRef.current.on("moveend zoomend", refreshLand);
    };
    if (glMap.isStyleLoaded()) doInsert();
    else glMap.once("idle", doInsert);
  }

  function applyLayers() {
    const map = mapRef.current;
    if (!map) return;

    // basemap
    if (basemap === "vector") {
      if (cartoLayerRef.current) { map.removeLayer(cartoLayerRef.current); cartoLayerRef.current = null; }
      if (!glLayerRef.current) {
        glLayerRef.current = L.mapboxGL({
          accessToken: token,
          style: `mapbox://styles/${styleId}`,
          interactive: false,
        }).addTo(map);
      }
    } else {
      removeGlSst();
      if (glLayerRef.current) { map.removeLayer(glLayerRef.current); glLayerRef.current = null; }
      if (!cartoLayerRef.current) {
        cartoLayerRef.current = L.tileLayer(CARTO_URL, { attribution: "© OSM · © CARTO" }).addTo(map);
      }
    }

    // SST layer
    const wantSandwich = sstMode === "sandwich" && basemap === "vector";
    const wantTop = sstMode === "top" || (sstMode === "sandwich" && basemap === "carto");

    if (wantSandwich) {
      if (topOverlayRef.current) { map.removeLayer(topOverlayRef.current); topOverlayRef.current = null; }
      insertGlSst();
    } else {
      removeGlSst();
      if (wantTop && dataRef.current && !topOverlayRef.current) {
        const d = dataRef.current;
        topOverlayRef.current = L.imageOverlay(d.dataURL, [[d.south, d.west], [d.north, d.east]], { opacity: 1.0 }).addTo(map);
      }
      if (!wantTop && topOverlayRef.current) { map.removeLayer(topOverlayRef.current); topOverlayRef.current = null; }
    }
  }

  useEffect(() => { applyLayers(); /* eslint-disable-line */ }, [sstMode, basemap]);

  useEffect(() => {
    const glMap = glLayerRef.current?.getMapboxMap?.();
    if (glMap && glMap.getLayer && glMap.getLayer("sst-img")) {
      glMap.setPaintProperty("sst-img", "raster-opacity", opacityFor(mapRef.current ? mapRef.current.getZoom() : 7, fade));
      try { glMap.triggerRepaint(); } catch (_) {}
    }
  }, [fade]);

  // ── UI ──────────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f172a" }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, fontFamily: "system-ui" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Map upgrade test</div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
            Paste a Mapbox public token (pk.) to start. Stored in this browser session only.
          </div>
          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="pk.eyJ…"
            style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 13, marginBottom: 10 }} />
          <button onClick={() => tokenInput.trim() && setToken(tokenInput.trim())}
            style={{ width: "100%", background: "#0284c7", color: "#fff", border: 0, borderRadius: 8, padding: "9px 0", fontWeight: 600, cursor: "pointer" }}>
            Load map
          </button>
        </div>
      </div>
    );
  }

  const btn = (active) => ({
    flex: 1, padding: "5px 8px", fontSize: 11, borderRadius: 6, cursor: "pointer",
    border: active ? "1px solid #0284c7" : "1px solid #cbd5e1",
    background: active ? "#e0f2fe" : "#fff", color: "#0f172a", fontWeight: active ? 700 : 400,
  });

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", fontFamily: "system-ui" }}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: 12, width: 230, boxShadow: "0 4px 16px rgba(0,0,0,0.18)", fontSize: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Map upgrade test</div>
        <div style={{ color: "#475569", marginBottom: 4 }}>Basemap</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button style={btn(basemap === "vector")} onClick={() => setBasemap("vector")}>Vector GL (new)</button>
          <button style={btn(basemap === "carto")} onClick={() => setBasemap("carto")}>Carto raster (old)</button>
        </div>
        <div style={{ color: "#475569", marginBottom: 4 }}>SST layer</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button style={btn(sstMode === "sandwich")} onClick={() => setSstMode("sandwich")}>Under labels</button>
          <button style={btn(sstMode === "top")} onClick={() => setSstMode("top")}>On top (old)</button>
          <button style={btn(sstMode === "off")} onClick={() => setSstMode("off")}>Off</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button style={btn(fade)} onClick={() => setFade(true)}>Zoom fade on</button>
          <button style={btn(!fade)} onClick={() => setFade(false)}>Fade off</button>
        </div>
        <div style={{ color: "#475569", fontSize: 11, lineHeight: 1.5 }}>
          {status}<br />{zoomLabel}<br />
          Fade band: z {FADE_START_LZ}–{FADE_END_LZ} · pan/zoom locked to SST bounds
        </div>
      </div>
    </div>
  );
}
