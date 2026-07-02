import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const SST_STOPS = [
  [0,    [15,  40,  140]],
  [0.2,  [0,   130, 200]],
  [0.4,  [0,   200, 180]],
  [0.6,  [50,  210,  50]],
  [0.75, [255, 220,   0]],
  [0.9,  [255, 120,   0]],
  [1,    [220,  30,  30]],
];

function interpColor(t) {
  let lower = SST_STOPS[0], upper = SST_STOPS[SST_STOPS.length - 1];
  for (let i = 0; i < SST_STOPS.length - 1; i++) {
    if (t >= SST_STOPS[i][0] && t <= SST_STOPS[i + 1][0]) {
      lower = SST_STOPS[i]; upper = SST_STOPS[i + 1]; break;
    }
  }
  const lt = (upper[0] === lower[0]) ? 0 : (t - lower[0]) / (upper[0] - lower[0]);
  const r = Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * lt);
  const g = Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * lt);
  const b = Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * lt);
  return [r, g, b];
}

// Returns the map color for a given temperature, respecting the anchored range.
// rangeMin/rangeMax define the color anchors; min/max are the data extent.
function sstColorAnchored(val, min, max, rangeMin, rangeMax) {
  if (val == null || !Number.isFinite(val)) return "transparent";
  const rMin = rangeMin ?? min;
  const rMax = rangeMax ?? max;
  const t = Math.max(0, Math.min(1, (val - rMin) / (rMax - rMin)));
  const [r, g, b] = interpColor(t);
  return `rgb(${r},${g},${b})`;
}

// Build a CSS linear-gradient string that accurately reflects the color each
// temperature gets on the map, sampled across the actual data range [min, max].
function buildBarGradient(min, max, rangeMin, rangeMax) {
  if (min == null || max == null || min >= max) {
    return "linear-gradient(to right, rgb(15,40,140), rgb(0,130,200), rgb(0,200,180), rgb(50,210,50), rgb(255,220,0), rgb(255,120,0), rgb(220,30,30))";
  }
  const N = 24;
  const stops = Array.from({ length: N }, (_, i) => {
    const val = min + (i / (N - 1)) * (max - min);
    return sstColorAnchored(val, min, max, rangeMin, rangeMax);
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export default function SSTLegend({ sstMin, sstMax, hoverSst, rangeMin, rangeMax, onClick }) {
  const barRef = useRef(null);
  const [localHoverTemp, setLocalHoverTemp] = useState(null);
  const [bubblePos, setBubblePos] = useState(null);

  // Always show the actual data range so the user sees real temperatures.
  // Colors are still anchored at rangeMin/rangeMax — the bar gradient reflects this.
  const displayMin = sstMin;
  const displayMax = sstMax;

  const activeTemp = localHoverTemp ?? hoverSst;
  const activeT = (activeTemp != null && displayMin != null && displayMax != null && displayMax > displayMin)
    ? Math.max(0, Math.min(1, (activeTemp - displayMin) / (displayMax - displayMin)))
    : null;

  useEffect(() => {
    if (activeT == null || !barRef.current) { setBubblePos(null); return; }
    const rect = barRef.current.getBoundingClientRect();
    const x = rect.left + activeT * rect.width;
    const y = rect.top;
    setBubblePos({ x, y });
  }, [activeT, hoverSst, localHoverTemp]);

  function onBarMouseMove(e) {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || !displayMin || !displayMax) return;
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setLocalHoverTemp(displayMin + t * (displayMax - displayMin));
  }

  function onBarMouseLeave() {
    setLocalHoverTemp(null);
  }

  const barGradient = buildBarGradient(displayMin, displayMax, rangeMin, rangeMax);

  return (
    <div className="mt-2 flex items-center gap-3" onClick={onClick} style={{ ...(onClick ? { cursor: "pointer" } : {}) }}>
      <span className="text-xs text-slate-500 whitespace-nowrap font-medium">
        {displayMin != null ? displayMin.toFixed(1) : "—"}°F
      </span>

      <div className="relative flex-1 flex items-center" style={{ height: 20 }}>
        <div
          ref={barRef}
          className="w-full h-3 rounded-full cursor-crosshair"
          style={{ background: barGradient }}
          onMouseMove={onBarMouseMove}
          onMouseLeave={onBarMouseLeave}
        />
        {activeT != null && (
          <div
            className="absolute pointer-events-none w-0.5 h-5 bg-white/90 rounded-full shadow-lg"
            style={{ left: `${activeT * 100}%`, top: "50%", transform: "translateX(-50%) translateY(-50%)" }}
          />
        )}
      </div>

      <span className="text-xs text-slate-500 whitespace-nowrap font-medium">
        {displayMax != null ? displayMax.toFixed(1) : "—"}°F
      </span>
      {onClick && <spa