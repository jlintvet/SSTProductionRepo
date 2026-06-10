/**
 * MapControlPanel.jsx
 * Collapsible layered control panel for the SST heatmap.
 *
 * Sections:
 *   - Mode        (Pan / Inspect — always visible, never collapses)
 *   - Data layer  (SST [with sub-source picker] | Chlorophyll | Sea color | Wind map)
 *   - Gain        (range control — adapts label/units to active layer, hidden for wind)
 *   - Tools       (Temp break, Hot spots, Wind overlay)
 *   - Overlays    (Bathy, Wrecks)
 *   - Departure   (selected location name — bottom context)
 */

import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { Crosshair, Move, Wind, ChevronDown } from "lucide-react";
import SSTRangeControl from "@/components/SSTRangeControl";

// ── ProGate (inlined — no separate file needed) ───────────────────────────────
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
      {/* Children greyed out, pointer events fully blocked */}
      <div style={{ opacity: 0.4, pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>
      {/* Transparent overlay captures all clicks */}
      <div onClick={handleClick} style={{
        position: "absolute", inset: 0, cursor: "pointer", zIndex: 5,
      }} title="Available in Pro" />
      {/* PRO badge */}
      <span onClick={handleClick} style={{
        position: "absolute", top: 2, right: 2, background: "#f59e0b", color: "#fff",
        borderRadius: 10, fontSize: 9, fontWeight: 700, padding: "1px 5px",
        cursor: "pointer", zIndex: 10, letterSpacing: 0.5, whiteSpace: "nowrap",
      }}>PRO</span>
      {popup}
    </div>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function SectionHeader({ title, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
      style={{ background: "none", border: "none", cursor: "pointer" }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
        {title}
      </span>
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
        active
          ? activeColors[color] ?? activeColors.cyan
          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
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
        active
          ? "bg-violet-50 text-violet-700 border-violet-300 font-semibold"
          : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function ToolBtn({ active, onClick, color = "sky", children }) {
  const activeColors = {
    sky:    "bg-sky-700 text-white border-sky-700",
    amber:  "bg-amber-700 text-white border-amber-700",
    cyan:   "bg-cyan-600 text-white border-cyan-600",
    blue:   "bg-blue-700 text-white border-blue-700",
    violet: "bg-violet-600 text-white border-violet-600",
  };
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1.5 rounded-lg border text-left transition-colors ${
        active
          ? activeColors[color] ?? activeColors.sky
          : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="border-t border-slate-100 mx-0" />;
}

// ── Fish species selector (shown when fish spots tool is active) ──────────────
const FISH_SPECIES = [
  { key: "yellowfin",    label: "Yellowfin", color: "#fafbfc" },
  { key: "mahi",         label: "Mahi",       color: "#10b981" },
  { key: "wahoo",        label: "Wahoo",      color: "#3b82f6" },
  { key: "bluefin",      label: "Bluefin",    color: "#6366f1" },
  { key: "kingfish",     label: "Kingfish",   color: "#ef4444" },
  { key: "white_marlin", label: "W. Marlin",  color: "#8b5cf6" },
  { key: "blue_marlin",  label: "B. Marlin",  color: "#0ea5e9" },
];

// ── Isotherm sub-controls (shown when temp break tool is active) ─────────────
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
          <span className="text-[10px] font-semibold text-violet-600 tabular-nums">{sensitivity.toFixed(1)}°F</span>
        </div>
        <input
          type="range" min={0.5} max={8} step={0.5}
          value={sensitivity} onChange={e => onSensitivity(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-violet-500"
        />
        <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
          <span>← sharp only</span><span>all →</span>
        </div>
      </div>
    </div>
  );
}

// ── Date navigator (prev / label / next) ─────────────────────────────────────
function DateNav({ label, onPrev, onNext, disablePrev, disableNext, color = "cyan" }) {
  const labelColors = {
    cyan:   "text-cyan-700 bg-cyan-50",
    violet: "text-violet-700 bg-violet-50",
    indigo: "text-indigo-700 bg-indigo-50",
    green:  "text-green-700 bg-green-50",
    teal:   "text-teal-700 bg-teal-50",
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
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
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
  chlData, chlDateIndex, setChlDateIndex, chlLoading,
  seaColorData, seaColorDateIndex, setSeaColorDateIndex, seaColorLoading,
  windLoading,
  date,
  // gain / range
  sstRange, onSstRangeChange, userId, rangeControlOpenRef, chlDataMin, chlDataMax, seaColorDataMin, seaColorDataMax,
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
  // overlays
  showBathyLayer, setShowBathyLayer,
  jsonContoursLoading,
  showWrecks, setShowWrecks,
  wrecksLoading,
  showLoranGrid, setShowLoranGrid,
  // tier
  isPro,
  // trip planning
  tripMode, onToggleTripMode,
  gpsActive, onToggleGps,
  // departure
  selectedLocation,
  // collapsed state (controlled externally so collapse button in map header works)
  collapsed, setCollapsed,
  // panel hover callbacks
  onPointerEnter, onPointerLeave, panelRef,
}) {
  const [openSections, setOpenSections] = useState({
    layers:   true,
    gain:     true,
    tools:    true,
    overlays: true,
  });

  function toggleSection(key) {
    setOpenSections(s => ({ ...s, [key]: !s[key] }));
  }

  const isWindMap   = activeDataLayer === "windmap";
  const isSST       = activeDataLayer === "sst";
  const isComposite = activeDataLayer === "composite";
  const isSSTGroup  = isSST || isComposite;
  const isCHL       = activeDataLayer === "chlorophyll";
  const isSC        = activeDataLayer === "seacolor";
  const isAlt       = activeDataLayer === "altimetry";
  const showGain    = !isWindMap && !isAlt;

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
        maxHeight: "calc(100% - 16px)",
        position: "absolute",
        right: 8,
        top: 8,
        zIndex: 500,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* ── Header with collapse button ───────────────────────────────── */}
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

      {/* ── Mode ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-2">
        <button
          onClick={() => setInteractionMode("pan")}
          title="Pan"
          className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-lg border transition-colors ${
            interactionMode === "pan"
              ? "bg-slate-700 text-white border-slate-700"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >
          <Move className="w-3.5 h-3.5" />Pan
        </button>
        <button
          onClick={() => setInteractionMode("crosshair")}
          title="Inspect"
          className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-lg border transition-colors ${
            interactionMode === "crosshair"
              ? "bg-cyan-600 text-white border-cyan-600"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />Inspect
        </button>
      </div>

      <Divider />

      {/* ── Data layer ────────────────────────────────────────────────── */}
      <SectionHeader title="Data layer" open={openSections.layers} onToggle={() => toggleSection("layers")} />
      {openSections.layers && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          <LayerBtn active={isSSTGroup} color="cyan" onClick={() => { setActiveDataLayer("sst"); }}>SST</LayerBtn>

          {isSSTGroup && (
            <div className="flex flex-col gap-1 pl-2 border-l-2 border-slate-200 ml-1">
              <SubSourceBtn active={isSST && dataSource === "MUR"} onClick={() => { setActiveDataLayer("sst"); setDataSource("MUR"); }}>Daily</SubSourceBtn>
              <SubSourceBtn active={isSST && dataSource === "VIIRS"} onClick={() => { setActiveDataLayer("sst"); setDataSource("VIIRS"); }}>Hourly</SubSourceBtn>
              <SubSourceBtn active={isComposite} onClick={() => setActiveDataLayer("composite")}>Composite 36h</SubSourceBtn>

              {isComposite && compositeData && (
                compositeDates?.length > 1 ? (
                  <DateNav
                    label={compositeDates[compositeDateIndex] ?? "—"} color="violet"
                    onPrev={() => setCompositeDateIndex(i => Math.max(0, i - 1))}
                    onNext={() => setCompositeDateIndex(i => Math.min(compositeDates.length - 1, i + 1))}
                    disablePrev={compositeDateIndex === 0}
                    disableNext={compositeDateIndex === compositeDates.length - 1}
                  />
                ) : (
                  <div className="text-[10px] text-violet-700 bg-violet-50 rounded px-2 py-1 text-center font-semibold mt-1">
                    {compositeData.generated
                      ? new Date(compositeData.generated).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "America/New_York" })
                      : "Latest composite"}
                  </div>
                )
              )}

              {isSST && dataSource === "VIIRS" && viirsData?.days?.length >= 1 && (
                <>
                  <DateNav
                    label={activeViirsDay?.date ?? "—"} color="violet"
                    onPrev={() => setViirsDateIndex(i => Math.max(0, i - 1))}
                    onNext={() => setViirsDateIndex(i => Math.min(viirsData.days.length - 1, i + 1))}
                    disablePrev={viirsDateIndex === 0}
                    disableNext={viirsDateIndex === viirsData.days.length - 1}
                  />
                  {activeViirsDay?.available_hours?.length > 1 && (
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
                              viirsHour === h ? "bg-violet-600 text-white border-violet-500" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
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
                  label={date ?? "—"} color="cyan"
                  onPrev={() => setMurDateIndex(i => Math.max(0, i - 1))}
                  onNext={() => setMurDateIndex(i => Math.min(murData.days.length - 1, i + 1))}
                  disablePrev={murDateIndex === 0}
                  disableNext={murDateIndex === murData.days.length - 1}
                />
              )}
              {isSST && dataSource === "GOESCOMP" && goesCompData?.days?.length >= 1 && (
                <DateNav
                  label={activeGoesCompDay?.date ?? "—"} color="indigo"
                  onPrev={() => setGoesCompDateIndex(i => Math.max(0, i - 1))}
                  onNext={() => setGoesCompDateIndex(i => Math.min(goesCompData.days.length - 1, i + 1))}
                  disablePrev={goesCompDateIndex === 0}
                  disableNext={goesCompDateIndex === goesCompData.days.length - 1}
                />
              )}
            </div>
          )}

          <LayerBtn active={isCHL} color="green" onClick={() => setActiveDataLayer("chlorophyll")}>
            {chlLoading ? "Loading…" : "Chlorophyll"}
          </LayerBtn>
          {isCHL && chlData?.days?.length > 1 && (
            <DateNav
              label={chlData.days[chlDateIndex]?.date ?? "—"} color="green"
              onPrev={() => setChlDateIndex(i => Math.max(0, i - 1))}
              onNext={() => setChlDateIndex(i => Math.min(chlData.days.length - 1, i + 1))}
              disablePrev={chlDateIndex === 0}
              disableNext={chlDateIndex === chlData.days.length - 1}
            />
          )}

          <LayerBtn active={isSC} color="teal" onClick={() => setActiveDataLayer("seacolor")}>
            {seaColorLoading ? "Loading…" : "Sea color"}
          </LayerBtn>
          {isSC && seaColorData?.days?.length > 1 && (
            <DateNav
              label={seaColorData.days[seaColorDateIndex]?.date ?? "—"} color="teal"
              onPrev={() => setSeaColorDateIndex(i => Math.max(0, i - 1))}
              onNext={() => setSeaColorDateIndex(i => Math.min(seaColorData.days.length - 1, i + 1))}
              disablePrev={seaColorDateIndex === 0}
              disableNext={seaColorDateIndex === seaColorData.days.length - 1}
            />
          )}

          <ProGate isPro={isPro} label="Sea level anomaly (altimetry) is available on the Pro plan.">
            <LayerBtn active={isAlt} color="violet" onClick={() => setActiveDataLayer("altimetry")}>
              🌊 Altimetry
            </LayerBtn>
          </ProGate>

          <LayerBtn active={isWindMap} color="sky" onClick={() => setActiveDataLayer("windmap")}>
            <Wind className="w-3 h-3" />{windLoading ? "Loading…" : "Wind map"}
          </LayerBtn>
        </div>
      )}

      <Divider />

      {/* ── Gain / range (Pro) ───────────────────────────────────────── */}
      {showGain && (
        <>
          <ProGate isPro={isPro} label="Color gain control is available on the Pro plan.">
            <SectionHeader title={gainLabel} open={openSections.gain} onToggle={() => toggleSection("gain")} />
            {openSections.gain && (
              <div className="px-2 pb-2">
                <SSTRangeControl
                  activeLayer={isSSTGroup ? "sst" : isCHL ? "chlorophyll" : "seacolor"}
                  userId={userId}
                  range={sstRange}
                  onRangeChange={onSstRangeChange}
                  onApply={onSstRangeChange}
                  style={{ width: "100%" }}
                  openRef={rangeControlOpenRef}
                  dataMin={isCHL ? chlDataMin : isSC ? seaColorDataMin : undefined}
                  dataMax={isCHL ? chlDataMax : isSC ? seaColorDataMax : undefined}
                />
              </div>
            )}
          </ProGate>
          <Divider />
        </>
      )}

      {/* ── Tools ────────────────────────────────────────────────────── */}
      <SectionHeader title="Tools" open={openSections.tools} onToggle={() => toggleSection("tools")} />
      {openSections.tools && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {isSST && (
            <ProGate isPro={isPro} label="Isotherm (temp break) overlay is available on the Pro plan.">
              <ToolBtn active={showIsotherm} color="sky" onClick={() => setShowIsotherm(v => !v)}>
                <span className="text-sm leading-none">~</span> Temp break
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
          )}

          <ProGate isPro={isPro} label="Fishing hotspot scoring is available on the Pro plan.">
            <ToolBtn active={showHotspots} color="amber" onClick={() => setShowHotspots(h => !h)}>
              🎣 {hotspotLoading ? "Loading…" : "Hot spots"}
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

          {!isWindMap && (
            <ProGate isPro={isPro} label="Wind overlay on the map is available on the Pro plan.">
              <ToolBtn active={showWindOverlay} color="cyan" onClick={() => setShowWindOverlay(v => !v)}>
                <Wind className="w-3 h-3" />{windLoading ? "Loading…" : showWindOverlay ? "Wind on" : "Wind overlay"}
              </ToolBtn>
            </ProGate>
          )}
          <ProGate isPro={isPro} label="Ocean current overlay is available on the Pro plan.">
            <ToolBtn active={showCurrents} color="cyan" onClick={() => setShowCurrents(v => !v)}>
              &#x1F30A; {currentsLoading ? "Loading…" : showCurrents ? "Currents on" : "Currents overlay"}
            </ToolBtn>
          </ProGate>
          <ProGate isPro={isPro} label="Trip planning is available on the Pro plan.">
            <ToolBtn active={tripMode} color="cyan" onClick={onToggleTripMode}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/></svg>
              {tripMode ? "Planning…" : "Plan Trip"}
            </ToolBtn>
          </ProGate>
          <ProGate isPro={isPro} label="Real-time GPS tracking is a Pro feature.">
            <ToolBtn active={gpsActive} color="green" onClick={onToggleGps}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                <path d="M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>
              </svg>
              {gpsActive ? "GPS On" : "Real Time"}
            </ToolBtn>
          </ProGate>
        </div>
      )}

      <Divider />

      {/* ── Overlays ─────────────────────────────────────────────────── */}
      <SectionHeader title="Overlays" open={openSections.overlays} onToggle={() => toggleSection("overlays")} />
      {openSections.overlays && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          <ToolBtn active={showBathyLayer} color="blue" onClick={() => setShowBathyLayer(b => !b)}>
            {jsonContoursLoading ? "Loading…" : "Bathy"}
          </ToolBtn>
          <ProGate isPro={isPro} label="Altimetry overlay is available on the Pro plan.">
            <ToolBtn active={showAltimetryOverlay} color="violet" onClick={() => setShowAltimetryOverlay(v => !v)}>
              〰 {showAltimetryOverlay ? "SLA Overlay on" : "SLA Overlay"}
            </ToolBtn>
          </ProGate>
          <ProGate isPro={isPro} label="Bottom Features are available on the Pro plan.">
            <ToolBtn active={showWrecks} color="amber" onClick={() => setShowWrecks(w => !w)}>
              {wrecksLoading ? "Loading…" : "Bottom Features"}
            </ToolBtn>
          </ProGate>
          <ToolBtn active={showLoranGrid} color="slate" onClick={() => setShowLoranGrid(v => !v)}>
            {showLoranGrid ? "Loran Grid on" : "Loran Grid"}
          </ToolBtn>
        </div>
      )}

    </div>
  );
}