import React, { useState, useEffect, useMemo, useRef, Component } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMURSST, fetchVIIRSSST, fetchGOESComposite, fetchChlorophyll, fetchSeaColor, fetchCHLBundle, fetchCHLComposite, fetchSeaColorBundle, fetchSeaColorComposite } from "@/lib/dataFetchers";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/shell/AppShell";
import TrialExpiredWall from "@/components/auth/TrialExpiredWall";
import { useAppContext } from "@/context/AppContext";
import SSTHeatmapLeaflet from "@/components/SSTHeatmapLeaflet";
import SSTLegend from "@/components/SSTLegend";
import ShareLocationDialog from "@/components/ShareLocationDialog";
import { WindLegend } from "@/components/WindTimeSlider";
import { useRegionAccess } from "@/hooks/useRegionAccess";
import TripPlanner from "@/components/TripPlanner";
import TripSummaryModal from "@/components/TripSummaryModal";
import CommunityReportForm from "@/components/CommunityReportForm";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import LeaderboardModal from "@/components/LeaderboardModal";

// ── Deploy diagnostic ─────────────────────────────────────────────────────────
if (typeof window !== "undefined") console.log("SST deploy check: 2026-06-11T01");

// ── Leaflet / velocity side-effects (must run once) ───────────────────────────
if (typeof document !== "undefined" && !document.getElementById("leaflet-velocity-script")) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/leaflet-velocity@1.9.2/dist/leaflet-velocity.css";
  document.head.appendChild(link);
  const script = document.createElement("script");
  script.id = "leaflet-velocity-script";
  script.src = "https://cdn.jsdelivr.net/npm/leaflet-velocity@1.9.2/dist/leaflet-velocity.min.js";
  document.head.appendChild(script);
}
if (typeof document !== "undefined" && !document.getElementById("leaflet-tw-fix")) {
  const s = document.createElement("style");
  s.id = "leaflet-tw-fix";
  s.textContent = `
    .leaflet-container img.leaflet-image-layer,
    .leaflet-container img.leaflet-tile,
    .leaflet-pane img { max-width: none !important; max-height: none !important; }
    .leaflet-velocity-layer { pointer-events: none; }
    .leaflet-velocity-layer canvas { max-width: none !important; max-height: none !important; }
    .leaflet-overlay-pane canvas { overflow: visible !important; }
  `;
  document.head.appendChild(s);
}
if (typeof document !== "undefined" && !document.getElementById("sst-dvh-fix")) {
  const s = document.createElement("style");
  s.id = "sst-dvh-fix";
  s.textContent = `.sst-fullscreen { height: 100vh; height: 100dvh; }`;
  document.head.appendChild(s);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const BATHY_CONTOURS_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry_contours.json";
const WRECKS_URL         = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/wrecks.json";
const HOTSPOTS_BASE      = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST";
const VIIRS_CDN_BASE     = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/VIIRS/Bundled";
const VIIRS_COMPOSITE_URL= `${VIIRS_CDN_BASE}/viirs_composite.json`;
const WIND_DATA_URL      = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/WindData/wind_latest.json";
const CURRENTS_URL       = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/Currents/currents_latest.json";
const ALTIMETRY_URL      = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/Altimetry/altimetry_latest_grid.json";
const _viirsCache = new Map();

// ── VIIRS bundle parsing ───────────────────────────────────────────────────────
function bundleToDay(bundle) {
  const nLons = bundle.lonSet.length;
  const hours_cache = {};
  for (const [hrStr, hrData] of Object.entries(bundle.hours || {})) {
    const grid = [];
    (hrData.sst || []).forEach((val, idx) => {
      if (val !== null && val !== undefined) {
        const latIdx = Math.floor(idx / nLons), lonIdx = idx % nLons;
        if (latIdx < bundle.latSet.length && lonIdx < bundle.lonSet.length)
          grid.push({ lat: bundle.latSet[latIdx], lon: bundle.lonSet[lonIdx], sst: val });
      }
    });
    hours_cache[hrStr] = { grid, stats: { min: hrData.min, max: hrData.max } };
  }
  const avail  = [...new Set(bundle.available_hours || [])].sort((a, b) => a - b);
  const lastHr = avail.length > 0 ? avail[avail.length - 1] : null;
  return {
    date: bundle.date, available_hours: avail,
    grid:  lastHr != null ? (hours_cache[String(lastHr)]?.grid  ?? []) : [],
    stats: lastHr != null ? (hours_cache[String(lastHr)]?.stats ?? null) : null,
    hours_cache,
    canonicalLatSet: bundle.latSet,
    canonicalLonSet: bundle.lonSet,
  };
}



// ── Response normalization ────────────────────────────────────────────────────
function normalizeSSTResponse(res, sourceName, valueKey = "sst") {
  const data = res?.data ?? res;
  const topKeys = data && typeof data === "object" ? Object.keys(data) : [];
  const firstDay = data?.days?.[0];
  const firstGrid = firstDay?.grid;
  const isFC = data?.type === "FeatureCollection" && Array.isArray(data?.features);
  console.log(`[SST:${sourceName}] response shape:`, { topLevelKeys: topKeys, hasDays: Array.isArray(data?.days), dayCount: data?.days?.length, firstGridLen: Array.isArray(firstGrid) ? firstGrid.length : null, isFeatureCollection: isFC });
  if (Array.isArray(data?.days) && data.days.length > 0 && Array.isArray(firstGrid) && firstGrid.length > 0) return { ok: true, status: "ok", data };
  if (Array.isArray(data?.days) && data.days.length === 0) return { ok: false, status: "empty", data: { days: [] } };
  if (Array.isArray(data?.days) && data.days.length > 0) return { ok: false, status: "empty", data };
  if (isFC) {
    const grid = data.features.map(f => { const c=f?.geometry?.coordinates, v=f?.properties?.[valueKey]; if(!Array.isArray(c)||c.length<2||v==null||!Number.isFinite(v))return null; return{lon:c[0],lat:c[1],[valueKey]:v}; }).filter(Boolean);
    if (!grid.length) return { ok: false, status: "empty", data: { days: [] } };
    const vals = grid.map(d => d[valueKey]); const stats = { min: Math.min(...vals), max: Math.max(...vals) };
    const date = data.date ?? firstDay?.date ?? new Date().toISOString().slice(0, 10);
    return { ok: true, status: "ok", data: { days: [{ date, grid, stats }] } };
  }
  return { ok: false, status: "malformed", data: { days: [] } };
}

function sourceLabel(src){return{MUR:"MUR Daily Composite",VIIRS:"VIIRS Passes",VIIRSSNPP:"VIIRS Daily",GOESCOMP:"GOES Composite"}[src]??src;}

// ── Layer gradient legend ─────────────────────────────────────────────────────
function GradientLegend({ gradient, label, unit, dataMin, dataMax, rangeMin, rangeMax, hoverVal, logScale, onClick }) {
  const tickRef = React.useRef(null);
  const bubbleRef = React.useRef(null);
  const rMin = rangeMin ?? dataMin;
  const rMax = rangeMax ?? dataMax;

  const tPos = (v) => {
    if (v == null || !Number.isFinite(v)) return null;
    return logScale
      ? Math.max(0, Math.min(1, (Math.log10(Math.max(v, 1e-9)) - Math.log10(Math.max(rMin, 1e-9))) / (Math.log10(Math.max(rMax, 1e-9)) - Math.log10(Math.max(rMin, 1e-9)))))
      : Math.max(0, Math.min(1, (v - rMin) / (rMax - rMin)));
  };
  const tFromBar = (t) => logScale
    ? Math.pow(10, Math.log10(Math.max(rMin, 1e-9)) + t * (Math.log10(Math.max(rMax, 1e-9)) - Math.log10(Math.max(rMin, 1e-9))))
    : rMin + t * (rMax - rMin);
  const fmt = (v) => v < 1 ? v.toFixed(3) : v.toFixed(2);

  // Show map-hover position via DOM refs (no state = no parent re-render)
  const mapPct = tPos(hoverVal);
  React.useEffect(() => {
    if (mapPct == null) return;
    if (tickRef.current) { tickRef.current.style.left = `${mapPct * 100}%`; tickRef.current.style.display = "block"; }
    if (bubbleRef.current) { bubbleRef.current.style.left = `${mapPct * 100}%`; bubbleRef.current.textContent = fmt(hoverVal) + unit; bubbleRef.current.style.display = "block"; }
  });
  React.useEffect(() => {
    if (mapPct == null) {
      if (tickRef.current) tickRef.current.style.display = "none";
      if (bubbleRef.current) bubbleRef.current.style.display = "none";
    }
  });

  const handleBarMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = tFromBar(t);
    if (tickRef.current) { tickRef.current.style.left = `${t * 100}%`; tickRef.current.style.display = "block"; }
    if (bubbleRef.current) { bubbleRef.current.style.left = `${t * 100}%`; bubbleRef.current.textContent = fmt(v) + unit; bubbleRef.current.style.display = "block"; }
  };
  const handleBarLeave = () => {
    const p = tPos(hoverVal);
    if (p == null) {
      if (tickRef.current) tickRef.current.style.display = "none";
      if (bubbleRef.current) bubbleRef.current.style.display = "none";
    } else {
      if (tickRef.current) { tickRef.current.style.left = `${p * 100}%`; tickRef.current.style.display = "block"; }
      if (bubbleRef.current) { bubbleRef.current.style.left = `${p * 100}%`; bubbleRef.current.textContent = fmt(hoverVal) + unit; bubbleRef.current.style.display = "block"; }
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 select-none" style={{ overflow: "visible", position: "relative" }} onClick={onClick}>
      <span className="text-[10px] font-semibold text-slate-500 shrink-0">{label}</span>
      <div className="relative flex-1 rounded" style={{ minWidth: 80, overflow: "visible", cursor: "crosshair" }}
           onMouseMove={handleBarMove} onMouseLeave={handleBarLeave}>
        <div className="h-4 rounded w-full" style={{ background: gradient }}/>
        <div ref={tickRef} className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ display: "none", transform: "translateX(-50%)" }}/>
        <div ref={bubbleRef} className="absolute px-1.5 py-0.5 rounded text-[11px] font-bold text-white shadow-md whitespace-nowrap"
             style={{ display: "none", bottom: "calc(100% + 4px)", transform: "translateX(-50%)", background: "#0e7490", zIndex: 9999, pointerEvents: "none" }}/>
      </div>
      <span className="text-[10px] text-slate-400 shrink-0">
        {rMin < 1 ? rMin.toFixed(2) : rMin.toFixed(1)}–{rMax < 1 ? rMax.toFixed(2) : rMax.toFixed(1)}{unit}
      </span>
    </div>
  );
}
const CHL_GRADIENT  = "linear-gradient(to right, rgb(10,40,130), rgb(0,100,180), rgb(0,170,100), rgb(120,200,0), rgb(200,160,0))";
const KD_GRADIENT   = "linear-gradient(to right, rgb(10,60,160), rgb(0,140,170), rgb(0,160,80), rgb(100,150,20), rgb(150,100,0))";
const SLA_GRADIENT  = "linear-gradient(to right, rgb(0,20,160), rgb(40,100,230), rgb(140,190,255), rgb(248,248,248), rgb(255,190,140), rgb(255,80,30), rgb(160,0,0))";

// ─────────────────────────────────────────────────────────────────────────────
// InlineLogin — self-contained, zero external deps, shown when no session
// ─────────────────────────────────────────────────────────────────────────────
function InlineLogin() {
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [sent, setSent]         = useState(false);

  async function handleLogin(e) {
    e.preventDefault(); setError(null); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) setError(err.message);
    // on success, onAuthStateChange in SSTLive fires → session updates → app renders
  }

  async function handleRegister(e) {
    e.preventDefault(); setError(null);
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (err) setError(err.message); else setSent(true);
  }

  const inputStyle = { width: "100%", height: 36, borderRadius: 8, border: "1px solid #cbd5e1", padding: "0 12px", fontSize: 14, color: "#1e293b", outline: "none", boxSizing: "border-box" };
  const btnStyle   = { width: "100%", height: 40, borderRadius: 8, background: "#0e7490", color: "#fff", border: "none", fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 };
  const linkStyle  = { background: "none", border: "none", color: "#0e7490", cursor: "pointer", fontWeight: 600, fontSize: 12, padding: 0 };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#eff6ff,#f0f9ff,#f8fafc)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 8px 32px rgba(0,0,0,0.10)", padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🌊</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>RipLoc</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
            {mode === "login" ? "Sign in to access your SST data" : "Start your free 7-day trial"}
          </div>
        </div>

        {sent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
            <p style={{ fontSize: 14, color: "#334155", fontWeight: 600 }}>Check your email</p>
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Confirmation link sent to <strong>{email}</strong>.</p>
            <button style={{ ...linkStyle, marginTop: 16 }} onClick={() => { setSent(false); setMode("login"); }}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={mode === "login" ? handleLogin : handleRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Email</label>
              <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Password</label>
              <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
            </div>
            {mode === "register" && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Confirm password</label>
                <input style={inputStyle} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
              </div>
            )}
            {error && <div style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
            <button type="submit" style={btnStyle} disabled={loading}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create free account"}
            </button>
            <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {mode === "login" ? <>No account? <button type="button" style={linkStyle} onClick={() => { setMode("register"); setError(null); }}>Start free trial</button></> : <>Have an account? <button type="button" style={linkStyle} onClick={() => { setMode("login"); setError(null); }}>Sign in</button></>}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SSTPageBody
// ─────────────────────────────────────────────────────────────────────────────
function SSTPageBody() {
  console.log("[SST:GATE] SSTPageBody mounted");
  const {
    regionConfig, selectedLocation,
    // GPS tracking (state + start/stop/toggle) fully lives in AppContext
    // now (2026-06-22) so non-map components -- UserSettingsModal's "use
    // my live GPS position" notification preference -- can both read live
    // position AND start tracking directly, without the user needing to
    // also separately tap the GPS button on the map.
    gpsActive, boatPosition, boatTrack, toggleGps,
    endNavigation, navigatingRoute, startNavigation,
  } = useAppContext();
  const { isPro } = useRegionAccess();

  // Auth is guaranteed by the outer SSTLive gate — no second listener needed here.

  const [userId, setUserId] = useState(null);
  useEffect(() => {
    // getUser() can transiently reject (seen in the wild: "Lock broken by
    // another request with the 'steal' option" from supabase-js's auth
    // lock under multi-tab/rapid-reload contention). Previously this had no
    // .catch(), so a single failed call left userId stuck at null for the
    // rest of the session with no retry -- silently breaking every
    // userId-gated feature (saved locations, community posts, push
    // notifications) without any visible error. Retry once after a short
    // delay before giving up.
    let cancelled = false;
    function fetchUser(isRetry) {
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled && data?.user) setUserId(data.user.id);
      }).catch(err => {
        console.warn("[SST:AUTH] getUser failed" + (isRetry ? " (retry)" : "") + ":", err);
        if (!isRetry && !cancelled) setTimeout(() => fetchUser(true), 1500);
      });
    }
    fetchUser(false);
    return () => { cancelled = true; };
  }, []);

  // sstRange is a single shared gain/range across layers. The {55,78} default is the
  // SST (degF) range; for chl/seacolor it must fall back to each layer's own data range.
  // On a layer SWITCH, SSTRangeControl clears this to null so overlays use day stats.
  // But on COLD START the layer never changes, so seed null when the initial layer is
  // not SST -> chl/seacolor render with their own range instead of the SST 55-78 default
  // (which on chl's log scale would blank the map).
  // Default gain = null for EVERY layer -> each renders on its own data range (auto),
  // which is the correct/expected look. The fixed 55-78 degF default over-saturated warm
  // summer SST/composite on cold-start (everything clamped red). Users can still set a
  // custom gain via the Temp Gain control (which sets sstRange).
  const [sstRange, setSstRange] = useState(null);

  const [murState,      setMurState]      = useState({ data: null, dateIndex: 0 });
  const [viirsState,    setViirsState]    = useState({ data: null, dateIndex: 0, hour: null });
  const [viirsNppState, setViirsNppState] = useState({ data: null, dateIndex: 0 });
  const [goesCompState, setGoesCompState] = useState({ data: null, dateIndex: 0 });

  const murData=murState.data, murDateIndex=murState.dateIndex;
  const setMurDateIndex=fn=>setMurState(s=>({...s,dateIndex:typeof fn==="function"?fn(s.dateIndex):fn}));
  const viirsData=viirsState.data, viirsDateIndex=viirsState.dateIndex, viirsHour=viirsState.hour;
  const setViirsDateIndex=fn=>setViirsState(s=>({...s,dateIndex:typeof fn==="function"?fn(s.dateIndex):fn}));
  const setViirsHour=h=>setViirsState(s=>({...s,hour:h}));
  const viirsNppData=viirsNppState.data, viirsNppDateIndex=viirsNppState.dateIndex;
  const setViirsNppDateIndex=fn=>setViirsNppState(s=>({...s,dateIndex:typeof fn==="function"?fn(s.dateIndex):fn}));
  const goesCompData=goesCompState.data, goesCompDateIndex=goesCompState.dateIndex;
  const setGoesCompDateIndex=fn=>setGoesCompState(s=>({...s,dateIndex:typeof fn==="function"?fn(s.dateIndex):fn}));

  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [sourceStatus,   setSourceStatus]   = useState({ MUR: null, VIIRS: null, VIIRSSNPP: null, GOESCOMP: null });
  const [savedLocations, setSavedLocations] = useState([]);
  const [shareLocation,  setShareLocation]  = useState(null);
  const clearMarkersRef     = useRef(null);
  const flyToRef            = useRef(null);
  const openControlPanelRef = useRef(null);
  const rangeControlOpenRef = useRef(null);
  const [legendHoverSst, setLegendHoverSst] = useState(null);
  const [dataSource,     setDataSource]     = useState(() => localStorage.getItem("sst_source") || "MUR");
  const [activeDataLayer,setActiveDataLayer]= useState(() => localStorage.getItem("sst_active_layer") || "sst");
  const [chlData,        setChlData]        = useState(null);
  const [chlLoading,     setChlLoading]     = useState(false);
  const [chlDateIndex,   setChlDateIndex]   = useState(0);
  const [chlSource,         setChlSource]         = useState("daily"); // "daily" | "composite"
  const [chlCompositeData,  setChlCompositeData]  = useState(null);
  const [chlCompositeLoading,setChlCompositeLoading]= useState(false);
  const [chlCompositeDates,  setChlCompositeDates]  = useState([]); // dated composite filenames
  const [chlCompositeDateIndex,setChlCompositeDateIndex] = useState(0);
  const [seaColorData,   setSeaColorData]   = useState(null);
  const [seaColorLoading,setSeaColorLoading]= useState(false);
  const [seaColorDateIndex,setSeaColorDateIndex] = useState(0);
  const [seaColorSource,          setSeaColorSource]          = useState("daily");
  const [seaColorCompositeData,   setSeaColorCompositeData]   = useState(null);
  const [seaColorCompositeLoading,setSeaColorCompositeLoading]= useState(false);
  const [seaColorCompositeDates,  setSeaColorCompositeDates]  = useState([]);
  const [seaColorCompositeDateIndex,setSeaColorCompositeDateIndex] = useState(0);
  const [highlightedLocation,setHighlightedLocation] = useState(null);
  const [compositeData,      setCompositeData]      = useState(null);
  const [compositeGenerated, setCompositeGenerated] = useState(null);
  const [compositeDate,      setCompositeDate]      = useState(null);
  const [compositeDateIndex, setCompositeDateIndex] = useState(0);
  const [compositeDates,     setCompositeDates]     = useState([]);
  const [compositeIndexDates,setCompositeIndexDates]= useState([]); // dated composite filenames
  const compositeLoadedDateRef = React.useRef(null);

  const [windData,       setWindData]       = useState(null);
  const [windLoading,    setWindLoading]    = useState(false);
  const [windHourIndex,  setWindHourIndex]  = useState(0);
  const [showWindOverlay,setShowWindOverlay]= useState(false);
  const [windPlaying,    setWindPlaying]    = useState(false);
  const [currentsData,   setCurrentsData]   = useState(null);
  const [currentsLoading,setCurrentsLoading]= useState(false);
  const [showCurrents,   setShowCurrents]   = useState(false);
  const [altimetryData,  setAltimetryData]  = useState(null);
  const [slaRange,       setSlaRange]       = useState({ min: -0.2, max: 0.2 });
  const [altimetryLoading,setAltimetryLoading]=useState(false);
  const [hotspotData,    setHotspotData]    = useState(null);
  const [hotspotLoading, setHotspotLoading] = useState(false);
  const [selectedFishSpecies,setSelectedFishSpecies] = useState("yellowfin");
  const [showHotspots,   setShowHotspots]   = useState(false);
  const [wreckRemovedKeys, setWreckRemovedKeys] = useState(new Set());
  const [tripMode,       setTripMode]       = useState(false);
  const [waypoints,      setWaypoints]      = useState([]);
  const [loadedRoute,    setLoadedRoute]    = useState(null);
  const [endTripPrompt,  setEndTripPrompt]  = useState(false);
  const [tripSummaryData, setTripSummaryData] = useState(null);
  // GPS / Real-Time tracking (gpsActive/boatPosition/boatTrack/toggleGps
  // now all come from AppContext -- see destructuring above)

  // ── Community reports state ───────────────────────────────────────────────
  const [communityLocations,  setCommunityLocations]  = useState([]);
  const [showCommunityLayer,  setShowCommunityLayer]  = useState(true);
  const [communityAccess,     setCommunityAccess]     = useState(null);
  const [communityFormData,   setCommunityFormData]   = useState(null);
  const [showLeaderboard,     setShowLeaderboard]     = useState(false);
  const [communityPinDrop,    setCommunityPinDrop]    = useState(null); // "live" | "report" | null
  const [showOnboarding,      setShowOnboarding]      = useState(false);

  // Re-launch tour from HelpReportModal or UserSettingsModal via custom event
  useEffect(() => {
    function handleStartTour() { setShowOnboarding(true); }
    document.addEventListener("riploc:start-tour", handleStartTour);
    return () => document.removeEventListener("riploc:start-tour", handleStartTour);
  }, []);

  // Check has_seen_onboarding after map loads and userId is available
  useEffect(() => {
    if (loading || !userId) return;
    supabase
      .from("user_profiles")
      .select("has_seen_onboarding")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data && data.has_seen_onboarding === false) {
          setShowOnboarding(true);
        }
      })
      .catch(() => {}); // Silently ignore — don't block map on onboarding check failure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, userId]);

  async function handleOnboardingComplete() {
    setShowOnboarding(false);
    if (userId) {
      supabase
        .from("user_profiles")
        .update({ has_seen_onboarding: true })
        .eq("id", userId)
        .then(() => {})
        .catch(() => {});
    }
  }

  // Auto-load shared route passed via sessionStorage (from SharedRouteLanding "View on Map")
  useEffect(() => {
    const pending = sessionStorage.getItem("sst_pending_route");
    if (!pending) return;
    try {
      const route = JSON.parse(pending);
      sessionStorage.removeItem("sst_pending_route");
      const wps = (route.waypoints || []).map(w => ({ ...w, id: w.id || crypto.randomUUID() }));
      if (wps.length) {
        setWaypoints(wps);
        setTripMode(true);
        setLoadedRoute(route);
      }
    } catch (e) {
      console.warn("sst_pending_route parse error:", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WreckReview entity was Base44-only; stubbed out pending Supabase migration
  useEffect(() => { setWreckRemovedKeys(new Set()); }, []);

  const fmtDate = (s) => {
    try {
      const iso = s.includes("T") ? s : s + "T12:00:00Z";
      return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", timeZone: "America/New_York",
      });
    } catch { return s; }
  };

  // ── Composite load: check index for dated snapshots, fall back to latest ──
  useEffect(() => {
    if (activeDataLayer !== "composite" || compositeData) return;
    async function loadComposite() {
      try {
        // Check viirs_index.json for dated composite snapshots
        const idxRes = await fetch(`${VIIRS_CDN_BASE}/viirs_index.json`);
        const idx = idxRes.ok ? await idxRes.json() : {};
        const cDates = [...(idx.composite_dates ?? [])].sort();
        if (cDates.length > 0) {
          setCompositeIndexDates(cDates);
          setCompositeDates(cDates.map(fmtDate));
          const latestDate = cDates[cDates.length - 1];
          setCompositeDateIndex(cDates.length - 1);
          compositeLoadedDateRef.current = latestDate;
          const cRes = await fetch(`${VIIRS_CDN_BASE}/viirs_composite_${latestDate}.json`);
          if (cRes.ok) {
            const d = await cRes.json();
            setCompositeData(d);
            setCompositeGenerated(d.generated ?? latestDate);
            setCompositeDate(latestDate);
            return;
          }
        }
        // Fallback: load viirs_composite.json directly (no date nav)
        const cRes = await fetch(VIIRS_COMPOSITE_URL);
        if (!cRes.ok) throw new Error(`HTTP ${cRes.status}`);
        const d = await cRes.json();
        setCompositeData(d);
        setCompositeGenerated(d.generated ?? null);
        setCompositeDate(d.generated ?? null);
        setCompositeDates([fmtDate(d.generated ?? "—")]);
        setCompositeDateIndex(0);
      } catch(e) { console.warn("[COMPOSITE] load failed:", e); }
    }
    loadComposite();
  }, [activeDataLayer, compositeData]);

  // ── Composite date nav: load dated snapshot when user navigates ───────────
  useEffect(() => {
    if (!compositeIndexDates.length || activeDataLayer !== "composite") return;
    const dateStr = compositeIndexDates[compositeDateIndex];
    if (!dateStr || dateStr === compositeLoadedDateRef.current) return;
    compositeLoadedDateRef.current = dateStr;
    fetch(`${VIIRS_CDN_BASE}/viirs_composite_${dateStr}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        setCompositeData(d);
        setCompositeGenerated(d.generated ?? dateStr);
        setCompositeDate(dateStr);
      })
      .catch(e => console.warn("[COMPOSITE] dated load failed:", dateStr, e));
  }, [compositeDateIndex, compositeIndexDates]);

  const windActive = showWindOverlay || activeDataLayer === "windmap";
  useEffect(() => {
    if (!windActive || windData || windLoading) return;
    setWindLoading(true);
    fetch(WIND_DATA_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        setWindData(d);
        if (d?.hours?.length) {
          const nowISO = new Date().toISOString().slice(0, 13);
          const idx = d.hours.findIndex(h => h.time.startsWith(nowISO));
          setWindHourIndex(idx >= 0 ? idx : 0);
        }
      })
      .catch(e => console.error("[WIND] fetch failed:", e))
      .finally(() => setWindLoading(false));
  }, [windActive]);

  const currentsActive  = showCurrents;
  useEffect(() => {
    if (!currentsActive || currentsData || currentsLoading) return;
    setCurrentsLoading(true);
    fetch(CURRENTS_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setCurrentsData(d))
      .catch(e => console.error("[CURRENTS] fetch failed:", e))
      .finally(() => setCurrentsLoading(false));
  }, [currentsActive]);

  const altimetryActive = activeDataLayer === "altimetry";
  // Fetch on mount — needed for both the altimetry layer AND the altimetry overlay
  // (overlay can be enabled while SST is active, so can't gate on altimetryActive)
  useEffect(() => {
    if (altimetryData || altimetryLoading) return;
    setAltimetryLoading(true);
    fetch(ALTIMETRY_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setAltimetryData(d))
      .catch(e => console.error("[ALTIMETRY] fetch failed:", e))
      .finally(() => setAltimetryLoading(false));
  }, []);


  useEffect(()=>{
    console.log("[FISH] SSTLive effect — showHotspots:", showHotspots, "hasData:", !!hotspotData, "loading:", hotspotLoading);
    if(!showHotspots||hotspotData||hotspotLoading)return;
    setHotspotLoading(true);
    const fmtDate = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    const now = new Date();
    // Workflow runs on UTC time — try UTC today, UTC yesterday, local today, local yesterday
    const candidates = [...new Set([
      fmtDate(now),
      fmtDate(new Date(Date.now()-864e5)),
      `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,
    ])];
    const tryFetch = date => fetch(`${HOTSPOTS_BASE}/fishing_hotspots_${date}.json`).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();});
    const tryAll = dates => dates.reduce((p,d) => p.catch(()=>tryFetch(d)), Promise.reject());
    tryAll(candidates)
      .then(d=>{setHotspotData(d);})
      .catch(e=>console.error("[FISH] fetch failed:",e))
      .finally(()=>setHotspotLoading(false));
  },[showHotspots]);

  function handleNavigationEnded(tripData) {
    setTripSummaryData(tripData);
  }

  function handleStartNavFromMap() {
    if (!navigatingRoute && waypoints.length >= 2) {
      startNavigation({ name: "Current Route", waypoints }, false);
    }
  }

  function handleEndNavFromMap() {
    setTripSummaryData(endNavigation());
  }

  function handleAddWaypoint(lat, lng, label) {
    setWaypoints(prev => [...prev, { id: crypto.randomUUID(), lat, lng, label: label || "" }]);
  }
  function handleMoveWaypoint(id, lat, lng) {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, lat, lng } : w));
  }
  function handleRemoveWaypoint(id) {
    setWaypoints(prev => prev.filter(w => w.id !== id));
  }
  function activateTripMode() {
    if (tripMode) { setTripMode(false); setWaypoints([]); return; }
    const dep = selectedLocation;
    const firstWp = dep
      ? [{ id: crypto.randomUUID(), lat: dep.lat, lng: dep.lon, label: dep.label || "Departure" }]
      : [];
    setWaypoints(firstWp);
    setTripMode(true);
  }
  function handleLoadRoute(route) {
    const wps = (route.waypoints || []).map(w => ({ ...w, id: w.id || crypto.randomUUID() }));
    setWaypoints(wps);
    setLoadedRoute(route);
    setTripMode(true);
  }


  // ── Community data functions ──────────────────────────────────────────────
  async function fetchCommunityLocations() {
    const { data, error } = await supabase
      .from("community_locations")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .eq("is_flagged", false);
    if (!error && data) setCommunityLocations(data);
  }

  async function checkCommunityAccess(uid, proStatus) {
    if (!uid) { setCommunityAccess({ hasAccess: false, neverPosted: true }); return; }

    // Standard: must post within 30 days. Pro: within 90 days.
    // Signup date counts as a virtual first post for both tiers.
    const windowDays = proStatus ? 90 : 30;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

    // 1. Recent post within window?
    const { data: recentPosts } = await supabase
      .from("community_locations")
      .select("created_at")
      .eq("user_id", uid)
      .gt("created_at", cutoff)
      .limit(1);
    if (recentPosts?.length) { setCommunityAccess({ hasAccess: true }); return; }

    // 2. Signup date within window? (grace period — applies to all tiers)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("created_at")
      .eq("id", uid)
      .single();
    if (profile?.created_at && new Date(profile.created_at) >= new Date(cutoff)) {
      setCommunityAccess({ hasAccess: true });
      return;
    }

    // 3. No access — record days since last post for messaging
    const { data: allPosts } = await supabase
      .from("community_locations")
      .select("created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1);
    if (!allPosts?.length) {
      setCommunityAccess({ hasAccess: false, neverPosted: true, windowDays });
    } else {
      const daysSince = Math.floor((Date.now() - new Date(allPosts[0].created_at).getTime()) / (24 * 60 * 60 * 1000));
      setCommunityAccess({ hasAccess: false, neverPosted: false, daysSinceLastPost: daysSince, windowDays });
    }
  }

  useEffect(() => {
    fetchCommunityLocations();
    if (userId !== null) checkCommunityAccess(userId, isPro);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isPro]);

  // Community pins were previously only fetched once per session -- a new
  // live pin from another angler never appeared until the whole app was
  // closed and reopened (no polling, no realtime subscription). Refresh
  // periodically while the tab is actually visible (skip while
  // backgrounded, both to save battery on the water and because a
  // backgrounded tab's timers get throttled/suspended anyway), and
  // immediately on regaining foreground -- the most common real case is
  // "I locked my phone, someone posted, I unlock and want it to show up
  // now" rather than waiting out the interval.
  useEffect(() => {
    const REFRESH_MS = 20000;
    let intervalId = null;
    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (document.visibilityState === "visible") fetchCommunityLocations();
      }, REFRESH_MS);
    }
    function stopPolling() {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        fetchCommunityLocations();
        startPolling();
      } else {
        stopPolling();
      }
    }
    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    // The service worker messages every open tab the instant a push lands
    // (see sw.js) so the map updates right away instead of waiting on the
    // poll interval above -- that's what makes this feel "near real time"
    // while the app is open, the poll is just the fallback/catch-all.
    function handleSwMessage(event) {
      if (event.data?.type === "riploc-refresh-community") fetchCommunityLocations();
    }
    navigator.serviceWorker?.addEventListener?.("message", handleSwMessage);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener?.("message", handleSwMessage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSavedLocations() { const { data, error } = await supabase.from("saved_locations").select("*").order("created_at",{ascending:false}).limit(100); if(!error&&data)setSavedLocations(data); }
  useEffect(()=>{const run=()=>fetchSavedLocations();if(typeof requestIdleCallback==="function"){const h=requestIdleCallback(run,{timeout:2000});return()=>cancelIdleCallback(h);}const t=setTimeout(run,500);return()=>clearTimeout(t);},[]);

  function applyResult(sourceName, result, setState) { setSourceStatus(s=>({...s,[sourceName]:result.status}));if(result.ok){setState({data:result.data,dateIndex:Math.max(0,(result.data.days?.length??1)-1)});}else{setState({data:result.data,dateIndex:0});} }

  async function fetchMUR(){setLoading(true);setError(null);try{const res=await fetchMURSST();const result=normalizeSSTResponse(res,"MUR","sst");applyResult("MUR",result,setMurState);}catch(e){console.error("[SST:MUR] fetch failed:",e);setError(e.message);setSourceStatus(s=>({...s,MUR:"error"}));}setLoading(false);}
  async function fetchVIIRS() {
    setLoading(true); setError(null);
    try {
      const idxRes = await fetch(`${VIIRS_CDN_BASE}/viirs_index.json`);
      if (!idxRes.ok) throw new Error(`VIIRS index HTTP ${idxRes.status}`);
      const idx = await idxRes.json();
      const dates = [...(idx.dates ?? [])].sort();
      if (!dates.length) { setSourceStatus(s=>({...s,VIIRS:"empty"})); setViirsState({data:{days:[]},dateIndex:0,hour:null}); setLoading(false); return; }
      const latestDate = dates[dates.length - 1];
      let latestDay;
      if (_viirsCache.has(latestDate)) { latestDay = _viirsCache.get(latestDate); }
      else { const bRes=await fetch(`${VIIRS_CDN_BASE}/viirs_${latestDate}.json`); if(!bRes.ok)throw new Error(`VIIRS bundle HTTP ${bRes.status}`); latestDay=bundleToDay(await bRes.json()); _viirsCache.set(latestDate,latestDay); }
      const days = dates.map(d => d===latestDate ? latestDay : {date:d,available_hours:[],grid:[],stats:null,hours_cache:null});
      const latestHour = latestDay.available_hours[latestDay.available_hours.length-1] ?? null;
      setSourceStatus(s=>({...s,VIIRS:latestDay.grid.length?"ok":"empty"}));
      setViirsState({data:{days},dateIndex:days.length-1,hour:latestHour});
    } catch(e) { console.error("[SST:VIIRS] fetch failed:",e); setError(e.message); setSourceStatus(s=>({...s,VIIRS:"error"})); }
    setLoading(false);
  }
  async function fetchVIIRSNpp(){setLoading(true);setError(null);try{const res=await fetchVIIRSSST();const result=normalizeSSTResponse(res,"VIIRSSNPP","sst");applyResult("VIIRSSNPP",result,setViirsNppState);}catch(e){console.error("[SST:VIIRSSNPP] fetch failed:",e);setError(e.message);setSourceStatus(s=>({...s,VIIRSSNPP:"error"}));}setLoading(false);}
  async function fetchGOESComp(){setLoading(true);setError(null);try{const res=await fetchGOESComposite();const result=normalizeSSTResponse(res,"GOESCOMP","sst");applyResult("GOESCOMP",result,setGoesCompState);}catch(e){console.error("[SST:GOESCOMP] fetch failed:",e);setError(e.message);setSourceStatus(s=>({...s,GOESCOMP:"error"}));}setLoading(false);}
  useEffect(()=>{if(dataSource==="MUR")fetchMUR();else if(dataSource==="VIIRS")fetchVIIRS();else if(dataSource==="VIIRSSNPP")fetchVIIRSNpp();else if(dataSource==="GOESCOMP")fetchGOESComposite();},[dataSource]);
  // Persist chosen SST source across sessions
  useEffect(()=>{ localStorage.setItem("sst_source", dataSource); },[dataSource]);
  useEffect(()=>{ localStorage.setItem("sst_active_layer", activeDataLayer); },[activeDataLayer]);
  useEffect(()=>{ if(activeDataLayer==="sst"||activeDataLayer==="composite"){ localStorage.setItem("sst_sub_layer",activeDataLayer); } },[activeDataLayer]);

  useEffect(() => {
    if (dataSource !== "VIIRS" || !viirsData?.days?.length) return;
    const day = viirsData.days[viirsDateIndex];
    if (!day || day.hours_cache !== null) return;
    const dateStr = day.date;
    (async () => {
      let dayObj;
      if (_viirsCache.has(dateStr)) { dayObj = _viirsCache.get(dateStr); }
      else { try { const r=await fetch(`${VIIRS_CDN_BASE}/viirs_${dateStr}.json`); if(!r.ok){console.warn("[SST:VIIRS] No bundle for",dateStr);return;} dayObj=bundleToDay(await r.json()); _viirsCache.set(dateStr,dayObj); } catch(e){console.error("[SST:VIIRS] lazy-load failed:",dateStr,e);return;} }
      const lastHour = dayObj.available_hours[dayObj.available_hours.length-1] ?? null;
      setViirsState(s => !s.data ? s : {...s,hour:lastHour,data:{...s.data,days:s.data.days.map(d=>d.date===dateStr?dayObj:d)}});
    })();
  }, [viirsDateIndex, viirsData, dataSource]);

  // CHL daily (bundle format with legacy fallback)
  useEffect(()=>{
    if(activeDataLayer!=="chlorophyll"||chlSource!=="daily"||chlData)return;
    setChlLoading(true);
    fetchCHLBundle().then(res=>{
      if(res.composite_dates?.length) setChlCompositeDates(res.composite_dates);
      const result=normalizeSSTResponse(res,"CHL","chlorophyll");
      if(result.ok){setChlData(result.data);setChlDateIndex(Math.max(0,(result.data.days?.length??1)-1));}
      else{setChlData(result.data);}
      setChlLoading(false);
    }).catch(e=>{console.error("[SST:CHL] fetch failed:",e);setChlLoading(false);});
  },[activeDataLayer,chlSource]);
  // CHL composite — re-fetches when chlCompositeDateIndex changes
  useEffect(()=>{
    if(activeDataLayer!=="chlorophyll"||chlSource!=="composite")return;
    const dateStr = chlCompositeDates.length ? chlCompositeDates[chlCompositeDateIndex] : undefined;
    setChlCompositeLoading(true);
    setChlCompositeData(null);
    fetchCHLComposite(dateStr).then(res=>{setChlCompositeData(res);setChlCompositeLoading(false);})
      .catch(e=>{console.error("[SST:CHL COMP] fetch failed:",e);setChlCompositeLoading(false);});
  },[activeDataLayer,chlSource,chlCompositeDateIndex,chlCompositeDates]);
  // SeaColor daily (bundle format with legacy fallback)
  useEffect(()=>{
    if(activeDataLayer!=="seacolor"||seaColorSource!=="daily"||seaColorData)return;
    setSeaColorLoading(true);
    fetchSeaColorBundle().then(res=>{
      if(res.composite_dates?.length) setSeaColorCompositeDates(res.composite_dates);
      const result=normalizeSSTResponse(res,"SEACOLOR","kd490");
      if(result.ok){setSeaColorData(result.data);if(result.data?.days?.length)setSeaColorDateIndex(result.data.days.length-1);}
      else{setSeaColorData(result.data);}
      setSeaColorLoading(false);
    }).catch(e=>{console.error("[SST:SEACOLOR] fetch failed:",e);setSeaColorLoading(false);});
  },[activeDataLayer,seaColorSource]);
  // SeaColor composite — re-fetches when seaColorCompositeDateIndex changes
  useEffect(()=>{
    if(activeDataLayer!=="seacolor"||seaColorSource!=="composite")return;
    const dateStr = seaColorCompositeDates.length ? seaColorCompositeDates[seaColorCompositeDateIndex] : undefined;
    setSeaColorCompositeLoading(true);
    setSeaColorCompositeData(null);
    fetchSeaColorComposite(dateStr).then(res=>{setSeaColorCompositeData(res);setSeaColorCompositeLoading(false);})
      .catch(e=>{console.error("[SST:SC COMP] fetch failed:",e);setSeaColorCompositeLoading(false);});
  },[activeDataLayer,seaColorSource,seaColorCompositeDateIndex,seaColorCompositeDates]);

  // When composite source is selected, swap in composite data transparently
  const activeChlData        = chlSource === "composite" ? chlCompositeData : chlData;
  const activeChlLoading     = chlSource === "composite" ? chlCompositeLoading : chlLoading;
  const activeSeaColorData   = seaColorSource === "composite" ? seaColorCompositeData : seaColorData;
  const activeSeaColorLoading= seaColorSource === "composite" ? seaColorCompositeLoading : seaColorLoading;
  const activeViirsDay    = viirsData?.days?.[viirsDateIndex] ?? null;
  const activeViirsGrid   = viirsHour&&activeViirsDay?.hours_cache?.[viirsHour] ? activeViirsDay.hours_cache[viirsHour].grid : activeViirsDay?.grid ?? null;
  const activeViirsStats  = viirsHour&&activeViirsDay?.hours_cache?.[viirsHour] ? activeViirsDay.hours_cache[viirsHour].stats : activeViirsDay?.stats ?? null;
  const activeMurDay      = murData?.days?.[murDateIndex] ?? null;
  const activeViirsNppDay = viirsNppData?.days?.[viirsNppDateIndex] ?? null;
  const activeGoesCompDay = goesCompData?.days?.[goesCompDateIndex] ?? null;

  const activeGrid  = dataSource==="VIIRS"?activeViirsGrid:dataSource==="VIIRSSNPP"?activeViirsNppDay?.grid??null:dataSource==="GOESCOMP"?activeGoesCompDay?.grid??null:activeMurDay?.grid??null;
  const activeStats = dataSource==="VIIRS"?activeViirsStats:dataSource==="VIIRSSNPP"?activeViirsNppDay?.stats??null:dataSource==="GOESCOMP"?activeGoesCompDay?.stats??null:activeMurDay?.stats??null;
  const selectedDate= dataSource==="VIIRS"?activeViirsDay?.date??null:dataSource==="VIIRSSNPP"?activeViirsNppDay?.date??null:dataSource==="GOESCOMP"?activeGoesCompDay?.date??null:activeMurDay?.date??null;

  const {sstMin, sstMax} = useMemo(() => {
    if ((dataSource==="VIIRS"||dataSource==="VIIRSSNPP")&&activeGrid?.length) {
      const vals=activeGrid.map(d=>d.sst).filter(v=>v!=null).sort((a,b)=>a-b);
      if(vals.length<10)return{sstMin:activeStats?.min??32,sstMax:activeStats?.max??85};
      return{sstMin:vals[Math.floor(vals.length*0.02)],sstMax:vals[Math.floor(vals.length*0.98)]};
    }
    return{sstMin:activeStats?.min??32,sstMax:activeStats?.max??85};
  }, [activeGrid, activeStats, dataSource]);

  const heatmapData = useMemo(() => {
    if (!activeGrid?.length) return { latSet: [], lonSet: [], grid: {} };
    const grid={}; activeGrid.forEach(d=>{ grid[`${d.lat}_${d.lon}`]=d.sst; });
    // For VIIRS hourly, pass the full canonical 266x335 grid so gapFillGrid works correctly.
    // Sparse latSet/lonSet (only observed cells) cause gapFillGrid to BFS-flood the entire
    // Cartesian product, producing solid-rectangle rendering artifacts.
    if (dataSource === "VIIRS") {
      const vDay = viirsData?.days?.[viirsDateIndex];
      if (vDay?.canonicalLatSet?.length) {
        return { latSet: vDay.canonicalLatSet, lonSet: vDay.canonicalLonSet, grid };
      }
    }
    const latSet=[...new Set(activeGrid.map(d=>d.lat))].sort((a,b)=>b-a);
    const lonSet=[...new Set(activeGrid.map(d=>d.lon))].sort((a,b)=>a-b);
    return { latSet, lonSet, grid };
  }, [activeGrid, dataSource, viirsData, viirsDateIndex]);

  const gridHealth = useMemo(() => {
    if (!activeGrid?.length) return null;
    const N=activeGrid.length, ratio=(heatmapData.latSet.length*heatmapData.lonSet.length)/N;
    if(ratio>10)return{scattered:true,N,lats:heatmapData.latSet.length,lons:heatmapData.lonSet.length};
    return null;
  }, [activeGrid, heatmapData]);

  const isWindMap = activeDataLayer === "windmap";
  const currentSourceStatus = sourceStatus[dataSource];

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-2 sm:p-3 gap-2">
      {error&&<div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-600">Error: {error}</div>}
      {gridHealth?.scattered && dataSource !== "VIIRS" &&<div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800">Backend returning scattered points. See console.</div>}

      {(() => {
        const hasAnyData = !!(murData?.days?.length || viirsData?.days?.length || viirsNppData?.days?.length || goesCompData?.days?.length || compositeData || activeChlData?.days?.length || activeSeaColorData?.days?.length);
        if (loading && !hasAnyData) return (
          <div className="flex-1 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin"/><p className="text-sm text-slate-500 font-medium">Loading SST data...</p></div></div>
        );
        const currentLayerHasData = !!(activeGrid?.length) || (activeDataLayer==="composite"&&!!compositeData) || (activeDataLayer==="chlorophyll"&&!!activeChlData?.days?.length) || (activeDataLayer==="seacolor"&&!!activeSeaColorData?.days?.length) || activeDataLayer==="altimetry" || activeDataLayer==="windmap";
        const isStillLoading = loading || chlLoading || seaColorLoading || (activeDataLayer === "composite" && !compositeData);
        if (!currentLayerHasData && !isStillLoading) return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400 text-sm max-w-md px-4">
              <div className="text-2xl mb-2">🌊</div>
              {currentSourceStatus==="empty"?(
                <><div className="text-slate-600 font-medium mb-1">{sourceLabel(dataSource)} returned no data</div><div className="text-xs text-slate-400">The backend function ran successfully but produced no data points. Try a different SST source above.</div></>
              ):currentSourceStatus==="malformed"?(
                <><div className="text-slate-600 font-medium mb-1">{sourceLabel(dataSource)} response not recognized</div><div className="text-xs text-slate-400">Check the Base44 function output. See browser console for response details.</div></>
              ):(
                <><div>No data available for this source yet.</div><div className="text-xs mt-1 text-slate-300">Try switching to a different SST source.</div></>
              )}
            </div>
          </div>
        );
        return (
        <>
          <div className="flex-1 overflow-hidden relative">
            {loading && hasAnyData && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 pointer-events-none" style={{zIndex:600}}>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                Switching source…
              </div>
            )}
            <SSTErrorBoundary>
            <SSTHeatmapLeaflet
              data={heatmapData} sstMin={sstMin} sstMax={sstMax}
              date={selectedDate} dataSource={dataSource} setDataSource={setDataSource}
              onLocationSaved={fetchSavedLocations} clearMarkersRef={clearMarkersRef} flyToRef={flyToRef}
              onHoverSst={setLegendHoverSst}
              activeDataLayer={activeDataLayer} setActiveDataLayer={setActiveDataLayer}
              chlData={activeChlData} chlDateIndex={chlDateIndex} setChlDateIndex={setChlDateIndex} chlLoading={activeChlLoading}
              chlSource={chlSource} setChlSource={setChlSource}
              chlCompositeDates={chlCompositeDates} chlCompositeDateIndex={chlCompositeDateIndex} setChlCompositeDateIndex={setChlCompositeDateIndex}
              seaColorData={activeSeaColorData} seaColorDateIndex={seaColorDateIndex} setSeaColorDateIndex={setSeaColorDateIndex} seaColorLoading={activeSeaColorLoading}
              seaColorSource={seaColorSource} setSeaColorSource={setSeaColorSource}
              seaColorCompositeDates={seaColorCompositeDates} seaColorCompositeDateIndex={seaColorCompositeDateIndex} setSeaColorCompositeDateIndex={setSeaColorCompositeDateIndex}
              viirsData={viirsData} viirsDateIndex={viirsDateIndex} setViirsDateIndex={setViirsDateIndex} viirsHour={viirsHour} setViirsHour={setViirsHour}
              viirsNppData={viirsNppData} viirsNppDateIndex={viirsNppDateIndex} setViirsNppDateIndex={setViirsNppDateIndex} activeViirsNppDay={activeViirsNppDay}
              murData={murData} murDateIndex={murDateIndex} setMurDateIndex={setMurDateIndex}
              goesCompData={goesCompData} goesCompDateIndex={goesCompDateIndex} setGoesCompDateIndex={setGoesCompDateIndex} activeGoesCompDay={activeGoesCompDay}
              highlightedLocation={highlightedLocation} setHighlightedLocation={setHighlightedLocation}
              savedLocations={savedLocations} fetchSavedLocations={fetchSavedLocations}
              regionConfig={regionConfig} selectedLocation={selectedLocation}
              windData={windData} windLoading={windLoading}
              windHourIndex={windHourIndex} setWindHourIndex={setWindHourIndex}
              showWindOverlay={showWindOverlay} setShowWindOverlay={setShowWindOverlay}
              windPlaying={windPlaying} setWindPlaying={setWindPlaying}
              currentsData={currentsData} currentsLoading={currentsLoading}
              showCurrents={showCurrents} setShowCurrents={setShowCurrents}
              altimetryData={altimetryData} onSlaRange={setSlaRange}
              sstRange={sstRange} onSstRangeChange={setSstRange} userId={userId}
              wreckRemovedKeys={wreckRemovedKeys}
              hotspotData={hotspotData} hotspotLoading={hotspotLoading}
              selectedFishSpecies={selectedFishSpecies} setSelectedFishSpecies={setSelectedFishSpecies}
              showHotspots={showHotspots} setShowHotspots={setShowHotspots}
              compositeData={compositeData}
              compositeGenerated={compositeGenerated}
              compositeDateIndex={compositeDateIndex}
              setCompositeDateIndex={setCompositeDateIndex}
              compositeDates={compositeDates}
              onShare={setShareLocation}
              legendHoverSst={legendHoverSst} isWindMap={isWindMap}
              openControlPanelRef={openControlPanelRef}
              rangeControlOpenRef={rangeControlOpenRef}
              BATHY_CONTOURS_URL={BATHY_CONTOURS_URL}
              WRECKS_URL={WRECKS_URL}
              isPro={isPro}
              onNotesUpdated={(id, newNotes) => {
                setSavedLocations(prev => prev.map(l => l.id === id ? { ...l, notes: newNotes } : l));
              }}
              tripMode={tripMode}
              waypoints={waypoints}
              onAddWaypoint={handleAddWaypoint}
              onMoveWaypoint={handleMoveWaypoint}
              onRemoveWaypoint={handleRemoveWaypoint}
              onToggleTripMode={activateTripMode}
              onEndTripAtDeparture={() => setEndTripPrompt(true)}
              onLoadRoute={handleLoadRoute}
              gpsActive={gpsActive}
              onToggleGps={toggleGps}
              boatPosition={boatPosition}
              boatTrack={boatTrack}
              communityLocations={communityLocations}
              showCommunityLayer={showCommunityLayer}
              setShowCommunityLayer={setShowCommunityLayer}
              communityAccess={communityAccess}
              communityCount={communityLocations.length}
              onOpenLeaderboard={() => setShowLeaderboard(true)}
              onPostCommunityReport={(info) => {
                if (info?.lat != null && info?.lon != null) {
                  setCommunityFormData({
                    lat: info.lat,
                    lon: info.lon,
                    waterTemp: info.sst ?? null,
                    initialType: info.initialType ?? "report",
                  });
                } else {
                  setCommunityPinDrop(info?.type ?? "report");
                }
              }}
              communityPinDrop={communityPinDrop}
              onCommunityPinDropped={(lat, lon, dropType) => {
                setCommunityPinDrop(null);
                setCommunityFormData({ lat, lon, waterTemp: null, initialType: dropType ?? "report" });
              }}
              onCancelPinDrop={() => setCommunityPinDrop(null)}
              onCommunityPosted={() => {
                fetchCommunityLocations();
                if (userId !== null) checkCommunityAccess(userId, isPro);
                setShowCommunityLayer(true);
              }}
              onStartNavFromMap={handleStartNavFromMap}
              onEndNavFromMap={handleEndNavFromMap}
            />
            </SSTErrorBoundary>
          </div>
          {tripMode && (
            <TripPlanner
              waypoints={waypoints}
              setWaypoints={setWaypoints}
              userId={userId}
              isPro={isPro}
              loadedRoute={loadedRoute}
              onClose={() => { setTripMode(false); setWaypoints([]); setLoadedRoute(null); }}
              heatmapData={heatmapData}
              sstMin={sstMin}
              sstMax={sstMax}
              sstRange={sstRange}
              onNavigationEnded={handleNavigationEnded}
            />
          )}

          {endTripPrompt && (
            <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-2xl shadow-2xl px-6 py-5 max-w-xs w-full mx-4 text-center">
                <p className="text-sm font-semibold text-slate-800 mb-1">Return to departure?</p>
                <p className="text-xs text-slate-500 mb-4">
                  Add {waypoints[0]?.label || "departure"} as your final waypoint and close the route.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const dep = waypoints[0];
                      if (dep) setWaypoints(prev => [...prev, { id: crypto.randomUUID(), lat: dep.lat, lng: dep.lng, label: dep.label }]);
                      setEndTripPrompt(false);
                    }}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
                  >Yes, close route</button>
                  <button
                    onClick={() => setEndTripPrompt(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold py-2 rounded-xl transition-colors"
                  >Cancel</button>
                </div>
              </div>
            </div>
          )}

          {tripSummaryData && (
            <TripSummaryModal
              tripData={tripSummaryData}
              onClose={() => setTripSummaryData(null)}
            />
          )}

          {shareLocation && (
            <ShareLocationDialog key={shareLocation?.id ?? shareLocation?.lat}
              location={shareLocation} userId={userId} onClose={() => setShareLocation(null)}
              onNotesUpdated={(id, newNotes) => { setSavedLocations(prev => prev.map(l => l.id === id ? { ...l, notes: newNotes } : l)); }}
              heatmapData={heatmapData} sstMin={sstMin} sstMax={sstMax} sstRange={sstRange}
            />
          )}

          {communityFormData && (
            <CommunityReportForm
              userId={userId}
              initialType={communityFormData.initialType}
              lat={communityFormData.lat}
              lon={communityFormData.lon}
              waterTemp={communityFormData.waterTemp}
              onClose={() => setCommunityFormData(null)}
              onPosted={() => {
                setCommunityFormData(null);
                fetchCommunityLocations();
                checkCommunityAccess(userId, isPro);
              }}
            />
          )}

          {showLeaderboard && <LeaderboardModal onClose={() => setShowLeaderboard(false)} />}
          {showOnboarding && <OnboardingCarousel onComplete={handleOnboardingComplete} />}

          <div className="hidden sm:block flex-shrink-0" style={{ overflow: "visible" }}>
            {isWindMap
              ? null
              : activeDataLayer === "chlorophyll"
              ? <GradientLegend gradient={CHL_GRADIENT} label="Chlorophyll" unit=" µg/L" logScale
                  dataMin={activeChlData?.days?.[chlDateIndex]?.stats?.min ?? 0.01}
                  dataMax={activeChlData?.days?.[chlDateIndex]?.stats?.max ?? 10}
                  rangeMin={sstRange?.min} rangeMax={sstRange?.max}
                  hoverVal={legendHoverSst}
                  onClick={() => rangeControlOpenRef.current?.()}/>
              : activeDataLayer === "seacolor"
              ? <GradientLegend gradient={KD_GRADIENT} label="Kd490" unit=" m⁻¹"
                  dataMin={activeSeaColorData?.days?.[seaColorDateIndex]?.stats?.min ?? 0.01}
                  dataMax={activeSeaColorData?.days?.[seaColorDateIndex]?.stats?.max ?? 0.50}
                  rangeMin={sstRange?.min} rangeMax={sstRange?.max}
                  hoverVal={legendHoverSst}
                  onClick={() => rangeControlOpenRef.current?.()}/>
              : activeDataLayer === "altimetry"
              ? <GradientLegend gradient={SLA_GRADIENT} label="Sea level" unit=" m"
                  dataMin={slaRange.min} dataMax={slaRange.max}
                  hoverVal={legendHoverSst}/>
              : <SSTLegend sstMin={sstMin} sstMax={sstMax} hoverSst={legendHoverSst} rangeMin={sstRange?.min} rangeMax={sstRange?.max} onClick={() => rangeControlOpenRef.current?.()}/>
            }
          </div>
        </>
        );
      })()}
    </div>
  );
}


// ── Error boundary — recovers from render crashes in the map component ────────
class SSTErrorBoundary extends Component {
  state = { hasError: false, errorMsg: "" };
  static getDerivedStateFromError(err) { return { hasError: true, errorMsg: err?.message || String(err) }; }
  componentDidCatch(err, info) { console.error("[SSTHeatmap] render error:", err, info?.componentStack); }
  render() {
    if (this.state.hasError) return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3 p-4">
        <div className="text-slate-500 text-sm">Something went wrong loading the map.</div>
        {this.state.errorMsg && (
          <div className="text-red-500 text-xs font-mono bg-red-50 border border-red-200 rounded px-3 py-2 max-w-xs break-all">
            {this.state.errorMsg}
          </div>
        )}
        <button onClick={() => this.setState({ hasError: false, errorMsg: "" })}
          className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-semibold">
          Try again
        </button>
      </div>
    );
    return this.props.children;
  }
}

// SSTLiveGate — mounts only after auth confirmed; blocks expired trial users
function SSTLiveGate() {
  const { isExpired, loading: accessLoading } = useRegionAccess();

  if (accessLoading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", background:"#0f172a" }}>
      <div style={{ width:36, height:36, borderRadius:"50%",
        border:"3px solid #1e3a5f", borderTopColor:"#0e7490",
        animation:"spin 0.7s linear infinite" }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (isExpired) return <TrialExpiredWall />;

  return (
    <AppShell region="mid_atlantic" onUpgrade={() => window.location.href = "/upgrade"}>
      <SSTPageBody />
    </AppShell>
  );
}

export default function SSTLive() {
  // null = loading (show nothing), false = signed out, true = authenticated
  const [authed, setAuthed] = useState(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        const user = data?.user;
        const ok = !error && !!user?.email;
        console.log("[SST:AUTH] getUser →", { email: user?.email ?? null, error: error?.message ?? null, ok });
        if (ok) setAuthed(true);
      })
      .catch(err => {
        console.log("[SST:AUTH] getUser threw →", err?.message);
      });

    let sub;
    try {
      const result = supabase.auth.onAuthStateChange((event, s) => {
        if (cancelled) return;
        const ok = !!s?.user?.email;
        console.log("[SST:AUTH] onAuthStateChange →", event, s?.user?.email ?? null, "ok:", ok);
        // Only downgrade on explicit sign-out — don't flash login on INITIAL_SESSION / TOKEN_REFRESHED
        if (event === "SIGNED_OUT" || event === "TOKEN_REMOVED") {
          setAuthed(false);
        } else if (ok) {
          setAuthed(true);
        }
      });
      sub = result?.data?.subscription ?? result;
    } catch (e) {
      console.log("[SST:AUTH] onAuthStateChange setup error:", e?.message);
    }

    return () => {
      cancelled = true;
      try { sub?.unsubscribe?.(); } catch (_) {}
    };
  }, []);

  if (authed === null) return null; // loading — show nothing until auth resolves
  if (!authed) return <InlineLogin />;

  return <SSTLiveGate />;
}