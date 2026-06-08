// src/components/TripPlanner.jsx
// Phase 2: Route/Trip Planning panel (Pro feature)
// Rendered in-flow as a sibling below the map — no portal needed.
//
// Supabase DDL for saved_routes (run once):
//   create table if not exists public.saved_routes (
//     id uuid primary key default gen_random_uuid(),
//     user_id uuid references auth.users(id) on delete cascade,
//     name text,
//     waypoints jsonb not null,
//     cruise_speed_kts numeric,
//     created_at timestamptz default now()
//   );
//   alter table public.saved_routes enable row level security;
//   create policy "own routes" on public.saved_routes
//     using (auth.uid() = user_id) with check (auth.uid() = user_id);

import React, { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAppContext } from "@/context/AppContext";

// ── Geo math ──────────────────────────────────────────────────────────────────
function haversineNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function addHours(dateStr, hours) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  d.setTime(d.getTime() + hours * 3600000);
  return d;
}

function fmtTime(date) {
  if (!date) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtCoord(v, isLat) {
  const abs = Math.abs(v).toFixed(4);
  const dir = isLat ? (v >= 0 ? "N" : "S") : (v >= 0 ? "E" : "W");
  return `${abs}°${dir}`;
}

function calcSunrise(lat, lon, date) {
  const D2R = Math.PI / 180;
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.round((date - start) / 86400000);
  const B = (360 / 365) * (dayOfYear - 81) * D2R;
  const eqT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const decl = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * D2R) * D2R;
  const cosHA = (Math.cos(90.833 * D2R) - Math.sin(lat * D2R) * Math.sin(decl)) /
    (Math.cos(lat * D2R) * Math.cos(decl));
  if (cosHA > 1 || cosHA < -1) return null;
  const haMin = Math.acos(cosHA) * (180 / Math.PI) * 4;
  const sunriseMin = 720 - 4 * lon - haMin - eqT;
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMinutes(Math.round(sunriseMin));
  return d;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TripPlanner({ waypoints, setWaypoints, onClose, userId }) {
  const { userSettings } = useAppContext();
  const cruiseSpeedKts = Number(userSettings?.cruise_speed_kts) || 0;

  const [departureTime, setDepartureTime] = useState(() => {
    const dep = waypoints?.[0];
    if (dep) {
      const sunrise = calcSunrise(dep.lat, dep.lng, new Date());
      if (sunrise) {
        sunrise.setMinutes(sunrise.getMinutes() - 30);
        sunrise.setSeconds(0, 0);
        return sunrise.toISOString().slice(0, 16);
      }
    }
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16);
  });
  const [speedOverride, setSpeedOverride] = useState("");
  const [routeName, setRouteName]         = useState("");
  const [saving, setSaving]               = useState(false);
  const [savedMsg, setSavedMsg]           = useState("");
  const [collapsed, setCollapsed]         = useState(false);

  const speed = Number(speedOverride) || cruiseSpeedKts;

  // ── Computed legs ────────────────────────────────────────────────────────────
  const legs = useMemo(() => {
    const result = [];
    let cumNm = 0, cumHrs = 0;
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const prev = waypoints[i - 1];
      let distNm = 0, hdg = null;
      if (prev) {
        distNm = haversineNm(prev.lat, prev.lng, wp.lat, wp.lng);
        hdg    = bearingDeg(prev.lat, prev.lng, wp.lat, wp.lng);
      }
      cumNm  += distNm;
      cumHrs += speed > 0 ? distNm / speed : 0;
      const eta = speed > 0 ? addHours(departureTime, cumHrs) : null;
      result.push({ ...wp, distNm, hdg, cumNm, eta });
    }
    return result;
  }, [waypoints, departureTime, speed]);

  const totalNm  = legs.length > 0 ? legs[legs.length - 1].cumNm : 0;
  const totalHrs = speed > 0 && totalNm > 0 ? totalNm / speed : null;

  function removeWaypoint(id) {
    setWaypoints(prev => prev.filter(w => w.id !== id));
  }
  function updateLabel(id, label) {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, label } : w));
  }

  async function saveRoute() {
    if (!userId || waypoints.length < 2) {
      console.warn("[TripPlanner] saveRoute skipped — userId:", userId, "wps:", waypoints.length);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("saved_routes").insert({
      user_id:         userId,
      name:            routeName.trim() || `Route ${new Date().toLocaleDateString()}`,
      waypoints:       waypoints,
      cruise_speed_kts: speed || null,
    });
    setSaving(false);
    if (error) {
      console.error("[TripPlanner] save error:", error);
      setSavedMsg("Error saving");
    } else {
      setSavedMsg("Saved ✓");
    }
    setTimeout(() => setSavedMsg(""), 3000);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 bg-white border-t border-slate-200 shadow-inner"
         style={{ height: collapsed ? "40px" : "220px", overflow: "hidden", transition: "height 0.2s" }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 h-10 min-w-0">
        {/* Route name */}
        <input
          type="text"
          value={routeName}
          placeholder="Route name…"
          onChange={e => setRouteName(e.target.value)}
          className="text-[11px] font-semibold text-slate-700 placeholder-slate-400 bg-transparent focus:outline-none focus:bg-slate-100 rounded px-1.5 py-0.5 w-32 shrink-0"
        />
        <div className="w-px h-4 bg-slate-200 shrink-0"/>

        {/* Departure time */}
        <label className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">Depart</label>
        <input
          type="datetime-local"
          value={departureTime}
          onChange={e => setDepartureTime(e.target.value)}
          className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-700 shrink-0"
        />
        <div className="w-px h-4 bg-slate-200 shrink-0"/>

        {/* Speed */}
        <label className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">Speed</label>
        <input
          type="number"
          value={speedOverride}
          placeholder={cruiseSpeedKts ? String(cruiseSpeedKts) : "—"}
          onChange={e => setSpeedOverride(e.target.value)}
          className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 w-12 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-700 shrink-0"
        />
        <span className="text-[10px] text-slate-400 shrink-0">kts</span>
        <div className="w-px h-4 bg-slate-200 shrink-0"/>

        {/* Stats */}
        {waypoints.length > 0 && (
          <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
            {waypoints.length} wpts · {totalNm.toFixed(1)} nm
            {totalHrs != null && ` · ${Math.floor(totalHrs)}h ${Math.round((totalHrs % 1) * 60)}m`}
          </span>
        )}

        <div className="flex-1 min-w-0"/>

        {/* Save */}
        {waypoints.length >= 2 && (
          <button
            onClick={saveRoute}
            disabled={saving}
            className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-[10px] font-semibold rounded transition-colors whitespace-nowrap shrink-0"
          >
            {saving ? "Saving…" : savedMsg || "Save Route"}
          </button>
        )}

        {/* Clear */}
        {waypoints.length > 0 && (
          <button
            onClick={() => setWaypoints([])}
            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors px-1.5 py-1 shrink-0"
          >
            Clear
          </button>
        )}

        {/* Collapse */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-slate-400 hover:text-slate-700 p-1 transition-colors shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1 transition-colors shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="overflow-auto" style={{ height: "180px" }}>
          {waypoints.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs text-center px-4">
              Click anywhere on the map to add waypoints
            </div>
          ) : (
            <table className="w-full text-[11px] border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-slate-500 font-semibold uppercase tracking-wide text-[10px]">
                  <th className="px-3 py-1.5 text-left w-6">#</th>
                  <th className="px-2 py-1.5 text-left">Name</th>
                  <th className="px-2 py-1.5 text-right hidden sm:table-cell">Lat</th>
                  <th className="px-2 py-1.5 text-right hidden sm:table-cell">Lon</th>
                  <th className="px-2 py-1.5 text-right">HDG</th>
                  <th className="px-2 py-1.5 text-right">Dist</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="px-2 py-1.5 text-right">ETA</th>
                  <th className="px-2 py-1.5 w-5"/>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, i) => (
                  <tr key={leg.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1 text-slate-400 font-mono">{i + 1}</td>
                    <td className="px-2 py-1">
                      <input
                        type="text"
                        value={leg.label || ""}
                        placeholder={i === 0 ? "Departure" : `WP ${i + 1}`}
                        onChange={e => updateLabel(leg.id, e.target.value)}
                        className="w-full bg-transparent text-slate-700 placeholder-slate-300 focus:outline-none focus:bg-slate-100 rounded px-1 py-0.5 text-[11px] min-w-[80px]"
                      />
                    </td>
                    <td className="px-2 py-1 text-right text-slate-500 font-mono hidden sm:table-cell">{fmtCoord(leg.lat, true)}</td>
                    <td className="px-2 py-1 text-right text-slate-500 font-mono hidden sm:table-cell">{fmtCoord(leg.lng, false)}</td>
                    <td className="px-2 py-1 text-right text-slate-600 font-mono">{leg.hdg != null ? `${Math.round(leg.hdg)}°` : "—"}</td>
                    <td className="px-2 py-1 text-right text-slate-600 font-mono">{i === 0 ? "—" : `${leg.distNm.toFixed(1)}`}</td>
                    <td className="px-2 py-1 text-right text-slate-700 font-mono font-semibold">{leg.cumNm.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right text-cyan-700 font-mono">{fmtTime(leg.eta)}</td>
                    <td className="px-2 py-1 text-right">
                      <button onClick={() => removeWaypoint(leg.id)} className="text-slate-300 hover:text-red-400 transition-colors" title="Remove">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
