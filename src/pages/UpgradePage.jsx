// src/pages/UpgradePage.jsx
// Public upgrade page — prices loaded from Stripe on mount.
//
// Auth is handled inline on this page (login/register tabs) so an anonymous
// visitor never has to leave /upgrade before reaching Stripe checkout. New
// signups need to confirm their email before Supabase issues a session, so
// for that path we stash the chosen price in sessionStorage as
// "pendingUpgradePriceId" — App.jsx's SIGNED_IN handler picks it up once the
// user confirms and completes checkout automatically at that point.
//
// Styling: this page renders with the same "rl-" design system as
// LandingPage.jsx (src/styles/riplocBrandCss.js) and the same
// StandardPricingCard/ProPricingCard components (src/components/
// PricingCards.jsx) as the landing page's pricing section, so a visitor
// landing here from an in-app "Upgrade to Pro" prompt sees the identical
// brand look and feel, not a differently-styled page. The billing-cycle
// toggle and inline auth panel are specific to this page (the landing
// page's Pro card skips straight to checkout with a fixed annual price),
// so they use dark-mode variants of the shared auth-field classes
// (.rl-inp.dk etc.) rather than inventing a separate visual language.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { injectRlGlobalCss } from "@/styles/riplocBrandCss";
import { StandardPricingCard, ProPricingCard } from "@/components/PricingCards";
import riplocOfiImg from "../public/brand/riploc-ofi-icon.png";

injectRlGlobalCss();

const PRICE_MONTHLY_ID = "price_1TikyxDWsT9O1EjovwRTZL7S";
const PRICE_ANNUAL_ID  = "price_1Til1NDWsT9O1Ejonzrd7hIJ";

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

  // undefined = still checking, null = logged out, object = logged in
  const [session, setSession] = useState(undefined);

  // Inline auth panel state
  const [showAuth, setShowAuth]     = useState(false);
  const [authMode, setAuthMode]     = useState("register");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [confirm, setConfirm]       = useState("");
  const [authError, setAuthError]   = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [signupSent, setSignupSent] = useState(false);

  useEffect(() => {
    injectRlGlobalCss();
  }, []);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function startCheckout(sess) {
    setError(null);
    setLoading(true);
    try {
      const priceId = annual ? prices.annual.id : prices.monthly.id;

      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sess.access_token}`,
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

  function handleProClick() {
    if (session) {
      startCheckout(session);
    } else {
      setShowAuth(true);
    }
  }

  async function handleInlineLogin(e) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (err) { setAuthError(err.message); return; }
    setSession(data.session);
    startCheckout(data.session);
  }

  async function handleInlineRegister(e) {
    e.preventDefault();
    setAuthError(null);
    if (password !== confirm) { setAuthError("Passwords do not match."); return; }
    if (password.length < 8)  { setAuthError("Password must be at least 8 characters."); return; }
    setAuthLoading(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    if (err) { setAuthLoading(false); setAuthError(err.message); return; }

    const priceId = annual ? prices.annual.id : prices.monthly.id;

    if (data?.user?.id) {
      // Email confirmation is still required to log in later (Supabase just
      // sent it via signUp above) -- but it doesn't need to block payment.
      // The just-created user's id/email is enough to open Stripe checkout
      // right now; see create-checkout-session.js's pendingUserId path.
      try {
        const res = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId,
            pendingUserId: data.user.id,
            pendingEmail: email,
          }),
        });
        const checkoutData = await res.json();
        if (!res.ok) throw new Error(checkoutData.error || "Checkout failed");
        window.location.href = checkoutData.url;
        return; // leaving the page
      } catch (checkoutErr) {
        console.error("Immediate checkout failed, falling back:", checkoutErr);
      }
    }

    setAuthLoading(false);
    // Fallback: no session yet, and immediate checkout above either wasn't
    // possible or failed. Stash the chosen price so App.jsx's SIGNED_IN
    // handler can resume checkout automatically once the user confirms and
    // actually gets a session.
    localStorage.setItem("pendingUpgradePriceId", priceId);
    setSignupSent(true);
  }

  const monthlyAmt  = prices ? fmt(prices.monthly.amount, prices.monthly.currency) : "-";
  const annualAmt   = prices ? fmt(prices.annual.amount,  prices.annual.currency)  : "-";
  const annualPerMo = prices ? fmt(Math.round(prices.annual.amount / 12), prices.annual.currency) : "-";
  const savings     = prices
    ? Math.round((1 - (prices.annual.amount / 12) / prices.monthly.amount) * 100)
    : 0;

  return (
    <div className="rl">

      {/* NAV */}
      <nav className="rl-nav">
        <img src={riplocOfiImg} alt="Riploc" style={{ height: 34, width: Math.round(34 * 5.295), objectFit: "contain", display: "block" }} />
        <div className="rl-nav-right">
          <button className="rl-btn-ghost" onClick={() => navigate("/")}>← Back to map</button>
        </div>
      </nav>

      {/* HEADER */}
      <div className="rl-upg-hero">
        <div className="rl-upg-hero-inner">
          <div className="rl-eyebrow" style={{ justifyContent: "center", display: "flex" }}>RipLoc Pro</div>
          <h1 className="rl-price-h2" style={{ color: "#fff" }}>
            Professional ocean data<br />for serious offshore anglers
          </h1>
          <p className="rl-upg-sub">Every layer. No limits. One subscription.</p>

          {/* Billing toggle */}
          <div className="rl-toggle-wrap">
            <button className={`rl-toggle-btn ${!annual ? "on" : ""}`} onClick={() => setAnnual(false)}>
              Monthly
            </button>
            <button className={`rl-toggle-btn ${annual ? "on" : ""}`} onClick={() => setAnnual(true)}>
              Annual
              {prices && savings > 0 && <span className="rl-toggle-save">Save {savings}%</span>}
            </button>
          </div>
        </div>
      </div>

      {/* PRICING CARDS */}
      <section className="rl-price-sec" style={{ paddingTop: "3rem" }}>
        <div className="rl-price-inner">
          <div className="rl-cards">
            <StandardPricingCard
              price="Free" priceUnit="" note="No credit card required"
              ctaLabel="Continue with free" onCta={() => navigate("/")}
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
              {error && <div className="rl-err dk">{error}</div>}

              {!showAuth ? (
                <>
                  <button className="rl-pcta dk" onClick={handleProClick} disabled={loading || !prices || session === undefined}>
                    {loading ? "Loading..." : prices ? `Get Pro - ${annual ? annualAmt + "/yr" : monthlyAmt + "/mo"}` : "Loading..."}
                  </button>
                  <div className="rl-upg-footer">Cancel anytime · Secure checkout via Stripe</div>
                </>
              ) : signupSent ? (
                <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Check your email</div>
                  <p style={{ fontSize: 13, color: "#93c5fd", lineHeight: 1.6, margin: 0 }}>
                    Confirmation link sent to <strong>{email}</strong>. Click it to activate your
                    account - we'll take you straight to checkout.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="rl-tabs dk">
                    <button type="button" onClick={() => { setAuthMode("register"); setAuthError(null); }}
                      className={`rl-tab dk ${authMode === "register" ? "on" : "off"}`}>Create Account</button>
                    <button type="button" onClick={() => { setAuthMode("login"); setAuthError(null); }}
                      className={`rl-tab dk ${authMode === "login" ? "on" : "off"}`}>Sign In</button>
                  </div>
                  <form onSubmit={authMode === "login" ? handleInlineLogin : handleInlineRegister}>
                    <input className="rl-inp dk" type="email" placeholder="Email address" value={email}
                      onChange={e => setEmail(e.target.value)} required autoFocus />
                    <input className="rl-inp dk" type="password" placeholder="Password" value={password}
                      onChange={e => setPassword(e.target.value)} required />
                    {authMode === "register" && (
                      <input className="rl-inp dk" type="password" placeholder="Confirm password" value={confirm}
                        onChange={e => setConfirm(e.target.value)} required />
                    )}
                    {authError && <div className="rl-err dk">{authError}</div>}
                    <button className="rl-fmbtn" type="submit" disabled={authLoading}>
                      {authLoading
                        ? "…"
                        : authMode === "login"
                          ? "Sign In & Continue to Checkout"
                          : "Create Account & Continue"}
                    </button>
                  </form>
                  <button type="button" className="rl-lnk dk" style={{ marginTop: 12 }}
                    onClick={() => { setShowAuth(false); setAuthError(null); }}>
                    ← Back
                  </button>
                </div>
              )}
            </ProPricingCard>
          </div>

          <div className="rl-price-footer">
            Questions? <a href="mailto:support@riploc.com" style={{ color: "#00c8e8" }}>support@riploc.com</a>
          </div>
        </div>
      </section>
    </div>
  );
}
