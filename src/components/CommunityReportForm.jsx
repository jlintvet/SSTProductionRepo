// src/components/CommunityReportForm.jsx
// Modal for posting a community fishing report or live location pin.
import { useState, useEffect } from "react";
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
  { key: "cobia",         label: "Cobia" },
  { key: "grouper",       label: "Grouper" },
  { key: "rockfish",      label: "Rockfish" },
  { key: "seabass",       label: "Seabass" },
  { key: "tilefish",      label: "Tilefish" },
  { key: "flounder",      label: "Flounder" },
  { key: "other",         label: "Other" },
];

// Exported so map/popup rendering elsewhere can show full labels instead of raw keys.
export const SPECIES_LABELS = SPECIES.reduce((m, s) => { m[s.key] = s.label; return m; }, {});

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
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);
  const [useGpsLoc,   setUseGpsLoc]   = useState(false);
  const [gpsCoords,   setGpsCoords]   = useState(null);   // {lat, lon}
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsError,    setGpsError]    = useState(null);
  const [photo,       setPhoto]       = useState(null);   // File
  const [photoPreview,setPhotoPreview]= useState(null);   // object URL for preview
  const [photoError,  setPhotoError]  = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [profile,     setProfile]     = useState(null);  // { display_name, venmo_handle, cashapp_handle, post_anonymously_default }

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
    setQuantities(q => ({ ...q, [key]: Math.max(0, parseInt(val) || 0) }));
  }

  // Fetch the poster's profile once on mount — used for display name,
  // payment handles at submit time, and to seed the anonymous checkbox
  // from the user's saved account-level default (overridable below).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("user_profiles")
      .select("display_name, venmo_handle, cashapp_handle, post_anonymously_default")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setProfile(data);
        setIsAnonymous(!!data.post_anonymously_default);
      });
    return () => { cancelled = true; };
  }, [userId]);

  function requestGps() {
    if (!navigator.geolocation) { setGpsError("Geolocation not supported."); return; }
    setGpsLoading(true); setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      pos => { setGpsCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setUseGpsLoc(true); setGpsLoading(false); },
      ()  => { setGpsError("Could not get GPS location."); setGpsLoading(false); }
    );
  }

  function handlePhotoPick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { setPhotoError("Please choose an image file."); return; }
    if (f.size > 8 * 1024 * 1024) { setPhotoError("Image must be 8 MB or smaller."); return; }
    setPhotoError(null);
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  }
  function removePhoto() {
    setPhoto(null);
    setPhotoPreview(null);
    setPhotoError(null);
  }

  async function handleSubmit() {
    if (species.size === 0) { setError("Select at least one species."); return; }
    setError(null);
    setSubmitting(true);
    const effectiveLat = (useGpsLoc && gpsCoords) ? gpsCoords.lat : lat;
    const effectiveLon = (useGpsLoc && gpsCoords) ? gpsCoords.lon : lon;

    try {
      // Optional photo: upload to the existing share-images bucket (same
      // pattern as HelpReportModal) before inserting the row.
      let imageUrl = null;
      if (photo) {
        const path = `community/${crypto.randomUUID()}-${photo.name.replace(/[^\w.\-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("share-images")
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("share-images").getPublicUrl(path);
          imageUrl = pub?.publicUrl || null;
        }
        // Non-fatal: if the upload fails, still post the report without a photo.
      }
      const { data: authData } = await supabase.auth.getUser();
      const displayName =
        profile?.display_name?.trim() ||
        authData?.user?.email?.split("@")[0] ||
        "Angler";

      const isLive    = type === "live";
      const pointsAmt = isLive ? 5000 : 1000;
      // Both types persist 7 days. Live pins additionally render with the
      // pulsing live style for their first 48h (see isPulsing in
      // SSTHeatmapLeaflet.jsx), then automatically revert to the report
      // styling/color while remaining visible for the rest of the 7 days.
      const expiresAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const qty = {};
      species.forEach(k => { qty[k] = quantities[k] ?? 1; });

      const { data: loc, error: insErr } = await supabase
        .from("community_locations")
        .insert({
          user_id:        userId,
          display_name:   displayName,
          type,
          lat:            effectiveLat,
          lon:            effectiveLon,
          species:        Array.from(species),
          quantity:       qty,
          water_temp:     waterTemp,
          notes:          notes.trim() || null,
          image_url:      imageUrl,
          venmo_handle:   profile?.venmo_handle   || null,
          cashapp_handle: profile?.cashapp_handle || null,
          is_anonymous:   isAnonymous,
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
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-mono">
              {useGpsLoc && gpsCoords
                ? <>{gpsCoords.lat.toFixed(4)}°N, {Math.abs(gpsCoords.lon).toFixed(4)}°W <span className="text-emerald-600 font-semibold">(GPS)</span></>
                : <>{lat?.toFixed(4)}°N, {Math.abs(lon)?.toFixed(4)}°W</>
              }
            </span>
            {waterTemp != null && !useGpsLoc && (
              <span className="text-cyan-600 font-semibold">{waterTemp.toFixed(1)}°F</span>
            )}
            <span className={`ml-auto font-semibold ${type === "live" ? "text-emerald-600" : "text-cyan-600"}`}>
              +{type === "live" ? "5,000" : "1,000"} pts
            </span>
          </div>
          {type === "live" && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={useGpsLoc ? () => { setUseGpsLoc(false); setGpsCoords(null); } : requestGps}
                disabled={gpsLoading}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors border ${
                  useGpsLoc
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200"
                    : "bg-white text-slate-600 border-slate-300 hover:border-emerald-400"
                }`}
              >
                {gpsLoading ? "Getting GPS…" : useGpsLoc ? "Using GPS — tap to reset" : "Use GPS location"}
              </button>
              {gpsError && <span className="text-red-500 text-[10px]">{gpsError}</span>}
            </div>
          )}
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

        {/* Photo */}
        <div className="px-4 pt-1 pb-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Photo (optional)
          </p>
          {photoPreview ? (
            <div className="relative inline-block">
              <img src={photoPreview} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
              <button
                onClick={removePhoto}
                className="absolute -top-1.5 -right-1.5 bg-slate-700 text-white rounded-full w-5 h-5 flex items-center justify-center shadow"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 cursor-pointer hover:border-cyan-400 hover:text-cyan-600">
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
              Add a photo
            </label>
          )}
          {photoError && <p className="text-[10px] text-red-500 mt-1">{photoError}</p>}
        </div>

        {/* Anonymous toggle */}
        <div className="px-4 pt-1 pb-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={e => setIsAnonymous(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
            />
            <span className="text-xs text-slate-600">
              Post anonymously
              <span className="block text-[10px] text-slate-400">
                Your name won't be shown on the map. You'll still get credit on the
                leaderboard and can still be tipped — change your default in Settings.
              </span>
            </span>
          </label>
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
