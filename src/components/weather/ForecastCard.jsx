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
import { Wind, Waves, Activity, ArrowUpDown, Sunrise, Sun, Droplets, Cloud, CloudSun, Cloudy, CloudRain, CloudSnow, CloudFog, CloudLightning, ChevronDown, X, MessageSquare, AlertTriangle, HelpCircle } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, ReferenceLine } from "recharts";
import { fetchHourlyForecast, fetchTideCurve, buildTideCurve, getMoonPhase, getTideStrength, getSolunarPeriods } from "@/hooks/useMarineForecast";
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

// Does an alert's onset/expires window overlap the given calendar day
// ("YYYY-MM-DD")? Missing onset is treated as "already in effect"; missing
// expires is treated as "open-ended" (NWS alerts sometimes omit one bound).
function alertOverlapsDate(alert, dateStr) {
  if (!alert.onset && !alert.expires) return false;
  const dayStart = moment(dateStr, "YYYY-MM-DD").startOf("day");
  const dayEnd   = moment(dateStr, "YYYY-MM-DD").endOf("day");
  const start = alert.onset   ? moment(alert.onset)   : moment(0);
  const end   = alert.expires ? moment(alert.expires) : moment("2100-01-01");
  return start.isSameOrBefore(dayEnd) && end.isSameOrAfter(dayStart);
}

function formatAlertTime(iso) {
  if (!iso) return null;
  return moment(iso).format("ddd h:mm A");
}

// Amber for routine hazards (Small Craft Advisory etc.), red for the more
// severe NWS severity tiers (Gale/Storm Warning and similar).
function alertSeverityClasses(severity) {
  if (severity === "Severe" || severity === "Extreme") {
    return { box: "bg-red-50 border-red-200", icon: "text-red-600", title: "text-red-800", body: "text-red-700" };
  }
  return { box: "bg-amber-50 border-amber-200", icon: "text-amber-600", title: "text-amber-800", body: "text-amber-700" };
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

// ── Tide detail popup ─────────────────────────────────────────────────────────
// Same portal pattern as HourlyWeatherPopup above. Tries a real NOAA
// 6-minute curve first (fetchTideCurve — only works for "reference"
// stations) and falls back to a curve synthesized locally from the hi/lo
// points in tideData (buildTideCurve — works everywhere) when NOAA has no
// high-resolution data for this station's type. See both functions' doc
// comments in useMarineForecast.js. Shades the pre-sunrise/post-sunset
// hours using that day's sun data, and — for today's card only — marks the
// current interpolated tide height with a reference line. Low/High tide
// lists reuse the same dailyTides array ForecastCard already computed for
// the summary view.

function formatHourTick(ms) {
  const d = new Date(ms);
  const h = d.getHours();
  if (h === 0) return "12A";
  if (h < 12) return `${h}A`;
  if (h === 12) return "12P";
  return `${h - 12}P`;
}

function formatTimeRange(startMs, endMs) {
  const opts = { hour: "numeric", minute: "2-digit" };
  return `${new Date(startMs).toLocaleTimeString([], opts)} – ${new Date(endMs).toLocaleTimeString([], opts)}`;
}

function interpolateNow(points) {
  if (!points || points.length < 2) return null;
  const now = Date.now();
  const first = points[0].x, last = points[points.length - 1].x;
  if (now < first || now > last) return null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (now >= a.x && now <= b.x) {
      const frac = b.x === a.x ? 0 : (now - a.x) / (b.x - a.x);
      return { v: a.v + (b.v - a.v) * frac, rising: b.v > a.v };
    }
  }
  return null;
}

function TideDetailPopup({ stationId, tideData, date, label, locationLabel, isToday, dailyTides, nws, lat, lon, forecastHourlyUrl, onClose }) {
  const moon = getMoonPhase(moment(date, "YYYY-MM-DD").toDate());
  const tideStrength = getTideStrength(moment(date, "YYYY-MM-DD").toDate());
  const solunar = getSolunarPeriods(date, lat, lon);

  const dayStart  = moment(date, "YYYY-MM-DD").startOf("day").valueOf();
  const dayEnd    = moment(date, "YYYY-MM-DD").endOf("day").valueOf();
  const hourTicks = Array.from({ length: 12 }, (_, i) => dayStart + i * 2 * 3600000);

  // Fallback curve if NOAA has no real high-resolution data for this
  // station (see fetchTideCurve's doc comment in useMarineForecast.js).
  // Bracket the day with the prior day's last extremum and the next day's
  // first extremum so it interpolates correctly across midnight instead of
  // flatlining at the edges.
  const prevDate = moment(date, "YYYY-MM-DD").subtract(1, "day").format("YYYY-MM-DD");
  const nextDate = moment(date, "YYYY-MM-DD").add(1, "day").format("YYYY-MM-DD");
  const prevExtremum = (tideData?.[prevDate] ?? []).slice(-1);
  const nextExtremum = (tideData?.[nextDate] ?? []).slice(0, 1);
  const extrema = [...prevExtremum, ...(dailyTides ?? []), ...nextExtremum];

  const [loading, setLoading]         = useState(true);
  const [chartData, setChartData]     = useState([]);
  const [isApproximate, setIsApprox]  = useState(false);
  const [showHourlyFromTide, setShowHourlyFromTide] = useState(false);
  const [showSolunarInfo, setShowSolunarInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTideCurve(stationId, date)
      .then(points => {
        if (cancelled) return;
        setChartData(points);
        setIsApprox(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setChartData(buildTideCurve(extrema, dayStart, dayEnd));
        setIsApprox(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // extrema/dayStart/dayEnd are derived from props that don't change while
    // this popup instance is open, so stationId+date fully capture "when to
    // refetch" here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, date]);

  const now = isToday ? interpolateNow(chartData) : null;

  const lowTides  = (dailyTides ?? []).filter(t => t.type === "Low");
  const highTides = (dailyTides ?? []).filter(t => t.type === "High");

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
          width: "100%", maxWidth: 480,
          maxHeight: "85vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px 12px", borderBottom: "1px solid #e2e8f0", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>Tide Details</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
              {label}{locationLabel ? ` — ${locationLabel}` : ""}
            </div>
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

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "16px 18px 20px" }}>
          {/* Tide strength (spring/neap) + weather summary row */}
          <div style={{ marginBottom: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 12, color: "#64748b",
            }}>
              <span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{tideStrength.label}</span>
                <span style={{ marginLeft: 6, color: "#94a3b8" }}>
                  {Math.round(moon.illumination * 100)}% {moon.waxing ? "Waxing" : "Waning"}
                </span>
              </span>
              {nws && (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {getWeatherIcon(nws.dayForecast, 16)}
                  <span style={{ color: "#334155", fontWeight: 600 }}>
                    {nws.high !== null ? `${nws.high}°` : "--"} / {nws.low !== null ? `${nws.low}°F` : "--"}
                  </span>
                  {forecastHourlyUrl && (
                    <button
                      type="button"
                      onClick={() => setShowHourlyFromTide(true)}
                      title="Tap for hourly forecast"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "none", background: "none", padding: 0,
                        color: "#94a3b8", cursor: "pointer", lineHeight: 1,
                      }}
                    >
                      <HelpCircle size={13} />
                    </button>
                  )}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{tideStrength.note}</p>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>
              Loading tide curve…
            </div>
          )}

          {!loading && chartData.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>
              No tide curve data available for this date.
            </div>
          )}

          {!loading && chartData.length > 0 && (
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 14, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0891b2" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="x" type="number" domain={[dayStart, dayEnd]}
                    ticks={hourTicks}
                    tickFormatter={formatHourTick}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={{ stroke: "#e2e8f0" }} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(1)}ft`}
                    width={38}
                  />
                  <Area type="monotone" dataKey="v" stroke="#0891b2" strokeWidth={2} fill="url(#tideFill)" dot={false} isAnimationActive={false} />
                  {now && (
                    <ReferenceLine
                      x={Date.now()} stroke="#ef4444" strokeWidth={1.5}
                      label={{
                        value: `${now.v.toFixed(2)} ft ${now.rising ? "↑" : "↓"}`,
                        position: "top", fill: "#ef4444", fontSize: 11, fontWeight: 700,
                      }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
              {isApproximate && (
                <p style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 2 }}>
                  Approximate curve — NOAA doesn't publish high-resolution data for this station.
                </p>
              )}
            </div>
          )}

          {/* Low / High tide lists */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
            marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0",
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Low Tides</div>
              {lowTides.length > 0 ? lowTides.map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: "#475569" }}>
                  {t.v.toFixed(2)} ft @ {new Date(t.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              )) : <div style={{ fontSize: 12, color: "#94a3b8" }}>N/A</div>}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>High Tides</div>
              {highTides.length > 0 ? highTides.map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: "#475569" }}>
                  {t.v.toFixed(2)} ft @ {new Date(t.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </div>
              )) : <div style={{ fontSize: 12, color: "#94a3b8" }}>N/A</div>}
            </div>
          </div>

          {/* Solunar feeding periods */}
          {(solunar.major.length > 0 || solunar.minor.length > 0) && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
              <Collapsible open={showSolunarInfo} onOpenChange={setShowSolunarInfo}>
                <CollapsibleTrigger style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#0f172a" }}>Solunar Feeding Times</span>
                  <ChevronDown
                    size={12}
                    style={{
                      color: "#94a3b8",
                      transition: "transform 0.2s",
                      transform: showSolunarInfo ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>
                    Major periods (~2hrs) happen when the moon is overhead or underfoot; minor periods (~1hr) happen at moonrise and moonset. Fish activity tends to peak during these windows.
                  </p>
                </CollapsibleContent>
              </Collapsible>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 2 }}>Major</div>
                  {solunar.major.length > 0 ? solunar.major.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#475569" }}>{formatTimeRange(p.start, p.end)}</div>
                  )) : <div style={{ fontSize: 12, color: "#94a3b8" }}>N/A</div>}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", marginBottom: 2 }}>Minor</div>
                  {solunar.minor.length > 0 ? solunar.minor.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#475569" }}>{formatTimeRange(p.start, p.end)}</div>
                  )) : <div style={{ fontSize: 12, color: "#94a3b8" }}>N/A</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {ReactDOM.createPortal(popup, document.body)}
      {showHourlyFromTide && forecastHourlyUrl && (
        <HourlyWeatherPopup
          forecastHourlyUrl={forecastHourlyUrl}
          date={date}
          label={label}
          onClose={() => setShowHourlyFromTide(false)}
        />
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ForecastCard({
  forecast,
  dayOffset,
  badgeLabel,
  nwsForecast,
  tideData,
  tideStation,
  sunData,
  locationLabel,
  forecastHourlyUrl,   // from data.forecastHourlyUrl via useMarineForecast
  noaaZone,            // { id, description } from NOAA_SOURCES — shown as footnote
  alerts,              // full data.alerts array from useMarineForecast — filtered below by date
  lat,                 // selectedLocation.lat — needed for solunar period calculation
  lon,                 // selectedLocation.lon
}) {
  const [showNarrative,   setShowNarrative]   = useState(false);
  const [showHourly,      setShowHourly]      = useState(false);
  const [showShare,       setShowShare]       = useState(false);
  const [showTideDetail,  setShowTideDetail]  = useState(false);

  // Parse "Tonight 5/4" / "Tue 5/5" → "YYYY-MM-DD" key for joining with the
  // NWS / tide / sun maps. Falls back to dayOffset if the regex misses.
  const dateMatch = forecast.period.match(/(\d+)\/(\d+)/);
  const forecastDate = dateMatch
    ? moment(`${moment().year()}-${dateMatch[1]}-${dateMatch[2]}`, "YYYY-M-D").format("YYYY-MM-DD")
    : moment().add(dayOffset, "days").format("YYYY-MM-DD");

  const cardAlerts = (alerts ?? []).filter(a => alertOverlapsDate(a, forecastDate));

  const nws = nwsForecast?.[forecastDate];
  const dailyTides = (tideData?.[forecastDate] ?? [])
    .slice()
    .sort((a, b) => new Date(a.t) - new Date(b.t));
  const dailySunData = sunData?.[forecastDate];
  const isToday = forecastDate === moment().format("YYYY-MM-DD");

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
          {/* Hazardous weather alerts (Small Craft Advisory, Gale Warning, etc.) */}
          {cardAlerts.length > 0 && (
            <div className="space-y-1.5">
              {cardAlerts.map((alert, idx) => {
                const c = alertSeverityClasses(alert.severity);
                const from = formatAlertTime(alert.onset);
                const until = formatAlertTime(alert.expires);
                return (
                  <div key={idx} className={`flex items-start gap-2 p-2 rounded-lg border ${c.box}`}>
                    <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${c.icon}`} />
                    <div className="text-xs">
                      <p className={`font-semibold ${c.title}`}>{alert.event ?? "Hazardous Weather"}</p>
                      {(from || until) && (
                        <p className={c.body}>
                          {from && `From ${from}`}{from && until ? " " : ""}{until && `until ${until}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

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
            <div
              onClick={() => tideStation && setShowTideDetail(true)}
              className="flex items-start gap-1 -m-1 p-1 rounded-lg transition-colors hover:bg-cyan-50/60"
              style={{ cursor: tideStation ? "pointer" : "default" }}
              title={tideStation ? "Tap for tide chart" : undefined}
            >
              <ArrowUpDown className="h-4 w-4 mt-1 text-cyan-700 flex-shrink-0" />
              <div className="text-sm min-w-0">
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
                {tideStation && (
                  <p className="text-[10px] text-sky-500 mt-0.5 font-medium">Tap for more ↗</p>
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
              {noaaZone && (
                <p className="text-[10px] text-slate-400 mt-2 pt-1 border-t border-slate-100">
                  {noaaZone.id} — {noaaZone.description}
                </p>
              )}
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

      {/* Tide detail popup portal */}
      {showTideDetail && tideStation && (
        <TideDetailPopup
          stationId={tideStation}
          tideData={tideData}
          date={forecastDate}
          label={forecast.period.replace(" Of ", " of ")}
          locationLabel={locationLabel}
          isToday={isToday}
          dailyTides={dailyTides}
          nws={nws}
          lat={lat}
          lon={lon}
          forecastHourlyUrl={forecastHourlyUrl}
          onClose={() => setShowTideDetail(false)}
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