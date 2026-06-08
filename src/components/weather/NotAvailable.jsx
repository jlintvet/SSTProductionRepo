// src/components/weather/NotAvailable.jsx
// Empty state shown in the WeatherDrawer when the user picks an SST location
// that isn't in the NOAAPARSE coverage set. Per spec we just say "not
// available" — we don't offer to switch to the nearest covered location.

import React from "react";
import { CloudOff } from "lucide-react";

export default function NotAvailable({ locationLabel }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-slate-500">
      <CloudOff className="w-10 h-10 text-slate-300 mb-3" strokeWidth={1.5} />
      <p className="text-sm font-medium text-slate-600">
        Marine forecast not available
      </p>
      {locationLabel && (
        <p className="text-xs text-slate-400 mt-1">for {locationLabel}</p>
      )}
      <p className="text-[11px] text-slate-400 mt-3 max-w-[260px] leading-relaxed">
        SST and ocean data are still available on the map for this location.
      </p>
    </div>
  );
}