// ShareLocationDialog.jsx
// Shows a map-teaser preview and lets the user share via SMS, email, or copy.
// The share link is built directly from the location data as URL query params —
// no database write needed, link is available immediately.
import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, Check, MessageSquare, Mail, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateShareImage } from "@/lib/generateShareImage";

// ── Build share URL from location data (no Supabase needed) ──────────────────
function buildShareUrl(location, notes) {
  const base   = window.location.origin;
  const params = new URLSearchParams();
  params.set("name", location.name || location.label || "Fishing Spot");
  params.set("lat",  parseFloat(location.lat).toFixed(6));
  params.set("lon",  parseFloat(location.lon).toFixed(6));
  if (location.sst != null) params.set("sst",   parseFloat(location.sst).toFixed(1));
  if (notes?.trim())        params.set("notes", notes.trim());
  return `${base}/share?${params.toString()}`;
}

function coordStr(lat, lon) {
  const la = parseFloat(lat), lo = parseFloat(lon);
  return `${Math.abs(la).toFixed(4)}°${la >= 0 ? "N" : "S"}, ${Math.abs(lo).toFixed(4)}°${lo >= 0 ? "E" : "W"}`;
}

function buildShareText(location, notes) {
  const name  = location.name || location.label || "Fishing Spot";
  const url   = buildShareUrl(location, notes);
  const lines = [name, coordStr(location.lat, location.lon)];
  if (location.sst != null) lines.push(`${parseFloat(location.sst).toFixed(1)}°F`);
  if (notes?.trim())        lines.push(notes.trim());
  lines.push(`\n${url}`);
  return lines.join("\n");
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ShareLocationDialog({
  location,
  userId,
  onClose,
  onNotesUpdated,
  heatmapData,
  sstMin,
  sstMax,
  sstRange,
}) {
  const [notes,      setNotes]      = useState(location.notes ?? "");
  const [notesSaved, setNotesSaved] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [copied,     setCopied]     = useState(false);

  const notesTimerRef = useRef(null);
  const previewUrlRef = useRef(null);
  const imgBlobRef    = useRef(null);

  // ── Generate map preview on mount ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function generate() {
      setImgLoading(true);

      // Only attempt if we have grid data to render
      const hasData = heatmapData?.latSet?.length > 0 && heatmapData?.lonSet?.length > 0;
      if (!hasData) {
        if (!cancelled) setImgLoading(false);
        return;
      }

      try {
        const blob = await generateShareImage({
          lat:          parseFloat(location.lat),
          lon:          parseFloat(location.lon),
          latSet:       heatmapData.latSet,
          lonSet:       heatmapData.lonSet,
          grid:         heatmapData.grid,
          sstMin,
          sstMax,
          rangeMin:     sstRange?.min,
          rangeMax:     sstRange?.max,
          locationName: location.name || location.label,
        });
        if (cancelled || !blob) return;
        imgBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setImgPreview(url);
      } catch (e) {
        console.warn("generateShareImage:", e);
      } finally {
        if (!cancelled) setImgLoading(false);
      }
    }

    generate();
    return () => {
      cancelled = true;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-save notes (debounced 800 ms) ───────────────────────────────────
  const persistNotes = useCallback(async (value) => {
    try {
      const { error } = await supabase
        .from("saved_locations")
        .update({ notes: value })
        .eq("id", location.id);
      if (!error) {
        onNotesUpdated?.(location.id, value);
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 1500);
      }
    } catch (_) {}
  }, [location.id, onNotesUpdated]);

  function handleNotesChange(e) {
    const val = e.target.value;
    setNotes(val);
    clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => persistNotes(val), 800);
  }

  // ── Text / Email — Web Share API with image when available ──────────────
  async function handleShare(type) {
    const text  = buildShareText(location, notes);
    const url   = buildShareUrl(location, notes);
    const lName = location.name || location.label || "Fishing Spot";
    const blob  = imgBlobRef.current;

    // Try Web Share API with image (mobile native share sheet)
    if (blob && navigator.canShare) {
      const file = new File([blob], "fishing-spot.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: lName, text, url });
          return;
        } catch (e) {
          if (e.name === "AbortError") return; // user cancelled
        }
      }
    }

    // Fallback (desktop / no file share support)
    if (type === "text") {
      window.location.href = `sms:?body=${encodeURIComponent(text)}`;
    } else {
      const subj = encodeURIComponent(`Fishing spot: ${lName}`);
      window.location.href = `mailto:?subject=${subj}&body=${encodeURIComponent(text)}`;
    }
  }

  // ── Copy ──────────────────────────────────────────────────────────────────
  // Bypass navigator.clipboard entirely — it competes for Web Locks with
  // Supabase's concurrent IndexedDB session operations and causes AbortErrors.
  function handleCopy() {
    legacyCopy(buildShareText(location, notes));
  }

  function legacyCopy(text) {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.focus(); el.select();
    try {
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      window.prompt("Copy this:", text);
    } finally {
      document.body.removeChild(el);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const name    = location.name || location.label || "Fishing Spot";
  const hasData = heatmapData?.latSet?.length > 0;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <span className="font-semibold text-slate-800 text-sm truncate">{name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Map preview */}
        <div className="relative w-full bg-[#0a1628]" style={{ height: 188 }}>
          {imgLoading && hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Generating map…</span>
            </div>
          )}
          {imgPreview && !imgLoading && (
            <img src={imgPreview} alt="SST map" className="w-full h-full object-cover" />
          )}
          {!imgPreview && !imgLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-500">
              <MapPin className="w-8 h-8 text-slate-600" />
              <span className="text-xs">
                {hasData ? "Could not render map" : "Open the share dialog while SST data is loaded to see a map preview"}
              </span>
            </div>
          )}
        </div>

        {/* Coordinates + SST */}
        <div className="px-4 pt-2">
          <p className="text-[11px] text-slate-400 font-mono">
            {coordStr(location.lat, location.lon)}
            {location.sst != null && (
              <span className="ml-2 text-cyan-600 font-semibold">
                {parseFloat(location.sst).toFixed(1)}°F
              </span>
            )}
          </p>
        </div>

        {/* Notes */}
        <div className="px-4 pt-2 pb-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-1">
            Notes
            {notesSaved && <span className="text-emerald-500 font-normal">✓ saved</span>}
          </label>
          <textarea
            value={notes}
            onChange={handleNotesChange}
            placeholder="Bait, conditions, tide rips…"
            rows={2}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700 placeholder:text-slate-300"
          />
        </div>

        {/* Share buttons */}
        <div className="px-4 pb-5 grid grid-cols-3 gap-2">
          <button
            onClick={() => handleShare("text")}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white transition-colors"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Text</span>
          </button>

          <button
            onClick={() => handleShare("email")}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            <Mail className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Email</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
            <span className={`text-[11px] font-semibold ${copied ? "text-emerald-600" : ""}`}>
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}