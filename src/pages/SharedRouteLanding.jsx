// SharedRouteLanding.jsx
// Recipient landing page at /share/route?token=<share_token>
// Fetches the shared route from saved_routes by share_token (public read policy).
// Lets the recipient save the route to their own saved_routes.
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Check, Loader2, Navigation } from "lucide-react";
import { supabase } from "@/lib/supabase";

function fmtCoord(val, isLat) {
  const abs = Math.abs(parseFloat(val)).toFixed(4);
  const dir = isLat ? (parseFloat(val) >= 0 ? "N" : "S") : (parseFloat(val) >= 0 ? "E" : "W");
  return `${abs}°${dir}`;
}

export default function SharedRouteLanding() {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get("token");

  const [route,     setRoute]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [notFound,  setNotFound]  = useState(false);
  const [userId,    setUserId]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null);
    });
  }, []);

  // ── Fetch route by token ─────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("saved_routes")
          .select("id, name, waypoints, cruise_speed_kts, created_at")
          .eq("share_token", token)
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setRoute(data);
          document.title = `${data.name || "Fishing Route"} — SSTLive`;
        }
      } catch (_) {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  // ── Save to my routes ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!userId) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase
        .from("saved_routes")
        .insert({
          user_id:          userId,
          name:             route.name || "Shared Route",
          waypoints:        route.waypoints,
          cruise_speed_kts: route.cruise_speed_kts || null,
        });
      if (error) throw error;
      setSaved(true);
    } catch (e) {
      console.error("Save failed:", e);
      setSaveError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Open app with this route ──────────────────────────────────────────────
  function handleOpenApp() {
    if (!route?.waypoints?.length) { navigate("/"); return; }
    sessionStorage.setItem("sst_pending_route", JSON.stringify(route));
    navigate("/");
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  // ── Not found / invalid ──────────────────────────────────────────────────
  if (notFound || !route) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 rounded-2xl p-6 max-w-sm w-full text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-white font-semibold text-lg mb-1">Route not found</h2>
          <p className="text-slate-400 text-sm mb-4">
            This share link is invalid or the route was deleted.
          </p>
          <button
            onClick={() => navigate("/")}
            className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold"
          >
            Open SSTLive
          </button>
        </div>
      </div>
    );
  }

  // ── Valid route ──────────────────────────────────────────────────────────
  const wps = route.waypoints || [];

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm">

        {/* Header banner */}
        <div className="bg-cyan-600 px-5 py-4">
          <p className="text-cyan-100 text-xs font-medium uppercase tracking-wide mb-0.5">Fishing Route</p>
          <h1 className="text-white font-bold text-xl leading-tight">
            {route.name || "Unnamed Route"}
          </h1>
          <p className="text-cyan-200 text-xs mt-1">
            {wps.length} waypoint{wps.length !== 1 ? "s" : ""}
            {route.cruise_speed_kts ? ` · ${route.cruise_speed_kts} kts` : ""}
          </p>
        </div>

        {/* Waypoints list */}
        <div className="px-5 py-4">
          <div className="flex flex-col gap-0">
            {wps.map((w, i) => (
              <div key={w.id || i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-tight">
                    {w.label || (i === 0 ? "Departure" : `Waypoint ${i + 1}`)}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {fmtCoord(w.lat, true)}, {fmtCoord(w.lng, false)}
                  </p>
                </div>
                {i === 0 && (
                  <Navigation className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0 mt-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* Save error */}
        {saveError && (
          <p className="px-5 pt-3 text-xs text-red-500">{saveError}</p>
        )}

        {/* Actions */}
        <div className="px-5 py-4 flex flex-col gap-2">
          {saved ? (
            <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-50 text-emerald-600 text-sm font-semibold">
              <Check className="w-4 h-4" />
              Saved to your routes
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "Saving…" : userId ? "Save to My Routes" : "Sign in to Save"}
            </button>
          )}

          <button
            onClick={handleOpenApp}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
          >
            View on Map
          </button>
        </div>

        <div className="px-5 pb-4 text-center">
          <p className="text-[11px] text-slate-300">
            Shared via <span className="font-semibold text-slate-400">SSTLive</span>
          </p>
        </div>

      </div>
    </div>
  );
}
