import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { Crosshair, Move, Wind } from "lucide-react";
import MapClickInfo from "@/components/MapClickInfo";
import MapControlPanel from "@/components/MapControlPanel";
import SavedLocations from "@/components/SavedLocations";
import ShareRouteDialogModal from "@/components/ShareRouteDialog";

// ── SavedPanel: tabbed Locations + Routes panel ───────────────────────────────
function SavedPanel({
  savedLocations, fetchSavedLocations, clearMarkersRef, flyToRef,
  highlightedLocation, setHighlightedLocation, onShare, isPro, userId,
  onClose, sliderHeight, mobile, onMobileSelect, className, onLoadRoute, onRoutesCountChange,
  tripMode, onAddWaypoint,
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
    ? { bottom: 0, zIndex: 2000, maxHeight: "50vh" }
    : { bottom: (sliderHeight || 0) + 48, width: 240, maxHeight: "55%", zIndex: 900 };

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
            Locations ({savedLocations?.length ?? 0})
          </button>
          <button
            onClick={() => switchTab("routes")}
            className={`text-xs font-semibold pb-1.5 border-b-2 transition-colors ${tab === "routes" ? "border-cyan-500 text-slate-800" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            Routes{routes !== null ? ` (${routes.length})` : ""}
          </button>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 pb-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 3.5l-7 7M3.5 3.5l7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
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
            highlightedId={highlightedLocation?.id} onShare={onShare} isPro={isPro}
          />
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
                  {isPro && (
                    <button
                      onClick={e => { e.stopPropagation(); setSharingRoute(r); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-cyan-500 transition-all flex-shrink-0"
                      title="Share route"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </button>
                  )}
                  <button
                    onClick={e => deleteRoute(r.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 transition-all flex-shrink-0"
                    title="Delete route"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
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
import WindTimeSlider, { WindLegend } from "@/components/WindTimeSlider";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
              Upgrade to Pro — $69/yr
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
  [0.0,  [  0,  20, 160]], // strong negative — deep blue
  [0.25, [ 40, 100, 230]], // moderate negative
  [0.43, [140, 190, 255]], // slight negative — light blue
  [0.5,  [248, 248, 248]], // zero anomaly — near-white
  [0.57, [255, 190, 140]], // slight positive — light orange
  [0.75, [255,  80,  30]], // moderate positive — orange-red
  [1.0,  [160,   0,   0]], // strong positive — deep red
];
function slaColor(val, valMin, valMax) {
  // val in meters; range is auto-scaled from data percentiles via valMin/valMax
  if (val == null || !Number.isFinite(val)) return null;
  const lo = valMin ?? -0.4, hi = valMax ?? 0.4;
  const t = hi > lo ? Math.max(0, Math.min(1, (val - lo) / (hi - lo))) : 0.5;
  return interpColor(t, SLA_STOPS);
}

export const FISH_SPECIES=[{key:"yellowfin",label:"Yellowfin",color:"#f59e0b"},{key:"mahi",label:"Mahi",color:"#10b981"},{key:"wahoo",label:"Wahoo",color:"#3b82f6"},{key:"bluefin",label:"Bluefin",color:"#6366f1"},{key:"kingfish",label:"Kingfish",color:"#ef4444"},{key:"white_marlin",label:"W. Marlin",color:"#8b5cf6"},{key:"blue_marlin",label:"B. Marlin",color:"#0ea5e9"}];

function distanceNm(lat1,lon1,lat2,lon2){const R=3440.065,dLat=((lat2-lat1)*Math.PI)/180,dLon=((lon2-lon1)*Math.PI)/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function bearingDeg(lat1,lon1,lat2,lon2){const dLon=((lon2-lon1)*Math.PI)/180;const y=Math.sin(dLon)*Math.cos(lat2*Math.PI/180);const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon);return((Math.atan2(y,x)*180/Math.PI)+360)%360;}
export function bearingLabel(deg){return["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"][Math.round(deg/22.5)%16];}

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
const OCEAN_MASK_URL="https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySSTData/ocean_mask.json";
async function loadPrebakedMask(){try{const t0=performance.now();const res=await fetch(OCEAN_MASK_URL);if(!res.ok){console.warn("[MASK] prebaked not available, HTTP",res.status);return null;}const obj=await res.json();const{bounds,step,rows,cols,packed}=obj;const bin=atob(packed);const bits=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bits[i]=bin.charCodeAt(i);console.log(`[MASK] prebaked loaded in ${(performance.now()-t0).toFixed(0)}ms (${rows}x${cols}, ${bits.length} bytes)`);return(lat,lon)=>{const ri=Math.round((bounds.n-lat)/step);const ci=Math.round((lon-bounds.w)/step);if(ri<0||ri>=rows||ci<0||ci>=cols)return false;const idx=ri*cols+ci;return(bits[idx>>3]&(0x80>>(idx&7)))!==0;};}catch(e){console.warn("[MASK] prebaked load failed:",e);return null;}}
async function buildOceanMaskFromLand(bounds){const prebaked=await loadPrebakedMask();if(prebaked)return prebaked;console.warn("[MASK] falling back to live Natural Earth download");try{const res=await fetch("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson");const gj=await res.json();let polys=[];for(const f of gj.features){const g=f.geometry;if(g.type==="Polygon")polys.push(g.coordinates);else if(g.type==="MultiPolygon")g.coordinates.forEach(p=>polys.push(p));}polys=polys.filter(poly=>{const r=poly[0];let mnLon=Infinity,mxLon=-Infinity,mnLat=Infinity,mxLat=-Infinity;for(const[lo,la]of r){if(lo<mnLon)mnLon=lo;if(lo>mxLon)mxLon=lo;if(la<mnLat)mnLat=la;if(la>mxLat)mxLat=la;}return mxLon>=bounds.west&&mnLon<=bounds.east&&mxLat>=bounds.south&&mnLat<=bounds.north;});if(!polys.length)return null;const STEP=0.02;const ocean=new Set();for(let lat=bounds.south;lat<=bounds.north+STEP*0.5;lat+=STEP){for(let lon=bounds.west;lon<=bounds.east+STEP*0.5;lon+=STEP){let isLand=false;for(const poly of polys){if(pointInRing(lon,lat,poly[0])){let inHole=false;for(let h=1;h<poly.length;h++){if(pointInRing(lon,lat,poly[h])){inHole=true;break;}}if(!inHole){isLand=true;break;}}}if(!isLand)ocean.add(`${Math.round((lat-bounds.south)/STEP)}_${Math.round((lon-bounds.west)/STEP)}`);}}if(!ocean.size)return null;return(lat,lon)=>ocean.has(`${Math.round((lat-bounds.south)/STEP)}_${Math.round((lon-bounds.west)/STEP)}`);}catch(e){console.error("[MASK] fallback also failed:",e);return null;}}

// ── Canvas raster ─────────────────────────────────────────────────────────────
export function gridToDataURL(latSet,lonSet,grid,valMin,valMax,colorFn,isOcean,rangeMin,rangeMax){
  if(!latSet.length||!lonSet.length)return null;
  const latNorth=latSet[0],latSouth=latSet[latSet.length-1],lonWest=lonSet[0],lonEast=lonSet[lonSet.length-1];
  const lonRange=lonEast-lonWest||1;
  const CANVAS_W=512,CANVAS_H=400;const canvas=document.createElement("canvas");canvas.width=CANVAS_W;canvas.height=CANVAS_H;
  const ctx=canvas.getContext("2d");const img=ctx.createImageData(CANVAS_W,CANVAS_H);const d=img.data;
  const latStep=latSet.length>1?(latNorth-latSouth)/(latSet.length-1):0.05;const lonStep=lonSet.length>1?(lonEast-lonWest)/(lonSet.length-1):0.05;
  const mercY=(lat)=>Math.log(Math.tan(Math.PI/4+(lat*Math.PI/180)/2));const invMercY=(y)=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
  const mercYNorth=mercY(latNorth),mercYSouth=mercY(latSouth),mercYRange=mercYNorth-mercYSouth||1;
  for(let py=0;py<CANVAS_H;py++){const mY=mercYNorth-(py/(CANVAS_H-1))*mercYRange;const lat=invMercY(mY);const latFloat=(latNorth-lat)/latStep;const latIdx0=Math.max(0,Math.min(latSet.length-2,Math.floor(latFloat)));const latFrac=Math.max(0,Math.min(1,latFloat-latIdx0));const gridLat0=latSet[latIdx0],gridLat1=latSet[latIdx0+1];
    for(let px=0;px<CANVAS_W;px++){const lon=lonWest+(px/(CANVAS_W-1))*lonRange;if(isOcean&&!isOcean(lat,lon))continue;const lonFloat=(lon-lonWest)/lonStep;const lonIdx0=Math.max(0,Math.min(lonSet.length-2,Math.floor(lonFloat)));const lonFrac=Math.max(0,Math.min(1,lonFloat-lonIdx0));const gridLon0=lonSet[lonIdx0],gridLon1=lonSet[lonIdx0+1];const vNW=grid[`${gridLat0}_${gridLon0}`],vNE=grid[`${gridLat0}_${gridLon1}`];const vSW=grid[`${gridLat1}_${gridLon0}`],vSE=grid[`${gridLat1}_${gridLon1}`];const wNW=(1-latFrac)*(1-lonFrac),wNE=(1-latFrac)*lonFrac,wSW=latFrac*(1-lonFrac),wSE=latFrac*lonFrac;let sum=0,wsum=0;if(vNW!=null&&Number.isFinite(vNW)){sum+=vNW*wNW;wsum+=wNW;}if(vNE!=null&&Number.isFinite(vNE)){sum+=vNE*wNE;wsum+=wNE;}if(vSW!=null&&Number.isFinite(vSW)){sum+=vSW*wSW;wsum+=wSW;}if(vSE!=null&&Number.isFinite(vSE)){sum+=vSE*wSE;wsum+=wSE;}if(wsum<0.25)continue;const val=sum/wsum;
      const rgb=colorFn?colorFn(val,valMin,valMax,rangeMin,rangeMax):sstColor(val,valMin,valMax,rangeMin,rangeMax);
      if(!rgb)continue;
      const i=(py*CANVAS_W+px)*4;d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];d[i+3]=220;}}
  ctx.putImageData(img,0,0);
  return new Promise((resolve)=>{canvas.toBlob((blob)=>{if(!blob){resolve(null);return;}resolve({dataURL:URL.createObjectURL(blob),west:lonWest-lonStep/2,east:lonEast+lonStep/2,north:latNorth+latStep/2,south:latSouth-latStep/2});},"image/png");});
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
    data, sstMin, sstMax, date, onLocationSaved, clearMarkersRef, flyToRef,
    onHoverSst, dataSource, setDataSource, activeDataLayer, setActiveDataLayer,
    wreckRemovedKeys,
    hotspotData, hotspotLoading,
    selectedFishSpecies, setSelectedFishSpecies,
    showHotspots, setShowHotspots,
    compositeData,
    compositeGenerated,
    compositeDateIndex, setCompositeDateIndex, compositeDates,
    chlData, chlDateIndex, setChlDateIndex, chlLoading,
    seaColorData, seaColorDateIndex, setSeaColorDateIndex, seaColorLoading,
    viirsData, viirsDateIndex, setViirsDateIndex, viirsHour, setViirsHour,
    viirsNppData, viirsNppDateIndex, setViirsNppDateIndex, activeViirsNppDay,
    murData, murDateIndex, setMurDateIndex,
    goesCompData, goesCompDateIndex, setGoesCompDateIndex, activeGoesCompDay,
    highlightedLocation, setHighlightedLocation,
    regionConfig, selectedLocation,
    savedLocations, fetchSavedLocations,
    windData, windLoading, windHourIndex, setWindHourIndex,
    showWindOverlay, setShowWindOverlay,
    windPlaying, setWindPlaying,
    sstRange, onSstRangeChange, userId,
    onShare,
    legendHoverSst, openControlPanelRef, rangeControlOpenRef,
    onNotesUpdated,
    BATHY_CONTOURS_URL, WRECKS_URL,
    isPro,
    currentsData, currentsLoading, showCurrents, setShowCurrents,
    altimetryData, onSlaRange,
    tripMode, waypoints, onAddWaypoint, onMoveWaypoint, onToggleTripMode, onEndTripAtDeparture, onLoadRoute,
  } = props;

  const { latSet, lonSet, grid } = data;
  const regionBounds = regionConfig.bounds;
  const llBounds = L.latLngBounds(
    [regionBounds.south, regionBounds.west],
    [regionBounds.north, regionBounds.east]
  );

  const mapDivRef        = useRef(null);
  const mapRef           = useRef(null);
  const sstOverlayRef    = useRef(null);
  const overlayLayerRef  = useRef(null);
  const isothermLayerRef = useRef(null);
  const breakLayerRef    = useRef(null);
  const breakGlowRef     = useRef(null);
  const bathyLayerRef    = useRef(null);
  const bathyLabelRef    = useRef(null);
  const wreckLayerRef    = useRef(null);
  const hotspotLayerRef  = useRef(null);
  const markersLayerRef  = useRef(null);
  const refMarkerRef     = useRef(null);
  const highlightLayerRef= useRef(null);
  const velocityLayerRef    = useRef(null);
  const windRasterOverlayRef= useRef(null);
  const currentsLayerRef    = useRef(null);
  const slaContourLayerRef  = useRef(null);
  const blobUrlsRef         = useRef([]);

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
  const userInteractedRef = useRef(false);

  // Fetch compositeDate locally so it's colocated with the hotspot consumer
  const [compositeDate, setCompositeDateLocal] = useState(null);
  useEffect(() => {
    fetch(`${VIIRS_CDN_BASE_LOCAL}/viirs_index.json`)
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
  const [showWrecks,      setShowWrecks]      = useState(false);
  const [bathyData,       setBathyData]       = useState(null);
  const bathyDataRef = useRef(null);
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
  const [mapReady,         setMapReady]         = useState(false);
  const [sstReady,         setSstReady]         = useState(false);
  const waterMaskRef  = useRef(null);
  const [waterMaskVersion, setWaterMaskVersion] = useState(0);
  const [repaintTrigger,   setRepaintTrigger]   = useState(0);
  const maskBuildStartedRef = useRef(false);
  const controlPanelRef  = useRef(null);
  const isOverControlPanel = useRef(false);
  const [hotspotPopup,         setHotspotPopup]         = useState(null); // { html, cloudWarning, x, y }
  const [hotspotWarningOpen,   setHotspotWarningOpen]   = useState(false);
  const [showIsotherm,         setShowIsotherm]         = useState(false);
  const [isothermalTargetTemp, setIsothermalTargetTemp] = useState(71);
  const [isothermalSensitivity,setIsothermalSensitivity]= useState(2.0);
  const effectiveTargetTemp = isothermalTargetTemp ?? Math.round((sstMin + sstMax) / 2);
  const [interactionMode, setInteractionMode] = useState("pan");
  const interactionModeRef = useRef("pan");
  const tripModeRef        = useRef(false);
  const tripLayerRef       = useRef(null);
  const waypointsRef       = useRef([]);
  const [touchMarker, setTouchMarker] = useState(null);
  const [showSavedPanel,    setShowSavedPanel]    = useState(false);
  const [savedRoutesCount, setSavedRoutesCount] = useState(0);
  useEffect(() => {
    supabase.from("saved_routes").select("id", { count: "exact", head: true })
      .then(({ count }) => { if (count != null) setSavedRoutesCount(count); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [panelCollapsed,  setPanelCollapsed] = useState(false);
  const [mobilePanel,     setMobilePanel]     = useState(null); // null | "sst" | "chl" | "seacolor" | "wind" | "tools"
  const [shareLocation,   setShareLocation]   = useState(null);

  // ── Trip mode ref sync ───────────────────────────────────────────────────────
  useEffect(() => { waypointsRef.current = waypoints || []; }, [waypoints]);

  useEffect(() => {
    tripModeRef.current = !!tripMode;
    const map = mapRef.current; if (!map) return;
    const c = map.getContainer();
    c.style.cursor = tripMode ? "crosshair" : "";
  }, [tripMode]);

  // ── Waypoint layer ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
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
      // Prevent clicks on waypoint markers from bubbling to the map click handler
      // (which would add duplicate waypoints or incorrectly trigger end-trip prompt)
      marker.on("click",      (e) => { L.DomEvent.stopPropagation(e); });
      marker.on("touchstart", (e) => { L.DomEvent.stopPropagation(e); L.DomEvent.preventDefault(e); });
    });
  }, [waypoints, tripMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Prevent Leaflet from intercepting spacebar when the user is typing in an input/textarea
    const stopSpaceInInputs = (e) => {
      if (e.key === " " || e.code === "Space") {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") e.stopPropagation();
      }
    };
    document.addEventListener("keydown", stopSpaceInInputs, true);
    map.on("remove", () => document.removeEventListener("keydown", stopSpaceInInputs, true));
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap, &copy; CARTO', subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    const calcFillZoom = (cw, ch) => {
      const _mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
      const _mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
      const _mH = _mN - _mS, _lR = regionBounds.east - regionBounds.west;
      return Math.max(Math.log2((cw * 360)/(256*_lR)), Math.log2((ch * 2*Math.PI)/(256*_mH)));
    };
    const applyFillZoom = () => {
      try {
        map.invalidateSize();
        const sz = map.getSize();
        // Use visualViewport height as floor so iOS measures correctly before layout settles
        const vpH = window.visualViewport?.height || window.innerHeight || 0;
        const _cw = sz.x || 800;
        const _ch = Math.max(sz.y || 0, vpH * 0.75, 500);
        const fillZoom = calcFillZoom(_cw, _ch);
        const curZoom = map.getZoom();
        // Always setView on first call (curZoom is NaN); skip on repeat calls if zoom is already correct
        if (!isFinite(curZoom) || Math.abs(curZoom - fillZoom) > 0.05) {
          map.setView(llBounds.getCenter(), fillZoom, { animate: false });
        }
        // Post-check: if view still shows outside north/south, bump zoom until it doesn't
        let guard = 0;
        while (guard++ < 10) {
          const vb = map.getBounds();
          if (vb.getNorth() <= regionBounds.north + 0.05 && vb.getSouth() >= regionBounds.south - 0.05) break;
          map.setZoom(map.getZoom() + 0.1, { animate: false });
        }
        map.setMinZoom(map.getZoom()); map.setMaxZoom(12); map.setMaxBounds(llBounds);
      } catch(_) {}
    };
    requestAnimationFrame(() => requestAnimationFrame(() => {
      applyFillZoom(); setTimeout(applyFillZoom, 300); setTimeout(applyFillZoom, 800); setTimeout(applyFillZoom, 1800);
    }));
    map.on("drag", () => { map.panInsideBounds(llBounds, { animate: false }); });

    map.on("click", (e) => {
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
      const nearLat = latSet.reduce((a,b)=>Math.abs(b-lat)<Math.abs(a-lat)?b:a);
      const nearLon = lonSet.reduce((a,b)=>Math.abs(b-lon)<Math.abs(a-lon)?b:a);
      const sst = grid[`${nearLat}_${nearLon}`] ?? null;
      let depth_ft = null;
      if (bathyDataRef.current?.points?.length) {
        let best=null,bestDist=Infinity;
        for(const pt of bathyDataRef.current.points){const d=(pt.lat-lat)**2+(pt.lon-lon)**2;if(d<bestDist){bestDist=d;best=pt;}}
        depth_ft = best?.depth_ft ?? null;
      }
      const refLoc = selectedLocationRef.current;
      const containerPt = map.latLngToContainerPoint(e.latlng);
      setClickInfo({ lat, lon, sst, depth_ft,
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
      const nearLat = latSet.reduce((a,b)=>Math.abs(b-lat)<Math.abs(a-lat)?b:a);
      const nearLon = lonSet.reduce((a,b)=>Math.abs(b-lon)<Math.abs(a-lon)?b:a);
      let sst = grid[`${nearLat}_${nearLon}`] ?? null;
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
      const nearLat = latSet.reduce((a,b)=>Math.abs(b-lat)<Math.abs(a-lat)?b:a);
      const nearLon = lonSet.reduce((a,b)=>Math.abs(b-lon)<Math.abs(a-lon)?b:a);
      const sst = grid[`${nearLat}_${nearLon}`] ?? null;
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
      buildOceanMaskFromLand(regionBounds).then(mask => {
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
      const CROSSHAIR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cline x1='8' y1='0' x2='8' y2='16' stroke='%23111' stroke-width='1.2'/%3E%3Cline x1='0' y1='8' x2='16' y2='8' stroke='%23111' stroke-width='1.2'/%3E%3Ccircle cx='8' cy='8' r='2.5' fill='none' stroke='%23111' stroke-width='1.2'/%3E%3C/svg%3E") 8 8, crosshair`;
      c.style.cursor = interactionMode === "crosshair" ? CROSSHAIR_SVG : "grab";
    } catch(_){}
    if (interactionMode === "pan") { setHoverInfo(null); setTouchMarker(null); map.dragging.enable(); return; }

    // Crosshair mode: block left-drag so inspect works, but allow:
    //   • Middle-click drag (button 1)
    //   • Space + left-drag  (hold Space to pan)
    map.dragging.disable();

    const XHAIR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cline x1='8' y1='0' x2='8' y2='16' stroke='%23111' stroke-width='1.2'/%3E%3Cline x1='0' y1='8' x2='16' y2='8' stroke='%23111' stroke-width='1.2'/%3E%3Ccircle cx='8' cy='8' r='2.5' fill='none' stroke='%23111' stroke-width='1.2'/%3E%3C/svg%3E") 8 8, crosshair`;

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
        const _cw = sz.x || 800, _ch = Math.max(sz.y || 0, vpH * 0.75, 500);
        const _mN = Math.log(Math.tan(Math.PI/4 + regionBounds.north*Math.PI/360));
        const _mS = Math.log(Math.tan(Math.PI/4 + regionBounds.south*Math.PI/360));
        const _mH = _mN - _mS, _lR = regionBounds.east - regionBounds.west;
        const fillZoom = Math.max(Math.log2((_cw * 360) / (256 * _lR)), Math.log2((_ch * 2 * Math.PI) / (256 * _mH)));
        const curZoom = map.getZoom();
        if (!isFinite(curZoom) || Math.abs(curZoom - fillZoom) > 0.05) {
          map.setView(llBounds.getCenter(), fillZoom, { animate: false });
        }
        let guard = 0;
        while (guard++ < 10) {
          const vb = map.getBounds();
          if (vb.getNorth() <= regionBounds.north + 0.05 && vb.getSouth() >= regionBounds.south - 0.05) break;
          map.setZoom(map.getZoom() + 0.1, { animate: false });
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
    const markInteracted = () => { userInteracted = true; };
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
          map.setView(llBounds.getCenter(), fillZoom, { animate: false });
        }
        map.setMinZoom(fillZoom); map.setMaxBounds(llBounds);
        setRepaintTrigger(t => t + 1);
      } catch(_){}
    };
    // window resize — just invalidate, don't refit (avoid thrash)
    const onResize = () => { try { map.invalidateSize(); setRepaintTrigger(t => t + 1); } catch(_){} };
    window.addEventListener("resize", onResize);
    // visualViewport resize fires when iOS URL bar shows/hides — do refit then
    let vvTimer = null;
    const onVVResize = () => { clearTimeout(vvTimer); vvTimer = setTimeout(refit, 250); };
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
    if (!showSSTLayer || activeDataLayer !== "sst") return;
    const rangeMin = sstRange?.min !== undefined ? sstRange.min : undefined;
    const rangeMax = sstRange?.max !== undefined ? sstRange.max : undefined;
    let cancelled = false;
    Promise.resolve(gridToDataURL(latSet, lonSet, grid, sstMin, sstMax, null, mask, rangeMin, rangeMax)).then(result => {
      if (cancelled || !result) return;
      const { dataURL, west, east, north, south } = result;
      blobUrlsRef.current.push(dataURL);
      const opacity = (dataSource === "VIIRS" || dataSource === "VIIRSSNPP" || dataSource === "GOESCOMP") ? 0.78 : 0.92;
      const overlay = L.imageOverlay(dataURL, [[south, west], [north, east]], { opacity, interactive: false });
      overlay.addTo(map); sstOverlayRef.current = overlay; setSstReady(true);
      if (dataSource === "MUR") { try { map.setMaxBounds([[south, west], [north, east]]); } catch(_) {} }
      else if (dataSource === "VIIRS") {
        try { map.setMaxBounds([[33.70, -78.89], [39.00, -72.21]]); } catch(_) {}
        try {
          const sz = map.getSize(); const cw = sz.x || 800, ch = sz.y || 600;
          const mN = Math.log(Math.tan(Math.PI/4 + 39.00 * Math.PI/360));
          const mS = Math.log(Math.tan(Math.PI/4 + 33.70 * Math.PI/360));
          const mH = mN - mS, lR = -72.21 - (-78.89);
          map.setMinZoom(Math.max(Math.log2((cw * 360) / (256 * lR)), Math.log2((ch * 2 * Math.PI) / (256 * mH))));
        } catch(_) {}
      } else { try { map.setMaxBounds(llBounds); } catch(_) {} }
    });
    return () => { cancelled = true; };
  }, [mapReady, latSet, lonSet, grid, sstMin, sstMax, showSSTLayer, activeDataLayer, dataSource,
      waterMaskVersion, repaintTrigger, sstRange?.min, sstRange?.max, sstRange?.maskOutside]);

  function expandCoarseGrid(latSet2,lonSet2,overlayGrid,targetLatSet,targetLonSet){const expanded={};for(const lat of targetLatSet){let r0=0;for(let i=0;i<latSet2.length-1;i++){if(lat<=latSet2[i]&&lat>=latSet2[i+1]){r0=i;break;}}const r1=Math.min(r0+1,latSet2.length-1);const latFrac=latSet2[r0]===latSet2[r1]?0:(latSet2[r0]-lat)/(latSet2[r0]-latSet2[r1]);for(const lon of targetLonSet){let c0=0;for(let i=0;i<lonSet2.length-1;i++){if(lon>=lonSet2[i]&&lon<=lonSet2[i+1]){c0=i;break;}}const c1=Math.min(c0+1,lonSet2.length-1);const lonFrac=lonSet2[c0]===lonSet2[c1]?0:(lon-lonSet2[c0])/(lonSet2[c1]-lonSet2[c0]);const vNW=overlayGrid[`${latSet2[r0]}_${lonSet2[c0]}`],vNE=overlayGrid[`${latSet2[r0]}_${lonSet2[c1]}`];const vSW=overlayGrid[`${latSet2[r1]}_${lonSet2[c0]}`],vSE=overlayGrid[`${latSet2[r1]}_${lonSet2[c1]}`];const wNW=(1-latFrac)*(1-lonFrac),wNE=(1-latFrac)*lonFrac,wSW=latFrac*(1-lonFrac),wSE=latFrac*lonFrac;let sum=0,wsum=0;if(vNW!=null&&Number.isFinite(vNW)){sum+=vNW*wNW;wsum+=wNW;}if(vNE!=null&&Number.isFinite(vNE)){sum+=vNE*wNE;wsum+=wNE;}if(vSW!=null&&Number.isFinite(vSW)){sum+=vSW*wSW;wsum+=wSW;}if(vSE!=null&&Number.isFinite(vSE)){sum+=vSE*wSE;wsum+=wSE;}if(wsum>=0.25)expanded[`${lat}_${lon}`]=sum/wsum;}}return expanded;}

  // ── Overlay layer (chl / composite / seacolor) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (overlayLayerRef.current) { map.removeLayer(overlayLayerRef.current); overlayLayerRef.current = null; }
    let overlayGrid=null,latSet2=[],lonSet2=[],colorFn=null,min2=0,max2=1;
    if (activeDataLayer==="chlorophyll"&&chlData?.days?.length) {
      const day=chlData.days[chlDateIndex]||chlData.days[chlData.days.length-1];
      if(!day?.grid?.length)return;
      latSet2=[...new Set(day.grid.map(d=>d.lat))].sort((a,b)=>b-a);
      lonSet2=[...new Set(day.grid.map(d=>d.lon))].sort((a,b)=>a-b);
      overlayGrid={};day.grid.forEach(d=>{overlayGrid[`${d.lat}_${d.lon}`]=d.chlorophyll;});
      min2=day.stats.min;max2=day.stats.max;colorFn=chlColor;
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
      min2 = sstMin; max2 = sstMax; colorFn = null;
    } else if (activeDataLayer==="seacolor"&&seaColorData?.days?.length) {
      const day=seaColorData.days[seaColorDateIndex]||seaColorData.days[seaColorData.days.length-1];
      if(!day?.grid?.length)return;
      latSet2=[...new Set(day.grid.map(d=>d.lat))].sort((a,b)=>b-a);
      lonSet2=[...new Set(day.grid.map(d=>d.lon))].sort((a,b)=>a-b);
      overlayGrid={};day.grid.forEach(d=>{overlayGrid[`${d.lat}_${d.lon}`]=d.kd490;});
      min2=day.stats.min;max2=day.stats.max;colorFn=kd490Color;
    } else if (activeDataLayer==="altimetry"&&altimetryData?.lats?.length) {
      // No raster for altimetry — contour lines are drawn by the SLA contour useEffect.
      // Update legend range only.
      const { lats, lons, sla } = altimetryData;
      if (!sla) return;
      const slaFlat = [];
      for (let i = 0; i < lats.length; i++) { const row = sla[i]; if (!row) continue; for (let j = 0; j < lons.length; j++) { const v = row[j]; if (v != null && Number.isFinite(v)) slaFlat.push(v); } }
      slaFlat.sort((a, b) => a - b);
      if (slaFlat.length > 10) {
        const p5 = slaFlat[Math.floor(slaFlat.length * 0.05)];
        const p95 = slaFlat[Math.floor(slaFlat.length * 0.95)];
        const autoRange = Math.min(0.4, Math.max(Math.abs(p5), Math.abs(p95)));
        onSlaRange?.({ min: -autoRange, max: autoRange });
      }
      return; // Contours drawn separately — no raster overlay
    } else { return; }
    if (!latSet2.length) return;
    let cancelled = false;
    const useRefGrid = activeDataLayer==="seacolor" || activeDataLayer==="chlorophyll";
    const renderLatSet = useRefGrid ? latSet : latSet2;
    const renderLonSet = useRefGrid ? lonSet : lonSet2;
    const renderGrid   = useRefGrid ? expandCoarseGrid(latSet2,lonSet2,overlayGrid,latSet,lonSet) : overlayGrid;
    const finalColorFn = activeDataLayer === "composite" ? null : colorFn;
    const finalMin = activeDataLayer === "composite" ? sstMin : min2;
    const finalMax = activeDataLayer === "composite" ? sstMax : max2;
    const finalRangeMin = (activeDataLayer === "composite" || activeDataLayer === "chlorophyll" || activeDataLayer === "seacolor") && sstRange?.min != null ? sstRange.min : undefined;
    const finalRangeMax = (activeDataLayer === "composite" || activeDataLayer === "chlorophyll" || activeDataLayer === "seacolor") && sstRange?.max != null ? sstRange.max : undefined;
    Promise.resolve(gridToDataURL(renderLatSet,renderLonSet,renderGrid,finalMin,finalMax,finalColorFn,waterMaskRef.current,finalRangeMin,finalRangeMax)).then(result => {
      if (cancelled || !result) return;
      const { dataURL, west, east, north, south } = result;
      blobUrlsRef.current.push(dataURL);
      const overlay = L.imageOverlay(dataURL, [[south, west], [north, east]], { opacity: 0.92, interactive: false });
      overlay.addTo(map); overlayLayerRef.current = overlay;
    });
    return () => { cancelled = true; };
  }, [mapReady, activeDataLayer, chlData, chlDateIndex, seaColorData, seaColorDateIndex, compositeData, altimetryData, waterMaskVersion, repaintTrigger, sstRange?.min, sstRange?.max]);

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
    const whiteScale = ["rgba(255,255,255,0.4)","rgba(255,255,255,0.65)","rgba(255,255,255,0.85)","rgba(255,255,255,0.95)"];
    const velocityLayer = L.velocityLayer({
      displayValues: false,
      displayOptions: { velocityType: "Wind", position: "bottomright", emptyString: "No wind data", angleConvention: "meteoCW", showCardinal: true, speedUnit: "kt", directionString: "Direction", speedString: "Speed" },
      data: hourData.velocityJSON, minVelocity: 0, maxVelocity: maxSpd, velocityScale: 0.005,
      colorScale: whiteScale, opacity: isOverlay ? 0.65 : 0.85,
      particleAge: 40, particleMultiplier: 0.0008, lineWidth: isOverlay ? 1.8 : 2.0,
    });
    velocityLayer.addTo(map); velocityLayerRef.current = velocityLayer;
    if (velocityLayer._onLayerDidMove) {
      const _orig = velocityLayer._onLayerDidMove.bind(velocityLayer);
      velocityLayer._onLayerDidMove = function() { if (!this._map) return; try { _orig.call(this); } catch(e) {} };
    }
    return () => {
      if (velocityLayerRef.current) { map.removeLayer(velocityLayerRef.current); velocityLayerRef.current = null; }
      if (windRasterOverlayRef.current) { map.removeLayer(windRasterOverlayRef.current); windRasterOverlayRef.current = null; }
    };
  }, [mapReady, windActive, windData, showWindOverlay, isWindMap, repaintTrigger]);

  // ── Currents velocity layer ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (currentsLayerRef.current) { map.removeLayer(currentsLayerRef.current); currentsLayerRef.current = null; }
    if (!showCurrents || !currentsData?.hours?.length) return;
    if (!L.velocityLayer) { const t = setTimeout(() => setRepaintTrigger(p => p + 1), 500); return () => clearTimeout(t); }
    const hourData = currentsData.hours[0];
    if (!hourData?.velocityJSON) return;
    const maxSpd = currentsData.maxSpeed ?? 2.0;
    const currentsLayer = L.velocityLayer({
      lineWidth: 3.5,
      particleMultiplier: 0.0002,
      particleAge: 60,
      displayOptions: {
        velocityType: "Current", position: "bottomleft", emptyString: "No current data",
        angleConvention: "bearingCW", showCardinal: false,
        speedUnit: "m/s", directionString: "Direction", speedString: "Speed",
      },
      data: hourData.velocityJSON, minVelocity: 0, maxVelocity: maxSpd,
      velocityScale: 0.04,
      colorScale: ["rgba(255,255,255,0.7)","rgba(255,255,255,0.82)","rgba(255,255,255,0.92)","rgba(255,255,255,1.0)"],
    });
    currentsLayer.addTo(map);
    currentsLayerRef.current = currentsLayer;
    if (currentsLayer._onLayerDidMove) {
      const _orig = currentsLayer._onLayerDidMove.bind(currentsLayer);
      currentsLayer._onLayerDidMove = function() { if (!this._map) return; try { _orig.call(this); } catch(e) {} };
    }
    return () => {
      if (currentsLayerRef.current) { map.removeLayer(currentsLayerRef.current); currentsLayerRef.current = null; }
    };
  }, [mapReady, showCurrents, currentsData, repaintTrigger]);

  // ── SLA contour lines (altimetry layer) ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    if (slaContourLayerRef.current) { map.removeLayer(slaContourLayerRef.current); slaContourLayerRef.current = null; }
    if (activeDataLayer !== "altimetry" || !altimetryData?.lats?.length) return;
    const { lats, lons, sla } = altimetryData;
    if (!sla) return;
    const rawLats = lats.map(v => Math.round(v * 1e5) / 1e5);
    const rawLons = lons.map(v => Math.round(v * 1e5) / 1e5);
    const latSet2 = [...rawLats].sort((a, b) => b - a);
    const lonSet2 = [...rawLons].sort((a, b) => a - b);
    const overlayGrid = {};
    for (let i = 0; i < rawLats.length; i++) {
      const row = sla[i]; if (!row) continue;
      for (let j = 0; j < rawLons.length; j++) {
        const v = row[j];
        if (v != null && Number.isFinite(v)) overlayGrid[`${rawLats[i]}_${rawLons[j]}`] = v;
      }
    }
    if (!latSet2.length || !lonSet2.length) return;
    // Compute contour levels at 0.05m intervals across 5th–95th percentile
    const slaVals = Object.values(overlayGrid).filter(v => Number.isFinite(v)).sort((a,b)=>a-b);
    if (slaVals.length < 4) return;
    const p5  = slaVals[Math.floor(slaVals.length * 0.05)];
    const p95 = slaVals[Math.floor(slaVals.length * 0.95)];
    const STEP = 0.05;
    const levelMin = Math.ceil(p5 / STEP) * STEP;
    const levelMax = Math.floor(p95 / STEP) * STEP;
    const levels = [];
    for (let l = levelMin; l <= levelMax + 0.001; l += STEP) levels.push(Math.round(l * 1000) / 1000);
    // Color + weight per level
    const levelStyle = (v) => {
      const a = Math.abs(v);
      if (a < 0.025) return { weight: 2.5 };
      if (a >= 0.2)  return { weight: 2.0 };
      if (a >= 0.1)  return { weight: 1.8 };
      return { weight: 1.4 };
    };
    try {
      const { field, rows, cols } = buildField(latSet2, lonSet2, overlayGrid);
      const contourGroup = L.layerGroup();
      for (const level of levels) {
        const lines = marchingSquares(latSet2, lonSet2, field, rows, cols, level);
        if (!lines.length) continue;
        const { weight } = levelStyle(level);
        const isZero = Math.abs(level) < 0.025;
        lines.forEach(seg => {
          const latlngs = seg.map(([lon, lat]) => [lat, lon]);
          L.polyline(latlngs, { color: "rgba(0,0,0,0.35)", weight: weight + 2, interactive: false }).addTo(contourGroup);
          L.polyline(latlngs, { color: "#ffffff", weight: isZero ? weight + 1 : weight, opacity: 0.92, interactive: false }).addTo(contourGroup);
        });
      }
      contourGroup.addTo(map);
      slaContourLayerRef.current = contourGroup;
    } catch(err) { console.error("[SLA contour]", err); }
  }, [mapReady, activeDataLayer, altimetryData, waterMaskVersion, repaintTrigger]);

  // ── Wind raster ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !windActive || !windData?.hours?.length) return;
    const hourData = windData.hours[windHourIndex] ?? windData.hours[0];
    if (!hourData?.velocityJSON) return;
    const maxSpd = windData.maxSpeed ?? 30;
    if (velocityLayerRef.current?.setData) velocityLayerRef.current.setData(hourData.velocityJSON);
    if (isWindMap && hourData.grid?.length) {
      if (windRasterOverlayRef.current) { map.removeLayer(windRasterOverlayRef.current); windRasterOverlayRef.current = null; }
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
      Promise.resolve(gridToDataURL(latSet, lonSet, speedGrid, 0, maxSpd, windSpeedColor, waterMaskRef.current)).then(result => {
        if (!result || !mapRef.current) return;
        const { dataURL, west, east, north, south } = result;
        blobUrlsRef.current.push(dataURL);
        const raster = L.imageOverlay(dataURL, [[south, west], [north, east]], { opacity: 0.82, interactive: false });
        raster.addTo(mapRef.current); windRasterOverlayRef.current = raster;
      });
    }
  }, [mapReady, windActive, windData, windHourIndex, isWindMap, waterMaskVersion]);

  // ── Isotherm layer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    [isothermLayerRef, breakLayerRef, breakGlowRef].forEach(r => { if (r.current) { map.removeLayer(r.current); r.current = null; } });
    if (!showIsotherm || !latSet.length || activeDataLayer !== "sst") return;
    const tid = setTimeout(() => {
      try {
        const { isotherms, breaks } = buildIsothermLines(latSet, lonSet, grid, effectiveTargetTemp, isothermalSensitivity);
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
  }, [mapReady, showIsotherm, latSet, lonSet, grid, effectiveTargetTemp, isothermalSensitivity, activeDataLayer, waterMaskVersion, repaintTrigger]);

  // ── Bathymetry ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sstReady || !showBathyLayer || jsonContours) return;
    setJsonContoursLoading(true);
    fetch(BATHY_CONTOURS_URL).then(r=>r.json()).then(d=>{setJsonContours(d);setJsonContoursLoading(false);}).catch(()=>setJsonContoursLoading(false));
  }, [sstReady, showBathyLayer]);

  useEffect(() => {
    const map = mapRef.current; if (!mapReady || !map) return;
    if (bathyLayerRef.current) { map.removeLayer(bathyLayerRef.current); bathyLayerRef.current = null; }
    if (bathyLabelRef.current) { map.removeLayer(bathyLabelRef.current); bathyLabelRef.current = null; }
    if (!showBathyLayer || !jsonContours) return;
    const lyr = L.geoJSON(jsonContours, {
      interactive: false,
      style: f => {
        const d = f.properties.depth_ft;
        if (d >= 1200) return { color: "rgba(40,55,85,0.65)",  weight: 1.3, opacity: 0.70 };
        if (d >= 600)  return { color: "rgba(50,65,95,0.55)",  weight: 1.0, opacity: 0.60 };
        if (d >= 300)  return { color: "rgba(60,75,105,0.48)", weight: 0.8, opacity: 0.52 };
        if (d >= 100)  return { color: "rgba(70,85,115,0.40)", weight: 0.7, opacity: 0.45 };
        if (d >= 60)   return { color: "rgba(80,95,125,0.32)", weight: 0.6, opacity: 0.38 };
        return              { color: "rgba(90,105,135,0.25)", weight: 0.5, opacity: 0.30 };
      },
    });
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
          L.marker([lat, lon], { icon, interactive: false, keyboard: false }).addTo(labelGroup);
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
    const loc = selectedLocationRef.current;
    const lyr = L.layerGroup();
    wrecksData.features.forEach(f => {
      const [lon, lat] = f.geometry.coordinates;
      const props = f.properties || {};
      if (lat<regionBounds.south||lat>regionBounds.north||lon<regionBounds.west||lon>regionBounds.east) return;
      if (loc?.wreckRegion && props.region && props.region !== loc.wreckRegion) return;
      const fKey = `${(props.name ?? "").trim()}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
      if (wreckRemovedKeys?.has(fKey)) return;
      const m = L.circleMarker([lat, lon], { radius:5, color:"#fff", weight:1, fillColor:props.symbol==="Wreck"?"#ef4444":"#f59e0b", fillOpacity:0.9 });
      m.on("mouseover", e => { const containerPt=map.latLngToContainerPoint(e.latlng); setHoveredWreck({px:containerPt.x,py:containerPt.y,props,lat,lon}); try{map.getContainer().style.cursor="pointer";}catch(_){} });
      m.on("mouseout", () => { setHoveredWreck(null); try{ const XHAIR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cline x1='8' y1='0' x2='8' y2='16' stroke='%23111' stroke-width='1.2'/%3E%3Cline x1='0' y1='8' x2='16' y2='8' stroke='%23111' stroke-width='1.2'/%3E%3Ccircle cx='8' cy='8' r='2.5' fill='none' stroke='%23111' stroke-width='1.2'/%3E%3C/svg%3E") 8 8, crosshair`; map.getContainer().style.cursor=interactionModeRef.current==="crosshair"?XHAIR:"grab";}catch(_){} });
      m.addTo(lyr);
    });
    lyr.addTo(map); wreckLayerRef.current = lyr;
  }, [mapReady, showWrecks, wrecksData, selectedLocation, regionBounds, wreckRemovedKeys]);

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
      const pinHtml = isHighlighted
        ? `<svg width="14" height="19" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M11 0C4.925 0 0 4.925 0 11c0 7.5 11 19 11 19s11-11.5 11-19C22 4.925 17.075 0 11 0z" fill="#f97316" stroke="#00BFFF" stroke-width="2"/><circle cx="11" cy="11" r="4" fill="#00BFFF" fill-opacity="0.95"/></svg>`
        : `<svg width="14" height="19" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M11 0C4.925 0 0 4.925 0 11c0 7.5 11 19 11 19s11-11.5 11-19C22 4.925 17.075 0 11 0z" fill="#f97316" stroke="white" stroke-width="2"/><circle cx="11" cy="11" r="4" fill="white" fill-opacity="0.95"/></svg>`;
      const icon = L.divIcon({ className:"", html: pinHtml, iconSize:[14,19], iconAnchor:[7,19] });
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
    const m = L.marker([selectedLocation.lat, selectedLocation.lon], { icon }).bindPopup(selectedLocation.label);
    m.addTo(map); refMarkerRef.current = m;
  }, [mapReady, selectedLocation]);

  useEffect(() => {
    if (!sstReady) return;
    const BATHY_URL = "https://raw.githubusercontent.com/jlintvet/SSTv2/main/DailySST/bathymetry.json";
    fetch(BATHY_URL).then(r=>r.json()).then(d=>{ setBathyData(d); bathyDataRef.current = d; }).catch(()=>{});
  }, [sstReady]);

  useEffect(() => { if (flyToRef) flyToRef.current = (lat, lon) => { const map = mapRef.current; if (!map) return; map.setView([lat, lon], Math.max(map.getZoom(), 8), { animate: true }); }; }, [flyToRef]);
  if (openControlPanelRef) openControlPanelRef.current = () => setPanelCollapsed(false);
  useEffect(() => {
    if (clearMarkersRef) clearMarkersRef.current = id => {
      if (id === null) { setMarkers([]); setSelectedMarker(null); }
      else { setMarkers(m => m.filter(mk => mk.id !== id)); setSelectedMarker(sm => sm?.mk?.id === id ? null : sm); }
    };
  }, [clearMarkersRef]);

  const sliderHeight = windActive ? 80 : 0;
  const showRangeControl = activeDataLayer === "sst";

  return (
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
            seaColorData={seaColorData} seaColorDateIndex={seaColorDateIndex} setSeaColorDateIndex={setSeaColorDateIndex} seaColorLoading={seaColorLoading}
            windLoading={windLoading}
            sstRange={sstRange} onSstRangeChange={onSstRangeChange} userId={userId} rangeControlOpenRef={rangeControlOpenRef}
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
            showBathyLayer={showBathyLayer} setShowBathyLayer={setShowBathyLayer} jsonContoursLoading={jsonContoursLoading}
            showWrecks={showWrecks} setShowWrecks={setShowWrecks} wrecksLoading={wrecksLoading}
            selectedLocation={selectedLocation}
            collapsed={panelCollapsed} setCollapsed={setPanelCollapsed}
            compositeData={compositeData} compositeGenerated={compositeGenerated}
            compositeDateIndex={compositeDateIndex} setCompositeDateIndex={setCompositeDateIndex} compositeDates={compositeDates}
            isPro={isPro}
            tripMode={tripMode}
            onToggleTripMode={onToggleTripMode}
          />

          {windLoading&&(windActive||windData===null)&&(
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2" style={{zIndex:700}}>
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Loading wind data…
            </div>
          )}

          {/* Mobile floating controls — 5 layer icons + divider + inspect/pan/bookmark */}
          <div className="sm:hidden absolute flex flex-col gap-1" style={{ right: 8, top: 8, zIndex: 501 }}>
            {/* SST */}
            <button onClick={() => { setMobilePanel(p => p === "sst" ? null : "sst"); setActiveDataLayer("sst"); }} title="SST"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="sst" ? "#0891b2" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="sst" ? "#0891b2" : "#e2e8f0" }}>
              <span style={{ fontSize:10, fontWeight:700, color: mobilePanel==="sst" ? "#fff" : "#64748b", lineHeight:1 }}>SST</span>
            </button>
            {/* CHL */}
            <button onClick={() => { setMobilePanel(p => p === "chl" ? null : "chl"); setActiveDataLayer("chlorophyll"); }} title="Chlorophyll"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="chl" ? "#16a34a" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="chl" ? "#16a34a" : "#e2e8f0" }}>
              <span style={{ fontSize:10, fontWeight:700, color: mobilePanel==="chl" ? "#fff" : "#64748b", lineHeight:1 }}>CHL</span>
            </button>
            {/* Sea Color */}
            <button onClick={() => { setMobilePanel(p => p === "seacolor" ? null : "seacolor"); setActiveDataLayer("seacolor"); }} title="Sea Color"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="seacolor" ? "#0d9488" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="seacolor" ? "#0d9488" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: mobilePanel==="seacolor" ? "#fff" : "#64748b", lineHeight:1 }}>SC</span>
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
            <button onClick={() => setMobilePanel(p => p === "currents" ? null : "currents")} title="Currents"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="currents" ? "#0284c7" : showCurrents ? "rgba(2,132,199,0.15)" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="currents" ? "#0284c7" : showCurrents ? "#0284c7" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: mobilePanel==="currents" ? "#fff" : showCurrents ? "#0284c7" : "#64748b", lineHeight:1 }}>CUR</span>
            </button>
            {/* Altimetry */}
            <button onClick={() => setMobilePanel(p => p === "altimetry" ? null : "altimetry")} title="Altimetry"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: activeDataLayer==="altimetry" ? "#7c3aed" : "rgba(255,255,255,0.9)",
                borderColor: activeDataLayer==="altimetry" ? "#7c3aed" : "#e2e8f0" }}>
              <span style={{ fontSize:9, fontWeight:700, color: activeDataLayer==="altimetry" ? "#fff" : "#64748b", lineHeight:1 }}>SLA</span>
            </button>
            {/* Tools */}
            <button onClick={() => setMobilePanel(p => p === "tools" ? null : "tools")} title="Tools"
              className="flex items-center justify-center rounded-lg shadow-sm border"
              style={{ width:30, height:30, padding:0,
                background: mobilePanel==="tools" ? "#475569" : "rgba(255,255,255,0.9)",
                borderColor: mobilePanel==="tools" ? "#475569" : "#e2e8f0" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={mobilePanel==="tools" ? "#fff" : "#64748b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              </svg>
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
          </div>

          {/* Mobile saved panel */}
          {showSavedPanel&&(
            <SavedPanel
              savedLocations={savedLocations} fetchSavedLocations={fetchSavedLocations}
              clearMarkersRef={clearMarkersRef} flyToRef={flyToRef}
              highlightedLocation={highlightedLocation} setHighlightedLocation={setHighlightedLocation}
              onShare={onShare} isPro={isPro} userId={userId}
              onClose={()=>setShowSavedPanel(false)}
              onLoadRoute={onLoadRoute}
              onRoutesCountChange={setSavedRoutesCount}
              mobile onMobileSelect={()=>setShowSavedPanel(false)}
              tripMode={tripMode}
              onAddWaypoint={onAddWaypoint}
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
                        { label: "Daily",    active: activeDataLayer === "sst" && dataSource === "MUR",      fn: () => { setActiveDataLayer("sst"); setDataSource("MUR"); } },
                        { label: "Hourly",   active: activeDataLayer === "sst" && dataSource === "VIIRS",    fn: () => { setActiveDataLayer("sst"); setDataSource("VIIRS"); } },
                        { label: "Comp 36h", active: activeDataLayer === "composite",                        fn: () => setActiveDataLayer("composite") },
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

                    {/* VIIRS DateNav + hour buttons */}
                    {activeDataLayer === "sst" && dataSource === "VIIRS" && viirsData?.days?.length >= 1 && (
                      <>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViirsDateIndex(i => Math.max(0, i - 1))} disabled={viirsDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-violet-700 bg-violet-50 rounded py-1 truncate">
                            {activeViirsDay?.date ?? "—"}
                          </span>
                          <button onClick={() => setViirsDateIndex(i => Math.min(viirsData.days.length - 1, i + 1))} disabled={viirsDateIndex === viirsData.days.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                        </div>
                        {activeViirsDay?.available_hours?.length > 1 && (
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
                        <button onClick={() => setMurDateIndex(i => Math.max(0, i - 1))} disabled={murDateIndex === 0}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                        <span className="flex-1 text-center text-[10px] font-semibold text-cyan-700 bg-cyan-50 rounded py-1 truncate">
                          {date ?? "—"}
                        </span>
                        <button onClick={() => setMurDateIndex(i => Math.min(murData.days.length - 1, i + 1))} disabled={murDateIndex === murData.days.length - 1}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                      </div>
                    )}

                    {/* GOES DateNav */}
                    {activeDataLayer === "sst" && dataSource === "GOESCOMP" && goesCompData?.days?.length >= 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setGoesCompDateIndex(i => Math.max(0, i - 1))} disabled={goesCompDateIndex === 0}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                        <span className="flex-1 text-center text-[10px] font-semibold text-indigo-700 bg-indigo-50 rounded py-1 truncate">
                          {activeGoesCompDay?.date ?? "—"}
                        </span>
                        <button onClick={() => setGoesCompDateIndex(i => Math.min(goesCompData.days.length - 1, i + 1))} disabled={goesCompDateIndex === goesCompData.days.length - 1}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
                      </div>
                    )}

                    {/* Temp gain */}
                    {!isWindMap && (
                      <MobileProGate isPro={isPro} label="Color gain control is available on the Pro plan.">
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide mt-1">Temp gain</div>
                        <SSTRangeControl
                          activeLayer="sst"
                          userId={userId}
                          range={sstRange}
                          onRangeChange={onSstRangeChange}
                          onApply={onSstRangeChange}
                          openRef={rangeControlOpenRef}
                        />
                      </MobileProGate>
                    )}

                    {/* Temp break */}
                    {(activeDataLayer === "sst" || activeDataLayer === "composite") && (
                      <MobileProGate isPro={isPro} label="Isotherm (temp break) overlay is available on the Pro plan.">
                        <button onClick={() => setShowIsotherm(v => !v)}
                          className={`w-full text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center gap-1.5 transition-colors ${showIsotherm ? "bg-sky-700 text-white border-sky-700" : "bg-white text-slate-600 border-slate-300"}`}>
                          <span className="text-sm leading-none">~</span> Temp break
                        </button>
                        {showIsotherm && (
                          <div className="space-y-2 px-1 pt-1">
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>Target temp</span>
                                <span className="text-sky-600 font-semibold">{effectiveTargetTemp.toFixed(1)}°F</span>
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
                                <span>Sharpness</span>
                                <span className="text-violet-600 font-semibold">{isothermalSensitivity.toFixed(1)}°F</span>
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
                  </>
                )}

                {/* ── CHL panel ──────────────────────────────────────── */}
                {mobilePanel === "chl" && (
                  <>
                    {chlData?.days?.length > 1 && (
                      <>
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Date</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setChlDateIndex(i => Math.max(0, i - 1))} disabled={chlDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-green-700 bg-green-50 rounded py-1 truncate">
                            {chlData.days[chlDateIndex]?.date ?? "—"}
                          </span>
                          <button onClick={() => setChlDateIndex(i => Math.min(chlData.days.length - 1, i + 1))} disabled={chlDateIndex === chlData.days.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
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
                    {seaColorData?.days?.length > 1 && (
                      <>
                        <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Date</div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSeaColorDateIndex(i => Math.max(0, i - 1))} disabled={seaColorDateIndex === 0}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8249;</button>
                          <span className="flex-1 text-center text-[10px] font-semibold text-teal-700 bg-teal-50 rounded py-1 truncate">
                            {seaColorData.days[seaColorDateIndex]?.date ?? "—"}
                          </span>
                          <button onClick={() => setSeaColorDateIndex(i => Math.min(seaColorData.days.length - 1, i + 1))} disabled={seaColorDateIndex === seaColorData.days.length - 1}
                            className="px-2 py-1 rounded bg-white border border-slate-300 text-slate-600 text-sm font-bold disabled:opacity-30">&#8250;</button>
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
                          <Wind className="w-3.5 h-3.5" />{windLoading ? "Loading…" : showWindOverlay ? "Overlay on" : "Overlay"}
                        </button>
                      </MobileProGate>
                      <button onClick={() => { setActiveDataLayer(isWindMap ? "sst" : "windmap"); }}
                        className={`text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${isWindMap ? "bg-sky-700 text-white border-sky-700" : "bg-white text-slate-600 border-slate-300"}`}>
                        <Wind className="w-3.5 h-3.5" />{windLoading ? "Loading…" : isWindMap ? "Wind map on" : "Wind map"}
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
                        &#x1F30A; {currentsLoading ? "Loading…" : showCurrents ? "Currents on" : "Currents overlay"}
                      </button>
                    </MobileProGate>
                  </div>
                )}

                {/* ── Altimetry panel ──────────────────────────────────────── */}
                {mobilePanel === "altimetry" && (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Altimetry</div>
                    <MobileProGate isPro={isPro} label="Sea level anomaly layer is available on the Pro plan.">
                      <button onClick={() => setActiveDataLayer(l => l === "altimetry" ? "sst" : "altimetry")}
                        className={`text-[11px] font-semibold px-3 py-2 rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${activeDataLayer === "altimetry" ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-300"}`}>
                        🌊 {activeDataLayer === "altimetry" ? "Altimetry on" : "Altimetry"}
                      </button>
                    </MobileProGate>
                  </div>
                )}

                                {/* ── Tools panel ────────────────────────────────────── */}
                {mobilePanel === "tools" && (
                  <>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wide">Fish &amp; Overlays</div>
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
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <button onClick={() => setShowBathyLayer(b => !b)}
                        className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showBathyLayer ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300"}`}>
                        {jsonContoursLoading ? "Loading…" : "Bathy"}
                      </button>
                      <MobileProGate isPro={isPro} label="Bottom Features are available on the Pro plan.">
                        <button onClick={() => setShowWrecks(w => !w)}
                          className={`text-[11px] font-semibold py-2 rounded-lg border transition-colors ${showWrecks ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-300"}`}>
                          {wrecksLoading ? "Loading…" : "Bottom Features"}
                        </button>
                      </MobileProGate>
                    </div>
                  </>
                )}

              </div>
            </div>
          )}

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

          {hoveredWreck&&(<div className="absolute bg-white border border-amber-300 rounded-lg px-2.5 py-2 text-xs shadow-lg min-w-40 pointer-events-none" style={{left:hoveredWreck.px+12,top:hoveredWreck.py-10,zIndex:700}}><div className="text-amber-600 font-semibold mb-1">Wreck: {hoveredWreck.props.name||hoveredWreck.props.symbol||"Unknown"}</div><div className="text-slate-500 text-[10px]">{hoveredWreck.props.symbol}</div>{hoveredWreck.props.depth_ft!=null&&<div className="text-blue-600 font-medium">{Math.round(hoveredWreck.props.depth_ft)} ft / {Math.round(hoveredWreck.props.depth_ft/6)} fth</div>}{hoveredWreck.props.year_sunk&&<div className="text-slate-500">Sunk: {hoveredWreck.props.year_sunk}</div>}</div>)}

          {clickInfo && (
            <MapClickInfo info={clickInfo} date={date} userId={userId} onClose={() => setClickInfo(null)}
              onSaved={info => {
                setMarkers(m => [...m, { lat:info.lat, lon:info.lon, sst:info.sst, depth_ft:info.depth_ft, label:info.label, notes:info.notes ?? null, id:info.id, dist_nm:info.dist, bearing_deg:info.bearing != null ? Math.round(info.bearing) : null, bearing_cardinal:info.bearing != null ? bearingLabel(info.bearing) : null, from_location:info.locationLabel }]);
                setSavedWreckKeys(s => new Set([...s, `${info.lat}_${info.lon}`]));
                onLocationSaved(); setClickInfo(null);
              }}/>
          )}

          {selectedMarker && (() => {
            const mk = selectedMarker.mk;
            const lat = parseFloat(mk.lat), lon = parseFloat(mk.lon);
            const POPUP_W = 220, POPUP_H = 200;
            const mapW = mapDivRef.current?.clientWidth ?? 800, mapH = mapDivRef.current?.clientHeight ?? 600;
            const rawL = selectedMarker.px + 14;
            const popLeft = rawL + POPUP_W > mapW - 8 ? selectedMarker.px - POPUP_W - 14 : rawL;
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
            <ShareLocationDialog location={shareLocation} userId={userId} onClose={() => setShareLocation(null)}
              onNotesUpdated={(id, newNotes) => { onNotesUpdated?.(id, newNotes); }}
              heatmapData={data} sstMin={sstMin} sstMax={sstMax} sstRange={sstRange}/>
          )}

          {/* Desktop saved panel */}
          {showSavedPanel?(
            <SavedPanel
              savedLocations={savedLocations} fetchSavedLocations={fetchSavedLocations}
              clearMarkersRef={clearMarkersRef} flyToRef={flyToRef}
              highlightedLocation={highlightedLocation} setHighlightedLocation={setHighlightedLocation}
              onShare={onShare} isPro={isPro} userId={userId}
              onClose={()=>setShowSavedPanel(false)}
              onLoadRoute={onLoadRoute}
              onRoutesCountChange={setSavedRoutesCount}
              sliderHeight={sliderHeight}
              tripMode={tripMode}
              onAddWaypoint={onAddWaypoint}
              className="hidden sm:flex"
            />
          ):(
            <button onClick={()=>setShowSavedPanel(true)} className="hidden sm:flex absolute left-2 bg-white border border-slate-200 rounded-full shadow-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 items-center gap-1.5" style={{bottom:sliderHeight+8,zIndex:900}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
              <span>{(savedLocations?.length??0) + savedRoutesCount} saved</span>
            </button>
          )}

          {windActive&&windData?.hours?.length>0&&isDesktop&&(
            <WindTimeSlider windData={windData} windHourIndex={windHourIndex} setWindHourIndex={setWindHourIndex} isPlaying={windPlaying} setIsPlaying={setWindPlaying} isWindMap={isWindMap}/>
          )}

          {isWindMap && (
            <div className="sm:hidden absolute left-0 right-0 px-2" style={{ bottom: 64, zIndex: 600, pointerEvents: "none" }}>
              <WindLegend isWindMap={true} />
            </div>
          )}

          <div className="sm:hidden absolute left-0 right-0 px-2" style={{ bottom: 64, zIndex: 600, pointerEvents: "auto" }}>
            {isWindMap
              ? null
              : activeDataLayer === "chlorophyll"
              ? <MobileGradientBar
                  gradient={CHL_GRADIENT} label="Chlorophyll" unit=" µg/L" logScale
                  lo={sstRange?.min ?? (chlData?.days?.[chlDateIndex]?.stats?.min ?? 0.01)}
                  hi={sstRange?.max ?? (chlData?.days?.[chlDateIndex]?.stats?.max ?? 10)}
                  hoverVal={hoverInfo?.chl}
                  onBarClick={() => rangeControlOpenRef?.current?.()}/>
              : activeDataLayer === "seacolor"
              ? <MobileGradientBar
                  gradient={KD_GRADIENT} label="Kd490" unit=" m⁻¹"
                  lo={sstRange?.min ?? (seaColorData?.days?.[seaColorDateIndex]?.stats?.min ?? 0.01)}
                  hi={sstRange?.max ?? (seaColorData?.days?.[seaColorDateIndex]?.stats?.max ?? 0.50)}
                  hoverVal={hoverInfo?.kd490}
                  onBarClick={() => rangeControlOpenRef?.current?.()}/>
              : <SSTLegend sstMin={sstMin} sstMax={sstMax} hoverSst={legendHoverSst} rangeMin={sstRange?.min} rangeMax={sstRange?.max} onClick={() => rangeControlOpenRef?.current?.()}/>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
