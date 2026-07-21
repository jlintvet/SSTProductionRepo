import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { Crosshair, Move, Wind, LifeBuoy, Trash2 } from "lucide-react";
import MapClickInfo from "@/components/MapClickInfo";
import MapControlPanel from "@/components/MapControlPanel";
import SavedLocations from "@/components/SavedLocations";
import ShareRouteDialogModal from "@/components/ShareRouteDialog";
import { SPECIES_LABELS } from "@/components/CommunityReportForm";

// loc.trip_date (a plain "YYYY-MM-DD", poster-chosen) vs. loc.created_at
// (posting timestamp) -- when they differ, the report was backdated (posted
// after the trip actually happened) and both the sidebar list and the pin
// popup show a small "Trip: <date>" badge so viewers can tell a backdated
// report from a genuinely fresh one instead of everything just reading
// "2h ago" regardless of how old the underlying catch actually is.
function localDateFromTimestamp(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtTripDate(tripDateStr) {
  const [y, m, d] = tripDateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function tripDateBadge(loc) {
  if (!loc.trip_date || loc.trip_date === localDateFromTimestamp(loc.created_at)) return null;
  return `Trip: ${fmtTripDate(loc.trip_date)}`;
}

// Whole calendar days between a "YYYY-MM-DD" trip_date and today (local).
// Positive = trip_date is in the past. Parsed as local (not UTC) components,
// same as fmtTripDate above, to avoid a timezone off-by-one.
function daysSinceTripDate(tripDateStr) {
  const [y, m, d] = tripDateStr.split("-").map(Number);
  const tripMs  = new Date(y, m - 1, d).getTime();
  const now     = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((todayMs - tripMs) / 86400000);
}

// Unified "time ago" label for community pins/reports. Previously this was
// always computed from created_at (posting time), which could read as
// contradictory next to the "Trip: <date>" badge -- e.g. "6d ago" alongside
// "Trip: Jul 19" when today is Jul 21 mixes two different clocks (posting
// time vs. trip time) into one number. When trip_date is set and isn't
// today, anchor the "ago" label to trip_date instead so the two numbers
// always agree. `style` picks the sub-day wording used at each call site.
function agoLabel(createdAt, tripDateStr, style) {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const hours  = Math.floor(diffMs / 3600000);
  const tripDays = tripDateStr ? daysSinceTripDate(tripDateStr) : null;
  if (tripDays != null && tripDays > 0) return `${tripDays}d ago`;
  if (style === "sidebar") {
    return hours < 1 ? `${Math.floor(diffMs / 60000)}m ago` : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
  }
  return hours < 1 ? "Just now" : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
import HelpReportModal from "@/components/HelpReportModal";

// ── SavedPanel: tabbed Locations + Routes panel ───────────────────────────────
function SavedPanel({
  savedLocations, fetchSavedLocations, clearMarkersRef, flyToRef,
  highlightedLocation, setHighlightedLocation, onShare, onTipCommunitySource, isPro, userId,
  onClose, sliderHeight, mobile, onMobileSelect, className, onLoadRoute, onRoutesCountChange,
  tripMode, onAddWaypoint, communityLocations,
  heatmapDataForShare, sstMinForShare, sstMaxForShare, sstRangeForShare,
}) {
  const [tab, setTab]             = React.useState("locations");
  const [sharingRoute, setSharingRoute] = React.useState(null);
  const [routes, setRoutes] = React.useState(null); // null = not loaded yet
  const [loadingRoutes, setLoadingRoutes] = React.useState(false);

  async function loadRoutes() {
    setLoadingRoutes(true);
    const { data, error } = await supabase
      .from("saved_routes")
      .select("id, name, waypoints, cruise_speed_kts, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setLoadingRoutes(false);
    if (!error) { setRoutes(data || []); onRoutesCountChange?.(data?.length ?? 0); }
    else console.error("[SavedPanel] load routes:", error);
  }

  React.useEffect(() => { loadRoutes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(t) { setTab(t); }

  async function clearAllLocations() {
    if (!window.confirm("Delete all saved locations?")) return;
    await supabase.from("saved_locations").delete().eq("user_id", userId);
    (savedLocations || []).forEach(l => clearMarkersRef.current?.(l.id));
    fetchSavedLocations?.();
  }

  async function clearAllRoutes() {
    if (!window.confirm("Delete all saved routes?")) return;
    await supabase.from("saved_routes").delete().eq("user_id", userId);
    setRoutes([]); onRoutesCountChange?.(0);
  }

  async function deleteRoute(id, e) {
    e.stopPropagation();
    await supabase.from("saved_routes").delete().eq("id", id);
    setRoutes(prev => {
      const next = (prev || []).filter(r => r.id !== id);
      onRoutesCountChange?.(next.length);
      return next;
    });
  }

  const posStyle = mobile
    ? { bottom: 0, zIndex: 2000, maxHeight: "38vh" }
    : { bottom: (sliderHeight || 0) + 48, width: 290, maxHeight: "55%", zIndex: 900 };

  const baseClass = mobile
    ? "fixed left-0 right-0 bg-white border-t border-slate-200 shadow-xl flex flex-col"
    : "absolute left-2 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col";

  return (
    <div className={`${baseClass} ${className || ""}`} style={posStyle}>
      {/* Header + tabs */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0 border-b border-slate-200 flex-shrink-0">
        <div className="flex gap-3">
          <button
            onClick={() => switchTab("locations")}
            className={`text-xs font-semibold pb-1.5 border-b-2 transition-colors ${tab === "locations" ? "border-orange-400 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Locations
          </button>
          <button
            onClick={() => switchTab("routes")}
            className={`text-xs font-semibold pb-1.5 border-b-2 transition-colors ${tab === "routes" ? "border-cyan-500 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Routes
          </button>
          <button
            onClick={() => switchTab("community")}
            className={`text-xs font-semibold pb-1.5 border-b-2 transition-colors ${tab === "community" ? "border-lime-500 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Community
          </button>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          {tab === "locations" && (savedLocations?.length ?? 0) > 0 && (
            <button onClick={clearAllLocations} className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">Clear all</button>
          )}
          {tab === "routes" && routes?.length > 0 && (
            <button onClick={clearAllRoutes} className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">Clear all</button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "locations" ? (
          <SavedLocations
            locations={savedLocations} onRefresh={fetchSavedLocations}
            onClearMarkers={id => clearMarkersRef.current?.(id)}
            onSelectLocation={(idx, loc) => {
              if (!loc) { setHighlightedLocation(null); return; }
              if (tripMode && onAddWaypoint) {
                onAddWaypoint(parseFloat(loc.lat), parseFloat(loc.lon), loc.label || loc.name || "");
                onClose();
                return;
              }
              flyToRef.current?.(loc.lat, loc.lon);
              setHighlightedLocation(loc);
              onMobileSelect?.();
            }}
            highlightedId={highlightedLocation?.id} onShare={onShare} onTipCommunitySource={onTipCommunitySource} isPro={isPro}
          />
        ) : tab === "community" ? (
          communityLocations?.length ? (
            <div className="flex flex-col gap-1.5">
              {[...communityLocations].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(loc => {
                const isLivePin = loc.type === "live";
                // Live styling/badge only for the first 48h; after that it
                // reads identically to a Post-Trip Report even though the
                // row's `type` stays "live" as a permanent record.
                const isLiveActive = isLivePin && (Date.now() - new Date(loc.created_at).getTime()) < 48 * 3600000;
                const timeAgo = agoLabel(loc.created_at, loc.trip_date, "sidebar");
                const speciesLabel = (loc.species||[]).map(s => SPECIES_LABELS[s] || s).join(", ");
                const tripBadge = tripDateBadge(loc);
                return (
                  <div
                    key={loc.id}
                    onClick={() => {
                      if (tripMode && onAddWaypoint) {
                        onAddWaypoint(parseFloat(loc.lat), parseFloat(loc.lon), loc.display_name || "Community Pin");
                        onClose?.();
                        return;
                      }
                      flyToRef.current?.(loc.lat, loc.lon);
                      onMobileSelect?.();
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs cursor-pointer hover:bg-slate-50 hover:border-slate-300"
                  >
                    <div className="flex items-center gap-2">
                      <div style={{width:10,height:10,borderRadius:"50%",background:isLiveActive?"#84cc16":"#00d4ff",flexShrink:0}} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{loc.display_name}</div>
                        <div className="text-[10px] text-slate-400">
                          {speciesLabel||"Unknown"} · {timeAgo}
                          {tripBadge && <span className="text-amber-600 font-semibold"> · {tripBadge}</span>}
                        </div>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isLiveActive?"bg-lime-100 text-lime-700":"bg-cyan-100 text-cyan-700"}`}>
                        {isLiveActive?"LIVE":"RPT"}
                      </span>
                      {onShare && isPro && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onShare({
                              id: loc.id,
                              label: loc.display_name,
                              lat: loc.lat,
                              lon: loc.lon,
                              notes: loc.notes ?? "",
                              source_type: "community",
                            });
                          }}
                          className="p-1 rounded-md hover:bg-sky-100 text-sky-400 hover:text-sky-600 transition-colors flex-shrink-0"
                          title="Share this location"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 py-6">No community pins visible.<br/>Enable the community layer on the map.</div>
          )
        ) : loadingRoutes ? (
          <div className="text-center text-xs text-slate-400 py-6">Loading…</div>
        ) : !routes?.length ? (
          <div className="text-center text-xs text-slate-400 py-6">No saved routes yet.<br/>Use Plan Trip to create one.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {routes.map(r => (
              <div
                key={r.id}
                onClick={() => { if (onLoadRoute) { onLoadRoute(r); onClose(); } }}
                className={`rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs group ${onLoadRoute ? "hover:bg-cyan-50 hover:border-cyan-200 cursor-pointer" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{r.name || "Unnamed route"}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {r.waypoints?.length || 0} waypoints
                      {r.cruise_speed_kts ? ` · ${r.cruise_speed_kts} kts` : ""}
                      {" · "}{new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                  {isPro && (
                    <button
                      onClick={e => { e.stopPropagation(); setSharingRoute(r); }}
                      className="p-1.5 rounded-md hover:bg-sky-100 text-sky-400 hover:text-sky-600 transition-colors flex-shrink-0"
                      title="Share route"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </button>
                  )}
                  <button
                    onClick={e => deleteRoute(r.id, e)}
                    className="p-1.5 rounded-md hover:bg-red-100 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Delete route"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    {sharingRoute && createPortal(
        <ShareRouteDialogModal
          route={sharingRoute}
          onClose={() => setSharingRoute(null)}
          onTokenSaved={(id, token) => {
            setRoutes(prev => (prev || []).map(r => r.id === id ? { ...r, share_token: token } : r));
            setSharingRoute(prev => prev?.id === id ? { ...prev, share_token: token } : prev);
          }}
          heatmapData={heatmapDataForShare}
          sstMin={sstMinForShare}
          sstMax={sstMaxForShare}
          sstRange={sstRangeForShare}
        />,
        document.body
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
import ShareLocationDialog from "@/components/ShareLocationDialog";
import SSTLegend from "@/components/SSTLegend";
import SSTRangeControl from "@/components/SSTRangeControl";
import TimeScrubber, { WindLegend } from "@/components/TimeScrubber";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAPBOX_TOKEN, createGlBasemap, gapFillGrid, solidify, blurOverlay, upsertSstImage, removeSstImage, installLandMaskRefresh } from "@/lib/glSandwich";

// ── Community pulse animation (injected once) ─────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("community-pulse-style")) {
  const s = document.createElement("style");
  s.id = "community-pulse-style";
  s.textContent = `@keyframes community-pulse{0%{transform:scale(1);opacity:0.8}70%{transform:scale(2.8);opacity:0}100%{transform:scale(2.8);opacity:0}}`;
  document.head.appendChild(s);
}

// ── TipFlow — amount input + Venmo/CashApp deep link ─────────────────────────
function TipFlow({ pin, userId, onClose }) {
  const [amount,     setAmount]     = React.useState(20);
  const [custom,     setCustom]     = React.useState("");
  const [useCustom,  setUseCustom]  = React.useState(false);
  const [recording,  setRecording]  = React.useState(false);
  const [tipError,   setTipError]   = React.useState(false);

  const finalAmount = useCustom ? (parseFloat(custom) || 0) : amount;

  async function recordAndOpen(platform) {
    if (finalAmount <= 0) return;
    setRecording(true);
    try {
      // record_community_tip resolves the real recipient_user_id server-side
      // from location_id and also increments tip_count/tip_total_cents on
      // community_locations -- both used to happen client-side, but the
      // client no longer holds pin.user_id (see community_locations_public),
      // and the counter update was silently RLS-blocked anyway since the
      // tipper isn't the row's owner.
      await supabase.rpc("record_community_tip", {
        p_location_id:  pin.id,
        p_amount_cents: Math.round(finalAmount * 100),
        p_platform:     platform,
      });
    } catch (_) {}

    const note = encodeURIComponent(`riploc report tip`);
    if (platform === "venmo") {
      const deepLink = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(pin.venmo_handle)}&amount=${finalAmount}&note=${note}`;
      const webLink  = `https://venmo.com/u/${encodeURIComponent(pin.venmo_handle.replace(/^@/, ""))}`;
      window.open(webLink, "_blank");   // open synchronously — not blocked
      window.location.href = deepLink; // try app; if it opens, user closes the extra tab
    } else {
      const handle   = pin.cashapp_handle.startsWith("$") ? pin.cashapp_handle : `$${pin.cashapp_handle}`;
      const deepLink = `cashapp://cash.app/${encodeURIComponent(handle)}`;
      const webLink  = `https://cash.app/${encodeURIComponent(handle)}`;
      window.open(webLink, "_blank");
      window.location.href = deepLink;
    }
    setRecording(false);
    onClose();
  }

  // Gate the payment deep link on the recipient actually having a handle. Seed pins
  // (and real users who never set one) have null handles -> show a graceful error and
  // open NO payment link / record NO tip. Admin-notify is a quiet client log to avoid
  // spam from the many handle-less pins; wire to a deduped server log later if desired.
  function attemptTip(platform) {
    if (finalAmount <= 0) return;
    const handle = platform === "venmo" ? pin.venmo_handle : pin.cashapp_handle;
    if (!handle) {
      setTipError(true);
      // Best-effort, non-blocking: log the attempt and (at most once per 24h,
      // see notify-tip-missing-handle) notify the poster + admin that this
      // report's payment handle is missing.
      supabase.functions.invoke("notify-tip-missing-handle", {
        body: {
          location_id:    pin.id,
          tipper_user_id: userId || null,
          platform,
          amount_cents:   Math.round(finalAmount * 100),
        },
      }).catch(() => {});
      return;
    }
    recordAndOpen(platform);
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-3">Choose an amount, then open your payment app:</p>
      <div className="flex gap-2 mb-3">
        {[20, 50, 100].map(v => (
          <button key={v} onClick={() => { setAmount(v); setUseCustom(false); }}
            className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${!useCustom && amount===v ? "bg-cyan-600 text-white border-cyan-600" : "border-slate-300 text-slate-600 hover:border-cyan-400"}`}>
            ${v}
          </button>
        ))}
        <button onClick={() => setUseCustom(true)}
          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${useCustom ? "bg-cyan-600 text-white border-cyan-600" : "border-slate-300 text-slate-600 hover:border-cyan-400"}`}>
          Other
        </button>
      </div>
      {useCustom && (
        <input type="number" min="1" max="500" value={custom} onChange={e => setCustom(e.target.value)}
          placeholder="Enter amount" className="w-full mb-3 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500" />
      )}
      {tipError ? (
        <div className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-center leading-snug">
          Sorry. The user that contributed this content has not setup their venmo / cashapp
          information in user settings. They've been notified. Thank you for attempting to
          make this tip. Please try again in the future. Hopefully they will resolve this shortly.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(pin.venmo_handle || (!pin.venmo_handle && !pin.cashapp_handle)) && (
            <button onClick={() => attemptTip("venmo")} disabled={recording || finalAmount <= 0}
              className="w-full py-2 rounded-xl bg-[#3D95CE] hover:bg-[#2d7ab8] text-white font-semibold text-sm transition-colors disabled:opacity-50">
              Open Venmo — ${finalAmount}
            </button>
          )}
          {(pin.cashapp_handle || (!pin.venmo_handle && !pin.cashapp_handle)) && (
            <button onClick={() => attemptTip("cashapp")} disabled={recording || finalAmount <= 0}
              className="w-full py-2 rounded-xl bg-[#00D64F] hover:bg-[#00b843] text-white font-semibold text-sm transition-colors disabled:opacity-50">
              Open Cash App — ${finalAmount}
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] text-slate-400 mt-2 text-center">Amount is pre-filled where supported. You confirm payment in the app.</p>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const VIIRS_CDN_BASE_LOCAL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/Bundled";
const VIIRS_COMPOSITE_URL_LOCAL = `${VIIRS_CDN_BASE_LOCAL}/viirs_composite.json`;

// ── Wind lookup from velocityJSON (used when hourly grid is absent) ───────────
function windFromVelocityJSON(velocityJSON, lat, lon) {
  if (!Array.isArray(velocityJSON) || velocityJSON.length < 2) return null;
  const uComp = velocityJSON[0], vComp = velocityJSON[1];
  if (!uComp?.data || !vComp?.data) return null;
  const h = uComp.header;
  if (!h) return null;
  const nx = h.nx, dx = h.dx, lo1 = h.lo1, la1 = h.la1, ny = h.ny, dy = h.dy;
  const col = Math.round((((lon - lo1) % 360 + 360) % 360) / dx);
  const row = Math.round((la1 - lat) / Math.abs(dy));
  if (col < 0 || col >= nx || row < 0 || row >= ny) return null;
  const idx = row * nx + col;
  const u = uComp.data[idx], v = vComp.data[idx];
  if (u == null || v == null) return null;
  return { speed: Math.sqrt(u * u + v * v), dir: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 };
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function interpColor(t, stops) {
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lower = stops[i]; upper = stops[i + 1]; break; }
  }
  const lt = (t - lower[0]) / (upper[0] - lower[0]);
  return [
    Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * lt),
    Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * lt),
    Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * lt),
  ];
}
const SST_STOPS = [[0,[15,40,140]],[0.2,[0,130,200]],[0.4,[0,200,180]],[0.6,[50,210,50]],[0.75,[255,220,0]],[0.9,[255,120,0]],[1,[220,30,30]]];
const CHL_STOPS = [[0,[10,40,130]],[0.25,[0,100,180]],[0.5,[0,170,100]],[0.75,[120,200,0]],[1,[200,160,0]]];
const KD_STOPS  = [[0,[10,60,160]],[0.3,[0,140,170]],[0.6,[0,160,80]],[0.85,[100,150,20]],[1,[150,100,0]]];
const CHL_GRADIENT = "linear-gradient(to right, rgb(10,40,130), rgb(0,100,180), rgb(0,170,100), rgb(120,200,0), rgb(200,160,0))";
const KD_GRADIENT  = "linear-gradient(to right, rgb(10,60,160), rgb(0,140,170), rgb(0,160,80), rgb(100,150,20), rgb(150,100,0))";

// ── MobileProGate — locks Pro features in the mobile bottom drawer ────────────
function MobileProGate({ isPro, children, label }) {
  const [open, setOpen] = useState(false);
  if (isPro) return <>{children}</>;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <div onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ position: "absolute", inset: 0, cursor: "pointer", zIndex: 5 }} />
      <span onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ position: "absolute", top: 4, right: 4, background: "#f59e0b", color: "#fff",
          borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 5px",
          cursor: "pointer", zIndex: 10, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
        PRO
      </span>
      {open && createPortal(
        <div onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16,
            boxShadow: "0 8px 32px rgba(0,0,0,0.22)", padding: "1.5rem 1.5rem 1.25rem",
            minWidth: 260, textAlign: "center", border: "1px solid #e2e8f0", margin: "0 1rem" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", marginBottom: 6 }}>Pro Feature</div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 16 }}>
              {label || "This feature is available on the Pro plan."}
            </div>
            <a href="/" style={{ display: "inline-block", background: "#0e7490", color: "#fff",
              borderRadius: 8, padding: "8px 20px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
              Upgrade to Pro — $49/yr in 2026
            </a>
            <button onClick={() => setOpen(false)} style={{ display: "block", margin: "10px auto 0",
              background: "none", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
              Dismiss
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function MobileGradientBar({ gradient, label, unit, lo, hi, hoverVal, logScale, onBarClick }) {
  const tickRef = React.useRef(null);
  const bubbleRef = React.useRef(null);
  const tPos = (v) => {
    if (v == null || !Number.isFinite(v)) return null;
    return logScale
      ? Math.max(0, Math.min(1, (Math.log10(Math.max(v,1e-9)) - Math.log10(Math.max(lo,1e-9))) / (Math.log10(Math.max(hi,1e-9)) - Math.log10(Math.max(lo,1e-9)))))
      : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  };
  const tFromBar = (t) => logScale
    ? Math.pow(10, Math.log10(Math.max(lo,1e-9)) + t * (Math.log10(Math.max(hi,1e-9)) - Math.log10(Math.max(lo,1e-9))))
    : lo + t * (hi - lo);
  const fmt = (v) => v < 1 ? v.toFixed(3) : v.toFixed(2);
  const show = (t, v) => {
    if (tickRef.current) { tickRef.current.style.left = `${t*100}%`; tickRef.current.style.display = "block"; }
    if (bubbleRef.current) { bubbleRef.current.style.left = `${t*100}%`; bubbleRef.current.textContent = fmt(v)+unit; bubbleRef.current.style.display = "block"; }
  };
  const hide = () => {
    if (tickRef.current) tickRef.current.style.display = "none";
    if (bubbleRef.current) bubbleRef.current.style.display = "none";
  };
  // show map-hover position
  React.useEffect(() => {
    const t = tPos(hoverVal);
    if (t != null) show(t, hoverVal); else hide();
  });
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm flex items-center gap-2 px-3 py-1.5" onClick={onBarClick} style={{cursor:"pointer"}}>
      <span className="text-[10px] font-semibold text-slate-500 shrink-0">{label}</span>
      <div className="relative flex-1 rounded" style={{ minWidth:60, overflow:"visible", cursor:"crosshair" }}
           onMouseMove={e => { const r=e.currentTarget.getBoundingClientRect(); const t=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); show(t, tFromBar(t)); }}
           onMouseLeave={() => { const t=tPos(hoverVal); if(t!=null) show(t,hoverVal); else hide(); }}>
        <div className="h-3 rounded w-full" style={{ background: gradient }}/>
        <div ref={tickRef} className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{display:"none", transform:"translateX(-50%)"}}/>
        <div ref={bubbleRef} className="absolute px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow whitespace-nowrap"
             style={{display:"none", bottom:"calc(100% + 4px)", transform:"translateX(-50%)", background:"#0e7490", zIndex:9999, pointerEvents:"none"}}/>
      </div>
      <span className="text-[10px] text-slate-400 shrink-0">{lo<1?lo.toFixed(2):lo.toFixed(1)}–{hi<1?hi.toFixed(2):hi.toFixed(1)}{unit}</span>
    </div>
  );
}
const WIND_SPEED_STOPS = [[0,[0,0,255]],[0.07,[0,85,255]],[0.14,[0,153,255]],[0.21,[0,204,255]],[0.28,[0,255,204]],[0.35,[0,255,136]],[0.43,[0,255,0]],[0.5,[136,255,0]],[0.57,[204,255,0]],[0.64,[255,255,0]],[0.71,[255,204,0]],[0.78,[255,153,0]],[0.85,[255,102,0]],[0.92,[255,51,0]],[1.0,[255,0,0]]];

export function sstColor(val, min, max, rangeMin, rangeMax) {
  if (val == null || !Number.isFinite(val)) return null;
  const rMin = rangeMin ?? min; const rMax = rangeMax ?? max;
  return interpColor(Math.max(0, Math.min(1, (val - rMin) / (rMax - rMin))), SST_STOPS);
}
function chlColor(val, min, max, rangeMin, rangeMax) {
  if (val == null || !Number.isFinite(val)) return null;
  const rMin = rangeMin ?? min; const rMax = rangeMax ?? max;
  const lMin = Math.log10(Math.max(rMin, 0.001)), lMax = Math.log10(Math.max(rMax, 0.01));
  return interpColor(Math.max(0, Math.min(1, (Math.log10(val) - lMin) / (lMax - lMin))), CHL_STOPS);
}
function kd490Color(val, min, max, rangeMin, rangeMax) {
  if (val == null || !Number.isFinite(val)) return null;
  const rMin = rangeMin ?? min; const rMax = rangeMax ?? max;
  return interpColor(Math.max(0, Math.min(1, (val - rMin) / (rMax - rMin))), KD_STOPS);
}
function windSpeedColor(val, min, max) {
  if (val == null || !Number.isFinite(val) || val < 0) return null;
  return interpColor(Math.max(0, Math.min(1, (val - min) / (max - min))), WIND_SPEED_STOPS);
}
// SLA colorscale: blue (negative) → white (zero) → red (positive)
const SLA_STOPS = [
  [0.0,  [  0,   0, 200]], // strong negative — deep blue
  [0.2,  [  0, 190, 255]], // moderate negative — cyan
  [0.4,  [  0, 210, 120]], // slight negative — cyan-green
  [0.5,  [ 40, 200,  40]], // zero anomaly — green
  [0.6,  [230, 230,   0]], // slight positive — yellow
  [0.8,  [255, 110,   0]], // moderate positive — orange
  [1.0,  [200,   0,   0]], // strong positive — deep red
];
function slaColor(val, valMin, valMax) {
  // val in meters; range is auto-scaled from data percentiles via valMin/valMax
  if (val == null || !Number.isFinite(val)) return null;
  const lo = valMin ?? -0.4, hi = valMax ?? 0.4;
  const t = hi > lo ? Math.max(0, Math.min(1, (val - lo) / (hi - lo))) : 0.5;
  return interpColor(t, SLA_STOPS);
}

export const FISH_SPECIES=[
  {key:"yellowfin",label:"Yellowfin",color:"#f59e0b"},
  {key:"mahi",label:"Mahi",color:"#10b981"},
  {key:"wahoo",label:"Wahoo",color:"#3b82f6"},
  {key:"blue_marlin",label:"Marlin",color:"#0ea5e9"},
  // Temporarily hidden in the UI per request — backend scoring is unchanged. Re-enable by uncommenting:
  // {key:"bluefin",label:"Bluefin",color:"#6366f1"},
  // {key:"kingfish",label:"Kingfish",color:"#ef4444"},
  // {key:"white_marlin",label:"W. Marlin",color:"#8b5cf6"},
];

function distanceNm(lat1,lon1,lat2,lon2){const R=3440.065,dLat=((lat2-lat1)*Math.PI)/180,dLon=((lon2-lon1)*Math.PI)/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function bearingDeg(lat1,lon1,lat2,lon2){const dLon=((lon2-lon1)*Math.PI)/180;const y=Math.sin(dLon)*Math.cos(lat2*Math.PI/180);const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon);return((Math.atan2(y,x)*180/Math.PI)+360)%360;}
export function bearingLabel(deg){return["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(deg/22.5)%16];}

const BUOYS_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/Buoys/buoys_latest.json";
function buoyAgeStr(iso){
  if(!iso) return "";
  const ts=Date.parse(iso); if(isNaN(ts)) return "";
  const mins=Math.round((Date.now()-ts)/60000);
  if(mins<1) return "just now";
  if(mins<60) return `${mins} min ago`;
  const h=Math.floor(mins/60);
  return h<24 ? `${h}h ${mins%60}m ago` : `${Math.floor(h/24)}d ago`;
}
function buoyPopupHtml(b, loc){
  const o=b.obs||{};
  const row=(label,val)=> (val==null||val==="")?"":`<div style="display:flex;justify-content:space-between;gap:12px;font-size:12px;line-height:1.6;"><span style="color:#64748b;">${label}</span><span style="color:#0f172a;font-weight:600;text-align:right;">${val}</span></div>`;
  const wind = o.wind_kt!=null ? `${Math.round(o.wind_kt)} kt${o.wind_dir_deg!=null?` &middot; ${bearingLabel(o.wind_dir_deg)}`:""}${o.gust_kt!=null?` (G ${Math.round(o.gust_kt)})`:""}` : null;
  const waves = o.wave_ft!=null ? `${o.wave_ft.toFixed(1)} ft${o.dom_period_s!=null?` @ ${Math.round(o.dom_period_s)}s`:""}${o.mean_wave_dir_deg!=null?` &middot; ${bearingLabel(o.mean_wave_dir_deg)}`:""}` : null;
  const wtmp = o.water_temp_f!=null ? `${o.water_temp_f.toFixed(1)}&deg;F` : null;
  const atmp = o.air_temp_f!=null ? `${o.air_temp_f.toFixed(1)}&deg;F` : null;
  const pres = o.pressure_mb!=null ? `${o.pressure_mb.toFixed(1)} mb` : null;
  const dist = loc!=null ? `${distanceNm(loc.lat,loc.lon,b.lat,b.lon).toFixed(0)} nm from departure` : null;
  const age = buoyAgeStr(o.time);
  const hasObs = wind||waves||wtmp||atmp||pres;
  return `<div style="font-family:system-ui,sans-serif;min-width:200px;">`
    + `<div style="font-weight:700;font-size:13px;color:#0f172a;">${b.name||b.id}</div>`
    + `<div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">NDBC ${b.id}${dist?` &middot; ${dist}`:""}</div>`
    + (hasObs
        ? row("Wind",wind)+row("Waves",waves)+row("Water temp",wtmp)+row("Air temp",atmp)+row("Pressure",pres)
          + `<div style="font-size:10px;color:#94a3b8;margin-top:6px;border-top:1px solid #e2e8f0;padding-top:4px;">Observed ${age||"recently"}</div>`
        : `<div style="font-size:12px;color:#94a3b8;font-style:italic;">Inactive weather reporting.</div>`)
    + `</div>`;
}

// ── Isotherm engine ────────────────────────────────────────────────────────────
function buildField(latSet, lonSet, grid) {
  const rows = latSet.length, cols = lonSet.length;
  const field = new Float32Array(rows * cols).fill(NaN);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const v = grid[`${latSet[r]}_${lonSet[c]}`];
      if (v != null && Number.isFinite(v)) field[r * cols + c] = v;
    }
  return { field, rows, cols };
}
function lerp(v0, v1, iso) { if (Math.abs(v1 - v0) < 1e-9) return 0.5; return (iso - v0) / (v1 - v0); }
function marchingSquares(latSet, lonSet, field, rows, cols, isoValue) {
  const segments = [];
  const get = (r, c) => { if (r<0||r>=rows||c<0||c>=cols) return NaN; return field[r*cols+c]; };
  function edgePt(r, c, dir) {
    let lat, lon;
    if (dir===0){const t=lerp(get(r,c),get(r,c+1),isoValue);lat=latSet[r];lon=lonSet[c]+t*(lonSet[c+1]-lonSet[c]);}
    else if(dir===1){const t=lerp(get(r,c+1),get(r+1,c+1),isoValue);lon=lonSet[c+1];lat=latSet[r]+t*(latSet[r+1]-latSet[r]);}
    else if(dir===2){const t=lerp(get(r+1,c+1),get(r+1,c),isoValue);lat=latSet[r+1];lon=lonSet[c+1]+t*(lonSet[c]-lonSet[c+1]);}
    else{const t=lerp(get(r+1,c),get(r,c),isoValue);lon=lonSet[c];lat=latSet[r+1]+t*(latSet[r]-latSet[r+1]);}
    return [lon, lat];
  }
  const edgePairs={1:[[2,3]],2:[[1,2]],3:[[1,3]],4:[[0,1]],5:[[0,3],[1,2]],6:[[0,2]],7:[[0,3]],8:[[0,3]],9:[[0,2]],10:[[0,1],[2,3]],11:[[0,1]],12:[[1,3]],13:[[1,2]],14:[[2,3]]};
  for (let r=0;r<rows-1;r++) for (let c=0;c<cols-1;c++) {
    const v00=get(r,c),v01=get(r,c+1),v10=get(r+1,c),v11=get(r+1,c+1);
    if(!Number.isFinite(v00)||!Number.isFinite(v01)||!Number.isFinite(v10)||!Number.isFinite(v11))continue;
    const idx=(v00>=isoValue?8:0)|(v01>=isoValue?4:0)|(v11>=isoValue?2:0)|(v10>=isoValue?1:0);
    const pairs=edgePairs[idx];if(!pairs)continue;
    for(const[eA,eB]of pairs)segments.push([edgePt(r,c,eA),edgePt(r,c,eB)]);
  }
  if(!segments.length)return[];
  const Q=5,fmt=([lon,lat])=>`${lon.toFixed(Q)},${lat.toFixed(Q)}`;
  const startMap=new Map(),endMap=new Map();
  for(let i=0;i<segments.length;i++){const sk=fmt(segments[i][0]),ek=fmt(segments[i][1]);if(!startMap.has(sk))startMap.set(sk,[]);if(!endMap.has(ek))endMap.set(ek,[]);startMap.get(sk).push(i);endMap.get(ek).push(i);}
  const used=new Uint8Array(segments.length),lines=[];
  for(let i=0;i<segments.length;i++){
    if(used[i])continue;used[i]=1;const coords=[...segments[i]];
    let tail=fmt(coords[coords.length-1]),found=true;
    while(found){found=false;for(const j of(startMap.get(tail)||[])){if(!used[j]){used[j]=1;coords.push(segments[j][1]);tail=fmt(coords[coords.length-1]);found=true;break;}}if(!found)for(const j of(endMap.get(tail)||[])){if(!used[j]){used[j]=1;coords.push(segments[j][0]);tail=fmt(coords[coords.length-1]);found=true;break;}}}
    let head=fmt(coords[0]);found=true;
    while(found){found=false;for(const j of(endMap.get(head)||[])){if(!used[j]){used[j]=1;coords.unshift(segments[j][0]);head=fmt(coords[0]);found=true;break;}}if(!found)for(const j of(startMap.get(head)||[])){if(!used[j]){used[j]=1;coords.unshift(segments[j][1]);head=fmt(coords[0]);found=true;break;}}}
    if(coords.length>=2)lines.push(coords);
  }
  return lines;
}
function computeTempBreakContour(latSet,lonSet,field,rows,cols,targetTemp,sensitivity){
  const gradient=new Float32Array(rows*cols).fill(0);
  const get=(r,c)=>{if(r<0||r>=rows||c<0||c>=cols)return NaN;return field[r*cols+c];};
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const v=get(r,c);if(!Number.isFinite(v))continue;let maxDiff=0;for(const[dr,dc]of[[0,1],[0,-1],[1,0],[-1,0]]){const n=get(r+dr,c+dc);if(Number.isFinite(n))maxDiff=Math.max(maxDiff,Math.abs(v-n));}gradient[r*cols+c]=maxDiff;}
  const maskedField=new Float32Array(field);
  for(let i=0;i<maskedField.length;i++){if(gradient[i]<sensitivity)maskedField[i]=NaN;}
  return marchingSquares(latSet,lonSet,maskedField,rows,cols,targetTemp);
}
function buildIsothermLines(latSet,lonSet,grid,targetTemp,sensitivity){
  if(!latSet.length||!lonSet.length)return{isotherms:[],breaks:[]};
  const{field,rows,cols}=buildField(latSet,lonSet,grid);
  const iso=marchingSquares(latSet,lonSet,field,rows,cols,targetTemp).map(line=>line.map(([lon,lat])=>[lat,lon]));
  const brk=computeTempBreakContour(latSet,lonSet,field,rows,cols,targetTemp,sensitivity).map(line=>line.map(([lon,lat])=>[lat,lon]));
  return{isotherms:iso,breaks:brk};
}

// ── Ocean mask ────────────────────────────────────────────────────────────────
function pointInRing(px,py,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];if((yi>py)!==(yj>py)&&px<((xj-xi)*(py-yi))/(yj-yi)+xi)inside=!inside;}return inside;}

// ── Submarine Canyon Labels (Mid-Atlantic + New England) ─────────────────────
const CANYON_LABELS = [
  { name: "Hatteras Canyon",   lat: 34.9509, lon: -75.1509 },
  { name: "Pamlico Canyon",    lat: 34.7859, lon: -75.3500 },
  { name: "Keller Canyon",     lat: 35.5377, lon: -74.7680 },
  { name: "Norfolk Canyon",    lat: 37.0347, lon: -74.5470 },
  { name: "Washington Canyon", lat: 37.3645, lon: -74.3261 },
  { name: "Poor Man's Canyon", lat: 37.7679, lon: -74.0137 },
  { name: "Baltimore Canyon",  lat: 38.0384, lon: -73.7240 },
  { name: "Wilmington Canyon", lat: 38.3194, lon: -73.4772 },
  { name: "Spencer Canyon",    lat: 38.5760, lon: -73.1220 },
  { name: "Lindenkohl Canyon", lat: 38.7550, lon: -72.9457 },
  { name: "Berkeley Canyon",   lat: 38.9544, lon: -72.6686 },
  { name: "Carteret Canyon",   lat: 38.8591, lon: -72.8041 },
  { name: "Toms Canyon",       lat: 39.0378, lon: -72.5473 },
  { name: "Hudson Canyon",     lat: 39.6056, lon: -72.3195 },
  { name: "Block Canyon",      lat: 40.0802, lon: -71.3260 },
  { name: "Alvin Canyon",      lat: 40.1250, lon: -70.4800 },
  { name: "Nantucket Canyon",  lat: 40.1250, lon: -70.2133 },
  { name: "Atlantis Canyon",   lat: 40.0083, lon: -69.9367 },
  { name: "Veatch Canyon",     lat: 40.0401, lon: -69.6617 },
];

// ── Loran-C overlay — two crossing families ──────────────────────────────────
// W family: GRI 7980 (Southeast US) — Jupiter FL master + Malone FL secondary
//   runs NE-SW off NC coast; ~26760 at The Point (35.529°N, 74.833°W)
// Y family: GRI 9960 (Northeast US) — Caribou ME master + Jupiter FL secondary
//   runs WNW-ESE, crosses W at ~60°; ~40575 at The Point
// Both calibrated from NOAA chart values at The Point.
const LORAN_W_MASTER = { lat: 26.9783, lon: -80.1167 }; // Jupiter, FL
const LORAN_W_SEC    = { lat: 30.9933, lon: -85.1783, ed: 26725 }; // Malone, FL
const LORAN_Y_MASTER = { lat: 46.809,  lon: -67.928  }; // Caribou, ME
const LORAN_Y_SEC    = { lat: 26.9783, lon: -80.1167, ed: 41592 }; // Jupiter, FL
function loranHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.009, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function computeLoranTD_W(lat, lon) {
  return LORAN_W_SEC.ed + (loranHaversineKm(lat, lon, LORAN_W_SEC.lat, LORAN_W_SEC.lon)
    - loranHaversineKm(lat, lon, LORAN_W_MASTER.lat, LORAN_W_MASTER.lon)) / 0.299709;
}
function computeLoranTD_Y(lat, lon) {
  return LORAN_Y_SEC.ed + (loranHaversineKm(lat, lon, LORAN_Y_SEC.lat, LORAN_Y_SEC.lon)
    - loranHaversineKm(lat, lon, LORAN_Y_MASTER.lat, LORAN_Y_MASTER.lon)) / 0.299709;
}
function buildLoranGrid(map, waterMask, regionBounds, includeWFamily) {
  const LSTEP = 0.1;
  // Clip to region + padding instead of full US coast — the full extent
  // (~49k points x ~1000 isoline levels) freezes the main thread.
  const PAD = 1.5;
  const LAT_MAX = regionBounds ? Math.min(42, regionBounds.north + PAD) : 42;
  const LAT_MIN = regionBounds ? Math.max(24, regionBounds.south - PAD) : 24;
  const LON_MIN = regionBounds ? Math.max(-87, regionBounds.west  - PAD) : -87;
  const LON_MAX = regionBounds ? Math.min(-60, regionBounds.east  + PAD) : -60;
  const latSet = [], lonSet = [];
  for (let la = LAT_MAX; la >= LAT_MIN - 0.001; la = Math.round((la - LSTEP) * 1e4) / 1e4) latSet.push(la);
  for (let lo = LON_MIN; lo <= LON_MAX + 0.001; lo = Math.round((lo + LSTEP) * 1e4) / 1e4) lonSet.push(lo);

  const wGrid = {}, yGrid = {};
  for (const la of latSet) for (const lo of lonSet) {
    const k = `${la}_${lo}`;
    wGrid[k] = computeLoranTD_W(la, lo);
    yGrid[k] = computeLoranTD_Y(la, lo);
  }

  // Apply ocean mask — blank out land cells so contours stop at coastlines
  function applyMask(grid) {
    if (!waterMask) return grid;
    return Object.fromEntries(Object.entries(grid).filter(([k]) => {
      const [la, lo] = k.split("_").map(Number); return waterMask(la, lo);
    }));
  }
  const wMasked = applyMask(wGrid), yMasked = applyMask(yGrid);
  const { field: wField, rows, cols } = buildField(latSet, lonSet, wMasked);
  const { field: yField } = buildField(latSet, lonSet, yMasked);

  function rangeFor(grid) {
    const vals = Object.values(grid).filter(Number.isFinite).sort((a,b)=>a-b);
    return [Math.ceil(vals[0] / 20) * 20, Math.floor(vals[vals.length-1] / 20) * 20];
  }
  const [wLo, wHi] = rangeFor(wGrid);
  const [yLo, yHi] = rangeFor(yGrid);

  const wLL = [], yLL = [];
  for (let l = wLo; l <= wHi; l += 20) { const lines = marchingSquares(latSet, lonSet, wField, rows, cols, l); if (lines.length) wLL.push({ level: l, lines }); }
  for (let l = yLo; l <= yHi; l += 20) { const lines = marchingSquares(latSet, lonSet, yField, rows, cols, l); if (lines.length) yLL.push({ level: l, lines }); }

  const group = L.layerGroup();
  function drawLL(levelLines, majClr, minClr) {
    for (const { level, lines } of levelLines) {
      const maj = level % 100 === 0;
      const wt = maj ? 1.1 : 0.55; const op = maj ? 0.62 : 0.28;
      for (const seg of lines) {
        const ll = seg.map(([ln, la]) => [la, ln]);
        L.polyline(ll, { color: "rgba(255,255,255,0.25)", weight: wt + 0.7, opacity: 0.2, interactive: false }).addTo(group);
        L.polyline(ll, { color: maj ? majClr : minClr, weight: wt, opacity: op, interactive: false }).addTo(group);
      }
    }
  }
  drawLL(yLL, "rgba(140,140,140,1.0)", "rgba(140,140,140,1.0)");
  if (includeWFamily) drawLL(wLL, "rgba(180,120,60,1.0)", "rgba(180,120,60,1.0)");

  const lbl = { layer: null };
  function buildLoranLabels() {
    if (lbl.layer) { map.removeLayer(lbl.layer); lbl.layer = null; }
    if (map.getZoom() < 8) return;
    const mb = map.getBounds();
    const lg = L.layerGroup();
    function addLbls(levelLines, prefix, color) {
      const cnt = {};
      for (const { level, lines } of levelLines) {
        if (level % 100 !== 0) continue;
        for (const line of lines) {
          let best = [], cur = [];
          for (const [ln, la] of line) {
            if (mb.contains([la, ln])) cur.push([ln, la]);
            else { if (cur.length > best.length) best = cur; cur = []; }
          }
          if (cur.length > best.length) best = cur;
          if (best.length < 3) continue;
          if ((cnt[level] || 0) >= 3) continue;
          cnt[level] = (cnt[level] || 0) + 1;
          const [ln, la] = best[Math.floor(best.length / 2)];
          L.marker([la, ln], {
            icon: L.divIcon({
              className: "",
              html: `<div style="font-size:9px;font-weight:700;font-family:system-ui,sans-serif;color:${color};text-shadow:1px 1px 0 rgba(255,255,255,0.95),-1px 1px 0 rgba(255,255,255,0.95),1px -1px 0 rgba(255,255,255,0.95),-1px -1px 0 rgba(255,255,255,0.95),0 1px 0 rgba(255,255,255,0.95),0 -1px 0 rgba(255,255,255,0.95);white-space:nowrap;pointer-events:none;line-height:1;">${prefix}${level}</div>`,
              iconSize: null, iconAnchor: [0, 5],
            }),
            interactive: false, keyboard: false,
          }).addTo(lg);
        }
      }
    }
    addLbls(yLL, "Y", "#444444");
    if (includeWFamily) addLbls(wLL, "W", "#8a5a2a");
    lg.addTo(map); lbl.layer = lg;
  }
  buildLoranLabels();
  map.on("zoomend", buildLoranLabels);
  map.on("moveend", buildLoranLabels);
  group._loranCleanup = () => {
    map.off("zoomend", buildLoranLabels); map.off("moveend", buildLoranLabels);
    if (lbl.layer) { map.removeLayer(lbl.layer); lbl.layer = null; }
  };
  return group;
}

const _OCEAN_MASK_BASE="https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData";

async function loadPrebakedMask(url){try{const t0=performance.now();const res=await fetch(url,{cache:"no-store"});if(!res.ok){console.warn("[MASK] prebaked not available, HTTP",res.status);return null;}const obj=await res.json();const{bounds,step,rows,cols,packed}=obj;const bin=atob(packed);const bits=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bits[i]=bin.charCodeAt(i);console.log(`[MASK] prebaked loaded in ${(performance.now()-t0).toFixed(0)}ms (${rows}x${cols}, ${bits.length} bytes)`);return(lat,lon)=>{const ri=Math.round((bounds.n-lat)/step);const ci=Math.round((lon-bounds.w)/step);if(ri<0||ri>=rows||ci<0||ci>=cols)return true;const idx=ri*cols+ci;return(bits[idx>>3]&(0x80>>(idx&7)))!==0;};}catch(e){console.warn("[MASK] prebaked load failed:",e);return null;}}
async function buildOceanMaskFromLand(bounds,maskUrl){const prebaked=await loadPrebakedMask(maskUrl);if(prebaked)return prebaked;console.warn("[MASK] falling back to live Natural Earth download");try{const res=await fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson");const gj=await res.json();let polys=[];for(const f of gj.features){const g=f.geometry;if(g.type==="Polygon")polys.push(g.coordinates);else if(g.type==="MultiPolygon")g.coordinates.forEach(p=>polys.push(p));}polys=polys.filter(poly=>{const r=poly[0];let mnLon=Infinity,mxLon=-Infinity,mnLat=Infinity,mxLat=-Infinity;for(const[lo,la]of r){if(lo<mnLon)mnLon=lo;if(lo>mxLon)mxLon=lo;if(la<mnLat)mnLat=la;if(la>mxLat)mxLat=la;}return mxLon>=bounds.west&&mnLon<=bounds.east&&mxLat>=bounds.south&&mnLat<=bounds.north;});if(!polys.length)return null;const STEP=0.02;const ocean=new Set();for(let lat=bounds.south;lat<=bounds.north+STEP*0.5;lat+=STEP){for(let lon=bounds.west;lon<=bounds.east+STEP*0.5;lon+=STEP){let isLand=false;for(const poly of polys){if(pointInRing(lon,lat,poly[0])){let inHole=false;for(let h=1;h<poly.length;h++){if(pointInRing(lon,lat,poly[h])){inHole=true;break;}}if(!inHole){isLand=true;break;}}}if(!isLand)ocean.add(`${Math.round((lat-bounds.south)/STEP)}_${Math.round((lon-bounds.west)/STEP)}`);}}if(!ocean.size)return null;return(lat,lon)=>ocean.has(`${Math.round((lat-bounds.south)/STEP)}_${Math.round((lon-bounds.west)/STEP)}`);}catch(e){console.error("[MASK] fallback also failed:",e);return null;}}

// ── Canvas raster ─────────────────────────────────────────────────────────────
export async function gridToDataURL(latSet,lonSet,grid,valMin,valMax,colorFn,isOcean,rangeMin,rangeMax,signal=null){
  if(!latSet.length||!lonSet.length)return null;
  const latNorth=latSet[0],latSouth=latSet[latSet.length-1],lonWest=lonSet[0],lonEast=lonSet[lonSet.length-1];
  const lonRange=lonEast-lonWest||1;
  const CANVAS_W=1280,CANVAS_H=1000;const canvas=document.createElement("canvas");canvas.width=CANVAS_W;canvas.height=CANVAS_H;
  const ctx=canvas.getContext("2d");const img=ctx.createImageData(CANVAS_W,CANVAS_H);const d=img.data;
  // Cursor-based bracket finding: correct for non-uniform/sparse lonSet/latSet.
  // The avg-step float-index approach (lonFloat=(lon-lonWest)/lonStep) only works
  // for uniformly-spaced sets. VIIRS passes with coverage gaps have non-uniform
  // sparse sets, causing data to render at wrong pixel positions (apparent geo shift).
  const HALF_CELL=0.01; // half of canonical 0.02° grid step for overlay border
  const mercY=(lat)=>Math.log(Math.tan(Math.PI/4+(lat*Math.PI/180)/2));const invMercY=(y)=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
  const mercYNorth=mercY(latNorth),mercYSouth=mercY(latSouth),mercYRange=mercYNorth-mercYSouth||1;
  // Process rows in 50-row chunks, yielding to the event loop between each chunk.
  // Prevents the tab from freezing on large grids (e.g. VIIRS clear-sky 89k cells).
  const CHUNK=50;
  let latCursor=0;
  for(let pyStart=0;pyStart<CANVAS_H;pyStart+=CHUNK){
    if(signal&&signal.aborted)return null;
    await new Promise(r=>{const _mc=new MessageChannel();_mc.port1.onmessage=r;_mc.port2.postMessage(null);});
    for(let py=pyStart;py<Math.min(pyStart+CHUNK,CANVAS_H);py++){const mY=mercYNorth-(py/(CANVAS_H-1))*mercYRange;const lat=invMercY(mY);// Advance latCursor: latSet descending, find bracket latSet[c]>=lat>=latSet[c+1]
  while(latCursor<latSet.length-2&&latSet[latCursor+1]>lat)latCursor++;
  const latIdx0=Math.min(latCursor,latSet.length-2);const gridLat0=latSet[latIdx0],gridLat1=latSet[latIdx0+1];if(gridLat0-gridLat1>0.2)continue;if(lat>gridLat0||lat<gridLat1)continue;
  const latFrac=gridLat0===gridLat1?0:Math.max(0,Math.min(1,(gridLat0-lat)/(gridLat0-gridLat1)));
    let lonCursor=0;
    for(let px=0;px<CANVAS_W;px++){const lon=lonWest+(px/(CANVAS_W-1))*lonRange;if(isOcean&&!isOcean(lat,lon))continue;// Advance lonCursor: lonSet ascending, find bracket lonSet[c]<=lon<=lonSet[c+1]
  while(lonCursor<lonSet.length-2&&lonSet[lonCursor+1]<=lon)lonCursor++;
  const lonIdx0=Math.min(lonCursor,lonSet.length-2);const gridLon0=lonSet[lonIdx0],gridLon1=lonSet[lonIdx0+1];if(gridLon1-gridLon0>0.2)continue;if(lon<gridLon0||lon>gridLon1)continue;const lonFrac=gridLon0===gridLon1?0:Math.max(0,Math.min(1,(lon-gridLon0)/(gridLon1-gridLon0)));const vNW=grid[`${gridLat0}_${gridLon0}`],vNE=grid[`${gridLat0}_${gridLon1}`];const vSW=grid[`${gridLat1}_${gridLon0}`],vSE=grid[`${gridLat1}_${gridLon1}`];const wNW=(1-latFrac)*(1-lonFrac),wNE=(1-latFrac)*lonFrac,wSW=latFrac*(1-lonFrac),wSE=latFrac*lonFrac;let sum=0,wsum=0;if(vNW!=null&&Number.isFinite(vNW)){sum+=vNW*wNW;wsum+=wNW;}if(vNE!=null&&Number.isFinite(vNE)){sum+=vNE*wNE;wsum+=wNE;}if(vSW!=null&&Number.isFinite(vSW)){sum+=vSW*wSW;wsum+=wSW;}if(vSE!=null&&Number.isFinite(vSE)){sum+=vSE*wSE;wsum+=wSE;}if(wsum<0.25)continue;const val=sum/wsum;
      const rgb=colorFn?colorFn(val,valMin,valMax,rangeMin,rangeMax):sstColor(val,valMin,valMax,rangeMin,rangeMax);
      if(!rgb)continue;
      const i=(py*CANVAS_W+px)*4;d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];d[i+3]=Math.round(220*Math.min(1,wsum));}}}
  ctx.putImageData(img,0,0);
  return new Promise((resolve)=>{canvas.toBlob((blob)=>{if(!blob){resolve(null);return;}resolve({dataURL:URL.createObjectURL(blob),west:lonWest-HALF_CELL,east:lonEast+HALF_CELL,north:latNorth+HALF_CELL,south:latSouth-HALF_CELL});},"image/png");});
}

// ── IsothermControls (extracted to components/IsothermControls.jsx) ───────────
// ── InfoPopup ─────────────────────────────────────────────────────────────────
function InfoPopup({ text, onClose, triggerRef }) {
  const [pos, setPos] = React.useState(null);
  useLayoutEffect(() => {
    if (!triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const W = 320;
    const left = Math.max(8, rect.left - W - 12);
    const top  = Math.max(8, Math.min(rect.top, window.innerHeight - 400));
    setPos({ left, top });
  }, []);
  useEffect(() => {
    function handler(e) { if (triggerRef?.current && !triggerRef.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  if (!pos) return null;
  return createPortal(
    <div style={{ position:"fixed", left:pos.left, top:pos.top, width:320, zIndex:9999, background:"#fff", borderRadius:14, padding:"16px 18px 18px", boxShadow:"0 12px 40px rgba(0,0,0,0.22)", fontSize:12, lineHeight:1.7, color:"#1e293b", animation:"helpIn 0.15s ease-out" }}>
      <style>{`@keyframes helpIn{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}`}</style>
      <button onClick={onClose} style={{ position:"absolute", top:10, right:10, background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8", lineHeight:1 }}>×</button>
      <div style={{ whiteSpace:"pre-wrap", paddingRight:16 }}>{text}</div>
    </div>,
    document.body
  );
}
const TARGET_TEMP_HELP = `The dotted white line is the plain isotherm — every point where the water hits exactly your target temp, regardless of whether it's a sharp break or a gentle slope. It's a geometric contour, like a topographic line.`;
const SHARPNESS_HELP = `The Front Sharpness slider controls which temperature differences get highlighted as "breaks."

• Low sharpness (0.5°F) — only draws the cyan line where the gradient is extremely sharp.
• High sharpness (8°F) — draws the cyan line even where temperature changes slowly.

The solid cyan line is the temp break and only drawn where the gradient exceeds your threshold.`;
function HelpIcon({ onOpen, btnRef }) {
  return (
    <button ref={btnRef} onClick={e => { e.stopPropagation(); onOpen(); }} style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:"50%", width:13, height:13, cursor:"pointer", padding:0, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#0284c7", lineHeight:1, flexShrink:0, marginLeft:3, verticalAlign:"middle" }}>?</button>
  );
}
function IsothermControls({enabled,onToggle,targetTemp,onTargetTemp,sensitivity,onSensitivity,sstMin,sstMax}){
  const clampedTarget=Math.max(sstMin,Math.min(sstMax,targetTemp));
  const [helpText, setHelpText] = React.useState(null);
  const [activeTriggerRef, setActiveTriggerRef] = React.useState(null);
  const targetBtnRef = React.useRef(null);
  const sharpBtnRef  = React.useRef(null);
  function openHelp(text, ref) { setHelpText(text); setActiveTriggerRef(ref); }
  return(
    <div className="border-t border-slate-200 mt-0.5 pt-1.5">
      {helpText && <InfoPopup text={helpText} triggerRef={activeTriggerRef} onClose={() => { setHelpText(null); setActiveTriggerRef(null); }} />}
      <button onClick={onToggle} className={`w-full flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg text-left transition-colors ${enabled?"bg-sky-500 text-white":"bg-white text-slate-600 hover:bg-slate-50 border border-slate-300"}`}>
        <span className="text-sm">~</span> Temp Break
      </button>
      {enabled&&(
        <div className="mt-1.5 space-y-2 px-1">
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] text-slate-500 font-medium flex items-center">Target Temp<HelpIcon btnRef={targetBtnRef} onOpen={() => openHelp(TARGET_TEMP_HELP, targetBtnRef)} /></span>
              <span className="text-[11px] font-bold text-sky-600 tabular-nums">{clampedTarget.toFixed(1)}F</span>
            </div>
            <input type="range" min={Math.floor(sstMin)} max={Math.ceil(sstMax)} step={0.5} value={clampedTarget} onChange={e=>onTargetTemp(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-sky-500"/>
            <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>{Math.floor(sstMin)}</span><span>{Math.ceil(sstMax)}</span></div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] text-slate-500 font-medium flex items-center">Front sharpness<HelpIcon btnRef={sharpBtnRef} onOpen={() => openHelp(SHARPNESS_HELP, sharpBtnRef)} /></span>
              <span className="text-[11px] font-bold text-violet-600 tabular-nums">{sensitivity.toFixed(1)}°F</span>
            </div>
            <input type="range" min={0.5} max={8} step={0.5} value={sensitivity} onChange={e=>onSensitivity(parseFloat(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500"/>
            <div className="flex justify-between text-[9px] text-slate-400 mt-0.5"><span>← sharp only</span><span>all gradients →</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper: parse composite data date and return age info ───────────────────
function compositeAgeInfo(compositeDate) {
  if (!compositeDate) return null;
  // Use noon UTC on the data date as the "as-of" time
  const dataAsOf  = new Date(compositeDate + "T12:00:00Z");
  const ageHrs    = Math.round((Date.now() - dataAsOf.getTime()) / (1000 * 3600));
  const dateLabel = new Date(compositeDate + "T12:00:00Z").toLocaleString("en-US", {
    month: "short", day: "numeric", timeZone: "America/New_York",
  });
  return { ageHours: ageHrs, dateLabel };
}

// ─── Helper: generate hand-circle SVG paths from polygon points ──────────────
// (used internally inside the fish hotspots useEffect via drawCircle())
function makeHandCircleSVG(pts, map, color) {
  if (!pts || pts.length < 3) return null;
  const projected = pts.map(([lat, lon]) => { const p = map.latLngToContainerPoint([lat, lon]); return [p.x, p.y]; });
  const PAD = 18;
  const xs = projected.map(p => p[0]), ys = projected.map(p => p[1]);
  const minX = Math.min(...xs) - PAD, minY = Math.min(...ys) - PAD;
  const maxX = Math.max(...xs) + PAD, maxY = Math.max(...ys) + PAD;
  const W = maxX - minX, H = maxY - minY;
  if (W < 10 || H < 10) return null;
  const localPts = projected.map(([x, y]) => [x - minX, y - minY]);
  const N = 28, n = localPts.length;
  const perim = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * n, i0 = Math.floor(t) % n, i1 = (i0 + 1) % n, f = t - Math.floor(t);
    perim.push([localPts[i0][0] * (1 - f) + localPts[i1][0] * f, localPts[i0][1] * (1 - f) + localPts[i1][1] * f]);
  }
  const seed = Math.round(minX * 100 + minY * 100);
  function seededRand(i) { const x = Math.sin(seed + i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  const WOBBLE = Math.min(W, H) * 0.055;
  const wobbly = perim.map(([x, y], i) => { const r = (seededRand(i) - 0.5) * 2 * WOBBLE, th = seededRand(i + 100) * Math.PI * 2; return [x + r * Math.cos(th), y + r * Math.sin(th)]; });
  function catmullRomToBezier(pts) {
    const n = pts.length; let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6, cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6, cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + " Z";
  }
  const wobbly2 = wobbly.map(([x, y], i) => [x + (seededRand(i + 200) - 0.5) * WOBBLE * 0.4, y + (seededRand(i + 300) - 0.5) * WOBBLE * 0.4]);
  return { pathD: catmullRomToBezier(wobbly), pathD2: catmullRomToBezier(wobbly2), minX, minY, W, H };
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SSTHeatmapLeaflet(props) {
  const {
    data, shareHeatmapData, sstMin, sstMax, date, onLocationSaved, clearMarkersRef, flyToRef,
    onHoverSst, dataSource, setDataSource, activeDataLayer, setActiveDataLayer,
    wreckRemovedKeys,
    hotspotData, hotspotLoading,
    selectedFishSpecies, setSelectedFishSpecies,
    showHotspots, setShowHotspots,
    compositeData,
    compositeGenerated,
    compositeDateIndex, setCompositeDateIndex, compositeDates,
    chlData, chlDateIndex, setChlDateIndex, chlLoading, chlSource, setChlSource,
    chlCompositeDates, chlCompositeDateIndex, setChlCompositeDateIndex,
    seaColorData, seaColorDateIndex, setSeaColorDateIndex, seaColorLoading, seaColorSource, setSeaColorSource,
    seaColorCompositeDates, seaColorCompositeDateIndex, setSeaColorCompositeDateIndex,
    viirsData, viirsDateIndex, setViirsDateIndex, viirsHour, setViirsHour,
    viirsNppData, viirsNppDateIndex, setViirsNppDateIndex, activeViirsNppDay,
    murData, murDateIndex, setMurDateIndex,
    goesCompData, goesCompDateIndex, setGoesCompDateIndex, activeGoesCompDay,
    highlightedLocation, setHighlightedLocation,
    regionConfig, regionKey, selectedLocation,
    savedLocations, fetchSavedLocations,
    windData, windLoading, windHourIndex, setWindHourIndex,
    showWindOverlay, setShowWindOverlay,
    windPlaying, setWindPlaying,
    sstRange, onSstRangeChange, userId,
    seasonalSstDefault,
    onShare,
    legendHoverSst, openControlPanelRef, rangeControlOpenRef,
    onNotesUpdated,
    BATHY_CONTOURS_URL, WRECKS_URL, BATHY_URL, BATHY_TILE_URL,
    isPro,
    currentsData, currentsLoading, showCurrents, setShowCurrents,
    altimetryData, onSlaRange,
  altimetryDates, altimetryDateIndex, setAltimetryDateIndex, altimetryPlaying, setAltimetryPlaying,
  sstPlaying, setSstPlaying,
  chlPlaying, setChlPlaying,
  seaColorPlaying, setSeaColorPlaying,
    tripMode, waypoints, onAddWaypoint, onMoveWaypoint, onRemoveWaypoint, onToggleTripMode, onEndTripAtDeparture, onLoadRoute,
    gpsActive, onToggleGps, boatPosition, boatTrack,
    // community
    communityLocations, showCommunityLayer, setShowCommunityLayer,
    communityAccess, communityCount,
    onOpenLeaderboard, onPostCommunityReport,
    onCommunityPosted,
    communityPinDrop, onCommunityPinDropped, onCancelPinDrop, onCommunityDeleted,
    onStartNavFromMap, onEndNavFromMap,
  } = props;

  // Local haversine for nav distance calc (same formula as TripPlanner)
  function navHaversineNm(la1, lo1, la2, lo2) {
    const R = 3440.065;
    const dLa = (la2 - la1) * Math.PI / 180;
    const dLo = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLa / 2) ** 2 +
      Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Navigation state lives in AppContext (not props — avoids threading 6 new props)
  const {
    navigatingRoute, currentWpIndex, setCurrentWpIndex,
    endNavigation, smoothedSpeedKts, tripSharing,
  } = useAppContext();

  const { latSet, lonSet, grid } = data;
  const regionBounds = regionConfig.bounds;
  // Region-aware VIIRS bundled path (GA/SC files live under a subdir).
  const _vSuffix    = regionConfig?.dataPathSuffix ?? "";
  const _vSubdir    = _vSuffix ? `${_vSuffix}/` : "";
  const VIIRS_CDN_BASE_R = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/Bundled/${_vSubdir}`.replace(/\/+$/, "");
  const llBounds = L.latLngBounds(
    [regionBounds.south, regionBounds.west],
    [regionBounds.north, regionBounds.east]
  );
  // Mercator center differs from geographic center by ~0.5° for this region.
  // Using geographic center (llBounds.getCenter()) for setView causes the viewport
  // to extend ~0.4° north past the data boundary. Use Mercator midpoint instead.
  const _mcN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
  const _mcS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
  const mercCenter = L.latLng(
    (2*Math.atan(Math.exp((_mcN+_mcS)/2)) - Math.PI/2) * 180/Math.PI,
    (regionBounds.west + regionBounds.east) / 2
  );
  // Compute locally so mobile VIIRS date-nav never crashes with "can't find variable"
  const activeViirsDay = viirsData?.days?.[viirsDateIndex] ?? null;
  // Format ISO "2026-06-22" or YYYYMMDD "20260622" → "Jun 22"
  const fmtDate = s => {
    if (!s) return "—";
    if (/^\d{8}$/.test(s)) {
      const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${mo[parseInt(s.slice(4,6),10)-1]} ${parseInt(s.slice(6,8),10)}`;
    }
    try { return new Date(s.includes("T") ? s : s+"T12:00:00Z").toLocaleString("en-US",{month:"short",day:"numeric",timeZone:"America/New_York"}); }
    catch { return s; }
  };

  const mapDivRef        = useRef(null);
  const mapRef           = useRef(null);
  const sstOverlayRef    = useRef(null);
  const overlayLayerRef  = useRef(null);
  const isothermLayerRef = useRef(null);
  const breakLayerRef    = useRef(null);
  const breakGlowRef     = useRef(null);
  const bathyLayerRef    = useRef(null);
  const radarTileRef     = useRef(null);
  const radarPlayRef      = useRef(null);
  const radarFadeOutRef   = useRef(null);   // previous tile layer, currently fading out
  const radarFadeTimerRef = useRef(null);   // timeout that removes it once the fade finishes
  const bathyTileRef     = useRef(null);
  const bathyLabelRef    = useRef(null);
  const wreckLayerRef    = useRef(null);
  const buoyLayerRef     = useRef(null);
  const hotspotLayerRef  = useRef(null);
  const markersLayerRef  = useRef(null);
  const refMarkerRef     = useRef(null);
  const highlightLayerRef= useRef(null);
  const velocityLayerRef    = useRef(null);
  const windRasterOverlayRef= useRef(null);
  const currentsLayerRef    = useRef(null);
  const slaContourLayerRef  = useRef(null);
  const slaOverlayContourLayerRef = useRef(null);
  const loranLayerRef = useRef(null);
  const canyonLabelLayerRef = useRef(null);

  const blobUrlsRef         = useRef([]);
  // Tightest data bounds from the most recently loaded overlay/SST layer.
  // Refits use these instead of llBounds so the viewport cannot extend
  // north of the actual data boundary on mobile (portrait) screens.
  const dataBoundsRef        = useRef(null);

  const selectedLocationRef = useRef(selectedLocation);
  useEffect(() => { selectedLocationRef.current = selectedLocation; }, [selectedLocation]);
  const activeDataLayerRef = useRef(activeDataLayer);
  useEffect(() => { activeDataLayerRef.current = activeDataLayer; }, [activeDataLayer]);
  const chlDataRef = useRef(chlData);
  useEffect(() => { chlDataRef.current = chlData; }, [chlData]);
  const chlDateIndexRef = useRef(chlDateIndex);
  useEffect(() => { chlDateIndexRef.current = chlDateIndex; }, [chlDateIndex]);
  const seaColorDataRef = useRef(seaColorData);
  useEffect(() => { seaColorDataRef.current = seaColorData; }, [seaColorData]);
  const seaColorDateIndexRef = useRef(seaColorDateIndex);
  useEffect(() => { seaColorDateIndexRef.current = seaColorDateIndex; }, [seaColorDateIndex]);
  const windDataRef = useRef(windData); useEffect(() => { windDataRef.current = windData; }, [windData]);
  const windHourIndexRef = useRef(windHourIndex); useEffect(() => { windHourIndexRef.current = windHourIndex; }, [windHourIndex]);
  const isWindMapRef = useRef(false); useEffect(() => { isWindMapRef.current = (activeDataLayer === "windmap"); }, [activeDataLayer]);
  const showWindOverlayRef = useRef(false); useEffect(() => { showWindOverlayRef.current = showWindOverlay; }, [showWindOverlay]);
  const currentsDataRef  = useRef(currentsData);  useEffect(() => { currentsDataRef.current = currentsData; }, [currentsData]);
  const showCurrentsRef  = useRef(false);          useEffect(() => { showCurrentsRef.current = showCurrents; }, [showCurrents]);
  const compositeDataRef=useRef(compositeData);useEffect(()=>{compositeDataRef.current=compositeData;},[compositeData]);
  const altimetryDataRef=useRef(altimetryData);useEffect(()=>{altimetryDataRef.current=altimetryData;},[altimetryData]);
  const sstLatSetRef=useRef(latSet);useEffect(()=>{sstLatSetRef.current=latSet;},[latSet]);
  const sstLonSetRef=useRef(lonSet);useEffect(()=>{sstLonSetRef.current=lonSet;},[lonSet]);
  const sstGridRef=useRef(grid);useEffect(()=>{sstGridRef.current=grid;},[grid]);
  const sstReadyRef = useRef(false);
  const userInteractedRef = useRef(false);

  // Fetch compositeDate locally so it's colocated with the hotspot consumer
  const [compositeDate, setCompositeDateLocal] = useState(null);
  useEffect(() => {
    fetch(`${VIIRS_CDN_BASE_R}/viirs_index.json`)
      .then(r => r.json())
      .then(d => {
        const dates = d.dates;
        const lastDate = Array.isArray(dates) && dates.length > 0
          ? dates[dates.length - 1]
          : null;
        console.log("[HEATMAP] compositeDate from index:", lastDate);
        setCompositeDateLocal(lastDate);
      })
      .catch(e => console.error("[HEATMAP] compositeDate fetch failed:", e));
  }, []);

  const [showSSTLayer]    = useState(true);
  const [showBathyLayer,  setShowBathyLayer]  = useState(true);
  const [showRadarOverlay, setShowRadarOverlay] = useState(false);
  const [radarFrames, setRadarFrames] = useState([]);   // [{time, path}] from RainViewer, oldest -> newest
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [radarHost, setRadarHost] = useState("");
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [showBathyRaster, setShowBathyRaster] = useState(false);
  const [showWrecks,      setShowWrecks]      = useState(false);
  const [showBuoys,       setShowBuoys]       = useState(false);
  const [buoysData,       setBuoysData]       = useState(null);
  const [buoysLoading,    setBuoysLoading]    = useState(false);
  const [bathyData,       setBathyData]       = useState(null);
  const bathyDataRef = useRef(null);
  // Precomputed open-ocean mask (static, /openocean_mask.json): 1 = open Atlantic/shelf,
  // 0 = sounds/bays/rivers/land. Built offline from GEBCO via morphological opening
  // (sever narrow inlets) + bay polygons. Coarse 0.125deg altimetry otherwise bleeds
  // across the barrier islands into the sounds where sea-level anomaly isn't meaningful.
  const openOceanRef = useRef(null);
  const [openOceanVersion, setOpenOceanVersion] = useState(0);
  function altimetryDeepMask(lat, lon) {
    const f = openOceanRef.current;
    if (!f) return true;            // mask not loaded yet -> don't clip
    return f(lat, lon);
  }
  useEffect(() => {
    let cancelled = false;
    const suffix = regionConfig?.dataPathSuffix ?? "";
    const tryUrls = suffix
      ? [`/openocean_mask_${suffix}.json`, "/openocean_mask.json"]
      : ["/openocean_mask.json"];
    (async () => {
      let obj = null;
      for (const url of tryUrls) {
        try { const r = await fetch(url, { cache: "no-store" }); if (r.ok) { obj = await r.json(); break; } } catch(e) {}
      }
      if (cancelled || !obj) return;
      const { bounds, step, rows, cols, packed } = obj;
      const bin = atob(packed); const bits = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
      openOceanRef.current = (lat, lon) => {
        const ri = Math.round((bounds.n - lat) / step);
        const ci = Math.round((lon - bounds.w) / step);
        if (ri < 0 || ri >= rows || ci < 0 || ci >= cols) return true; // outside mask bounds = open ocean (other regions)
        const idx = ri * cols + ci;
        return (bits[idx >> 3] & (0x80 >> (idx & 7))) !== 0;
      };
      setOpenOceanVersion(v => v + 1);
    })();
    return () => { cancelled = true; };
  }, [regionConfig?.dataPathSuffix]);
  const [jsonContours,     setJsonContours]     = useState(null);
  const [jsonContoursLoading, setJsonContoursLoading] = useState(false);
  const [wrecksData,       setWrecksData]       = useState(null);
  const [wrecksLoading,    setWrecksLoading]    = useState(false);
  const [clickInfo,        setClickInfo]        = useState(null);
  const [hoverInfo,        setHoverInfo]        = useState(null);
  const [markers,          setMarkers]          = useState([]);
  const [selectedMarker,   setSelectedMarker]   = useState(null);
  const [savedWreckKeys,   setSavedWreckKeys]   = useState(new Set());
  const [hoveredWreck,     setHoveredWreck]     = useState(null);
  const [buoyPopup,        setBuoyPopup]        = useState(null);
  const [mapReady,         setMapReady]         = useState(false);
  const [sstReady,         setSstReady]         = useState(false);
  const waterMaskRef  = useRef(null);
  const glLayerRef = useRef(null);
  const [waterMaskVersion, setWaterMaskVersion] = useState(0);
  const [repaintTrigger,   setRepaintTrigger]   = useState(0);
  const maskBuildStartedRef = useRef(false);
  const controlPanelRef  = useRef(null);
  const isOverControlPanel = useRef(false);
  const [hotspotPopup,         setHotspotPopup]         = useState(null); // { html, cloudWarning, x, y }
  const [hotspotWarningOpen,   setHotspotWarningOpen]   = useState(false);
  const [showIsotherm,         setShowIsotherm]         = useState(false);
  const [showAltimetryOverlay, setShowAltimetryOverlay] = useState(false);
  const [showLoranGrid, setShowLoranGrid] = useState(() => localStorage.getItem("show_loran_grid") === "true");
  const [showLoranWFamily, setShowLoranWFamily] = useState(() => localStorage.getItem("show_loran_w_family") === "true");
  const [loranHelpOpen, setLoranHelpOpen] = useState(false);
  const [showCanyonLabels, setShowCanyonLabels] = useState(true);
  const [isothermalTargetTemp, setIsothermalTargetTemp] = useState(76);
  const [isothermalSensitivity,setIsothermalSensitivity]= useState(2.0);
  const effectiveTargetTemp = isothermalTargetTemp ?? Math.round((sstMin + sstMax) / 2);
  const [interactionMode, setInteractionMode] = useState("pan");
  const interactionModeRef = useRef("pan");
  const tripModeRef        = useRef(false);
  const tripLayerRef       = useRef(null);
  const waypointsRef       = useRef([]);
  const [touchMarker, setTouchMarker] = useState(null);

  // ── Community pins ────────────────────────────────────────────────
  const communityMarkersRef                     = useRef([]);
  const communityPinDropRef                     = useRef(null);
  useEffect(() => {
    communityPinDropRef.current = communityPinDrop;
    const el = mapDivRef.current;
    if (el) el.style.cursor = communityPinDrop ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\'%3E%3Cline x1=\'10\' y1=\'0\' x2=\'10\' y2=\'20\' stroke=\'%23000\' stroke-width=\'3\'/%3E%3Cline x1=\'0\' y1=\'10\' x2=\'20\' y2=\'10\' stroke=\'%23000\' stroke-width=\'3\'/%3E%3Cline x1=\'10\' y1=\'0\' x2=\'10\' y2=\'20\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3Cline x1=\'0\' y1=\'10\' x2=\'20\' y2=\'10\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3C/svg%3E") 10 10, crosshair' : "";
  }, [communityPinDrop]);
  const [selectedCommunityPin, setSelectedCommunityPin] = useState(null); // { pin, px, py }
  const [deletingPinId,        setDeletingPinId]        = useState(null); // pin.id currently being deleted (disables the button mid-request)
  const [savedCommunityPins,   setSavedCommunityPins]   = useState(new Set()); // set of pin ids saved this session

  // Soft-delete: sets expires_at to now() rather than a hard DELETE. Reuses
  // the existing self-serve "cl_update" RLS policy (auth.uid() = user_id) --
  // no new DELETE policy needed -- and plugs straight into infrastructure
  // that already exists for normal expiry: cl_read's SELECT policy already
  // excludes expires_at <= now(), and the daily cleanup-expired-community-
  // photos cron job will pick up and remove any attached photos on its next
  // run, exactly like a naturally-expired pin. A hard DELETE would skip
  // that cron path and leak the photos in storage. Only ever reachable from
  // the UI when pin.is_own is true (server-computed per-viewer by the
  // community_locations_public view, since it never exposes user_id itself).
  async function handleDeletePin(pin) {
    if (!pin?.is_own) return;
    if (!window.confirm("Delete this report? This can't be undone.")) return;
    setDeletingPinId(pin.id);
    try {
      const { error } = await supabase
        .from("community_locations")
        .update({ expires_at: new Date().toISOString() })
        .eq("id", pin.id);
      if (error) throw error;
      setSelectedCommunityPin(null);
      onCommunityDeleted?.();
    } catch (err) {
      console.error("[SSTHeatmapLeaflet] delete report failed:", err);
      window.alert("Couldn't delete this report. Please try again.");
    } finally {
      setDeletingPinId(null);
    }
  }
  const [communityTipModal,    setCommunityTipModal]    = useState(null); // { pin }
  const [thankingId,           setThankingId]           = useState(null);
  const [imageLightbox,        setImageLightbox]        = useState(null); // { urls: string[], index: number }
  const communityCardElRef = useRef(null);
  // Position the community pin card using its *actual* rendered height. Text content is
  // synchronous, but an attached photo loads asynchronously (can take several seconds on a
  // slow mobile connection) and grows the card after this first measurement — so this alone
  // is only the initial placement; the photo's onLoad/onError below re-runs it once the real
  // height is known, instead of relying on some unrelated re-render to happen to fix it later.
  function repositionCommunityCard() {
    const el = communityCardElRef.current;
    if (!el || !selectedCommunityPin) return;
    const { py } = selectedCommunityPin;
    const h = el.offsetHeight;
    const mapH = mapDivRef.current?.clientHeight ?? 600;
    const top = Math.max(8, Math.min(py - 40, mapH - h - 8));
    el.style.top = `${top}px`;
  }
  useLayoutEffect(() => {
    repositionCommunityCard();
  }, [selectedCommunityPin]);

  function speciesColor(sp) {
    const m = { yellowfin:"#0891b2", blackfin:"#0e7490", bluefin:"#1d4ed8",
                mahi:"#15803d", white_marlin:"#7c3aed", blue_marlin:"#4f46e5", wahoo:"#0f766e" };
    return m[sp] || "#64748b";
  }

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    communityMarkersRef.current.forEach(m => { try { m.remove(); } catch (_) {} });
    communityMarkersRef.current = [];
    if (!showCommunityLayer || !communityLocations?.length) return;

    communityLocations.forEach(loc => {
      const isLive    = loc.type === "live";
      // Pulse + live coloring only for the first 48h after creation. After
      // that, a live pin renders identically to a Post-Trip Report (cyan,
      // small dot) while staying visible for the rest of its 7-day life —
      // it never just disappears.
      const isPulsing   = isLive && (Date.now() - new Date(loc.created_at).getTime()) < 48 * 3600000;
      const isLiveActive = isPulsing; // alias for readability below
      const color  = isLiveActive ? "#84cc16" : "#00d4ff";
      const html = isLiveActive
        ? `<div style="position:relative;width:24px;height:24px;"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(255,255,255,0.75);animation:community-pulse 1.8s ease-out infinite;"></div><div style="position:absolute;top:6px;left:6px;width:12px;height:12px;border-radius:50%;background:#84cc16;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div></div>`
        : `<div style="width:12px;height:12px;border-radius:50%;background:#00d4ff;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>`;
      const icon   = L.divIcon({ className: "", iconSize: isLiveActive ? [24,24] : [12,12], iconAnchor: isLiveActive ? [12,12] : [6,6], html });
      const marker = L.marker([loc.lat, loc.lon], { icon, zIndexOffset: 950 });
      marker.on("click", e => {
        L.DomEvent.stopPropagation(e);
        if (tripModeRef.current) {
          onAddWaypoint?.(loc.lat, loc.lon, loc.display_name || "Community Pin");
          return;
        }
        const pt = map.latLngToContainerPoint([loc.lat, loc.lon]);
        setSelectedCommunityPin({ pin: loc, px: pt.x, py: pt.y });
      });
      marker.addTo(map);
      communityMarkersRef.current.push(marker);
    });

    return () => {
      communityMarkersRef.current.forEach(m => { try { m.remove(); } catch (_) {} });
      communityMarkersRef.current = [];
    };
  }, [mapReady, communityLocations, showCommunityLayer]); // eslint-disable-line react-hooks/exhaustive-deps

  const [wpDeletePopup,    setWpDeletePopup]    = useState(null); // {id, label, px, py}
  const [boatPopupOpen,    setBoatPopupOpen]    = useState(false); // boat-click nav popup
  const [endTripConfirm,   setEndTripConfirm]   = useState(false); // near final WP prompt

  // Community live dots — keyed by user_id
  // Each entry: { user_id, display_name, lat, lon, heading, speed_kts, updated_at, trail: [[lat,lon],...] }
  const [liveDots,         setLiveDots]         = useState({});
  const liveDotsRef        = useRef({});   // mutable ref for stale-check interval

  // ── GPS boat marker ──────────────────────────────────────────────
  const boatMarkerRef = useRef(null);
  const boatTrackLineRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (!gpsActive || !boatPosition) {
      if (boatMarkerRef.current) { boatMarkerRef.current.remove(); boatMarkerRef.current = null; }
      return;
    }
    const hdg = boatPosition.heading ?? 0;
    const icon = L.divIcon({
      className: "",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <g transform="rotate(${hdg},16,16)">
          <polygon points="16,3 24,26 16,21 8,26" fill="#06b6d4" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
          <circle cx="16" cy="16" r="2.5" fill="white" opacity="0.8"/>
        </g>
      </svg>`
    });
    if (boatMarkerRef.current) {
      boatMarkerRef.current.setLatLng([boatPosition.lat, boatPosition.lon]);
      boatMarkerRef.current.setIcon(icon);
    } else {
      boatMarkerRef.current = L.marker([boatPosition.lat, boatPosition.lon], { icon, zIndexOffset: 1500 }).addTo(map);
      boatMarkerRef.current.on("click", () => setBoatPopupOpen(v => !v));
    }
  }, [gpsActive, boatPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Waypoint auto-advance + end-trip detection ──────────────────────────
  const PROX_NM = 0.25; // threshold: advance when within 0.25 nm of target WP
  useEffect(() => {
    if (!navigatingRoute || !boatPosition || !waypoints?.length) return;
    const targetWp = waypoints[currentWpIndex];
    if (!targetWp) return;

    const dist = navHaversineNm(boatPosition.lat, boatPosition.lon, targetWp.lat, targetWp.lng);

    if (dist <= PROX_NM) {
      const isLast = currentWpIndex >= waypoints.length - 1;
      if (isLast) {
        // Reached final waypoint — prompt to end trip
        if (!endTripConfirm) setEndTripConfirm(true);
      } else {
        // Auto-advance to next waypoint
        setCurrentWpIndex(i => i + 1);
      }
    }
  }, [boatPosition, navigatingRoute, currentWpIndex, waypoints]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (!gpsActive || !boatTrack || boatTrack.length < 2) {
      if (boatTrackLineRef.current) { boatTrackLineRef.current.remove(); boatTrackLineRef.current = null; }
      return;
    }
    if (boatTrackLineRef.current) {
      boatTrackLineRef.current.setLatLngs(boatTrack);
    } else {
      boatTrackLineRef.current = L.polyline(boatTrack, {
        color: "#06b6d4", weight: 2, opacity: 0.55, dashArray: "5 5"
      }).addTo(map);
    }
  }, [gpsActive, boatTrack]);

  useEffect(() => {
    return () => {
      if (boatMarkerRef.current) { boatMarkerRef.current.remove(); boatMarkerRef.current = null; }
      if (boatTrackLineRef.current) { boatTrackLineRef.current.remove(); boatTrackLineRef.current = null; }
    };
  }, []);
  const [showSavedPanel,    setShowSavedPanel]    = useState(false);
  const [savedRoutesCount, setSavedRoutesCount] = useState(0);
  useEffect(() => {
    supabase.from("saved_routes").select("id", { count: "exact", head: true })
      .then(({ count }) => { if (count != null) setSavedRoutesCount(count); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [panelCollapsed,  setPanelCollapsed] = useState(false);
  const [mobilePanel,     setMobilePanel]     = useState(null); // null | "sst" | "chl" | "seacolor" | "wind" | "tools"
  const [showMobileSourceNav, setShowMobileSourceNav] = useState(false); // compact day/hour bar shown after picking a secondary source (SST/CHL/Sea Color), replaces the full drawer
  const [showMobileHelp, setShowMobileHelp] = useState(false);
  const [shareLocation,   setShareLocation]   = useState(null);

  // ── Trip mode ref sync ───────────────────────────────────────────────────────
  useEffect(() => { waypointsRef.current = waypoints || []; }, [waypoints]);

  // ── Community live-dot Realtime subscription ──────────────────────────────
  useEffect(() => {
    // Subscribe to live_locations table changes
    const channel = supabase
      .channel("live_locations_broadcast")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_locations",
      }, payload => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        const uid = row.user_id;

        if (payload.eventType === "DELETE" || row.sharing_active === false) {
          setLiveDots(prev => {
            const next = { ...prev };
            delete next[uid];
            liveDotsRef.current = next;
            return next;
          });
          return;
        }

        // Skip own position
        if (uid === userId) return;

        setLiveDots(prev => {
          const existing = prev[uid];
          const now = Date.now();
          const TRAIL_MS = 5 * 60 * 1000; // 5-minute rolling window

          // Append new point to trail, trim old points
          const newPt = [row.lat, row.lon];
          const prevTrail = existing?.trail ?? [];
          const trail = [
            ...prevTrail.filter(p => p[2] && now - p[2] < TRAIL_MS),
            [row.lat, row.lon, now],
          ];

          const next = {
            ...prev,
            [uid]: {
              user_id:      uid,
              display_name: row.display_name || "Angler",
              lat:          row.lat,
              lon:          row.lon,
              heading:      row.heading,
              speed_kts:    row.speed_kts,
              updated_at:   row.updated_at,
              trail,
            },
          };
          liveDotsRef.current = next;
          return next;
        });
      })
      .subscribe();

    // Stale-dot cleanup: check every 30 seconds, hide after 5 min no update
    const staleInterval = setInterval(() => {
      const STALE_MS = 5 * 60 * 1000;
      const now = Date.now();
      setLiveDots(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(uid => {
          const lastUpdate = new Date(next[uid].updated_at).getTime();
          if (now - lastUpdate > STALE_MS) {
            delete next[uid];
            changed = true;
          }
        });
        if (changed) { liveDotsRef.current = next; return next; }
        return prev;
      });
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(staleInterval);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tripModeRef.current = !!tripMode;
    const map = mapRef.current; if (!map) return;
    const c = map.getContainer();
    c.style.cursor = tripMode ? "crosshair" : "";
  }, [tripMode]);

  // ── Community live-dot Leaflet layer ─────────────────────────────────────────
  // Managed imperatively (L.marker + L.polyline) so dots follow map pan/zoom.
  const liveDotMarkersRef = useRef({}); // uid → L.marker
  const liveDotTrailsRef  = useRef({}); // uid → L.polyline

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const dots = liveDots;
    const currentUids = new Set(Object.keys(dots));

    // Remove markers/trails for users no longer in liveDots
    Object.keys(liveDotMarkersRef.current).forEach(uid => {
      if (!currentUids.has(uid)) {
        liveDotMarkersRef.current[uid]?.remove();
        liveDotTrailsRef.current[uid]?.remove();
        delete liveDotMarkersRef.current[uid];
        delete liveDotTrailsRef.current[uid];
      }
    });

    // Add or update markers for each live dot
    Object.values(dots).forEach(dot => {
      const uid = dot.user_id;
      const hdg = dot.heading ?? 0;
      const label = `${dot.display_name}${dot.speed_kts != null ? " · " + dot.speed_kts + " kts" : ""}`;

      const icon = L.divIcon({
        className: "",
        iconSize:   [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="position:relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
            <g transform="rotate(${hdg},14,14)">
              <polygon points="14,2 20,22 14,18 8,22" fill="#f59e0b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
              <circle cx="14" cy="14" r="2" fill="white" opacity="0.9"/>
            </g>
          </svg>
          <div style="position:absolute;left:18px;top:6px;background:rgba(15,23,42,0.82);color:#fcd34d;
                      font:700 9px/1.3 ui-monospace,monospace;border-radius:4px;padding:2px 5px;
                      white-space:nowrap;pointer-events:none">${label}</div>
        </div>`,
      });

      if (liveDotMarkersRef.current[uid]) {
        liveDotMarkersRef.current[uid].setLatLng([dot.lat, dot.lon]);
        liveDotMarkersRef.current[uid].setIcon(icon);
      } else {
        liveDotMarkersRef.current[uid] = L.marker([dot.lat, dot.lon], {
          icon, zIndexOffset: 1400,
        }).addTo(map);
      }

      // Trail polyline (5-min rolling window — points have [lat, lon, timestamp])
      const TRAIL_MS = 5 * 60 * 1000;
      const now = Date.now();
      const trailPts = (dot.trail ?? [])
        .filter(p => p[2] && now - p[2] < TRAIL_MS)
        .map(p => [p[0], p[1]]);

      if (trailPts.length >= 2) {
        if (liveDotTrailsRef.current[uid]) {
          liveDotTrailsRef.current[uid].setLatLngs(trailPts);
        } else {
          liveDotTrailsRef.current[uid] = L.polyline(trailPts, {
            color: "#f59e0b", weight: 2, opacity: 0.55, dashArray: "5 4",
          }).addTo(map);
        }
      } else if (liveDotTrailsRef.current[uid]) {
        liveDotTrailsRef.current[uid].remove();
        delete liveDotTrailsRef.current[uid];
      }
    });
  }, [liveDots, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up live dot markers/trails on unmount
  useEffect(() => {
    return () => {
      Object.values(liveDotMarkersRef.current).forEach(m => m?.remove());
      Object.values(liveDotTrailsRef.current).forEach(t => t?.remove());
    };
  }, []);

  // ── Waypoint layer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (!tripLayerRef.current) {
      tripLayerRef.current = L.layerGroup().addTo(map);
    }
    const layer = tripLayerRef.current;
    layer.clearLayers();
    if (!waypoints || waypoints.length === 0) return;

    const latlngs = waypoints.map(w => [w.lat, w.lng]);
    L.polyline(latlngs, { color: "#06b6d4", weight: 2.5, opacity: 0.85, dashArray: "6 5", interactive: false })
      .addTo(layer);

    waypoints.forEach((wp, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#06b6d4;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;line-height:1;">${i + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([wp.lat, wp.lng], { icon, draggable: true, zIndexOffset: 1000 }).addTo(layer);
      marker.on("dragend", (e) => {
        const { lat, lng } = e.target.getLatLng();
        onMoveWaypoint?.(wp.id, lat, lng);
      });
      // Block click propagation to the map.
      // • Departure (i=0) with ≥2 waypoints → trigger end-trip prompt
      // • All other waypoints → show inline delete popup
      const handleWpClick = () => {
        if (i === 0 && waypoints.length >= 2) {
          onEndTripAtDeparture?.();
        } else if (i > 0) {
          const containerPt = map.latLngToContainerPoint([wp.lat, wp.lng]);
          setWpDeletePopup({ id: wp.id, label: wp.label || `WP ${i + 1}`, px: containerPt.x, py: containerPt.y });
        }
      };
      marker.on("click", (e) => { L.DomEvent.stopPropagation(e); handleWpClick(); });
      marker.on("touchstart", (e) => { L.DomEvent.stopPropagation(e); L.DomEvent.preventDefault(e); handleWpClick(); });
    });
  }, [waypoints, tripMode, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup trip layer on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (tripLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(tripLayerRef.current);
        tripLayerRef.current = null;
      }
    };
  }, []);

  const isWindMap  = activeDataLayer === "windmap";
  const windActive = showWindOverlay || isWindMap;
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 640);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (!savedLocations) return;
    setMarkers(prev => {
      const next = savedLocations.map(loc => ({
        id: loc.id, lat: parseFloat(loc.lat), lon: parseFloat(loc.lon),
        sst: loc.sst != null ? parseFloat(loc.sst) : null,
        depth_ft: loc.depth_ft != null ? parseFloat(loc.depth_ft) : null,
        label: loc.label, notes: loc.notes ?? null, dist_nm: loc.dist_nm,
        bearing_deg: loc.bearing_deg, bearing_cardinal: loc.bearing_cardinal,
        from_location: loc.from_location,
      }));
      const knownIds = new Set(next.map(m => m.id));
      prev.forEach(m => { if (m.id && !knownIds.has(m.id)) next.push(m); });
      return next;
    });
  }, [savedLocations]);

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = L.map(mapDivRef.current, {
      zoomControl: true, attributionControl: false,
      maxBounds: llBounds, maxBoundsViscosity: 1.0,
      worldCopyJump: false, preferCanvas: true,
      zoomSnap: 0, zoomDelta: 0.25,
      keyboard: false,
    });

    // Layer stacking: keep bathymetry directly above the data raster (SST / CHL /
    // sea color) but below all other overlays, markers, labels and tools.
    //   tilePane 200 (GL basemap+SST in GL mode) < sstDataPane 350 (non-GL data
    //   raster) < bathyPane 375 < overlayPane 400 (wind/currents/contours) <
    //   markerPane 600 (locations/wrecks/buoys/labels/tools).
    map.createPane("sstDataPane"); map.getPane("sstDataPane").style.zIndex = "350"; map.getPane("sstDataPane").style.pointerEvents = "none";
    map.createPane("bathyTilePane"); map.getPane("bathyTilePane").style.zIndex = "362"; map.getPane("bathyTilePane").style.pointerEvents = "none";
    map.createPane("bathyPane");   map.getPane("bathyPane").style.zIndex   = "375"; map.getPane("bathyPane").style.pointerEvents   = "none";
    // radarPane sits at the same level as bathyTilePane (both are full basemap-replace
    // raster layers, mutually exclusive with each other and with SST/CHL/composite),
    // below bathyPane (contour lines, 375) and markerPane (pins/labels, 600).
    map.createPane("radarPane");   map.getPane("radarPane").style.zIndex   = "362"; map.getPane("radarPane").style.pointerEvents = "none";
    // RainViewer tiles cap out at native zoom 7 and look blocky once the map is
    // zoomed in past that -- a slight blur on the whole pane (not the basemap below
    // it) softens the hard pixel edges, closer to how Windy/most radar apps render.
    map.getPane("radarPane").style.filter = "blur(1.2px)";

    // Prevent Leaflet from intercepting spacebar when the user is typing in an input/textarea
    const stopSpaceInInputs = (e) => {
      if (e.key === " " || e.code === "Space") {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") e.stopPropagation();
      }
    };
    document.addEventListener("keydown", stopSpaceInInputs, true);
    map.on("remove", () => document.removeEventListener("keydown", stopSpaceInInputs, true));
    glLayerRef.current = createGlBasemap(map);
    if (glLayerRef.current) {
      installLandMaskRefresh(map, glLayerRef.current);
    } else {
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: "abcd", maxZoom: 19,
      }).addTo(map);
    }
    // Initialize map with a rough view immediately so _checkIfLoaded never throws
    // before the proper fill-zoom rAF runs.
    try { map.setView(mercCenter, 5, { animate: false }); } catch(_) {}

    const calcFillZoom = (cw, ch) => {
      const _mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
      const _mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
      const _mH = _mN - _mS, _lR = regionBounds.east - regionBounds.west;
      return Math.max(Math.log2((cw * 360)/(256*_lR)), Math.log2((ch * 2*Math.PI)/(256*_mH)));
    };
    const applyFillZoom = () => {
      // Once data has rendered and sstReady=true, the view is correctly locked.
      // Skip to prevent applyFillZoom from shifting mercCenter northward past data boundary.
      if (sstReadyRef.current) return;
      try {
        map.invalidateSize();
        const sz = map.getSize();
        const vpH = window.visualViewport?.height || window.innerHeight || 0;
        const _cw = sz.x || 800;
        // Use actual container height; fall back to visual viewport height, then 500
        const _ch = sz.y || vpH || 500;
        const fillZoom = calcFillZoom(_cw, _ch);
        const curZoom = map.getZoom();
        // Always setView on first call (curZoom is NaN); skip on repeat calls if zoom is already correct
        if (!isFinite(curZoom) || Math.abs(curZoom - fillZoom) > 0.05) {
          map.setView(mercCenter, fillZoom, { animate: false });
        }
        // Post-check: if view still shows outside north/south, bump zoom until it doesn't
        // Use setView (not setZoom) to keep center locked at mercCenter during adjustment
        let guard = 0;
        while (guard++ < 10) {
          const vb = map.getBounds();
          if (vb.getNorth() <= regionBounds.north + 0.05 && vb.getSouth() >= regionBounds.south - 0.05) break;
          map.setView(mercCenter, map.getZoom() + 0.1, { animate: false });
        }
        map.setMinZoom(map.getZoom()); map.setMaxZoom(glLayerRef.current ? 20 : 12); map.setMaxBounds(llBounds);
      } catch(_) {}
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      applyFillZoom(); setTimeout(applyFillZoom, 300); setTimeout(applyFillZoom, 800); setTimeout(applyFillZoom, 1800);
    }));
    map.on("drag", () => { map.panInsideBounds(llBounds, { animate: false }); });

    map.on("click", (e) => {
      if (communityPinDropRef.current) {
        const { lat, lng: lon } = e.latlng;
        onCommunityPinDropped?.(lat, lon, communityPinDropRef.current);
        return;
      }
      if (tripModeRef.current) {
        const { lat, lng } = e.latlng;
        // Check if clicking near departure (waypoint 1) to offer "end trip"
        const wps = waypointsRef.current;
        if (wps && wps.length >= 2) {
          const dep = wps[0];
          const dist = Math.sqrt((lat - dep.lat) ** 2 + (lng - dep.lng) ** 2);
          if (dist < 0.08) { onEndTripAtDeparture?.(); return; }
        }
        onAddWaypoint?.(lat, lng);
        return;
      }
      if (interactionModeRef.current !== "crosshair") return;
      if (selectedMarker) { setSelectedMarker(null); return; }
      const { lat, lng: lon } = e.latlng;
      if (lon < regionBounds.west || lon > regionBounds.east || lat < regionBounds.south || lat > regionBounds.north) return;
      let sst = null;
      if (sstLatSetRef.current.length > 0 && sstLonSetRef.current.length > 0) {
        const nearLat = sstLatSetRef.current.reduce((a,b)=>Math.abs(b-lat)<Math.abs(a-lat)?b:a);
        const nearLon = sstLonSetRef.current.reduce((a,b)=>Math.abs(b-lon)<Math.abs(a-lon)?b:a);
        sst = sstGridRef.current[`${nearLat}_${nearLon}`] ?? null;
      }
      let depth_ft = null;
      if (bathyDataRef.current?.points?.length) {
        let best=null,bestDist=Infinity;
        for(const pt of bathyDataRef.current.points){const d=(pt.lat-lat)**2+(pt.lon-lon)**2;if(d<bestDist){bestDist=d;best=pt;}}
        depth_ft = best?.depth_ft ?? null;
      }
      let sla_m = null;
      if (activeDataLayerRef.current === "altimetry" && altimetryDataRef.current) {
        const alt = altimetryDataRef.current;
        if (alt.lats?.length && alt.lons?.length && alt.sla) {
          const li = alt.lats.reduce((bi,v,i)=>Math.abs(v-lat)<Math.abs(alt.lats[bi]-lat)?i:bi, 0);
          const lj = alt.lons.reduce((bj,v,j)=>Math.abs(v-lon)<Math.abs(alt.lons[bj]-lon)?j:bj, 0);
          const row = alt.sla[li]; if (row) sla_m = row[lj] ?? null;
        }
      }
      const refLoc = selectedLocationRef.current;
      const containerPt = map.latLngToContainerPoint(e.latlng);
      setClickInfo({ lat, lon, sst, depth_ft, sla_m,
        dist: refLoc ? distanceNm(refLoc.lat, refLoc.lon, lat, lon) : null,
        bearing: refLoc ? bearingDeg(refLoc.lat, refLoc.lon, lat, lon) : null,
        locationLabel: refLoc?.label ?? null, px: containerPt.x, py: containerPt.y,
      });
    });

    map.on("mousemove", (e) => {
      if (interactionModeRef.current === "pan") { setHoverInfo(null); onHoverSst?.(null); return; }
      if (isOverControlPanel.current) { setHoverInfo(null); onHoverSst?.(null); return; }
      const { lat, lng: lon } = e.latlng;
      if (lon < regionBounds.west || lon > regionBounds.east || lat < regionBounds.south || lat > regionBounds.north) {
        setHoverInfo(null); onHoverSst?.(null); return;
      }
      let sst = null;
      if (sstLatSetRef.current.length > 0 && sstLonSetRef.current.length > 0) {
        const nearLat = sstLatSetRef.current.reduce((a,b)=>Math.abs(b-lat)<Math.abs(a-lat)?b:a);
        const nearLon = sstLonSetRef.current.reduce((a,b)=>Math.abs(b-lon)<Math.abs(a-lon)?b:a);
        sst = sstGridRef.current[`${nearLat}_${nearLon}`] ?? null;
      }
      if (activeDataLayerRef.current === "composite") { console.log("[COMP]", !!compositeDataRef.current, compositeDataRef.current?.sst?.length, compositeDataRef.current?.latSet?.length); }
      if (activeDataLayerRef.current === "composite" && compositeDataRef.current?.sst?.length) {
        const cd = compositeDataRef.current;
        const nL = cd.lonSet.length;
        let li = 0, ld = Infinity;
        cd.latSet.forEach((la, i) => { const d = Math.abs(la - lat); if (d < ld) { ld = d; li = i; } });
        let loi = 0, lod = Infinity;
        cd.lonSet.forEach((lo, i) => { const d = Math.abs(lo - lon); if (d < lod) { lod = d; loi = i; } });
        sst = cd.sst[li * nL + loi] ?? null;
      }
      let depth_ft = null;
      if (bathyDataRef.current?.points?.length) {
        let best=null,bestDist=Infinity;
        for(const pt of bathyDataRef.current.points){const d=(pt.lat-lat)**2+(pt.lon-lon)**2;if(d<bestDist){bestDist=d;best=pt;}}
        depth_ft = best?.depth_ft ?? null;
      }
      let chl=null,color_class=null,kd490=null;
      const adl = activeDataLayerRef.current;
      if (adl==="chlorophyll"&&chlDataRef.current?.days?.length){const day=chlDataRef.current.days[chlDateIndexRef.current]||chlDataRef.current.days[chlDataRef.current.days.length-1];if(day?.grid?.length){const BIN=0.02;const nLat=Math.round(lat/BIN)*BIN,nLon=Math.round(lon/BIN)*BIN;const pt=day.grid.find(p=>Math.abs(p.lat-nLat)<BIN&&Math.abs(p.lon-nLon)<BIN);chl=pt?.chlorophyll??null;color_class=pt?.color_class??null;}}
      else if(adl==="seacolor"&&seaColorDataRef.current?.days?.length){const day=seaColorDataRef.current.days[seaColorDateIndexRef.current]||seaColorDataRef.current.days[seaColorDataRef.current.days.length-1];if(day?.grid?.length){let best=null,bestDist=Infinity;for(const p of day.grid){const d=(p.lat-lat)**2+(p.lon-lon)**2;if(d<bestDist){bestDist=d;best=p;}}kd490=(best&&Math.sqrt(bestDist)<0.15)?best.kd490??null:null;}}
      let windSpeed_kt = null, windDir_deg = null;
      if ((isWindMapRef.current || showWindOverlayRef.current) && windDataRef.current?.hours?.length) {
        const wHour = windDataRef.current.hours[windHourIndexRef.current] ?? windDataRef.current.hours[0];
        if (wHour?.grid?.length) {
          let best = null, bestDist = Infinity;
          for (const p of wHour.grid) { const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2; if (d < bestDist) { bestDist = d; best = p; } }
          if (best) { windSpeed_kt = best.speed ?? Math.sqrt((best.u||0)**2+(best.v||0)**2); windDir_deg = (Math.atan2(-(best.u||0), -(best.v||0)) * 180 / Math.PI + 360) % 360; }
        } else if (wHour?.velocityJSON) {
          const w = windFromVelocityJSON(wHour.velocityJSON, lat, lon);
          if (w) { windSpeed_kt = w.speed; windDir_deg = w.dir; }
        }
      }
      const refLoc = selectedLocationRef.current;
      const containerPt = map.latLngToContainerPoint(e.latlng);
      // Currents lookup (same grid format as wind)
      let currSpeed_ms = null, currDir_deg = null;
      if (showCurrentsRef.current && currentsDataRef.current?.hours?.length) {
        const ch = currentsDataRef.current.hours[0];
        if (ch?.grid?.length) {
          let best = null, bestDist = Infinity;
          for (const p of ch.grid) { const d = (p.lat-lat)**2+(p.lon-lon)**2; if (d<bestDist){bestDist=d;best=p;} }
          if (best) { currSpeed_ms = best.speed_ms ?? Math.sqrt((best.u||0)**2+(best.v||0)**2); currDir_deg = best.dir_deg ?? (Math.atan2(best.u||0, best.v||0)*180/Math.PI+360)%360; }
        }
      }
      // Altimetry lookup
      let sla_m = null;
      if (activeDataLayerRef.current === "altimetry" && altimetryDataRef.current) {
        const alt = altimetryDataRef.current;
        if (alt.lats && alt.lons && alt.sla) {
          const li = alt.lats.reduce((bi,v,i)=>Math.abs(v-lat)<Math.abs(alt.lats[bi]-lat)?i:bi,0);
          const lj = alt.lons.reduce((bj,v,j)=>Math.abs(v-lon)<Math.abs(alt.lons[bj]-lon)?j:bj,0);
          const row = alt.sla[li]; if (row) sla_m = row[lj] ?? null;
        }
      }
      setHoverInfo({ px: containerPt.x, py: containerPt.y, sst, depth_ft, chl, color_class, kd490, windSpeed_kt, windDir_deg, currSpeed_ms, currDir_deg, sla_m,
        dist: refLoc ? distanceNm(refLoc.lat, refLoc.lon, lat, lon) : null,
        bearing: refLoc ? bearingDeg(refLoc.lat, refLoc.lon, lat, lon) : null,
      });
      const adl2 = activeDataLayerRef.current;
      onHoverSst?.(adl2 === "chlorophyll" ? chl : adl2 === "seacolor" ? kd490 : sst);
    });
    map.on("mouseout", () => { setHoverInfo(null); onHoverSst?.(null); });

    const container = mapDivRef.current;
    let isPinching = false;
    function handleTouch(e) {
      if (interactionModeRef.current !== "crosshair") return;
      if (e.touches.length > 1) { isPinching = true; setHoverInfo(null); setTouchMarker(null); return; }
      if (isPinching) return;
      e.preventDefault();
      const touch = e.touches[0]; if (!touch) return;
      const rect = container.getBoundingClientRect();
      const px = touch.clientX - rect.left, py = touch.clientY - rect.top;
      const latlng = map.containerPointToLatLng([px, py]);
      const { lat, lng: lon } = latlng;
      if (lon < regionBounds.west || lon > regionBounds.east || lat < regionBounds.south || lat > regionBounds.north) { setHoverInfo(null); setTouchMarker(null); onHoverSst?.(null); return; }
      // Guard against stale closure: latSet captured at init time may be empty if data
      // hadn't loaded yet when the map was created.
      let sst = null;
      if (sstLatSetRef.current.length > 0 && sstLonSetRef.current.length > 0) {
        const nearLat = sstLatSetRef.current.reduce((a,b)=>Math.abs(b-lat)<Math.abs(a-lat)?b:a);
        const nearLon = sstLonSetRef.current.reduce((a,b)=>Math.abs(b-lon)<Math.abs(a-lon)?b:a);
        sst = sstGridRef.current[`${nearLat}_${nearLon}`] ?? null;
      }
      let depth_ft = null;
      if (bathyDataRef.current?.points?.length) { let best=null,bestDist=Infinity; for(const pt of bathyDataRef.current.points){const d=(pt.lat-lat)**2+(pt.lon-lon)**2;if(d<bestDist){bestDist=d;best=pt;}} depth_ft = best?.depth_ft ?? null; }
      let touchChl=null,touchColorClass=null,touchKd490=null;
      const tadl = activeDataLayerRef.current;
      if(tadl==="chlorophyll"&&chlDataRef.current?.days?.length){const day=chlDataRef.current.days[chlDateIndexRef.current]||chlDataRef.current.days[chlDataRef.current.days.length-1];if(day?.grid?.length){const BIN=0.02;const nLat=Math.round(lat/BIN)*BIN,nLon=Math.round(lon/BIN)*BIN;const pt=day.grid.find(p=>Math.abs(p.lat-nLat)<BIN&&Math.abs(p.lon-nLon)<BIN);touchChl=pt?.chlorophyll??null;touchColorClass=pt?.color_class??null;}}
      else if(tadl==="seacolor"&&seaColorDataRef.current?.days?.length){const day=seaColorDataRef.current.days[seaColorDateIndexRef.current]||seaColorDataRef.current.days[seaColorDataRef.current.days.length-1];if(day?.grid?.length){let best=null,bestDist=Infinity;for(const p of day.grid){const d=(p.lat-lat)**2+(p.lon-lon)**2;if(d<bestDist){bestDist=d;best=p;}}touchKd490=(best&&Math.sqrt(bestDist)<0.15)?best.kd490??null:null;}}
      let touchWindSpeed_kt=null,touchWindDir_deg=null;
      if((tadl==="windmap"||showWindOverlayRef.current)&&windDataRef.current?.hours?.length){const wHour=windDataRef.current.hours[windHourIndexRef.current]??windDataRef.current.hours[0];if(wHour?.grid?.length){let best=null,bestDist=Infinity;for(const p of wHour.grid){const d=(p.lat-lat)**2+(p.lon-lon)**2;if(d<bestDist){bestDist=d;best=p;}}if(best){touchWindSpeed_kt=best.speed??Math.sqrt((best.u||0)**2+(best.v||0)**2);touchWindDir_deg=(Math.atan2(-(best.u||0),-(best.v||0))*180/Math.PI+360)%360;}}else if(wHour?.velocityJSON){const w=windFromVelocityJSON(wHour.velocityJSON,lat,lon);if(w){touchWindSpeed_kt=w.speed;touchWindDir_deg=w.dir;}}}
      const refLoc = selectedLocationRef.current;
      setTouchMarker({ px, py });
      let touchCurrSpeed_ms=null,touchCurrDir_deg=null,touchSla_m=null;
      if(showCurrentsRef.current&&currentsDataRef.current?.hours?.length){const ch=currentsDataRef.current.hours[0];if(ch?.grid?.length){let best=null,bestDist=Infinity;for(const p of ch.grid){const d=(p.lat-lat)**2+(p.lon-lon)**2;if(d<bestDist){bestDist=d;best=p;}}if(best){touchCurrSpeed_ms=best.speed_ms??Math.sqrt((best.u||0)**2+(best.v||0)**2);touchCurrDir_deg=best.dir_deg??((Math.atan2(best.u||0,best.v||0)*180/Math.PI)+360)%360;}}}
      if(activeDataLayerRef.current==="altimetry"&&altimetryDataRef.current){const alt=altimetryDataRef.current;if(alt.lats&&alt.lons&&alt.sla){const li=alt.lats.reduce((bi,v,i)=>Math.abs(v-lat)<Math.abs(alt.lats[bi]-lat)?i:bi,0);const lj=alt.lons.reduce((bj,v,j)=>Math.abs(v-lon)<Math.abs(alt.lons[bj]-lon)?j:bj,0);const row=alt.sla[li];if(row)touchSla_m=row[lj]??null;}}
      setHoverInfo({ px, py: py - 70, sst, depth_ft, chl: touchChl, color_class: touchColorClass, kd490: touchKd490, windSpeed_kt: touchWindSpeed_kt, windDir_deg: touchWindDir_deg, currSpeed_ms: touchCurrSpeed_ms, currDir_deg: touchCurrDir_deg, sla_m: touchSla_m,
        dist: refLoc ? distanceNm(refLoc.lat, refLoc.lon, lat, lon) : null,
        bearing: refLoc ? bearingDeg(refLoc.lat, refLoc.lon, lat, lon) : null,
      });
      onHoverSst?.(tadl==="chlorophyll" ? touchChl : tadl==="seacolor" ? touchKd490 : sst);
    }
    function handleTouchEnd(e) {
      if (isPinching) { if (e.touches.length === 0) { isPinching = false; setHoverInfo(null); setTouchMarker(null); } }
    }
    container.addEventListener("touchmove",  handleTouch,    { passive: false });
    container.addEventListener("touchstart", handleTouch,    { passive: false });
    container.addEventListener("touchend",   handleTouchEnd, { passive: true  });

    mapRef.current = map;
    setMapReady(true);

    if (!maskBuildStartedRef.current) {
      maskBuildStartedRef.current = true;
      const _maskUrl=`${_OCEAN_MASK_BASE}/${_vSubdir}ocean_mask.json`;
      buildOceanMaskFromLand(regionBounds,_maskUrl).then(mask => {
        if (mask) { waterMaskRef.current = mask; setWaterMaskVersion(v => v + 1); }
      }).catch(e => console.error("[LEAFLET] mask build failed:", e));
    }
    return () => {
      container.removeEventListener("touchmove",  handleTouch);
      container.removeEventListener("touchstart", handleTouch);
      container.removeEventListener("touchend",   handleTouchEnd);
      blobUrlsRef.current.forEach(u => { try { URL.revokeObjectURL(u); } catch(_){} });
      blobUrlsRef.current = [];
      map.remove(); mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
    const map = mapRef.current; if (!map) return;
    const c = map.getContainer();
    try {
      const CROSSHAIR_SVG = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\'%3E%3Cline x1=\'10\' y1=\'0\' x2=\'10\' y2=\'20\' stroke=\'%23000\' stroke-width=\'3\'/%3E%3Cline x1=\'0\' y1=\'10\' x2=\'20\' y2=\'10\' stroke=\'%23000\' stroke-width=\'3\'/%3E%3Cline x1=\'10\' y1=\'0\' x2=\'10\' y2=\'20\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3Cline x1=\'0\' y1=\'10\' x2=\'20\' y2=\'10\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3C/svg%3E") 10 10, crosshair';
      c.style.cursor = interactionMode === "crosshair" ? CROSSHAIR_SVG : "grab";
    } catch(_){}
    if (interactionMode === "pan") { setHoverInfo(null); setTouchMarker(null); map.dragging.enable(); return; }

    // Crosshair mode: block left-drag so inspect works, but allow:
    //   • Middle-click drag (button 1)
    //   • Space + left-drag  (hold Space to pan)
    map.dragging.disable();

    const XHAIR_SVG = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 20 20\'%3E%3Cline x1=\'10\' y1=\'0\' x2=\'10\' y2=\'20\' stroke=\'%23000\' stroke-width=\'3\'/%3E%3Cline x1=\'0\' y1=\'10\' x2=\'20\' y2=\'10\' stroke=\'%23000\' stroke-width=\'3\'/%3E%3Cline x1=\'10\' y1=\'0\' x2=\'10\' y2=\'20\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3Cline x1=\'0\' y1=\'10\' x2=\'20\' y2=\'10\' stroke=\'%23fff\' stroke-width=\'1.5\'/%3E%3C/svg%3E") 10 10, crosshair';

    let spaceHeld = false;

    function onKeyDown(e) {
      if (e.code === "Space" && interactionModeRef.current === "crosshair" && !spaceHeld) {
        spaceHeld = true;
        e.preventDefault();
        map.dragging.enable();
        try { c.style.cursor = "grab"; } catch(_) {}
      }
    }
    function onKeyUp(e) {
      if (e.code === "Space") {
        spaceHeld = false;
        if (interactionModeRef.current === "crosshair") {
          map.dragging.disable();
          try { c.style.cursor = XHAIR_SVG; } catch(_) {}
        }
      }
    }

    function onMouseDown(e) {
      if (interactionModeRef.current !== "crosshair") return;
      if (e.button === 1) {
        // Middle-click → pan
        e.preventDefault();
        map.dragging.enable();
        try { c.style.cursor = "grabbing"; } catch(_) {}
        function onMouseUp() {
          if (interactionModeRef.current === "crosshair" && !spaceHeld) {
            map.dragging.disable();
            try { c.style.cursor = XHAIR_SVG; } catch(_) {}
          }
          window.removeEventListener("mouseup", onMouseUp);
        }
        window.addEventListener("mouseup", onMouseUp);
      } else if (e.button === 0 && spaceHeld) {
        try { c.style.cursor = "grabbing"; } catch(_) {}
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    c.addEventListener("mousedown", onMouseDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
      c.removeEventListener("mousedown", onMouseDown, { capture: true });
    };
  }, [interactionMode, mapReady]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    const refit = () => {
      try {
        map.invalidateSize();
        const sz = map.getSize();
        const vpH = window.visualViewport?.height || window.innerHeight || 0;
        const _cw = sz.x || 800, _ch = sz.y || vpH || 500;
        const _mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
        const _mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
        const _mH = _mN - _mS, _lR = regionBounds.east - regionBounds.west;
        const fillZoom = Math.max(Math.log2((_cw * 360) / (256 * _lR)), Math.log2((_ch * 2 * Math.PI) / (256 * _mH)));
        const curZoom = map.getZoom();
        if (!isFinite(curZoom) || Math.abs(curZoom - fillZoom) > 0.05) {
          map.setView(mercCenter, fillZoom, { animate: false });
        }
        let guard = 0;
        while (guard++ < 10) {
          const vb = map.getBounds();
          if (vb.getNorth() <= regionBounds.north + 0.05 && vb.getSouth() >= regionBounds.south - 0.05) break;
          map.setView(mercCenter, map.getZoom() + 0.1, { animate: false });
        }
        map.setMinZoom(map.getZoom()); map.setMaxBounds(llBounds);
        setRepaintTrigger(t => t + 1);
      } catch(_){}
    };
    requestAnimationFrame(() => requestAnimationFrame(refit));
    const t1 = setTimeout(refit, 300), t2 = setTimeout(refit, 900), t3 = setTimeout(refit, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    let userInteracted = false;
    const markInteracted = () => { userInteracted = true; userInteractedRef.current = true; };
    map.on("dragstart", markInteracted);
    map.on("zoomstart", markInteracted);

    const refit = () => {
      if (userInteracted) return;
      try {
        map.invalidateSize();
        const sz = map.getSize(); const _cw = sz.x || 800, _ch = sz.y || 600;
        const _mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
        const _mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
        const _mH = _mN - _mS, _lR = regionBounds.east - regionBounds.west;
        const fillZoom = Math.max(Math.log2((_cw * 360) / (256 * _lR)), Math.log2((_ch * 2 * Math.PI) / (256 * _mH)));
        const currentZoom = map.getZoom();
        if (Math.abs(currentZoom - fillZoom) > 0.05) {
          map.setView(mercCenter, fillZoom, { animate: false });
        }
        let _g = 0;
        while (_g++ < 15) {
          const _vb = map.getBounds();
          if (_vb.getNorth() <= regionBounds.north + 0.02 && _vb.getSouth() >= regionBounds.south - 0.02) break;
          map.setView(mercCenter, map.getZoom() + 0.1, { animate: false });
        }
        const _db = dataBoundsRef.current;
        map.setMinZoom(map.getZoom()); map.setMaxBounds(_db ? [[_db.south, _db.west], [_db.north, _db.east]] : llBounds);
        setRepaintTrigger(t => t + 1);
      } catch(_){}
    };
    // window resize — just invalidate, don't refit (avoid thrash)
    const onResize = () => { try { map.invalidateSize(); setRepaintTrigger(t => t + 1); } catch(_){} };
    window.addEventListener("resize", onResize);
    // visualViewport resize fires when iOS URL bar shows/hides — do refit then
    let vvTimer = null;
    // Always refit on visual-viewport resize (iOS URL bar show/hide) regardless of user interaction
    const onVVResize = () => { clearTimeout(vvTimer); vvTimer = setTimeout(() => { const _ui = userInteracted; userInteracted = false; refit(); userInteracted = _ui; }, 250); };
    window.visualViewport?.addEventListener("resize", onVVResize);
    const ro = new ResizeObserver(onResize);
    if (map.getContainer().parentElement) ro.observe(map.getContainer().parentElement);
    return () => {
      map.off("dragstart", markInteracted); map.off("zoomstart", markInteracted);
      clearTimeout(vvTimer); window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onVVResize); ro.disconnect();
    };
  }, [mapReady]);

  // ── SST overlay ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !latSet.length) return;
    const mask = waterMaskRef.current; if (!mask) return;
    if (sstOverlayRef.current) { map.removeLayer(sstOverlayRef.current); sstOverlayRef.current = null; }
    const useGl = !!(glLayerRef.current && MAPBOX_TOKEN) && activeDataLayer !== "altimetry";
    if (showBathyRaster || showRadarOverlay) { if (useGl) removeSstImage(glLayerRef.current); return; }
    if (activeDataLayer !== "sst") return;
    if (!showSSTLayer) { if (useGl) removeSstImage(glLayerRef.current); return; }
    const rangeMin = sstRange?.min !== undefined ? sstRange.min : undefined;
    const rangeMax = sstRange?.max !== undefined ? sstRange.max : undefined;
    const _ac_sst = new AbortController();
    const isHourlyViirs = (dataSource === "VIIRS" || dataSource === "VIIRSSNPP");
    // Hourly VIIRS: gapFillGrid floods sounds/bays (inshore() check treats them as inshore).
    // Skip gap-fill for hourly; canonical latSet still ensures correct Mercator bounds.
    const sstGrid = (useGl && !isHourlyViirs) ? gapFillGrid(latSet, lonSet, grid, mask, 1) : grid;
    const sstIsOcean = useGl ? null : mask;
    gridToDataURL(latSet, lonSet, sstGrid, sstMin, sstMax, null, sstIsOcean, rangeMin, rangeMax, _ac_sst.signal).then(async result => {
      if (_ac_sst.signal.aborted || !result) return;
      const { dataURL, west, east, north, south } = result;
      if (useGl) {
        const imgUrl = isHourlyViirs ? dataURL : await solidify(dataURL);
        if (_ac_sst.signal.aborted) return;
        blobUrlsRef.current.push(imgUrl);
        upsertSstImage(glLayerRef.current, imgUrl, west, east, north, south);
      } else {
        blobUrlsRef.current.push(dataURL);
        const opacity = (dataSource === "VIIRS" || dataSource === "VIIRSSNPP" || dataSource === "GOESCOMP") ? 0.78 : 0.92;
        const overlay = L.imageOverlay(dataURL, [[south, west], [north, east]], { opacity, interactive: false, pane: "sstDataPane" });
        overlay.addTo(map); sstOverlayRef.current = overlay;
      }
      // Set data-bounds constraints BEFORE setSstReady so the post-refit's
      // setView(mercCenter, fill_from_region) is clamped by Leaflet to minZoom,
      // preventing the viewport from showing basemap above the SST data north edge.
      try {
        const sz = map.getSize(); const cw = sz.x || 800, ch = sz.y || 600;
        const mN = Math.log(Math.tan(Math.PI/4 + north * Math.PI/360));
        const mS = Math.log(Math.tan(Math.PI/4 + south * Math.PI/360));
        const mH = mN - mS;
        // Use region bounds for west/east/south — data may not reach region edges
        // (MUR/CHL/SeaColor are ocean-only, inshore areas often excluded).
        // Keep data north to clamp the grey-strip-at-top.
        const lR = regionBounds.east - regionBounds.west;
        dataBoundsRef.current = { south: regionBounds.south, west: regionBounds.west, north, east: regionBounds.east };
        map.setMaxBounds([[regionBounds.south, regionBounds.west], [north, regionBounds.east]]);
        map.setMinZoom(Math.max(Math.log2((cw * 360) / (256 * lR)), Math.log2((ch * 2 * Math.PI) / (256 * mH))));
      } catch(_) {}
      sstReadyRef.current = true; setSstReady(true);
    });
    return () => { _ac_sst.abort(); };
  }, [mapReady, latSet, lonSet, grid, sstMin, sstMax, showSSTLayer, showBathyRaster, showRadarOverlay, activeDataLayer, dataSource,
      waterMaskVersion, repaintTrigger, sstRange?.min, sstRange?.max, sstRange?.maskOutside]);


  function expandCoarseGrid(latSet2,lonSet2,overlayGrid,targetLatSet,targetLonSet){const expanded={};const MAX_GAP=1.0;for(const lat of targetLatSet){if(lat>latSet2[0]||lat<latSet2[latSet2.length-1])continue;let r0=0,latFound=false;for(let i=0;i<latSet2.length-1;i++){if(lat<=latSet2[i]&&lat>=latSet2[i+1]){r0=i;latFound=true;break;}}if(!latFound)continue;const r1=Math.min(r0+1,latSet2.length-1);if(latSet2[r0]-latSet2[r1]>MAX_GAP)continue;const latFrac=latSet2[r0]===latSet2[r1]?0:(latSet2[r0]-lat)/(latSet2[r0]-latSet2[r1]);for(const lon of targetLonSet){if(lon<lonSet2[0]||lon>lonSet2[lonSet2.length-1])continue;let c0=0,lonFound=false;for(let i=0;i<lonSet2.length-1;i++){if(lon>=lonSet2[i]&&lon<=lonSet2[i+1]){c0=i;lonFound=true;break;}}if(!lonFound)continue;const c1=Math.min(c0+1,lonSet2.length-1);if(lonSet2[c1]-lonSet2[c0]>MAX_GAP)continue;const lonFrac=lonSet2[c0]===lonSet2[c1]?0:(lon-lonSet2[c0])/(lonSet2[c1]-lonSet2[c0]);const vNW=overlayGrid[`${latSet2[r0]}_${lonSet2[c0]}`],vNE=overlayGrid[`${latSet2[r0]}_${lonSet2[c1]}`];const vSW=overlayGrid[`${latSet2[r1]}_${lonSet2[c0]}`],vSE=overlayGrid[`${latSet2[r1]}_${lonSet2[c1]}`];const wNW=(1-latFrac)*(1-lonFrac),wNE=(1-latFrac)*lonFrac,wSW=latFrac*(1-lonFrac),wSE=latFrac*lonFrac;let sum=0,wsum=0;if(vNW!=null&&Number.isFinite(vNW)){sum+=vNW*wNW;wsum+=wNW;}if(vNE!=null&&Number.isFinite(vNE)){sum+=vNE*wNE;wsum+=wNE;}if(vSW!=null&&Number.isFinite(vSW)){sum+=vSW*wSW;wsum+=wSW;}if(vSE!=null&&Number.isFinite(vSE)){sum+=vSE*wSE;wsum+=wSE;}if(wsum>=0.25)expanded[`${lat}_${lon}`]=sum/wsum;}}return expanded;}

  // ── Overlay layer (chl / composite / seacolor) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (overlayLayerRef.current) { map.removeLayer(overlayLayerRef.current); overlayLayerRef.current = null; }
    if (showBathyRaster || showRadarOverlay) return;
    let overlayGrid=null,latSet2=[],lonSet2=[],colorFn=null,min2=0,max2=1;
    if (activeDataLayer==="chlorophyll"&&chlData?.days?.length) {
      const day=chlData.days[chlDateIndex]||chlData.days[chlData.days.length-1];
      if(!day?.grid?.length)return;
      latSet2=[...new Set(day.grid.map(d=>d.lat))].sort((a,b)=>b-a);
      lonSet2=[...new Set(day.grid.map(d=>d.lon))].sort((a,b)=>a-b);
      overlayGrid={};day.grid.forEach(d=>{overlayGrid[`${d.lat}_${d.lon}`]=d.chlorophyll;});
      min2=0.05;max2=5.0;colorFn=chlColor; // fixed ref: 0.05–5.0 mg/m³
    } else if (activeDataLayer==="composite"&&compositeData?.sst?.length) {
      const { latSet: cLatSet, lonSet: cLonSet, sst: cSst } = compositeData;
      const nLons = cLonSet.length;
      overlayGrid = {};
      cSst.forEach((val, idx) => {
        if (val === null || val === undefined) return;
        const latI = Math.floor(idx / nLons), lonI = idx % nLons;
        if (latI < cLatSet.length && lonI < cLonSet.length) overlayGrid[`${cLatSet[latI]}_${cLonSet[lonI]}`] = val;
      });
      latSet2 = [...cLatSet].sort((a,b) => b - a);
      lonSet2 = [...cLonSet].sort((a,b) => a - b);
      min2 = 50; max2 = 90; // fixed SST reference — consistent with all other SST sources
      colorFn = null;
    } else if (activeDataLayer==="seacolor"&&seaColorData?.days?.length) {
      const day=seaColorData.days[seaColorDateIndex]||seaColorData.days[seaColorData.days.length-1];
      if(!day?.grid?.length)return;
      latSet2=[...new Set(day.grid.map(d=>d.lat))].sort((a,b)=>b-a);
      lonSet2=[...new Set(day.grid.map(d=>d.lon))].sort((a,b)=>a-b);
      overlayGrid={};day.grid.forEach(d=>{overlayGrid[`${d.lat}_${d.lon}`]=d.kd490;});
      min2=0.02;max2=0.50;colorFn=kd490Color; // fixed ref: 0.02–0.50 m⁻¹
    } else if (activeDataLayer==="altimetry"&&altimetryData?.lats?.length) {
      // Render SLA color raster; contours drawn by separate useEffect.
      const { lats, lons, sla } = altimetryData;
      if (!sla) return;
      const rawLats2 = lats.map(v => Math.round(v * 1e5) / 1e5);
      const rawLons2 = lons.map(v => Math.round(v * 1e5) / 1e5);
      latSet2 = [...rawLats2].sort((a, b) => b - a);
      lonSet2 = [...rawLons2].sort((a, b) => a - b);
      overlayGrid = {};
      for (let i = 0; i < rawLats2.length; i++) {
        const row = sla[i]; if (!row) continue;
        for (let j = 0; j < rawLons2.length; j++) {
          const v = row[j]; if (v != null && Number.isFinite(v)) overlayGrid[`${rawLats2[i]}_${rawLons2[j]}`] = v;
        }
      }
      if (!latSet2.length) return;
      const slaFlat2 = Object.values(overlayGrid).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
      if (slaFlat2.length > 10) {
        const p5 = slaFlat2[Math.floor(slaFlat2.length * 0.05)];
        const p95 = slaFlat2[Math.floor(slaFlat2.length * 0.95)];
        const autoRange = Math.min(0.4, Math.max(Math.abs(p5), Math.abs(p95)));
        onSlaRange?.({ min: -autoRange, max: autoRange });
        min2 = -autoRange; max2 = autoRange;
      } else { min2 = -0.3; max2 = 0.3; }
      colorFn = (val, mn, mx) => slaColor(val, mn, mx);
    } else { return; }
    if (!latSet2.length) return;
    const _ac_ov = new AbortController();
    const useRefGrid = activeDataLayer==="seacolor";
    const renderLatSet = useRefGrid ? latSet : latSet2;
    const renderLonSet = useRefGrid ? lonSet : lonSet2;
    const renderGrid   = useRefGrid ? expandCoarseGrid(latSet2,lonSet2,overlayGrid,latSet,lonSet) : overlayGrid;
    const finalColorFn = activeDataLayer === "composite" ? null : colorFn;
    const finalMin = min2;   // composite now carries its own range in min2/max2
    const finalMax = max2;
    const finalRangeMin = (activeDataLayer === "composite" || activeDataLayer === "chlorophyll" || activeDataLayer === "seacolor") && sstRange?.min != null ? sstRange.min : undefined;
    const finalRangeMax = (activeDataLayer === "composite" || activeDataLayer === "chlorophyll" || activeDataLayer === "seacolor") && sstRange?.max != null ? sstRange.max : undefined;
    const useGl = !!(glLayerRef.current && MAPBOX_TOKEN) && activeDataLayer !== "altimetry";
    // Altimetry uses Leaflet imageOverlay (not GL); clear stale GL raster so it does not bleed through.
    if (activeDataLayer === "altimetry" && glLayerRef.current) removeSstImage(glLayerRef.current);
    const ovGrid = (useGl && (activeDataLayer === "composite" || activeDataLayer === "chlorophyll")) ? gapFillGrid(renderLatSet, renderLonSet, renderGrid, waterMaskRef.current, 1) : renderGrid;
    const ocMask = activeDataLayer === "altimetry"
      ? altimetryDeepMask
      : (useGl ? null : waterMaskRef.current);
    gridToDataURL(renderLatSet,renderLonSet,ovGrid,finalMin,finalMax,finalColorFn,ocMask,finalRangeMin,finalRangeMax,_ac_ov.signal).then(async result => {
      if (_ac_ov.signal.aborted || !result) return;
      const { dataURL, west, east, north, south } = result;
      if (useGl) {
        // CHL and Sea Color: blur to feather 4km block edges; no solidify so partial-alpha
        // wsum pixels stay soft (solidify would negate the blur's edge fade).
        // Composite keeps solidify — full-region coverage, needs crisp land-edge clipping.
        const isSoftOverlay = activeDataLayer === "chlorophyll" || activeDataLayer === "seacolor";
        const imgUrl = isSoftOverlay ? await blurOverlay(dataURL, 4) : await solidify(dataURL);
        if (_ac_ov.signal.aborted) return;
        blobUrlsRef.current.push(imgUrl);
        upsertSstImage(glLayerRef.current, imgUrl, west, east, north, south);
      } else {
        // Altimetry: blur to feather the offshore data boundary (0.125deg grid has hard edges)
        const altBlurred = await blurOverlay(dataURL, 4);
        if (_ac_ov.signal.aborted) return;
        blobUrlsRef.current.push(altBlurred);
        const overlay = L.imageOverlay(altBlurred, [[south, west], [north, east]], { opacity: 0.92, interactive: false, pane: "sstDataPane" });
        overlay.addTo(map); overlayLayerRef.current = overlay;
      }
      // CHL/seacolor/composite data stops at 39.00°N — set tight minZoom+maxBounds so
      // the post-sstReady refit's setView(fill_for_39.50N) is clamped, preventing grey strip.
      // Altimetry: CMEMS returns 0.125° grid centroids (33.8125–38.9375°N), not the full
      // bbox. Must center on the actual data Mercator midpoint — NOT region mercCenter
      // (~36.60°N) — otherwise the viewport clips either top or bottom of the data.
      // Block the post-refit with userInteractedRef so it doesn't shift center back to
      // mercCenter. sstReadyRef blocks applyFillZoom calls after data loads.
      // chl/sea/composite render on the SST reference grid -> standard region fit.
      // Altimetry renders on its NATIVE 0.125 grid (33.8125-38.9375N), narrower than
      // the region; position the viewport directly to the data bounds so it covers
      // edge-to-edge with no top/bottom clip (matches main's proven behavior).
      if (activeDataLayer !== 'altimetry') {
        try {
          // Data bounds for maxBounds + minZoom. mercCenter is the Mercator midpoint of
          // the region (39.5N), not the data (39.0N); centering there at data-fill-zoom
          // overshoots north — clamping maxBounds to actual data north prevents it.
          // Use region bounds for west/east/south — ocean-only data may not
          // reach the region's inshore western edge; keep data north for grey-strip fix.
          dataBoundsRef.current = { south: regionBounds.south, west: regionBounds.west, north, east: regionBounds.east };
          map.setMaxBounds([[regionBounds.south, regionBounds.west], [north, regionBounds.east]]);
          const sz = map.getSize(); const cw = sz.x || 800, ch = sz.y || 600;
          const mN = Math.log(Math.tan(Math.PI/4 + north * Math.PI/360));
          const mS = Math.log(Math.tan(Math.PI/4 + south * Math.PI/360));
          const mH = mN - mS, lR = regionBounds.east - regionBounds.west;
          map.setMinZoom(Math.max(Math.log2((cw * 360) / (256 * lR)), Math.log2((ch * 2 * Math.PI) / (256 * mH))));
        } catch(_) {}
      } else {
        try {
          const sz = map.getSize(); const cw = sz.x || 800, ch = sz.y || 600;
          const aN = Math.log(Math.tan(Math.PI/4 + north * Math.PI/360));
          const aS = Math.log(Math.tan(Math.PI/4 + south * Math.PI/360));
          const mH = aN - aS, lR = east - west;
          const fzAlt = Math.max(
            Math.log2((cw * 360) / (256 * lR)),
            Math.log2((ch * 2 * Math.PI) / (256 * mH))
          );
          const altMercCenter = L.latLng(
            (2 * Math.atan(Math.exp((aN + aS) / 2)) - Math.PI / 2) * 180 / Math.PI,
            (west + east) / 2
          );
          map.setView(altMercCenter, fzAlt, { animate: false });
          map.setMinZoom(fzAlt);
          // Use the ACTUAL altimetry data bounds (not llBounds/regionBounds) -- unlike
          // CHL/composite/seacolor below, which only tighten the north edge and keep
          // regionBounds for south/west/east (their ocean-only fetch may not reach the
          // region's inshore edge, so full-region panning there is correct), altimetry's
          // grid IS a full rectangle already, so all four edges should come from the
          // real data. Previously this used llBounds (full region bounds, e.g. 39.50N
          // for mid_atlantic) instead of the real data edge (e.g. 38.94N) -- SST/CHL/
          // seacolor/composite/currents/wind all correctly stop panning at their true
          // data edge, but altimetry alone let the user pan ~0.5 degrees past it into a
          // zone with no real data, and dataBoundsRef was never set for altimetry either,
          // so every later refit (vv-resize, post-sstReady) fell back to the same loose
          // llBounds instead of tightening once real bounds were known (2026-07-13
          // incident -- reported as "altimetry lets you pan out of bounds, other layers
          // don't"; see docs/map_viewport_nuances.md section 8.6).
          dataBoundsRef.current = { south, west, north, east };
          map.setMaxBounds([[south, west], [north, east]]);
        } catch(_) {}
        userInteractedRef.current = true;
      }
      sstReadyRef.current = true; setSstReady(true);
    });
    return () => { _ac_ov.abort(); };
  }, [mapReady, showBathyRaster, showRadarOverlay, activeDataLayer, chlData, chlDateIndex, seaColorData, seaColorDateIndex, compositeData, altimetryData, waterMaskVersion, openOceanVersion, repaintTrigger, sstRange?.min, sstRange?.max]);

  // ── Velocity layer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (velocityLayerRef.current) { map.removeLayer(velocityLayerRef.current); velocityLayerRef.current = null; }
    if (windRasterOverlayRef.current) { map.removeLayer(windRasterOverlayRef.current); windRasterOverlayRef.current = null; }
    if (!windActive || !windData?.hours?.length) return;
    if (!L.velocityLayer) { const t = setTimeout(() => setRepaintTrigger(p => p + 1), 500); return () => clearTimeout(t); }
    const hourData = windData.hours[windHourIndex] ?? windData.hours[0];
    if (!hourData?.velocityJSON) return;
    const isOverlay = showWindOverlay && !isWindMap;
    const maxSpd = windData.maxSpeed ?? 30;
    // Uniform particle opacity (was speed-scaled 0.4->0.95, which made slow-wind
    // streaks look faded/broken). Speed is already shown by the color fill.
    const whiteScale = ["rgba(255,255,255,0.9)","rgba(255,255,255,0.9)","rgba(255,255,255,0.9)","rgba(255,255,255,0.9)"];
    const velocityLayer = L.velocityLayer({
      displayValues: false,
      displayOptions: { velocityType: "Wind", position: "bottomright", emptyString: "No wind data", angleConvention: "meteoCW", showCardinal: true, speedUnit: "kt", directionString: "Direction", speedString: "Speed" },
      data: hourData.velocityJSON, minVelocity: 0, maxVelocity: maxSpd, velocityScale: 0.005,
      colorScale: whiteScale, opacity: isOverlay ? 0.65 : 0.85,
      particleAge: 40, particleMultiplier: 0.0008, lineWidth: isOverlay ? 1.8 : 2.0,
    });
    velocityLayer.addTo(map); velocityLayerRef.current = velocityLayer;
    // Wind map: use region bounds (region-agnostic — no gridToDataURL result here).
    try {
      map.setMaxBounds(llBounds);
      const sz = map.getSize(); const cw = sz.x || 800, ch = sz.y || 600;
      const mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north * Math.PI/360));
      const mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south * Math.PI/360));
      const mH = mN - mS, lR = regionBounds.east - regionBounds.west;
      map.setMinZoom(Math.max(Math.log2((cw * 360) / (256 * lR)), Math.log2((ch * 2 * Math.PI) / (256 * mH))));
    } catch(_) {}
    sstReadyRef.current = true; setSstReady(true);
    // Disable pointer events on wind canvas so wreck/feature markers below receive clicks
    try {
      const vc = velocityLayer._canvasLayer?._canvas ?? velocityLayer._canvas ?? null;
      if (vc) vc.style.pointerEvents = 'none';
    } catch(_) {}
    if (velocityLayer._onLayerDidMove) {
      const _orig = velocityLayer._onLayerDidMove.bind(velocityLayer);
      velocityLayer._onLayerDidMove = function() { if (!this._map) return; try { _orig.call(this); } catch(e) {} };
    }
    return () => {
      if (velocityLayerRef.current) { map.removeLayer(velocityLayerRef.current); velocityLayerRef.current = null; }
      if (windRasterOverlayRef.current) { map.removeLayer(windRasterOverlayRef.current); windRasterOverlayRef.current = null; }
    };
  }, [mapReady, windActive, windData, showWindOverlay, isWindMap, repaintTrigger]);

  // ── Currents arrow grid layer ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (currentsLayerRef.current) { map.removeLayer(currentsLayerRef.current); currentsLayerRef.current = null; }
    if (!showCurrents || !currentsData?.hours?.length) return;
    // Render currents as a single canvas flow layer (leaflet-velocity) instead of
    // thousands of DOM marker arrows. The marker approach repositioned ~5k DOM nodes on
    // every zoom/pan -> crawled, unusable on mobile. The canvas layer is GPU-friendly.
    if (!L.velocityLayer) { const t = setTimeout(() => setRepaintTrigger(p => p + 1), 500); return () => clearTimeout(t); }
    const hourData = currentsData.hours[0];
    if (!hourData?.velocityJSON) return;
    const maxSpd = currentsData.maxSpeed ?? 2.0;
    // leaflet-velocity caps trail persistence at ~5 frames (hardcoded globalAlpha 0.6 +
    // destination-in fade), so trail length is governed by speed x velocityScale. Slow
    // nearshore currents therefore make near-invisible dots, and raising velocityScale to
    // fix that makes the Gulf Stream too fast. So compress the speed range (|v| -> sqrt|v|),
    // which boosts slow flow toward visibility while keeping fast flow in check. Direction
    // is preserved; the hover readout and any speed display use the true (uncompressed) data.
    const compressVel = (vj) => {
      if (!Array.isArray(vj) || vj.length < 2 || !vj[0]?.data || !vj[1]?.data) return vj;
      const u = vj[0], v = vj[1], ud = u.data, vd = v.data;
      const nu = new Array(ud.length), nv = new Array(vd.length);
      for (let i = 0; i < ud.length; i++) {
        const a = ud[i], b = vd[i];
        if (a == null || b == null) { nu[i] = a; nv[i] = b; continue; }
        const s = Math.hypot(a, b);
        if (!(s > 0)) { nu[i] = a; nv[i] = b; continue; }
        const k = Math.sqrt(s) / s;   // magnitude -> sqrt(magnitude), keep direction
        nu[i] = a * k; nv[i] = b * k;
      }
      return [{ ...u, data: nu }, { ...v, data: nv }];
    };
    const layer = L.velocityLayer({
      displayValues: false,
      displayOptions: { velocityType: "Current", position: "bottomright", emptyString: "No current data", angleConvention: "meteoCW", showCardinal: true, speedUnit: "m/s", directionString: "Direction", speedString: "Speed" },
      data: compressVel(hourData.velocityJSON), minVelocity: 0, maxVelocity: Math.sqrt(maxSpd),
      velocityScale: 0.06,  // tuned against sqrt-compressed speeds (fast flow ~matches prior look)
      colorScale: ["rgba(255,255,255,1)","rgba(255,255,255,1)","rgba(255,255,255,1)","rgba(255,255,255,1)"],
      particleAge: 90, particleMultiplier: 0.0012, lineWidth: 1.6, opacity: 1.0,
    });
    layer.addTo(map);
    currentsLayerRef.current = layer;
    try { const vc = layer._canvasLayer?._canvas ?? layer._canvas ?? null; if (vc) vc.style.pointerEvents = 'none'; } catch(_) {}
    if (layer._onLayerDidMove) {
      const _orig = layer._onLayerDidMove.bind(layer);
      layer._onLayerDidMove = function() { if (!this._map) return; try { _orig.call(this); } catch(e) {} };
    }
    return () => {
      if (currentsLayerRef.current) { map.removeLayer(currentsLayerRef.current); currentsLayerRef.current = null; }
    };
  }, [mapReady, showCurrents, currentsData, repaintTrigger]);

  // ── SLA contour lines helper (used by map mode + overlay mode) ─────────────
  function buildSlaContourGroup(altData, overlayMode, map, waterMask) {
    const { lats, lons, sla } = altData;
    if (!sla) return null;
    const rawLats = lats.map(v => Math.round(v * 1e5) / 1e5);
    const rawLons = lons.map(v => Math.round(v * 1e5) / 1e5);
    const latSorted = [...rawLats].sort((a, b) => b - a);
    const lonSorted = [...rawLons].sort((a, b) => a - b);
    const baseGrid = {};
    for (let i = 0; i < rawLats.length; i++) {
      const row = sla[i]; if (!row) continue;
      for (let j = 0; j < rawLons.length; j++) {
        const v = row[j]; if (v != null && Number.isFinite(v)) baseGrid[`${rawLats[i]}_${rawLons[j]}`] = v;
      }
    }
    if (!latSorted.length || !lonSorted.length) return null;

    // Bilinear upsample for smoother contours
    function upsampleGrid(latS, lonS, g, factor) {
      const nL = latS.length, nLo = lonS.length;
      const vals = [];
      for (let i = 0; i < nL; i++) { vals.push([]); for (let j = 0; j < nLo; j++) vals[i].push(g[`${latS[i]}_${lonS[j]}`] ?? null); }
      const newLats = [], newLons = [];
      for (let i = 0; i < nL - 1; i++) for (let f = 0; f < factor; f++) newLats.push(latS[i] + (latS[i+1] - latS[i]) * f / factor);
      newLats.push(latS[nL - 1]);
      for (let j = 0; j < nLo - 1; j++) for (let f = 0; f < factor; f++) newLons.push(lonS[j] + (lonS[j+1] - lonS[j]) * f / factor);
      newLons.push(lonS[nLo - 1]);
      const ng = {};
      for (let ni = 0; ni < newLats.length; ni++) {
        const lat = newLats[ni];
        let i0 = nL - 2;
        for (let i = 0; i < nL - 1; i++) { if (latS[i] >= lat && lat >= latS[i+1]) { i0 = i; break; } }
        const i1 = Math.min(i0 + 1, nL - 1);
        const latF = latS[i0] === latS[i1] ? 0 : (latS[i0] - lat) / (latS[i0] - latS[i1]);
        for (let nj = 0; nj < newLons.length; nj++) {
          const lon = newLons[nj];
          let j0 = nLo - 2;
          for (let j = 0; j < nLo - 1; j++) { if (lonS[j] <= lon && lon <= lonS[j+1]) { j0 = j; break; } }
          const j1 = Math.min(j0 + 1, nLo - 1);
          const lonF = lonS[j0] === lonS[j1] ? 0 : (lon - lonS[j0]) / (lonS[j1] - lonS[j0]);
          const vNW = vals[i0][j0], vNE = vals[i0][j1], vSW = vals[i1][j0], vSE = vals[i1][j1];
          let sum = 0, wsum = 0;
          const wNW=(1-latF)*(1-lonF), wNE=(1-latF)*lonF, wSW=latF*(1-lonF), wSE=latF*lonF;
          if (vNW != null) { sum+=vNW*wNW; wsum+=wNW; } if (vNE != null) { sum+=vNE*wNE; wsum+=wNE; }
          if (vSW != null) { sum+=vSW*wSW; wsum+=wSW; } if (vSE != null) { sum+=vSE*wSE; wsum+=wSE; }
          if (wsum >= 0.25) ng[`${newLats[ni]}_${newLons[nj]}`] = sum / wsum;
        }
      }
      return { latSorted: newLats, lonSorted: newLons, grid: ng };
    }

    const { latSorted: lsUp, lonSorted: loUp, grid: rawGrid } = upsampleGrid(latSorted, lonSorted, baseGrid, 8);
    // Apply water mask: blank out land cells so contours don't cross coastlines
    const grid = waterMask ? Object.fromEntries(Object.entries(rawGrid).filter(([k]) => {
      const [lat, lon] = k.split('_').map(Number); return waterMask(lat, lon);
    })) : rawGrid;

    const slaVals = Object.values(baseGrid).filter(v => Number.isFinite(v)).sort((a,b)=>a-b);
    if (slaVals.length < 4) return null;
    const p5  = slaVals[Math.floor(slaVals.length * 0.05)];
    const p95 = slaVals[Math.floor(slaVals.length * 0.95)];
    const STEP = 0.05; // 5 cm interval (accepted SSH/SLA convention)
    const levelMin = Math.ceil(p5 / STEP) * STEP;
    const levelMax = Math.floor(p95 / STEP) * STEP;
    const levels = [];
    for (let l = levelMin; l <= levelMax + 0.001; l += STEP) levels.push(Math.round(l * 4000) / 4000);

    // Precompute all lines per level
    const levelLines = [];
    try {
      const { field, rows, cols } = buildField(lsUp, loUp, grid);
      for (const level of levels) {
        const lines = marchingSquares(lsUp, loUp, field, rows, cols, level);
        if (lines.length) levelLines.push({ level, lines });
      }
    } catch(err) { console.error("[SLA contour]", err); return null; }
    if (!levelLines.length) return null;

    // Draw all polylines (once, permanent)
    const contourGroup = L.layerGroup();
    for (const { level, lines } of levelLines) {
      const isZero = Math.abs(level) < 0.013;
      const isPos  = level >= 0;
      const dash   = isPos ? null : "5,4";   // standard: solid = above avg, dashed = below avg
      const weight = isZero ? 1.8 : 1.0;     // zero contour emphasized, all others uniform thin
      const lineClr = "rgba(30,41,59,0.85)"; // single understated dark color
      const outClr  = "rgba(255,255,255,0.6)";
      for (const seg of lines) {
        const latlngs = seg.map(([lon, lat]) => [lat, lon]);
        L.polyline(latlngs, { color: outClr,  weight: weight + 1.6, opacity: 0.7, dashArray: dash, interactive: false }).addTo(contourGroup);
        L.polyline(latlngs, { color: lineClr, weight: weight,       opacity: 1.0, dashArray: dash, interactive: false }).addTo(contourGroup);
      }
    }

    // Dynamic zoom-aware labels (bathy style)
    const labelState = { layer: null };
    const LABEL_ZOOM = 8;

    function buildSlaLabels() {
      if (labelState.layer) { map.removeLayer(labelState.layer); labelState.layer = null; }
      const bounds = map.getBounds();
      const labelGroup = L.layerGroup();
      const SPACING_PX = 420; // screen distance between repeated labels along a contour
      const mkLabel = (lat, lon, str) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="font-size:10px;font-weight:600;font-family:system-ui,sans-serif;color:#1e293b;text-shadow:1px 1px 0 rgba(255,255,255,0.92),-1px 1px 0 rgba(255,255,255,0.92),1px -1px 0 rgba(255,255,255,0.92),-1px -1px 0 rgba(255,255,255,0.92),0 1px 0 rgba(255,255,255,0.92),0 -1px 0 rgba(255,255,255,0.92);white-space:nowrap;pointer-events:none;line-height:1;">${str}</div>`,
          iconSize: null, iconAnchor: [0, 6],
        });
        L.marker([lat, lon], { icon, interactive: false, keyboard: false }).addTo(labelGroup);
      };
      for (const { level, lines } of levelLines) {
        const cm = Math.round(level * 100);
        const labelStr = (cm >= 0 ? "+" : "") + cm;
        for (const line of lines) {
          // split contour into runs of consecutive on-screen vertices
          const runs = []; let run = [];
          for (const [lon, lat] of line) {
            if (bounds.contains([lat, lon])) run.push([lat, lon]);
            else { if (run.length) { runs.push(run); run = []; } }
          }
          if (run.length) runs.push(run);
          // every visible run gets >=1 label; long runs get labels every SPACING_PX of screen distance
          for (const r of runs) {
            if (r.length < 2) continue;
            let acc = SPACING_PX, prevPt = null, placed = 0;
            for (const [lat, lon] of r) {
              const pt = map.latLngToContainerPoint([lat, lon]);
              if (prevPt) acc += pt.distanceTo(prevPt);
              prevPt = pt;
              if (acc >= SPACING_PX) { mkLabel(lat, lon, labelStr); acc = 0; placed++; }
            }
            if (placed === 0) { const m = r[Math.floor(r.length / 2)]; mkLabel(m[0], m[1], labelStr); }
          }
        }
      }
      labelGroup.addTo(map);
      labelState.layer = labelGroup;
    }

    buildSlaLabels();
    map.on("zoomend", buildSlaLabels);
    map.on("moveend", buildSlaLabels);

    contourGroup._slaCleanup = () => {
      map.off("zoomend", buildSlaLabels);
      map.off("moveend", buildSlaLabels);
      if (labelState.layer) { map.removeLayer(labelState.layer); labelState.layer = null; }
    };

    return contourGroup;
  }

  // ── SLA contour — Altimetry Map mode ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (slaContourLayerRef.current) { slaContourLayerRef.current._slaCleanup?.(); map.removeLayer(slaContourLayerRef.current); slaContourLayerRef.current = null; }
    if (activeDataLayer !== "altimetry" || !altimetryData?.lats?.length) return;
    const grp = buildSlaContourGroup(altimetryData, false, map, (la,lo)=> (waterMaskRef.current ? waterMaskRef.current(la,lo) : true) && altimetryDeepMask(la,lo));
    if (grp) { grp.addTo(map); slaContourLayerRef.current = grp; }
  }, [mapReady, activeDataLayer, altimetryData, waterMaskVersion, openOceanVersion, repaintTrigger]);

  // ── SLA contour — Altimetry Overlay mode ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (slaOverlayContourLayerRef.current) { slaOverlayContourLayerRef.current._slaCleanup?.(); map.removeLayer(slaOverlayContourLayerRef.current); slaOverlayContourLayerRef.current = null; }
    if (!showAltimetryOverlay || !altimetryData?.lats?.length) return;
    const grp = buildSlaContourGroup(altimetryData, true, map, (la,lo)=> (waterMaskRef.current ? waterMaskRef.current(la,lo) : true) && altimetryDeepMask(la,lo));
    if (grp) { grp.addTo(map); slaOverlayContourLayerRef.current = grp; }
  }, [mapReady, showAltimetryOverlay, altimetryData, waterMaskVersion, openOceanVersion, repaintTrigger]);

  // ── Persist Loran toggle ─────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem("show_loran_grid", showLoranGrid); }, [showLoranGrid]);
  useEffect(() => { localStorage.setItem("show_loran_w_family", showLoranWFamily); }, [showLoranWFamily]);

  // ── Loran-C phantom grid overlay ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (loranLayerRef.current) { loranLayerRef.current._loranCleanup?.(); map.removeLayer(loranLayerRef.current); loranLayerRef.current = null; }
    if (!showLoranGrid) return;
    const grp = buildLoranGrid(map, waterMaskRef.current, regionBounds, showLoranWFamily && regionKey === "mid_atlantic");
    if (grp) { grp.addTo(map); loranLayerRef.current = grp; }
  }, [mapReady, showLoranGrid, showLoranWFamily, waterMaskVersion, regionKey]);

  // ── Canyon name labels (standalone overlay) ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (canyonLabelLayerRef.current) { map.removeLayer(canyonLabelLayerRef.current); canyonLabelLayerRef.current = null; }
    if (!showCanyonLabels) return;
    const grp = L.layerGroup();
    CANYON_LABELS.forEach(({ name, lat, lon }) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="font-size:11px;font-weight:600;font-family:system-ui,sans-serif;color:#6b7280;text-shadow:1px 1px 0 rgba(255,255,255,0.95),-1px 1px 0 rgba(255,255,255,0.95),1px -1px 0 rgba(255,255,255,0.95),-1px -1px 0 rgba(255,255,255,0.95),0 1px 0 rgba(255,255,255,0.95),0 -1px 0 rgba(255,255,255,0.95);white-space:nowrap;pointer-events:none;line-height:1.2;">${name}</div>`,
        iconSize: null,
        iconAnchor: [0, 11],
      });
      L.marker([lat, lon], { icon, interactive: false, keyboard: false }).addTo(grp);
    });
    grp.addTo(map);
    canyonLabelLayerRef.current = grp;
  }, [mapReady, showCanyonLabels]);

  // ── Wind raster ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    // Always clear raster on re-run — prevents stale wind overlay leaking onto CHL/ALT layers
    if (windRasterOverlayRef.current) { map.removeLayer(windRasterOverlayRef.current); windRasterOverlayRef.current = null; }
    if (!windActive || !windData?.hours?.length) return;
    const hourData = windData.hours[windHourIndex] ?? windData.hours[0];
    if (!hourData?.velocityJSON) return;
    const maxSpd = windData.maxSpeed ?? 30;
    if (velocityLayerRef.current?.setData) velocityLayerRef.current.setData(hourData.velocityJSON);
    if (isWindMap && hourData.grid?.length) {
      const wLats = windData.grid?.lats ?? [], wLons = windData.grid?.lons ?? [];
      const WSTEP = wLats.length > 1 ? Math.abs(wLats[0] - wLats[1]) : 0.25;
      const snapWind = v => Math.round(Math.round(v / WSTEP) * WSTEP * 100000) / 100000;
      const windMap = new Map();
      hourData.grid.forEach(p => { windMap.set(`${snapWind(p.lat)}_${snapWind(p.lon)}`, p.speed ?? Math.sqrt((p.u || 0) ** 2 + (p.v || 0) ** 2)); });
      const wLatMin = wLats.length ? Math.min(...wLats) : regionBounds.south;
      const wLatMax = wLats.length ? Math.max(...wLats) : regionBounds.north;
      const wLonMin = wLons.length ? Math.min(...wLons) : regionBounds.west;
      const wLonMax = wLons.length ? Math.max(...wLons) : regionBounds.east;
      function windSpeed(lat, lon) {
        const cLat = Math.max(wLatMin, Math.min(wLatMax, lat)), cLon = Math.max(wLonMin, Math.min(wLonMax, lon));
        const r=snapWind(Math.floor(cLat/WSTEP)*WSTEP),r1=snapWind(r+WSTEP),c=snapWind(Math.floor(cLon/WSTEP)*WSTEP),c1=snapWind(c+WSTEP);
        const rf=(cLat-r)/WSTEP,cf=(cLon-c)/WSTEP;
        const vNW=windMap.get(`${r}_${c}`),vNE=windMap.get(`${r}_${c1}`),vSW=windMap.get(`${r1}_${c}`),vSE=windMap.get(`${r1}_${c1}`);
        let sum=0,wsum=0;
        if(vNW!=null){sum+=vNW*(1-rf)*(1-cf);wsum+=(1-rf)*(1-cf);}if(vNE!=null){sum+=vNE*(1-rf)*cf;wsum+=(1-rf)*cf;}
        if(vSW!=null){sum+=vSW*rf*(1-cf);wsum+=rf*(1-cf);}if(vSE!=null){sum+=vSE*rf*cf;wsum+=rf*cf;}
        return wsum > 0.1 ? sum / wsum : null;
      }
      const speedGrid = {};
      latSet.forEach(lat => lonSet.forEach(lon => { const v = windSpeed(lat, lon); if (v != null) speedGrid[`${lat}_${lon}`] = v; }));
      const _ac_wind = new AbortController();
      const useGl = !!(glLayerRef.current && MAPBOX_TOKEN);
      gridToDataURL(latSet, lonSet, speedGrid, 0, maxSpd, windSpeedColor, useGl ? null : waterMaskRef.current, undefined, undefined, _ac_wind.signal).then(async result => {
        if (_ac_wind.signal.aborted || !result || !mapRef.current) return;
        const { dataURL, west, east, north, south } = result;
        if (useGl) {
          const solid = await solidify(dataURL);
          if (_ac_wind.signal.aborted) return;
          blobUrlsRef.current.push(solid);
          // Softer fill (0.6) so it reads as a background and the white flow
          // particles stay legible on top, Windy-style.
          upsertSstImage(glLayerRef.current, solid, west, east, north, south, 0.6);
        } else {
          blobUrlsRef.current.push(dataURL);
          const raster = L.imageOverlay(dataURL, [[south, west], [north, east]], { opacity: 0.6, interactive: false });
          raster.addTo(mapRef.current); windRasterOverlayRef.current = raster;
        }
      });
      return () => { _ac_wind.abort(); };
    }
  }, [mapReady, windActive, windData, windHourIndex, isWindMap, waterMaskVersion]);

  // ── Isotherm layer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    [isothermLayerRef, breakLayerRef, breakGlowRef].forEach(r => { if (r.current) { map.removeLayer(r.current); r.current = null; } });
    if (!showIsotherm || activeDataLayer !== "sst" && activeDataLayer !== "composite") return;
    // For composite mode, build a flat grid from compositeData
    let isoLatSet = latSet, isoLonSet = lonSet, isoGrid = grid;
    if (activeDataLayer === "composite" && compositeDataRef.current?.latSet?.length) {
      const cd = compositeDataRef.current;
      isoLatSet = cd.latSet;
      isoLonSet = cd.lonSet;
      isoGrid = {};
      const nLons = cd.lonSet.length;
      for (let i = 0; i < cd.latSet.length; i++) {
        for (let j = 0; j < nLons; j++) {
          const v = cd.sst[i * nLons + j]; if (v != null && Number.isFinite(v)) isoGrid[`${cd.latSet[i]}_${cd.lonSet[j]}`] = v;
        }
      }
    }
    if (!isoLatSet.length) return;
    const tid = setTimeout(() => {
      try {
        const { isotherms, breaks } = buildIsothermLines(isoLatSet, isoLonSet, isoGrid, effectiveTargetTemp, isothermalSensitivity);
        if (isotherms.length) {
          const lyr = L.layerGroup();
          isotherms.forEach(line => L.polyline(line, { color: "rgba(255,255,255,0.65)", weight: 1.5, dashArray: "3 4", interactive: false }).addTo(lyr));
          lyr.addTo(map); isothermLayerRef.current = lyr;
        }
        if (breaks.length) {
          const glow = L.layerGroup();
          breaks.forEach(line => L.polyline(line, { color: "rgba(0,207,255,0.35)", weight: 7, opacity: 1.0, interactive: false }).addTo(glow));
          glow.addTo(map); breakGlowRef.current = glow;
          const main = L.layerGroup();
          breaks.forEach(line => L.polyline(line, { color: "#00cfff", weight: 2.5, opacity: 0.97, interactive: false }).addTo(main));
          main.addTo(map); breakLayerRef.current = main;
        }
      } catch(err) { console.error("[ISOTHERM] computation failed:", err); }
    }, 60);
    return () => clearTimeout(tid);
  }, [mapReady, showIsotherm, latSet, lonSet, grid, effectiveTargetTemp, isothermalSensitivity, activeDataLayer, compositeData, waterMaskVersion, repaintTrigger]);

  // ── Bathy tile layer (CloudFront raster PNG) ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (bathyTileRef.current) { try { map.removeLayer(bathyTileRef.current); } catch(_){} bathyTileRef.current = null; }
    if (!showBathyRaster || !BATHY_TILE_URL) return;
    const lyr = L.tileLayer(BATHY_TILE_URL, {
      pane: 'bathyTilePane',
      minZoom: 5,
      maxNativeZoom: 11,
      maxZoom: 18,
      opacity: 1,
      attribution: '',
      interactive: false,
    });
    lyr.addTo(map);
    bathyTileRef.current = lyr;
    return () => {
      if (bathyTileRef.current) { try { map.removeLayer(bathyTileRef.current); } catch(_){} bathyTileRef.current = null; }
    };
  }, [mapReady, showBathyRaster, BATHY_TILE_URL]);

  // ── Radar (RainViewer, Pro, all regions) ─────────────────────────────────────
  // Behaves like Shaded Relief (a Tools-section, full basemap-replace mode) rather
  // than an additive Overlay — see the showRadarOverlay bail-outs added to the SST
  // and CHL/composite/seacolor/altimetry overlay effects below. RainViewer is a
  // free public radar-tile API (no key required), global coverage.
  //
  // Frame-list fetch: pulls ~2 hours of past 10-min frames so the time slider has
  // something to scrub through, not just the single latest frame.
  useEffect(() => {
    if (!showRadarOverlay) { setRadarFrames([]); return; }

    let cancelled = false;
    const fetchFrames = () => {
      fetch("https://api.rainviewer.com/public/weather-maps.json")
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => {
          if (cancelled) return;
          const frames = d?.radar?.past ?? [];
          if (!frames.length) return;
          setRadarHost(d.host);
          setRadarFrames(frames);
          // Stay pinned to "latest" across a refresh unless the user has scrubbed back;
          // simplest signal for that in this POC is: was already at the last index.
          setRadarFrameIndex(i => (i === 0 ? frames.length - 1 : Math.min(i, frames.length - 1)));
        })
        .catch(err => console.error("[RADAR] RainViewer frame list fetch failed:", err));
    };
    fetchFrames();
    // RainViewer's mosaic updates roughly every 10 minutes — refresh on the same cadence.
    const intervalId = setInterval(fetchFrames, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(intervalId); };
  }, [showRadarOverlay, regionConfig]);

  // Tile-render effect: crossfades to the tile layer for whichever frame is selected,
  // instead of popping instantly. RainViewer frames are real 10-min steps (see
  // RADAR_FADE_MS below) -- this only smooths the *transition* between them, it doesn't
  // add real intermediate data.
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    const RADAR_OPACITY = 0.85;
    const RADAR_FADE_MS = 350;

    // Radar turned off, region invalid, or no frames yet -- hard-clear both layers.
    if (!showRadarOverlay || !radarHost || !radarFrames.length) {
      if (radarFadeTimerRef.current) { clearTimeout(radarFadeTimerRef.current); radarFadeTimerRef.current = null; }
      if (radarFadeOutRef.current) { try { map.removeLayer(radarFadeOutRef.current); } catch(_){} radarFadeOutRef.current = null; }
      if (radarTileRef.current) { try { map.removeLayer(radarTileRef.current); } catch(_){} radarTileRef.current = null; }
      return;
    }

    const frame = radarFrames[radarFrameIndex] ?? radarFrames[radarFrames.length - 1];
    if (!frame?.path) return;

    const prevLyr = radarTileRef.current;
    const newLyr = L.tileLayer(`${radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      pane: "radarPane",
      opacity: 0,
      maxNativeZoom: 7,
      maxZoom: 18,
      attribution: "Weather radar &copy; RainViewer",
      interactive: false,
    });
    newLyr.addTo(map);
    radarTileRef.current = newLyr;

    // Fast scrubbing can retrigger this effect before a prior fade finishes -- snap any
    // still-fading layer out immediately rather than letting tile layers pile up.
    if (radarFadeTimerRef.current) { clearTimeout(radarFadeTimerRef.current); radarFadeTimerRef.current = null; }
    if (radarFadeOutRef.current && radarFadeOutRef.current !== prevLyr) {
      try { map.removeLayer(radarFadeOutRef.current); } catch(_){}
    }
    radarFadeOutRef.current = prevLyr || null;

    const newContainer = newLyr.getContainer?.();
    if (newContainer) newContainer.style.transition = `opacity ${RADAR_FADE_MS}ms linear`;
    const prevContainer = prevLyr?.getContainer?.();
    if (prevContainer) prevContainer.style.transition = `opacity ${RADAR_FADE_MS}ms linear`;

    // Defer the actual opacity change a frame so the transition above is registered
    // before it fires -- setting both synchronously would skip straight to the end state.
    const raf = requestAnimationFrame(() => {
      newLyr.setOpacity(RADAR_OPACITY);
      if (prevLyr) prevLyr.setOpacity(0);
    });

    if (prevLyr) {
      radarFadeTimerRef.current = setTimeout(() => {
        try { map.removeLayer(prevLyr); } catch(_){}
        if (radarFadeOutRef.current === prevLyr) radarFadeOutRef.current = null;
        radarFadeTimerRef.current = null;
      }, RADAR_FADE_MS + 50);
    }

    return () => { cancelAnimationFrame(raf); };
  }, [mapReady, showRadarOverlay, radarHost, radarFrames, radarFrameIndex]);

  // ── Bathymetry ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !showBathyLayer || jsonContours) return;
    setJsonContoursLoading(true);
    const _bust = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const _MA_BATHY_CONTOURS = `https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry_contours.json?v=${_bust}`;
    fetch(BATHY_CONTOURS_URL.includes("?") ? BATHY_CONTOURS_URL : BATHY_CONTOURS_URL + `?v=${_bust}`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { setJsonContours(d); setJsonContoursLoading(false); })
      .catch(() => {
        if (BATHY_CONTOURS_URL !== _MA_BATHY_CONTOURS) {
          fetch(_MA_BATHY_CONTOURS).then(r=>r.json()).then(d=>{setJsonContours(d);setJsonContoursLoading(false);}).catch(()=>setJsonContoursLoading(false));
        } else { setJsonContoursLoading(false); }
      });
  }, [mapReady, showBathyLayer]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (bathyLayerRef.current) { map.removeLayer(bathyLayerRef.current); bathyLayerRef.current = null; }
    if (bathyLabelRef.current) { map.removeLayer(bathyLabelRef.current); bathyLabelRef.current = null; }
    if (!showBathyLayer || !jsonContours) return;
    // Two-pass draw for legibility over vivid SST: a soft white casing underneath,
    // then a darker navy line on top. Both live in bathyPane (above the data raster).
    const bathyWeight = d => (d >= 1200 ? 1.5 : d >= 600 ? 1.3 : d >= 300 ? 1.1 : d >= 100 ? 1.0 : d >= 60 ? 0.9 : 0.8);
    const bathyMain   = d => {
      if (d >= 1200) return { color: "rgba(15,23,42,0.92)", weight: bathyWeight(d), opacity: 0.92 };
      if (d >= 600)  return { color: "rgba(20,30,55,0.88)", weight: bathyWeight(d), opacity: 0.88 };
      if (d >= 300)  return { color: "rgba(25,38,65,0.84)", weight: bathyWeight(d), opacity: 0.84 };
      if (d >= 100)  return { color: "rgba(30,45,72,0.78)", weight: bathyWeight(d), opacity: 0.78 };
      if (d >= 60)   return { color: "rgba(35,50,80,0.70)", weight: bathyWeight(d), opacity: 0.70 };
      return              { color: "rgba(40,55,88,0.62)", weight: bathyWeight(d), opacity: 0.62 };
    };
    const casing = L.geoJSON(jsonContours, {
      interactive: false, pane: "bathyPane",
      style: f => ({ color: "rgba(255,255,255,0.55)", weight: bathyWeight(f.properties.depth_ft) + 1.8, opacity: 0.45 }),
    });
    const mainLines = L.geoJSON(jsonContours, {
      interactive: false, pane: "bathyPane",
      style: f => bathyMain(f.properties.depth_ft),
    });
    const lyr = L.layerGroup([casing, mainLines]);
    lyr.addTo(map); bathyLayerRef.current = lyr;

    const LABEL_ZOOM = 10;
    function buildLabelLayer() {
      if (bathyLabelRef.current) { map.removeLayer(bathyLabelRef.current); bathyLabelRef.current = null; }
      if (map.getZoom() < LABEL_ZOOM) return;
      const bounds = map.getBounds();
      const labelGroup = L.layerGroup();
      const depthLabelCount = {};
      jsonContours.features?.forEach(f => {
        const d = f.properties?.depth_ft; if (!d || d < 30) return;
        const fathoms = Math.round(d / 6), label = `${fathoms} fa`, color = d >= 1200 ? "#1a2d5a" : "#253560";
        const geom = f.geometry;
        const rings = geom.type === "LineString" ? [geom.coordinates] : geom.type === "MultiLineString" ? geom.coordinates : [];
        rings.forEach(coords => {
          if (!coords || coords.length < 2) return;
          let bestRun = [], currentRun = [];
          coords.forEach(([lon, lat]) => { if (bounds.contains([lat, lon])) { currentRun.push([lon, lat]); } else { if (currentRun.length > bestRun.length) bestRun = currentRun; currentRun = []; } });
          if (currentRun.length > bestRun.length) bestRun = currentRun;
          if (bestRun.length < 12) return;
          const count = depthLabelCount[d] || 0; if (count >= 5) return; depthLabelCount[d] = count + 1;
          const mid = bestRun[Math.floor(bestRun.length / 2)]; const [lon, lat] = mid;
          const icon = L.divIcon({ className: "", html: `<div style="font-size:10px;font-weight:600;font-family:system-ui,sans-serif;color:${color};text-shadow:1px 1px 0 rgba(255,255,255,0.92),-1px 1px 0 rgba(255,255,255,0.92),1px -1px 0 rgba(255,255,255,0.92),-1px -1px 0 rgba(255,255,255,0.92),0 1px 0 rgba(255,255,255,0.92),0 -1px 0 rgba(255,255,255,0.92);white-space:nowrap;pointer-events:none;line-height:1;">${label}</div>`, iconSize: null, iconAnchor: [0, 6] });
          L.marker([lat, lon], { icon, interactive: false, keyboard: false, pane: "bathyPane" }).addTo(labelGroup);
        });
      });
      labelGroup.addTo(map); bathyLabelRef.current = labelGroup;
    }
    buildLabelLayer();
    map.on("zoomend", buildLabelLayer); map.on("moveend", buildLabelLayer);
    return () => {
      map.off("zoomend", buildLabelLayer); map.off("moveend", buildLabelLayer);
      if (bathyLabelRef.current) { map.removeLayer(bathyLabelRef.current); bathyLabelRef.current = null; }
    };
  }, [mapReady, showBathyLayer, jsonContours]);

  // ── Wrecks ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showWrecks || wrecksData) return;
    setWrecksLoading(true);
    fetch(WRECKS_URL).then(r=>r.json()).then(d=>{setWrecksData(d);setWrecksLoading(false);}).catch(()=>setWrecksLoading(false));
  }, [showWrecks]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (wreckLayerRef.current) { map.removeLayer(wreckLayerRef.current); wreckLayerRef.current = null; }
    if (!showWrecks || !wrecksData) return;
    const lyr = L.layerGroup();
    // Bottom features are shown for the whole loaded map region regardless of
    // which departure port is selected -- no per-port wreckRegion filtering.
    wrecksData.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties || {};
      if (lat<regionBounds.south||lat>regionBounds.north||lon<regionBounds.west||lon>regionBounds.east) return;
      const fKey = `${(props.name ?? "").trim()}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
      if (wreckRemovedKeys?.has(fKey)) return;
      const wreckIcon = L.divIcon({ className:"", html:'<div style="width:12px;height:12px;border-radius:50%;background:#CAD8DB;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>', iconSize:[12,12], iconAnchor:[6,6] });
      const m = L.marker([lat, lon], { icon: wreckIcon });
      const showPopup = e => { const containerPt=map.latLngToContainerPoint(e.latlng); setHoveredWreck({px:containerPt.x,py:containerPt.y,props,lat,lon}); try{map.getContainer().style.cursor="pointer";}catch(_){} };
      m.on("mouseover", showPopup);
      m.on("click", e => {
        L.DomEvent.stopPropagation(e);
        if (tripModeRef.current) {
          onAddWaypoint?.(lat, lon, props.name || (props.symbol === "Wreck" ? "Wreck" : "Structure"));
          return;
        }
        showPopup(e);
      });
      m.on("mouseout", () => {
        setHoveredWreck(null);
        try {
          const XHAIR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cline x1='8' y1='0' x2='8' y2='16' stroke='%23111' stroke-width='1.2'/%3E%3Cline x1='0' y1='8' x2='16' y2='8' stroke='%23111' stroke-width='1.2'/%3E%3Ccircle cx='8' cy='8' r='2.5' fill='none' stroke='%23111' stroke-width='1.2'/%3E%3C/svg%3E") 8 8, crosshair`;
          // Priority matches whichever mode's own effect last set the base
          // cursor (communityPinDropRef: report-posting pin-drop crosshair;
          // tripModeRef: route-planning crosshair; interactionModeRef: the
          // Inspect-tool toggle) -- previously only the last of these was
          // checked, so the other two modes' crosshair never got restored.
          const wantCrosshair = communityPinDropRef.current || tripModeRef.current || interactionModeRef.current === "crosshair";
          map.getContainer().style.cursor = wantCrosshair ? XHAIR : "grab";
        } catch(_) {}
      });
      m.addTo(lyr);
    });
    lyr.addTo(map); wreckLayerRef.current = lyr;
  }, [mapReady, showWrecks, wrecksData, selectedLocation, regionBounds, wreckRemovedKeys]);

  // ── Weather Buoys ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showBuoys || buoysData) return;
    setBuoysLoading(true);
    fetch(BUOYS_URL).then(r => r.json()).then(d => { setBuoysData(d); setBuoysLoading(false); })
      .catch(() => setBuoysLoading(false));
  }, [showBuoys]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (buoyLayerRef.current) { map.removeLayer(buoyLayerRef.current); buoyLayerRef.current = null; }
    if (!showBuoys || !buoysData?.buoys?.length) return;
    const loc = selectedLocationRef.current;
    const RADIUS_NM = 75;   // only show buoys within this range of the departure location
    // VA-RI spans a long, port-sparse coastline (Chincoteague to Rhode Island) where a
    // 75nm departure-location radius hides buoys that are still clearly relevant to the
    // region (e.g. 44009 off Cape May). Show every buoy in the region's bounds instead.
    const showAllInRegion = regionKey === "va_ri";
    const lyr = L.layerGroup();
    buoysData.buoys.forEach(b => {
      if (b.lat == null || b.lon == null) return;
      if (showAllInRegion) {
        if (regionBounds && (b.lat < regionBounds.south || b.lat > regionBounds.north ||
            b.lon < regionBounds.west || b.lon > regionBounds.east)) return;
      } else if (loc && distanceNm(loc.lat, loc.lon, b.lat, b.lon) > RADIUS_NM) return;
      // Uniform navy buoy dot with a white center, identical for every buoy.
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#1e3a8a;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:50%;background:#fff;"></div></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      const m = L.marker([b.lat, b.lon], { icon, zIndexOffset: 850 });
      // Custom popup clamped to the map view (flips above/below the marker). Leaflet's
      // autoPan can't help when the map is zoomed to fit the region (no pan room).
      m.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        const pt = map.latLngToContainerPoint(e.latlng);
        const size = map.getSize();
        const CW = 230, CH = 168, MG = 10, TOP = 8;
        const left  = Math.max(MG, Math.min(pt.x - CW / 2, size.x - CW - MG));
        const above = pt.y > (CH + TOP + 16);
        const top   = above ? Math.max(TOP, pt.y - 16 - CH) : Math.min(pt.y + 16, size.y - CH - MG);
        setBuoyPopup({ left, top, b, loc });
      });
      m.addTo(lyr);
    });
    lyr.addTo(map); buoyLayerRef.current = lyr;
    const closeBuoy = () => setBuoyPopup(null);
    map.on("click movestart zoomstart", closeBuoy);
    return () => {
      map.off("click movestart zoomstart", closeBuoy);
      if (buoyLayerRef.current) { map.removeLayer(buoyLayerRef.current); buoyLayerRef.current = null; }
      setBuoyPopup(null);
    };
  }, [mapReady, showBuoys, buoysData, selectedLocation, regionKey, regionBounds]);

  // ── Fish hotspots ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (hotspotLayerRef.current) {
      map.removeLayer(hotspotLayerRef.current);
      hotspotLayerRef.current = null;
    }
    setHotspotPopup(null);
    setHotspotWarningOpen(false);
    if (!showHotspots || !hotspotData || !selectedFishSpecies) return;
    const sp = hotspotData.species?.[selectedFishSpecies];
    if (!sp?.zones?.length) return;
    const spConf = FISH_SPECIES.find(s => s.key === selectedFishSpecies) || { color: "#f59e0b" };
    const color = spConf.color;

    const drawHandlers = [];

    const compAge = compositeAgeInfo(compositeDate);
    console.log("[HOTSPOT] compositeDate:", compositeDate, "compAge:", compAge);
    const showCloudWarning = compAge !== null && compAge.ageHours > 12;

    const lyr = L.layerGroup();

    sp.zones.forEach(zone => {
      const c   = zone.conditions;
      const brk = c.break_strength ? c.break_strength[0].toUpperCase() + c.break_strength.slice(1) : "—";

      const seasonBadge = zone.in_season === false
        ? `<span style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:5px">Off Season</span>`
        : `<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:5px">In Season</span>`;

      const habitatLine = zone.habitat_score != null && zone.seasonal_factor != null
        ? `<div style="color:#94a3b8;font-size:10px;margin-bottom:2px">habitat ${(zone.habitat_score * 100).toFixed(0)}% &times; ${zone.seasonal_factor.toFixed(2)} seasonal</div>`
        : "";

      const chlDisplay = c.chl_mg_m3 != null ? `${c.chl_mg_m3.toFixed(2)} mg/m³` : "—";

      const cloudWarning = showCloudWarning
        ? `No imagery available within the last ${compAge.ageHours} hours. Most recent data: ${compAge.dateLabel}. These recommendations are based on the most recent imagery available — keep this in mind when planning your trip.`
        : null;

      const narrativeBlock = zone.narrative
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e2e8f0;color:#334155;font-size:11px;line-height:1.55;font-style:italic">${zone.narrative}</div>`
        : "";

      const popupHtml =
        `<div style="font-size:12px;line-height:1.7;max-width:270px">` +
        `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;margin-bottom:1px"><b>Zone ${zone.rank} &middot; ${(zone.score * 100).toFixed(0)}% match</b>${seasonBadge}</div>` +
        habitatLine +
        `SST: ${c.sst_f ?? "—"}°F &middot; Break: ${brk}<br/>` +
        `Depth: ${c.depth_ft != null ? Math.round(c.depth_ft) + "ft" : "—"} &middot; CHL: ${chlDisplay}<br/>` +
        `Area: ~${zone.area_sq_nm} sq nm` +
        narrativeBlock +
        `</div>`;

      const latlngs = zone.polygon.map(([lat, lon]) => [lat, lon]);
      const lats = latlngs.map(p => p[0]);
      const lons = latlngs.map(p => p[1]);
      const PAD_DEG = 0.05;
      const bounds = L.latLngBounds(
        [Math.min(...lats) - PAD_DEG, Math.min(...lons) - PAD_DEG],
        [Math.max(...lats) + PAD_DEG, Math.max(...lons) + PAD_DEG]
      );

      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svgEl.style.overflow = "visible";
      svgEl.style.pointerEvents = "none";
      const svgOverlay = L.svgOverlay(svgEl, bounds, { interactive: true, zIndex: 200 });

      const seed = Math.round((zone.center[0] * 1000 + zone.center[1] * 1000));
      function seededRand(i) { const x = Math.sin(seed + i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
      const strokeColor = selectedFishSpecies === "yellowfin" ? "#FFFFFF" : color;

      function drawShape() {
        const nw = map.latLngToContainerPoint(bounds.getNorthWest());
        const se = map.latLngToContainerPoint(bounds.getSouthEast());
        const W = Math.max(se.x - nw.x, 10);
        const H = Math.max(se.y - nw.y, 10);
        svgEl.setAttribute("width", W);
        svgEl.setAttribute("height", H);
        svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);

        const localPts = latlngs.map(([lat, lon]) => {
          const p = map.latLngToContainerPoint([lat, lon]);
          return [p.x - nw.x, p.y - nw.y];
        });

        // Convex hull — guarantees base shape never self-intersects
        function convexHull(pts) {
          const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
          const lo = [], hi = [];
          for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p); }
          for (let i = s.length-1; i >= 0; i--) { const p = s[i]; while (hi.length >= 2 && cross(hi[hi.length-2], hi[hi.length-1], p) <= 0) hi.pop(); hi.push(p); }
          hi.pop(); lo.pop(); return lo.concat(hi);
        }
        const hull = convexHull(localPts);
        const hn = hull.length;
        const N = 20;
        const cx = hull.reduce((s, p) => s + p[0], 0) / hn;
        const cy = hull.reduce((s, p) => s + p[1], 0) / hn;

        // Resample to N evenly-spaced points + gentle outward wobble
        const perim = [];
        for (let i = 0; i < N; i++) {
          const t = (i / N) * hn, i0 = Math.floor(t) % hn, i1 = (i0 + 1) % hn, f = t - Math.floor(t);
          perim.push([hull[i0][0]*(1-f) + hull[i1][0]*f, hull[i0][1]*(1-f) + hull[i1][1]*f]);
        }
        const wX = Math.min(W, H) * 0.025;
        const wobbly = perim.map(([x, y], i) => {
          const dx = x - cx, dy = y - cy, len = Math.sqrt(dx*dx + dy*dy) || 1;
          const r = (seededRand(i) - 0.3) * wX;
          return [x + (dx/len)*r, y + (dy/len)*r];
        });

        // Low-tension catmull-rom (t=0.25) — smooth curves, no overshoot
        function smoothPath(pts) {
          const n = pts.length;
          let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
          for (let i = 0; i < n; i++) {
            const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
            const t = 0.25;
            const cp1x = p1[0] + (p2[0]-p0[0])*t, cp1y = p1[1] + (p2[1]-p0[1])*t;
            const cp2x = p2[0] - (p3[0]-p1[0])*t, cp2y = p2[1] - (p3[1]-p1[1])*t;
            d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
          }
          return d + " Z";
        }

        svgEl.innerHTML = `<path d="${smoothPath(wobbly)}" fill="${color}" fill-opacity="0.12" stroke="${strokeColor}" stroke-opacity="0.9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      svgOverlay.addTo(lyr);
      requestAnimationFrame(drawShape);
      drawHandlers.push(drawShape);
      map.on("zoomend moveend", drawShape);

      svgEl.style.pointerEvents = "auto";
      svgEl.style.cursor = "pointer";
      svgEl.addEventListener("click", (e) => {
        const containerPt = map.latLngToContainerPoint(zone.center);
        setHotspotPopup({ html: popupHtml, cloudWarning, x: containerPt.x, y: containerPt.y });
        e.stopPropagation();
      });

      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:#fff;font-size:10px;font-weight:700;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${zone.rank}</div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      const marker = L.marker(zone.center, { icon, interactive: true });
      marker.on("click", (e) => {
        const containerPt = map.latLngToContainerPoint(zone.center);
        setHotspotPopup({ html: popupHtml, cloudWarning, x: containerPt.x, y: containerPt.y });
        L.DomEvent.stopPropagation(e);
      });
      marker.addTo(lyr);
    });

    lyr.addTo(map);
    hotspotLayerRef.current = lyr;

    return () => {
      drawHandlers.forEach(fn => map.off("zoomend moveend", fn));
      if (hotspotLayerRef.current) {
        map.removeLayer(hotspotLayerRef.current);
        hotspotLayerRef.current = null;
      }
    };
  }, [mapReady, showHotspots, hotspotData, selectedFishSpecies, compositeDate]);

  // ── Saved location markers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (markersLayerRef.current) { map.removeLayer(markersLayerRef.current); markersLayerRef.current = null; }
    if (!markers.length) return;
    const lyr = L.layerGroup();
    markers.forEach((mk, i) => {
      const isHighlighted = highlightedLocation && mk.id && String(mk.id) === String(highlightedLocation.id);
      const dotHtml = isHighlighted
        ? '<div style="width:14px;height:14px;background:#f97316;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #f97316,0 1px 4px rgba(0,0,0,0.4);"></div>'
        : '<div style="width:12px;height:12px;background:#f97316;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></div>';
      const icon = L.divIcon({ className:"", html: dotHtml, iconSize: isHighlighted ? [14,14] : [12,12], iconAnchor: isHighlighted ? [7,7] : [6,6] });
      const m = L.marker([mk.lat, mk.lon], { icon, interactive: true });
      const openMarker = () => {
        if (tripModeRef.current) {
          // In trip-planning mode: add this saved location as a waypoint
          onAddWaypoint?.(mk.lat, mk.lon, mk.label || mk.name || "");
          return;
        }
        const containerPt = map.latLngToContainerPoint([mk.lat, mk.lon]);
        setSelectedMarker({ px: containerPt.x, py: containerPt.y, mk: { ...mk, index: i } });
        setClickInfo(null);
      };
      m.on("click", e => { L.DomEvent.stopPropagation(e); openMarker(); });
      m.on("touchstart", e => { L.DomEvent.stopPropagation(e); L.DomEvent.preventDefault(e); openMarker(); });
      m.addTo(lyr);
    });
    lyr.addTo(map); markersLayerRef.current = lyr;
  }, [mapReady, markers, highlightedLocation]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (refMarkerRef.current) { map.removeLayer(refMarkerRef.current); refMarkerRef.current = null; }
    if (!selectedLocation) return;
    const icon = L.divIcon({ className:"", html:'<div style="width:14px;height:14px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>', iconSize:[14,14], iconAnchor:[7,7] });
    const m = L.marker([selectedLocation.lat, selectedLocation.lon], { icon });
    // In trip mode: clicking the selected-location blue dot adds it as a waypoint
    // instead of opening the popup (which would swallow the click).
    m.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (tripModeRef.current) {
        onAddWaypoint?.(selectedLocation.lat, selectedLocation.lon, selectedLocation.label || "");
      } else {
        m.openPopup();
      }
    });
    m.bindPopup(selectedLocation.label);
    m.addTo(map); refMarkerRef.current = m;
  }, [mapReady, selectedLocation]);

  useEffect(() => {
    if (!sstReady) return;
    const _bathyUrl = BATHY_URL || "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry.json";
    const _MA_BATHY_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry.json";
    fetch(_bathyUrl)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { setBathyData(d); bathyDataRef.current = d; })
      .catch(() => {
        if (_bathyUrl !== _MA_BATHY_URL) {
          fetch(_MA_BATHY_URL).then(r=>r.json()).then(d=>{ setBathyData(d); bathyDataRef.current = d; }).catch(()=>{});
        }
      });
  }, [sstReady]);

  // One-time refit after SST overlay first renders — by this point the layout is
  // fully settled and map.getSize() returns the true container height. The early
  // applyFillZoom calls may have run before layout was complete (sz.y==0, wrong vpH).
  useEffect(() => {
    const map = mapRef.current;
    if (!sstReady || !mapReady || !map || userInteractedRef.current) return;
    const t = setTimeout(() => {
      if (userInteractedRef.current) return;
      try {
        map.invalidateSize();
        const sz = map.getSize();
        const vpH = window.visualViewport?.height || window.innerHeight || 0;
        const _cw = sz.x || 800, _ch = sz.y || vpH || 500;
        const _mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
        const _mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
        const _mH = _mN - _mS, _lR = regionBounds.east - regionBounds.west;
        const fz = Math.max(Math.log2((_cw * 360) / (256 * _lR)), Math.log2((_ch * 2 * Math.PI) / (256 * _mH)));
        map.setView(mercCenter, fz, { animate: false });
        let g = 0;
        while (g++ < 15) {
          const vb = map.getBounds();
          if (vb.getNorth() <= regionBounds.north + 0.02 && vb.getSouth() >= regionBounds.south - 0.02) break;
          map.setView(mercCenter, map.getZoom() + 0.1, { animate: false });
        }
        const _db2 = dataBoundsRef.current;
        map.setMinZoom(map.getZoom()); map.setMaxBounds(_db2 ? [[_db2.south, _db2.west], [_db2.north, _db2.east]] : llBounds);
      } catch(_) {}
    }, 150);
    return () => clearTimeout(t);
  }, [sstReady, mapReady]);

  useEffect(() => { if (flyToRef) flyToRef.current = (lat, lon) => { const map = mapRef.current; if (!map) return; map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true }); }; }, [flyToRef]);
  if (openControlPanelRef) openControlPanelRef.current = () => setPanelCollapsed(false);
  useEffect(() => {
    if (clearMarkersRef) clearMarkersRef.current = id => {
      if (id === null) { setMarkers([]); setSelectedMarker(null); }
      else { setMarkers(m => m.filter(mk => mk.id !== id)); setSelectedMarker(sm => sm?.mk?.id === id ? null : sm); }
    };
  }, [clearMarkersRef]);

  const sliderHeight = (windActive ? 80 : 0) + (showRadarOverlay && radarFrames.length ? 72 : 0);
  const radarSliderBottom = windActive ? 80 : 0;
  const showRangeControl = activeDataLayer === "sst";

  return (
    <>
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full p-0 overflow-hidden w-full">
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="relative bg-slate-100 flex-1 flex flex-col overflow-hidden min-h-0">
          <div ref={mapDivRef} className="rounded overflow-hidden flex-1"
               style={{ background: "transparent", width: "100%", height: `calc(100% - ${sliderHeight}px)` }} />

          {/* Desktop collapsed icon column — mirrors mobile right rail */}
          {panelCollapsed && (
            <div className="hidden sm:flex absolute flex-col gap-1" style={{ right: 8, top: 8, zIndex: 501 }}>
              {/* Expand */}
              <button onClick={() => setPanelCollapsed(false)} title="Show controls"
                className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                style={{ width:32, height:32, padding:0 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#0e7490" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/>
                </svg>
              </button>
              {/* SST */}
              <button onClick={() => { setActiveDataLayer("sst"); setPanelCollapsed(false); }} title="SST"
                className="flex items-center justify-center rounded-lg shadow-sm border transition-colors"
                style={{ width:32, height:32, padding:0, background: activeDataLayer==="sst"||activeDataLayer==="composite"?"#0891b2":"rgba(255,255,255,0.9)", borderColor: activeDataLayer==="sst"||activeDataLayer==="composite"?"#0891b2":"#e2e8f0" }}>
                <span style={{ fontSize:10, fontWeight:700, color: activeDataLayer==="sst"||activeDataLayer==="composite"?"#fff":"#64748b", lineHeight:1 }}>SST</span>
              </button>
              {/* CHL */}
              <button onClick={() => { setActiveDataLayer("chlorophyll"); setPanelCollapsed(false); }} title="Chlorophyll"
                className="flex items-center justify-center rounded-lg shadow-sm border transition-colors"
                style={{ width:32, height:32, padding:0, background: activeDataLayer==="chlorophyll"?"#16a34a":"rgba(255,255,255,0.9)", borderColor: activeDataLayer==="chlorophyll"?"#16a34a":"#e2e8f0" }}>
                <span style={{ fontSize:10, fontWeight:700, color: activeDataLayer==="chlorophyll"?"#fff":"#64748b", lineHeight:1 }}>CHL</span>
              </button>
              {/* Sea color */}
              <button onClick={() => { setActiveDataLayer("seacolor"); setPanelCollapsed(false); }} title="Sea Color"
                className="flex items-center justify-center rounded-lg shadow-sm border transition-colors"
                style={{ width:32, height:32, padding:0, background: activeDataLayer==="seacolor"?"#0d9488":"rgba(255,255,255,0.9)", borderColor: activeDataLayer==="seacolor"?"#0d9488":"#e2e8f0" }}>
                <span style={{ fontSize:9, fontWeight:700, color: activeDataLayer==="seacolor"?"#fff":"#64748b", lineHeight:1 }}>SC</span>
              </button>
              {/* Wind */}
              <button onClick={() => { setActiveDataLayer("windmap"); setPanelCollapsed(false); }} title="Wind"
                className="flex items-center justify-center rounded-lg shadow-sm border transition-colors"
                style={{ width:32, height:32, padding:0, background: activeDataLayer==="windmap"?"#0284c7":"rgba(255,255,255,0.9)", borderColor: activeDataLayer==="windmap"?"#0284c7":"#e2e8f0" }}>
                <Wind style={{ width:14, height:14, color: activeDataLayer==="windmap"?"#fff":"#64748b" }}/>
              </button>
              {/* divider */}
              <div style={{ height:1, background:"#e2e8f0", margin:"2px 4px" }}/>
              {/* Pan */}
              <button onClick={() => setInteractionMode("pan")} title="Pan"
                className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                style={{ width:32, height:32, padding:0, borderColor:interactionMode==="pan"?"#334155":undefined, background:interactionMode==="pan"?"#334155":undefined }}>
                <Move className={`w-4 h-4 ${interactionMode==="pan"?"text-white":"text-slate-500"}`}/>
              </button>
              {/* Inspect */}
              <button onClick={() => setInteractionMode("crosshair")} title="Inspect"
                className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                style={{ width:32, height:32, padding:0, borderColor:interactionMode==="crosshair"?"#0891b2":undefined, background:interactionMode==="crosshair"?"#0891b2":undefined }}>
                <Crosshair className={`w-4 h-4 ${interactionMode==="crosshair"?"text-white":"text-slate-500"}`}/>
              </button>
              {/* Saved */}
              <button onClick={() => setShowSavedPanel(p => !p)} title="Saved locations"
                className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
                style={{ width:32, height:32, padding:0, borderColor:showSavedPanel?"#f97316":undefined, background:showSavedPanel?"#f97316":undefined }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={showSavedPanel?"white":"#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              </button>
              {/* Community layer toggle */}
              <button onClick={() => setShowCommunityLayer(p => !p)} title="Community pins"
                className="flex items-center justify-center rounded-lg shadow-sm border transition-colors"
                style={{ width:32, height:32, padding:0, background:showCommunityLayer?"#84cc16":"rgba(255,255,255,0.9)", borderColor:showCommunityLayer?"#84cc16":"#e2e8f0" }}>
                <span style={{ fontSize:9, fontWeight:700, color:showCommunityLayer?"#fff":"#64748b", lineHeight:1 }}>COM</span>
              </button>
            </div>
          )}

          {/* Desktop control panel */}
          <MapControlPanel
            panelRef={controlPanelRef}
            onPointerEnter={() => { isOverControlPanel.current = true; setHoverInfo(null); }}
            onPointerLeave={() => { isOverControlPanel.current = false; }}
            interactionMode={interactionMode} setInteractionMode={setInteractionMode}
            activeDataLayer={activeDataLayer} setActiveDataLayer={setActiveDataLayer}
            dataSource={dataSource} setDataSource={setDataSource}
            viirsData={viirsData} viirsDateIndex={viirsDateIndex} setViirsDateIndex={setViirsDateIndex}
            viirsHour={viirsHour} setViirsHour={setViirsHour}
            murData={murData} murDateIndex={murDateIndex} setMurDateIndex={setMurDateIndex}
            goesCompData={goesCompData} goesCompDateIndex={goesCompDateIndex} setGoesCompDateIndex={setGoesCompDateIndex} activeGoesCompDay={activeGoesCompDay}
            viirsNppData={viirsNppData} viirsNppDateIndex={viirsNppDateIndex} setViirsNppDateIndex={setViirsNppDateIndex} activeViirsNppDay={activeViirsNppDay}
            date={date}
            chlData={chlData} chlDateIndex={chlDateIndex} setChlDateIndex={setChlDateIndex} chlLoading={chlLoading}
            chlSource={chlSource} setChlSource={setChlSource}
            chlCompositeDates={chlCompositeDates} chlCompositeDateIndex={chlCompositeDateIndex} setChlCompositeDateIndex={setChlCompositeDateIndex}
            seaColorData={seaColorData} seaColorDateIndex={seaColorDateIndex} setSeaColorDateIndex={setSeaColorDateIndex} seaColorLoading={seaColorLoading}
            seaColorSource={seaColorSource} setSeaColorSource={setSeaColorSource}
            seaColorCompositeDates={seaColorCompositeDates} seaColorCompositeDateIndex={seaColorCompositeDateIndex} setSeaColorCompositeDateIndex={setSeaColorCompositeDateIndex}
            windLoading={windLoading}
            sstRange={sstRange} onSstRangeChange={onSstRangeChange} userId={userId} rangeControlOpenRef={rangeControlOpenRef}
            seasonalSstDefault={seasonalSstDefault}
            chlDataMin={chlData?.days?.[chlDateIndex]?.stats?.min ?? chlData?.days?.[chlData.days.length-1]?.stats?.min}
            chlDataMax={chlData?.days?.[chlDateIndex]?.stats?.max ?? chlData?.days?.[chlData.days.length-1]?.stats?.max}
            seaColorDataMin={seaColorData?.days?.[seaColorDateIndex]?.stats?.min ?? seaColorData?.days?.[seaColorData.days.length-1]?.stats?.min}
            seaColorDataMax={seaColorData?.days?.[seaColorDateIndex]?.stats?.max ?? seaColorData?.days?.[seaColorData.days.length-1]?.stats?.max}
            showIsotherm={showIsotherm} setShowIsotherm={setShowIsotherm}
            isothermalTargetTemp={isothermalTargetTemp} setIsothermalTargetTemp={setIsothermalTargetTemp}
            isothermalSensitivity={isothermalSensitivity} setIsothermalSensitivity={setIsothermalSensitivity}
            effectiveTargetTemp={effectiveTargetTemp} sstMin={sstMin} sstMax={sstMax}
            showHotspots={showHotspots} setShowHotspots={setShowHotspots} hotspotLoading={hotspotLoading}
            selectedFishSpecies={selectedFishSpecies} setSelectedFishSpecies={setSelectedFishSpecies}
            showWindOverlay={showWindOverlay} setShowWindOverlay={setShowWindOverlay}
            currentsLoading={currentsLoading} showCurrents={showCurrents} setShowCurrents={setShowCurrents}
            showAltimetryOverlay={showAltimetryOverlay} setShowAltimetryOverlay={setShowAltimetryOverlay}
            altimetryDates={altimetryDates} altimetryDateIndex={altimetryDateIndex} setAltimetryDateIndex={setAltimetryDateIndex}
            altimetryPlaying={altimetryPlaying} setAltimetryPlaying={setAltimetryPlaying}
            sstPlaying={sstPlaying} setSstPlaying={setSstPlaying}
            chlPlaying={chlPlaying} setChlPlaying={setChlPlaying}
            seaColorPlaying={seaColorPlaying} setSeaColorPlaying={setSeaColorPlaying}
            showLoranGrid={showLoranGrid} setShowLoranGrid={setShowLoranGrid}
            showLoranWFamily={showLoranWFamily} setShowLoranWFamily={setShowLoranWFamily}
            regionKey={regionKey}
            showCanyonLabels={showCanyonLabels} setShowCanyonLabels={setShowCanyonLabels}
            showBathyLayer={showBathyLayer} setShowBathyLayer={setShowBathyLayer} jsonContoursLoading={jsonContoursLoading}
            showBathyRaster={showBathyRaster} setShowBathyRaster={setShowBathyRaster}
            showWrecks={showWrecks} setShowWrecks={setShowWrecks} wrecksLoading={wrecksLoading}
            showRadarOverlay={showRadarOverlay}
            setShowRadarOverlay={v => { setShowRadarOverlay(v); if (v) setShowBathyRaster(false); }}
            showBuoys={showBuoys} setShowBuoys={setShowBuoys} buoysLoading={buoysLoading}
            selectedLocation={selectedLocation}
            windSliderHeight={sliderHeight}
            collapsed={panelCollapsed} setCollapsed={setPanelCollapsed}
            compositeData={compositeData} compositeGenerated={compositeGenerated}
            compositeDateIndex={compositeDateIndex} setCompositeDateIndex={setCompositeDateIndex} compositeDates={compositeDates}
            isPro={isPro}
            tripMode={tripMode}
            onToggleTripMode={onToggleTripMode}
            gpsActive={gpsActive}
            onToggleGps={onToggleGps}
            showCommunityLayer={showCommunityLayer}
            setShowCommunityLayer={setShowCommunityLayer}
            communityAccess={communityAccess}
            communityCount={communityCount}
            onOpenLeaderboard={onOpenLeaderboard}
            onPostReport={() => onPostCommunityReport?.({ type: "report" })}
            onDropLivePin={() => onPostCommunityReport?.({ type: "live" })}
          />

          {/* ── Community pin-drop mode banner ─────────────────────── */}
          {communityPinDrop && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg"
              style={{ zIndex: 1200, pointerEvents: "auto", background: "#0891b2" }}
            >
              <Crosshair className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Select location for your community report</span>
              <button
                onClick={e => { e.stopPropagation(); onCancelPinDrop?.(); }}
                className="ml-1 text-cyan-200 hover:text-white leading-none"
              >✕</button>
            </div>
          )}

          {windLoading&&(windActive||windData===null)&&(
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2" style={{zIndex:700}}>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Loading wind data…
            </div>
          )}

          {/* Mobile floating controls — 5 layer icons + divider + inspect/pan/bookmark */}
          <div className="sm:hidden absolute flex flex-col gap-1" style={{ right: 8, top: 8, zIndex: 501 }}>
            {/* SST */}
            <button onClick={() => { setMobilePanel(p => p === "sst" ? null : "sst"); if(activeDataLayer!=="sst"&&activeDataLayer!=="composite"){ const s=localStorage.getItem("sst_sub_layer")||"sst"; setActiveDataLayer(s); } setShowRadarOverlay(false); setShowBathyRaster(false); }} title="SST"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="sst" ? "#0891b2" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="sst" ? "#0891b2" : "#e2e8f0" }}>
              <span style={{ fontSize:10, fontWeight:700, color: mobilePanel==="sst" ? "#fff" : "#64748b", lineHeight:1 }}>SST</span>
            </button>
            {/* CHL */}
            <button onClick={() => { setMobilePanel(p => p === "chl" ? null : "chl"); setActiveDataLayer("chlorophyll"); setShowRadarOverlay(false); setShowBathyRaster(false); }} title="Chlorophyll"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="chl" ? "#16a34a" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="chl" ? "#16a34a" : "#e2e8f0" }}>
              <span style={{ fontSize:10, fontWeight:700, color: mobilePanel==="chl" ? "#fff" : "#64748b", lineHeight:1 }}>CHL</span>
            </button>
            {/* Sea Color */}
            <button onClick={() => { setMobilePanel(p => p === "seacolor" ? null : "seacolor"); setActiveDataLayer("seacolor"); setShowRadarOverlay(false); setShowBathyRaster(false); }} title="Sea Color"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="seacolor" ? "#0d9488" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="seacolor" ? "#0d9488" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: mobilePanel==="seacolor" ? "#fff" : "#64748b", lineHeight:1 }}>SC</span>
            </button>
            {/* Altimetry */}
            <button onClick={() => { setMobilePanel(p => p === "altimetry" ? null : "altimetry"); setActiveDataLayer("altimetry"); setShowRadarOverlay(false); setShowBathyRaster(false); }} title="Altimetry"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: activeDataLayer==="altimetry" ? "#7c3aed" : "rgba(255,255,255,0.9)",
                borderColor: activeDataLayer==="altimetry" ? "#7c3aed" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: activeDataLayer==="altimetry" ? "#fff" : "#64748b", lineHeight:1 }}>ALT</span>
            </button>
            {/* Wind */}
            <button onClick={() => setMobilePanel(p => p === "wind" ? null : "wind")} title="Wind"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="wind" ? "#0284c7" : windActive ? "rgba(2,132,199,0.15)" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="wind" ? "#0284c7" : windActive ? "#0284c7" : "#e2e8f0" }}>
              <Wind style={{ width:14, height:14, color: mobilePanel==="wind" ? "#fff" : windActive ? "#0284c7" : "#64748b" }}/>
            </button>
            {/* Currents */}
            <button onClick={() => setShowCurrents(p => !p)} title="Currents"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: showCurrents ? "#0284c7" : "rgba(255,255,255,0.9)",
                borderColor: showCurrents ? "#0284c7" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: showCurrents ? "#fff" : "#64748b", lineHeight:1 }}>CUR</span>
            </button>
            {/* Tools */}
            <button onClick={() => setMobilePanel(p => p === "tools" ? null : "tools")} title="Tools"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="tools" ? "#475569" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="tools" ? "#475569" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: mobilePanel==="tools" ? "#fff" : "#64748b", lineHeight:1 }}>TLS</span>
            </button>
            {/* Divider */}
            <div style={{ height:1, background:"#e2e8f0", margin:"2px 4px" }}/>
            {/* Inspect */}
            <button onClick={() => setInteractionMode("crosshair")} title="Inspect"
              className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
              style={{ width:30, height:30, padding:0, borderColor: interactionMode==="crosshair"?"#f97316":undefined, background: interactionMode==="crosshair"?"#f97316":undefined }}>
              <Crosshair className={`w-4 h-4 ${interactionMode==="crosshair"?"text-white":"text-slate-500"}`}/>
            </button>
            {/* Pan */}
            <button onClick={() => setInteractionMode("pan")} title="Pan"
              className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
              style={{ width:30, height:30, padding:0, borderColor: interactionMode==="pan"?"#334155":undefined, background: interactionMode==="pan"?"#334155":undefined }}>
              <Move className={`w-4 h-4 ${interactionMode==="pan"?"text-white":"text-slate-500"}`}/>
            </button>
            {/* Bookmark */}
            <button onClick={() => setShowSavedPanel(p => !p)} title="Saved"
              className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
              style={{ width:30, height:30, padding:0, borderColor: showSavedPanel?"#f97316":undefined, background: showSavedPanel?"#f97316":undefined }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={showSavedPanel?"white":"#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
            {/* Community layer toggle */}
            <button onClick={() => setShowCommunityLayer(p => !p)} title="Community pins"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0, background:showCommunityLayer?"#84cc16":"rgba(255,255,255,0.9)", borderColor:showCommunityLayer?"#84cc16":"#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color:showCommunityLayer?"#fff":"#64748b", lineHeight:1 }}>COM</span>
            </button>
            {/* Live Report */}
            <button onClick={() => onPostCommunityReport?.({ type: "live" })} title="Live Report"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0, background:"rgba(255,255,255,0.9)", borderColor:"#e2e8f0" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#16a34a" stroke="#16a34a" strokeWidth="1"/>
                <circle cx="12" cy="9" r="2.5" fill="#fff"/>
              </svg>
            </button>

            {/* Community Leaders */}
            <button onClick={() => onOpenLeaderboard?.()} title="Leaderboard"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0, background:"rgba(255,255,255,0.9)", borderColor:"#e2e8f0" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
            {/* Plan Trip */}
            <button
              onClick={onToggleTripMode}
              title={tripMode ? "Exit trip planning" : "Plan trip"}
              className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
              style={{ width:30, height:30, padding:0, borderColor:tripMode?"#0891b2":undefined, background:tripMode?"#0891b2":undefined }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tripMode?"white":"#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
              </svg>
            </button>
            {/* Real Time GPS */}
            <button
              onClick={onToggleGps}
              title={gpsActive ? "GPS On — tap to stop" : "GPS"}
              className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
              style={{
                width: 30, height: 30, padding: 0,
                borderColor: gpsActive ? "#16a34a" : undefined,
                background: gpsActive ? "#16a34a" : undefined,
                color: gpsActive ? "white" : "#64748b",
                fontSize: 8, fontWeight: 700, letterSpacing: "0.02em",
              }}>
              GPS
            </button>
            {/* Help & feedback */}
            <button onClick={() => setShowMobileHelp(true)} title="Help & report an issue"
              className="flex items-center justify-center bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm"
              style={{ width: 30, height: 30, padding: 0 }}>
              <LifeBuoy className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Mobile help & feedback modal */}
          {showMobileHelp && <HelpReportModal onClose={() => setShowMobileHelp(false)} />}

          {/* Mobile saved panel */}
          {showSavedPanel&&(
            <SavedPanel
              savedLocations={savedLocations} fetchSavedLocations={fetchSavedLocations}
              clearMarkersRef={clearMarkersRef} flyToRef={flyToRef}
              highlightedLocation={highlightedLocation} setHighlightedLocation={setHighlightedLocation}
              onShare={onShare} onTipCommunitySource={loc => setCommunityTipModal({ pin: { ...loc, user_id: loc.source_user_id, display_name: loc.source_display_name, venmo: loc.source_venmo ?? null, cashapp: loc.source_cashapp ?? null } })} isPro={isPro} userId={userId}
              onClose={()=>setShowSavedPanel(false)}
              onLoadRoute={onLoadRoute}
              onRoutesCountChange={setSavedRoutesCount}
              mobile onMobileSelect={()=>setShowSavedPanel(false)}
              tripMode={tripMode}
              onAddWaypoint={onAddWaypoint}
              communityLocations={communityLocations}
              heatmapDataForShare={shareHeatmapData ?? data} sstMinForShare={sstMin} sstMaxForShare={sstMax} sstRangeForShare={sstRange}
              className="sm:hidden"
            />
          )}

          {/* Mobile focused drawers — one per layer icon */}
          {mobilePanel && (
            <div className="sm:hidden fixed left-0 right-0 bg-white border-t border-slate-200 shadow-xl flex flex-col"
                 style={{ bottom: 0, zIndex: 2000, maxHeight: "45vh", overflowY: "auto" }}>
              {/* Close handle */}
              <button onClick={() => setMobilePanel(null)}
                className="flex items-center justify-center w-full py-1.5 border-b border-slate-100 text-slate-400 flex-shrink-0">
                <svg width="18" height="10" viewBox="0 0 20 12">
                  <path d="M3 3l7 6 7-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>

              <div className="px-3 py-2 space-y-2">

                {/* ── SST panel ──────────────────────────────────────── */}
                {mobilePanel === "sst" && (
                  <>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Source</div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { label: "Cloud Free", active: activeDataLayer === "sst" && dataSource === "MUR",    fn: () => { setActiveDataLayer("sst"); setDataSource("MUR"); setShowRadarOverlay(false); setShowBathyRaster(false); setMobilePanel(null); setShowMobileSourceNav(true); } },
                        { label: "Hourly",   active: activeDataLayer === "sst" && dataSource === "VIIRS",    fn: () => { setActiveDataLayer("sst"); setDataSource("VIIRS"); setShowRadarOverlay(false); setShowBathyRaster(false); setMobilePanel(null); setShowMobileSourceNav(true); } },
                        { label: "HD Composite", active: activeDataLayer === "composite",                    fn: () => { setActiveDataLayer("composite"); setShowRadarOverlay(false); setShowBathyRaster(false); setMobilePanel(null); setShowMobileSourceNav(true); } },
                      ].map(({ label, active, fn }) => (
                        <button key={label} onClick={fn}
                          className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-colors ${active ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Composite badge */}
                    {activeDataLayer === "composite" && compositeData && (
                      <div className="text-[10px] text-violet-700 bg-violet-50 rounded px-2 py-1 text-center font-semibold">
                        {compositeData.generated
                          ? new Date(compositeData.generated).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "America/New_York" })
                          : "Latest composite"}
                      </div>
                    )}

                    {/* Composite DateNav */}
                    {activeDataLayer === "composite" && compositeData && compositeDates?.length >= 1 && (
                      <div className="flex items-center gap-1">
                        {compositeDates.length > 1 && (
                          <button onClick={() => { setSstPlaying(false); setCompositeDateIndex(i => Math.max(0, i - 1)); }} disabled={compositeDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                        )}
                        <span className="flex-1 text-center text-[10px] font-semibold text-violet-700 bg-violet-50 rounded py-1 truncate">
                          {compositeDates[compositeDateIndex] ?? "—"}
                        </span>
                        {compositeDates.length > 1 && (
                          <button onClick={() => { setSstPlaying(false); setCompositeDateIndex(i => Math.min(compositeDates.length - 1, i + 1)); }} disabled={compositeDateIndex === compositeDates.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                        )}
                        {compositeDates.length > 1 && (
                          <button onClick={() => setSstPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {sstPlaying ? "||" : ">"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* VIIRS DateNav + hour buttons */}
                    {activeDataLayer === "sst" && dataSource === "VIIRS" && viirsData?.days?.length >= 1 && (
                      <>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSstPlaying(false); setViirsDateIndex(i => Math.max(0, i - 1)); }} disabled={viirsDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-violet-700 bg-violet-50 rounded py-1 truncate">
                            {fmtDate(activeViirsDay?.date)}
                          </span>
                          <button onClick={() => { setSstPlaying(false); setViirsDateIndex(i => Math.min(viirsData.days.length - 1, i + 1)); }} disabled={viirsDateIndex === viirsData.days.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                          {viirsData.days.length > 1 && (
                            <button onClick={() => setSstPlaying(v => !v)}
                              className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                              {sstPlaying ? "||" : ">"}
                            </button>
                          )}
                        </div>
                        {activeViirsDay?.available_hours?.length >= 1 && (
                          <div className="flex flex-wrap gap-1">
                            {activeViirsDay.available_hours.map(h => {
                              const d = new Date(new Date(`${activeViirsDay.date}T${String(h).padStart(2, "0")}:00:00Z`).toLocaleString("en-US", { timeZone: "America/New_York" }));
                              const hr = d.getHours();
                              const label = hr === 0 ? "12am" : hr < 12 ? `${hr}am` : hr === 12 ? "12pm" : `${hr - 12}pm`;
                              return (
                                <button key={h} onClick={() => setViirsHour(h)}
                                  className={`flex-1 text-[9px] font-semibold px-1 py-0.5 rounded border transition-colors ${viirsHour === h ? "bg-violet-600 text-white border-violet-500" : "bg-white text-slate-500 border-slate-200"}`}>
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}

                    {/* MUR DateNav */}
                    {activeDataLayer === "sst" && dataSource === "MUR" && murData?.days?.length >= 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setSstPlaying(false); setMurDateIndex(i => Math.max(0, i - 1)); }} disabled={murDateIndex === 0}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                        <span className="flex-1 text-center text-[10px] font-semibold text-cyan-700 bg-cyan-50 rounded py-1 truncate">
                          {fmtDate(date)}
                        </span>
                        <button onClick={() => { setSstPlaying(false); setMurDateIndex(i => Math.min(murData.days.length - 1, i + 1)); }} disabled={murDateIndex === murData.days.length - 1}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                        {murData.days.length > 1 && (
                          <button onClick={() => setSstPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {sstPlaying ? "||" : ">"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* GOES DateNav */}
                    {activeDataLayer === "sst" && dataSource === "GOESCOMP" && goesCompData?.days?.length >= 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setSstPlaying(false); setGoesCompDateIndex(i => Math.max(0, i - 1)); }} disabled={goesCompDateIndex === 0}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                        <span className="flex-1 text-center text-[10px] font-semibold text-indigo-700 bg-indigo-50 rounded py-1 truncate">
                          {fmtDate(activeGoesCompDay?.date)}
                        </span>
                        <button onClick={() => { setSstPlaying(false); setGoesCompDateIndex(i => Math.min(goesCompData.days.length - 1, i + 1)); }} disabled={goesCompDateIndex === goesCompData.days.length - 1}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                        {goesCompData.days.length > 1 && (
                          <button onClick={() => setSstPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {sstPlaying ? "||" : ">"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Temp gain */}
                    <MobileProGate isPro={isPro} label="Temp gain control is available on the Pro plan.">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide mt-1">Temp gain</div>
                      <SSTRangeControl
                        activeLayer="sst"
                        userId={userId}
                        range={sstRange}
                        onRangeChange={onSstRangeChange}
                        onApply={onSstRangeChange}
                        openRef={rangeControlOpenRef}
                        seasonalDefault={seasonalSstDefault}
                      />
                    </MobileProGate>

                  </>
                )}

                {/* ── CHL panel ──────────────────────────────────────── */}
                {mobilePanel === "chl" && (
                  <>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Source</div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { label: "Daily",     active: chlSource === "daily",     fn: () => { setChlSource("daily"); setMobilePanel(null); setShowMobileSourceNav(true); } },
                        { label: "HD Composite", active: chlSource === "composite", fn: () => { setChlSource("composite"); setMobilePanel(null); setShowMobileSourceNav(true); } },
                      ].map(({ label, active, fn }) => (
                        <button key={label} onClick={fn}
                          className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-colors ${active ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {chlSource === "daily" && chlData?.days?.length > 1 && (
                      <>
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Date</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setChlPlaying(false); setChlDateIndex(i => Math.max(0, i - 1)); }} disabled={chlDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-green-700 bg-green-50 rounded py-1 truncate">
                            {fmtDate(chlData.days[chlDateIndex]?.date)}
                          </span>
                          <button onClick={() => { setChlPlaying(false); setChlDateIndex(i => Math.min(chlData.days.length - 1, i + 1)); }} disabled={chlDateIndex === chlData.days.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                          <button onClick={() => setChlPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {chlPlaying ? "||" : ">"}
                          </button>
                        </div>
                      </>
                    )}
                    {chlSource === "composite" && chlCompositeDates?.length > 0 && (
                      <>
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Date</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setChlPlaying(false); setChlCompositeDateIndex(i => Math.max(0, i - 1)); }} disabled={chlCompositeDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-green-700 bg-green-50 rounded py-1 truncate">
                            {fmtDate(chlCompositeDates[chlCompositeDateIndex])}
                          </span>
                          <button onClick={() => { setChlPlaying(false); setChlCompositeDateIndex(i => Math.min(chlCompositeDates.length - 1, i + 1)); }} disabled={chlCompositeDateIndex >= chlCompositeDates.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                          <button onClick={() => setChlPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {chlPlaying ? "||" : ">"}
                          </button>
                        </div>
                      </>
                    )}
                    <MobileProGate isPro={isPro} label="Color gain control is available on the Pro plan.">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide mt-1">CHL gain</div>
                      <SSTRangeControl
                        activeLayer="chlorophyll"
                        userId={userId}
                        range={sstRange}
                        onRangeChange={onSstRangeChange}
                        onApply={onSstRangeChange}
                        openRef={rangeControlOpenRef}
                        dataMin={chlData?.days?.[chlDateIndex]?.stats?.min ?? chlData?.days?.[chlData.days.length-1]?.stats?.min}
                        dataMax={chlData?.days?.[chlDateIndex]?.stats?.max ?? chlData?.days?.[chlData.days.length-1]?.stats?.max}
                      />
                    </MobileProGate>
                  </>
                )}

                {/* ── Sea Color panel ────────────────────────────────── */}
                {mobilePanel === "seacolor" && (
                  <>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Source</div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { label: "Daily",        active: seaColorSource === "daily",     fn: () => { setSeaColorSource("daily"); setMobilePanel(null); setShowMobileSourceNav(true); } },
                        { label: "HD Composite", active: seaColorSource === "composite", fn: () => { setSeaColorSource("composite"); setMobilePanel(null); setShowMobileSourceNav(true); } },
                      ].map(({ label, active, fn }) => (
                        <button key={label} onClick={fn}
                          className={`text-[10px] font-semibold py-1.5 rounded-lg border transition-colors ${active ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {seaColorSource === "daily" && seaColorData?.days?.length > 1 && (
                      <>
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Date</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSeaColorPlaying(false); setSeaColorDateIndex(i => Math.max(0, i - 1)); }} disabled={seaColorDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-teal-700 bg-teal-50 rounded py-1 truncate">
                            {fmtDate(seaColorData.days[seaColorDateIndex]?.date)}
                          </span>
                          <button onClick={() => { setSeaColorPlaying(false); setSeaColorDateIndex(i => Math.min(seaColorData.days.length - 1, i + 1)); }} disabled={seaColorDateIndex === seaColorData.days.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                          <button onClick={() => setSeaColorPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {seaColorPlaying ? "||" : ">"}
                          </button>
                        </div>
                      </>
                    )}
                    {seaColorSource === "composite" && seaColorCompositeDates?.length > 0 && (
                      <>
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Date</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSeaColorPlaying(false); setSeaColorCompositeDateIndex(i => Math.max(0, i - 1)); }} disabled={seaColorCompositeDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-teal-700 bg-teal-50 rounded py-1 truncate">
                            {fmtDate(seaColorCompositeDates[seaColorCompositeDateIndex])}
                          </span>
                          <button onClick={() => { setSeaColorPlaying(false); setSeaColorCompositeDateIndex(i => Math.min(seaColorCompositeDates.length - 1, i + 1)); }} disabled={seaColorCompositeDateIndex >= seaColorCompositeDates.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                          <button onClick={() => setSeaColorPlaying(v => !v)}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold">
                            {seaColorPlaying ? "||" : ">"}
                          </button>
                        </div>
                      </>
                    )}
                    <MobileProGate isPro={isPro} label="Color gain control is available on the Pro plan.">
                      <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide mt-1">Kd490 gain</div>
                      <SSTRangeControl
                        activeLayer="seacolor"
                        userId={userId}
                        range={sstRange}
                        onRangeChange={onSstRangeChange}
                        onApply={onSstRangeChange}
                        openRef={rangeControlOpenRef}
                        dataMin={seaColorData?.days?.[seaColorDateIndex]?.stats?.min ?? seaColorData?.days?.[seaColorData.days.length-1]?.stats?.min}
                        dataMax={seaColorData?.days?.[seaColorDateIndex]?.stats?.max ?? seaColorData?.days?.[seaColorData.days.length-1]?.stats?.max}
                      />
                    </MobileProGate>
                  </>
                )}

                {/* ── Wind panel ─────────────────────────────────────── */}
                {mobilePanel === "wind" && (
                  <>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Wind</div>
                    <div className="grid grid-cols-2 gap-1">
                      <MobileProGate isPro={isPro} label="Wind overlay on the map is available on the Pro plan.">
                        <button onClick={() => setShowWindOverlay(v => !v)}
                          className={`text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${showWindOverlay ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          <Wind className="w-3.5 h-3.5" />{windLoading ? "Loading…" : "Overlay"}
                        </button>
                      </MobileProGate>
                      <button onClick={() => { setActiveDataLayer(isWindMap ? "sst" : "windmap"); setShowRadarOverlay(false); setShowBathyRaster(false); }}
                        className={`text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${isWindMap ? "bg-sky-700 text-white border-sky-700" : "bg-white text-slate-600 border-slate-300"}`}>
                        <Wind className="w-3.5 h-3.5" />{windLoading ? "Loading…" : "Wind"}
                      </button>
                    </div>

                    {/* Wind time controls — only when wind data loaded */}
                    {windData?.hours?.length > 0 && (() => {
                      const hours = windData.hours;
                      const curDay = hours[windHourIndex]?.time
                        ? new Date(hours[windHourIndex].time).toDateString() : null;
                      // First index of each day in order
                      const dayStarts = [];
                      hours.forEach((h, i) => {
                        const d = h?.time ? new Date(h.time).toDateString() : null;
                        if (d && (dayStarts.length === 0 || dayStarts[dayStarts.length-1].day !== d))
                          dayStarts.push({ day: d, idx: i });
                      });
                      const curDayStartIdx = dayStarts.findIndex(ds => ds.day === curDay);
                      const prevDayIdx = curDayStartIdx > 0 ? dayStarts[curDayStartIdx - 1].idx : null;
                      const nextDayIdx = curDayStartIdx < dayStarts.length - 1 ? dayStarts[curDayStartIdx + 1].idx : null;
                      return (
                        <>
                          <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide mt-1">Time</div>
                          {/* Day row */}
                          <div className="flex items-center gap-1">
                            <button onClick={() => setWindHourIndex(prevDayIdx)} disabled={prevDayIdx === null}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-bold disabled:opacity-30">« Day</button>
                            <div className="flex-1 text-center text-[11px] font-semibold text-sky-800 bg-sky-50 rounded-lg py-1 truncate">
                              {hours[windHourIndex]?.time
                                ? new Date(hours[windHourIndex].time).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })
                                : "—"}
                            </div>
                            <button onClick={() => setWindHourIndex(nextDayIdx)} disabled={nextDayIdx === null}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-slate-600 text-xs font-bold disabled:opacity-30">Day »</button>
                          </div>
                          {/* Hour row */}
                          <div className="flex items-center gap-1">
                            <button onClick={() => setWindHourIndex(i => Math.max(0, i - 1))} disabled={windHourIndex === 0}
                              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                            <div className="flex-1 text-center text-[11px] font-semibold text-sky-700 bg-sky-50 rounded-lg py-1.5 truncate">
                              {hours[windHourIndex]?.time
                                ? new Date(hours[windHourIndex].time).toLocaleString("en-US", { hour: "numeric", timeZone: "America/New_York" })
                                : "—"}
                            </div>
                            <button onClick={() => setWindHourIndex(i => Math.min(hours.length - 1, i + 1))} disabled={windHourIndex === hours.length - 1}
                              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                            <button onClick={() => setWindPlaying(p => !p)}
                              className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors ${windPlaying ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-300"}`}>
                              {windPlaying ? "⏸" : "▶"}
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}

                {/* ── Currents panel ──────────────────────────────────── */}
                {mobilePanel === "currents" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Currents</div>
                    <MobileProGate isPro={isPro} label="Ocean current overlay is available on the Pro plan.">
                      <button onClick={() => setShowCurrents(v => !v)}
                        className={`text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${showCurrents ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-300"}`}>
                        &#x1F30A; {currentsLoading ? "Loading…" : "Currents overlay"}
                      </button>
                    </MobileProGate>
                  </div>
                )}

                {/* ── Altimetry panel ──────────────────────────────────────── */}
                {mobilePanel === "altimetry" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Altimetry</div>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => { setActiveDataLayer(l => l === "altimetry" ? "sst" : "altimetry"); setShowRadarOverlay(false); setShowBathyRaster(false); }}
                          className={`text-[11px] font-semibold px-2 py-2 rounded-lg border flex items-center justify-center gap-1 transition-colors ${activeDataLayer === "altimetry" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          🌊 ALT Map
                        </button>
                        <MobileProGate isPro={isPro} label="Altimetry overlay is available on the Pro plan.">
                          <button onClick={() => setShowAltimetryOverlay(v => !v)}
                            className={`w-full text-[11px] font-semibold px-2 py-2 rounded-lg border flex items-center justify-center gap-1 transition-colors ${showAltimetryOverlay ? "bg-violet-400 text-white border-violet-400" : "bg-white text-slate-600 border-slate-300"}`}>
                            〰 ALT Overlay
                          </button>
                        </MobileProGate>
                      </div>
                      {altimetryDates?.length > 1 && (() => {
                        const fmtD = s => { if (!s||s.length<8) return s??"—"; const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${mo[parseInt(s.slice(4,6),10)-1]} ${parseInt(s.slice(6,8),10)}`; };
                        return (
                          <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4 }}>
                            <button onClick={() => { setAltimetryPlaying(false); setAltimetryDateIndex(i => Math.max(0, i-1)); }}
                              disabled={altimetryDateIndex === 0}
                              style={{ padding:"4px 7px", borderRadius:4, border:"1px solid #cbd5e1", background:"#fff", fontSize:11, fontWeight:700, color:"#475569", opacity: altimetryDateIndex===0?0.3:1 }}>&#8249;</button>
                            <span style={{ flex:1, textAlign:"center", fontSize:10, fontWeight:600, background:"#ecfeff", color:"#0e7490", borderRadius:4, padding:"3px 4px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {fmtD(altimetryDates[altimetryDateIndex])}
                            </span>
                            <button onClick={() => { setAltimetryPlaying(false); setAltimetryDateIndex(i => Math.min(altimetryDates.length-1, i+1)); }}
                              disabled={altimetryDateIndex >= altimetryDates.length-1}
                              style={{ padding:"4px 7px", borderRadius:4, border:"1px solid #cbd5e1", background:"#fff", fontSize:11, fontWeight:700, color:"#475569", opacity: altimetryDateIndex>=altimetryDates.length-1?0.3:1 }}>&#8250;</button>
                            <button onClick={() => setAltimetryPlaying(v => !v)}
                              style={{ padding:"4px 7px", borderRadius:4, border:"1px solid #cbd5e1", background:"#fff", fontSize:11, fontWeight:700, color:"#475569" }}
                              title={altimetryPlaying ? "Pause" : "Play"}>{altimetryPlaying ? "||" : ">"}</button>
                          </div>
                        );
                      })()}
                  </div>
                )}

                                {/* ── Tools panel ────────────────────────────────────── */}
                {mobilePanel === "tools" && (
                  <>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Tools</div>
                    {(activeDataLayer === "sst" || activeDataLayer === "composite") && (
                      <MobileProGate isPro={isPro} label="Isotherm (temp break) overlay is available on the Pro plan.">
                        <button onClick={() => setShowIsotherm(v => !v)}
                          className={`w-full text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-colors ${showIsotherm ? "bg-sky-700 text-white border-sky-700" : "bg-white text-slate-600 border-slate-300"}`}>
                          <span className="text-sm leading-none">~</span> Temp Break
                        </button>
                        {showIsotherm && (
                          <div className="space-y-2 px-1 pt-1">
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>Target temp</span><span className="text-sky-600 font-semibold">{effectiveTargetTemp.toFixed(1)}°F</span>
                              </div>
                              <input type="range" min={Math.floor(sstMin)} max={Math.ceil(sstMax)} step={0.5}
                                value={Math.max(sstMin, Math.min(sstMax, effectiveTargetTemp))}
                                onChange={e => setIsothermalTargetTemp(parseFloat(e.target.value))}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-sky-500"/>
                              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                                <span>{Math.floor(sstMin)}°F</span><span>{Math.ceil(sstMax)}°F</span>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>Sharpness</span><span className="text-violet-600 font-semibold">{isothermalSensitivity.toFixed(1)}°F</span>
                              </div>
                              <input type="range" min={0.5} max={8} step={0.5}
                                value={isothermalSensitivity}
                                onChange={e => setIsothermalSensitivity(parseFloat(e.target.value))}
                                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-violet-500"/>
                              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                                <span>← sharp only</span><span>all →</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </MobileProGate>
                    )}
                    {/* HOTSPOT UI HIDDEN — needs work
                    <MobileProGate isPro={isPro} label="Fishing hotspot scoring is available on the Pro plan.">
                      <button onClick={() => setShowHotspots(h => !h)}
                        className={`w-full text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-colors ${showHotspots ? "bg-amber-700 text-white border-amber-700" : "bg-white text-slate-600 border-slate-300"}`}>
                        🎣 {hotspotLoading ? "Loading…" : "Hot spots"}
                      </button>
                      {showHotspots && (
                        <div className="flex flex-wrap gap-1">
                          {FISH_SPECIES.map(s => (
                            <button key={s.key} onClick={() => setSelectedFishSpecies(s.key)}
                              style={{ borderColor: s.color, background: selectedFishSpecies === s.key ? s.color : "#fff", color: selectedFishSpecies === s.key ? "#fff" : "#475569" }}
                              className="text-[10px] font-semibold px-2 py-1 rounded border transition-colors">
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </MobileProGate>
                    */}
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <button onClick={() => setShowBathyLayer(b => !b)}
                        className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showBathyLayer ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300"}`}>
                        {jsonContoursLoading ? "Loading…" : "Bathymetry"}
                      </button>
                      <MobileProGate isPro={isPro} label="Shaded Relief is available on the Pro plan.">
                        <button onClick={() => setShowBathyRaster(v => { const next = !v; if (next) setShowRadarOverlay(false); return next; })}
                          className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showBathyRaster ? "bg-cyan-700 text-white border-cyan-700" : "bg-white text-slate-600 border-slate-300"}`}>
                          Shaded Relief
                        </button>
                      </MobileProGate>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <MobileProGate isPro={isPro} label="Radar overlay is available on the Pro plan.">
                        <button onClick={() => setShowRadarOverlay(v => { const next = !v; if (next) setShowBathyRaster(false); return next; })}
                          className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showRadarOverlay ? "bg-cyan-700 text-white border-cyan-700" : "bg-white text-slate-600 border-slate-300"}`}>
                          Radar
                        </button>
                      </MobileProGate>
                      <MobileProGate isPro={isPro} label="Bottom Features are available on the Pro plan.">
                        <button onClick={() => setShowWrecks(w => !w)}
                          className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showWrecks ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-300"}`}>
                          {wrecksLoading ? "Loading…" : "Bottom Features"}
                        </button>
                      </MobileProGate>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <button onClick={() => setShowBuoys(v => !v)}
                        className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showBuoys ? "bg-cyan-700 text-white border-cyan-700" : "bg-white text-slate-600 border-slate-300"}`}>
                        {buoysLoading ? "Loading…" : "Weather Buoys"}
                      </button>
                      <MobileProGate isPro={isPro} label="Real-time GPS tracking is a Pro feature.">
                        <button onClick={onToggleGps}
                          className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${gpsActive ? "bg-green-600 text-white border-green-600" : "bg-white text-slate-600 border-slate-300"}`}>
                          {gpsActive ? "GPS On" : "GPS"}
                        </button>
                      </MobileProGate>
                    </div>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <div className="col-span-2 flex gap-1">
                        <MobileProGate isPro={isPro} label="Loran-C grid is available on the Pro plan.">
                          <button onClick={() => setShowLoranGrid(v => !v)}
                            className={`flex-1 text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showLoranGrid ? "bg-slate-700 text-white border-slate-700" : "bg-white text-slate-600 border-slate-300"}`}>
                            Loran Grid
                          </button>
                        </MobileProGate>
                        {showLoranGrid && regionKey === "mid_atlantic" && (
                          <button onClick={() => setShowLoranWFamily(v => !v)}
                            className={`px-2.5 text-[10px] font-semibold rounded-lg border flex-shrink-0 transition-colors ${showLoranWFamily ? "bg-amber-50 text-amber-700 border-amber-400" : "bg-white text-slate-400 border-slate-300"}`}>
                            W Lines
                          </button>
                        )}
                        <button onClick={() => setLoranHelpOpen(o => !o)}
                          className={`w-8 py-2 rounded-lg border text-[12px] font-bold flex-shrink-0 transition-colors ${loranHelpOpen ? "bg-slate-200 border-slate-400 text-slate-700" : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"}`}
                          title="About Loran-C">?</button>
                      </div>
                      {loranHelpOpen && createPortal(
                        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-4"
                             onClick={() => setLoranHelpOpen(false)}>
                          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
                               onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                              <p className="font-semibold text-slate-800 text-sm">About Loran-C</p>
                              <button onClick={() => setLoranHelpOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-xl leading-none font-light">×</button>
                            </div>
                            <img src="/loran_ref_point.png" alt="The Point — Loran Y lines"
                                 className="w-full object-cover" style={{maxHeight:200}}
                                 onError={e => { e.currentTarget.style.display="none"; }} />
                            <div className="px-4 py-3 text-[11px] text-slate-600 leading-relaxed">
                              The U.S. LORAN-C system was officially decommissioned in 2010. This overlay approximates the positions of those lines for reference and waypoint sharing. In practice, we typically refer only to the last three digits, combined with a depth reference. For example: &ldquo;The bite&apos;s been hot in 100 fathoms at the 580&rdquo; (&lsquo;The Point&rsquo; off Oregon Inlet).<br/><br/>Major lines are spaced 10 miles apart, so if a buddy reports mahi at the 680, that&apos;s roughly a 10-mile run from the 580. Minor lines are spaced 2 miles apart, making it easy to estimate distance and position on the water.<br/><br/>In the mid-Atlantic, a second crossing set of lines (the &ldquo;W&rdquo; family) can be toggled on to show the full LORAN grid.
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>

                  </>
                )}

              </div>
            </div>
          )}

          {/* Compact day/hour nav — replaces the full drawer once a secondary source is picked, so it doesn't cover most of the map */}
          {showMobileSourceNav && !mobilePanel && (() => {
            let content = null;
            let reopenPanel = "sst";

            if (activeDataLayer === "sst" && dataSource === "VIIRS" && viirsData?.days?.length >= 1) {
              reopenPanel = "sst";
              const hrs = activeViirsDay?.available_hours || [];
              const hIdx = hrs.indexOf(viirsHour);
              const hrLabel = (!activeViirsDay?.date || viirsHour == null) ? "—" : (() => {
                const d = new Date(new Date(`${activeViirsDay.date}T${String(viirsHour).padStart(2, "0")}:00:00Z`).toLocaleString("en-US", { timeZone: "America/New_York" }));
                const hr = d.getHours();
                return hr === 0 ? "12am" : hr < 12 ? `${hr}am` : hr === 12 ? "12pm" : `${hr - 12}pm`;
              })();
              content = (
                <>
                  <button onClick={() => { setSstPlaying(false); setViirsDateIndex(i => Math.max(0, i - 1)); }} disabled={viirsDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-[10px] font-bold disabled:opacity-30 flex-shrink-0">« Day</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-violet-700 bg-violet-50 rounded py-1.5 truncate">{fmtDate(activeViirsDay?.date)}</span>
                  <button onClick={() => { setSstPlaying(false); setViirsDateIndex(i => Math.min(viirsData.days.length - 1, i + 1)); }} disabled={viirsDateIndex === viirsData.days.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-[10px] font-bold disabled:opacity-30 flex-shrink-0">Day »</button>
                  {hrs.length >= 1 && (
                    <>
                      <button onClick={() => setViirsHour(hrs[Math.max(0, hIdx - 1)])} disabled={hIdx <= 0}
                        className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                      <span className="text-center text-[10px] font-semibold text-violet-700 bg-violet-50 rounded py-1.5 px-2 truncate flex-shrink-0">{hrLabel}</span>
                      <button onClick={() => setViirsHour(hrs[Math.min(hrs.length - 1, hIdx + 1)])} disabled={hIdx >= hrs.length - 1}
                        className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                    </>
                  )}
                </>
              );
            } else if (activeDataLayer === "sst" && dataSource === "MUR" && murData?.days?.length > 1) {
              reopenPanel = "sst";
              content = (
                <>
                  <button onClick={() => { setSstPlaying(false); setMurDateIndex(i => Math.max(0, i - 1)); }} disabled={murDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-cyan-700 bg-cyan-50 rounded py-1.5 truncate">{fmtDate(date)}</span>
                  <button onClick={() => { setSstPlaying(false); setMurDateIndex(i => Math.min(murData.days.length - 1, i + 1)); }} disabled={murDateIndex === murData.days.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                </>
              );
            } else if (activeDataLayer === "composite" && compositeDates?.length >= 1) {
              reopenPanel = "sst";
              content = (
                <>
                  <button onClick={() => { setSstPlaying(false); setCompositeDateIndex(i => Math.max(0, i - 1)); }} disabled={compositeDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-violet-700 bg-violet-50 rounded py-1.5 truncate">{compositeDates[compositeDateIndex] ?? "—"}</span>
                  <button onClick={() => { setSstPlaying(false); setCompositeDateIndex(i => Math.min(compositeDates.length - 1, i + 1)); }} disabled={compositeDateIndex === compositeDates.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                </>
              );
            } else if (activeDataLayer === "chlorophyll" && chlSource === "daily" && chlData?.days?.length > 1) {
              reopenPanel = "chl";
              content = (
                <>
                  <button onClick={() => { setChlPlaying(false); setChlDateIndex(i => Math.max(0, i - 1)); }} disabled={chlDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-green-700 bg-green-50 rounded py-1.5 truncate">{fmtDate(chlData.days[chlDateIndex]?.date)}</span>
                  <button onClick={() => { setChlPlaying(false); setChlDateIndex(i => Math.min(chlData.days.length - 1, i + 1)); }} disabled={chlDateIndex === chlData.days.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                </>
              );
            } else if (activeDataLayer === "chlorophyll" && chlSource === "composite" && chlCompositeDates?.length > 0) {
              reopenPanel = "chl";
              content = (
                <>
                  <button onClick={() => { setChlPlaying(false); setChlCompositeDateIndex(i => Math.max(0, i - 1)); }} disabled={chlCompositeDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-green-700 bg-green-50 rounded py-1.5 truncate">{fmtDate(chlCompositeDates[chlCompositeDateIndex])}</span>
                  <button onClick={() => { setChlPlaying(false); setChlCompositeDateIndex(i => Math.min(chlCompositeDates.length - 1, i + 1)); }} disabled={chlCompositeDateIndex >= chlCompositeDates.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                </>
              );
            } else if (activeDataLayer === "seacolor" && seaColorSource === "daily" && seaColorData?.days?.length > 1) {
              reopenPanel = "seacolor";
              content = (
                <>
                  <button onClick={() => { setSeaColorPlaying(false); setSeaColorDateIndex(i => Math.max(0, i - 1)); }} disabled={seaColorDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-teal-700 bg-teal-50 rounded py-1.5 truncate">{fmtDate(seaColorData.days[seaColorDateIndex]?.date)}</span>
                  <button onClick={() => { setSeaColorPlaying(false); setSeaColorDateIndex(i => Math.min(seaColorData.days.length - 1, i + 1)); }} disabled={seaColorDateIndex === seaColorData.days.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                </>
              );
            } else if (activeDataLayer === "seacolor" && seaColorSource === "composite" && seaColorCompositeDates?.length > 0) {
              reopenPanel = "seacolor";
              content = (
                <>
                  <button onClick={() => { setSeaColorPlaying(false); setSeaColorCompositeDateIndex(i => Math.max(0, i - 1)); }} disabled={seaColorCompositeDateIndex === 0}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8249;</button>
                  <span className="flex-1 text-center text-[10px] font-semibold text-teal-700 bg-teal-50 rounded py-1.5 truncate">{fmtDate(seaColorCompositeDates[seaColorCompositeDateIndex])}</span>
                  <button onClick={() => { setSeaColorPlaying(false); setSeaColorCompositeDateIndex(i => Math.min(seaColorCompositeDates.length - 1, i + 1)); }} disabled={seaColorCompositeDateIndex >= seaColorCompositeDates.length - 1}
                    className="px-2 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30 flex-shrink-0">&#8250;</button>
                </>
              );
            }

            if (!content) return null;

            return (
              <div className="sm:hidden fixed left-2 right-2 bg-white rounded-2xl border border-slate-200 shadow-xl flex items-center gap-1 px-2 py-1.5"
                   style={{ bottom: "calc(104px + env(safe-area-inset-bottom, 0px))", zIndex: 1500 }}>
                {content}
                <button onClick={() => setMobilePanel(reopenPanel)}
                  title="More options"
                  className="px-2 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-500 text-xs font-bold flex-shrink-0">&#8942;</button>
              </div>
            );
          })()}

          {hoverInfo&&!clickInfo&&(
            <div className="absolute bg-white/95 border border-slate-200 rounded-lg text-xs shadow-lg"
              style={{left:hoverInfo.px+14,top:hoverInfo.py-10,zIndex:700,pointerEvents: touchMarker ? "auto" : "none"}}>
              <div className="relative px-2.5 py-1.5 space-y-0.5">
                {touchMarker&&(
                  <button className="sm:hidden absolute top-1.5 right-1.5 p-1 rounded-md bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
                    style={{pointerEvents:"auto",lineHeight:0}} title="Save"
                    onClick={()=>{
                      if(!hoverInfo)return;
                      const map=mapRef.current;if(!map)return;
                      const latlng=map.containerPointToLatLng([touchMarker.px,touchMarker.py]);
                      const {lat,lng:lon}=latlng;
                      setClickInfo({lat,lon,sst:hoverInfo.sst,depth_ft:hoverInfo.depth_ft,
                        dist:hoverInfo.dist,bearing:hoverInfo.bearing,
                        locationLabel:selectedLocationRef.current?.label??null,
                        px:touchMarker.px,py:touchMarker.py});
                      setHoverInfo(null);setTouchMarker(null);
                    }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  </button>
                )}
                <div className={touchMarker ? "pr-6" : ""}>
                  {(activeDataLayer==="sst"||activeDataLayer==="composite")&&hoverInfo.sst!=null&&<div className="text-cyan-600 font-semibold">{hoverInfo.sst.toFixed(1)}F</div>}
                  {activeDataLayer==="chlorophyll"&&hoverInfo.chl!=null&&<div className="text-green-600 font-semibold">{hoverInfo.chl.toFixed(3)} mg/m3 <span className="text-slate-400 font-normal">({hoverInfo.color_class})</span></div>}
                  {activeDataLayer==="seacolor"&&hoverInfo.kd490!=null&&<div className="text-teal-600 font-semibold">{hoverInfo.kd490.toFixed(4)} m-1</div>}
                  {(activeDataLayer==="windmap"||showWindOverlay)&&hoverInfo.windSpeed_kt!=null&&<div className="text-sky-600 font-semibold">{Math.round(hoverInfo.windSpeed_kt)} kt{hoverInfo.windDir_deg!=null ? ` · ${bearingLabel(hoverInfo.windDir_deg)}` : ""}</div>}
                  {showCurrents&&hoverInfo.currSpeed_ms!=null&&<div className="text-cyan-700 font-semibold">{hoverInfo.currSpeed_ms.toFixed(2)} m/s current{hoverInfo.currDir_deg!=null ? ` · ${bearingLabel(hoverInfo.currDir_deg)}` : ""}</div>}
                  {activeDataLayer==="altimetry"&&hoverInfo.sla_m!=null&&<div className="text-violet-600 font-semibold">SLA {hoverInfo.sla_m>=0?"+":""}{hoverInfo.sla_m.toFixed(3)} m</div>}
                  {hoverInfo.depth_ft!=null&&<div className="text-blue-600 font-medium">{Math.round(hoverInfo.depth_ft)} ft / {Math.round(hoverInfo.depth_ft/6)} fth</div>}
                  {hoverInfo.dist!=null&&<div className="text-slate-600">{hoverInfo.dist.toFixed(1)} nm {Math.round(hoverInfo.bearing)}° {bearingLabel(hoverInfo.bearing)}</div>}
                  {hoverInfo.sst==null&&hoverInfo.depth_ft==null&&hoverInfo.chl==null&&hoverInfo.kd490==null&&hoverInfo.windSpeed_kt==null&&hoverInfo.dist==null&&<div className="text-slate-400">No data</div>}
                </div>
              </div>
            </div>
          )}
          {touchMarker&&(
            <div className="absolute pointer-events-none" style={{left:touchMarker.px-20,top:touchMarker.py-20,width:40,height:40,zIndex:699}}>
              <svg viewBox="0 0 40 40" width="40" height="40">
                <circle cx="20" cy="20" r="14" fill="none" stroke="white" strokeWidth="3.5"/>
                <circle cx="20" cy="20" r="14" fill="none" stroke="#0891b2" strokeWidth="2"/>
                <line x1="20" y1="2" x2="20" y2="8" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="20" y1="2" x2="20" y2="8" stroke="#0891b2" strokeWidth="2" strokeLinecap="round"/>
                <line x1="20" y1="32" x2="20" y2="38" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="20" y1="32" x2="20" y2="38" stroke="#0891b2" strokeWidth="2" strokeLinecap="round"/>
                <line x1="2" y1="20" x2="8" y2="20" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="2" y1="20" x2="8" y2="20" stroke="#0891b2" strokeWidth="2" strokeLinecap="round"/>
                <line x1="32" y1="20" x2="38" y2="20" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
                <line x1="32" y1="20" x2="38" y2="20" stroke="#0891b2" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="20" cy="20" r="2.5" fill="white"/>
                <circle cx="20" cy="20" r="2.5" fill="#0891b2" fillOpacity="0.9"/>
              </svg>
            </div>
          )}
          {hotspotPopup && (() => {
            const POPUP_W = 280;
            const PANEL_W = panelCollapsed ? 40 : 168;
            const mapW = mapDivRef.current?.clientWidth ?? 800;
            const mapH = mapDivRef.current?.clientHeight ?? 600;
            const TOP_PAD = 48;
            let left = hotspotPopup.x - POPUP_W / 2;
            let top  = hotspotPopup.y - 200 - 16;
            left = Math.max(8, Math.min(left, mapW - PANEL_W - POPUP_W - 8));
            if (top < TOP_PAD) top = hotspotPopup.y + 24;
            top = Math.min(top, mapH - 60);
            return (
              <div
                className="absolute bg-white border border-slate-200 rounded-xl shadow-2xl text-xs"
                style={{ left, top, width: POPUP_W, zIndex: 800, pointerEvents: "auto" }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-end gap-1 px-2 pt-2">
                  {hotspotPopup.cloudWarning && (
                    <button
                      onClick={() => setHotspotWarningOpen(o => !o)}
                      title="Cloud cover advisory"
                      className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${hotspotWarningOpen ? "bg-amber-400 text-white" : "bg-amber-100 text-amber-600 hover:bg-amber-200"}`}
                      style={{ lineHeight: 1, fontSize: 11 }}
                    >⚠</button>
                  )}
                  <button
                    onClick={() => { setHotspotPopup(null); setHotspotWarningOpen(false); }}
                    className="text-slate-400 hover:text-slate-700"
                    style={{ lineHeight: 1 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <div className="px-3 pb-3" dangerouslySetInnerHTML={{ __html: hotspotPopup.html }} />
                {hotspotWarningOpen && hotspotPopup.cloudWarning && (
                  <div className="mx-3 mb-3 p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                    <strong>Extended cloud cover advisory</strong><br/>{hotspotPopup.cloudWarning}
                  </div>
                )}
              </div>
            );
          })()}

          {hoveredWreck&&(<div className="absolute bg-white border border-cyan-200 rounded-lg px-2.5 py-2 text-xs shadow-lg min-w-40 pointer-events-none" style={{left:Math.min(hoveredWreck.px+12,(mapDivRef.current?.clientWidth??800)-172),top:Math.max(8,hoveredWreck.py-10),zIndex:700}}><div className="font-semibold mb-1 text-slate-700">{hoveredWreck.props.symbol==="Wreck"?"Wreck":"Structure"}: {hoveredWreck.props.name||"Unknown"}</div>{hoveredWreck.props.region&&<div className="text-slate-500 text-[10px]">{{HatterasNC:"Hatteras, NC",MoreheadNC:"Morehead City, NC",ChesapeakeMD:"Chesapeake, MD",OceanCityMD:"Ocean City, MD",WilmingtonNC:"Wilmington, NC",MyrtleBeachSC:"Myrtle Beach, SC",GeorgetownSC:"Georgetown, SC",CharlestonSC:"Charleston, SC",BeaufortSC:"Beaufort, SC",HiltonHeadSC:"Hilton Head, SC",SavannahGA:"Savannah, GA",BrunswickGA:"Brunswick, GA",FernandinaFL:"Fernandina Beach, FL",JacksonvilleFL:"Jacksonville, FL",StAugustineFL:"St. Augustine, FL",VaToRI:"VA to RI"}[hoveredWreck.props.region]||hoveredWreck.props.region}</div>}{hoveredWreck.props.depth_ft!=null&&<div className="text-blue-600 font-medium">{Math.round(hoveredWreck.props.depth_ft)} ft</div>}{hoveredWreck.props.year_sunk&&<div className="text-slate-500">Sunk: {hoveredWreck.props.year_sunk}</div>}</div>)}

          {buoyPopup && (
            <div className="absolute bg-white rounded-lg shadow-xl border border-slate-200"
                 style={{ left: buoyPopup.left, top: buoyPopup.top, width: 230, zIndex: 800, padding: "8px 10px" }}>
              <button onClick={() => setBuoyPopup(null)}
                style={{ position: "absolute", top: 2, right: 6, background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "#94a3b8" }}>&times;</button>
              <div dangerouslySetInnerHTML={{ __html: buoyPopupHtml(buoyPopup.b, buoyPopup.loc) }} />
            </div>
          )}

          {clickInfo && (
            <MapClickInfo info={clickInfo} date={date} userId={userId} onClose={() => setClickInfo(null)}
              onPostCommunityReport={onPostCommunityReport}
              onSaved={info => {
                setMarkers(m => [...m, { lat:info.lat, lon:info.lon, sst:info.sst, depth_ft:info.depth_ft, label:info.label, notes:info.notes ?? null, id:info.id, dist_nm:info.dist, bearing_deg:info.bearing != null ? Math.round(info.bearing) : null, bearing_cardinal:info.bearing != null ? bearingLabel(info.bearing) : null, from_location:info.locationLabel }]);
                setSavedWreckKeys(s => new Set([...s, `${info.lat}_${info.lon}`]));
                onLocationSaved(); setClickInfo(null);
              }}/>
          )}

          {/* ── Community pin card ──────────────────────────────────── */}
          {selectedCommunityPin && (() => {
            const { pin, px, py } = selectedCommunityPin;
            const CARD_W = 252;
            // Card height is variable (optional photo, notes, depth/bearing block, tip/share
            // buttons) so a fixed guess here isn't reliable — this is only the first-paint
            // fallback. The ref below measures the real rendered height and snaps the final
            // top position before the browser paints, which is what actually keeps the card
            // on-screen when a pin sits near the bottom edge.
            const CARD_H_ESTIMATE = 320;
            const mapW = mapDivRef.current?.clientWidth  ?? 800;
            const mapH = mapDivRef.current?.clientHeight ?? 600;
            const rawL = px + 14;
            const popL = Math.max(8, rawL + CARD_W > mapW - 8 ? px - CARD_W - 14 : rawL);
            const popT = Math.min(Math.max(8, py - 40), mapH - CARD_H_ESTIMATE - 8);
            const isLive    = pin.type === "live";
            // Live styling is time-boxed to 48h; afterward the pin is shown
            // exactly like a Post-Trip Report (revert, don't disappear).
            const isPulsing = isLive && (Date.now() - new Date(pin.created_at).getTime()) < 48 * 3600000;
            const isLiveActive = isPulsing;
            const speciesList = (pin.species || []).map(s => SPECIES_LABELS[s] || s).join(", ");
            const qty = pin.quantity || {};
            const timeStr = agoLabel(pin.created_at, pin.trip_date, "popup");
            const pinTripBadge = tripDateBadge(pin);

            // Real-time inspector values (live from departure + bathy, NOT from stored pin data)
            const refLoc = selectedLocation;
            const pinLat = parseFloat(pin.lat), pinLon = parseFloat(pin.lon);
            const pinDist    = refLoc ? distanceNm(refLoc.lat, refLoc.lon, pinLat, pinLon) : null;
            const pinBearing = refLoc ? bearingDeg(refLoc.lat, refLoc.lon, pinLat, pinLon) : null;
            let pinDepth = null;
            if (bathyDataRef.current?.points?.length) {
              let best = null, bestD = Infinity;
              for (const pt of bathyDataRef.current.points) {
                const d = (pt.lat - pinLat) ** 2 + (pt.lon - pinLon) ** 2;
                if (d < bestD) { bestD = d; best = pt; }
              }
              pinDepth = best?.depth_ft ?? null;
            }

            const alreadySaved = savedCommunityPins.has(pin.id);

            async function handleSaveCommunityPin() {
              if (!userId || alreadySaved) return;
              const label = pin.display_name
                ? `${speciesList || "Report"} — ${pin.display_name}`
                : (speciesList || "Community Pin");
              const { error } = await supabase
                .from("saved_locations")
                .insert({
                  user_id:              userId,
                  label,
                  lat:                  pinLat,
                  lon:                  pinLon,
                  sst:                  pin.water_temp ?? null,
                  depth_ft:             pinDepth ?? null,
                  dist_nm:              pinDist != null ? parseFloat(pinDist.toFixed(2)) : null,
                  bearing_deg:          pinBearing != null ? Math.round(pinBearing) : null,
                  bearing_cardinal:     pinBearing != null ? bearingLabel(pinBearing) : null,
                  from_location:        refLoc?.label ?? null,
                  notes:                pin.notes ?? null,
                  source_type:          "community",
                  source_display_name:  pin.display_name ?? null,
                  source_user_id:       pin.user_id ?? null,
                });
              if (!error) {
                setSavedCommunityPins(prev => new Set([...prev, pin.id]));
                onLocationSaved?.();
              } else {
                console.error("[Community] save failed:", error.message);
              }
            }

            return (
              <div
                key={pin.id}
                className="absolute bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs"
                style={{ left: popL, top: popT, zIndex: 9500, width: CARD_W }}
                onClick={e => e.stopPropagation()}
                ref={communityCardElRef}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isLiveActive && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"/>
                          LIVE
                        </span>
                      )}
                      <span className="font-semibold text-slate-700">{pin.display_name}</span>
                    </div>
                    <div className="text-slate-400">
                      {timeStr}
                      {pinTripBadge && <span className="text-amber-600 font-semibold"> · {pinTripBadge}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                    {pin.is_own && (
                      <button
                        onClick={() => handleDeletePin(pin)}
                        disabled={deletingPinId === pin.id}
                        title="Delete this report"
                        className="text-slate-400 hover:text-red-600 disabled:opacity-40 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setSelectedCommunityPin(null)} className="text-slate-400 hover:text-slate-700">
                      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>

                {/* Species + qty */}
                {speciesList && (
                  <div className="mb-2">
                    <div className="font-semibold text-slate-700 mb-0.5">{speciesList}</div>
                    {Object.entries(qty).filter(([,v]) => v).map(([k,v]) => (
                      <span key={k} className="inline-block mr-2 text-slate-500">{k}: <span className="font-semibold">{v}</span></span>
                    ))}
                  </div>
                )}

                {/* Photos — up to 10. A single photo keeps the old full-width
                    hero treatment (object-contain so portrait photos aren't
                    center-cropped); 2+ photos show as a horizontal thumbnail
                    strip instead, since the 252px card can't show more than
                    one full-size image at once. Either way, clicking opens
                    the full-screen lightbox with prev/next through the set. */}
                {(() => {
                  const imgs = (pin.image_urls?.length ? pin.image_urls : (pin.image_url ? [pin.image_url] : []));
                  if (imgs.length === 0) return null;
                  if (imgs.length === 1) {
                    return (
                      <img
                        src={imgs[0]}
                        alt=""
                        className="w-full max-h-48 object-contain rounded-lg mb-2 border border-slate-100 bg-slate-50 cursor-zoom-in"
                        onClick={() => setImageLightbox({ urls: imgs, index: 0 })}
                        onLoad={repositionCommunityCard}
                        onError={repositionCommunityCard}
                      />
                    );
                  }
                  return (
                    <div className="flex gap-1.5 mb-2 overflow-x-auto pb-0.5">
                      {imgs.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt=""
                          className="h-14 w-14 flex-shrink-0 object-cover rounded-lg border border-slate-100 bg-slate-50 cursor-zoom-in"
                          onClick={() => setImageLightbox({ urls: imgs, index: i })}
                          onLoad={repositionCommunityCard}
                          onError={repositionCommunityCard}
                        />
                      ))}
                    </div>
                  );
                })()}

                {/* Temp + notes */}
                {pin.water_temp != null && (
                  <div className="text-cyan-600 font-semibold mb-1">{pin.water_temp.toFixed(1)}°F</div>
                )}
                {pin.notes && (
                  <div className="text-slate-500 mb-2 whitespace-pre-wrap break-words">{pin.notes}</div>
                )}

                {/* Real-time inspector: bearing / distance / depth from departure */}
                {(pinDist != null || pinDepth != null) && (
                  <div className="border border-slate-100 rounded-lg px-2 py-1.5 mb-2 bg-slate-50">
                    {pinDist != null && (
                      <div className="flex justify-between text-slate-600 mb-0.5">
                        <span className="text-slate-400">{refLoc?.label ?? "Departure"}</span>
                        <span className="font-semibold">{pinDist.toFixed(1)} nm · {Math.round(pinBearing)}° {bearingLabel(pinBearing)}</span>
                      </div>
                    )}
                    {pinDepth != null && (
                      <div className="flex justify-between text-slate-600">
                        <span className="text-slate-400">Depth</span>
                        <span className="font-semibold text-blue-600">{Math.round(pinDepth)} ft / {Math.round(pinDepth / 6)} fth</span>
                      </div>
                    )}
                  </div>
                )}
                {pinDist == null && pinDepth == null && (
                  <div className="text-slate-300 text-[10px] mb-2 italic">Set a departure for distance &amp; depth</div>
                )}

                {/* Action buttons */}
                <div className="flex gap-1.5 pt-1 border-t border-slate-100">
                  <button
                    onClick={handleSaveCommunityPin}
                    disabled={alreadySaved || !userId}
                    className={`flex-1 py-1.5 rounded-lg font-semibold text-xs transition-colors ${
                      alreadySaved
                        ? "bg-slate-100 text-slate-400 cursor-default"
                        : "bg-cyan-600 hover:bg-cyan-500 text-white"
                    }`}
                  >
                    {alreadySaved ? "Saved" : "Save Location"}
                  </button>
                  {onShare && isPro && (
                    <button
                      onClick={() => {
                        // Build a share-compatible location object from the community pin
                        onShare({
                          id: pin.id,
                          label: pin.display_name,
                          lat: pin.lat,
                          lon: pin.lon,
                          notes: pin.notes ?? "",
                          source_type: "community",
                        });
                        setSelectedCommunityPin(null);
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      Share
                    </button>
                  )}
                  <button
                    onClick={() => setCommunityTipModal({ pin })}
                    className="flex-1 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-white font-semibold text-xs transition-colors"
                  >
                    Tip
                  </button>
                </div>
              </div>
            );
          })()}

          {communityTipModal && createPortal(
            <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" style={{zIndex:9600}} onClick={() => setCommunityTipModal(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-800">Thanks / Tip</span>
                  <button onClick={() => setCommunityTipModal(null)} className="text-slate-400 hover:text-slate-700">
                    <svg width="16" height="16" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <TipFlow pin={communityTipModal.pin} userId={userId} onClose={() => setCommunityTipModal(null)} />
              </div>
            </div>,
            document.body
          )}

          {imageLightbox && createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center bg-black/85 p-4"
              style={{ zIndex: 9700 }}
              onClick={() => setImageLightbox(null)}
            >
              <button
                onClick={() => setImageLightbox(null)}
                className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
              >
                <svg width="24" height="24" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
              {imageLightbox.urls.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setImageLightbox(lb => ({ ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length })); }}
                  className="absolute left-2 sm:left-6 text-white/80 hover:text-white p-2"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
              )}
              <img
                src={imageLightbox.urls[imageLightbox.index]}
                alt=""
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={e => e.stopPropagation()}
              />
              {imageLightbox.urls.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setImageLightbox(lb => ({ ...lb, index: (lb.index + 1) % lb.urls.length })); }}
                  className="absolute right-2 sm:right-6 text-white/80 hover:text-white p-2"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              )}
              {imageLightbox.urls.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-xs font-medium">
                  {imageLightbox.index + 1} / {imageLightbox.urls.length}
                </div>
              )}
            </div>,
            document.body
          )}

          {selectedMarker && (() => {
            const mk = selectedMarker.mk;
            const lat = parseFloat(mk.lat), lon = parseFloat(mk.lon);
            const POPUP_W = 220, POPUP_H = 200;
            const mapW = mapDivRef.current?.clientWidth ?? 800, mapH = mapDivRef.current?.clientHeight ?? 600;
            const rawL = selectedMarker.px + 14;
            const popLeft = Math.max(8, rawL + POPUP_W > mapW - 8 ? selectedMarker.px - POPUP_W - 14 : rawL);
            const popTop = Math.min(Math.max(8, selectedMarker.py - 40), mapH - POPUP_H - 8);
            return (
              <div className="absolute bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs" style={{ left: popLeft, top: popTop, zIndex: 800, width: 220 }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-800 font-semibold truncate">{mk.label || "Saved Location"}</span>
                  <button onClick={() => setSelectedMarker(null)} className="text-slate-400 hover:text-slate-700 ml-2 flex-shrink-0"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
                </div>
                <div className="font-mono text-slate-600 mb-1">{lat.toFixed(4)}°N &nbsp; {Math.abs(lon).toFixed(4)}°{lon < 0 ? "W" : "E"}</div>
                {(mk.sst != null || mk.depth_ft != null) && (
                  <div className="flex gap-3 mb-2">
                    {mk.sst != null && <span className="text-cyan-600 font-semibold">{parseFloat(mk.sst).toFixed(1)}°F</span>}
                    {mk.depth_ft != null && <span className="text-blue-600 font-semibold">{Math.round(mk.depth_ft)} ft / {Math.round(mk.depth_ft / 6)} fth</span>}
                  </div>
                )}
                {(mk.from_location || mk.dist_nm != null) && (
                  <div className="border-t border-slate-100 pt-1.5 mb-2 space-y-1">
                    {mk.from_location && <div className="flex justify-between"><span className="text-slate-400">From</span><span className="font-semibold text-slate-700 truncate max-w-[130px]">{mk.from_location}</span></div>}
                    {(mk.dist_nm != null || mk.bearing_deg != null) && <div className="flex justify-between">{mk.dist_nm != null && <span className="font-semibold text-slate-700">{mk.dist_nm.toFixed(1)} nm</span>}{mk.bearing_deg != null && <span className="font-semibold text-slate-700">{mk.bearing_deg}° {mk.bearing_cardinal ?? ""}</span>}</div>}
                  </div>
                )}
                <div className="flex gap-1.5">
                  {onShare && isPro && (
                    <button onClick={() => { onShare(mk); setSelectedMarker(null); }} className="flex-1 flex items-center justify-center gap-1 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Send
                    </button>
                  )}
                  <button onClick={async () => { if (mk.id) await supabase.from("saved_locations").delete().eq("id", mk.id); setMarkers(m => m.filter(m2 => m2.id !== mk.id)); setSelectedMarker(null); onLocationSaved(); }} className="flex-1 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors">Delete</button>
                </div>
              </div>
            );
          })()}

          {shareLocation && (
            <ShareLocationDialog key={shareLocation?.id ?? shareLocation?.lat} location={shareLocation} userId={userId} onClose={() => setShareLocation(null)}
              onNotesUpdated={(id, newNotes) => { onNotesUpdated?.(id, newNotes); }}
              heatmapData={shareHeatmapData ?? data} sstMin={sstMin} sstMax={sstMax} sstRange={sstRange}/>
          )}

          {/* Desktop saved panel */}
          {showSavedPanel?(
            <SavedPanel
              savedLocations={savedLocations} fetchSavedLocations={fetchSavedLocations}
              clearMarkersRef={clearMarkersRef} flyToRef={flyToRef}
              highlightedLocation={highlightedLocation} setHighlightedLocation={setHighlightedLocation}
              onShare={onShare} onTipCommunitySource={loc => setCommunityTipModal({ pin: { ...loc, user_id: loc.source_user_id, display_name: loc.source_display_name, venmo: loc.source_venmo ?? null, cashapp: loc.source_cashapp ?? null } })} isPro={isPro} userId={userId}
              onClose={()=>setShowSavedPanel(false)}
              onLoadRoute={onLoadRoute}
              onRoutesCountChange={setSavedRoutesCount}
              sliderHeight={sliderHeight}
              tripMode={tripMode}
              onAddWaypoint={onAddWaypoint}
              communityLocations={communityLocations}
              heatmapDataForShare={shareHeatmapData ?? data} sstMinForShare={sstMin} sstMaxForShare={sstMax} sstRangeForShare={sstRange}
              className="hidden sm:flex"
            />
          ):(
            <button onClick={()=>setShowSavedPanel(true)} className="hidden sm:flex absolute left-2 bg-white border border-slate-200 rounded-full shadow-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 items-center gap-1.5" style={{bottom:sliderHeight+8,zIndex:900}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              <span>Locations</span>
            </button>
          )}

          {windActive&&windData?.hours?.length>0&&isDesktop&&(
            <TimeScrubber
              items={windData.hours}
              getTime={h => new Date(h.time + "Z")}
              index={windHourIndex} setIndex={setWindHourIndex}
              isPlaying={windPlaying} setIsPlaying={setWindPlaying}
              playIntervalMs={2333}
              accentColor="#f59e0b"
              showDayTabs
              dayKey={d => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`}
              dayLabel={d => { const DN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; return `${DN[d.getUTCDay()]} ${d.getUTCDate()}`; }}
              formatTooltip={d => { const DN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; const h=d.getUTCHours(); const ampm=h===0?"12 AM":h<12?`${h} AM`:h===12?"12 PM":`${h-12} PM`; return `${DN[d.getUTCDay()]} ${d.getUTCDate()} - ${ampm}`; }}
              legend={isWindMap ? <WindLegend maxSpeed={windData?.maxSpeed ?? 30} /> : null}
              avoidMobileWeatherSheet={false}
            />
          )}

          {showRadarOverlay && radarFrames.length > 0 && (
            <TimeScrubber
              items={radarFrames}
              getTime={f => new Date(f.time * 1000)}
              index={radarFrameIndex} setIndex={setRadarFrameIndex}
              isPlaying={radarPlaying} setIsPlaying={setRadarPlaying}
              playIntervalMs={600}
              accentColor="#0891b2"
              formatTooltip={(d, item, idx, isLast) => `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}${isLast ? " (latest)" : ""}`}
              bottomOffset={radarSliderBottom}
            />
          )}

          {isWindMap && (
            <div className="sm:hidden absolute left-0 right-0 px-2" style={{ bottom: 64, zIndex: 600, pointerEvents: "none" }}>
              <WindLegend isWindMap={true} />
            </div>
          )}

          {/* GPS HUD — enhanced with navigation info when active */}
          {gpsActive && boatPosition && (() => {
            // Compute nav ETA if navigating
            let navLine1 = null, navLine2 = null;
            if (navigatingRoute && waypoints?.length && currentWpIndex < waypoints.length) {
              const targetWp = waypoints[currentWpIndex];
              const distNm   = navHaversineNm(boatPosition.lat, boatPosition.lon, targetWp.lat, targetWp.lng);
              const spd      = smoothedSpeedKts();
              const etaLabel = (spd && spd > 0.5)
                ? (() => {
                    const eta = new Date(Date.now() + (distNm / spd) * 3600000);
                    return eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  })()
                : null;
              navLine1 = `WP ${currentWpIndex} of ${waypoints.length - 1}  ${distNm.toFixed(1)} nm`;
              navLine2 = etaLabel ? `ETA ${etaLabel}` : null;
            }
            const isNav = !!navigatingRoute;
            return (
              <div style={{ position: "absolute", bottom: 72, left: 8, zIndex: 800, pointerEvents: "auto",
                            background: "rgba(15,23,42,0.82)", color: "#e2e8f0", borderRadius: 10,
                            padding: "7px 11px", fontSize: 11, fontFamily: "ui-monospace, monospace",
                            backdropFilter: "blur(4px)",
                            border: `1px solid ${isNav ? "rgba(16,185,129,0.55)" : "rgba(6,182,212,0.35)"}`,
                            cursor: "pointer" }}
                   onClick={() => setBoatPopupOpen(v => !v)}>
                <div style={{ color: isNav ? "#34d399" : "#22d3ee", fontWeight: 700, marginBottom: 3,
                              display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                                 background: isNav ? "#34d399" : "#22d3ee",
                                 boxShadow: `0 0 6px ${isNav ? "#34d399" : "#22d3ee"}` }}/>
                  {isNav ? "Navigating" : "GPS Active"}
                  {tripSharing && <span style={{ fontSize: 9, color: "#f59e0b", marginLeft: 4,
                                                background: "rgba(245,158,11,0.15)", borderRadius: 4,
                                                padding: "1px 4px" }}>LIVE</span>}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 10.5 }}>
                  {boatPosition.lat.toFixed(5)}° N &nbsp; {Math.abs(boatPosition.lon).toFixed(5)}° W
                </div>
                {navLine1 && <div style={{ color: "#34d399", fontWeight: 600, marginTop: 2 }}>{navLine1}</div>}
                {navLine2 && <div style={{ color: "#f0f9ff" }}>{navLine2}</div>}
                {!navLine1 && boatPosition.speedKts != null && (
                  <div>SPD <span style={{ color: "#f0f9ff", fontWeight: 600 }}>{boatPosition.speedKts}</span> kts</div>
                )}
                {boatPosition.heading != null && (
                  <div>HDG <span style={{ color: "#f0f9ff", fontWeight: 600 }}>{Math.round(boatPosition.heading)}°</span></div>
                )}
                {boatPosition.accuracy != null && (
                  <div style={{ color: "#64748b", fontSize: 10 }}>±{Math.round(boatPosition.accuracy)} m</div>
                )}
              </div>
            );
          })()}

          {/* Boat-click popup: Start Navigation / Stop GPS */}
          {boatPopupOpen && gpsActive && (
            <div style={{ position: "absolute", bottom: 170, left: 8, zIndex: 900,
                          background: "#1e293b", borderRadius: 10, padding: "8px 6px",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.4)", minWidth: 160,
                          border: "1px solid rgba(255,255,255,0.08)" }}>
              {/* Close */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <button onClick={() => setBoatPopupOpen(false)}
                  style={{ color: "#64748b", background: "none", border: "none", cursor: "pointer",
                           padding: "2px 4px", fontSize: 12 }}>✕</button>
              </div>
              {!navigatingRoute && waypoints?.length >= 2 && (
                <button
                  onClick={() => { setBoatPopupOpen(false); onStartNavFromMap?.(); }}
                  style={{ display: "block", width: "100%", padding: "7px 10px", marginBottom: 4,
                           background: "#059669", color: "#fff", border: "none", borderRadius: 7,
                           fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                  Start Navigation
                </button>
              )}
              {navigatingRoute && (
                <button
                  onClick={() => { setBoatPopupOpen(false); onEndNavFromMap?.(); }}
                  style={{ display: "block", width: "100%", padding: "7px 10px", marginBottom: 4,
                           background: "#dc2626", color: "#fff", border: "none", borderRadius: 7,
                           fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                  End Navigation
                </button>
              )}
              <button
                onClick={() => { setBoatPopupOpen(false); onToggleGps(); }}
                style={{ display: "block", width: "100%", padding: "7px 10px",
                         background: "rgba(255,255,255,0.07)", color: "#94a3b8", border: "none",
                         borderRadius: 7, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                Stop GPS
              </button>
            </div>
          )}

          {/* End-trip confirmation (near final waypoint) */}
          {endTripConfirm && navigatingRoute && (
            <div style={{ position: "fixed", inset: 0, zIndex: 9600, display: "flex",
                          alignItems: "center", justifyContent: "center",
                          background: "rgba(0,0,0,0.45)" }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px",
                            maxWidth: 300, width: "90%", textAlign: "center",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                  You've reached your destination
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 18 }}>
                  End the navigation and see your trip summary?
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => { setEndTripConfirm(false); onEndNavFromMap?.(); }}
                    style={{ flex: 1, padding: "9px 0", background: "#0e7490", color: "#fff",
                             border: "none", borderRadius: 9, fontWeight: 700, fontSize: 12,
                             cursor: "pointer" }}>
                    End Trip
                  </button>
                  <button
                    onClick={() => setEndTripConfirm(false)}
                    style={{ flex: 1, padding: "9px 0", background: "#f1f5f9", color: "#475569",
                             border: "none", borderRadius: 9, fontWeight: 600, fontSize: 12,
                             cursor: "pointer" }}>
                    Keep Going
                  </button>
                </div>
              </div>
            </div>
          )}

          {!tripMode && !showBathyRaster && !showRadarOverlay && (
          <div className="sm:hidden absolute left-0 px-2" style={{ right: 44, bottom: 64, zIndex: 600, pointerEvents: "auto" }}>
            {isWindMap
              ? null
              : activeDataLayer === "chlorophyll"
              ? <div className="flex items-start" style={{ height: 32 }}>
                  <MobileGradientBar
                    gradient={CHL_GRADIENT} label="Chlorophyll" unit=" µg/L" logScale
                    lo={sstRange?.min ?? (chlData?.days?.[chlDateIndex]?.stats?.min ?? 0.01)}
                    hi={sstRange?.max ?? (chlData?.days?.[chlDateIndex]?.stats?.max ?? 10)}
                    hoverVal={hoverInfo?.chl}
                    onBarClick={() => rangeControlOpenRef?.current?.()}/>
                </div>
              : activeDataLayer === "seacolor"
              ? <div className="flex items-start" style={{ height: 32 }}>
                  <MobileGradientBar
                    gradient={KD_GRADIENT} label="Kd490" unit=" m⁻¹"
                    lo={sstRange?.min ?? (seaColorData?.days?.[seaColorDateIndex]?.stats?.min ?? 0.01)}
                    hi={sstRange?.max ?? (seaColorData?.days?.[seaColorDateIndex]?.stats?.max ?? 0.50)}
                    onBarClick={() => rangeControlOpenRef?.current?.()}/>
                </div>
              : <div className="flex items-start" style={{ height: 32 }}>
                  <SSTLegend sstMin={sstMin} sstMax={sstMax} hoverSst={legendHoverSst} rangeMin={sstRange?.min ?? seasonalSstDefault?.min} rangeMax={sstRange?.max ?? seasonalSstDefault?.max}/>
                </div>
            }
          </div>
          )}
        </div>
      </div>
    </div>

    {/* Waypoint delete popup — rendered at root so it's never clipped */}
    {wpDeletePopup && createPortal(
      <div
        style={{ position: "fixed", left: wpDeletePopup.px, top: wpDeletePopup.py - 48,
                 transform: "translateX(-50%)", zIndex: 9000, pointerEvents: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 px-3 py-2.5 flex items-center gap-2.5 text-xs">
          <span className="text-slate-600 font-medium max-w-[120px] truncate">{wpDeletePopup.label}</span>
          <button
            onClick={() => { onRemoveWaypoint?.(wpDeletePopup.id); setWpDeletePopup(null); }}
            className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
          >Delete</button>
          <button
            onClick={() => setWpDeletePopup(null)}
            className="px-2 py-1 text-slate-400 hover:text-slate-600 transition-colors"
          >✕</button>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
