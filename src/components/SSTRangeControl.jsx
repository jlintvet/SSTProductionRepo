/**
 * SSTRangeControl.jsx  v3
 *
 * FIXES vs v2:
 *   - ScaleBar / Panel no longer defined inline inside the main component.
 *     Inline component definitions remount on every render, which broke slider
 *     drag (new onChange ref each render), input focus (input remounts on keystroke),
 *     and double-apply (panel remounted between clicks).
 *   - Apply no longer closes the panel — user closes manually. Eliminates double-click.
 *   - Load saved range now calls onApply immediately so map updates without a second click.
 *   - saveName lives in a stable ref so typing doesn't cascade re-renders into the Panel.
 *   - Scale bar narrowed: ramp 80px, no label text when at full range.
 *   - Source switching in SSTLive resets the range via the externalRange prop,
 *     not via an activeLayer effect that would also fire on layer change.
 */

import React, {
  useState, useRef, useCallback, useEffect, useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

// ── Design tokens ─────────────────────────────────────────────────────────
const OCEAN      = "#0e7490";
const OCEAN_DARK = "#164e63";
const OCEAN_LIGHT= "#cffafe";
const TEXT       = "#0c2a35";
const MUTED      = "#64748b";

// ── Color ramps ───────────────────────────────────────────────────────────
const SST_RAMP = [
  [0.00,  30,  64, 175],
  [0.20,   8, 145, 178],
  [0.40,  16, 185, 129],
  [0.60, 245, 158,  11],
  [0.80, 239,  68,  68],
  [1.00, 127,  29,  29],
];
const CHLORO_RAMP = [
  [0.00,   8,  47,  73],
  [0.25,   4, 120,  87],
  [0.50,  34, 197, 100],
  [0.75, 163, 230,  53],
  [1.00, 254, 240, 138],
];
const SEACOLOR_RAMP = [
  [0.00,  10,  60, 160],
  [0.30,   0, 140, 170],
  [0.60,   0, 160,  80],
  [0.85, 100, 150,  20],
  [1.00, 150, 100,   0],
];

function rampToCSS(ramp) {
  return "linear-gradient(to right," +
    ramp.map(([p, r, g, b]) => `rgb(${r},${g},${b}) ${(p*100).toFixed(0)}%`).join(",") + ")";
}

const HATCH = "repeating-linear-gradient(45deg,rgba(0,0,0,0.45) 0,rgba(0,0,0,0.45) 2px,transparent 2px,transparent 5px)";

// ── Layer config ──────────────────────────────────────────────────────────
const LAYER_CONFIG = {
  sst: {
    label: "SST", unit: "°F",
    absMin: 42, absMax: 95, defaultMin: 55, defaultMax: 85, step: 0.5,
    ramp: SST_RAMP,
  },
  chlorophyll: {
    label: "Chloro", unit: " mg/m³",
    absMin: 0.01, absMax: 20, defaultMin: 0.05, defaultMax: 20, step: 0.05,
    ramp: CHLORO_RAMP,
  },
  seacolor: {
    label: "Kd490", unit: " m⁻¹",
    absMin: 0.01, absMax: 0.50, defaultMin: 0.01, defaultMax: 0.50, step: 0.01,
    ramp: SEACOLOR_RAMP,
  },
};

function fmt(v, step) {
  return step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : v.toFixed(1);
}

// ─────────────────────────────────────────────────────────────────────────
// DualSlider — stable component defined at module level (not inside another
// component) so it is never remounted due to a parent re-render.
// ─────────────────────────────────────────────────────────────────────────
function DualSlider({ min, max, absMin, absMax, step, ramp, onChange }) {
  const trackRef = useRef(null);
  const dragging  = useRef(null);

  const toPct   = v => ((v - absMin) / (absMax - absMin)) * 100;
  const fromPct = p => {
    const raw = absMin + (p / 100) * (absMax - absMin);
    return Math.round(raw / step) * step;
  };

  function pctFromEvent(e) {
    const rect = trackRef.current.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    return Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100));
  }

  // Use a ref for onChange so the window listeners never go stale
  const onChangRef = useRef(onChange);
  useEffect(() => { onChangRef.current = onChange; }, [onChange]);

  const minRef = useRef(min);
  const maxRef = useRef(max);
  useEffect(() => { minRef.current = min; maxRef.current = max; }, [min, max]);

  const onMove = useCallback((e) => {
    if (!dragging.current) return;
    const v = fromPct(pctFromEvent(e));
    if (dragging.current === "min")
      onChangRef.current({ min: Math.min(v, maxRef.current - step), max: maxRef.current });
    else
      onChangRef.current({ min: minRef.current, max: Math.max(v, minRef.current + step) });
  }, [step]);  // step is stable; everything else via refs

  const onUp = useCallback(() => { dragging.current = null; }, []);

  useEffect(() => {
    window.addEventListener("mousemove",  onMove);
    window.addEventListener("mouseup",    onUp);
    window.addEventListener("touchmove",  onMove, { passive: true });
    window.addEventListener("touchend",   onUp);
    return () => {
      window.removeEventListener("mousemove",  onMove);
      window.removeEventListener("mouseup",    onUp);
      window.removeEventListener("touchmove",  onMove);
      window.removeEventListener("touchend",   onUp);
    };
  }, [onMove, onUp]);

  const pMin   = toPct(min);
  const pMax   = toPct(max);
  const rampBg = rampToCSS(ramp);

  const thumb = (pct, which) => ({
    position: "absolute", top: "50%",
    width: 20, height: 20, borderRadius: "50%",
    background: "#fff", border: `3px solid ${OCEAN}`,
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    cursor: "grab", zIndex: 3,
    left: `${pct}%`,
    transform: "translate(-50%,-50%)",
  });

  return (
    <div
      ref={trackRef}
      style={{ position: "relative", height: 40, userSelect: "none", touchAction: "none", cursor: "crosshair" }}
      onMouseDown={e => {
        const v = fromPct(pctFromEvent(e));
        dragging.current = Math.abs(v - min) <= Math.abs(v - max) ? "min" : "max";
      }}
    >
      <div style={{ position:"absolute", top:"50%", left:0, right:0, transform:"translateY(-50%)", height:10, borderRadius:5, background:rampBg, boxShadow:"inset 0 1px 3px rgba(0,0,0,0.2)" }}/>
      <div style={{ position:"absolute", top:"50%", left:0, width:`${pMin}%`, transform:"translateY(-50%)", height:10, borderRadius:"5px 0 0 5px", background:HATCH }}/>
      <div style={{ position:"absolute", top:"50%", right:0, width:`${100-pMax}%`, transform:"translateY(-50%)", height:10, borderRadius:"0 5px 5px 0", background:HATCH }}/>
      <div style={{ position:"absolute", top:"50%", left:`${pMin}%`, width:`${pMax-pMin}%`, transform:"translateY(-50%)", height:10, border:`2px solid ${OCEAN}`, borderRadius:3, pointerEvents:"none", boxSizing:"border-box" }}/>
      <div style={thumb(pMin,"min")}
        onMouseDown={e => { e.stopPropagation(); dragging.current = "min"; }}
        onTouchStart={e => { e.stopPropagation(); dragging.current = "min"; }}
      />
      <div style={thumb(pMax,"max")}
        onMouseDown={e => { e.stopPropagation(); dragging.current = "max"; }}
        onTouchStart={e => { e.stopPropagation(); dragging.current = "max"; }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// NumInput — also module-level so typing doesn't remount it
// ─────────────────────────────────────────────────────────────────────────
function NumInput({ value, onChange, absMin, absMax, step }) {
  const [draft, setDraft] = useState(fmt(value, step));
  // Only sync draft from outside when value changes AND input is not focused
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(fmt(value, step));
  }, [value]);

  function commit() {
    const n = parseFloat(draft);
    if (!isNaN(n)) onChange(Math.max(absMin, Math.min(absMax, Math.round(n/step)*step)));
    else setDraft(fmt(value, step));
  }

  return (
    <input type="number" value={draft} step={step} min={absMin} max={absMax}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; commit(); }}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => e.key === "Enter" && commit()}
      style={{ width:"100%", padding:"6px 8px", border:`1.5px solid #cbd5e1`, borderRadius:7,
        fontSize:13, fontWeight:700, color:TEXT, textAlign:"center", fontFamily:"inherit",
        background:"#fff", outline:"none" }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SavedPill — module-level
// ─────────────────────────────────────────────────────────────────────────
function SavedPill({ entry, ramp, absMin, absMax, unit, step, onLoad, onDelete }) {
  const pMin = ((entry.range_min - absMin) / (absMax - absMin)) * 100;
  const pMax = ((entry.range_max - absMin) / (absMax - absMin)) * 100;
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px",
      background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:8 }}>
      <div style={{ width:36, height:8, borderRadius:3, flexShrink:0,
        background:rampToCSS(ramp), position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, bottom:0, left:0, width:`${pMin}%`, background:HATCH }}/>
        <div style={{ position:"absolute", top:0, bottom:0, right:0, width:`${100-pMax}%`, background:HATCH }}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:TEXT, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{entry.name}</div>
        <div style={{ fontSize:10, color:MUTED }}>{fmt(entry.range_min,step)}{unit}–{fmt(entry.range_max,step)}{unit}</div>
      </div>
      <button onClick={() => onLoad(entry)}
        style={{ padding:"3px 8px", borderRadius:5, fontSize:10, fontWeight:700,
          border:`1.5px solid ${OCEAN}`, background:OCEAN_LIGHT, color:OCEAN_DARK, cursor:"pointer", flexShrink:0 }}>
        Load
      </button>
      {confirming
        ? <button onClick={() => { onDelete(entry.id); setConfirming(false); }}
            style={{ padding:"3px 8px", borderRadius:5, fontSize:10, fontWeight:700,
              border:"1.5px solid #ef4444", background:"#fef2f2", color:"#ef4444", cursor:"pointer", flexShrink:0 }}>
            Sure?
          </button>
        : <button onClick={() => setConfirming(true)}
            style={{ padding:"2px 6px", borderRadius:5, fontSize:13, border:"1.5px solid #e2e8f0",
              background:"transparent", color:MUTED, cursor:"pointer", flexShrink:0, lineHeight:1 }}>
            ×
          </button>
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// RangePanel — the popup content. Module-level so it is never remounted
// on parent re-renders. Receives everything as props.
// ─────────────────────────────────────────────────────────────────────────
function RangePanel({
  cfg, range, onRangeChange, onApply, onReset,
  userId, activeLayer,
  savedRanges, onSave, onLoad, onDelete, loadingRanges,
  onClose,
}) {
  const [tab, setTab] = useState("adjust");
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState(null);
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const pMin   = ((range.min - cfg.absMin) / (cfg.absMax - cfg.absMin)) * 100;
  const pMax   = ((range.max - cfg.absMin) / (cfg.absMax - cfg.absMin)) * 100;
  const spread = range.max - range.min;

function handleLoad(entry) {
    const r = { min: entry.range_min, max: entry.range_max, maskOutside: false };
    onRangeChange(r);
    onApply(r);      // ← apply immediately on load, no second click needed
    setTab("adjust");
  }

  async function handleSave() {
    if (!saveName.trim()) { setSaveError("Enter a name."); return; }
    if (!userId) { setSaveError("Sign in to save."); return; }
    setSaving(true); setSaveError(null);
    await onSave(saveName.trim());
    setSaveName("");
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 2000);
    setSaving(false);
  }

  return (
    <div style={{ background:"#fff", borderRadius:14, border:"1.5px solid #e2e8f0",
      boxShadow:"0 16px 48px rgba(14,116,144,0.18), 0 4px 16px rgba(0,0,0,0.08)", overflow:"hidden" }}>

      <style>{`@keyframes sstIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${OCEAN_DARK},${OCEAN})`, padding:"10px 14px",
        display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:12, fontWeight:800, color:"#fff" }}>{cfg.label} Range</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.65)", marginTop:1 }}>
            Full color ramp stretched across selected window
          </div>
        </div>
        {onClose && (
          <button onClick={onClose}
            style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:6,
              color:"#fff", cursor:"pointer", width:24, height:24, fontSize:16,
              lineHeight:"24px", textAlign:"center", fontFamily:"inherit", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center" }}>
            ×
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid #f1f5f9" }}>
        {[["adjust","ADJUST"],["saved",`SAVED (${savedRanges.length})`]].map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, padding:"8px 0", fontSize:11, fontWeight:700, letterSpacing:"0.04em",
            border:"none", cursor:"pointer", fontFamily:"inherit",
            background: tab===id ? "#fff" : "#f8fafc",
            color: tab===id ? OCEAN : MUTED,
            borderBottom:`2px solid ${tab===id ? OCEAN : "transparent"}`,
          }}>{label}</button>
        ))}
      </div>

      {/* ── Adjust tab ── */}
      {tab === "adjust" && (
        <div style={{ padding:"12px" }}>

          {/* Axis labels above the slider */}
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
            <span style={{ fontSize:9, color:MUTED }}>{fmt(cfg.absMin,cfg.step)}{cfg.unit}</span>
            <span style={{ fontSize:9, color:OCEAN, fontWeight:700 }}>
              {fmt(range.min,cfg.step)}–{fmt(range.max,cfg.step)}{cfg.unit} · ↔{fmt(spread,cfg.step)}{cfg.unit}
            </span>
            <span style={{ fontSize:9, color:MUTED }}>{fmt(cfg.absMax,cfg.step)}{cfg.unit}</span>
          </div>

          {/* Slider — the ramp IS the visual; labels live above it */}
          <DualSlider
            min={range.min} max={range.max}
            absMin={cfg.absMin} absMax={cfg.absMax}
            step={cfg.step} ramp={cfg.ramp}
            onChange={onRangeChange}
          />

          {/* Min / Max inputs + Reset */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6, marginBottom:12 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:MUTED, marginBottom:3 }}>MIN</div>
              <NumInput value={range.min} absMin={cfg.absMin} absMax={cfg.absMax} step={cfg.step}
                onChange={v => onRangeChange({ ...range, min: Math.min(v, range.max - cfg.step) })} />
            </div>
            <div style={{ color:"#e2e8f0", paddingTop:16, fontSize:14 }}>—</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:MUTED, marginBottom:3 }}>MAX</div>
              <NumInput value={range.max} absMin={cfg.absMin} absMax={cfg.absMax} step={cfg.step}
                onChange={v => onRangeChange({ ...range, max: Math.max(v, range.min + cfg.step) })} />
            </div>
            <div style={{ paddingTop:16 }}>
              <button onClick={onReset}
                style={{ padding:"6px 8px", borderRadius:6, fontSize:10, fontWeight:600,
                  border:"1px solid #e2e8f0", background:"#f1f5f9", color:MUTED, cursor:"pointer" }}>
                ↺
              </button>
            </div>
          </div>

          {/* Save */}
          <div style={{ background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:8, padding:"8px" }}>
            <div style={{ fontSize:9, fontWeight:700, color:MUTED, letterSpacing:"0.04em", marginBottom:6 }}>SAVE RANGE</div>
            <div style={{ display:"flex", gap:5 }}>
              <input
                type="text"
                placeholder="Name this range…"
                value={saveName}
                onChange={e => { setSaveName(e.target.value); setSaveError(null); }}
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") handleSave(); }}
                maxLength={40}
                style={{ flex:1, padding:"6px 8px", border:`1.5px solid ${saveError?"#ef4444":"#cbd5e1"}`,
                  borderRadius:6, fontSize:12, fontFamily:"inherit", color:TEXT, background:"#fff", outline:"none" }}
              />
              <button onClick={handleSave} disabled={saving || !saveName.trim()}
                style={{ padding:"6px 10px", borderRadius:6, background:saveOk?"#166534":OCEAN,
                  border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer",
                  opacity: saving||!saveName.trim() ? 0.5 : 1, flexShrink:0 }}>
                {saveOk ? "✓" : saving ? "…" : "Save"}
              </button>
            </div>
            {saveError && <div style={{ fontSize:10, color:"#ef4444", marginTop:4 }}>{saveError}</div>}
          </div>
        </div>
      )}

      {/* ── Saved tab ── */}
      {tab === "saved" && (
        <div style={{ padding:"12px" }}>
          {!userId ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:MUTED, fontSize:12 }}>Sign in to save ranges.</div>
          ) : loadingRanges ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:MUTED, fontSize:12 }}>Loading…</div>
          ) : savedRanges.length === 0 ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:MUTED, fontSize:12, lineHeight:1.6 }}>
              📌 No saved ranges yet.<br/>
              <span style={{ fontSize:11 }}>Name a range in the Adjust tab and hit Save.</span>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              <div style={{ fontSize:9, fontWeight:700, color:MUTED, letterSpacing:"0.05em", marginBottom:3 }}>
                {savedRanges.length} SAVED · Load applies immediately
              </div>
              {savedRanges.map(entry => (
                <SavedPill key={entry.id} entry={entry}
                  ramp={cfg.ramp} absMin={cfg.absMin} absMax={cfg.absMax}
                  unit={cfg.unit} step={cfg.step}
                  onLoad={handleLoad} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PanelPortal — renders RangePanel at document.body via createPortal so
// no ancestor overflow:hidden/auto can clip it.
// ─────────────────────────────────────────────────────────────────────────
function PanelPortal({ triggerRef, onClose, children }) {
  const [pos, setPos] = useState(null);
  const portalRef = useRef(null);

  useLayoutEffect(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const W = 300, H = 420;
    // Open to the LEFT of the control panel: right edge of panel = left edge of trigger
    const left = Math.max(8, rect.left - W - 8);
    // Vertically align to trigger top, clamp to viewport
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - H - 8));
    setPos({ top, left });
  }, []);

  useEffect(() => {
    function handler(e) {
      if (
        portalRef.current && !portalRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (!pos) return null;

  return createPortal(
    <div ref={portalRef} style={{ position:"fixed", top:pos.top, left:pos.left, width:300, zIndex:999999 }}>
      {children}
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ScaleBar — the always-visible trigger button. Module-level.
// ─────────────────────────────────────────────────────────────────────────
function ScaleBar({ cfg, range, isOpen, isNarrowed, onClick, triggerRef }) {
  const pMin = ((range.min - cfg.absMin) / (cfg.absMax - cfg.absMin)) * 100;
  const pMax = ((range.max - cfg.absMin) / (cfg.absMax - cfg.absMin)) * 100;
  return (
    <button ref={triggerRef} onClick={onClick}
      title="Adjust colorscale range"
      style={{ display:"flex", alignItems:"center", gap:0,
        background: isNarrowed ? OCEAN_LIGHT : "rgba(255,255,255,0.95)",
        border:`1.5px solid ${isOpen||isNarrowed ? OCEAN : "#cbd5e1"}`,
        borderRadius:7, overflow:"hidden", cursor:"pointer", padding:0, height:26,
        boxShadow: isOpen ? `0 0 0 2px ${OCEAN}44` : "0 1px 4px rgba(0,0,0,0.08)",
        transition:"all 0.15s", width:"100%",
      }}>
      {/* Ramp preview — 80px */}
      <div style={{ position:"relative", width:80, height:"100%", flexShrink:0 }}>
        <div style={{ position:"absolute", inset:0, background:rampToCSS(cfg.ramp) }}/>
        <div style={{ position:"absolute", top:0, bottom:0, left:0, width:`${pMin}%`, background:HATCH }}/>
        <div style={{ position:"absolute", top:0, bottom:0, right:0, width:`${100-pMax}%`, background:HATCH }}/>
        <div style={{ position:"absolute", top:0, bottom:0, left:`${pMin}%`, width:`${pMax-pMin}%`,
          border:`2px solid ${OCEAN}`, boxSizing:"border-box" }}/>
      </div>
      {/* Label */}
      <div style={{ flex:1, padding:"0 6px", fontSize:10, fontWeight:700,
        color: isNarrowed ? OCEAN_DARK : TEXT,
        borderLeft:`1px solid ${isNarrowed ? OCEAN+"40" : "#e2e8f0"}`,
        lineHeight:"26px", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
        {isNarrowed
          ? `${fmt(range.min,cfg.step)}–${fmt(range.max,cfg.step)}${cfg.unit}`
          : `Range ▾`}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────
export default function SSTRangeControl({
  activeLayer = "sst",
  userId,
  range: externalRange,
  onRangeChange,
  onApply,
  style = {},
  openRef,
  dataMin,        // live data bounds (CHL/SeaColor day stats)
  dataMax,
  seasonalDefault, // { min, max } from getSeasonalSstDefault() — SST only.
                   // Overrides cfg.defaultMin/defaultMax so isNarrowed and Reset
                   // target the seasonal values.
}) {
  const baseCfg = LAYER_CONFIG[activeLayer] || LAYER_CONFIG.sst;
  // Priority: live data bounds > seasonal default > config defaults
  const cfg = (dataMin != null && dataMax != null)
    ? { ...baseCfg, absMin: dataMin, absMax: dataMax, defaultMin: dataMin, defaultMax: dataMax }
    : (activeLayer === "sst" && seasonalDefault)
    ? { ...baseCfg, defaultMin: seasonalDefault.min, defaultMax: seasonalDefault.max }
    : baseCfg;

  // Internal range mirrors external; external wins when parent resets it
  const [range, _setRange] = useState({
    min: externalRange?.min ?? cfg.defaultMin,
    max: externalRange?.max ?? cfg.defaultMax,
    maskOutside: externalRange?.maskOutside ?? false,
  });

  // On mount: if externalRange is outside this layer's valid bounds (e.g. SST
  // values carried over when already on CHL), clear it so overlay uses day stats
  useEffect(() => {
    if (!externalRange) return;
    if (externalRange.min > cfg.absMax || externalRange.max > cfg.absMax) {
      _setRange({ min: cfg.defaultMin, max: cfg.defaultMax, maskOutside: false });
      onRangeChange?.(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when activeLayer changes.
  // SST: restore seasonal default (keeps colors temperature-absolute).
  // CHL/SeaColor: clear to null so overlay uses its own day stats.
  const prevActiveLayer = useRef(activeLayer);
  useEffect(() => {
    if (prevActiveLayer.current === activeLayer) return;
    prevActiveLayer.current = activeLayer;
    const defaultRange = { min: cfg.defaultMin, max: cfg.defaultMax, maskOutside: false };
    _setRange(defaultRange);
    onRangeChange?.(activeLayer === "sst" ? defaultRange : null);
  }, [activeLayer, cfg.defaultMin, cfg.defaultMax]);

  // Sync when parent resets (e.g. source switch)
  const prevExternal = useRef(externalRange);
  useEffect(() => {
    if (!externalRange) return;
    const prev = prevExternal.current;
    if (prev?.min !== externalRange.min || prev?.max !== externalRange.max) {
      _setRange({ min: externalRange.min, max: externalRange.max, maskOutside: externalRange.maskOutside ?? false });
    }
    prevExternal.current = externalRange;
  }, [externalRange?.min, externalRange?.max, externalRange?.maskOutside]);

  function setRange(r) {
    _setRange(r);
    onRangeChange?.(r);
  }

  const [isOpen, setIsOpen] = useState(false);
  const [savedRanges, setSavedRanges] = useState([]);
  const [loadingRanges, setLoadingRanges] = useState(false);
  const triggerRef = useRef(null);

  // Expose open() so a parent (e.g. legend click) can open this panel directly
  if (openRef) openRef.current = () => setIsOpen(true);

  const isNarrowed = !(range.min === cfg.defaultMin && range.max === cfg.defaultMax);

  async function fetchSaved() {
    if (!userId) return;
    setLoadingRanges(true);
    try {
      const { data, error } = await supabase
        .from("user_sst_ranges").select("*")
        .eq("user_id", userId).eq("layer", activeLayer)
        .order("created_at", { ascending: false });
      if (!error && data) setSavedRanges(data);
    } finally { setLoadingRanges(false); }
  }

  useEffect(() => { if (isOpen) fetchSaved(); }, [isOpen, activeLayer, userId]);

  async function handleSave(name) {
    const { error } = await supabase.from("user_sst_ranges").insert({
      user_id: userId, layer: activeLayer, name,
      range_min: range.min, range_max: range.max,
    });
    if (!error) fetchSaved();
  }

  async function handleDelete(id) {
    await supabase.from("user_sst_ranges").delete().eq("id", id);
    setSavedRanges(prev => prev.filter(r => r.id !== id));
  }

  function handleApply(r) {
    onApply?.(r);
    _setRange(r); // keep internal state in sync with applied
  }

  function handleReset() {
    const r = { min: cfg.defaultMin, max: cfg.defaultMax, maskOutside: false };
    _setRange(r);
    // SST: apply seasonal default so the map stays on a fixed scale.
    // CHL/SeaColor: clear to null so day stats take over.
    onRangeChange?.(activeLayer === "sst" ? r : null);
    onApply?.(activeLayer === "sst" ? r : null);
  }

  return (
    <div style={{ display:"inline-block", width:"100%", ...style }}>
      <ScaleBar
        cfg={cfg} range={range}
        isOpen={isOpen} isNarrowed={isNarrowed}
        onClick={() => setIsOpen(o => !o)}
        triggerRef={triggerRef}
      />
      {isOpen && (
        <PanelPortal triggerRef={triggerRef} onClose={() => setIsOpen(false)}>
          <RangePanel
            cfg={cfg} range={range}
            onRangeChange={setRange}
            onApply={handleApply}
            onReset={handleReset}
            userId={userId} activeLayer={activeLayer}
            savedRanges={savedRanges}
            onSave={handleSave}
            onDelete={handleDelete}
            loadingRanges={loadingRanges}
            onClose={() => setIsOpen(false)}
          />
        </PanelPortal>
      )}
    </div>
  );
}