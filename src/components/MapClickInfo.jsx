// src/components/MapClickInfo.jsx
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { X, Bookmark, Pencil, Check } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { formatCoordinate, formatLat, formatLon, parseLat, parseLon } from "@/lib/coordinates";

export default function MapClickInfo({ info, onClose, onSaved, date, userId, onPostCommunityReport, onCoordsEdited, regionBounds }) {
  const { userSettings } = useAppContext();
  const coordFormat = userSettings?.coordinate_format || "ddm";
  const [label, setLabel] = useState(info?.prefillLabel || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [editingCoords, setEditingCoords] = useState(false);
  const [latDraft, setLatDraft] = useState("");
  const [lonDraft, setLonDraft] = useState("");
  const [coordError, setCoordError] = useState(null);
  const popupRef = useRef(null);
  // Corrected {left, top} from a real post-render measurement of the popup
  // (see the useLayoutEffect below); null until the first measurement runs,
  // during which the POPUP_W/H *estimate* below is used for first paint.
  const [measuredPos, setMeasuredPos] = useState(null);

  // Keyed on clickId (assigned once per genuine new Inspect click), not
  // lat/lon -- editing the coordinates in place also changes info.lat/lon,
  // and keying this off lat/lon would wipe out the label/notes the user
  // just typed every time they corrected a coordinate.
  useEffect(() => {
    setLabel(info?.prefillLabel || "");
    setNotes("");
    setSaved(false);
    setEditingCoords(false);
    setCoordError(null);
  }, [info?.clickId]);

  // ── Popup positioning ──────────────────────────────────────────────────
  // Kept clear of the provisional pin (SSTHeatmapLeaflet renders a 30px
  // pin icon anchored by its tip at px/py, extending upward) by defaulting
  // to below-and-centered on the point instead of just a 14px offset,
  // which used to land the popup right on top of the pin -- most visible
  // on mobile where the popup is a much bigger fraction of the screen.
  const POPUP_W = 220;
  const POPUP_H = 240;   // rough estimate only, used for first-paint placement
  const MARGIN  = 8;
  const PIN_H   = 30;    // matches the pin icon's size in SSTHeatmapLeaflet
  const GAP     = 10;

  function resolvePopupContainer() {
    return typeof window !== "undefined"
      ? (document.querySelector(".mapboxgl-canvas")?.closest(".relative")
         ?? document.querySelector(".leaflet-container")?.closest(".relative"))
      : null;
  }
  const container  = resolvePopupContainer();
  const containerW = container?.clientWidth  ?? 600;
  const containerH = container?.clientHeight ?? 500;

  let estLeft = (info?.px ?? 0) - POPUP_W / 2;
  let estTop  = (info?.py ?? 0) + GAP;
  if (estTop + POPUP_H + MARGIN > containerH) estTop = (info?.py ?? 0) - PIN_H - GAP - POPUP_H;
  estLeft = Math.max(MARGIN, Math.min(estLeft, containerW - POPUP_W - MARGIN));
  estTop  = Math.max(MARGIN, Math.min(estTop,  containerH - POPUP_H - MARGIN));

  const left = measuredPos?.left ?? estLeft;
  const top  = measuredPos?.top  ?? estTop;

  // POPUP_H above is only ever a guess -- actual height varies with which
  // optional rows are present (SST/depth/SLA, distance/bearing, Post-Trip
  // Report button, the coordinate-edit error line) and previously nothing
  // corrected for a real height taller than the guess, letting the popup's
  // bottom edge extend past the visible screen. This re-measures the
  // *actual* rendered box after paint and snaps left/top to keep it fully
  // on-screen using the real dimensions instead. Placed before the early
  // "if (!info) return null" below (and guarded internally) so this hook
  // is always called in the same order every render, per the Rules of
  // Hooks -- calling it conditionally after an early return would break
  // React's hook bookkeeping.
  useLayoutEffect(() => {
    if (!info) return;
    const el = popupRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const c  = resolvePopupContainer();
    const cw = c?.clientWidth  ?? containerW;
    const ch = c?.clientHeight ?? containerH;

    let l = info.px - rect.width / 2;
    let t = info.py + GAP;
    if (t + rect.height + MARGIN > ch) t = info.py - PIN_H - GAP - rect.height;
    l = Math.max(MARGIN, Math.min(l, cw - rect.width - MARGIN));
    t = Math.max(MARGIN, Math.min(t, ch - rect.height - MARGIN));

    setMeasuredPos(prev => (prev && prev.left === l && prev.top === t) ? prev : { left: l, top: t });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.clickId, info?.px, info?.py, editingCoords, coordError]);

  // Hard backstop regardless of the measurement above -- the popup can
  // never visually extend past the container even in an edge case the
  // re-measure doesn't catch (e.g. a very short mobile viewport); it
  // scrolls internally instead of overflowing.
  const maxPopupHeight = Math.max(120, containerH - MARGIN * 2);

  if (!info) return null;

  function startEditCoords() {
    setLatDraft(formatLat(info.lat, coordFormat));
    setLonDraft(formatLon(info.lon, coordFormat));
    setCoordError(null);
    setEditingCoords(true);
  }

  function cancelEditCoords() {
    setEditingCoords(false);
    setCoordError(null);
  }

  function confirmEditCoords() {
    const lat = parseLat(latDraft);
    const lon = parseLon(lonDraft);
    if (lat == null || lon == null) {
      setCoordError("Couldn't read those coordinates - check the format.");
      return;
    }
    if (regionBounds && (lon < regionBounds.west || lon > regionBounds.east ||
        lat < regionBounds.south || lat > regionBounds.north)) {
      setCoordError("That point falls outside the current region.");
      return;
    }
    setCoordError(null);
    setEditingCoords(false);
    onCoordsEdited?.(lat, lon);
  }

  function handleCoordDraftKeyDown(e) {
    if (e.key === "Enter") confirmEditCoords();
    else if (e.key === "Escape") cancelEditCoords();
  }

  function bearingLabel(deg) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const finalLabel = label.trim() || `Location ${formatCoordinate(info.lat, info.lon, coordFormat)}`;

    const { data, error } = await supabase
      .from("saved_locations")
      .insert({
        user_id:          userId,
        label:            finalLabel,
        lat:              info.lat,
        lon:              info.lon,
        sst:              info.sst ?? null,
        depth_ft:         info.depth_ft ?? null,
        dist_nm:          info.dist ?? null,
        bearing_deg:      info.bearing != null ? Math.round(info.bearing) : null,
        bearing_cardinal: info.bearing != null ? bearingLabel(info.bearing) : null,
        from_location:    info.locationLabel ?? null,
        date,
        notes:            notes.trim() || null,
      })
      .select()
      .single();

    setSaving(false);
    if (error) { console.error("[MapClickInfo] save failed:", error.message); return; }
    setSaved(true);
    onSaved({ ...info, label: finalLabel, id: data.id, notes: data.notes });
    setTimeout(onClose, 800);
  }

  return (
    <div
      ref={popupRef}
      className="absolute z-[1100] bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs"
      style={{ left, top, cursor: "default", width: POPUP_W, maxHeight: maxPopupHeight, overflowY: "auto", overscrollBehavior: "contain" }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header -- close button is pinned to the corner independent of
          layout below, so it never fights the coordinate display/inputs
          for space. Read-only coordinates render centered on a single
          line (small enough font that even DMS fits); editing switches to
          two full-width stacked rows (Lat then Lon) so the full digit
          string is always visible instead of being squeezed into two
          side-by-side halves. */}
      <div className="relative mb-2 pr-5">
        <button onClick={onClose} className="absolute -top-0.5 right-0 text-slate-400 hover:text-slate-700 p-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
        {editingCoords ? (
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[9px] font-semibold text-slate-400 w-6 flex-shrink-0">LAT</span>
              <input
                type="text"
                value={latDraft}
                onChange={e => setLatDraft(e.target.value)}
                onKeyDown={handleCoordDraftKeyDown}
                placeholder="Lat"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-[12px] font-mono text-slate-800 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-semibold text-slate-400 w-6 flex-shrink-0">LON</span>
              <input
                type="text"
                value={lonDraft}
                onChange={e => setLonDraft(e.target.value)}
                onKeyDown={handleCoordDraftKeyDown}
                placeholder="Lon"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-[12px] font-mono text-slate-800 focus:outline-none focus:border-cyan-500"
              />
              <button onClick={confirmEditCoords} title="Update coordinates" className="text-emerald-600 hover:text-emerald-700 flex-shrink-0">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={cancelEditCoords} title="Cancel" className="text-slate-400 hover:text-slate-700 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            {coordError && <div className="text-red-500 text-[10px] mt-1">{coordError}</div>}
          </div>
        ) : (
          <button
            onClick={startEditCoords}
            title="Edit coordinates"
            className="w-full flex items-center justify-start gap-1 text-slate-500 font-mono text-[11px] whitespace-nowrap hover:text-cyan-600 transition-colors"
          >
            {formatCoordinate(info.lat, info.lon, coordFormat, "  ")}
            <Pencil className="w-2.5 h-2.5 text-slate-300 flex-shrink-0" />
          </button>
        )}
      </div>

      {/* Temp | Depth | SLA */}
      <div className="flex items-center gap-2 mb-1.5">
        {info.sst != null && <span className="text-cyan-600 font-semibold">{info.sst.toFixed(1)}°F</span>}
        {info.sst != null && info.depth_ft != null && <span className="text-slate-300">|</span>}
        {info.depth_ft != null && (
          <span className="text-blue-600 font-semibold">
            {Math.round(info.depth_ft)} ft{" "}
            <span className="text-blue-400 font-normal">({Math.round(info.depth_ft / 6)} ftm)</span>
          </span>
        )}
        {info.sla_m != null && (
          <span className="text-violet-600 font-semibold">SLA {info.sla_m >= 0 ? "+" : ""}{info.sla_m.toFixed(3)} m</span>
        )}
      </div>

      {/* Distance · Bearing */}
      {info.dist != null && (
        <div className="text-slate-500 mb-2">
          {info.dist.toFixed(1)} nm · {Math.round(info.bearing)}° {bearingLabel(info.bearing)}
        </div>
      )}

      {/* Label + Notes + Save */}
      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500"
        />
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500 resize-none"
        />
        <button
          onClick={handleSave}
          disabled={saving || saved || !userId}
          title={saved ? "Saved!" : "Save Location"}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white transition-colors shadow-sm font-semibold"
        >
          <Bookmark className="w-3.5 h-3.5" />
          {saved ? "Saved!" : saving ? "Saving…" : "Save Location"}
        </button>
        {onPostCommunityReport && (
          <button
            onClick={() => { onPostCommunityReport({ lat: info.lat, lon: info.lon, waterTemp: info.sst ?? null }); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm font-semibold"
          >
            Post-Trip Report
          </button>
        )}
      </div>
    </div>
  );
}