// ShareForecastDialog.jsx
// Shows a generated forecast-card image for one location + day and lets the
// user share it via the native share sheet (Text / Email / Copy). Mirrors
// ShareLocationDialog but the picture is the weather forecast, not the SST map.
import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, MessageSquare, Mail, Loader2, CalendarDays } from "lucide-react";
import { generateForecastShareImage } from "@/lib/generateForecastShareImage";

function buildShareText(payload) {
  const { locationLabel, periodLabel, condition, high, low, wind, waves } = payload;
  const lines = [];
  lines.push(`${locationLabel || "Forecast"} — ${periodLabel || ""}`.trim());
  if (condition) lines.push(condition);
  const t = [];
  if (high != null) t.push(`Hi ${high}°`);
  if (low != null) t.push(`Lo ${low}°F`);
  if (t.length) lines.push(t.join("  "));
  if (wind && (wind.direction || wind.speed)) lines.push(`Wind ${[wind.direction, wind.speed].filter(Boolean).join(" ")}`);
  if (waves) lines.push(`Seas ${waves}`);
  lines.push("");
  lines.push("Shared from RipLoc — live SST, marine forecasts & fishing intel");
  lines.push("https://riploc.com");
  return lines.join("\n");
}

export default function ShareForecastDialog({ payload, onClose }) {
  const [imgPreview, setImgPreview] = useState(null);
  const [imgLoading, setImgLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const previewUrlRef = useRef(null);
  const imgBlobRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function gen() {
      setImgLoading(true);
      try {
        const blob = await generateForecastShareImage(payload);
        if (cancelled || !blob) { if (!cancelled) setImgLoading(false); return; }
        imgBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setImgPreview(url);
      } catch (e) {
        console.warn("generateForecastShareImage:", e);
      } finally {
        if (!cancelled) setImgLoading(false);
      }
    }
    gen();
    return () => {
      cancelled = true;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleShare(type) {
    const text = buildShareText(payload);
    const title = `${payload.locationLabel || "Forecast"} — ${payload.periodLabel || ""}`.trim();
    const blob = imgBlobRef.current;

    if (blob && navigator.canShare) {
      const file = new File([blob], "forecast.png", { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title, text });
          return;
        } catch (e) {
          if (e.name === "AbortError") return;
        }
      }
    }

    if (type === "text") {
      window.location.href = `sms:?body=${encodeURIComponent(text)}`;
    } else {
      const subj = encodeURIComponent(title);
      window.location.href = `mailto:?subject=${subj}&body=${encodeURIComponent(text)}`;
    }
  }

  function handleCopy() {
    const text = buildShareText(payload);
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

  const title = `${payload.locationLabel || "Forecast"}`;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-4 h-4 text-cyan-700 flex-shrink-0" />
            <span className="font-semibold text-slate-800 text-sm truncate">
              {title}
              {payload.periodLabel && <span className="text-slate-400 font-normal"> · {payload.periodLabel}</span>}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative w-full bg-[#0a1628] flex items-center justify-center" style={{ minHeight: 220 }}>
          {imgLoading && (
            <div className="flex flex-col items-center justify-center gap-2 text-slate-400 py-12">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Generating forecast…</span>
            </div>
          )}
          {imgPreview && !imgLoading && (
            <img src={imgPreview} alt="Forecast" className="w-full h-auto block" />
          )}
          {!imgPreview && !imgLoading && (
            <div className="flex flex-col items-center justify-center gap-1 text-slate-500 py-12">
              <CalendarDays className="w-8 h-8 text-slate-600" />
              <span className="text-xs">Could not render forecast</span>
            </div>
          )}
        </div>

        <div className="px-4 py-5 grid grid-cols-3 gap-2">
          <button
            onClick={() => handleShare("text")}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-cyan-700 hover:bg-cyan-800 active:bg-cyan-900 text-white transition-colors"
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
