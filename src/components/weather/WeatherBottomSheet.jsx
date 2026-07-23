// src/components/weather/WeatherBottomSheet.jsx
// Mobile equivalent of WeatherDrawer. Three snap points:
//
//   peek  → 56px  Single-line summary at the bottom of the screen.
//                 Map remains fully interactive above.
//   half  → 50vh  Immediate Outlook visible. Map still tappable above.
//   full  → 90vh  Both Immediate + Extended Outlooks. Effectively covers map.
//
// Snap point maps to AppContext.weatherPanel:
//   'hidden'    → peek    (mobile reuses 'hidden' to mean "not in the way")
//   'collapsed' → half
//   'expanded'  → full
//
// Implementation notes:
//   - No animation library. Pointer events + CSS transitions only.
//   - The whole sheet is a fixed-position element. Translation drives the
//     visible portion; the body content scrolls internally when at full
//     height.
//   - We only drag from the header grab area, not from the scrollable body,
//     so users can scroll cards without accidentally dragging the sheet.
//   - On drag release we snap to whichever of the three points is closest.

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ChevronUp, Loader2, AlertCircle } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { useMarineForecast } from "@/hooks/useMarineForecast";
import ImmediateOutlook from "@/components/weather/ImmediateOutlook";
import ExtendedOutlook from "@/components/weather/ExtendedOutlook";
import NotAvailable from "@/components/weather/NotAvailable";
import { getWeatherIcon } from "@/components/weather/ForecastCard";

const Z_SHEET = 1000; // see TopBar.jsx for full z-order scale

// Heights as fractions of viewport height except peek which is fixed pixels
const PEEK_PX   = 56;
const HALF_FRAC = 0.50;
const FULL_FRAC = 0.90;

function snapPointHeight(snap, vh) {
  if (snap === "peek") return PEEK_PX;
  if (snap === "half") return vh * HALF_FRAC;
  return vh * FULL_FRAC;
}

function panelStateToSnap(weatherPanel) {
  if (weatherPanel === "hidden")    return "peek";
  if (weatherPanel === "collapsed") return "half";
  return "full";
}

function snapToPanelState(snap) {
  if (snap === "peek") return "hidden";
  if (snap === "half") return "collapsed";
  return "expanded";
}

export default function WeatherBottomSheet() {
  const { selectedLocation, weatherPanel, setWeatherPanel } = useAppContext();
  const { data, loading, error, isAvailable, hasNearshore, zoneMode, setZoneMode } = useMarineForecast(selectedLocation);

  const snap = panelStateToSnap(weatherPanel);

  const [vh, setVh] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef(0);
  const startSnap  = useRef(snap);
  const sheetRef   = useRef(null);

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    startSnap.current = snap;
    setIsDragging(true);
  }, [snap]);

  const onPointerMove = useCallback((e) => {
    if (!isDragging) return;
    const dy = dragStartY.current - e.clientY; // positive when dragging up
    setDragOffset(dy);
  }, [isDragging]);

  const onPointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const startH = snapPointHeight(startSnap.current, vh);
    const finalH = startH + dragOffset;

    const peekH = snapPointHeight("peek", vh);
    const halfH = snapPointHeight("half", vh);
    const fullH = snapPointHeight("full", vh);

    const dPeek = Math.abs(finalH - peekH);
    const dHalf = Math.abs(finalH - halfH);
    const dFull = Math.abs(finalH - fullH);
    const min = Math.min(dPeek, dHalf, dFull);
    const nextSnap = min === dFull ? "full" : min === dHalf ? "half" : "peek";

    setDragOffset(0);
    setWeatherPanel(snapToPanelState(nextSnap));
  }, [isDragging, dragOffset, vh, setWeatherPanel]);

  const baseHeight   = snapPointHeight(snap, vh);
  const targetHeight = Math.max(PEEK_PX, Math.min(vh * FULL_FRAC, baseHeight + dragOffset));

  function cyclePeek() {
    if (snap === "peek")      setWeatherPanel("expanded");
    else if (snap === "half") setWeatherPanel("expanded");
    else                      setWeatherPanel("hidden");
  }

  return (
    <div
      ref={sheetRef}
      className="sm:hidden fixed left-0 right-0 bottom-0 bg-white border-t border-slate-200 rounded-t-xl shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
      style={{
        height:      `${targetHeight}px`,
        zIndex:      Z_SHEET,
        transition:  isDragging ? "none" : "height 200ms ease-out",
        touchAction: "none",
      }}
      role="dialog"
      aria-label="Marine weather panel"
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <button
          onClick={cyclePeek}
          className="w-full px-3 py-1.5 flex items-center gap-2 text-left"
          aria-label={`Weather panel — currently ${snap}, tap to expand`}
        >
          <PeekSummary location={selectedLocation} data={data} isAvailable={isAvailable} />
          <ChevronUp
            className="w-4 h-4 text-slate-400 ml-auto flex-shrink-0 transition-transform"
            style={{ transform: snap === "full" ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-4 border-t border-slate-100">
        {snap === "peek" ? null : !isAvailable ? (
          <NotAvailable locationLabel={selectedLocation?.label} />
        ) : loading && !data ? (
          <div className="flex flex-col items-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500 mb-2" />
            <p className="text-xs">Loading marine forecast…</p>
          </div>
        ) : error && !data ? (
          <div className="flex flex-col items-center py-8 px-4 text-center text-slate-500">
            <AlertCircle className="w-6 h-6 text-amber-400 mb-2" />
            <p className="text-sm font-medium text-slate-600">Forecast unavailable</p>
            <p className="text-xs text-slate-400 mt-1">{error?.message ?? "Could not load weather data."}</p>
          </div>
        ) : data ? (
          <>
            <div className="pt-3">
              <ImmediateOutlook
                forecasts={data.forecast?.forecasts}
                nwsForecast={data.nws}
                tideData={data.tides}
                tideStation={data.tideStation}
                sunData={data.sun}
                locationLabel={selectedLocation?.label}
                forecastHourlyUrl={data.forecastHourlyUrl}
                noaaZone={data.noaaZone}
                hasNearshore={hasNearshore}
                zoneMode={zoneMode}
                onZoneModeChange={setZoneMode}
                alerts={data.alerts}
              />
            </div>
            {snap === "full" && (
              <ExtendedOutlook
                forecasts={data.forecast?.forecasts}
                nwsForecast={data.nws}
                tideData={data.tides}
                tideStation={data.tideStation}
                sunData={data.sun}
                locationLabel={selectedLocation?.label}
                forecastHourlyUrl={data.forecastHourlyUrl}
                noaaZone={data.noaaZone}
                alerts={data.alerts}
              />
            )}
            {data.forecast?.timestamp && snap === "full" && (
              <p className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-100">
                Source: {data.forecast.timestamp}
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One-line summary shown in the always-visible peek bar
// ─────────────────────────────────────────────────────────────────────────────
function PeekSummary({ location, data, isAvailable }) {
  const firstForecast = data?.forecast?.forecasts?.[0];
  const firstNwsKey   = data?.nws ? Object.keys(data.nws)[0] : null;
  const nws           = firstNwsKey ? data.nws[firstNwsKey] : null;

  if (!isAvailable) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-slate-600 truncate">{location?.label ?? "—"}</span>
        <span className="text-xs text-slate-400 truncate">No marine forecast</span>
      </div>
    );
  }

  const windText = firstForecast ? `${firstForecast.wind_direction ?? ""} ${firstForecast.wind_speed ?? ""}`.trim() : null;
  const tempText = nws?.high != null ? `${nws.high}°` : null;
  const waveText = firstForecast?.wave_height ?? null;

  return (
    <div className="flex items-center gap-2 min-w-0 text-sm">
      <span className="leading-none flex-shrink-0 flex items-center" aria-hidden>{getWeatherIcon(nws?.dayForecast, 18)}</span>
      <span className="font-semibold text-slate-700 truncate flex-shrink-0">{location?.label ?? "—"}</span>
      {tempText && <span className="text-slate-600 tabular-nums flex-shrink-0">{tempText}</span>}
      {windText && <span className="text-slate-500 tabular-nums truncate">· {windText}</span>}
      {waveText && <span className="text-cyan-600 tabular-nums hidden xs:inline truncate">· {waveText}</span>}
    </div>
  );
}