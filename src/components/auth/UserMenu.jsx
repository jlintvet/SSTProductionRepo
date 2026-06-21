// src/components/auth/UserMenu.jsx
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useRegionAccess } from "@/hooks/useRegionAccess";
import { useAppContext } from "@/context/AppContext";
import UserSettingsModal from "@/components/auth/UserSettingsModal";

export default function UserMenu({ onUpgrade }) {
  const { user } = useAuth();
  const { tier, daysLeft, permittedRegions } = useRegionAccess();
  const { userId, setUserSettings } = useAppContext();
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_profiles").select("display_name").eq("id", user.id).single()
      .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name); });
  }, [user]);

  if (!user) return null;

  const shortName = displayName || (user.email ?? "?").split("@")[0];
  const initials = shortName.slice(0, 2).toUpperCase();

  function getTierLabel() {
    if (tier === "pro")        return "Pro";
    if (tier === "ambassador") return "Ambassador";
    if (tier === "standard")   return "Standard";
    if (tier === "referral") {
      if (daysLeft === null) return "Ambassador Referral";
      if (daysLeft === 0)    return "Referral expired";
      if (daysLeft === 1)    return "Ambassador Referral (1 day left)";
      return "Ambassador Referral (" + daysLeft + " days left)";
    }
    if (tier === "trial") {
      if (daysLeft === null) return "Free Trial";
      if (daysLeft === 0)    return "Trial expired";
      if (daysLeft === 1)    return "Free Trial (1 day left)";
      return "Free Trial (" + daysLeft + " days left)";
    }
    return tier ?? "—";
  }

  function getTierColor() {
    if (tier === "pro")        return "#16a34a";
    if (tier === "ambassador") return "#7c3aed";
    if (tier === "standard")   return "#475569";
    if (tier === "referral") {
      return daysLeft === 0 ? "#dc2626" : "#7c3aed";
    }
    if (tier === "trial") {
      return daysLeft === 0 ? "#dc2626" : "#d97706";
    }
    return "#94a3b8";
  }

  const showUpgrade = (tier === "trial" || tier === "standard" || tier === "referral") && onUpgrade;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-bold flex items-center justify-center select-none">
          {initials}
        </span>
        <span className="text-[11px] text-slate-600 hidden sm:block max-w-[120px] truncate">
          {shortName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-2 text-xs">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-slate-800 font-medium truncate">{shortName}</p>
            <p className="text-slate-400 text-[10px] truncate">{user.email}</p>
            <p style={{ color: getTierColor() }} className="mt-0.5 font-semibold">
              {getTierLabel()}
            </p>
            {permittedRegions.length > 0 && (
              <p className="text-slate-400 mt-0.5">
                Region: {permittedRegions.join(", ")}
              </p>
            )}
          </div>

          {showUpgrade && (
            <button
              onClick={() => { setOpen(false); onUpgrade(); }}
              className="w-full text-left px-3 py-2 text-cyan-600 font-semibold hover:bg-cyan-50 transition-colors"
            >
              Upgrade to Pro →
            </button>
          )}

          <button
            onClick={() => { setOpen(false); setShowSettings(true); }}
            className="w-full text-left px-3 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Settings
          </button>

          <button
            onClick={() => supabase.auth.signOut()}
            className="w-full text-left px-3 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}

      {showSettings && userId && (
        <UserSettingsModal
          userId={userId}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => { setUserSettings(s); setShowSettings(false); }}
        />
      )}
    </div>
  );
}
