// SharedLocationLanding.jsx
// Recipient landing page at /share?name=...&lat=...&lon=...&sst=...&notes=...
// Reads location data directly from URL query params — no database lookup needed.
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { MapPin, Thermometer, FileText, Plus, Check, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

function coordStr(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  return `${Math.abs(la).toFixed(4)}°${la >= 0 ? "N" : "S"}, ${Math.abs(lo).toFixed(4)}°${lo >= 0 ? "E" : "W"}`;
}

export default function SharedLocationLanding() {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();

  const name  = searchParams.get("name")  || "Fishing Spot";
  const lat   = searchParams.get("lat");
  const lon   = searchParams.get("lon");
  const sst   = searchParams.get("sst");
  const notes = searchParams.get("notes");

  const [userId,    setUserId]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Check if location params are present
  const isValid = lat && lon;

  // ── Get current user ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data?.user?.id ?? null);
    });
    document.title = `${name} — SSTLive`;
  }, [name]);

  // ── Save to user's locations ─────────────────────────────────────────────
  async function handleSave() {
    if (!userId) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase
        .from("saved_locations")
        .insert({
          user_id:  userId,
          label:    name,
          lat:      parseFloat(lat),
          lon:      parseFloat(lon),
          notes:    notes || null,
          sst:      sst ? parseFloat(sst) : null,
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

  // ── Open app at this location ────────────────────────────────────────────
  function handleOpenApp() {
    navigate(`/?lat=${lat}&lon=${lon}`);
  }

  // ── Invalid link ─────────────────────────────────────────────────────────
  if (!isValid) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 rounded-2xl p-6 max-w-sm w-full text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-white font-semibold text-lg mb-1">Link not valid</h2>
          <p className="text-slate-400 text-sm mb-4">This share link is missing location data.</p>
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

  // ── Valid location ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-sm">

        {/* Header banner */}
        <div className="bg-sky-500 px-5 py-4">
          <p className="text-sky-100 text-xs font-medium uppercase tracking-wide mb-0.5">Fishing Spot</p>
          <h1 className="text-white font-bold text-xl leading-tight">{name}</h1>
        </div>

        {/* Location details */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span className="font-mono text-sm text-slate-600">{coordStr(lat, lon)}</span>
          </div>

          {sst && (
            <div className="flex items-center gap-2.5">
              <Thermometer className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span className="text-cyan-600 font-semibold text-sm">
                {parseFloat(sst).toFixed(1)}°F surface temp
              </span>
            </div>
          )}

          {notes && (
            <div className="flex items-start gap-2.5">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
              <span className="text-slate-600 text-sm italic">{notes}</span>
            </div>
          )}
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
              Saved to your locations
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "Saving…" : userId ? "Save to My Locations" : "Sign in to Save"}
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