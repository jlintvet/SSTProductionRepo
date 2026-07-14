// src/components/TimeScrubber.jsx
// Shared bottom time-scrub bar used by both the Wind time animation and the
// Radar (RainViewer) time animation. Consolidated from the former
// WindTimeSlider.jsx + RadarTimeSlider.jsx so the two stay visually and
// behaviorally in sync (same track/button layout, same tooltip-overflow
// clamp, same mobile-safe bottom offset) instead of drifting apart.
//
// Z-order: this bar renders at z-600 (see TopBar.jsx z-order scale comment).
// On mobile, WeatherBottomSheet is pinned to the bottom at z-1000 with a
// minimum 56px "peek" height that is always present -- without an offset
// this bar's bottom edge (where the play button + track live) renders
// underneath it, leaving only the time tooltip pill visible above the peek
// bar. The `avoidMobileWeatherSheet` prop (on by default) adds that 56px
// clearance via a mobile-only media query matching Tailwind's `sm`
// breakpoint (640px), the same one WeatherBottomSheet uses via `sm:hidden`.
import React, { useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

const WIND_COLOR_SCALE = ["#0000ff","#0055ff","#0099ff","#00ccff","#00ffcc","#00ff88","#00ff00","#88ff00","#ccff00","#ffff00","#ffcc00","#ff9900","#ff6600","#ff3300","#ff0000","#cc0000"];

export function WindLegend({ maxSpeed }) {
  const BAR_W = 200;
  const allTicks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60];
  const ticks = allTicks.filter(t => t <= Math.ceil(maxSpeed / 5) * 5 + 5);
  const scaleMax = ticks[ticks.length - 1];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/70 font-medium flex-shrink-0">kt</span>
      <div className="flex-shrink-0" style={{ width: BAR_W }}>
        <div className="rounded-sm" style={{ height: 10, background: `linear-gradient(to right, ${WIND_COLOR_SCALE.join(",")})` }} />
        <div className="relative" style={{ height: 14 }}>
          {ticks.map(t => (
            <span key={t} className="absolute text-[9px] text-white/80 tabular-nums font-medium" style={{ left: `${(t / scaleMax) * 100}%`, transform: "translateX(-50%)", top: 1 }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TimeScrubber({
  items, getTime, index, setIndex, isPlaying, setIsPlaying,
  playIntervalMs = 2000, accentColor = "#0891b2", showDayTabs = false,
  formatTooltip, dayLabel, dayKey, legend = null,
  bottomOffset = 0, avoidMobileWeatherSheet = true,
}) {
  const n = items?.length ?? 0;
  const playRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setIndex(i => { if (i >= n - 1) { setIsPlaying(false); return i; } return i + 1; });
      }, playIntervalMs);
    } else { clearInterval(playRef.current); }
    return () => clearInterval(playRef.current);
  }, [isPlaying, n, playIntervalMs]);

  if (!n) return null;

  const current = items[index];
  const currentDate = current ? getTime(current) : null;
  const isLast = index === n - 1;

  const days = [];
  if (showDayTabs) {
    let curDay = null;
    items.forEach((item, i) => {
      const d = getTime(item);
      const key = dayKey(d);
      if (!curDay || curDay.key !== key) { curDay = { key, label: dayLabel(d), startIdx: i, count: 0 }; days.push(curDay); }
      curDay.count++;
    });
  }

  const thumbPct = n > 1 ? (index / (n - 1)) * 100 : 0;
  const uid = `ts-${accentColor.replace("#", "")}`;

  return (
    <div className={`absolute left-0 right-0 z-[600] select-none ${avoidMobileWeatherSheet ? `${uid}-clear` : ""}`}
      style={{ "--ts-bottom": `${bottomOffset}px`, bottom: `var(--ts-bottom)`, background: "rgba(23,28,38,0.72)", backdropFilter: "blur(8px)" }}>
      {avoidMobileWeatherSheet && (
        <style>{`
          @media (max-width: 639px) {
            .${uid}-clear { bottom: calc(var(--ts-bottom) + 56px) !important; }
          }
        `}</style>
      )}
      <style>{`
        .${uid}-range { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.25); outline: none; }
        .${uid}-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${accentColor}; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: pointer; }
        .${uid}-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${accentColor}; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: pointer; }
        .${uid}-range::-moz-range-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.25); }
      `}</style>
      <div className="relative" style={{ height: 28, pointerEvents: "none" }}>
        <div className="absolute flex flex-col items-center"
          style={{ left: `clamp(60px, calc(52px + (100% - 60px) * ${thumbPct / 100}), calc(100% - 60px))`, transform: "translateX(-50%)", top: 4 }}>
          <div className="text-[11px] font-semibold text-white px-2 py-0.5 rounded" style={{ background: accentColor, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
            {formatTooltip(currentDate, current, index, isLast)}
          </div>
        </div>
      </div>
      <div className="flex items-stretch" style={{ height: 52 }}>
        <div className="flex-shrink-0 flex items-center justify-center px-3" style={{ width: 52 }}>
          <button onClick={() => { if (index >= n - 1) setIndex(0); setIsPlaying(p => !p); }}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "#374151", border: "2px solid #6b7280" }}>
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
          </button>
        </div>
        <div className="flex-1 relative flex flex-col justify-end pb-1 pr-1">
          {showDayTabs && (
            <div className="flex absolute top-0 left-0 right-0" style={{ height: 22 }}>
              {days.map((day, di) => {
                const isActive = index >= day.startIdx && index < day.startIdx + day.count;
                return (
                  <div key={day.key} onClick={() => { setIsPlaying(false); setIndex(day.startIdx); }}
                    className="flex items-center justify-center border-r border-white/10 text-[11px] cursor-pointer select-none transition-colors hover:bg-white/10"
                    style={{ width: `${(day.count / n) * 100}%`, color: isActive ? "#fff" : "#9ca3af", fontWeight: isActive ? 700 : 400, background: di % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                    {day.label}
                  </div>
                );
              })}
            </div>
          )}
          <input type="range" min={0} max={n - 1} value={index}
            onChange={e => { setIsPlaying(false); setIndex(Number(e.target.value)); }}
            className={`${uid}-range cursor-pointer`}
            style={{ height: 24 }} />
        </div>
        {legend && (<div className="flex-shrink-0 flex items-center pr-4 pl-2">{legend}</div>)}
      </div>
    </div>
  );
}
