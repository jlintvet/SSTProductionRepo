// src/components/TripPlanner.jsx
// Phase 2: Route/Trip Planning panel (Pro feature)
// Shows a flight-plan table with heading, distance, cumulative nm, and ETA.
// Reads cruise_speed_kts from AppContext userSettings.
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function TripPlanner({ waypoints, setWaypoints, onClose, userId }) {
  const { userSettings } = useAppContext();
  const cruiseSpeedKts = Number(userSettings?.cruise_speed_kts) || 0;

  const [departureTime, setDepartureTime] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  });
  const [speedOverride, setSpeedOverride] = useState("");
  const [routeName, setRouteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const speed = Number(speedOverride) || cruiseSpeedKts;

  // ── Computed legs ────────────────────────────────────────────────────────────
  const legs = useMemo(() => {
    const result = [];
    let cumNm = 0;
    let cumHrs = 0;
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const prev = waypoints[i - 1];
      let distNm = 0, hdg = null;
      if (prev) {
        distNm = haversineNm(prev.lat, prev.lng, wp.lat, wp.lng);
        hdg = bearingDeg(prev.lat, prev.lng, wp.lat, wp.lng);
      }
      cumNm += distNm;
      cumHrs += speed > 0 ? distNm / speed : 0;
      const eta = speed > 0 ? addHours(departureTime, cumHrs) : null;
      result.push({ ...wp, distNm, hdg, cumNm, eta });
    }
    return result;
  }, [waypoints, departureTime, speed]);

  const totalNm = legs.length > 0 ? legs[legs.length - 1].cumNm : 0;
  const totalHrs = speed > 0 ? totalNm / speed : null;

  function removeWaypoint(id) {
    setWaypoints(prev => prev.filter(w => w.id !== id));
  }

  function updateLabel(id, label) {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, label } : w));
  }

  async function saveRoute() {
    if (!userId || waypoints.length < 2) return;
    setSaving(true);
    const { error } = await supabase.from("saved_routes").insert({
      user_id: userId,
      name: routeName || `Route ${new Date().toLocaleDateString()}`,
      waypoints: waypoints,
      cruise_speed_kts: speed || null,
    });
    setSaving(false);
    if (!error) {
      setSavedMsg("Saved!");
      setTimeout(() => setSavedMsg(""), 2500);
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[800] bg-white border-t border-slate-200 shadow-2xl"
      style={{ maxHeight: collapsed ? "48px" : "46vh" }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 select-none">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
          Trip Plan
        </span>
        {waypoints.length > 0 && (
          <span className="text-[11px] text-slate-400">
            {waypoints.length} waypoints · {totalNm.toFixed(1)} nm
            {totalHrs != null && ` · ${Math.floor(totalHrs)}h ${Math.round((totalHrs % 1) * 60)}m`}
          </span>
        )}
        <div className="flex-1" />
        {waypoints.length > 0 && (
          <button
            onClick={() => setWaypoints([])}
            className="text-[11px] text-slate-400 hover:text-red-500 transition-colors px-2 py-1"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-slate-400 hover:text-slate-700 p-1 transition-colors"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed
              ? <path d="M18 15l-6-6-6 6"/>
              : <path d="M6 9l6 6 6-6"/>}
          </svg>
        </button>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1 transition-colors"
          title="Exit trip planning"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col overflow-hidden" style={{ maxHeight: "calc(46vh - 48px)" }}>
          {/* ── Empty state ── */}
          {waypoints.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8 text-slate-400 text-sm text-center px-4">
              <div>
                <div className="text-2xl mb-2">🗺️</div>
                <div className="font-medium text-slate-500">Click anywhere on the map to add waypoints</div>
                <div className="text-xs mt-1">Right-click a waypoint marker to remove it</div>
              </div>
            </div>
          ) : (
            <>
              {/* ── Flight plan table ── */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wide text-[10px]">
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
                        <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={leg.label || ""}
                            placeholder={i === 0 ? "Departure" : `WP ${i + 1}`}
                            onChange={e => updateLabel(leg.id, e.target.value)}
                            className="w-full bg-transparent text-slate-700 placeholder-slate-300 focus:outline-none focus:bg-slate-100 rounded px-1 py-0.5 text-[11px] min-w-[80px]"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-500 font-mono hidden sm:table-cell">
                          {fmtCoord(leg.lat, true)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-500 font-mono hidden sm:table-cell">
                          {fmtCoord(leg.lng, false)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 font-mono">
                          {leg.hdg != null ? `${Math.round(leg.hdg)}°` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 font-mono">
                          {i === 0 ? "—" : `${leg.distNm.toFixed(1)}`}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-700 font-mono font-semibold">
                          {leg.cumNm.toFixed(1)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-cyan-700 font-mono">
                          {fmtTime(leg.eta)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={() => removeWaypoint(leg.id)}
                            className="text-slate-300 hover:text-red-400 transition-colors"
                            title="Remove waypoint"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Footer controls ── */}
              <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-slate-500 whitespace-nowrap">Depart</label>
                  <input
                    type="datetime-local"
                    value={departureTime}
                    onChange={e => setDepartureTime(e.target.value)}
                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-700"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-slate-500">Speed</label>
                  <input
                    type="number"
                    value={speedOverride}
                    placeholder={cruiseSpeedKts ? String(cruiseSpeedKts) : "kts"}
                    onChange={e => setSpeedOverride(e.target.value)}
                    className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-700"
                  />
                  <span className="text-[11px] text-slate-400">kts</span>
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                  <input
                    type="text"
                    value={routeName}
                    placeholder="Route name…"
                    onChange={e => setRouteName(e.target.value)}
                    className="flex-1 text-[11px] border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-400 text-slate-700"
                  />
                </div>
                <button
                  onClick={saveRoute}
                  disabled={saving || waypoints.length < 2}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  {saving ? "Saving…" : savedMsg || "Save Route"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
