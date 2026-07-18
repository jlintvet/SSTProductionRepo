// src/components/TipNotificationModal.jsx
// Shown once per login when the current user has unseen tip_notifications rows --
// i.e. someone tried to tip them on a community report, but the pin had no
// venmo_handle/cashapp_handle on file. Nudges them to add one in Settings, or
// mute the nudge entirely if they'd rather not be asked again. Counterpart to
// the email side of this flow in the notify-tip-missing-handle edge function.
// Rendered by SSTLive.jsx alongside OnboardingCarousel, same gate pattern
// (fires after loading/userId are ready and the mute flag is confirmed false).
import React from "react";

function fmtAmount(cents) {
  return cents ? `$${(cents / 100).toFixed(0)}` : "a tip";
}

function fmtPlatform(p) {
  return p === "venmo" ? "Venmo" : "Cash App";
}

export default function TipNotificationModal({ notifications, onDismiss, onOpenSettings, onMute }) {
  if (!notifications?.length) return null;
  const count = notifications.length;
  const first = notifications[0];

  return (
    <div
      className="fixed inset-0 z-[9700] flex items-center justify-center p-4"
      style={{ background: "rgba(15,23,42,0.7)" }}
    >
      <div className="bg-white rounded-2xl w-full shadow-2xl overflow-hidden" style={{ maxWidth: 380 }}>
        <div className="bg-slate-900 px-4 py-3">
          <div className="text-cyan-400 text-[11px] font-bold uppercase tracking-wide">
            Missed tip{count > 1 ? "s" : ""}
          </div>
          <div className="text-slate-100 text-sm font-semibold mt-0.5">
            {count === 1 ? "Someone tried to tip you!" : `${count} anglers tried to tip you!`}
          </div>
        </div>
        <div className="px-4 py-4">
          <p className="text-sm text-slate-600 leading-snug mb-3">
            {count === 1
              ? `A fellow angler tried to send you ${fmtAmount(first.amount_cents)} via ${fmtPlatform(first.platform)} for one of your reports, but you haven't added that payment handle in Settings yet.`
              : `Anglers have tried to tip you ${count} times for your reports, but you're missing a Venmo or Cash App handle in Settings.`}
          </p>
          <p className="text-xs text-slate-500 leading-snug mb-4">
            Add your handle so you don't miss out on tips going forward.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              className="flex-1 py-2 rounded-xl border border-slate-300 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Remind me later
            </button>
            <button
              onClick={onOpenSettings}
              className="flex-1 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold transition-colors"
            >
              Add Payment Info
            </button>
          </div>
          <button
            onClick={onMute}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-3 transition-colors"
          >
            Don't show this again
          </button>
        </div>
      </div>
    </div>
  );
}
