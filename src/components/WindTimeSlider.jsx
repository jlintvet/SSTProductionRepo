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

export default function WindTimeSlider({ windData, windHourIndex, setWindHourIndex, isPlaying, setIsPlaying, isWindMap }) {
  const hours = windData?.hours ?? [];
  const nHours = hours.length;
  const playRef = useRef(null);
  const trackRef = useRef(null);
  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setWindHourIndex(i => { if (i >= nHours - 1) { setIsPlaying(false); return i; } return i + 1; });
      }, 2333);
    } else { clearInterval(playRef.current); }
    return () => clearInterval(playRef.current);
  }, [isPlaying, nHours]);
  if (!nHours) return null;
  const currentTime = hours[windHourIndex]?.time ?? "";
  const maxSpeed = windData?.maxSpeed ?? 30;
  const days = []; let curDay = null;
  hours.forEach((h, i) => {
    const d = new Date(h.time + "Z");
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    const DN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    if (!curDay || curDay.key !== key) { curDay = { key, label: `${DN[d.getUTCDay()]} ${d.getUTCDate()}`, startIdx: i, count: 0 }; days.push(curDay); }
    curDay.count++;
  });
  const thumbPct = nHours > 1 ? (windHourIndex / (nHours - 1)) * 100 : 0;
  function fmtTooltip(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr + "Z"); const DN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const h = d.getUTCHours();
    const ampm = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h-12} PM`;
    return `${DN[d.getUTCDay()]} ${d.getUTCDate()} - ${ampm}`;
  }
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[600] select-none" style={{ background: "rgba(23,28,38,0.72)", backdropFilter: "blur(8px)" }}>
      <div className="relative" style={{ height: 28, pointerEvents: "none" }}>
        <div className="absolute flex flex-col items-center" style={{ left: `calc(52px + (100% - 52px - 8px) * ${thumbPct/100})`, transform: "translateX(-50%)", top: 4 }}>
          <div className="text-[11px] font-semibold text-white px-2 py-0.5 rounded" style={{ background: "#f59e0b", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>{fmtTooltip(currentTime)}</div>
        </div>
      </div>
      <div className="flex items-stretch" style={{ height: 52 }}>
        <div className="flex-shrink-0 flex items-center justify-center px-3" style={{ width: 52 }}>
          <button onClick={() => { if (windHourIndex >= nHours - 1) setWindHourIndex(0); setIsPlaying(p => !p); }} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors" style={{ background: "#374151", border: "2px solid #6b7280" }}>
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
          </button>
        </div>
        <div className="flex-1 relative flex flex-col justify-end pb-1 pr-1" ref={trackRef}>
          <div className="flex absolute top-0 left-0 right-0" style={{ height: 22 }}>
            {days.map((day, di) => {
              const isActive = windHourIndex >= day.startIdx && windHourIndex < day.startIdx + day.count;
              return (
                <div key={day.key} onClick={() => { setIsPlaying(false); setWindHourIndex(day.startIdx); }}
                  className="flex items-center justify-center border-r border-white/10 text-[11px] cursor-pointer select-none transition-colors hover:bg-white/10"
                  style={{ width: `${(day.count / nHours) * 100}%`, color: isActive ? "#fff" : "#9ca3af", fontWeight: isActive ? 700 : 400, background: di % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                  {day.label}
                </div>
              );
            })}
          </div>
          <input type="range" min={0} max={nHours - 1} value={windHourIndex} onChange={e => { setIsPlaying(false); setWindHourIndex(Number(e.target.value)); }} className="w-full appearance-none cursor-pointer" style={{ height: 24, accentColor: "#f59e0b", background: "transparent" }} />
        </div>
        {isWindMap && (<div className="flex-shrink-0 flex items-center pr-4 pl-2"><WindLegend maxSpeed={maxSpeed} /></div>)}
      </div>
    </div>
  );
}