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
// Styling: this is the third place in the app that shows the Standard-vs-Pro
// choice (alongside LandingPage.jsx's pricing section and UpgradePage.jsx),
// and previously had its own bespoke slate/cyan color scheme and a short,
// inaccurate one-line Pro summary ("...and community reports", which isn't
// actually Pro-gated). Now uses the same "rl-" brand design system
// (src/styles/riplocBrandCss.js) and the same StandardPricingCard/
// ProPricingCard components (src/components/PricingCards.jsx) as the other
// two surfaces, so the feature lists are the real, accurate, unified copy
// (src/data/pricingFeatures.js) and the visual brand matches everywhere the
// user is asked to upgrade.
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
import { injectRlGlobalCss } from "@/styles/riplocBrandCss";
import { StandardPricingCard, ProPricingCard } from "@/components/PricingCards";

injectRlGlobalCss();

function fmt(cents, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency?.toUpperCase() || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function TrialExpiredWall() {
  const [prices, setPrices]         = useState(null);
  const [annual, setAnnual]         = useState(true);
  const [loading, setLoading]       = useState(false);   // Pro checkout in flight
  const [confirming, setConfirming] = useState(false);   // Standard confirm in flight
  const [error, setError]           = useState(null);

  useEffect(() => {
    injectRlGlobalCss();
  }, []);

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
      if (!session?.access_token) throw new Error("Session expired - please sign in again.");

      const priceId = annual ? prices?.annual?.id : prices?.monthly?.id;
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

  const monthlyAmt  = prices ? fmt(prices.monthly.amount, prices.monthly.currency) : "-";
  const annualAmt   = prices ? fmt(prices.annual.amount,  prices.annual.currency)  : "-";
  const annualPerMo = prices ? fmt(Math.round(prices.annual.amount / 12), prices.annual.currency) : "-";
  const savings     = prices
    ? Math.round((1 - (prices.annual.amount / 12) / prices.monthly.amount) * 100)
    : 0;

  return createPortal(
    <div className="rl" style={{
      position: "fixed", inset: 0, zIndex: 99999, display: "flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(4,9,16,0.85)", padding: "1.5rem", overflowY: "auto",
    }}>
      <div style={{
        background: "#08101e", border: "1.5px solid rgba(0,200,232,.2)",
        boxShadow: "0 0 0 1px rgba(12,196,160,.12), 0 24px 80px rgba(0,0,0,.5)",
        borderRadius: 20, padding: "2.5rem 2rem", maxWidth: 880, width: "100%",
        textAlign: "center", margin: "auto",
      }}>
        <img src={riplocLogo} alt="RipLoc: Offshore Fishing Intelligence"
          style={{ height: 40, width: "auto", margin: "0 auto 1.5rem", display: "block" }} />

        <h1 className="rl-price-h2" style={{ color: "#fff", fontSize: "clamp(1.6rem,4vw,2.25rem)" }}>
          Your free trial has ended
        </h1>

        <p style={{ color: "#7a9ab5", fontSize: 14, lineHeight: 1.7, margin: "0 auto 1.75rem", maxWidth: 560, textAlign: "left" }}>
          We hope you enjoyed exploring the app during your trial. You can continue to use the app
          and the core oceanographic features by confirming your Standard subscription below.
          Or you can complete a Pro subscription and continue using all of the Pro features
          included in RipLoc.
        </p>

        {/* Billing toggle for the Pro option */}
        <div className="rl-toggle-wrap" style={{ marginBottom: "1.5rem" }}>
          <button className={`rl-toggle-btn ${!annual ? "on" : ""}`} onClick={() => setAnnual(false)}>
            Monthly
          </button>
          <button className={`rl-toggle-btn ${annual ? "on" : ""}`} onClick={() => setAnnual(true)}>
            Annual
            {prices && savings > 0 && <span className="rl-toggle-save">Save {savings}%</span>}
          </button>
        </div>

        <div className="rl-cards" style={{ textAlign: "left" }}>
          <StandardPricingCard
            price="Free" priceUnit="" note="No card required, no expiration."
            ctaLabel={confirming ? "Confirming…" : "Confirm Standard"}
            onCta={handleConfirmStandard} ctaDisabled={confirming}
          />

          <ProPricingCard
            price={prices ? (annual ? annualPerMo : monthlyAmt) : "-"}
            priceUnit="/mo"
            note={prices
              ? annual
                ? `Billed ${annualAmt}/year - save ${savings}%`
                : "Billed monthly"
              : "Loading prices..."}
          >
            <button className="rl-pcta dk" onClick={handleUpgrade} disabled={loading || !prices}>
              {loading ? "Redirecting to checkout…" : `Upgrade to Pro - ${annual ? annualAmt + "/yr" : monthlyAmt + "/mo"}`}
            </button>
          </ProPricingCard>
        </div>

        {/* Shared error line -- covers both the Standard-confirm RPC and the
            Pro-checkout request, since either can set `error`. */}
        {error && (
          <p style={{ color: "#f87171", fontSize: 13, margin: "1.1rem 0 0", lineHeight: 1.5, textAlign: "left" }}>{error}</p>
        )}

        <button onClick={handleSignOut} className="rl-lnk dk" style={{ marginTop: 18, background: "none", border: "none", cursor: "pointer", fontSize: 12.5 }}>
          Sign out
        </button>
      </div>
    </div>,
    document.body
  );
}
