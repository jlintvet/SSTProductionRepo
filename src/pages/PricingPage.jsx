// src/pages/PricingPage.jsx
// Public pricing page — no auth required to view.
// "Get Pro" button requires auth and redirects to Stripe Checkout.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

// ── Update these to match your Stripe price IDs ──────────────────────────────
const PRICE_MONTHLY = "price_1TikyxDWsT9O1EjovwRTZL7S";
const PRICE_ANNUAL  = "price_1Til1NDWsT9O1Ejonzrd7hIJ";

// ── Update these to match your Stripe pricing ─────────────────────────────────
const MONTHLY_DISPLAY = "$15";
const ANNUAL_DISPLAY  = "$120";
const ANNUAL_PER_MONTH = "$10";

const PRO_FEATURES = [
  "Sea surface temperature — daily, hourly & 36h composite",
  "Chlorophyll concentration",
  "Sea-level anomaly (altimetry) + contours",
  "Ocean current particle overlay",
  "Wind speed/direction overlay",
  "Fishing hotspot scoring",
  "Bathymetry & bottom features",
  "Isotherm (temp break) overlay",
  "Color gain & rendering controls",
  "Weather buoys — live observations",
  "Trip planning & GPS tracking",
  "Community fishing reports",
];

const FREE_FEATURES = [
  "Sea surface temperature — daily",
  "Departure location & marine forecast",
  "Basic map navigation",
];

export default function PricingPage() {
  const [annual, setAnnual]     = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const navigate = useNavigate();

  async function handleGetPro() {
    setError(null);
    setLoading(true);

    try {
      // Check auth
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        // Not logged in — send to app which will show the login gate, with a
        // flag so SSTLive can redirect back here after login.
        navigate("/?redirect=pricing");
        return;
      }

      const priceId = annual ? PRICE_ANNUAL : PRICE_MONTHLY;

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const savings = Math.round((1 - (parseInt(ANNUAL_DISPLAY.replace("$", "")) / 12) / parseInt(MONTHLY_DISPLAY.replace("$", ""))) * 100);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0c1a2e 0%, #0e3a5c 50%, #0c2a40 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "48px 16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#e2f0ff",
    }}>

      {/* Back link */}
      <div style={{ width: "100%", maxWidth: 900, marginBottom: 24 }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: 14, padding: 0 }}
        >
          ← Back to map
        </button>
      </div>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: "#38bdf8", textTransform: "uppercase", marginBottom: 12 }}>
          RipLoc Pro
        </div>
        <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, margin: "0 0 16px", lineHeight: 1.1, color: "#fff" }}>
          Professional ocean data<br />for serious offshore anglers
        </h1>
        <p style={{ fontSize: 17, color: "#93c5fd", maxWidth: 520, margin: "0 auto" }}>
          Every layer. No limits. One subscription.
        </p>
      </div>

      {/* Billing toggle */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "rgba(255,255,255,0.07)", borderRadius: 40,
        padding: "6px 8px", marginBottom: 36,
      }}>
        <button
          onClick={() => setAnnual(false)}
          style={{
            padding: "8px 20px", borderRadius: 32, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 14, transition: "all 0.15s",
            background: !annual ? "#0ea5e9" : "transparent",
            color: !annual ? "#fff" : "#93c5fd",
          }}
        >
          Monthly
        </button>
        <button
          onClick={() => setAnnual(true)}
          style={{
            padding: "8px 20px", borderRadius: 32, border: "none", cursor: "pointer",
            fontWeight: 600, fontSize: 14, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 8,
            background: annual ? "#0ea5e9" : "transparent",
            color: annual ? "#fff" : "#93c5fd",
          }}
        >
          Annual
          <span style={{
            background: "#059669", color: "#fff",
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 12,
          }}>
            Save {savings}%
          </span>
        </button>
      </div>

      {/* Plan cards */}
      <div style={{
        display: "flex", gap: 20, width: "100%", maxWidth: 820,
        flexWrap: "wrap", justifyContent: "center",
      }}>

        {/* Free / Standard card */}
        <div style={{
          flex: "1 1 320px", maxWidth: 380,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "32px 28px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
            Standard
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 42, fontWeight: 800, color: "#fff" }}>Free</span>
          </div>
          <div style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>No credit card required</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
            {FREE_FEATURES.map(f => (
              <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#94a3b8" }}>
                <span style={{ color: "#475569", fontSize: 16, lineHeight: "1.4" }}>–</span>
                {f}
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate("/")}
            style={{
              width: "100%", padding: "14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent", color: "#94a3b8", fontWeight: 600, fontSize: 15, cursor: "pointer",
            }}
          >
            Continue with free
          </button>
        </div>

        {/* Pro card */}
        <div style={{
          flex: "1 1 320px", maxWidth: 380,
          background: "linear-gradient(145deg, rgba(14,165,233,0.15), rgba(6,182,212,0.08))",
          border: "1.5px solid #0ea5e9",
          borderRadius: 20, padding: "32px 28px",
          position: "relative", overflow: "hidden",
        }}>
          {/* Glow */}
          <div style={{
            position: "absolute", top: -60, right: -60,
            width: 160, height: 160,
            background: "rgba(14,165,233,0.15)", borderRadius: "50%",
            filter: "blur(40px)", pointerEvents: "none",
          }} />

          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#38bdf8", textTransform: "uppercase", marginBottom: 8 }}>
            Pro
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 42, fontWeight: 800, color: "#fff" }}>
              {annual ? ANNUAL_PER_MONTH : MONTHLY_DISPLAY}
            </span>
            <span style={{ fontSize: 16, color: "#7dd3fc" }}>/mo</span>
          </div>
          <div style={{ fontSize: 14, color: "#7dd3fc", marginBottom: 28, minHeight: 20 }}>
            {annual
              ? `Billed ${ANNUAL_DISPLAY}/year — save ${savings}%`
              : "Billed monthly"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 32 }}>
            {PRO_FEATURES.map(f => (
              <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#bae6fd" }}>
                <span style={{ color: "#34d399", fontSize: 14, lineHeight: "1.5", flexShrink: 0 }}>✓</span>
                {f}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5", marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleGetPro}
            disabled={loading}
            style={{
              width: "100%", padding: "15px", borderRadius: 12, border: "none",
              background: loading ? "rgba(14,165,233,0.5)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
              color: "#fff", fontWeight: 700, fontSize: 16, cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 20px rgba(14,165,233,0.4)",
              transition: "all 0.2s",
            }}
          >
            {loading ? "Loading..." : `Get Pro — ${annual ? ANNUAL_DISPLAY + "/yr" : MONTHLY_DISPLAY + "/mo"}`}
          </button>

          <div style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 12 }}>
            Cancel anytime · Secure checkout via Stripe
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 48, textAlign: "center", fontSize: 13, color: "#475569", maxWidth: 500 }}>
        Questions? Email <a href="mailto:support@riploc.com" style={{ color: "#38bdf8" }}>support@riploc.com</a>
      </div>
    </div>
  );
}
