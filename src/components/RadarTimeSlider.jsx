import React, { useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";

// Bottom time-scrubber for the RainViewer radar overlay. Mirrors WindTimeSlider.jsx's
// layout/behavior (play/pause + range input + current-time pill) but for a flat list of
// radar frames (~2 hours of 10-min-interval past frames) instead of multi-day wind hours.
export default function RadarTimeSlider({ frames, frameIndex, setFrameIndex, isPlaying, setIsPlaying, bottomOffset = 0 }) {
  const nFrames = frames?.length ?? 0;
  const playRef = useRef(null);

  useEffect(() => {
    if (isPlaying) {
      playRef.current = setInterval(() => {
        setFrameIndex(i => { if (i >= nFrames - 1) { setIsPlaying(false); return i; } return i + 1; });
      }, 600);
    } else {
      clearInterval(playRef.current);
    }
    return () => clearInterval(playRef.current);
  }, [isPlaying, nFrames]);

  if (!nFrames) return null;

  const currentTime = frames[frameIndex]?.time ?? null;
  const isLatest = frameIndex === nFrames - 1;
  const thumbPct = nFrames > 1 ? (frameIndex / (nFrames - 1)) * 100 : 0;

  function fmtTime(unixSeconds) {
    if (!unixSeconds) return "";
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  }

  return (
    <div className="absolute left-0 right-0 z-[600] select-none" style={{ bottom: bottomOffset, background: "rgba(23,28,38,0.72)", backdropFilter: "blur(8px)" }}>
      {/* Custom track/thumb styling -- the unstyled native <input type=range> track is
          nearly invisible against this dark translucent bar (browser default track is a
          thin, low-contrast line), which read as "no controls" in testing. */}
      <style>{`
        .radar-range-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.25); outline: none; }
        .radar-range-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #0891b2; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: pointer; }
        .radar-range-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #0891b2; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); cursor: pointer; }
        .radar-range-slider::-moz-range-track { height: 6px; border-radius: 3px; background: rgba(255,255,255,0.25); }
      `}</style>
      <div className="relative" style={{ height: 24, pointerEvents: "none" }}>
        <div className="absolute flex flex-col items-center" style={{ left: `clamp(60px, calc(52px + (100% - 60px) * ${thumbPct / 100}), calc(100% - 60px))`, transform: "translateX(-50%)", top: 2 }}>
          <div className="text-[11px] font-semibold text-white px-2 py-0.5 rounded" style={{ background: "#0891b2", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
            {fmtTime(currentTime)}{isLatest ? " (latest)" : ""}
          </div>
        </div>
      </div>
      <div className="flex items-stretch" style={{ height: 48 }}>
        <div className="flex-shrink-0 flex items-center justify-center px-3" style={{ width: 52 }}>
          <button
            onClick={() => { if (frameIndex >= nFrames - 1) setFrameIndex(0); setIsPlaying(p => !p); }}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "#374151", border: "2px solid #6b7280" }}
          >
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
          </button>
        </div>
        <div className="flex-1 relative flex flex-col justify-center pr-3 pl-1">
          <input
            type="range" min={0} max={nFrames - 1} value={frameIndex}
            onChange={e => { setIsPlaying(false); setFrameIndex(Number(e.target.value)); }}
            className="radar-range-slider cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
