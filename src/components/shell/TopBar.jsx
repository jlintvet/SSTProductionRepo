// Slim persistent header. Holds the LocationPicker (single source of truth
// for both SST map and weather panel) and the UserMenu. Stays visible in all
// app states including expanded-map mode — the location dropdown is now THE
// primary control and shouldn't be hidden behind a panel toggle.
//
// Height: 48px desktop / 44px mobile. Uses inline z-index so it sits above
// drawers and modals predictably (see z-order scale comment below).

import React, { useState } from "react";
import { LifeBuoy } from "lucide-react";
import riplocIcon from "@/public/Branding/riplocB text w icon.png";
import LocationPicker from "@/components/shell/LocationPicker";
import UserMenu from "@/components/auth/UserMenu";
import HelpReportModal from "@/components/HelpReportModal";
import { useAppContext } from "@/context/AppContext";

// Z-order scale (documented in one place so it's easy to keep coherent):
//   0     map base
//   100   map data overlays
//   400   map markers
//   500   map control panel / mobile bottom bar
//   600   wind time slider
//   700   hover tooltips
//   800   click info / marker popovers
//   900   saved locations popout
//   1000  weather drawer / bottom sheet
//   1100  topbar
//   1200  modals
const Z_TOPBAR = 1100;

export default function TopBar({ onUpgrade }) {
  const { daysLeft } = useAppContext();
  const [showHelp, setShowHelp] = useState(false);
  const showTrial = typeof daysLeft === "number";
  const urgent = showTrial && daysLeft <= 2;

  return (
    <>
    <header
      className="flex-shrink-0 flex items-center justify-between gap-2 bg-white border-b border-slate-200 px-3 sm:px-4"
      style={{
        height: "var(--topbar-h, 48px)",
        zIndex: Z_TOPBAR,
        position: "relative",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Brand mark */}
        <img src={riplocIcon} alt="RipLoc" style={{height:28,width:"auto",objectFit:"contain",display:"block"}} />

        <div className="h-5 w-px bg-slate-200 hidden sm:block" />

        <LocationPicker />
      </div>

      {/* Right cluster: trial badge, help, user menu (kept together, far right) */}
      <div className="flex items-center gap-2 flex-shrink-0">
      {showTrial && (
        <button
          onClick={onUpgrade}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex-shrink-0 ${
            urgent
              ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
              : "bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100"
          }`}
        >
          {daysLeft === 0 ? "⚠️ Trial expires today" : daysLeft === 1 ? "⏳ 1 day left in trial" : `🌊 ${daysLeft} days left in trial`}
          <span className="underline">Upgrade</span>
        </button>
      )}

      <button
        onClick={() => setShowHelp(true)}
        title="Help & report an issue"
        aria-label="Help & report an issue"
        className="hidden sm:flex flex-shrink-0 w-8 h-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-cyan-700 items-center justify-center transition-colors"
      >
        <LifeBuoy className="w-4 h-4" />
      </button>

      <div className="flex-shrink-0">
        <UserMenu onUpgrade={onUpgrade} />
      </div>
      </div>
    </header>
    {showHelp && <HelpReportModal onClose={() => setShowHelp(false)} />}
    </>
  );
}