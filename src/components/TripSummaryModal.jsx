// src/components/TripSummaryModal.jsx
// End-of-trip summary modal — shown when endNavigation() is called.
// Displays planned vs actual stats, then saves to trip_history on confirm.

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAppContext } from "@/context/AppContext";

function fmt(val, decimals = 1) {
  return val != null ? val.toFixed(decimals) : "—";
}

function fmtDuration(hrs) {
  if (hrs == null) return "—";
  const h = Math.floor(hrs);
  const m = Math.round((hrs % 1) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function haversineNm(la1, lo1, la2, lo2) {
  const R = 3440.065;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function routeDistanceNm(waypoints) {
  let d = 0;
  for (let i = 1; i < waypoints?.length; i++) {
    d += haversineNm(waypoints[i-1].lat, waypoints[i-1].lng,
                     waypoints[i].lat,   waypoints[i].lng);
  }
  return d;
}

// tripData shape returned by endNavigation():
// { route, actualDistanceNm, actualDurationHrs, avgSpeedKts, maxSpeedKts, track, startedAt }
export default function TripSummaryModal({ tripData, onClose }) {
  const { userId, userSettings } = useAppContext();
  const [saving,   setSaving]   = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  if (!tripData) return null;

  const { route, actualDistanceNm, actualDurationHrs, avgSpeedKts, maxSpeedKts, track, startedAt } = tripData;
  const fuelBurnGalHr = Number(userSettings?.fuel_burn_gal_hr) || 0;
  const fuelUsed = fuelBurnGalHr > 0 && actualDurationHrs
    ? +(fuelBurnGalHr * actualDurationHrs).toFixed(1)
    : null;

  const plannedNm  = routeDistanceNm(route?.waypoints);
  const cruiseSpd  = Number(route?.cruise_speed_kts) || null;
  const plannedHrs = cruiseSpd && plannedNm ? plannedNm / cruiseSpd : null;

  async function saveTrip() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from("trip_history").insert({
      user_id:              userId,
      route_id:             route?.id ?? null,
      route_name:           route?.name || "Unnamed Route",
      planned_distance_nm:  plannedNm   ? +plannedNm.toFixed(2)   : null,
      planned_duration_hrs: plannedHrs  ? +plannedHrs.toFixed(3)  : null,
      planned_waypoints:    route?.waypoints ?? null,
      actual_distance_nm:   actualDistanceNm,
      actual_duration_hrs:  actualDurationHrs,
      avg_speed_kts:        avgSpeedKts,
      max_speed_kts:        maxSpeedKts,
      fuel_used_gal:        fuelUsed,
      track_json:           track ?? [],
      started_at:           startedAt?.toISOString() ?? new Date().toISOString(),
      ended_at:             new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      console.error("[TripSummary] save error:", error);
      setSavedMsg("Save failed");
    } else {
      setSavedMsg("Saved");
      setTimeout(onClose, 800);
    }
  }

  const Row = ({ label, planned, actual, unit = "" }) => (
    <tr className="border-t border-slate-100">
      <td className="py-2 px-3 text-[11px] text-slate-500 whitespace-nowrap">{label}</td>
      <td className="py-2 px-3 text-[11px] text-slate-500 font-mono text-right">
        {planned != null ? planned : "—"}{planned != null ? unit : ""}
      </td>
      <td className="py-2 px-3 text-[12px] text-slate-800 font-semibold font-mono text-right">
        {actual != null ? actual : "—"}{actual != null ? unit : ""}
      </td>
    </tr>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999,
                  background: "rgba(15,23,42,0.7)", display: "flex",
                  alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 360,
                    boxShadow: "0 8px 40px rgba(0,0,0,0.25)", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ background: "#0f172a", padding: "14px 16px",
                      display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#22d3ee", fontSize: 11, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Trip Complete
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              {route?.name || "Unnamed Route"}
            </div>
          </div>
          <button onClick={onClose}
            style={{ color: "#64748b", background: "none", border: "none",
                     cursor: "pointer", padding: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Stats table */}
        <div style={{ padding: "0 0 8px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700,
                             textAlign: "left", color: "#94a3b8",
                             textTransform: "uppercase", letterSpacing: "0.05em" }}>Stat</th>
                <th style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700,
                             textAlign: "right", color: "#94a3b8",
                             textTransform: "uppercase", letterSpacing: "0.05em" }}>Planned</th>
                <th style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700,
                             textAlign: "right", color: "#64748b",
                             textTransform: "uppercase", letterSpacing: "0.05em" }}>Actual</th>
              </tr>
            </thead>
            <tbody>
              <Row
                label="Distance"
                planned={plannedNm > 0 ? fmt(plannedNm) : null}
                actual={actualDistanceNm != null ? fmt(actualDistanceNm) : null}
                unit=" nm"
              />
              <Row
                label="Duration"
                planned={plannedHrs ? fmtDuration(plannedHrs) : null}
                actual={actualDurationHrs ? fmtDuration(actualDurationHrs) : null}
              />
              <Row
                label="Avg speed"
                planned={cruiseSpd ? fmt(cruiseSpd) : null}
                actual={avgSpeedKts != null ? fmt(avgSpeedKts) : null}
                unit=" kts"
              />
              <tr className="border-t border-slate-100">
                <td className="py-2 px-3 text-[11px] text-slate-500">Max speed</td>
                <td className="py-2 px-3 text-right text-[11px] text-slate-400">—</td>
                <td className="py-2 px-3 text-right text-[12px] font-semibold font-mono text-slate-800">
                  {maxSpeedKts != null ? `${fmt(maxSpeedKts)} kts` : "—"}
                </td>
              </tr>
              {fuelBurnGalHr > 0 && (
                <tr className="border-t border-slate-100">
                  <td className="py-2 px-3 text-[11px] text-slate-500">Fuel used</td>
                  <td className="py-2 px-3 text-right text-[11px] text-slate-400">—</td>
                  <td className="py-2 px-3 text-right text-[12px] font-semibold font-mono text-amber-700">
                    {fuelUsed != null ? `${fuelUsed} gal` : "—"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, padding: "10px 16px 16px" }}>
          <button
            onClick={saveTrip}
            disabled={saving || !!savedMsg}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                     background: savedMsg ? "#16a34a" : "#0e7490", color: "#fff",
                     fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer",
                     opacity: saving ? 0.7 : 1, transition: "background 0.2s" }}
          >
            {saving ? "Saving…" : savedMsg || "Save Trip"}
          </button>
          <button
            onClick={onClose}
            style={{ padding: "9px 16px", borderRadius: 8,
                     border: "1px solid #e2e8f0", background: "#fff",
                     color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
