// src/components/TripPlanner.jsx
// Phase 2: Route/Trip Planning panel (Pro feature)
// Rendered in-flow as a sibling below the map — no portal needed.

import React, { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAppContext } from "@/context/AppContext";
import ShareRouteDialogModal from "@/components/ShareRouteDialog";

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

// datetime-local inputs require a "YYYY-MM-DDTHH:mm" string in LOCAL time.
// Date.toISOString() returns UTC, so we compensate for the timezone offset.
function toLocalInputStr(date) {
  const off = date.getTimezoneOffset(); // minutes behind UTC (positive for west)
  const local = new Date(date.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
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

export default function TripPlanner({ waypoints, setWaypoints, onClose, userId, isPro, loadedRoute }) {
  const { userSettings } = useAppContext();
  const cruiseSpeedKts = Number(userSettings?.cruise_speed_kts) || 0;

  const [departureTime, setDepartureTime] = useState(() => {
    const dep = waypoints?.[0];
    if (dep) {
      const sunrise = calcSunrise(dep.lat, dep.lng, new Date());
      if (sunrise) {
        sunrise.setSeconds(0, 0);
        return toLocalInputStr(sunrise);
      }
    }
    const now = new Date();
    now.setSeconds(0, 0);
    return toLocalInputStr(now);
  });

  const [speedOverride, setSpeedOverride] = useState("");
  const [routeName,     setRouteName]     = useState(() => `Route ${new Date().toLocaleDateString()}`);
  const [saving,        setSaving]        = useState(false);
  const [savedMsg,      setSavedMsg]      = useState("");
  const [savedRouteData,setSavedRouteData]= useState(null);
  const [sharingRoute,  setSharingRoute]  = useState(null);
  const [collapsed,     setCollapsed]     = useState(false);

  // Saved routes dropdown
  const [showRoutes,    setShowRoutes]    = useState(false);
  const [savedRoutes,   setSavedRoutes]   = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const routeDropRef = useRef(null);

  const speed = Number(speedOverride) || cruiseSpeedKts;

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

  // Close dropdown on outside click
  useEffect(() => {
    if (!showRoutes) return;
    function handler(e) {
      if (routeDropRef.current && !routeDropRef.current.contains(e.target)) setShowRoutes(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRoutes]);

  // Sync state when a route is loaded externally (from SavedPanel)
  useEffect(() => {
    if (!loadedRoute) return;
    setRouteName(loadedRoute.name || "");
    if (loadedRoute.cruise_speed_kts) setSpeedOverride(String(loadedRoute.cruise_speed_kts));
    setSavedRouteData(loadedRoute);
  }, [loadedRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openRoutes() {
    setShowRoutes(v => {
      if (v) return false;
      return true;
    });
    if (savedRoutes.length === 0) {
      setLoadingRoutes(true);
      const { data, error } = await supabase
        .from("saved_routes")
        .select("id, name, waypoints, cruise_speed_kts, created_at, share_token")
        .order("created_at", { ascending: false })
        .limit(20);
      setLoadingRoutes(false);
      if (!error && data) setSavedRoutes(data);
      else console.error("[TripPlanner] load routes error:", error);
    }
  }

  function loadRoute(r) {
    const wps = (r.waypoints || []).map(w => ({
      ...w,
      id: w.id || crypto.randomUUID(),
    }));
    setWaypoints(wps);
    setRouteName(r.name || "");
    if (r.cruise_speed_kts) setSpeedOverride(String(r.cruise_speed_kts));
    setSavedRouteData(r);
    setShowRoutes(false);
  }

  async function deleteRoute(id, e) {
    e.stopPropagation();
    await supabase.from("saved_routes").delete().eq("id", id);
    setSavedRoutes(prev => prev.filter(r => r.id !== id));
  }

  function removeWaypoint(id) {
    setWaypoints(prev => prev.filter(w => w.id !== id));
  }
  function updateLabel(id, label) {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, label } : w));
  }

  async function saveRoute() {
    if (!userId || waypoints.length < 2) {
      console.warn("[TripPlanner] saveRoute — userId:", userId, "wps:", waypoints.length);
      return;
    }
    setSaving(true);
    const name = routeName.trim() || `Route ${new Date().toLocaleDateString()}`;
    const { data, error } = await supabase.from("saved_routes").insert({
      user_id:          userId,
      name,
      waypoints:        waypoints,
      cruise_speed_kts: speed || null,
    }).select().single();
    setSaving(false);
    if (error) {
      console.error("[TripPlanner] save error:", error);
      setSavedMsg("Save failed");
    } else {
      setSavedMsg("Saved ✓");
      if (data) { setSavedRoutes(prev => [data, ...prev]); setSavedRouteData(data); }
    }
    setTimeout(() => setSavedMsg(""), 3000);
  }

  return (
    <div className="flex-shrink-0 bg-white border-t border-slate-200 shadow-inner"
         style={{ height: collapsed ? "40px" : "220px", transition: "height 0.15s",
                  position: "relative", zIndex: 1100 }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 border-b border-slate-100 h-10"
           style={{ overflowX: "auto", overflowY: "visible", position: "relative", zIndex: 20,
                    scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>

        {/* Route name */}
        <input
          type="text"
          value={routeName}
          placeholder="Route name…"
          onChange={e => setRouteName(e.target.value)}
          className="text-[11px] font-semibold text-slate-700 placeholder-slate-400 bg-transparent focus:outline-none focus:bg-slate-100 rounded px-1.5 py-0.5 w-32 shrink-0"
        />

        <div className="w-px h-4 bg-slate-200 shrink-0"/>

        {/* Departure */}
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

        {/* My Routes dropdown */}
        <div className="relative shrink-0" ref={routeDropRef}>
          <button
            onClick={openRoutes}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 border border-slate-200 rounded px-2 py-1 transition-colors"
            title="My saved routes"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            My Routes
          </button>
          {showRoutes && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 text-xs max-h-56 overflow-y-auto">
              {loadingRoutes ? (
                <div className="px-3 py-4 text-center text-slate-400">Loading…</div>
              ) : savedRoutes.length === 0 ? (
                <div className="px-3 py-4 text-center text-slate-400">No saved routes yet</div>
              ) : savedRoutes.map(r => (
                <div
                  key={r.id}
                  onClick={() => loadRoute(r)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-700 truncate">{r.name || "Unnamed route"}</div>
                    <div className="text-[10px] text-slate-400">
                      {r.waypoints?.length || 0} wpts
                      {r.cruise_speed_kts ? ` · ${r.cruise_speed_kts} kts` : ""}
                      {" · "}{new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={e => deleteRoute(r.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-0.5"
                    title="Delete route"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

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

        {/* Share (Pro) — appears after saving a route */}
        {savedRouteData && isPro && (
          <button
            onClick={() => setSharingRoute(savedRouteData)}
            className="p-1 text-slate-400 hover:text-cyan-500 transition-colors shrink-0"
            title="Share saved route"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
        )}

        {/* Clear */}
        {waypoints.length > 0 && (
          <button
            onClick={() => { setWaypoints([]); setSavedRouteData(null); }}
            className="text-[10px] text-slate-400 hover:text-red-500 transition-colors px-1.5 py-1 shrink-0"
          >
            Clear
          </button>
        )}

        {/* Collapse */}
        <button onClick={() => setCollapsed(v => !v)} className="text-slate-400 hover:text-slate-700 p-1 transition-colors shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
          </svg>
        </button>

        {/* Close */}
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 transition-colors shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="overflow-auto" style={{ height: "180px", overflowX: "hidden" }}>
          {waypoints.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
              Click the map to add waypoints
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
      {sharingRoute && (
        <ShareRouteDialogModal
          route={sharingRoute}
          onClose={() => setSharingRoute(null)}
          onTokenSaved={(id, token) => setSharingRoute(prev => prev?.id === id ? { ...prev, share_token: token } : prev)}
        />
      )}
    </div>
  );
}
