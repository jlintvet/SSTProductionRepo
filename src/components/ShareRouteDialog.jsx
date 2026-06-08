// ShareRouteDialog.jsx
// Full-screen share modal for saved routes — shows SST route map preview.
import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, MessageSquare, Mail, Loader2, Navigation } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { generateRouteShareImage } from "@/lib/generateRouteShareImage";

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function buildShareUrl(token) {
  return `${window.location.origin}/share/route?token=${token}`;
}

function buildShareText(route, token) {
  const url  = buildShareUrl(token);
  const name = route.name || "Fishing Route";
  const wps  = route.waypoints || [];
  const lines = [
    name,
    `${wps.length} waypoint${wps.length !== 1 ? "s" : ""}${route.cruise_speed_kts ? ` · ${route.cruise_speed_kts} kts` : ""}`,
    "",
    url,
  ];
  return lines.join("\n");
}

function legacyCopy(text, onDone) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  el.focus(); el.select();
  try {
    document.execCommand("copy");
    onDone(true);
  } catch (_) {
    window.prompt("Copy this:", text);
    onDone(false);
  } finally {
    document.body.removeChild(el);
  }
}

export default function ShareRouteDialog({
  route, onClose, onTokenSaved,
  heatmapData, sstMin, sstMax, sstRange,
}) {
  const [shareToken,  setShareToken]  = useState(route.share_token ?? null);
  const [generating,  setGenerating]  = useState(!route.share_token);
  const [genError,    setGenError]    = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [imgPreview,  setImgPreview]  = useState(null);
  const [imgLoading,  setImgLoading]  = useState(true);
  const didGenRef = useRef(false);
  const previewUrlRef = useRef(null);
  const imgBlobRef = useRef(null);

  // ── Generate share_token ──────────────────────────────────────────────────
  useEffect(() => {
    if (route.share_token || didGenRef.current) return;
    didGenRef.current = true;
    async function generate() {
      setGenerating(true);
      setGenError(null);
      try {
        const token = uuidv4();
        const { error } = await supabase
          .from("saved_routes")
          .update({ share_token: token })
          .eq("id", route.id);
        if (error) throw error;
        setShareToken(token);
        onTokenSaved?.(route.id, token);
      } catch (e) {
        console.error("[ShareRouteDialog] token gen error:", e);
        setGenError("Couldn\'t create share link. Try again.");
      } finally {
        setGenerating(false);
      }
    }
    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generate route map preview ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function generate() {
      setImgLoading(true);
      const hasData = heatmapData?.latSet?.length > 0 && heatmapData?.lonSet?.length > 0;
      if (!hasData || !route.waypoints?.length) {
        if (!cancelled) setImgLoading(false);
        return;
      }
      try {
        const blob = await generateRouteShareImage({
          waypoints: route.waypoints,
          latSet:    heatmapData.latSet,
          lonSet:    heatmapData.lonSet,
          grid:      heatmapData.grid,
          sstMin,
          sstMax,
          rangeMin:  sstRange?.min,
          rangeMax:  sstRange?.max,
          routeName: route.name || "Fishing Route",
        });
        if (cancelled || !blob) return;
        imgBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setImgPreview(url);
      } catch (e) {
        console.warn("generateRouteShareImage:", e);
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

  async function handleShare(type) {
    if (!shareToken) return;
    const text  = buildShareText(route, shareToken);
    const url   = buildShareUrl(shareToken);
    const rName = route.name || "Fishing Route";
    const blob  = imgBlobRef.current;

    if (blob && navigator.canShare) {
      const file = new File([blob], "fishing-route.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: rName, text, url });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
        }
      }
    }

    if (type === "text") {
      window.location.href = `sms:?body=${encodeURIComponent(text)}`;
    } else {
      const subj = encodeURIComponent(`Fishing route: ${rName}`);
      window.location.href = `mailto:?subject=${subj}&body=${encodeURIComponent(text)}`;
    }
  }

  function handleCopy() {
    if (!shareToken) return;
    legacyCopy(buildShareText(route, shareToken), (ok) => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); }
    });
  }

  const name = route.name || "Fishing Route";
  const wps  = route.waypoints || [];
  const hasData = heatmapData?.latSet?.length > 0;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
            </svg>
            <span className="font-semibold text-slate-800 text-sm truncate">{name}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SST route map preview */}
        <div className="relative w-full bg-[#0a1628]" style={{ height: 188 }}>
          {imgLoading && hasData && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Generating map…</span>
            </div>
          )}
          {imgPreview && !imgLoading && (
            <img src={imgPreview} alt="Route on SST map" className="w-full h-full object-cover" />
          )}
          {!imgPreview && !imgLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-500 px-6 text-center">
              <Navigation className="w-7 h-7 text-cyan-600 mb-1" />
              <span className="text-xs font-medium text-slate-300">{name}</span>
              <span className="text-[11px] text-slate-500">
                {wps.length} waypoint{wps.length !== 1 ? "s" : ""}
                {route.cruise_speed_kts ? ` · ${route.cruise_speed_kts} kts` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Route summary */}
        <div className="px-4 pt-2 pb-1">
          <p className="text-[11px] text-slate-400">
            {wps.length} waypoint{wps.length !== 1 ? "s" : ""}
            {route.cruise_speed_kts ? ` · ${route.cruise_speed_kts} kts` : ""}
          </p>
        </div>

        {/* Share link status */}
        <div className="px-4 pb-3">
          {generating && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating share link…
            </div>
          )}
          {genError && <p className="text-xs text-red-500">{genError}</p>}
          {shareToken && !generating && (
            <p className="text-[10px] text-slate-400 font-mono truncate">{buildShareUrl(shareToken)}</p>
          )}
        </div>

        {/* Share buttons */}
        <div className="px-4 pb-5 grid grid-cols-3 gap-2">
          <button
            onClick={() => handleShare("text")}
            disabled={!shareToken || generating}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white transition-colors disabled:opacity-40"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Text</span>
          </button>
          <button
            onClick={() => handleShare("email")}
            disabled={!shareToken || generating}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-40"
          >
            <Mail className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Email</span>
          </button>
          <button
            onClick={handleCopy}
            disabled={!shareToken || generating}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-40"
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
