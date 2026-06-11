// src/components/CommunityReportForm.jsx
// Modal for posting a community fishing report or live location pin.
import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { X } from "lucide-react";

const SPECIES = [
  { key: "yellowfin",     label: "Yellowfin Tuna" },
  { key: "blackfin",      label: "Blackfin Tuna" },
  { key: "bluefin",       label: "Bluefin Tuna" },
  { key: "mahi",          label: "Mahi-mahi" },
  { key: "white_marlin",  label: "White Marlin" },
  { key: "blue_marlin",   label: "Blue Marlin" },
  { key: "wahoo",         label: "Wahoo" },
];

export default function CommunityReportForm({
  userId,
  initialType = "report",  // "live" | "report"
  lat,
  lon,
  waterTemp = null,
  onClose,
  onPosted,                 // (newLocation) => void
}) {
  const [type,       setType]       = useState(initialType);
  const [species,    setSpecies]    = useState(new Set());
  const [quantities, setQuantities] = useState({});
  const [notes,      setNotes]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  function toggleSpecies(key) {
    setSpecies(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setQuantities(q => { const n = { ...q }; delete n[key]; return n; });
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function setQty(key, val) {
    setQuantities(q => ({ ...q, [key]: Math.max(1, parseInt(val) || 1) }));
  }

  async function handleSubmit() {
    if (species.size === 0) { setError("Select at least one species."); return; }
    setError(null);
    setSubmitting(true);

    try {
      // Get display name from user_profiles; fall back to email prefix
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, venmo_handle, cashapp_handle")
        .eq("id", userId)
        .single();
      const { data: authData } = await supabase.auth.getUser();
      const displayName =
        profile?.display_name?.trim() ||
        authData?.user?.email?.split("@")[0] ||
        "Angler";

      const isLive    = type === "live";
      const pointsAmt = isLive ? 5000 : 1000;
      const expiresAt = new Date(
        Date.now() + (isLive ? 24 : 7 * 24) * 60 * 60 * 1000
      ).toISOString();

      const qty = {};
      species.forEach(k => { qty[k] = quantities[k] ?? 1; });

      const { data: loc, error: insErr } = await supabase
        .from("community_locations")
        .insert({
          user_id:        userId,
          display_name:   displayName,
          type,
          lat,
          lon,
          species:        Array.from(species),
          quantity:       qty,
          water_temp:     waterTemp,
          notes:          notes.trim() || null,
          venmo_handle:   profile?.venmo_handle   || null,
          cashapp_handle: profile?.cashapp_handle || null,
          points_awarded: pointsAmt,
          expires_at:     expiresAt,
        })
        .select()
        .single();

      if (insErr) throw insErr;

      // Award points — read-then-update (no RPC dependency)
      const { data: existing } = await supabase
        .from("user_points")
        .select("total_points, report_count, live_count")
        .eq("user_id", userId)
        .single();

      if (existing) {
        await supabase.from("user_points").update({
          total_points: (existing.total_points || 0) + pointsAmt,
          report_count: (existing.report_count || 0) + (isLive ? 0 : 1),
          live_count:   (existing.live_count || 0)   + (isLive ? 1 : 0),
          updated_at:   new Date().toISOString(),
        }).eq("user_id", userId);
      } else {
        await supabase.from("user_points").insert({
          user_id:      userId,
          total_points: pointsAmt,
          report_count: isLive ? 0 : 1,
          live_count:   isLive ? 1 : 0,
        });
      }

      onPosted?.(loc);
      onClose();
    } catch (err) {
      console.error("[CommunityReportForm] submit error:", err);
      setError(err.message || "Failed to post. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9600] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[380px] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header — type toggle */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex gap-1.5">
            <button
              onClick={() => setType("report")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                type === "report"
                  ? "bg-cyan-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              Post-Trip Report
            </button>
            <button
              onClick={() => setType("live")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
                type === "live"
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  type === "live" ? "bg-white animate-pulse" : "bg-slate-400"
                }`}
              />
              Live Pin
            </button>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Location + temp strip */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-3 text-xs text-slate-500">
          <span className="font-mono">
            {lat?.toFixed(4)}°N, {Math.abs(lon)?.toFixed(4)}°W
          </span>
          {waterTemp != null && (
            <span className="text-cyan-600 font-semibold">{waterTemp.toFixed(1)}°F</span>
          )}
          <span className={`ml-auto font-semibold ${type === "live" ? "text-emerald-600" : "text-cyan-600"}`}>
            +{type === "live" ? "5,000" : "1,000"} pts
          </span>
        </div>

        {/* Species */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Species caught
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SPECIES.map(s => (
              <button
                key={s.key}
                onClick={() => toggleSpecies(s.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  species.has(s.key)
                    ? "bg-cyan-600 text-white border-cyan-600"
                    : "bg-white text-slate-600 border-slate-300 hover:border-cyan-400"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quantities */}
        {species.size > 0 && (
          <div className="px-4 pt-2 pb-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Quantity
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {Array.from(species).map(k => {
                const label = SPECIES.find(s => s.key === k)?.label ?? k;
                return (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">{label}</span>
                    <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setQty(k, (quantities[k] ?? 1) - 1)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold leading-none"
                      >−</button>
                      <span className="px-2.5 py-0.5 text-xs font-semibold text-slate-800 min-w-[28px] text-center">
                        {quantities[k] ?? 1}
                      </span>
                      <button
                        onClick={() => setQty(k, (quantities[k] ?? 1) + 1)}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold leading-none"
                      >+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Notes — depth, technique, conditions… (optional)"
            className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>

        {error && (
          <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="px-4 pb-5">
          <button
            onClick={handleSubmit}
            disabled={submitting || species.size === 0}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors shadow-sm"
          >
            {submitting
              ? "Posting…"
              : type === "live"
                ? "Drop Live Pin  (+5,000 pts)"
                : "Post Report  (+1,000 pts)"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
