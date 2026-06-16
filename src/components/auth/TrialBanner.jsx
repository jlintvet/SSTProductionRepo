import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function TrialBanner({ daysLeft, onUpgrade }) {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  if (daysLeft === null || dismissed) return null;

  const urgent = daysLeft <= 2;

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium border-b ${
        urgent
          ? "bg-amber-50 border-amber-200 text-amber-800"
          : "bg-cyan-50 border-cyan-200 text-cyan-800"
      }`}
    >
      <span>
        {daysLeft === 0
          ? "⚠️ Your free trial expires today."
          : daysLeft === 1
          ? "⏳ 1 day left in your free trial."
          : `🌊 ${daysLeft} days left in your free trial.`}
      </span>
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => { if (onUpgrade) onUpgrade(); else navigate("/pricing"); }}
          className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
            urgent
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-cyan-600 text-white hover:bg-cyan-700"
          }`}
        >
          Upgrade
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="opacity-50 hover:opacity-100 transition-opacity leading-none text-base"
          aria-label="Dismiss banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}