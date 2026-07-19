// src/components/AnnouncementCarousel.jsx
// Post-login "what's new" carousel — shown when the current user has unseen
// app_announcements rows (admin-authored update/announcement messages).
// Visually mirrors OnboardingCarousel (video/poster/mute, progress dots,
// prev/next footer) so the two feel like the same family of full-screen
// carousels, but each slide is a distinct admin-authored message rather than
// a fixed onboarding tour, and each slide carries its own thumbs up/down +
// optional comment feedback tied to that specific announcement.
//
// Dismissal: advancing past a slide (Next) marks that announcement's
// receipt seen_at. Closing the carousel (X) marks ALL remaining
// not-yet-dismissed announcements in the current queue as seen too, so
// closing early doesn't leave them stuck reappearing forever.
//
// Rendered by SSTLive.jsx, gated to fire only after the onboarding carousel
// has been resolved for this session — see the sequencing comment there.
// Counterpart admin authoring tool: admin/announcements_admin.html.

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX, ThumbsUp, ThumbsDown } from "lucide-react";

export default function AnnouncementCarousel({ announcements, onDismiss, onReact, onComment, onComplete }) {
  const [slide, setSlide] = useState(0);
  const [muted, setMuted] = useState(false);
  // Track which announcement ids we've already sent a dismiss call for, so
  // navigating back/forward within the session doesn't re-fire it needlessly
  // (idempotent on the server either way, this just avoids redundant writes).
  const dismissedRef = useRef(new Set());
  // Local UI state for reaction/comment per announcement id, keyed so it
  // survives navigating back and forth between slides in the same session.
  const [reactions, setReactions] = useState({});   // { [id]: 'up' | 'down' }
  const [commentDrafts, setCommentDrafts] = useState({}); // { [id]: string }
  const [commentSent, setCommentSent] = useState({}); // { [id]: true }
  const videoRef = useRef(null);

  const total = announcements.length;
  const current = announcements[slide];
  const isLast = slide === total - 1;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.currentTime = 0;
    v.pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  if (!current) return null;

  function toggleMute() {
    setMuted(m => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }

  function markDismissed(id) {
    if (dismissedRef.current.has(id)) return;
    dismissedRef.current.add(id);
    onDismiss(id);
  }

  function goNext() {
    markDismissed(current.id);
    if (isLast) { onComplete(); return; }
    setSlide(s => s + 1);
  }

  function goPrev() {
    if (slide > 0) setSlide(s => s - 1);
  }

  function closeAll() {
    // Closing early still counts as "seen" for every remaining message —
    // otherwise dismissing via X would leave the rest permanently stuck
    // reappearing on every future login.
    announcements.forEach(a => markDismissed(a.id));
    onComplete();
  }

  function handleReact(reaction) {
    setReactions(r => ({ ...r, [current.id]: reaction }));
    onReact(current.id, reaction);
  }

  function handleCommentChange(e) {
    setCommentDrafts(d => ({ ...d, [current.id]: e.target.value }));
  }

  function handleCommentSend() {
    const text = (commentDrafts[current.id] || "").trim();
    if (!text) return;
    onComment(current.id, text);
    setCommentSent(s => ({ ...s, [current.id]: true }));
  }

  const currentReaction = reactions[current.id];
  const currentDraft = commentDrafts[current.id] || "";
  const currentSent = commentSent[current.id];

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4">
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
           style={{ maxHeight: "90vh" }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <span className="text-xs font-semibold text-slate-400">
            {total > 1 ? `What's New (${slide + 1} of ${total})` : "What's New"}
          </span>
          <button
            onClick={closeAll}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Media + slide content + feedback scroll as a unit -- header,
            progress dots, and the nav footer (Next/Got it) stay pinned so
            the primary action is always reachable even when a tall video +
            long body + feedback UI together exceed the modal's max height
            on a short mobile viewport (previously everything was
            flex-shrink-0 inside an overflow-hidden card, so overflow was
            silently clipped with no way to scroll to it). */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* ── Media (image or video, only if present) ────────────────── */}
        {current.media_type === "video" && current.media_url && (
          <div className="relative bg-slate-900 flex-shrink-0" style={{ aspectRatio: "16/9" }}>
            <video
              ref={videoRef}
              key={current.id}
              src={current.media_url}
              poster={current.poster_url || undefined}
              muted={muted}
              playsInline
              controls
              className="w-full h-full object-contain"
              style={{ maxHeight: "100%", display: "block" }}
            />
            <button
              onClick={toggleMute}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
        {current.media_type === "image" && current.media_url && (
          <div className="bg-slate-900 flex-shrink-0" style={{ aspectRatio: "16/9" }}>
            <img
              src={current.media_url}
              alt={current.title}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* ── Slide content ───────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0 overflow-y-auto">
          <p className="text-sm font-semibold text-slate-800 mb-1">{current.title}</p>
          {/* body is admin-authored HTML (rich text editor in announcements_admin.html),
              not user-generated content -- RLS restricts app_announcements writes to the
              admin email allowlist (see migration app_announcements_and_receipts), same
              trust boundary as everything else in the admin tools. Arbitrary child
              selectors give the nested tags real formatting without the Tailwind
              typography plugin. */}
          <div
            className="text-xs text-slate-500 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2 [&_li]:mb-1 [&_strong]:font-semibold [&_strong]:text-slate-700 [&_em]:italic [&_a]:text-cyan-600 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: current.body }}
          />
        </div>

        {/* ── Feedback: thumbs + optional comment, tied to this message ── */}
        <div className="px-5 pb-1 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-slate-400">Was this useful?</span>
            <button
              onClick={() => handleReact("up")}
              className={`p-1.5 rounded-lg border transition-colors ${
                currentReaction === "up"
                  ? "bg-cyan-50 border-cyan-300 text-cyan-600"
                  : "border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300"
              }`}
              title="Thumbs up"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleReact("down")}
              className={`p-1.5 rounded-lg border transition-colors ${
                currentReaction === "down"
                  ? "bg-slate-100 border-slate-400 text-slate-700"
                  : "border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300"
              }`}
              title="Thumbs down"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
          </div>
          {!currentSent ? (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={currentDraft}
                onChange={handleCommentChange}
                placeholder="Leave a comment for the team (optional)"
                className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400"
                maxLength={500}
              />
              <button
                onClick={handleCommentSend}
                disabled={!currentDraft.trim()}
                className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 disabled:text-slate-300 disabled:cursor-not-allowed px-2"
              >
                Send
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-cyan-600 mb-2">Thanks — comment sent.</p>
          )}
        </div>
        </div>

        {/* ── Progress dots ───────────────────────────────────────────── */}
        {total > 1 && (
          <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0">
            {announcements.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`rounded-full transition-all ${
                  i === slide
                    ? "w-5 h-2 bg-cyan-500"
                    : "w-2 h-2 bg-slate-200 hover:bg-slate-300"
                }`}
              />
            ))}
          </div>
        )}

        {/* ── Navigation footer ───────────────────────────────────────── */}
        <div className="px-4 pb-4 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={goPrev}
            disabled={slide === 0}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 text-center">
            <span className="text-xs text-slate-400">{slide + 1} of {total}</span>
          </div>

          <button
            onClick={goNext}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors"
          >
            {isLast ? "Got it" : "Next"} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
