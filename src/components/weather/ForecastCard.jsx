// src/components/weather/ForecastCard.jsx
// Lifted from the standalone NOAA app's ForecastCard. Changes from original:
//
//   - departureTime / returnTime props removed entirely
//   - pickPeriod() helper removed (no longer needed)
//   - toMinutes() and getTideMins() helpers removed
//   - Tide highlight logic (closestDepIdx / closestRetIdx) removed — all tides
//     render in the same weight
//   - forecastHourlyUrl prop added; clicking the NWS weather block opens an
//     inline hourly popup (HourlyWeatherPopup, defined below)

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import moment from "moment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wind, Waves, Activity, ArrowUpDown, Sunrise, Sun, Droplets, Cloud, CloudSun, Cloudy, CloudRain, CloudSnow, CloudFog, CloudLightning, ChevronDown, X, MessageSquare } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { fetchHourlyForecast } from "@/hooks/useMarineForecast";
import ShareForecastDialog from "@/components/weather/ShareForecastDialog";

// ── Helpers ───────────────────────────────────────────────────────────────────

export const getWeatherIcon = (shortForecast, size = 20) => {
  const f = (shortForecast || "").toLowerCase();
  const p = { size, strokeWidth: 2 };
  if (f.includes("thunder")) return <CloudLightning {...p} className="flex-shrink-0 text-slate-500" />;
  if (f.includes("snow") || f.includes("flurr")) return <CloudSnow {...p} className="flex-shrink-0 text-slate-400" />;
  if (f.includes("rain") || f.includes("shower") || f.includes("drizzle")) return <CloudRain {...p} className="flex-shrink-0 text-slate-500" />;
  if (f.includes("fog")) return <CloudFog {...p} className="flex-shrink-0 text-slate-400" />;
  if (f.includes("mostly cloudy") || f.includes("overcast")) return <Cloud {...p} className="flex-shrink-0 text-slate-400" />;
  if (f.includes("partly") || f.includes("mostly sunny") || f.includes("mostly clear")) return <CloudSun {...p} className="flex-shrink-0 text-amber-500" />;
  if (f.includes("cloudy")) return <Cloudy {...p} className="flex-shrink-0 text-slate-400" />;
  if (f.includes("sunny") || f.includes("clear")) return <Sun {...p} className="flex-shrink-0 text-amber-500" />;
  return <CloudSun {...p} className="flex-shrink-0 text-amber-500" />;
};

function tempColor(t) {
  if (t < 50) return "#3b82f6";
  if (t < 60) return "#06b6d4";
  if (t < 80) return "#10b981";
  if (t < 90) return "#f59e0b";
  if (t < 110) return "#ef4444";
  return "#dc2626";
}

// ── Hourly popup ──────────────────────────────────────────────────────────────
// Renders as a fixed portal overlay so it escapes any card overflow clipping.

function HourlyWeatherPopup({ forecastHourlyUrl, date, label, onClose }) {
  const [hours, setHours]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHourlyForecast(forecastHourlyUrl, date)
      .then(h => { if (!cancelled) { setHours(h); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [forecastHourlyUrl, date]);

  const popup = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(15,23,42,0.55)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          width: "100%", maxWidth: 560,
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px 12px", borderBottom: "1px solid #e2e8f0", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Hourly Forecast</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{label}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9", border: "none", borderRadius: 8,
              width: 30, height: 30, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer",
            }}
          >
            <X size={15} color="#64748b" />
          </button>
        </div>

        {/* Body — horizontal scrolling strip */}
        <div style={{ overflowX: "auto", overflowY: "hidden", padding: "16px 18px 20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "32px 48px", color: "#94a3b8", fontSize: 14, whiteSpace: "nowrap" }}>
              Loading hourly forecast…
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#ef4444", fontSize: 13 }}>
              Could not load hourly data.<br /><span style={{ color: "#94a3b8" }}>{error}</span>
            </div>
          )}
          {hours && hours.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 13 }}>
              No hourly data available for this date.
            </div>
          )}
          {hours && hours.length > 0 && (
            <div style={{ display: "flex", gap: 6, width: "max-content" }}>
              {hours.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 5, width: 68, padding: "10px 6px",
                    borderRadius: 10,
                    background: h.isDaytime ? "#f8fafc" : "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    flexShrink: 0,
                  }}
                >
                  {/* Time */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>{h.hour}</span>

                  {/* Weather icon */}
                  <span className="flex items-center justify-center" style={{ lineHeight: 1 }}>{getWeatherIcon(h.forecast, 20)}</span>

                  {/* Temperature */}
                  <span style={{ fontSize: 11, fontWeight: 400, color: tempColor(h.temp) }}>
                    {h.temp}°
                  </span>

                  {/* Precip % — only show if > 0 */}
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: h.precip > 30 ? "#2563eb" : "#94a3b8",
                    minHeight: 14,
                  }}>
                    {h.precip > 0 ? (<span className="inline-flex items-center gap-px"><Droplets size={9} strokeWidth={2.5} className="text-sky-500" />{h.precip}%</span>) : ""}
                  </span>

                  {/* Wind */}
                  <span style={{
                    fontSize: 9, color: "#64748b", textAlign: "center",
                    lineHeight: 1.3, wordBreak: "break-word",
                  }}>
                    {h.wind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(popup, document.body);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ForecastCard({
  forecast,
  dayOffset,
  badgeLabel,
  nwsForecast,
  tideData,
  sunData,
  locationLabel,
  forecastHourlyUrl,   // from data.forecastHourlyUrl via useMarineForecast
}) {
  const [showNarrative, setShowNarrative] = useState(false);
  const [showHourly,    setShowHourly]    = useState(false);
  const [showShare,     setShowShare]     = useState(false);

  // Parse "Tonight 5/4" / "Tue 5/5" → "YYYY-MM-DD" key for joining with the
  // NWS / tide / sun maps. Falls back to dayOffset if the regex misses.
  const dateMatch = forecast.period.match(/(\d+)\/(\d+)/);
  const forecastDate = dateMatch
    ? moment(`${moment().year()}-${dateMatch[1]}-${dateMatch[2]}`, "YYYY-M-D").format("YYYY-MM-DD")
    : moment().add(dayOffset, "days").format("YYYY-MM-DD");

  const nws = nwsForecast?.[forecastDate];
  const dailyTides = (tideData?.[forecastDate] ?? [])
    .slice()
    .sort((a, b) => new Date(a.t) - new Date(b.t));
  const dailySunData = sunData?.[forecastDate];

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="text-lg">{forecast.period.replace(" Of ", " of ")}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs">{badgeLabel}</Badge>
              <button
                type="button"
                onClick={() => setShowShare(true)}
                className="p-1.5 -mr-1 rounded-md text-cyan-700 hover:bg-cyan-50 transition-colors"
                aria-label="Share this forecast"
                title="Share forecast"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* NWS Weather — click to open hourly popup */}
          {nws && (
            <div
              onClick={() => forecastHourlyUrl && setShowHourly(true)}
              className="flex items-center gap-3 p-2 bg-sky-50 rounded-lg border border-sky-100 transition-colors"
              style={{
                cursor: forecastHourlyUrl ? "pointer" : "default",
              }}
              title={forecastHourlyUrl ? "Tap for hourly breakdown" : undefined}
            >
              <div className="leading-none flex items-center">{getWeatherIcon(nws.dayForecast, 26)}</div>
              <div className="flex-1 text-sm min-w-0">
                <p className="text-slate-700 font-medium truncate">{nws.dayForecast}</p>
                {nws.nightForecast && nws.nightForecast !== nws.dayForecast && (
                  <p className="text-xs text-slate-500 truncate">{nws.nightForecast}</p>
                )}
                {forecastHourlyUrl && (
                  <p className="text-[10px] text-sky-500 mt-0.5 font-medium">Tap for hourly ↗</p>
                )}
              </div>
              <div className="text-right text-sm flex-shrink-0">
                <p className="font-semibold text-slate-700">
                  {nws.high !== null ? `${nws.high}°` : "--"} / {nws.low !== null ? `${nws.low}°F` : "--"}
                </p>
                {(nws.dayPrecip > 0 || nws.nightPrecip > 0) && (
                  <p className="text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1"><Droplets size={12} className="text-sky-500" />{nws.dayPrecip ?? 0}% / {nws.nightPrecip ?? 0}%</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Wind + Waves side by side */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "3fr 2fr" }}>
            {forecast.wind_direction && (
              <div className="flex items-start gap-1">
                <Wind className="h-4 w-4 mt-1 text-cyan-700 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-700">Wind</p>
                  <p className="text-slate-600">{forecast.wind_direction} {forecast.wind_speed}</p>
                  {forecast.wind_gusts && <p className="text-xs text-orange-600">Gusts: {forecast.wind_gusts}</p>}
                  {forecast.wind_commentary && <p className="text-xs text-slate-500 italic">{forecast.wind_commentary}</p>}
                </div>
              </div>
            )}
            {forecast.wave_height && (
              <div className="flex items-start gap-1">
                <Waves className="h-4 w-4 mt-1 text-cyan-700 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-700">Waves</p>
                  <p className="text-slate-600">{forecast.wave_height}</p>
                  {forecast.wave_commentary && <p className="text-xs text-slate-500 italic">{forecast.wave_commentary}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Swell Components */}
          {forecast.swell_components && forecast.swell_components.length > 0 && (
            <div className="flex items-start gap-2">
              <Activity className="h-4 w-4 mt-1 text-cyan-700 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-slate-700">Swell</p>
                {forecast.primary_swell_direction && (
                  <p className="text-xs text-slate-700 font-medium mb-1">
                    Primary: {forecast.primary_swell_direction} {forecast.primary_wave_height} @ {forecast.primary_wave_period}
                  </p>
                )}
                <div className="space-y-0.5">
                  {forecast.swell_components.map((swell, idx) => (
                    <p key={idx} className="text-xs text-slate-600">
                      {swell.direction} {swell.height} @ {swell.period}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tides + Sun side by side */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "3fr 2fr" }}>
            <div className="flex items-start gap-1">
              <ArrowUpDown className="h-4 w-4 mt-1 text-cyan-700 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-semibold text-slate-700">Tides</p>
                {dailyTides.length > 0 ? (
                  dailyTides.map((tide, idx) => (
                    <p key={idx} className="text-xs text-slate-600">
                      {new Date(tide.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
                      {parseFloat(tide.v).toFixed(2)} ft ({tide.type})
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">N/A</p>
                )}
              </div>
            </div>
            {dailySunData && (
              <div className="flex items-start gap-1">
                <Sunrise className="h-4 w-4 mt-1 text-amber-500 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-slate-700">Sun</p>
                  <p className="text-xs text-slate-600">
                    Rise: {new Date(dailySunData.sunrise).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-slate-600">
                    Set: {new Date(dailySunData.sunset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Raw Text */}
          <Collapsible open={showNarrative} onOpenChange={setShowNarrative}>
            <CollapsibleTrigger className="pt-2 border-t border-slate-200 w-full flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 transition-colors">
              <ChevronDown
                className="h-3 w-3 transition-transform duration-200"
                style={{ transform: showNarrative ? "rotate(180deg)" : "rotate(0deg)" }}
              />
              NOAA Narrative
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <p className="text-xs text-slate-500 italic">{forecast.raw_text}</p>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Hourly popup portal */}
      {showHourly && forecastHourlyUrl && (
        <HourlyWeatherPopup
          forecastHourlyUrl={forecastHourlyUrl}
          date={forecastDate}
          label={forecast.period}
          onClose={() => setShowHourly(false)}
        />
      )}

      {/* Forecast share dialog */}
      {showShare && (
        <ShareForecastDialog
          payload={{
            locationLabel: locationLabel || "Fishing Spot",
            periodLabel: forecast.period.replace(" Of ", " of "),
            condition: nws?.dayForecast || "",
            high: nws?.high ?? null,
            low: nws?.low ?? null,
            dayPrecip: nws?.dayPrecip ?? 0,
            wind: {
              direction: forecast.wind_direction,
              speed: forecast.wind_speed,
              gusts: forecast.wind_gusts,
            },
            waves: forecast.wave_height || null,
            swell: forecast.primary_swell_direction
              ? {
                  direction: forecast.primary_swell_direction,
                  height: forecast.primary_wave_height,
                  period: forecast.primary_wave_period,
                }
              : null,
            tides: dailyTides,
            sun: dailySunData
              ? { sunrise: dailySunData.sunrise, sunset: dailySunData.sunset }
              : null,
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}