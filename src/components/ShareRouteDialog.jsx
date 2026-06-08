// ShareRouteDialog.jsx
// Full-screen share modal for saved routes — matches ShareLocationDialog UX.
// On open, generates a share_token UUID (if the route doesn't have one) and
// saves it to saved_routes so recipients can fetch the route by token.
//
// Supabase: requires share_token column on saved_routes:
//   alter table public.saved_routes
//     add column if not exists share_token uuid default null unique;
//   -- Allow anyone to read a route by its share_token:
//   create policy "public share read" on public.saved_routes
//     for select using (share_token is not null);
//
import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, MessageSquare, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── UUID v4 (no external dep needed) ─────────────────────────────────────────
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Build share URL ───────────────────────────────────────────────────────────
function buildShareUrl(token) {
  return `${window.location.origin}/share/route?token=${token}`;
}

// ── Build share text ──────────────────────────────────────────────────────────
function buildShareText(route, token) {
  const url   = buildShareUrl(token);
  const name  = route.name || "Fishing Route";
  const wps   = route.waypoints || [];
  const lines = [`🗺️ ${name}`, `📍 ${wps.length} waypoints`];
  if (route.cruise_speed_kts) lines.push(`⚡ ${route.cruise_speed_kts} kts`);
  wps.forEach((w, i) => {
    const lat = Math.abs(w.lat).toFixed(4) + (w.lat >= 0 ? "°N" : "°S");
    const lon = Math.abs(w.lng).toFixed(4) + (w.lng >= 0 ? "°E" : "°W");
    lines.push(`${i + 1}. ${w.label || `WP ${i + 1}`}  ${lat}, ${lon}`);
  });
  lines.push("\n👉 " + url);
  return lines.join("\n");
}

// ── Legacy copy (avoids Web Locks conflict with Supabase IndexedDB) ───────────
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

// ── Main component ────────────────────────────────────────────────────────────
export default function ShareRouteDialog({ route, onClose, onTokenSaved }) {
  // route: { id, name, waypoints, cruise_speed_kts, share_token? }
  const [shareToken,  setShareToken]  = useState(route.share_token ?? null);
  const [generating,  setGenerating]  = useState(!route.share_token);
  const [genError,    setGenError]    = useState(null);
  const [copied,      setCopied]      = useState(false);
  const didGenRef = useRef(false);

  // ── Generate + save share_token on mount (once) ───────────────────────────
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
        setGenError("Couldn't create share link. Try again.");
      } finally {
        setGenerating(false);
      }
    }

    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Share handlers ────────────────────────────────────────────────────────
  function handleText() {
    if (!shareToken) return;
    window.location.href = `sms:?body=${encodeURIComponent(buildShareText(route, shareToken))}`;
  }

  function handleEmail() {
    if (!shareToken) return;
    const name = route.name || "Fishing Route";
    const subj = encodeURIComponent(`Fishing route: ${name}`);
    window.location.href = `mailto:?subject=${subj}&body=${encodeURIComponent(buildShareText(route, shareToken))}`;
  }

  function handleCopy() {
    if (!shareToken) return;
    legacyCopy(buildShareText(route, shareToken), (ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    });
  }

  const name = route.name || "Fishing Route";
  const wps  = route.waypoints || [];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Route icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M3 12h18M3 6l3 6-3 6M21 6l-3 6 3 6"/>
            </svg>
            <span className="font-semibold text-slate-800 text-sm truncate">{name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Route summary */}
        <div className="px-4 pb-1">
          <p className="text-[11px] text-slate-400">
            {wps.length} waypoint{wps.length !== 1 ? "s" : ""}
            {route.cruise_speed_kts ? ` · ${route.cruise_speed_kts} kts` : ""}
          </p>
        </div>

        {/* Waypoints list */}
        <div className="mx-4 mb-3 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
          <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
            {wps.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No waypoints</p>
            ) : (
              wps.map((w, i) => {
                const lat = Math.abs(w.lat).toFixed(4) + (w.lat >= 0 ? "°N" : "°S");
                const lon = Math.abs(w.lng).toFixed(4) + (w.lng >= 0 ? "°E" : "°W");
                return (
                  <div
                    key={w.id || i}
                    className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0"
                  >
                    <span className="w-4 h-4 rounded-full bg-cyan-100 text-cyan-700 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-xs text-slate-700 font-medium truncate">
                      {w.label || (i === 0 ? "Departure" : `WP ${i + 1}`)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                      {lat}, {lon}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Share link status */}
        <div className="px-4 pb-3">
          {generating && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating share link…
            </div>
          )}
          {genError && (
            <p className="text-xs text-red-500">{genError}</p>
          )}
          {shareToken && !generating && (
            <p className="text-[10px] text-slate-400 font-mono truncate">
              {buildShareUrl(shareToken)}
            </p>
          )}
        </div>

        {/* Share buttons */}
        <div className="px-4 pb-5 grid grid-cols-3 gap-2">
          <button
            onClick={handleText}
            disabled={!shareToken || generating}
            className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-white transition-colors disabled:opacity-40"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[11px] font-semibold">Text</span>
          </button>

          <button
            onClick={handleEmail}
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
