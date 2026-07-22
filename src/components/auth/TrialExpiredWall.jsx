// src/components/auth/TrialExpiredWall.jsx
// Forced-choice modal shown over the still-usable app when a user's free
// trial has expired. Previously this was a full-page takeover that
// replaced the map entirely -- reworked so the app renders normally
// underneath (core/Standard features already work at this point; only
// Pro features are gated via ProGate/MobileProGate) and this overlays it,
// requiring the user to either confirm Standard (free, permanent) or
// upgrade to Pro. No X/backdrop dismiss -- Sign out is the only other way
// out, since it's a legitimate account action rather than a way to keep
// using the app without choosing.
//
// Fetches real prices from /api/get-prices, then initiates Stripe Checkout
// via /api/create-checkout-session on Pro upgrade. Standard confirmation
// calls the confirm_standard_tier() RPC (SECURITY DEFINER -- tier is a
// protected column, see protect_sensitive_profile_cols), which flips
// tier: 'trial' -> 'standard' permanently, then reloads so the rest of
// the app picks up the new tier and this modal never shows again.

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import riplocLogo from "@/public/Branding/Riploc OFI w Icon.png";

export default function TrialExpiredWall() {
  const [prices, setPrices]         = useState(null);
  const [plan, setPlan]             = useState("annual");
  const [loading, setLoading]       = useState(false);   // Pro checkout in flight
  const [confirming, setConfirming] = useState(false);   // Standard confirm in flight
  const [error, setError]           = useState(null);

  useEffect(() => {
    fetch("/api/get-prices")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPrices(d); })
      .catch(() => {});
  }, []);

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired — please sign in again.");

      const priceId = plan === "annual" ? prices?.annual?.id : prices?.monthly?.id;
      if (!priceId) throw new Error("Price unavailable, please try again.");

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Checkout failed.");
      window.location.href = body.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleConfirmStandard() {
    setConfirming(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("confirm_standard_tier");
      if (rpcError) throw new Error(rpcError.message || "Could not confirm Standard access.");
      // Full reload so useRegionAccess/AppContext re-fetch the profile and
      // pick up tier='standard' everywhere -- same pattern UserSettingsModal
      // uses after a region change.
      window.location.reload();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const fmt = cents => `$${(cents / 100).toFixed(0)}`;
  const annualLabel  = prices?.annual?.amount  ? `${fmt(prices.annual.amount)}/yr`  : "$69/yr";
  const monthlyLabel = prices?.monthly?.amount ? `${fmt(prices.monthly.amount)}/mo` : "$8/mo";

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(15,23,42,0.75)", padding: "1.5rem", overflowY: "auto",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
        padding: "2rem 1.75rem", maxWidth: 580, width: "100%", textAlign: "center",
        margin: "auto",
      }}>
        <img src={riplocLogo} alt="RipLoc: Offshore Fishing Intelligence"
          style={{ height: 40, width: "auto", margin: "0 auto 1.5rem", display: "block" }} />

        <h1 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 0.75rem", lineHeight: 1.3 }}>
          Your free trial has ended
        </h1>

        <p style={{ color: "#94a3b8", fontSize: 13.5, lineHeight: 1.7, margin: "0 0 1.75rem", textAlign: "left" }}>
          We hope you enjoyed exploring the app during your trial. You can continue to use the app
          and the core oceanographic features by confirming your Standard subscription below.
          Or you can complete a Pro subscription and continue using all of the Pro features
          included in RipLoc.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", textAlign: "left" }}>
          {/* Standard column */}
          <div style={{
            flex: "1 1 220px", background: "#0f172a", border: "1px solid #334155",
            borderRadius: 12, padding: "1.25rem 1.1rem", display: "flex", flexDirection: "column",
          }}>
            <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Standard</div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 14 }}>Free, no time limit</div>
            <div style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.6, marginBottom: 18, flex: 1 }}>
              Keep using the app's core oceanographic features — no card required, no expiration.
            </div>
            <button onClick={handleConfirmStandard} disabled={confirming} style={{
              width: "100%", padding: "0.8rem", borderRadius: 10,
              background: "transparent", color: "#cbd5e1", border: "2px solid #475569",
              fontSize: 14, fontWeight: 700, cursor: confirming ? "not-allowed" : "pointer",
              opacity: confirming ? 0.6 : 1, transition: "border-color 0.15s",
            }}>
              {confirming ? "Confirming…" : "Confirm Standard"}
            </button>
          </div>

          {/* Pro column */}
          <div style={{
            flex: "1 1 280px", background: "#0f172a", border: "1px solid #0e7490",
            borderRadius: 12, padding: "1.25rem 1.1rem", display: "flex", flexDirection: "column",
          }}>
            <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Pro</div>
            <div style={{ color: "#64748b", fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
              Real-time SST, VIIRS composites, current &amp; altimetry overlays, and community reports.
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[
                { key: "annual",  label: "Annual",  amount: annualLabel,  note: "Best value" },
                { key: "monthly", label: "Monthly", amount: monthlyLabel, note: null },
              ].map(p => {
                const active = plan === p.key;
                return (
                  <button key={p.key} onClick={() => setPlan(p.key)} style={{
                    flex: 1, padding: "0.65rem 0.4rem", borderRadius: 10,
                    border: active ? "2px solid #0e7490" : "2px solid #334155",
                    background: active ? "rgba(14,116,144,0.12)" : "transparent",
                    cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
                  }}>
                    <div style={{ color: "#cbd5e1", fontSize: 11, fontWeight: 600, marginBottom: 1 }}>{p.label}</div>
                    <div style={{ color: "#38bdf8", fontSize: 17, fontWeight: 800 }}>{p.amount}</div>
                    {p.note && <div style={{ color: "#475569", fontSize: 10, marginTop: 1 }}>{p.note}</div>}
                  </button>
                );
              })}
            </div>

            <button onClick={handleUpgrade} disabled={loading || !prices} style={{
              width: "100%", padding: "0.8rem", borderRadius: 10, marginTop: "auto",
              background: loading || !prices ? "#164e63" : "#0e7490",
              color: "#fff", border: "none", fontSize: 14, fontWeight: 700,
              cursor: loading || !prices ? "not-allowed" : "pointer", transition: "background 0.15s",
            }}>
              {loading ? "Redirecting to checkout…" : "Upgrade to Pro"}
            </button>
          </div>
        </div>

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, margin: "1.1rem 0 0", lineHeight: 1.5 }}>{error}</p>
        )}

        <button onClick={handleSignOut} style={{
          background: "none", border: "none", color: "#475569",
          fontSize: 12.5, cursor: "pointer", textDecoration: "underline", marginTop: 18,
        }}>
          Sign out
        </button>
      </div>
    </div>,
    document.body
  );
}
