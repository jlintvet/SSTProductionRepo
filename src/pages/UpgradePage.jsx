// src/pages/UpgradePage.jsx
// Public upgrade page — prices loaded from Stripe on mount.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const PRICE_MONTHLY_ID = "price_1TikyxDWsT9O1EjovwRTZL7S";
const PRICE_ANNUAL_ID  = "price_1Til1NDWsT9O1Ejonzrd7hIJ";

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

function fmt(cents, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency?.toUpperCase() || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function UpgradePage() {
  const [annual, setAnnual]     = useState(true);
  const [prices, setPrices]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/get-prices")
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setPrices(data);
      })
      .catch(err => {
        console.error("Failed to load prices:", err);
        // Fallback to defaults so page still renders
        setPrices({
          monthly: { id: PRICE_MONTHLY_ID, amount: 1500, currency: "usd" },
          annual:  { id: PRICE_ANNUAL_ID,  amount: 12000, currency: "usd" },
        });
      });
  }, []);

  async function handleGetPro() {
    setError(null);
    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        navigate("/?redirect=upgrade");
        return;
      }

      const priceId = annual ? prices.annual.id : prices.monthly.id;

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

  const monthlyAmt  = prices ? fmt(prices.monthly.amount, prices.monthly.currency) : "—";
  const annualAmt   = prices ? fmt(prices.annual.amount,  prices.annual.currency)  : "—";
  const annualPerMo = prices ? fmt(Math.round(prices.annual.amount / 12), prices.annual.currency) : "—";
  const savings     = prices
    ? Math.round((1 - (prices.annual.amount / 12) / prices.monthly.amount) * 100)
    : 0;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0c1a2e 0%, #0e3a5c 50%, #0c2a40 100%)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "48px 16px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#e2f0ff",
    }}>

      {/* Back link */}
      <div style={{ width: "100%", maxWidth: 900, marginBottom: 24 }}>
        <button onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", fontSize: 14, padding: 0 }}>
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
        <button onClick={() => setAnnual(false)} style={{
          padding: "8px 20px", borderRadius: 32, border: "none", cursor: "pointer",
          fontWeight: 600, fontSize: 14, transition: "all 0.15s",
          background: !annual ? "#0ea5e9" : "transparent",
          color: !annual ? "#fff" : "#93c5fd",
        }}>Monthly</button>
        <button onClick={() => setAnnual(true)} style={{
          padding: "8px 20px", borderRadius: 32, border: "none", cursor: "pointer",
          fontWeight: 600, fontSize: 14, transition: "all 0.15s",
          display: "flex", alignItems: "center", gap: 8,
          background: annual ? "#0ea5e9" : "transparent",
          color: annual ? "#fff" : "#93c5fd",
        }}>
          Annual
          {prices && savings > 0 && (
            <span style={{
              background: "#059669", color: "#fff",
              fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 12,
            }}>Save {savings}%</span>
          )}
        </button>
      </div>

      {/* Plan cards */}
      <div style={{
        display: "flex", gap: 20, width: "100%", maxWidth: 820,
        flexWrap: "wrap", justifyContent: "center",
      }}>

        {/* Standard */}
        <div style={{
          flex: "1 1 320px", maxWidth: 380,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: "32px 28px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>Standard</div>
          <div style={{ fontSize: 42, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Free</div>
          <div style={{ fontSize: 14, color: "#64748b", marginBottom: 28 }}>No credit card required</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
            {FREE_FEATURES.map(f => (
              <div key={f} style={{ display: "flex", gap: 10, fontSize: 14, color: "#94a3b8" }}>
                <span style={{ color: "#475569" }}>–</span>{f}
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/")} style={{
            width: "100%", padding: "14px", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "transparent", color: "#94a3b8", fontWeight: 600, fontSize: 15, cursor: "pointer",
          }}>Continue with free</button>
        </div>

        {/* Pro */}
        <div style={{
          flex: "1 1 320px", maxWidth: 380,
          background: "linear-gradient(145deg, rgba(14,165,233,0.15), rgba(6,182,212,0.08))",
          border: "1.5px solid #0ea5e9",
          borderRadius: 20, padding: "32px 28px",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -60, right: -60, width: 160, height: 160,
            background: "rgba(14,165,233,0.15)", borderRadius: "50%",
            filter: "blur(40px)", pointerEvents: "none",
          }} />
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: "#38bdf8", textTransform: "uppercase", marginBottom: 8 }}>Pro</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 42, fontWeight: 800, color: "#fff" }}>
              {prices ? (annual ? annualPerMo : monthlyAmt) : "—"}
            </span>
            <span style={{ fontSize: 16, color: "#7dd3fc" }}>/mo</span>
          </div>
          <div style={{ fontSize: 14, color: "#7dd3fc", marginBottom: 28, minHeight: 20 }}>
            {prices
              ? annual
                ? `Billed ${annualAmt}/year — save ${savings}%`
                : "Billed monthly"
              : "Loading prices..."}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 32 }}>
            {PRO_FEATURES.map(f => (
              <div key={f} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "#bae6fd" }}>
                <span style={{ color: "#34d399", flexShrink: 0 }}>✓</span>{f}
              </div>
            ))}
          </div>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#fca5a5", marginBottom: 16,
            }}>{error}</div>
          )}

          <button onClick={handleGetPro} disabled={loading || !prices} style={{
            width: "100%", padding: "15px", borderRadius: 12, border: "none",
            background: (loading || !prices) ? "rgba(14,165,233,0.5)" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
            color: "#fff", fontWeight: 700, fontSize: 16,
            cursor: (loading || !prices) ? "not-allowed" : "pointer",
            boxShadow: (loading || !prices) ? "none" : "0 4px 20px rgba(14,165,233,0.4)",
            transition: "all 0.2s",
          }}>
            {loading ? "Loading..." : prices ? `Get Pro — ${annual ? annualAmt + "/yr" : monthlyAmt + "/mo"}` : "Loading..."}
          </button>

          <div style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 12 }}>
            Cancel anytime · Secure checkout via Stripe
          </div>
        </div>
      </div>

      <div style={{ marginTop: 48, fontSize: 13, color: "#475569" }}>
        Questions? <a href="mailto:support@riploc.com" style={{ color: "#38bdf8" }}>support@riploc.com</a>
      </div>
    </div>
  );
}
