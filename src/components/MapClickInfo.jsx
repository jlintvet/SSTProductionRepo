// src/components/MapClickInfo.jsx
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, Bookmark } from "lucide-react";

export default function MapClickInfo({ info, onClose, onSaved, date, userId }) {
  const [label, setLabel] = useState(info?.prefillLabel || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    setLabel(info?.prefillLabel || "");
    setNotes("");
    setSaved(false);
  }, [info?.lat, info?.lon]);

  if (!info) return null;

  function bearingLabel(deg) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const finalLabel = label.trim() || `Location ${info.lat.toFixed(3)}, ${info.lon.toFixed(3)}`;

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

  // ── Popup positioning (unchanged logic) ──────────────────────────────────
  const POPUP_W = 220;
  const POPUP_H = 240;   // taller to fit notes field
  const MARGIN  = 8;

  const container = typeof window !== "undefined"
    ? (document.querySelector(".mapboxgl-canvas")?.closest(".relative")
       ?? document.querySelector(".leaflet-container")?.closest(".relative"))
    : null;
  const containerW = container?.clientWidth  ?? 600;
  const containerH = container?.clientHeight ?? 500;

  let left = info.px + 14;
  let top  = info.py - 14;
  if (left + POPUP_W + MARGIN > containerW) left = info.px - POPUP_W - 10;
  if (top  + POPUP_H + MARGIN > containerH) top  = info.py - POPUP_H - 10;
  left = Math.max(MARGIN, Math.min(left, containerW - POPUP_W - MARGIN));
  top  = Math.max(MARGIN, Math.min(top,  containerH - POPUP_H - MARGIN));

  return (
    <div
      className="absolute z-[1100] bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs"
      style={{ left, top, cursor: "default", width: POPUP_W }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-500 font-mono">{info.lat.toFixed(4)}°N, {info.lon.toFixed(4)}°E</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-2 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
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
      </div>
    </div>
  );
}