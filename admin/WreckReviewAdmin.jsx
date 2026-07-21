/**
 * WreckReviewAdmin.jsx
 * =====================
 * Admin-only wreck curation tool.
 *
 * Navigation order: greedy nearest-neighbor — Next always moves to the
 * geographically closest wreck from the current position, so you work through
 * the region without jumping around. Clicking a map marker or list row
 * re-anchors the sequence from that point.
 *
 * Map shows ALL wrecks + bathymetric contours simultaneously.
 * Markers: Amber = pending · Green = keep · Red = remove
 *
 * Base44 entity required — "WreckReview":
 *   wreck_key (Text)  lat (Number)  lon (Number)  name (Text)
 *   symbol (Text)  region (Text)  depth_ft (Number)  year_sunk (Number)
 *   decision (Text — "keep"|"remove"|"pending")  notes (Text)  reviewed_date (Date)
 *
 * Keyboard shortcuts (outside notes field):
 *   K = keep   X = remove   ↑ / ↓ = prev / next nearest
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet / Tailwind image fix
if (typeof document !== "undefined" && !document.getElementById("wreck-admin-lf-fix")) {
  const s = document.createElement("style");
  s.id = "wreck-admin-lf-fix";
  s.textContent = `
    .leaflet-container img.leaflet-image-layer,
    .leaflet-container img.leaflet-tile,
    .leaflet-pane img { max-width: none !important; max-height: none !important; }
  `;
  document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_EMAILS       = ["jlintvet@gmail.com"];
const WRECKS_URL         = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/wrecks.json";
const BATHY_CONTOURS_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry_contours.json";
const MAP_CENTER         = [36.5, -74.8];
const MAP_ZOOM           = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────
function wreckKey(f) {
  const [lon, lat] = f.geometry.coordinates;
  return `${(f.properties?.name ?? "").trim()}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
}

function dist2(f1, f2) {
  const [lo1, la1] = f1.geometry.coordinates;
  const [lo2, la2] = f2.geometry.coordinates;
  return (la1 - la2) ** 2 + (lo1 - lo2) ** 2;
}

/**
 * Greedy nearest-neighbor traversal.
 * Returns an array of indices (into `features`) ordered so that each step
 * moves to the closest unvisited feature from the current position.
 * Starting point: the feature closest to the geographic center of the set.
 */
function computeSpatialOrder(features) {
  const n = features.length;
  if (!n) return [];

  // Find centroid
  let sumLat = 0, sumLon = 0;
  features.forEach(f => { const [lo, la] = f.geometry.coordinates; sumLat += la; sumLon += lo; });
  const cLat = sumLat / n, cLon = sumLon / n;
  const centroidFeature = { geometry: { coordinates: [cLon, cLat] } };

  // Start from the feature nearest the centroid
  let startIdx = 0, startDist = Infinity;
  features.forEach((f, i) => {
    const d = dist2(f, centroidFeature);
    if (d < startDist) { startDist = d; startIdx = i; }
  });

  const visited = new Uint8Array(n);
  const order   = [startIdx];
  visited[startIdx] = 1;

  for (let step = 1; step < n; step++) {
    const cur = features[order[order.length - 1]];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = dist2(cur, features[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) break;
    order.push(best);
    visited[best] = 1;
  }
  return order; // array of indices into `features`
}

function markerColor(decision) {
  if (decision === "keep")   return "#22c55e";
  if (decision === "remove") return "#ef4444";
  return "#f59e0b";
}

function makeIcon(decision, isSelected) {
  const fill    = markerColor(decision);
  const ring    = isSelected
    ? `<circle cx="10" cy="10" r="9" fill="none" stroke="white" stroke-width="2" opacity="0.95"/>`
    : "";
  const opacity = decision === "remove" ? 0.5 : 1;
  return L.divIcon({
    className: "",
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" style="opacity:${opacity}">
             <circle cx="10" cy="10" r="6" fill="${fill}" stroke="white" stroke-width="1.5"/>
             ${ring}
           </svg>`,
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function WreckReviewAdmin() {
  const [authChecked,   setAuthChecked]   = useState(false);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [adminEmail,    setAdminEmail]    = useState(null);
  const [adminUserId,   setAdminUserId]   = useState(null);

  // Raw data
  const [wrecks,        setWrecks]        = useState([]);
  const [reviews,       setReviews]       = useState({});  // wreck_key → record
  const [loadingWrecks, setLoadingWrecks] = useState(true);

  // UI
  const [filter,      setFilter]      = useState("all"); // all|pending|keep|remove
  const [selectedKey, setSelectedKey] = useState(null);  // wreck_key of selected feature
  const [spatialPos,  setSpatialPos]  = useState(0);     // position in spatialOrder
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [saveFlash,   setSaveFlash]   = useState(null);

  // Wreck photo moderation (wreck_photos table -- open to any signed-in
  // user to submit, admin-approved here before it appears on the map).
  const [wreckPhotosAll, setWreckPhotosAll] = useState([]); // all rows; admin sees pending+approved+rejected via RLS
  const [photosLoading,  setPhotosLoading]  = useState(false);
  const [photoActionId,  setPhotoActionId]  = useState(null); // row id currently being approved/rejected

  // Map
  const mapDivRef     = useRef(null);
  const mapRef        = useRef(null);
  const markersRef    = useRef({});
  const bathyLayerRef = useRef(null);
  const [mapReady,    setMapReady]    = useState(false);

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = (data?.user?.email ?? "").toLowerCase();
      setIsAdmin(ADMIN_EMAILS.includes(email));
      setAdminEmail(email || null);
      setAdminUserId(data?.user?.id ?? null);
      setAuthChecked(true);
    });
  }, []);

  // ── Load wrecks ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    fetch(WRECKS_URL)
      .then(r => r.json())
      .then(d => { setWrecks(d.features ?? []); setLoadingWrecks(false); })
      .catch(() => setLoadingWrecks(false));
  }, [isAdmin]);

  // ── Load reviews ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    base44.entities.WreckReview.list("-reviewed_date", 5000)
      .then(records => {
        const map = {};
        records.forEach(r => { map[r.wreck_key] = r; });
        setReviews(map);
      })
      .catch(e => console.error("[WreckAdmin] reviews load failed:", e));
  }, [isAdmin]);

  // ── Load + moderate wreck photos ────────────────────────────────────────
  const reloadWreckPhotos = useCallback(async () => {
    setPhotosLoading(true);
    const { data, error } = await supabase
      .from("wreck_photos")
      .select("id, wreck_key, user_id, image_url, status, submitted_at")
      .order("submitted_at", { ascending: true });
    if (!error) setWreckPhotosAll(data ?? []);
    else console.error("[WreckAdmin] wreck_photos load failed:", error.message);
    setPhotosLoading(false);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    reloadWreckPhotos();
  }, [isAdmin, reloadWreckPhotos]);

  function storagePathFromPublicUrl(url) {
    const marker = "/share-images/";
    const idx = (url || "").indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : null;
  }

  async function approveWreckPhoto(photo) {
    const approvedCount = wreckPhotosAll.filter(p => p.wreck_key === photo.wreck_key && p.status === "approved").length;
    if (approvedCount >= 3) { alert("This wreck already has 3 approved photos -- remove one first."); return; }
    setPhotoActionId(photo.id);
    const { error } = await supabase.from("wreck_photos")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: adminEmail })
      .eq("id", photo.id);
    if (error) alert("Approve failed: " + error.message);
    await reloadWreckPhotos();
    setPhotoActionId(null);
  }

  // Used both to reject a pending submission and to remove a previously
  // approved photo (e.g. to make room under the 3-photo cap) -- same
  // action either way: delete the row and its storage object.
  async function deleteWreckPhoto(photo) {
    setPhotoActionId(photo.id);
    const path = storagePathFromPublicUrl(photo.image_url);
    if (path) await supabase.storage.from("share-images").remove([path]);
    const { error } = await supabase.from("wreck_photos").delete().eq("id", photo.id);
    if (error) alert("Delete failed: " + error.message);
    await reloadWreckPhotos();
    setPhotoActionId(null);
  }

  // Admin adding a photo directly, e.g. an official/curated shot rather
  // than moderating a user submission. The wp_insert RLS policy forces
  // status='pending' on every direct insert (no privileged-insert path,
  // even for admin), so this inserts then immediately calls
  // approveWreckPhoto -- two DB calls, but reads as one action in the UI.
  async function addWreckPhotoAsAdmin(wreckKeyStr, file) {
    if (!file || !adminUserId) return;
    setPhotoActionId("admin-upload");
    const path = `wrecks/${wreckKeyStr}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("share-images")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { alert("Upload failed: " + upErr.message); setPhotoActionId(null); return; }
    const { data: pub } = supabase.storage.from("share-images").getPublicUrl(path);
    const { data: inserted, error: insErr } = await supabase.from("wreck_photos")
      .insert({ wreck_key: wreckKeyStr, user_id: adminUserId, image_url: pub?.publicUrl, status: "pending" })
      .select()
      .single();
    if (insErr || !inserted) { alert("Submit failed: " + (insErr?.message ?? "unknown error")); setPhotoActionId(null); return; }
    await approveWreckPhoto(inserted);
  }

  const pendingPhotoCount = wreckPhotosAll.filter(p => p.status === "pending").length;

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => wrecks.filter(f => {
    if (filter === "all") return true;
    if (filter === "photos") {
      const key = wreckKey(f);
      return wreckPhotosAll.some(ph => ph.wreck_key === key && ph.status === "pending");
    }
    return (reviews[wreckKey(f)]?.decision ?? "pending") === filter;
  }), [wrecks, reviews, filter, wreckPhotosAll]);

  // ── Spatial order (nearest-neighbor) — recomputed when filtered set changes
  const spatialOrder = useMemo(() => computeSpatialOrder(filtered), [filtered]);

  // The spatially-ordered list for the sidebar
  const orderedList = useMemo(() => spatialOrder.map(i => filtered[i]), [spatialOrder, filtered]);

  // ── Resolve selected feature ──────────────────────────────────────────────
  const selected = useMemo(() => {
    if (selectedKey) {
      return orderedList.find(f => wreckKey(f) === selectedKey) ?? null;
    }
    return orderedList[spatialPos] ?? null;
  }, [selectedKey, orderedList, spatialPos]);

  const selectedReview = selected ? (reviews[wreckKey(selected)] ?? null) : null;

  // Resolve spatialPos from selectedKey whenever orderedList changes
  useEffect(() => {
    if (!selectedKey || !orderedList.length) return;
    const idx = orderedList.findIndex(f => wreckKey(f) === selectedKey);
    if (idx >= 0) setSpatialPos(idx);
  }, [orderedList, selectedKey]);

  // Sync notes
  useEffect(() => { setNotes(selectedReview?.notes ?? ""); }, [selected?.geometry?.coordinates?.join()]); // eslint-disable-line

  // ── Navigation helpers ────────────────────────────────────────────────────
  function selectAtPos(pos) {
    const clamped = Math.max(0, Math.min(orderedList.length - 1, pos));
    setSpatialPos(clamped);
    const f = orderedList[clamped];
    if (f) setSelectedKey(wreckKey(f));
  }
  function goNext() { selectAtPos(spatialPos + 1); }
  function goPrev() { selectAtPos(spatialPos - 1); }

  // ── Init Leaflet ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin || !mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, { center: MAP_CENTER, zoom: MAP_ZOOM });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap © CARTO",
      subdomains: "abcd",
      maxZoom: 14,
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; };
  }, [isAdmin]);

  // ── Bathymetric contours ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (bathyLayerRef.current) { map.removeLayer(bathyLayerRef.current); bathyLayerRef.current = null; }
    fetch(BATHY_CONTOURS_URL)
      .then(r => r.json())
      .then(geojson => {
        const layer = L.geoJSON(geojson, {
          style: f => {
            const d = f.properties?.depth_ft ?? 0;
            if (d >= 1200) return { color: "rgba(100,140,200,0.55)", weight: 1.1 };
            if (d >= 600)  return { color: "rgba(80,120,180,0.45)",  weight: 0.9 };
            if (d >= 300)  return { color: "rgba(60,100,160,0.38)",  weight: 0.8 };
            if (d >= 100)  return { color: "rgba(40,80,140,0.30)",   weight: 0.7 };
            return               { color: "rgba(30,60,120,0.22)",    weight: 0.5 };
          },
          onEachFeature: (f, lyr) => {
            const d = f.properties?.depth_ft;
            if (d) lyr.bindTooltip(`${Math.round(d)} ft`, { sticky: true });
          },
        });
        layer.addTo(map);
        bathyLayerRef.current = layer;
      })
      .catch(e => console.warn("[WreckAdmin] bathy failed:", e));
  }, [mapReady]);

  // ── Render all markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !wrecks.length) return;
    const map = mapRef.current;
    const selKey = selected ? wreckKey(selected) : null;

    // Remove stale markers
    Object.entries(markersRef.current).forEach(([k, m]) => {
      if (m) map.removeLayer(m);
    });
    markersRef.current = {};

    wrecks.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      const key      = wreckKey(f);
      const decision = reviews[key]?.decision ?? "pending";
      const isSel    = key === selKey;
      const p        = f.properties ?? {};

      const marker = L.marker([lat, lon], {
        icon:        makeIcon(decision, isSel),
        zIndexOffset: isSel ? 1000 : 0,
        title:       p.name || "Unknown",
      });

      marker.on("click", () => {
        // Find this wreck in orderedList and jump to it
        const pos = orderedList.findIndex(of => wreckKey(of) === key);
        if (pos >= 0) {
          setSpatialPos(pos);
          setSelectedKey(key);
        } else {
          // Not in current filter — switch to all
          setFilter("all");
          setSelectedKey(key);
        }
      });

      const depthStr = p.depth_ft != null ? `${Math.round(p.depth_ft)} ft` : "";
      marker.bindTooltip(
        `<div style="font-size:11px;font-weight:600">${p.name || "Unknown"}</div>` +
        `<div style="font-size:10px;color:#94a3b8">${[depthStr, p.symbol].filter(Boolean).join(" · ")}</div>`,
        { direction: "top", offset: [0, -8] }
      );

      marker.addTo(map);
      markersRef.current[key] = marker;
    });
  }, [mapReady, wrecks, reviews, selected, orderedList]); // eslint-disable-line

  // ── Pan to selected wreck ─────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !selected) return;
    const [lon, lat] = selected.geometry.coordinates;
    mapRef.current.panTo([lat, lon], { animate: true, duration: 0.35 });
  }, [mapReady, selectedKey]); // eslint-disable-line

  // ── Save decision ─────────────────────────────────────────────────────────
  const saveDecision = useCallback(async (decision) => {
    if (!selected || saving) return;
    setSaving(true);
    const [lon, lat] = selected.geometry.coordinates;
    const p   = selected.properties ?? {};
    const key = wreckKey(selected);

    const payload = {
      wreck_key: key, lat, lon,
      name: p.name ?? "", symbol: p.symbol ?? "", region: p.region ?? "",
      depth_ft: p.depth_ft ?? null, year_sunk: p.year_sunk ?? null,
      notes, decision,
      reviewed_date: new Date().toISOString(),
    };

    try {
      const existing = reviews[key];
      const record = existing?.id
        ? await base44.entities.WreckReview.update(existing.id, payload)
        : await base44.entities.WreckReview.create(payload);

      setReviews(r => ({ ...r, [key]: record }));
      setSaveFlash(decision);
      setTimeout(() => setSaveFlash(null), 500);
      goNext(); // advance to next nearest
    } catch (e) {
      console.error("[WreckAdmin] save failed:", e);
      alert("Save failed: " + e.message);
    }
    setSaving(false);
  }, [selected, saving, notes, reviews, goNext]); // eslint-disable-line

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "ArrowDown"  || e.key === "ArrowRight") goNext();
      if (e.key === "ArrowUp"    || e.key === "ArrowLeft")  goPrev();
      if (e.key === "k" || e.key === "K") saveDecision("keep");
      if (e.key === "x" || e.key === "X") saveDecision("remove");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, saveDecision]); // eslint-disable-line

  // ── Exports ───────────────────────────────────────────────────────────────
  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportRemovedJSON() {
    const removed = Object.values(reviews)
      .filter(r => r.decision === "remove")
      .map(({ wreck_key, name, lat, lon, symbol, region, depth_ft, year_sunk, notes }) =>
        ({ wreck_key, name, lat, lon, symbol, region, depth_ft, year_sunk, notes }));
    download(JSON.stringify(removed, null, 2), "wrecks_removed.json", "application/json");
  }
  function exportAllCSV() {
    const rows = [
      "wreck_key,name,lat,lon,symbol,region,depth_ft,year_sunk,decision,notes",
      ...Object.values(reviews).map(r =>
        [r.wreck_key, r.name, r.lat, r.lon, r.symbol, r.region,
         r.depth_ft ?? "", r.year_sunk ?? "", r.decision,
         (r.notes ?? "").replace(/,/g, ";")].join(",")
      ),
    ].join("\n");
    download(rows, "wreck_review.csv", "text/csv");
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const nKeep   = Object.values(reviews).filter(r => r.decision === "keep").length;
  const nRemove = Object.values(reviews).filter(r => r.decision === "remove").length;
  const nPending = wrecks.length - nKeep - nRemove;

  // ── Guard renders ─────────────────────────────────────────────────────────
  if (!authChecked) return (
    <div className="h-screen flex items-center justify-center bg-slate-950">
      <div className="text-slate-400 text-sm animate-pulse">Checking access…</div>
    </div>
  );
  if (!isAdmin) return (
    <div className="h-screen flex items-center justify-center bg-slate-950">
      <div className="text-center space-y-2">
        <div className="text-red-500 text-xl font-bold">⛔ Access Denied</div>
        <div className="text-slate-400 text-sm">Admin access required.</div>
      </div>
    </div>
  );

  const selKey = selected ? wreckKey(selected) : null;

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white overflow-hidden select-none">

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold text-sm">⚓ Wreck Review</span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-400 text-xs">
            {wrecks.length} total &nbsp;·&nbsp;
            <span className="text-amber-400">{nPending} pending</span>&nbsp;·&nbsp;
            <span className="text-green-400">{nKeep} kept</span>&nbsp;·&nbsp;
            <span className="text-red-400">{nRemove} flagged</span>
            {pendingPhotoCount > 0 && (
              <>&nbsp;·&nbsp;<span className="text-cyan-400">{pendingPhotoCount} photo{pendingPhotoCount === 1 ? "" : "s"} pending</span></>
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] text-slate-500 mr-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>Pending</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>Keep</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>Remove</span>
          </div>
          <button onClick={exportRemovedJSON}
            className="text-xs px-2.5 py-1 bg-red-950 hover:bg-red-900 text-red-300 rounded border border-red-800 transition-colors">
            ↓ Removed JSON
          </button>
          <button onClick={exportAllCSV}
            className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">
            ↓ All CSV
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: ordered list (spatial order) */}
        <div className="flex-shrink-0 w-60 flex flex-col border-r border-slate-800 bg-slate-900">
          {/* Filter tabs */}
          <div className="flex border-b border-slate-800 flex-shrink-0">
            {[["all","All"],["pending","Pending"],["keep","Kept"],["remove","Flagged"],["photos",`Photos${pendingPhotoCount ? ` (${pendingPhotoCount})` : ""}`]].map(([v, label]) => (
              <button key={v}
                onClick={() => { setFilter(v); setSpatialPos(0); setSelectedKey(null); }}
                className={`flex-1 text-[10px] font-semibold py-1.5 border-b-2 transition-colors ${
                  filter === v ? "border-amber-400 text-amber-400" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* List in spatial (nearest-neighbor) order */}
          <div className="flex-1 overflow-y-auto">
            {loadingWrecks && <div className="text-slate-600 text-xs p-4 text-center animate-pulse">Loading…</div>}
            {!loadingWrecks && orderedList.length === 0 && (
              <div className="text-slate-600 text-xs p-4 text-center">No wrecks match this filter</div>
            )}
            {orderedList.map((f, i) => {
              const key      = wreckKey(f);
              const decision = reviews[key]?.decision ?? "pending";
              const [lon, lat] = f.geometry.coordinates;
              const name     = f.properties?.name || "Unknown";
              const depth    = f.properties?.depth_ft;
              const dotColor = decision === "keep" ? "bg-green-500" : decision === "remove" ? "bg-red-500" : "bg-amber-400";
              const isCur    = key === selKey;

              return (
                <div key={key}
                  onClick={() => { setSpatialPos(i); setSelectedKey(key); }}
                  className={`px-3 py-2 cursor-pointer border-b border-slate-800/50 transition-colors ${
                    isCur ? "bg-slate-700/80" : "hover:bg-slate-800/60"
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`}/>
                    <span className="text-xs font-medium text-white truncate">{name}</span>
                    {isCur && <span className="ml-auto text-[9px] text-amber-400 flex-shrink-0">▶</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 ml-4">
                    {lat.toFixed(3)}°N {Math.abs(lon).toFixed(3)}°W
                    {depth != null && <span className="ml-1">· {Math.round(depth)} ft</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress */}
          <div className="flex-shrink-0 border-t border-slate-800 px-3 py-2">
            <div className="flex justify-between text-[10px] text-slate-600 mb-1">
              <span>Reviewed</span>
              <span>{nKeep + nRemove} / {wrecks.length}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: wrecks.length ? `${((nKeep + nRemove) / wrecks.length) * 100}%` : "0%" }}/>
            </div>
          </div>
        </div>

        {/* Center: Leaflet map */}
        <div className="flex-1 relative">
          <div ref={mapDivRef} className="absolute inset-0"/>
          {saveFlash && (
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none z-[1000] ${
              saveFlash === "keep" ? "bg-green-900/25" : "bg-red-900/25"
            }`}>
              <div className={`text-5xl font-black drop-shadow-lg ${
                saveFlash === "keep" ? "text-green-400" : "text-red-400"
              }`}>
                {saveFlash === "keep" ? "✓" : "✗"}
              </div>
            </div>
          )}
        </div>

        {/* Right: detail + actions */}
        <div className="flex-shrink-0 flex flex-col border-l border-slate-800 bg-slate-900 overflow-y-auto"
          style={{ width: 272 }}>
          {selected ? (() => {
            const [lon, lat] = selected.geometry.coordinates;
            const p        = selected.properties ?? {};
            const decision = selectedReview?.decision ?? "pending";

            return (
              <div className="p-4 space-y-4">
                <div>
                  <div className="text-white font-bold text-sm leading-snug">
                    {p.name || <span className="text-slate-500 italic">Unknown</span>}
                  </div>
                  <div className="text-slate-600 text-[10px] mt-0.5">
                    #{spatialPos + 1} of {orderedList.length} &nbsp;·&nbsp; nearest-neighbor order
                  </div>
                </div>

                <div className="space-y-1.5 text-xs bg-slate-800/50 rounded-lg p-3">
                  {[
                    ["Lat / Lon",  `${lat.toFixed(4)}°N  ${Math.abs(lon).toFixed(4)}°W`],
                    ["Type",       p.symbol   || "—"],
                    ["Depth",      p.depth_ft != null ? `${Math.round(p.depth_ft)} ft / ${Math.round(p.depth_ft / 6)} fth` : "—"],
                    ["Region",     p.region   || "—"],
                    ["Year Sunk",  p.year_sunk || "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-slate-500 flex-shrink-0">{label}</span>
                      <span className="text-slate-200 font-medium text-right truncate">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Wreck photos -- submitted by users, moderated here.
                    Admin can also add one directly (Add Photo below). */}
                {(() => {
                  const photos = wreckPhotosAll.filter(ph => ph.wreck_key === selKey);
                  const approved = photos.filter(ph => ph.status === "approved");
                  const pending  = photos.filter(ph => ph.status === "pending");
                  const atCap = approved.length >= 3;
                  return (
                    <div className="space-y-2">
                      {approved.length > 0 && (
                        <div>
                          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide mb-1">
                            Approved photos ({approved.length}/3)
                          </div>
                          <div className="flex gap-1.5 flex-wrap">
                            {approved.map(ph => (
                              <div key={ph.id} className="relative">
                                <img src={ph.image_url} alt="" className="w-14 h-14 object-cover rounded border border-slate-700"/>
                                <button
                                  onClick={() => deleteWreckPhoto(ph)}
                                  disabled={photoActionId === ph.id}
                                  title="Remove this photo"
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-[10px] leading-4 disabled:opacity-40"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pending.length > 0 && (
                        <div>
                          <div className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wide mb-1">
                            Pending review ({pending.length})
                          </div>
                          <div className="space-y-1.5">
                            {pending.map(ph => (
                              <div key={ph.id} className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1.5">
                                <img src={ph.image_url} alt="" className="w-12 h-12 object-cover rounded border border-slate-700 flex-shrink-0"/>
                                <div className="flex flex-col gap-1 flex-1">
                                  <button
                                    onClick={() => approveWreckPhoto(ph)}
                                    disabled={photoActionId === ph.id}
                                    className="text-[10px] font-semibold py-1 rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-40"
                                  >Approve</button>
                                  <button
                                    onClick={() => deleteWreckPhoto(ph)}
                                    disabled={photoActionId === ph.id}
                                    className="text-[10px] font-semibold py-1 rounded bg-red-800 hover:bg-red-700 text-white disabled:opacity-40"
                                  >Reject</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        {atCap ? (
                          <div className="text-slate-500 text-[10px] italic">3 photos already added</div>
                        ) : (
                          <label className="block text-center py-1.5 rounded-lg bg-cyan-800 hover:bg-cyan-700 text-white font-semibold text-[10px] cursor-pointer transition-colors">
                            {photoActionId === "admin-upload" ? "Uploading…" : "+ Add Photo"}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              disabled={photoActionId === "admin-upload"}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) addWreckPhotoAsAdmin(selKey, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className={`text-center text-xs font-bold py-1.5 rounded-lg border ${
                  decision === "keep"   ? "bg-green-950 border-green-800 text-green-400" :
                  decision === "remove" ? "bg-red-950 border-red-800 text-red-400" :
                                         "bg-slate-800 border-slate-700 text-amber-500"
                }`}>
                  {decision === "keep" ? "✓ KEPT" : decision === "remove" ? "✗ FLAGGED FOR REMOVAL" : "· PENDING REVIEW"}
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide block mb-1">Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Optional — duplicate, out of region, etc."
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-slate-500 select-text"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => saveDecision("keep")} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm bg-green-700 hover:bg-green-600 text-white transition-colors disabled:opacity-50">
                    ✓ Keep <kbd className="text-[9px] bg-green-900 px-1.5 py-0.5 rounded font-mono">K</kbd>
                  </button>
                  <button onClick={() => saveDecision("remove")} disabled={saving}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-bold text-sm bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                    ✗ Remove <kbd className="text-[9px] bg-red-900 px-1.5 py-0.5 rounded font-mono">X</kbd>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button onClick={goPrev} disabled={spatialPos === 0}
                    className="flex-1 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg disabled:opacity-30 transition-colors">
                    ← Nearest prev
                  </button>
                  <button onClick={goNext} disabled={spatialPos >= orderedList.length - 1}
                    className="flex-1 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg disabled:opacity-30 transition-colors">
                    Nearest next →
                  </button>
                </div>

                <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`}
                  target="_blank" rel="noreferrer"
                  className="block text-center text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                  Open in OpenStreetMap ↗
                </a>
              </div>
            );
          })() : (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm p-4 text-center">
              Select a wreck to review
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 bg-slate-900 border-t border-slate-800 py-1 text-center text-[10px] text-slate-700">
        K = keep &nbsp;·&nbsp; X = remove &nbsp;·&nbsp; ↑ / ↓ = nearest prev / next &nbsp;·&nbsp; Click any map marker to jump to it &nbsp;·&nbsp; Saves immediately
      </div>
    </div>
  );
}
