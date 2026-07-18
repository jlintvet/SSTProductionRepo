// src/components/weather/WeatherDrawer.jsx
// The desktop weather panel. Three states controlled by AppContext.weatherPanel:
//
//   'expanded'  → ~380px wide. Header with title + collapse/hide buttons.
//                 Body scrolls internally and shows ImmediateOutlook +
//                 ExtendedOutlook (or NotAvailable, or loading/error states).
//
//   'collapsed' → 52px-wide rail. Vertical strip showing current conditions:
//                 wind speed/direction, day temp, wave height. Click anywhere
//                 to expand.
//
//   'hidden'    → returns null. The map gets the freed space. A floating
//                 "Show weather" pill appears separately (rendered by
//                 AppShell, not here) so the user can bring the drawer back.
//
// This component is desktop-only. Mobile uses WeatherBottomSheet instead;
// AppShell decides which to render based on viewport.

import React from "react";
import { ChevronLeft, ChevronRight, X, Loader2, AlertCircle } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useMarineForecast } from "@/hooks/useMarineForecast";
import ImmediateOutlook from "@/components/weather/ImmediateOutlook";
import ExtendedOutlook from "@/components/weather/ExtendedOutlook";
import NotAvailable from "@/components/weather/NotAvailable";
import { getWeatherIcon } from "@/components/weather/ForecastCard";

const Z_DRAWER = 1000; // see TopBar.jsx for full z-order scale

const W_EXPANDED  = 380;
const W_COLLAPSED = 52;

export default function WeatherDrawer() {
  const { selectedLocation, weatherPanel, setWeatherPanel } = useAppContext();
  const { data, loading, error, isAvailable, hasNearshore, zoneMode, setZoneMode } = useMarineForecast(selectedLocation);

  if (weatherPanel === "hidden") return null;

  const isCollapsed = weatherPanel === "collapsed";

  return (
    <aside
      className="flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-[width] duration-200"
      style={{
        width:  isCollapsed ? W_COLLAPSED : W_EXPANDED,
        zIndex: Z_DRAWER,
      }}
      aria-label="Marine weather panel"
    >
      {isCollapsed ? (
        <CollapsedRail
          location={selectedLocation}
          data={data}
          isAvailable={isAvailable}
          onExpand={() => setWeatherPanel("expanded")}
        />
      ) : (
        <ExpandedView
          location={selectedLocation}
          data={data}
          loading={loading}
          error={error}
          isAvailable={isAvailable}
          hasNearshore={hasNearshore}
          zoneMode={zoneMode}
          setZoneMode={setZoneMode}
          onCollapse={() => setWeatherPanel("collapsed")}
          onHide={() => setWeatherPanel("hidden")}
        />
      )}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expanded — full forecast panel
// ─────────────────────────────────────────────────────────────────────────────
function ExpandedView({ location, data, loading, error, isAvailable, hasNearshore, zoneMode, setZoneMode, onCollapse, onHide }) {
  return (
    <>
      <header className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Marine Forecast</p>
          <p className="text-sm font-semibold text-slate-700 truncate">{location?.label ?? "—"}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onCollapse}
            className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500"
            title="Collapse to rail"
            aria-label="Collapse weather panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onHide}
            className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500"
            title="Hide weather panel"
            aria-label="Hide weather panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!isAvailable ? (
          <NotAvailable locationLabel={location?.label} />
        ) : loading && !data ? (
          <LoadingState />
        ) : error && !data ? (
          <ErrorState error={error} />
        ) : data ? (
          <>
            <ImmediateOutlook
              forecasts={data.forecast?.forecasts}
              nwsForecast={data.nws}
              tideData={data.tides}
              sunData={data.sun}
              locationLabel={location?.label}
              forecastHourlyUrl={data.forecastHourlyUrl}
              noaaZone={data.noaaZone}
              hasNearshore={hasNearshore}
              zoneMode={zoneMode}
              onZoneModeChange={setZoneMode}
            />
            <ExtendedOutlook
              forecasts={data.forecast?.forecasts}
              nwsForecast={data.nws}
              tideData={data.tides}
              sunData={data.sun}
              locationLabel={location?.label}
              forecastHourlyUrl={data.forecastHourlyUrl}
              noaaZone={data.noaaZone}
            />
            {data.forecast?.timestamp && (
              <p className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-100">
                Source: {data.forecast.timestamp}
              </p>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin text-cyan-500 mb-2" />
      <p className="text-xs">Loading marine forecast…</p>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-slate-500 text-center">
      <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
      <p className="text-sm font-medium text-slate-600">Forecast unavailable</p>
      <p className="text-xs text-slate-400 mt-1 max-w-[260px]">{error?.message ?? "Could not load weather data."}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsed — vertical rail showing the most important glance-able info
// ─────────────────────────────────────────────────────────────────────────────
function CollapsedRail({ location, data, isAvailable, onExpand }) {
  const firstForecast = data?.forecast?.forecasts?.[0];
  const firstNwsKey = data?.nws ? Object.keys(data.nws)[0] : null;
  const nws = firstNwsKey ? data.nws[firstNwsKey] : null;

  const windText  = firstForecast ? `${firstForecast.wind_direction ?? ""} ${firstForecast.wind_speed ?? ""}`.trim() : null;
  const waveText  = firstForecast?.wave_height ?? null;
  const tempText  = nws?.high != null ? `${nws.high}°` : null;
  const condIcon  = getWeatherIcon(nws?.dayForecast, 22);

  return (
    <button
      onClick={onExpand}
      className="flex flex-col items-center justify-start gap-3 h-full w-full py-3 hover:bg-slate-50 transition-colors group"
      title="Expand weather panel"
      aria-label="Expand weather panel"
    >
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />

      {!isAvailable ? (
        <span className="text-[9px] text-slate-300 font-semibold uppercase tracking-wide [writing-mode:vertical-rl] rotate-180">
          No forecast
        </span>
      ) : (
        <>
          {tempText && (
            <span className="text-base font-bold text-slate-700 tabular-nums">{tempText}</span>
          )}
          <span className="text-xl leading-none" aria-hidden>{condIcon}</span>
          {windText && (
            <span className="text-[10px] text-slate-500 font-semibold tabular-nums whitespace-nowrap [writing-mode:vertical-rl]">
              {windText}
            </span>
          )}
          {waveText && (
            <span className="text-[10px] text-cyan-600 font-semibold tabular-nums [writing-mode:vertical-rl]">
              {waveText}
            </span>
          )}
        </>
      )}

      <span className="text-[9px] text-slate-300 font-semibold uppercase tracking-wide [writing-mode:vertical-rl] mt-auto">
        Weather
      </span>
    </button>
  );
}