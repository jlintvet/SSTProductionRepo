// src/components/shell/LocationPicker.jsx
// The location dropdown, promoted out of the SST map control panel and into
// the TopBar so it's the single source of truth for both SST and weather.
//
// Each option shows a small coverage indicator:
//   ● filled cyan dot  = SST + marine weather both available
//   ○ hollow gray dot  = SST only (no NOAA marine forecast scraper yet)
// The current selection's coverage is also reflected next to the trigger
// label so the user knows at a glance whether to expect weather data.

import React from "react";
import { ChevronDown } from "lucide-react";
import { useAppContext } from "@/context/AppContext";

export default function LocationPicker() {
  const { regionConfig, selectedLocation, setSelectedLocation } = useAppContext();
  const locations = regionConfig?.locations ?? [];

  if (!locations.length) return null;

  function handleChange(e) {
    const next = locations.find(l => l.label === e.target.value);
    if (next) setSelectedLocation(next);
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold flex-shrink-0 hidden sm:inline">
        Departure
      </span>

      <div className="relative">
        {/* Coverage dot in front of the trigger */}
        <CoverageDot covered={!!selectedLocation?.noaaCoverage} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />

        <select
          value={selectedLocation?.label ?? ""}
          onChange={handleChange}
          className="appearance-none bg-white border border-slate-300 rounded-lg pl-7 pr-7 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 cursor-pointer min-w-[180px] sm:min-w-[200px]"
          aria-label="Select departure location"
        >
          {locations.map(loc => (
            <option key={loc.label} value={loc.label}>
              {loc.label}
              {loc.noaaCoverage ? "" : "  (SST only)"}
            </option>
          ))}
        </select>

        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

function CoverageDot({ covered, className = "" }) {
  return (
    <span
      className={className}
      title={covered ? "Marine forecast available" : "Marine forecast not available for this location"}
    >
      <span
        className="block w-2 h-2 rounded-full"
        style={{
          background:    covered ? "#06b6d4" : "transparent",
          border:        covered ? "none"    : "1.5px solid #cbd5e1",
        }}
      />
    </span>
  );
}