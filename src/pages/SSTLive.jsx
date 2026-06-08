import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchMURSST, fetchVIIRSSST, fetchGOESComposite, fetchChlorophyll, fetchSeaColor } from "@/lib/dataFetchers";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/shell/AppShell";
import { useAppContext } from "@/context/AppContext";
import SSTHeatmapLeaflet from "@/components/SSTHeatmapLeaflet";
import SSTLegend from "@/components/SSTLegend";
import ShareLocationDialog from "@/components/ShareLocationDialog";
import { WindLegend } from "@/components/WindTimeSlider";
import { useRegionAccess } from "@/hooks/useRegionAccess";
import TripPlanner from "@/components/TripPlanner";

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
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>OceanCast SST</div>
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
  const { regionConfig, selectedLocation } = useAppContext();
  const { isPro } = useRegionAccess();

  // ── Auth gate (belt-and-suspenders) ────────────────────────────────────────
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        const ok = !error && !!data?.user?.email;
        console.log("[SST:AUTH] getUser →", { email: data?.user?.email ?? null, error: error?.message ?? null, ok });
        if (ok) setAuthed(true);
      })
      .catch(err => { console.log("[SST:AUTH] threw →", err?.message); });
    let sub;
    try {
      const r = supabase.auth.onAuthStateChange((event, s) => {
        if (cancelled) return;
        const ok = !!s?.user?.email;
        console.log("[SST:AUTH] change →", event, s?.user?.email ?? null, ok);
        setAuthed(ok);
      });
      sub = r?.data?.subscription ?? r;
    } catch (_) {}
    return () => { cancelled = true; try { sub?.unsubscribe?.(); } catch (_) {} };
  }, []);
  // ───────────────────────────────────────────────────────────────────────────

  const [userId, setUserId] = useState(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data?.user) setUserId(data.user.id); }); }, []);

  const [sstRange, setSstRange] = useState({ min: 55, max: 78, maskOutside: false });

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
  const [dataSource,     setDataSource]     = useState("MUR");
  const [activeDataLayer,setActiveDataLayer]= useState("sst");
  const [chlData,        setChlData]        = useState(null);
  const [chlLoading,     setChlLoading]     = useState(false);
  const [chlDateIndex,   setChlDateIndex]   = useState(0);
  const [seaColorData,   setSeaColorData]   = useState(null);
  const [seaColorLoading,setSeaColorLoading]= useState(false);
  const [seaColorDateIndex,setSeaColorDateIndex] = useState(0);
  const [highlightedLocation,setHighlightedLocation] = useState(null);
  const [compositeData,      setCompositeData]      = useState(null);
  const [compositeGenerated, setCompositeGenerated] = useState(null);
  const [compositeDate,      setCompositeDate]      = useState(null);
  const [compositeDateIndex, setCompositeDateIndex] = useState(0);
  const [compositeDates,     setCompositeDates]     = useState([]);
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
  // GPS / Real-Time tracking
  const [gpsActive,      setGpsActive]      = useState(false);
  const [boatPosition,   setBoatPosition]   = useState(null);
  const [boatTrack,      setBoatTrack]      = useState([]);
  const gpsWatchRef = useRef(null);

  // WreckReview entity was Base44-only; stubbed out pending Supabase migration
  useEffect(() => { setWreckRemovedKeys(new Set()); }, []);

  useEffect(() => {
    if (activeDataLayer !== "composite" || compositeData) return;
    // There is only one composite file — always fetch the latest
    fetch(`${VIIRS_COMPOSITE_URL}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        setCompositeData(d);
        setCompositeGenerated(d.generated ?? null);
        setCompositeDate(d.date ?? null);
        // Use the contributing pass dates for the nav display
        const dates = d.pass_dates ?? [];
        if (dates.length) {
          setCompositeDates(dates);
          setCompositeDateIndex(dates.length - 1);
        }
      })
      .catch(e => console.warn("[COMPOSITE] fetch failed:", e));
  }, [activeDataLayer, compositeData]);

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
  useEffect(() => {
    if (!altimetryActive || altimetryData || altimetryLoading) return;
    setAltimetryLoading(true);
    fetch(ALTIMETRY_URL)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => setAltimetryData(d))
      .catch(e => console.error("[ALTIMETRY] fetch failed:", e))
      .finally(() => setAltimetryLoading(false));
  }, [altimetryActive]);


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
  function toggleGps() {
    if (gpsActive) {
      if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
      setGpsActive(false);
      setBoatPosition(null);
      setBoatTrack([]);
    } else {
      if (!navigator.geolocation) { alert("GPS not available on this device"); return; }
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        pos => {
          const { latitude, longitude, heading, speed, accuracy } = pos.coords;
          const speedKts = speed != null ? +(speed * 1.94384).toFixed(1) : null;
          setBoatPosition({ lat: latitude, lon: longitude, heading, speedKts, accuracy });
          setBoatTrack(prev => [...prev.slice(-500), [latitude, longitude]]);
        },
        err => console.warn("GPS error:", err.message),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
      );
      setGpsActive(true);
    }
  }

  function handleLoadRoute(route) {
    const wps = (route.waypoints || []).map(w => ({ ...w, id: w.id || crypto.randomUUID() }));
    setWaypoints(wps);
    setLoadedRoute(route);
    setTripMode(true);
  }

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

  useEffect(()=>{if(activeDataLayer!=="chlorophyll"||chlData)return;setChlLoading(true);fetchChlorophyll().then(res=>{const result=normalizeSSTResponse(res,"CHL","chlorophyll");if(result.ok){setChlData(result.data);setChlDateIndex(Math.max(0,(result.data.days?.length??1)-1));}else{setChlData(result.data);}setChlLoading(false);}).catch(e=>{console.error("[SST:CHL] fetch failed:",e);setChlLoading(false);});},[activeDataLayer]);
  useEffect(()=>{if(activeDataLayer!=="seacolor"||seaColorData)return;setSeaColorLoading(true);fetchSeaColor().then(res=>{const result=normalizeSSTResponse(res,"SEACOLOR","kd490");if(result.ok){setSeaColorData(result.data);if(result.data?.days?.length)setSeaColorDateIndex(result.data.days.length-1);}else{setSeaColorData(result.data);}setSeaColorLoading(false);}).catch(e=>{console.error("[SST:SEACOLOR] fetch failed:",e);setSeaColorLoading(false);});},[activeDataLayer]);

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
    const latSet=[...new Set(activeGrid.map(d=>d.lat))].sort((a,b)=>b-a);
    const lonSet=[...new Set(activeGrid.map(d=>d.lon))].sort((a,b)=>a-b);
    const grid={}; activeGrid.forEach(d=>{ grid[`${d.lat}_${d.lon}`]=d.sst; });
    return { latSet, lonSet, grid };
  }, [activeGrid]);

  const gridHealth = useMemo(() => {
    if (!activeGrid?.length) return null;
    const N=activeGrid.length, ratio=(heatmapData.latSet.length*heatmapData.lonSet.length)/N;
    if(ratio>10)return{scattered:true,N,lats:heatmapData.latSet.length,lons:heatmapData.lonSet.length};
    return null;
  }, [activeGrid, heatmapData]);

  const isWindMap = activeDataLayer === "windmap";
  const currentSourceStatus = sourceStatus[dataSource];

  if (!authed) return <InlineLogin />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-2 sm:p-3 gap-2">
      {error&&<div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-600">Error: {error}</div>}
      {gridHealth?.scattered && dataSource !== "VIIRS" &&<div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800">Backend returning scattered points. See console.</div>}

      {loading?(
        <div className="flex-1 flex items-center justify-center"><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin"/><p className="text-sm text-slate-500 font-medium">Loading SST data...</p></div></div>
      ):!activeGrid?.length?(
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
      ):(
        <>
          <div className="flex-1 overflow-hidden relative">
            <SSTHeatmapLeaflet
              data={heatmapData} sstMin={sstMin} sstMax={sstMax}
              date={selectedDate} dataSource={dataSource} setDataSource={setDataSource}
              onLocationSaved={fetchSavedLocations} clearMarkersRef={clearMarkersRef} flyToRef={flyToRef}
              onHoverSst={setLegendHoverSst}
              activeDataLayer={activeDataLayer} setActiveDataLayer={setActiveDataLayer}
              chlData={chlData} chlDateIndex={chlDateIndex} setChlDateIndex={setChlDateIndex} chlLoading={chlLoading}
              seaColorData={seaColorData} seaColorDateIndex={seaColorDateIndex} setSeaColorDateIndex={setSeaColorDateIndex} seaColorLoading={seaColorLoading}
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
            />
          </div>
          {tripMode && (
            <TripPlanner
              waypoints={waypoints}
              setWaypoints={setWaypoints}
              userId={userId}
              isPro={isPro}
              loadedRoute={loadedRoute}
              onClose={() => { setTripMode(false); setWaypoints([]); setLoadedRoute(null); }}
            />
          )}

          {endTripPrompt && (
            <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-2xl shadow-2xl px-6 py-5 max-w-xs w-full mx-4 text-center">
                <div className="text-2xl mb-2">⚓</div>
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

          {shareLocation && (
            <ShareLocationDialog
              location={shareLocation} userId={userId} onClose={() => setShareLocation(null)}
              onNotesUpdated={(id, newNotes) => { setSavedLocations(prev => prev.map(l => l.id === id ? { ...l, notes: newNotes } : l)); }}
              heatmapData={heatmapData} sstMin={sstMin} sstMax={sstMax} sstRange={sstRange}
            />
          )}
          <div className="hidden sm:block flex-shrink-0" style={{ overflow: "visible" }}>
            {isWindMap
              ? null
              : activeDataLayer === "chlorophyll"
              ? <GradientLegend gradient={CHL_GRADIENT} label="Chlorophyll" unit=" µg/L" logScale
                  dataMin={chlData?.days?.[chlDateIndex]?.stats?.min ?? 0.01}
                  dataMax={chlData?.days?.[chlDateIndex]?.stats?.max ?? 10}
                  rangeMin={sstRange?.min} rangeMax={sstRange?.max}
                  hoverVal={legendHoverSst}
                  onClick={() => rangeControlOpenRef.current?.()}/>
              : activeDataLayer === "seacolor"
              ? <GradientLegend gradient={KD_GRADIENT} label="Kd490" unit=" m⁻¹"
                  dataMin={seaColorData?.days?.[seaColorDateIndex]?.stats?.min ?? 0.01}
                  dataMax={seaColorData?.days?.[seaColorDateIndex]?.stats?.max ?? 0.50}
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
      )}
    </div>
  );
}

export default function SSTLive() {
  // Start false — show login immediately; flip to true only after confirmed auth
  const [authed, setAuthed] = useState(false);

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
        setAuthed(ok);
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

  if (!authed) return <InlineLogin />;

  return (
    <AppShell region="mid_atlantic" onUpgrade={() => alert("Upgrade