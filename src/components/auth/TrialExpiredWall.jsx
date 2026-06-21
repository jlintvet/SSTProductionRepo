// src/components/auth/TrialExpiredWall.jsx
// Full-screen paywall shown when a user's free trial has expired.
// Fetches real prices from /api/get-prices, then initiates Stripe Checkout
// via /api/create-checkout-session on upgrade.

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function TrialExpiredWall() {
  const [prices, setPrices]   = useState(null);
  const [plan, setPlan]       = useState("annual");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const fmt = cents => `$${(cents / 100).toFixed(0)}`;
  const annualLabel  = prices?.annual?.amount  ? `${fmt(prices.annual.amount)}/yr`  : "$69/yr";
  const monthlyLabel = prices?.monthly?.amount ? `${fmt(prices.monthly.amount)}/mo` : "$8/mo";

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#0f172a", padding: "1.5rem",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "#1e293b", border: "1px solid #334155", borderRadius: 16,
        padding: "2.5rem 2rem", maxWidth: 440, width: "100%", textAlign: "center",
      }}>
        <div style={{ color: "#0e7490", fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: "1.75rem" }}>
          RipLoc
        </div>

        <h1 style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, margin: "0 0 0.75rem", lineHeight: 1.3 }}>
          Your free trial has ended
        </h1>

        <p style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.7, margin: "0 0 2rem" }}>
          We hope you got a lot of value out of exploring the app during your
          trial. Upgrade to Pro to keep access to real-time SST data, VIIRS
          composites, current and altimetry overlays, and community reports.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem" }}>
          {[
            { key: "annual",  label: "Annual",  amount: annualLabel,  note: "Best value" },
            { key: "monthly", label: "Monthly", amount: monthlyLabel, note: null },
          ].map(p => {
            const active = plan === p.key;
            return (
              <button key={p.key} onClick={() => setPlan(p.key)} style={{
                flex: 1, padding: "0.85rem 0.5rem", borderRadius: 10,
                border: active ? "2px solid #0e7490" : "2px solid #334155",
                background: active ? "rgba(14,116,144,0.12)" : "transparent",
                cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
              }}>
                <div style={{ color: "#cbd5e1", fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{p.label}</div>
                <div style={{ color: "#38bdf8", fontSize: 20, fontWeight: 800 }}>{p.amount}</div>
                {p.note && <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{p.note}</div>}
              </button>
            );
          })}
        </div>

        <button onClick={handleUpgrade} disabled={loading || !prices} style={{
          width: "100%", padding: "0.875rem", borderRadius: 10,
          background: loading || !prices ? "#164e63" : "#0e7490",
          color: "#fff", border: "none", fontSize: 15, fontWeight: 700,
          cursor: loading || !prices ? "not-allowed" : "pointer",
          marginBottom: "0.875rem", transition: "background 0.15s",
        }}>
          {loading ? "Redirecting to checkout..." : "Upgrade Now"}
        </button>

        {error && (
          <p style={{ color: "#f87171", fontSize: 13, margin: "0 0 0.75rem", lineHeight: 1.5 }}>{error}</p>
        )}

        <button onClick={handleSignOut} style={{
          background: "none", border: "none", color: "#475569",
          fontSize: 13, cursor: "pointer", textDecoration: "underline",
        }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
