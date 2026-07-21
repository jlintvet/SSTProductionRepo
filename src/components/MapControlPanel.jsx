/**
 * MapControlPanel.jsx
 */

import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { ChevronDown } from "lucide-react";
import SSTRangeControl from "@/components/SSTRangeControl";

// ── ProGate ───────────────────────────────────────────────────────────────────
function ProGate({ isPro, children, label }) {
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (!e.target.closest("[data-progate-popup]")) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleClick(e) {
    e.stopPropagation();
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setPopupPos({ top: r.top + window.scrollY - 10, left: r.left + r.width / 2 });
    }
    setOpen(o => !o);
  }

  if (isPro) return <>{children}</>;

  const popup = open && ReactDOM.createPortal(
    <div data-progate-popup="1" style={{
      position: "fixed", zIndex: 99999,
      top: popupPos.top, left: popupPos.left,
      transform: "translate(-50%, -100%)",
      background: "#fff", borderRadius: 12,
      boxShadow: "0 8px 32px rgba(0,0,0,0.22)",
      padding: "1.1rem 1.25rem", minWidth: 220,
      textAlign: "center", border: "1px solid #e2e8f0",
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>Pro Feature</div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
        {label || "This feature is available on the Pro plan."}
      </div>
      <a href="/" style={{ display: "inline-block", background: "#0e7490", color: "#fff",
        borderRadius: 8, padding: "6px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
        onClick={() => setOpen(false)}>
        Upgrade to Pro — $69/yr
      </a>
      <button onClick={() => setOpen(false)} style={{ display: "block", margin: "8px auto 0",
        background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
        Dismiss
      </button>
    </div>,
    document.body
  );

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>{children}</div>
      <div onClick={handleClick} style={{ position: "absolute", inset: 0, cursor: "pointer", zIndex: 5 }} title="Available in Pro" />
      <span onClick={handleClick} style={{
        position: "absolute", top: 2, right: 2, background: "#f59e0b", color: "#fff",
        borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 5px",
        cursor: "pointer", zIndex: 10, letterSpacing: 0.5, whiteSpace: "nowrap",
      }}>PRO</span>
      {popup}
    </div>
  );
}

// ── Help content config ───────────────────────────────────────────────────────
const HELP_CONFIG = {
  sst:         { title: "Sea Surface Temperature (SST)", image: "/help/sst.png",        text: "SST shows ocean surface water temperature. Warmer water (reds/yellows) holds bait and attracts pelagics. Use Cloud Free (MUR) for the clearest gap-filled picture, Hourly (VIIRS) for the most recent passes, or HD Composite to gap-fill cloud cover." },
  chlorophyll: { title: "Chlorophyll",                   image: "/chl_ref_point.png",   text: "Chlorophyll concentration indicates biological productivity — greener water has more phytoplankton, which means more bait. The edge between high- and low-chl water often holds mahi, wahoo, and tuna. Adjust the gain to stretch or compress the color scale for your area." },
  seacolor:    { title: "Sea Color / Kd490",             image: "/help/seacolor.png",   text: "Kd490 measures water clarity. Cleaner, bluer water has lower Kd490. The boundary between turbid and clear water is a productive fishing zone, especially for mahi and tuna following the color change." },
  altimetry:   { title: "Altimetry (Sea Level Anomaly)", image: "/altimetry_ref.png",   text: "Altimetry comes from satellite radar that detects extremely small changes in ocean surface height and turns them into a contour map. Raised areas (dark blue, light blue, green) mark spots where deep water is welling up toward the surface, bringing nutrients and bait with it. Lower areas (yellow, orange, red) mark spots where surface water is sinking, leaving less for baitfish to feed on. Dark blue is your top pick, light blue and green are still worth a look, and yellow, orange, or red areas are best skipped. Updated daily. Contour lines are drawn every 5cm (about 2 inches), with numbered lines every 10cm." },
  windmap:     { title: "Wind Map",                      image: "/help/windmap.png",    text: "The wind map shows surface wind speed and direction from the GFS model. Strong offshore winds push surface water and can affect sea state and bait positioning. Use this to gauge conditions before heading out." },
  isotherm:    { title: "Temp Break",                    image: "/help/isotherm.png",   text: "The temp break tool highlights the target isotherm — set the temperature and sharpness to isolate the thermal gradient you want to fish. Fish stack up along sharp temp breaks, especially yellowfin and blue marlin. Lower sharpness to see a broader gradient band." },
  hotspots:    { title: "Fish Hot Spots",                image: "/help/hotspots.png",   text: "AI-scored locations based on SST gradients, chlorophyll, currents, and bottom structure. Select a target species to tune the model for that fish's preferred conditions. Scores are computed daily and vary with data freshness." },
  windoverlay: { title: "Wind Overlay",                  image: "/help/windoverlay.png",text: "Animated wind arrows overlaid directly on the map. Shows real-time GFS wind direction and speed over the water. Useful for judging sea conditions at any point on the map." },
  currents:    { title: "Ocean Currents",                image: "/help/currents.png",   text: "Ocean current vectors from OSCAR (5-day lag). Shows water flow direction and speed. Current edges and convergence zones concentrate bait and attract pelagics. The Gulf Stream and its eddies appear clearly." },
  trip:        { title: "Plan Trip",                     image: "/trip_plan_ref.png",   text: "Drop waypoints on the map to plan a route. Distance and bearing are calculated automatically between each leg. Tap a waypoint to rename or delete it. Routes can be saved and shared." },
  gps:         { title: "Real-Time GPS",                 image: "/help/gps.png",        text: "Tracks your vessel position on the map using the device GPS. Position updates every few seconds. Enable this at the dock and your track will build as you run." },
  bathy:       { title: "Bathymetry Contours",           image: "/help/bathy.png",      text: "NOAA bathymetric contours in fathoms. Depth contours reveal the shelf, shelf edge, canyons, and drop-offs where fish concentrate. The 100-fathom curve is the classic mahi and wahoo zone; deeper canyons hold tuna and marlin." },
  radar:       { title: "Radar",              image: "/help/radar.png",      text: "Live Doppler radar showing rain and storm activity near the region. Data refreshes roughly every 10 minutes." },
  shadedrelief:{ title: "Shaded Relief",                  image: "/help/bathy.png",      text: "Full-color bathymetric relief from NOAA hydrographic survey data. Depth is shown with a nautical color gradient, with topographic shading revealing canyon walls, shelf-edge structure, and seafloor terrain not visible in standard contour lines." },
  altoverlay:  { title: "SLA Overlay",                   image: "/altimetry_ref.png",   text: "Adds surface-height contour lines on top of whichever layer you're viewing, so you can cross-reference eddies against temperature or chlorophyll. Dark blue areas are the strongest upwelling and the best bet; light blue and green are decent; yellow, orange, and red mean sinking water with little to offer. Updated daily. Contour lines are drawn every 5cm (about 2 inches), with numbered lines every 10cm." },
  bottomfeat:  { title: "Bottom Features",               image: "/help/bottomfeat.png", text: "Wrecks, reefs, rock piles, and hard bottom from NOAA charts. Bottom structure concentrates bait and holds amberjack, grouper, cobia, and sharks. Many offshore wrecks also attract pelagics when the conditions are right." },
  loran:       { title: "About Loran-C",                  image: "/loran_ref_point.png", text: "" },
  community:   { title: "Community Pins",                image: "/help/community.png",  text: "Community pins show catch reports and live fish activity posted by other anglers. Lime green pins are live (48h) and pulse while active; after 48h they turn blue like a regular catch report. All pins stay visible for 7 days total. Click any pin to see details and tip the poster." },
  labels:      { title: "Map Labels",                    image: "/help/labels.png",     text: "Shows canyon names and geographic feature labels on the map. Labels scale with zoom level and display the names of major offshore canyons, ridges, and banks." },
  weatherbuoys:{ title: "Weather Buoys",                 image: "/help/buoys.png",      text: "Live observations from NOAA NDBC buoys — wind, gusts, waves, water and air temperature, and pressure. Only buoys within range of your selected departure are shown; tap one for the latest reading and how long ago it was observed. Refreshes about every 15 minutes." },
};

// ── Tiny helpers ───────────────────────────────────────────────────────────────

function SectionHeader({ title, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
      style={{ background: "none", border: "none", cursor: "pointer" }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">{title}</span>
      <ChevronDown
        className="w-3 h-3 text-slate-400 transition-transform duration-150"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
      />
    </button>
  );
}

function LayerBtn({ active, onClick, color = "cyan", children, style }) {
  const activeColors = {
    cyan:   "bg-cyan-600 text-white border-cyan-600",
    green:  "bg-green-600 text-white border-green-600",
    teal:   "bg-teal-600 text-white border-teal-600",
    sky:    "bg-sky-600 text-white border-sky-600",
    slate:  "bg-slate-700 text-white border-slate-700",
    violet: "bg-violet-600 text-white border-violet-600",
    amber:  "bg-amber-600 text-white border-amber-600",
    blue:   "bg-blue-600 text-white border-blue-600",
    indigo: "bg-indigo-600 text-white border-indigo-600",
  };
  return (
    <button
      onClick={onClick}
      style={style}
      className={`w-full flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg border text-left transition-colors ${
        active ? activeColors[color] ?? activeColors.cyan : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function SubSourceBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-[10px] font-medium px-2 py-1 rounded-md border transition-colors ${
        active ? "bg-cyan-50 text-cyan-700 border-cyan-300 font-semibold" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function ToolBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg border text-left transition-colors ${
        active ? "bg-cyan-700 text-white border-cyan-700" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 mx-0" />;
}

// ── Fish species selector ──────────────────────────────────────────────────────
const FISH_SPECIES = [
  { key: "yellowfin",    label: "Yellowfin", color: "#fafbfc" },
  { key: "mahi",         label: "Mahi",       color: "#10b981" },
  { key: "wahoo",        label: "Wahoo",      color: "#3b82f6" },
  { key: "blue_marlin",  label: "Marlin",     color: "#0ea5e9" },
  // Temporarily hidden in the UI per request — backend scoring is unchanged.
  // Re-enable by uncommenting:
  // { key: "bluefin",      label: "Bluefin",    color: "#6366f1" },
  // { key: "kingfish",     label: "Kingfish",   color: "#ef4444" },
  // { key: "white_marlin", label: "W. Marlin",  color: "#8b5cf6" },
];

// ── Isotherm sub-controls ──────────────────────────────────────────────────────
function IsothermSubControls({ targetTemp, onTargetTemp, sensitivity, onSensitivity, sstMin, sstMax }) {
  const clamped = Math.max(sstMin, Math.min(sstMax, targetTemp));
  return (
    <div className="flex flex-col gap-2 px-1 pt-1">
      <div>
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[10px] text-slate-500">Target temp</span>
          <span className="text-[10px] font-semibold text-sky-600 tabular-nums">{clamped.toFixed(1)}°F</span>
        </div>
        <input
          type="range" min={Math.floor(sstMin)} max={Math.ceil(sstMax)} step={0.5}
          value={clamped} onChange={e => onTargetTemp(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-sky-500"
        />
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
          <span>{Math.floor(sstMin)}°F</span><span>{Math.ceil(sstMax)}°F</span>
        </div>
      </div>
      <div>
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[10px] text-slate-500">Sharpness</span>
          <span className="text-[10px] font-semibold text-cyan-600 tabular-nums">{sensitivity.toFixed(1)}°F</span>
        </div>
        <input
          type="range" min={0.5} max={8} step={0.5}
          value={sensitivity} onChange={e => onSensitivity(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-cyan-500"
        />
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
          <span>← sharp only</span><span>all →</span>
        </div>
      </div>
    </div>
  );
}

// ── Date navigator ─────────────────────────────────────────────────────────────
function DateNav({ label, onPrev, onNext, disablePrev, disableNext, color = "cyan", onPlay, playing }) {
  const labelColors = {
    cyan:   "text-cyan-700 bg-cyan-50",
  };
  return (
    <div className="flex items-center gap-1 mt-1">
      <button onClick={onPrev} disabled={disablePrev}
        className="px-1.5 py-1 rounded bg-white border border-slate-300 text-slate-600 text-xs font-bold disabled:opacity-30">
        &#8249;
      </button>
      <span className={`flex-1 text-center text-[10px] font-semibold rounded py-1 truncate ${labelColors[color] ?? labelColors.cyan}`}>
        {label}
      </span>
      <button onClick={onNext} disabled={disableNext}
        className="px-1.5 py-1 rounded bg-white border border-slate-300 text-slate-600 text-xs font-bold disabled:opacity-30">
        &#8250;
      </button>
      {onPlay && (
        <button onClick={onPlay}
          className="px-1.5 py-1 rounded bg-white border border-slate-300 text-slate-600 text-xs font-bold">
          {playing ? "||" : ">"}
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MapControlPanel({
  // mode
  interactionMode, setInteractionMode,
  // layers
  activeDataLayer, setActiveDataLayer,
  dataSource, setDataSource,
  compositeData, compositeGenerated, compositeDateIndex, setCompositeDateIndex, compositeDates,
  // SST sources
  viirsData, viirsDateIndex, setViirsDateIndex, viirsHour, setViirsHour,
  murData, murDateIndex, setMurDateIndex,
  goesCompData, goesCompDateIndex, setGoesCompDateIndex, activeGoesCompDay,
  activeViirsNppDay, viirsNppData, viirsNppDateIndex, setViirsNppDateIndex,
  // layer-specific loading
  chlData, chlDateIndex, setChlDateIndex, chlLoading, chlSource, setChlSource,
  chlCompositeDates, chlCompositeDateIndex, setChlCompositeDateIndex,
  seaColorData, seaColorDateIndex, setSeaColorDateIndex, seaColorLoading, seaColorSource, setSeaColorSource,
  seaColorCompositeDates, seaColorCompositeDateIndex, setSeaColorCompositeDateIndex,
  windLoading,
  date,
  // gain / range
  sstRange, onSstRangeChange, userId, rangeControlOpenRef, chlDataMin, chlDataMax, seaColorDataMin, seaColorDataMax,
  seasonalSstDefault,
  // tools
  showIsotherm, setShowIsotherm,
  isothermalTargetTemp, setIsothermalTargetTemp,
  isothermalSensitivity, setIsothermalSensitivity,
  effectiveTargetTemp, sstMin, sstMax,
  showHotspots, setShowHotspots,
  hotspotLoading,
  selectedFishSpecies, setSelectedFishSpecies,
  showWindOverlay, setShowWindOverlay,
  currentsLoading, showCurrents, setShowCurrents,
  showAltimetryOverlay, setShowAltimetryOverlay,
  altimetryDates, altimetryDateIndex, setAltimetryDateIndex, altimetryPlaying, setAltimetryPlaying,
  sstPlaying, setSstPlaying,
  chlPlaying, setChlPlaying,
  seaColorPlaying, setSeaColorPlaying,
  // overlays
  showBathyLayer, setShowBathyLayer,
  showBathyRaster, setShowBathyRaster,
  jsonContoursLoading,
  showWrecks, setShowWrecks,
  wrecksLoading,
  showBuoys, setShowBuoys, buoysLoading,
  showCanyonLabels, setShowCanyonLabels,
  showRadarOverlay, setShowRadarOverlay,
  showLoranGrid, setShowLoranGrid,
  showLoranWFamily, setShowLoranWFamily,
  regionKey,
  // tier
  isPro,
  // trip planning
  tripMode, onToggleTripMode,
  gpsActive, onToggleGps,
  // departure
  selectedLocation,
  // collapsed state
  collapsed, setCollapsed,
  // wind slider height — reduces panel maxHeight when slider is visible
  windSliderHeight,
  // panel hover callbacks
  onPointerEnter, onPointerLeave, panelRef,
  // community reports
  showCommunityLayer, setShowCommunityLayer,
  communityAccess,
  communityCount,
  onOpenLeaderboard,
  onDropLivePin,
  onPostReport,
}) {
  const [openSections, setOpenSections] = useState({
    layers:    true,
    gain:      true,
    overlays:  true,
    tools:     true,
    community: true,
  });
  const [helpOpen, setHelpOpen] = useState(null);

  // ? button helper — toggles modal for the given help key
  const hbtn = (id) => (
    <button
      onClick={() => setHelpOpen(o => o === id ? null : id)}
      className={`w-[22px] h-[22px] flex items-center justify-center rounded border text-[11px] font-bold transition-colors flex-shrink-0 ${
        helpOpen === id
          ? "bg-slate-200 border-slate-400 text-slate-700"
          : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"
      }`}
      title="Help">?</button>
  );

  function toggleSection(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  const isWindMap   = activeDataLayer === "windmap";
  const isSST       = activeDataLayer === "sst";
  const isComposite = activeDataLayer === "composite";
  const isSSTGroup  = isSST || isComposite;
  const isCHL       = activeDataLayer === "chlorophyll";
  // Format any date string (ISO "2026-06-22" or YYYYMMDD "20260622") → "Jun 22"
  const fmtDate = s => {
    if (!s) return "—";
    if (/^\d{8}$/.test(s)) {
      const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${mo[parseInt(s.slice(4,6),10)-1]} ${parseInt(s.slice(6,8),10)}`;
    }
    try { return new Date(s.includes("T") ? s : s+"T12:00:00Z").toLocaleString("en-US",{month:"short",day:"numeric",timeZone:"America/New_York"}); }
    catch { return s; }
  };
  const isSC        = activeDataLayer === "seacolor";
  const isAlt       = activeDataLayer === "altimetry";
  const showGain    = !isWindMap && !isAlt && !showBathyRaster && !showRadarOverlay;

  const gainLabel = isSSTGroup ? "Temp gain" : isCHL ? "CHL gain" : isSC ? "Kd490 gain" : "Gain";

  const activeViirsDay = viirsData?.days?.[viirsDateIndex] ?? null;

  if (collapsed) return null;

  return (
    <div
      ref={panelRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="hidden sm:flex flex-col bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl shadow-md overflow-hidden"
      style={{
        width: 160,
        maxHeight: `calc(100% - ${16 + (windSliderHeight || 0)}px)`,
        position: "absolute",
        right: 8,
        top: 8,
        zIndex: 500,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-slate-100">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Controls</span>
        <button
          onClick={() => setCollapsed(true)}
          title="Hide controls"
          className="flex items-center justify-center rounded-md hover:bg-slate-100 transition-colors"
          style={{ width: 20, height: 20, padding: 0 }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M8.5 2L4.5 6L8.5 10" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Mode ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-2">
        <button
          onClick={() => setInteractionMode("pan")}
          className={`flex-1 flex items-center justify-center text-[11px] font-semibold py-1.5 rounded-lg border transition-colors ${
            interactionMode === "pan"
              ? "bg-slate-700 text-white border-slate-700"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >Pan</button>
        <button
          onClick={() => setInteractionMode("crosshair")}
          className={`flex-1 flex items-center justify-center text-[11px] font-semibold py-1.5 rounded-lg border transition-colors ${
            interactionMode === "crosshair"
              ? "bg-cyan-600 text-white border-cyan-600"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >Inspect</button>
      </div>

      <Divider />

      {/* ── Data layer ────────────────────────────────────────────────── */}
      <SectionHeader title="Sources" open={openSections.layers} onToggle={() => toggleSection("layers")} />
      {openSections.layers && (
        <div className="flex flex-col gap-1 px-2 pb-2">

          <div className="flex gap-1 items-stretch">
            <div className="flex-1"><LayerBtn active={isSSTGroup} color="cyan" onClick={() => { setActiveDataLayer("sst"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>SST</LayerBtn></div>
            {hbtn("sst")}
          </div>

          {isSSTGroup && (
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-slate-200 ml-1">
              <SubSourceBtn active={isSST && dataSource === "MUR"} onClick={() => { setActiveDataLayer("sst"); setDataSource("MUR"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>Cloud Free</SubSourceBtn>
              <SubSourceBtn active={isSST && dataSource === "VIIRS"} onClick={() => { setActiveDataLayer("sst"); setDataSource("VIIRS"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>Hourly</SubSourceBtn>
              <SubSourceBtn active={isComposite} onClick={() => { setActiveDataLayer("composite"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>HD Composite</SubSourceBtn>

              {isComposite && compositeData && (
                compositeDates?.length >= 1 ? (
                  <DateNav
                    label={compositeDates[compositeDateIndex] ?? "—"} color="cyan"
                    onPrev={() => { setSstPlaying(false); setCompositeDateIndex(i => Math.max(0, i - 1)); }}
                    onNext={() => { setSstPlaying(false); setCompositeDateIndex(i => Math.min(compositeDates.length - 1, i + 1)); }}
                    disablePrev={compositeDateIndex === 0}
                    disableNext={compositeDateIndex === compositeDates.length - 1}
                    onPlay={() => setSstPlaying(v => !v)} playing={sstPlaying}
                  />
                ) : (
                  <div className="text-[10px] text-cyan-700 bg-cyan-50 rounded px-2 py-1 text-center font-semibold mt-1">
                    {compositeData.generated
                      ? new Date(compositeData.generated).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "America/New_York" })
                      : "Latest composite"}
                  </div>
                )
              )}

              {isSST && dataSource === "VIIRS" && viirsData?.days?.length >= 1 && (
                <>
                  <DateNav
                    label={fmtDate(activeViirsDay?.date)} color="cyan"
                    onPrev={() => { setSstPlaying(false); setViirsDateIndex(i => Math.max(0, i - 1)); }}
                    onNext={() => { setSstPlaying(false); setViirsDateIndex(i => Math.min(viirsData.days.length - 1, i + 1)); }}
                    disablePrev={viirsDateIndex === 0}
                    disableNext={viirsDateIndex === viirsData.days.length - 1}
                    onPlay={() => setSstPlaying(v => !v)} playing={sstPlaying}
                  />
                  {activeViirsDay?.available_hours?.length >= 1 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {activeViirsDay.available_hours.map(h => {
                        const label = (() => {
                          const d = new Date(new Date(`${activeViirsDay.date}T${String(h).padStart(2, "0")}:00:00Z`).toLocaleString("en-US", { timeZone: "America/New_York" }));
                          const hr = d.getHours();
                          return hr === 0 ? "12am" : hr < 12 ? `${hr}am` : hr === 12 ? "12pm" : `${hr - 12}pm`;
                        })();
                        return (
                          <button key={h} onClick={() => setViirsHour(h)}
                            className={`flex-1 text-[9px] font-semibold px-1 py-0.5 rounded border transition-colors ${
                              viirsHour === h ? "bg-cyan-600 text-white border-cyan-500" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                            }`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              {isSST && dataSource === "MUR" && murData?.days?.length >= 1 && (
                <DateNav
                  label={fmtDate(date)} color="cyan"
                  onPrev={() => { setSstPlaying(false); setMurDateIndex(i => Math.max(0, i - 1)); }}
                  onNext={() => { setSstPlaying(false); setMurDateIndex(i => Math.min(murData.days.length - 1, i + 1)); }}
                  disablePrev={murDateIndex === 0}
                  disableNext={murDateIndex === murData.days.length - 1}
                  onPlay={() => setSstPlaying(v => !v)} playing={sstPlaying}
                />
              )}
              {isSST && dataSource === "GOESCOMP" && goesCompData?.days?.length >= 1 && (
                <DateNav
                  label={fmtDate(activeGoesCompDay?.date)} color="cyan"
                  onPrev={() => { setSstPlaying(false); setGoesCompDateIndex(i => Math.max(0, i - 1)); }}
                  onNext={() => { setSstPlaying(false); setGoesCompDateIndex(i => Math.min(goesCompData.days.length - 1, i + 1)); }}
                  disablePrev={goesCompDateIndex === 0}
                  disableNext={goesCompDateIndex === goesCompData.days.length - 1}
                  onPlay={() => setSstPlaying(v => !v)} playing={sstPlaying}
                />
              )}
            </div>
          )}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <LayerBtn active={isCHL} color="cyan" onClick={() => { setActiveDataLayer("chlorophyll"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>
                {chlLoading ? "Loading…" : "Chlorophyll"}
              </LayerBtn>
            </div>
            {hbtn("chlorophyll")}
          </div>
          {isCHL && (
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-slate-200 ml-1">
              <SubSourceBtn active={chlSource === "daily"} onClick={() => setChlSource("daily")}>Daily</SubSourceBtn>
              <SubSourceBtn active={chlSource === "composite"} onClick={() => setChlSource("composite")}>HD Composite</SubSourceBtn>
              {chlSource === "daily" && chlData?.days?.length > 1 && (
                <DateNav
                  label={fmtDate(chlData.days[chlDateIndex]?.date)} color="cyan"
                  onPrev={() => { setChlPlaying(false); setChlDateIndex(i => Math.max(0, i - 1)); }}
                  onNext={() => { setChlPlaying(false); setChlDateIndex(i => Math.min(chlData.days.length - 1, i + 1)); }}
                  disablePrev={chlDateIndex === 0}
                  disableNext={chlDateIndex === chlData.days.length - 1}
                  onPlay={() => setChlPlaying(v => !v)} playing={chlPlaying}
                />
              )}
              {chlSource === "composite" && chlCompositeDates?.length > 0 && (
                <DateNav
                  label={fmtDate(chlCompositeDates[chlCompositeDateIndex])}
                  color="cyan"
                  onPrev={() => { setChlPlaying(false); setChlCompositeDateIndex(i => Math.max(0, i - 1)); }}
                  onNext={() => { setChlPlaying(false); setChlCompositeDateIndex(i => Math.min(chlCompositeDates.length - 1, i + 1)); }}
                  disablePrev={chlCompositeDateIndex === 0}
                  disableNext={chlCompositeDateIndex >= chlCompositeDates.length - 1}
                  onPlay={() => setChlPlaying(v => !v)} playing={chlPlaying}
                />
              )}
            </div>
          )}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <LayerBtn active={isSC} color="cyan" onClick={() => { setActiveDataLayer("seacolor"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>
                {seaColorLoading ? "Loading…" : "Sea color"}
              </LayerBtn>
            </div>
            {hbtn("seacolor")}
          </div>
          {isSC && (
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-slate-200 ml-1">
              <SubSourceBtn active={seaColorSource === "daily"} onClick={() => setSeaColorSource("daily")}>Daily</SubSourceBtn>
              <SubSourceBtn active={seaColorSource === "composite"} onClick={() => setSeaColorSource("composite")}>HD Composite</SubSourceBtn>
              {seaColorSource === "daily" && seaColorData?.days?.length > 1 && (
                <DateNav
                  label={fmtDate(seaColorData.days[seaColorDateIndex]?.date)} color="cyan"
                  onPrev={() => { setSeaColorPlaying(false); setSeaColorDateIndex(i => Math.max(0, i - 1)); }}
                  onNext={() => { setSeaColorPlaying(false); setSeaColorDateIndex(i => Math.min(seaColorData.days.length - 1, i + 1)); }}
                  disablePrev={seaColorDateIndex === 0}
                  disableNext={seaColorDateIndex === seaColorData.days.length - 1}
                  onPlay={() => setSeaColorPlaying(v => !v)} playing={seaColorPlaying}
                />
              )}
              {seaColorSource === "composite" && seaColorCompositeDates?.length > 0 && (
                <DateNav
                  label={fmtDate(seaColorCompositeDates[seaColorCompositeDateIndex])}
                  color="cyan"
                  onPrev={() => { setSeaColorPlaying(false); setSeaColorCompositeDateIndex(i => Math.max(0, i - 1)); }}
                  onNext={() => { setSeaColorPlaying(false); setSeaColorCompositeDateIndex(i => Math.min(seaColorCompositeDates.length - 1, i + 1)); }}
                  disablePrev={seaColorCompositeDateIndex === 0}
                  disableNext={seaColorCompositeDateIndex >= seaColorCompositeDates.length - 1}
                  onPlay={() => setSeaColorPlaying(v => !v)} playing={seaColorPlaying}
                />
              )}
            </div>
          )}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <LayerBtn active={isAlt} color="cyan" onClick={() => { setActiveDataLayer("altimetry"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>
                Altimetry
              </LayerBtn>
            </div>
            {hbtn("altimetry")}
          </div>
          {isAlt && altimetryDates?.length > 1 && (
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-slate-200 ml-1">
              <DateNav
                label={fmtDate(altimetryDates[altimetryDateIndex])}
                color="cyan"
                onPrev={() => { setAltimetryPlaying(false); setAltimetryDateIndex(i => Math.max(0, i-1)); }}
                onNext={() => { setAltimetryPlaying(false); setAltimetryDateIndex(i => Math.min(altimetryDates.length-1, i+1)); }}
                disablePrev={altimetryDateIndex === 0}
                disableNext={altimetryDateIndex >= altimetryDates.length-1}
                onPlay={() => setAltimetryPlaying(v => !v)} playing={altimetryPlaying}
              />
            </div>
          )}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <LayerBtn active={isWindMap} color="cyan" onClick={() => { setActiveDataLayer("windmap"); setShowBathyRaster(false); setShowRadarOverlay(false); }}>
                {windLoading ? "Loading…" : "Wind"}
              </LayerBtn>
            </div>
            {hbtn("windmap")}
          </div>

        </div>
      )}

      <Divider />



      {/* ── Gain / Range ──────────────────────────────────────────── */}
      {showGain && (
        <>
          <SectionHeader title={gainLabel} open={openSections.gain} onToggle={() => toggleSection("gain")} />
          {openSections.gain && (
            <div className="px-2 pb-2">
              <SSTRangeControl
                activeLayer={isSSTGroup ? "sst" : isCHL ? "chlorophyll" : "seacolor"}
                userId={userId}
                range={sstRange}
                onRangeChange={onSstRangeChange}
                openRef={rangeControlOpenRef}
                dataMin={isCHL ? chlDataMin : isSC ? seaColorDataMin : undefined}
                dataMax={isCHL ? chlDataMax : isSC ? seaColorDataMax : undefined}
                seasonalDefault={isSSTGroup ? seasonalSstDefault : undefined}
              />
            </div>
          )}
          <Divider />
        </>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────── */}
      <SectionHeader title="Overlays" open={openSections.overlays} onToggle={() => toggleSection("overlays")} />
      {openSections.overlays && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ToolBtn active={showBathyLayer} color="blue" onClick={() => setShowBathyLayer(b => !b)}>
                {jsonContoursLoading ? "Loading…" : "Bathymetry"}
              </ToolBtn>
            </div>
            {hbtn("bathy")}
          </div>


          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Ocean current overlay is available on the Pro plan.">
                <ToolBtn active={showCurrents} color="cyan" onClick={() => setShowCurrents(v => !v)}>
                  {currentsLoading ? "Loading…" : "Currents"}
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("currents")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Altimetry overlay is available on the Pro plan.">
                <ToolBtn active={showAltimetryOverlay} color="violet" onClick={() => setShowAltimetryOverlay(v => !v)}>
                  Altimetry
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("altoverlay")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Loran-C grid is available on the Pro plan.">
                <ToolBtn active={showLoranGrid} color="slate" onClick={() => setShowLoranGrid(v => !v)}>
                  Loran Grid
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("loran")}
          </div>
          {showLoranGrid && regionKey === "mid_atlantic" && (
            <div className="flex gap-1 items-stretch">
              <div className="flex-1">
                <button onClick={() => setShowLoranWFamily(v => !v)}
                  className={`w-full text-[11px] font-semibold px-2 py-1.5 rounded-lg border text-left transition-colors ${
                    showLoranWFamily ? "bg-amber-700 text-white border-amber-700" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}>
                  Show W Lines (full grid)
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ToolBtn active={showCommunityLayer} color="emerald" onClick={() => setShowCommunityLayer?.(v => !v)}>
                {showCommunityLayer ? `Community (${communityCount ?? 0})` : "Community"}
              </ToolBtn>
            </div>
            {hbtn("community")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ToolBtn active={showCanyonLabels} color="indigo" onClick={() => setShowCanyonLabels?.(v => !v)}>
                Labels
              </ToolBtn>
            </div>
            {hbtn("labels")}
          </div>

          {!isWindMap && (
            <div className="flex gap-1 items-stretch">
              <div className="flex-1">
                <ProGate isPro={isPro} label="Wind overlay on the map is available on the Pro plan.">
                  <ToolBtn active={showWindOverlay} color="cyan" onClick={() => setShowWindOverlay(v => !v)}>
                    {windLoading ? "Loading…" : "Wind overlay"}
                  </ToolBtn>
                </ProGate>
              </div>
              {hbtn("windoverlay")}
            </div>
          )}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ToolBtn active={showBuoys} color="amber" onClick={() => setShowBuoys?.(v => !v)}>
                {buoysLoading ? "Loading…" : "Weather Buoys"}
              </ToolBtn>
            </div>
            {hbtn("weatherbuoys")}
          </div>
        </div>
      )}

      <Divider />

      {/* ── Tools ─────────────────────────────────────────────────────── */}
      <SectionHeader title="Tools" open={openSections.tools} onToggle={() => toggleSection("tools")} />
      {openSections.tools && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {isSSTGroup && (
            <div className="flex gap-1 items-start">
              <div className="flex-1">
                <ProGate isPro={isPro} label="Isotherm (temp break) overlay is available on the Pro plan.">
                  <ToolBtn active={showIsotherm} color="sky" onClick={() => setShowIsotherm(v => !v)}>
                    Temp break
                  </ToolBtn>
                  {showIsotherm && (
                    <IsothermSubControls
                      targetTemp={effectiveTargetTemp}
                      onTargetTemp={setIsothermalTargetTemp}
                      sensitivity={isothermalSensitivity}
                      onSensitivity={setIsothermalSensitivity}
                      sstMin={sstMin} sstMax={sstMax}
                    />
                  )}
                </ProGate>
              </div>
              {hbtn("isotherm")}
            </div>
          )}

          {/* HOTSPOT UI HIDDEN — needs work
          <div className="flex gap-1 items-start">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Fishing hotspot scoring is available on the Pro plan.">
                <ToolBtn active={showHotspots} color="amber" onClick={() => setShowHotspots(h => !h)}>
                  {hotspotLoading ? "Loading…" : "Hot spots"}
                </ToolBtn>
                {showHotspots && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {FISH_SPECIES.map(s => (
                      <button key={s.key} onClick={() => setSelectedFishSpecies(s.key)}
                        style={{ borderColor: s.key === "yellowfin" ? "#94a3b8" : s.color, background: selectedFishSpecies === s.key ? s.color : "#fff", color: selectedFishSpecies === s.key ? (s.key === "yellowfin" ? "#334155" : "#fff") : "#475569" }}
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded border transition-colors">
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </ProGate>
            </div>
            {hbtn("hotspots")}
          </div>
          */}

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Bottom Features are available on the Pro plan.">
                <ToolBtn active={showWrecks} color="amber" onClick={() => setShowWrecks(w => !w)}>
                  {wrecksLoading ? "Loading…" : "Bottom Features"}
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("bottomfeat")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Shaded Relief is available on the Pro plan.">
                <ToolBtn active={showBathyRaster} color="cyan" onClick={() => setShowBathyRaster(v => { const next = !v; if (next) setShowRadarOverlay(false); return next; })}>
                  Shaded Relief
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("shadedrelief")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Radar overlay is available on the Pro plan.">
                <ToolBtn active={showRadarOverlay} color="cyan" onClick={() => setShowRadarOverlay(v => !v)}>
                  Radar
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("radar")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Trip planning is available on the Pro plan.">
                <ToolBtn active={tripMode} color="cyan" onClick={onToggleTripMode}>
                  {tripMode ? "Planning…" : "Plan Trip"}
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("trip")}
          </div>

          <div className="flex gap-1 items-stretch">
            <div className="flex-1">
              <ProGate isPro={isPro} label="Real-time GPS tracking is a Pro feature.">
                <ToolBtn active={gpsActive} color="green" onClick={onToggleGps}>
                  {gpsActive ? "GPS On" : "GPS"}
                </ToolBtn>
              </ProGate>
            </div>
            {hbtn("gps")}
          </div>
        </div>
      )}

      <Divider />

      {/* ── Community ─────────────────────────────────────────────────── */}
      <SectionHeader title="Community" open={openSections.community} onToggle={() => toggleSection("community")} />
      {openSections.community && (
        <div className="flex flex-col gap-1.5 px-2 pb-2">

          {communityAccess?.hasAccess && (
            <div className="text-[10px] text-cyan-600 font-medium px-1">Access active</div>
          )}
          <button
            onClick={onDropLivePin}
            className="w-full py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
          >
            Live Report
          </button>
          <button
            onClick={onPostReport}
            className="w-full py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
          >
            Post-Trip Report
          </button>
          <button
            onClick={onOpenLeaderboard}
            className="w-full py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
          >
            Leaderboard
          </button>

        </div>
      )}

      {/* ── Help modal portal ─────────────────────────────────────────── */}
      {helpOpen && HELP_CONFIG[helpOpen] && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-4"
             onClick={() => setHelpOpen(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800 text-sm">{HELP_CONFIG[helpOpen].title}</p>
              <button onClick={() => setHelpOpen(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none font-light">×</button>
            </div>
            <img src={HELP_CONFIG[helpOpen].image} alt=""
                 className="w-full object-cover" style={{ maxHeight: 200 }}
                 onError={e => { e.currentTarget.style.display = "none"; }} />
            <div className="px-4 py-3 text-[11px] text-slate-600 leading-relaxed">
              {helpOpen === "loran"
                ? <>{`The U.S. LORAN-C system was officially decommissioned in 2010. This overlay approximates the positions of those lines for reference and waypoint sharing. In practice, we typically refer only to the last three digits, combined with a depth reference. For example: "The bite's been hot in 100 fathoms at the 580" ('The Point' off Oregon Inlet).`}<br/><br/>{`Major lines are spaced 10 miles apart, so if a buddy reports mahi at the 680, that's roughly a 10-mile run from the 580. Minor lines are spaced 2 miles apart, making it easy to estimate distance and position on the water.`}<br/><br/>{`In the mid-Atlantic, a second crossing set of lines (the "W" family) can be toggled on to show the full LORAN grid.`}</>
                : HELP_CONFIG[helpOpen].text}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
