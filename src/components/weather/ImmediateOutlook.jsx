// src/components/weather/ImmediateOutlook.jsx
// Renders the first 3 forecast cards (today, tomorrow, tomorrow night) inside
// a collapsible "Immediate Outlook" section. Defaults to open.
//
// 2026-05-04-FIXES-2: Added (?) help icon next to "Immediate Outlook" title.
// Tapping it opens a popover listing all data sources used for the marine
// forecast cards, with the relevant URLs and last-updated info where
// available.

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, HelpCircle, X } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ForecastCard from "@/components/weather/ForecastCard";
import NearshoreOffshoreToggle from "@/components/weather/NearshoreOffshoreToggle";

export default function ImmediateOutlook({ forecasts, nwsForecast, tideData, sunData, locationLabel, forecastTimestamp, forecastHourlyUrl, noaaZone, hasNearshore, zoneMode, onZoneModeChange }) {
  if (!forecasts?.length) return null;

  const cards = forecasts.slice(0, 3);

  return (
    <Collapsible defaultOpen={true} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-sm font-semibold text-slate-800 hover:text-slate-600 transition-colors group text-left">
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          Immediate Outlook
        </CollapsibleTrigger>
        <DataSourcesHelp
          locationLabel={locationLabel}
          forecastTimestamp={forecastTimestamp}
        />
      </div>

      <CollapsibleContent>
        <div className="space-y-3">
          {hasNearshore && (
            <NearshoreOffshoreToggle zoneMode={zoneMode} onChange={onZoneModeChange} />
          )}
          {cards.map((forecast, index) => (
            <ForecastCard
              key={index}
              forecast={forecast}
              dayOffset={index}
              badgeLabel={index === 0 ? "Current" : `+${index}`}
              nwsForecast={nwsForecast}
              tideData={tideData}
              sunData={sunData}
              locationLabel={locationLabel}
              forecastHourlyUrl={forecastHourlyUrl}
              noaaZone={noaaZone}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// (?) Data Sources help popover
// ─────────────────────────────────────────────────────────────────────────────
function DataSourcesHelp({ locationLabel, forecastTimestamp }) {
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (popRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onEsc(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Show data sources"
        title="Where does this data come from?"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-7 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-xl p-3 text-xs"
          style={{ zIndex: 800 }}
          role="dialog"
          aria-label="Data sources"
        >
          <div className="flex items-start justify-between mb-2 pb-2 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700 text-sm">Data Sources</h3>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 -mr-1 -mt-0.5"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {locationLabel && (
            <p className="text-[10px] text-slate-500 mb-2 leading-tight">
              For <span className="font-semibold text-slate-700">{locationLabel}</span>
            </p>
          )}

          <dl className="space-y-2.5">
            <SourceRow
              label="Marine forecast"
              detail="Wind, seas, swell, narrative"
              source="NOAA NWS detailed forecast (HTML)"
              url="https://forecast.weather.gov/"
              note={forecastTimestamp ? `Last scraped: ${forecastTimestamp}` : "Refreshed via GitHub Actions on a schedule"}
            />
            <SourceRow
              label="Tide predictions"
              detail="High/low times and heights"
              source="NOAA CO-OPS Tides & Currents API"
              url="https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
              note="Live fetch, MLLW datum, local time"
            />
            <SourceRow
              label="Air temperature & sky"
              detail="High/low, conditions, precipitation %"
              source="NOAA NWS API"
              url="https://api.weather.gov/"
              note="Live fetch, gridded forecast"
            />
            <SourceRow
              label="Sunrise / sunset"
              detail="Solar times for each day"
              source="SunCalc library"
              url={null}
              note="Computed locally from coordinates — no network call"
            />
          </dl>

          <p className="text-[9px] text-slate-400 mt-3 pt-2 border-t border-slate-100 leading-snug">
            Marine forecast text is scraped from the public NWS forecast page and refreshed by a GitHub Actions workflow. All other data is fetched live each time you select a location (cached for 10 minutes).
          </p>
        </div>
      )}
    </div>
  );
}

function SourceRow({ label, detail, source, url, note }) {
  return (
    <div className="space-y-0.5">
      <dt className="font-semibold text-slate-700 text-[11px]">{label}</dt>
      <dd className="text-slate-500 text-[10px] leading-snug">{detail}</dd>
      <dd className="text-slate-600 text-[10px]">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-600 hover:text-cyan-700 hover:underline break-all"
          >
            {source}
          </a>
        ) : (
          <span>{source}</span>
        )}
      </dd>
      {note && <dd className="text-slate-400 text-[9px] italic leading-snug">{note}</dd>}
    </div>
  );
}