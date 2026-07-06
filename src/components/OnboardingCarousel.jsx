// src/components/OnboardingCarousel.jsx
// New-user onboarding carousel — video-based, 10 slides.
// Videos are hosted in Supabase Storage bucket "onboarding-videos".
// Replace each videoUrl with the actual public URL after uploading your recordings.
//
// Re-launch: dispatch `new CustomEvent("riploc:start-tour")` from anywhere
// (HelpReportModal "Take the Tour" button, UserSettingsModal, etc.)
// SSTLive listens for this event and sets showOnboarding = true.
//
// Completion: calls onComplete() which marks has_seen_onboarding = true in user_profiles.

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";

// ── Slide config ──────────────────────────────────────────────────────────────
// Replace videoUrl values with your Supabase Storage public URLs after upload.
// Format: https://<your-project>.supabase.co/storage/v1/object/public/onboarding-videos/<filename>
// Bucket name: onboarding-videos  (public, no auth required)

const SLIDES = [
  {
    id: "welcome",
    title: "Welcome to RipLoc",
    caption: "A quick tour of what RipLoc can do for your fishing. Take 2 minutes now — it pays off on the water.",
    videoUrl: "https://riploc-storage.s3.us-east-2.amazonaws.com/RipLoc+Layout.mp4",
  },
  {
    id: "sst-map",
    title: "Reading the SST Map",
    caption: "What the colors mean, how to read warm/cold gradients, and why temperature edges are the key to finding fish.",
    videoUrl: null,
  },
  {
    id: "data-sources",
    title: "SST Data Sources",
    caption: "MUR (Cloud Free) gives the clearest daily picture. VIIRS Hourly shows the freshest satellite passes. HD Composite fills cloud gaps.",
    videoUrl: null,
  },
  {
    id: "temp-break",
    title: "Temp Break Tool",
    caption: "Set a target temperature and sharpness to highlight the exact gradient you want to fish. Yellowfin and marlin stack up here.",
    videoUrl: null,
  },
  {
    id: "hotspots",
    title: "Fish Hot Spots",
    caption: "AI-scored locations based on SST, chlorophyll, currents, and bottom structure. Select your target species to tune the model.",
    videoUrl: null,
  },
  {
    id: "overlays",
    title: "Currents, Wind & Sea Color",
    caption: "Layer ocean currents, wind, and sea color over your SST map. Current edges concentrate bait and attract pelagics.",
    videoUrl: null,
  },
  {
    id: "bathy",
    title: "Bathymetry & Bottom Features",
    caption: "NOAA depth contours and wrecks/reefs. The 100-fathom curve and canyon edges are your structural waypoints.",
    videoUrl: null,
  },
  {
    id: "community",
    title: "Community Pins",
    caption: "See where other anglers are catching fish right now. Post live reports and collect points for the leaderboard.",
    videoUrl: null,
  },
  {
    id: "trip",
    title: "Trip Planning & Routes",
    caption: "Build a waypoint route over the SST map. See distance, fuel burn, and share the plan with your crew.",
    videoUrl: null,
  },
  {
    id: "weather",
    title: "Weather & Buoys",
    caption: "Marine forecasts and live NDBC buoy readings within range of your departure. Know before you go.",
    videoUrl: null,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function OnboardingCarousel({ onComplete }) {
  const [slide, setSlide]   = useState(0);
  const [muted, setMuted]   = useState(true);
  const videoRef            = useRef(null);
  const total               = SLIDES.length;
  const current             = SLIDES[slide];
  const isLast              = slide === total - 1;

  // Reset video to start on slide change; do NOT autoplay — user taps play.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    v.currentTime = 0;
    v.pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  function toggleMute() {
    setMuted(m => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }

  function goNext() {
    if (isLast) { onComplete(); return; }
    setSlide(s => s + 1);
  }
  function goPrev() { if (slide > 0) setSlide(s => s - 1); }

  return createPortal(
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 p-4">
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col"
           style={{ maxHeight: "90vh" }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <span className="text-xs font-semibold text-slate-400">Getting Started</span>
          <button
            onClick={onComplete}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="Skip tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Video ───────────────────────────────────────────────────── */}
        <div className="relative bg-slate-900 flex-shrink-0" style={{ aspectRatio: "16/9" }}>
          {current.videoUrl ? (
            <video
              ref={videoRef}
              key={slide}
              src={current.videoUrl}
              muted={muted}
              playsInline
              controls
              className="w-full h-full object-contain"
              style={{ maxHeight: "100%", display: "block" }}
            />
          ) : (
            // Placeholder shown until you upload videos
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                <span className="text-white text-lg font-bold">{slide + 1}</span>
              </div>
              <p className="text-sm text-slate-400">Video coming soon</p>
              <p className="text-xs text-slate-600">Upload to Supabase Storage: onboarding-videos/{`0${slide + 1}_${current.id}.mp4`}</p>
            </div>
          )}

          {/* Mute toggle — only shown when video is present */}
          {current.videoUrl && (
            <button
              onClick={toggleMute}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* ── Slide content ───────────────────────────────────────────── */}
        <div className="px-5 pt-4 pb-2 flex-shrink-0">
          <p className="text-sm font-semibold text-slate-800 mb-1">{current.title}</p>
          <p className="text-xs text-slate-500 leading-relaxed">{current.caption}</p>
          <p className="text-[10px] text-cyan-600 mt-2 font-medium">
            Tap ? next to any feature for more detail on that topic.
          </p>
        </div>

        {/* ── Progress dots ───────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-1.5 py-2 flex-shrink-0">
          {SLIDES.map((_, i) => (
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

          {isLast ? (
            <button
              onClick={onComplete}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors"
            >
              Get Started
            </button>
          ) : (
            <button
              onClick={goNext}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
}
