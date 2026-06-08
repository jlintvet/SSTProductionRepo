import React from "react";
import { useRegionAccess } from "@/hooks/useRegionAccess";

export default function RegionGate({ region, children, onUpgrade }) {
  const { permittedRegions, isExpired, tier, loading } = useRegionAccess();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = permittedRegions.includes(region);

  if (!hasAccess) {
    return <AccessDenied tier={tier} isExpired={isExpired} onUpgrade={onUpgrade} />;
  }

  return children;
}

function AccessDenied({ tier, isExpired, onUpgrade }) {
  const trialExpired = tier === "free_trial" && isExpired;

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 max-w-sm w-full text-center">
        <div className="text-3xl mb-3">{trialExpired ? "⏳" : "🔒"}</div>
        <h2 className="text-base font-semibold text-slate-800 mb-2">
          {trialExpired ? "Your free trial has ended" : "Subscription required"}
        </h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          {trialExpired
            ? "Upgrade to continue accessing real-time SST, chlorophyll, and sea color data for your region."
            : "This region requires an active subscription. Upgrade your plan to unlock access."}
        </p>
        {onUpgrade ? (
          <button
            onClick={onUpgrade}
            className="w-full h-10 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700 active:scale-[0.98] transition-all"
          >
            View plans
          </button>
        ) : (
          <p className="text-xs text-slate-400">
            Contact us to upgrade your subscription.
          </p>
        )}
        <p className="text-[10px] text-slate-400 mt-4">
          Questions? Email{" "}
          <a href="mailto:support@oceancast.app" className="text-cyan-600 hover:underline">
            support@oceancast.app
          </a>
        </p>
      </div>
    </div>
  );
}