import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

function sstColor(val, min, max) {
  if (val === null || val === undefined) return "transparent";
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  const stops = [
    [0, [15, 40, 140]],
    [0.2, [0, 130, 200]],
    [0.4, [0, 200, 180]],
    [0.6, [50, 210, 50]],
    [0.75, [255, 220, 0]],
    [0.9, [255, 120, 0]],
    [1, [220, 30, 30]],
  ];
  let lower = stops[0], upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lower = stops[i]; upper = stops[i + 1]; break;
    }
  }
  const lt = (t - lower[0]) / (upper[0] - lower[0]);
  const r = Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * lt);
  const g = Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * lt);
  const b = Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * lt);
  return `rgb(${r},${g},${b})`;
}

export default function SSTLegend({ sstMin, sstMax, hoverSst, rangeMin, rangeMax, onClick }) {
  const barRef = useRef(null);
  const [localHoverTemp, setLocalHoverTemp] = useState(null);
  const [bubblePos, setBubblePos] = useState(null); // { x, y } in viewport coords

  const activeTemp = localHoverTemp ?? hoverSst;
  const activeT = activeTemp != null
    ? Math.max(0, Math.min(1, (activeTemp - sstMin) / (sstMax - sstMin)))
    : null;

  // Recompute bubble screen position whenever activeT changes
  useEffect(() => {
    if (activeT == null || !barRef.current) { setBubblePos(null); return; }
    const rect = barRef.current.getBoundingClientRect();
    const x = rect.left + activeT * rect.width;
    const y = rect.top; // bubble goes above the bar
    setBubblePos({ x, y });
  }, [activeT, hoverSst, localHoverTemp]);

  function onBarMouseMove(e) {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setLocalHoverTemp(sstMin + t * (sstMax - sstMin));
  }

  function onBarMouseLeave() {
    setLocalHoverTemp(null);
  }

  return (
    <div className="mt-2 flex items-center gap-3" onClick={onClick} style={{ ...(onClick ? { cursor: "pointer" } : {}) }}>
      <span className="text-xs text-slate-500 whitespace-nowrap font-medium">{sstMin != null ? sstMin.toFixed(1) : "—"}°F</span>

      <div className="relative flex-1 flex items-center" style={{ height: 20 }}>
        {/* Gradient bar */}
        <div
          ref={barRef}
          className="w-full h-3 rounded-full cursor-crosshair"
          style={{
            background: "linear-gradient(to right, rgb(15,40,140), rgb(0,130,200), rgb(0,200,180), rgb(50,210,50), rgb(255,220,0), rgb(255,120,0), rgb(220,30,30))"
          }}
          onMouseMove={onBarMouseMove}
          onMouseLeave={onBarMouseLeave}
        />
        {/* Pin line only — no bubble here */}
        {activeT != null && (
          <div
            className="absolute pointer-events-none w-0.5 h-5 bg-white/90 rounded-full shadow-lg"
            style={{ left: `${activeT * 100}%`, top: "50%", transform: "translateX(-50%) translateY(-50%)" }}
          />
        )}
      </div>

      <span className="text-xs text-slate-500 whitespace-nowrap font-medium">{sstMax != null ? sstMax.toFixed(1) : "—"}°F</span>
      {onClick && <span className="text-[10px] text-slate-400 whitespace-nowrap ml-1" title="Click to adjust range">⚙</span>}

      {/* Bubble rendered via portal so no ancestor can clip it */}
      {bubblePos && activeTemp != null && createPortal(
        <div
          style={{
            position: "fixed",
            left: bubblePos.x,
            top: bubblePos.y - 32,
            transform: "translateX(-50%)",
            zIndex: 99999,
            pointerEvents: "none",
            background: sstColor(activeTemp, sstMin, sstMax),
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.25)",
          }}
        >
          {activeTemp.toFixed(1)}°F
        </div>,
        document.body
      )}
    </div>
  );
}