// src/components/weather/NearshoreOffshoreToggle.jsx
// Segmented control letting the user switch between the nearshore (0-20nm)
// and offshore (20-60nm) NOAA marine zone forecast, for locations that have
// both (see useMarineForecast's hasNearshore). Rendered inside
// ImmediateOutlook, above the first ForecastCard.
//
// The selected mode is NOT reset per-location — it persists globally across
// locations and sessions via localStorage (see useMarineForecast's
// setZoneMode/getStoredZoneMode). If the user switches to a location with no
// nearshore zone, this component just isn't rendered; the stored preference
// is left untouched and restored the next time an open-ocean location is
// selected.
//
// No emojis/decorative icons per project design rules — text + color only.

import React from "react";

export default function NearshoreOffshoreToggle({ zoneMode, onChange }) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold"
      role="group"
      aria-label="Forecast range"
    >
      <ToggleButton active={zoneMode === "nearshore"} onClick={() => onChange("nearshore")}>
        Nearshore <span className="font-normal opacity-70">&middot; 0-20nm</span>
      </ToggleButton>
      <ToggleButton active={zoneMode === "offshore"} onClick={() => onChange("offshore")}>
        Offshore <span className="font-normal opacity-70">&middot; 20-60nm</span>
      </ToggleButton>
    </div>
  );
}

function ToggleButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "px-2.5 py-1 rounded-md transition-colors " +
        (active ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}
