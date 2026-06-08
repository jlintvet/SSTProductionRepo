import React, { useState, useEffect } from "react";

const SPONSORS = [
  {
    name: "Penn Fishing",
    tagline: "Built for the Battle",
    sub: "Conventional Reels & Rods",
    bg: "from-red-900/80 to-slate-900",
    accent: "#ef4444",
    badge: "GEAR",
    icon: "🎣",
    cta: "Shop Penn →",
    url: "https://www.pennfishing.com",
    img: null,
    bgFull: false,
  },
  {
    name: "Nomad DTX Minnows",
    tagline: "Dive deeper. Troll faster.",
    sub: "Offshore Trolling Lures",
    bg: null,
    accent: "#ffffff",
    badge: "LURES",
    icon: null,
    cta: "Shop DTX Lures →",
    url: "https://www.nomadtackle.com/collections/dtx-offshore-trolling-minnows",
    img: "https://media.base44.com/images/public/69b70041f5d6b1569d9d7eb1/a8f599cc2_Screenshot2026-03-18160203.png",
    bgFull: true,
  },
  {
    name: "Sea Hunt Boats",
    tagline: "Born to Fish. Built to Last.",
    sub: "Center Console Boats",
    bg: "from-teal-900/80 to-slate-900",
    accent: "#14b8a6",
    badge: "BOATS",
    icon: "⛵",
    cta: "Explore Models →",
    url: "https://www.seahuntboats.com",
    img: null,
    bgFull: false,
  },
];

export default function SponsorPanel({ side = "left" }) {
  const [current, setCurrent] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setCurrent(c => (c + 1) % SPONSORS.length);
        setFade(true);
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const sponsor = SPONSORS[current];

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Main rotating ad card */}
      <div
        className="flex-1 rounded-xl border border-slate-700/60 p-4 flex flex-col justify-between overflow-hidden relative"
        style={{
          opacity: fade ? 1 : 0,
          transition: "opacity 0.4s",
          background: sponsor.bgFull
            ? `url('${sponsor.img}') center/cover no-repeat`
            : undefined,
        }}
      >
        {/* Gradient overlay for full-bg sponsors */}
        {sponsor.bgFull && (
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/70 rounded-xl" />
        )}

        {/* Gradient bg for non-image sponsors */}
        {!sponsor.bgFull && (
          <div className={`absolute inset-0 bg-gradient-to-b ${sponsor.bg} rounded-xl`} />
        )}

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Sponsor badge */}
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full border"
              style={{ color: sponsor.accent, borderColor: sponsor.accent + "66", background: sponsor.accent + "18" }}
            >
              {sponsor.badge}
            </span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Sponsor</span>
          </div>

          {/* Icon (non-bg sponsors only) */}
          {!sponsor.bgFull && !sponsor.img && (
            <div className="text-5xl text-center my-3">{sponsor.icon}</div>
          )}

          {/* Small product image (non-bg sponsors) */}
          {!sponsor.bgFull && sponsor.img && (
            <div
              className="w-full h-28 xl:h-32 bg-cover bg-center rounded-lg my-2"
              style={{ backgroundImage: `url('${sponsor.img}')` }}
            />
          )}

          {/* Spacer pushes text to bottom for full-bg cards */}
          {sponsor.bgFull && <div className="flex-1" />}

          {/* Text */}
          <div className="text-center space-y-1">
            <div className="text-white font-bold text-sm leading-tight drop-shadow">{sponsor.name}</div>
            <div className="text-slate-300 text-[11px] leading-snug">{sponsor.sub}</div>
            <div className="text-xs text-slate-200 mt-1 leading-snug">{sponsor.tagline}</div>
          </div>

          {/* CTA */}
          <a
            href={sponsor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block text-center text-xs font-semibold py-2 rounded-lg transition-colors bg-black text-white hover:bg-gray-800"
          >
            {sponsor.cta}
          </a>

          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5 mt-3">
            {SPONSORS.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFade(false); setTimeout(() => { setCurrent(i); setFade(true); }, 300); }}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{ background: i === current ? sponsor.accent : "#475569" }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Static "Advertise Here" footer slot */}
      <div className="rounded-xl border border-dashed border-slate-700 p-3 text-center">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-0.5">Your Ad Here</div>
        <div className="text-[11px] text-slate-500">Reach serious anglers</div>
        <div className="mt-2 text-[10px] font-medium text-teal-600 cursor-pointer hover:text-teal-400 transition-colors">contact@sstmaps.com</div>
      </div>
    </div>
  );
}