// src/components/LeaderboardModal.jsx
// Top Anglers leaderboard — visible to all registered users.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { X } from "lucide-react";

export default function LeaderboardModal({ onClose }) {
  const [period,  setPeriod]  = useState("month"); // "month" | "alltime"
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
        locQuery = locQuery.gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        );
      }

      const { data: locs, error: locErr } = await locQuery;
      if (locErr) throw locErr;

      const map = {};
      (locs || []).forEach(l => {
        if (!map[l.user_id]) {
          map[l.user_id] = {
            user_id:      l.user_id,
            display_name: l.display_name,
            points:       0,
            reports:      0,
            lives:        0,
            tips_cents:   0,
          };
        }
        map[l.user_id].points += l.points_awarded || 0;
        if (l.type === "live") map[l.user_id].lives++;
        else map[l.user_id].reports++;
      });

      let tipQuery = supabase
        .from("community_tips")
        .select("recipient_user_id, amount_cents");
      if (period === "month") {
        tipQuery = tipQuery.gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        );
      }
      const { data: tips } = await tipQuery;
      (tips || []).forEach(t => {
        if (map[t.recipient_user_id]) {
          map[t.recipient_user_id].tips_cents += t.amount_cents || 0;
        }
      });

      setRows(
        Object.values(map)
          .sort((a, b) => b.points - a.points)
          .slice(0, 25)
      );
    } catch (err) {
      console.error("[LeaderboardModal]", err);
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9600] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "88vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
          <span className="font-semibold text-slate-800 text-sm">Community Leaders</span>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button
                onClick={() => setPeriod("month")}
                className={`px-3 py-1 font-medium transition-colors ${
                  period === "month" ? "bg-cyan-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                This Month
              </button>
              <button
                onClick={() => setPeriod("alltime")}
                className={`px-3 py-1 font-medium transition-colors ${
                  period === "alltime" ? "bg-cyan-600 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                All Time
              </button>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Column headers */}
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-1.5 bg-slate-50 border-b border-slate-100 flex-shrink-0">
            <div className="w-6 flex-shrink-0" />
            <div className="flex-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Angler</div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide text-right w-16">Points</div>
          </div>
        )}

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-12 px-4">
              No reports yet — be the first angler on the board!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                >
                  {/* Rank */}
                  <div className="w-6 text-center flex-shrink-0">
                    <span className={`text-xs font-bold ${
                      i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-slate-400"
                    }`}>{i + 1}</span>
                  </div>

                  {/* Name + stats */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm truncate">
                      {r.display_name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                      {r.reports > 0 && (
                        <span>{r.reports} report{r.reports !== 1 ? "s" : ""}</span>
                      )}
                      {r.lives > 0 && (
                        <span className="text-emerald-500">{r.lives} live</span>
                      )}
                      {r.tips_cents > 0 && (
                        <span className="text-amber-500">
                          ${(r.tips_cents / 100).toFixed(0)} tipped
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Points */}
                  <div className="text-right flex-shrink-0 w-16">
                    <div className="text-sm font-bold text-cyan-600">
                      {r.points.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400">pts</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sponsor banner */}
        <div className="border-t border-slate-100 flex-shrink-0 bg-slate-50">
          <div className="flex items-center gap-4 px-5 py-4">
            <img
              src="/nomad_DTX_200_ref.png"
              alt="Nomad DTX 200"
              className="w-24 h-auto object-contain flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 leading-snug mb-0.5">
                Every point is one shot to win this month's Community Angler prize.
              </p>
              <p className="text-[10px] text-slate-400">
                This month brought to you by Nomad.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            Post a catch report to earn points and appear on this board
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
