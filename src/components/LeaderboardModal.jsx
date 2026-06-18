// src/components/LeaderboardModal.jsx
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { X } from "lucide-react";

export default function LeaderboardModal({ onClose }) {
  const [period,  setPeriod]  = useState("month");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLeaderboard(); }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchLeaderboard() {
    setLoading(true);
    try {
      let locQuery = supabase
        .from("community_locations")
        .select("user_id, display_name, type, points_awarded, created_at");
      if (period === "month") {
        locQuery = locQuery.gte("created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      }
      const { data: locs, error: locErr } = await locQuery;
      if (locErr) throw locErr;

      const map = {};
      (locs || []).forEach(l => {
        if (!map[l.user_id]) {
          map[l.user_id] = { user_id: l.user_id, display_name: l.display_name,
            points: 0, reports: 0, lives: 0, tips_cents: 0 };
        }
        map[l.user_id].points += l.points_awarded || 0;
        if (l.type === "live") map[l.user_id].lives++;
        else map[l.user_id].reports++;
      });

      // Tip totals via a SECURITY DEFINER aggregate so seed + real tips are visible
      // to everyone (community_tips row RLS only exposes a viewer's own tips -> $0).
      const tipsSince = period === "month"
        ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const { data: tipTotals } = await supabase.rpc("community_tip_totals", { since: tipsSince });
      (tipTotals || []).forEach(t => {
        if (map[t.recipient_user_id]) map[t.recipient_user_id].tips_cents += t.total_cents || 0;
      });

      setRows(Object.values(map).sort((a, b) => b.points - a.points).slice(0, 25));
    } catch (err) {
      console.error("[LeaderboardModal]", err);
    } finally {
      setLoading(false);
    }
  }

  const rankColor = i => i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : i === 2 ? "#B45309" : null;
  const rankLabel = i => i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[9600] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={onClose}
    >
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 460, maxHeight: "92vh", borderRadius: 20,
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Hero image + title ─────────────────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <img
            src="/nomad_DTX_200_ref.png"
            alt="Nomad DTX 200"
            style={{ width: "100%", display: "block",
              height: 200, objectFit: "cover", objectPosition: "center 40%" }}
          />
          {/* dark gradient overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.88) 100%)",
          }} />
          {/* close button */}
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 12, right: 12, zIndex: 10,
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, color: "#fff", width: 30, height: 30,
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <X className="w-4 h-4" />
          </button>
          {/* title block */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
              color: "#06b6d4", textTransform: "uppercase", marginBottom: 4 }}>
              SST Fishing — Community
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff",
              letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Community Leaders
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
              Sponsored by Nomad Tackle · DTX 200 Offshore Series
            </div>
          </div>
        </div>

        {/* ── Period tabs ────────────────────────────────────────────── */}
        <div style={{ background: "#0f172a", padding: "12px 20px", flexShrink: 0,
          display: "flex", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {[["month", "This Month"], ["alltime", "All Time"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, fontWeight: 700,
                fontSize: 12, border: "none", cursor: "pointer", transition: "all 0.15s",
                background: period === val ? "#06b6d4" : "rgba(255,255,255,0.07)",
                color: period === val ? "#fff" : "rgba(255,255,255,0.45)",
                letterSpacing: "0.01em",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Leaderboard rows ───────────────────────────────────────── */}
        <div style={{ background: "#0f172a", flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
              <div className="w-6 h-6 border-2 border-slate-700 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)",
              fontSize: 13, padding: "48px 24px" }}>
              No reports yet — be the first angler on the board!
            </div>
          ) : rows.map((r, i) => {
            const isTop3 = i < 3;
            const color  = rankColor(i);
            return (
              <div
                key={r.user_id}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: isTop3 ? "14px 20px" : "10px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  background: isTop3
                    ? `linear-gradient(to right, ${color}10, transparent)`
                    : "transparent",
                }}
              >
                {/* Rank */}
                <div style={{ width: 36, flexShrink: 0, textAlign: "center" }}>
                  {isTop3 ? (
                    <div style={{ display: "inline-block", background: color + "22",
                      border: `1px solid ${color}55`, borderRadius: 6,
                      padding: "2px 6px", fontSize: 11, fontWeight: 800,
                      color: color, letterSpacing: "0.03em" }}>
                      {rankLabel(i)}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600,
                      color: "rgba(255,255,255,0.25)" }}>{i + 1}</span>
                  )}
                </div>

                {/* Name + sub-stats */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isTop3 ? 14 : 13, fontWeight: isTop3 ? 700 : 600,
                    color: isTop3 ? "#fff" : "rgba(255,255,255,0.8)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.display_name || "Anonymous"}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    {r.reports > 0 && (
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                        {r.reports} report{r.reports !== 1 ? "s" : ""}
                      </span>
                    )}
                    {r.lives > 0 && (
                      <span style={{ fontSize: 10, color: "#4ade80" }}>
                        {r.lives} live
                      </span>
                    )}
                    {r.tips_cents > 0 && (
                      <span style={{ fontSize: 10, color: "#fbbf24" }}>
                        ${(r.tips_cents / 100).toFixed(0)} tipped
                      </span>
                    )}
                  </div>
                </div>

                {/* Points */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: isTop3 ? 16 : 14, fontWeight: 800,
                    color: isTop3 ? color || "#06b6d4" : "rgba(255,255,255,0.6)",
                    fontVariantNumeric: "tabular-nums" }}>
                    {r.points.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)",
                    fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    pts
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Footer CTA ─────────────────────────────────────────────── */}
        <div style={{ background: "#0c1422", borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "12px 20px", flexShrink: 0, textAlign: "center" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>
            Drop a live pin or catch report to earn points and climb the board
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
